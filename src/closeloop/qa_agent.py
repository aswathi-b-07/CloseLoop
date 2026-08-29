"""Settlement Q&A agent — answer finance questions over the reconciled data.

This is the second, deliberately-scoped LLM surface (the first is Tier-3
adjudication). A merchant can ask, in plain English, "Why is settlement X short?"
or "How much is at risk from chargebacks?" and get an answer grounded in the
actual records — with **citations** to the underlying entities so nothing is a
black box.

Backed by Google Gemini via its OpenAI-compatible endpoint (see llm.py); the
free tier runs it at zero cost.

Appropriate + bounded AI use, again:
  - The model does not see the raw dataset dumped into the prompt. It is given a
    set of read-only *tools* and must query for exactly the records it needs;
    every record it touches is captured as a citation.
  - The agent is read-only: it can look things up, it cannot change anything.
  - No API key / SDK -> a graceful, honest degraded response (it still returns
    the raw exception list so the endpoint is never useless).
"""
from __future__ import annotations

import json
from typing import Optional

import pandas as pd

from . import llm, schema


def _records(df: pd.DataFrame) -> list[dict]:
    """JSON-safe records (NaN/NaT -> None) so tool results and fallback
    responses are valid JSON everywhere they are consumed."""
    if df is None or len(df) == 0:
        return []
    return df.astype(object).where(pd.notna(df), None).to_dict(orient="records")

_SYSTEM_PROMPT = """You are the Settlement Q&A agent for CloseLoop, an AI finance \
controller. You answer a merchant's questions about their reconciliation between \
their internal order ledger, Razorpay settlement reports, and their bank statement.

You have read-only tools to query the reconciled data. Use them to gather the \
exact records you need before answering — do NOT guess numbers. Always ground \
your answer in what the tools return, and refer to specific entity ids \
(orders, payments, settlements, bank txns) so the user can verify.

Be concise and concrete. Amounts are in INR (₹). If the data does not contain \
the answer, say so plainly rather than inventing it. You cannot change any \
record; you only explain and report."""


class QAAgent:
    """Grounded Q&A over one reconciliation result."""

    def __init__(self, orders: pd.DataFrame, payments: pd.DataFrame,
                 bank: pd.DataFrame, findings: pd.DataFrame,
                 model: Optional[str] = None, max_iterations: int = 6):
        self.orders = orders
        self.payments = payments
        self.bank = bank
        self.findings = findings
        self.model = model or llm.model_name()
        self.max_iterations = max_iterations
        self._client = llm.make_client()

    @property
    def available(self) -> bool:
        return self._client is not None

    # ------------------------------------------------------------------ #
    # Tool definitions handed to the model (OpenAI function-calling shape)
    # ------------------------------------------------------------------ #
    TOOLS = [
        {
            "type": "function",
            "function": {
                "name": "get_metrics_summary",
                "description": "Overall reconciliation KPIs: match rate, counts by "
                               "exception type, tier usage, and business impact in INR.",
                "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_exceptions",
                "description": "List flagged exceptions, optionally filtered to one "
                               "exception type. Returns entity id, type, tier, "
                               "confidence, and the reason.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "exception_type": {"type": "string", "enum": schema.ALL_EXCEPTIONS},
                        "limit": {"type": "integer"},
                    },
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_entity",
                "description": "Full detail for one entity id (order + its payment(s) + "
                               "matching bank rows + the engine's finding).",
                "parameters": {
                    "type": "object",
                    "properties": {"entity_id": {"type": "string"}},
                    "required": ["entity_id"],
                    "additionalProperties": False,
                },
            },
        },
    ]

    # ------------------------------------------------------------------ #
    # Tool implementations (pure, local, read-only)
    # ------------------------------------------------------------------ #
    def _tool_get_metrics_summary(self, _args: dict) -> dict:
        f = self.findings
        exc = f[f["predicted_status"] == schema.STATUS_EXCEPTION]
        of = f[f["entity_type"] == "ORDER"].merge(
            self.orders, left_on="entity_id", right_on="order_id", how="left")
        reconciled = float(of.loc[of["predicted_status"] == "MATCHED", "amount"].sum())
        at_risk = float(of.loc[of["predicted_status"] == "EXCEPTION", "amount"].sum())
        return {
            "n_entities": int(len(f)),
            "match_rate": round(float((f["predicted_status"] == "MATCHED").mean()), 4),
            "exceptions_by_type": exc["predicted_exception"].value_counts().to_dict(),
            "tier_usage": f["tier"].value_counts().to_dict(),
            "reconciled_value_inr": round(reconciled, 2),
            "at_risk_value_inr": round(at_risk, 2),
        }

    def _tool_list_exceptions(self, args: dict) -> dict:
        f = self.findings
        exc = f[f["predicted_status"] == schema.STATUS_EXCEPTION]
        etype = args.get("exception_type")
        if etype:
            exc = exc[exc["predicted_exception"] == etype]
        limit = int(args.get("limit", 50))
        cols = ["entity_id", "predicted_exception", "tier", "confidence", "reason"]
        rows = _records(exc[cols].head(limit))
        return {"count": int(len(exc)), "shown": len(rows), "exceptions": rows}

    def _tool_get_entity(self, args: dict) -> dict:
        eid = str(args.get("entity_id", ""))
        order = self.orders[self.orders["order_id"] == eid]
        pays = self.payments[self.payments["order_id"] == eid]
        finding = self.findings[self.findings["entity_id"] == eid]
        # Bank rows referenced by any of this order's settlements.
        sids = set(pays["settlement_id"].astype(str)) if len(pays) else set()
        bank = self.bank[self.bank["settlement_ref"].astype(str).isin(sids)] if sids else self.bank.iloc[0:0]
        # Also allow direct bank-txn lookups.
        if len(order) == 0 and len(finding) == 0:
            bank = self.bank[self.bank["bank_txn_id"] == eid]
        return {
            "order": _records(order),
            "payments": _records(pays),
            "bank_rows": _records(bank),
            "finding": _records(finding),
        }

    def _dispatch(self, name: str, args: dict) -> dict:
        impl = {
            "get_metrics_summary": self._tool_get_metrics_summary,
            "list_exceptions": self._tool_list_exceptions,
            "get_entity": self._tool_get_entity,
        }.get(name)
        if impl is None:
            return {"error": f"unknown tool {name}"}
        return impl(args)

    @staticmethod
    def _citations_from(name: str, args: dict, result: dict) -> list[str]:
        """Record which entities an answer is grounded in."""
        cites: list[str] = []
        if name == "get_entity" and args.get("entity_id"):
            cites.append(str(args["entity_id"]))
        if name == "list_exceptions":
            cites.extend(str(r["entity_id"]) for r in result.get("exceptions", []))
        return cites

    # ------------------------------------------------------------------ #
    # Public entry point
    # ------------------------------------------------------------------ #
    def answer(self, question: str) -> dict:
        if self._client is None:
            return self._degraded(question)

        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ]
        citations: list[str] = []
        tool_trace: list[dict] = []

        try:
            for _ in range(self.max_iterations):
                resp = self._client.chat.completions.create(
                    model=self.model,
                    max_tokens=1500,
                    temperature=0,
                    tools=self.TOOLS,
                    messages=messages,
                )
                msg = resp.choices[0].message
                if not getattr(msg, "tool_calls", None):
                    return {
                        "answer": (msg.content or "").strip(),
                        "citations": sorted(set(citations)),
                        "tool_calls": tool_trace,
                        "grounded": True,
                        "mode": "llm",
                    }

                # Echo the assistant's tool-call message back into the history.
                messages.append({
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {"id": tc.id, "type": "function",
                         "function": {"name": tc.function.name,
                                      "arguments": tc.function.arguments}}
                        for tc in msg.tool_calls
                    ],
                })
                for tc in msg.tool_calls:
                    args = json.loads(tc.function.arguments or "{}")
                    result = self._dispatch(tc.function.name, args)
                    citations.extend(self._citations_from(tc.function.name, args, result))
                    tool_trace.append({"tool": tc.function.name, "input": args})
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result, default=str),
                    })

            return {
                "answer": "I could not conclude within the tool-call budget. "
                          "See the flagged exceptions for the underlying records.",
                "citations": sorted(set(citations)),
                "tool_calls": tool_trace,
                "grounded": True,
                "mode": "llm_truncated",
            }
        except Exception as exc:
            return self._degraded(question, error=f"{type(exc).__name__}: {exc}")

    # -- graceful degradation -------------------------------------------- #
    def _degraded(self, question: str, error: Optional[str] = None) -> dict:
        """No live LLM — still return something honest and useful."""
        summary = self._tool_get_metrics_summary({})
        exc = self._tool_list_exceptions({"limit": 10})
        msg = ("The natural-language Q&A agent needs GEMINI_API_KEY to run. "
               "Here is the grounded exception summary instead.")
        if error:
            msg = f"Q&A agent unavailable ({error}). Returning the grounded summary instead."
        return {
            "answer": msg,
            "summary": summary,
            "top_exceptions": exc["exceptions"],
            "citations": [r["entity_id"] for r in exc["exceptions"]],
            "grounded": True,
            "mode": "fallback",
        }
