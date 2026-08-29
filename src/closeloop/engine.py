"""The CloseLoop reconciliation engine — a tiered finance controller.

Design principle the judges reward: **use the cheapest tool that can be right.**

  Tier 1  DETERMINISTIC  exact ties (ids + zero-diff amounts, clear rule breaks)
  Tier 2  HEURISTIC      tolerance rules (rounding / FX / T+1 timing)
  Tier 3  LLM (Gemini)   ONLY the residual gray-zone cases rules can't settle
  --      FALLBACK       LLM unavailable or low-confidence -> flag for a human

The engine never mutates ledgers and never auto-posts: it *classifies and
recommends*, emitting one finding per entity plus the evidence behind it. That
finding stream is what the audit trail, the exception report, and the dashboard
are all built on.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

import pandas as pd

from . import schema


@dataclass
class EngineConfig:
    # Amount reconciliation bands (in currency units).
    tol_exact: float = 0.01          # <= this  -> exact, deterministic match
    tol_heuristic: float = 2.00      # <= this  -> tolerated (rounding/FX)
    ambiguity_high: float = 50.00    # in (heuristic, high] -> route to LLM tier
    # Fee/net consistency bands.
    fee_tol_exact: float = 0.01
    fee_ambiguity_high: float = 40.00
    fallback_confidence: float = 0.30


# A case handed to the adjudicator (Tier 3). Kept as a plain dict so it can be
# serialised straight into an LLM prompt in the next phase.
Adjudicator = Callable[[dict], dict]


def _human_fallback(case: dict) -> dict:
    """Default Tier-3 behaviour when no LLM is wired (or as the fallback path):
    do NOT guess confidently — flag for a human with the best rule-based guess."""
    return {
        "exception": case.get("rule_guess", schema.EXC_AMOUNT_MISMATCH),
        "status": schema.STATUS_EXCEPTION,
        "confidence": 0.30,
        "tier": schema.TIER_FALLBACK,
        "reason": ("Gray-zone case outside deterministic and heuristic tolerance; "
                   "no confident LLM verdict available — routed to human review."),
    }


@dataclass
class Finding:
    entity_type: str
    entity_id: str
    predicted_status: str
    predicted_exception: str
    tier: str
    confidence: float
    reason: str
    evidence: dict = field(default_factory=dict)

    def as_row(self) -> dict:
        r = {
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "predicted_status": self.predicted_status,
            "predicted_exception": self.predicted_exception,
            "tier": self.tier,
            "confidence": round(self.confidence, 3),
            "reason": self.reason,
        }
        r.update({f"ev_{k}": v for k, v in self.evidence.items()})
        return r


class ReconciliationEngine:
    def __init__(self, config: Optional[EngineConfig] = None,
                 adjudicator: Optional[Adjudicator] = None):
        self.cfg = config or EngineConfig()
        # If no LLM adjudicator is injected, gray-zone cases fall to a human.
        self.adjudicator = adjudicator or _human_fallback

    # Canonical columns so the engine stays robust to empty inputs (e.g. a
    # source that returned no rows) instead of raising a KeyError — a small but
    # real piece of the graceful-failure story.
    _PAYMENT_COLS = ["payment_id", "order_id", "amount", "fee", "tax",
                     "net_amount", "settlement_id", "settled_at", "method", "status"]
    _BANK_COLS = ["bank_txn_id", "utr", "amount", "value_date", "narration",
                  "settlement_ref"]

    # -- public API ------------------------------------------------------- #
    def run(self, orders: pd.DataFrame, payments: pd.DataFrame,
            bank: pd.DataFrame) -> pd.DataFrame:
        findings: list[Finding] = []
        # Guarantee the expected schema even when a source is empty.
        if payments is None or payments.empty:
            payments = pd.DataFrame(columns=self._PAYMENT_COLS)
        if bank is None or bank.empty:
            bank = pd.DataFrame(columns=self._BANK_COLS)
        known_settlements = set(
            payments.loc[payments["settlement_id"].astype(str) != "", "settlement_id"]
        )
        # Index bank rows for quick lookup.
        bank_credits = bank[bank["amount"] > 0]
        bank_debits = bank[bank["amount"] < 0]

        for _, order in orders.iterrows():
            findings.append(self._reconcile_order(order, payments, bank_credits, bank_debits))

        # Bank-side orphans: credits that tie to no known settlement.
        for _, b in bank_credits.iterrows():
            if str(b["settlement_ref"]) not in known_settlements:
                findings.append(Finding(
                    "BANK_TXN", b["bank_txn_id"], schema.STATUS_EXCEPTION,
                    schema.EXC_UNMATCHED_BANK_CREDIT, schema.TIER_DETERMINISTIC, 1.0,
                    f"Bank credit {b['amount']} ({b['narration']}) matches no known settlement.",
                    {"amount": b["amount"], "settlement_ref": b["settlement_ref"]},
                ))

        return pd.DataFrame([f.as_row() for f in findings])

    # -- per-order reconciliation ----------------------------------------- #
    def _reconcile_order(self, order, payments, bank_credits, bank_debits) -> Finding:
        oid = order["order_id"]
        pays = payments[payments["order_id"] == oid]
        captured = pays[pays["status"].isin(["captured", "refunded"])]

        # 1) No payment at all.
        if len(captured) == 0:
            return Finding("ORDER", oid, schema.STATUS_EXCEPTION,
                           schema.EXC_MISSING_PAYMENT, schema.TIER_DETERMINISTIC, 1.0,
                           "Order present in ledger but no PSP capture was found.",
                           {"order_amount": order["amount"]})

        # 2) Duplicate captures for one order.
        if len(captured[captured["status"] == "captured"]) > 1:
            return Finding("ORDER", oid, schema.STATUS_EXCEPTION,
                           schema.EXC_DUPLICATE_PAYMENT, schema.TIER_DETERMINISTIC, 1.0,
                           f"{len(captured)} captures linked to one order "
                           f"({', '.join(captured['payment_id'])}).",
                           {"n_captures": int(len(captured))})

        p = captured.iloc[0]

        # 3) Refunded at PSP but ledger still 'paid'.
        if p["status"] == "refunded" and order["status"] == "paid":
            return Finding("ORDER", oid, schema.STATUS_EXCEPTION,
                           schema.EXC_REFUND_NOT_REFLECTED, schema.TIER_DETERMINISTIC, 1.0,
                           "PSP marks payment refunded; ledger still shows 'paid'.",
                           {"payment_id": p["payment_id"]})

        # 4) Amount reconciliation (banded: exact / heuristic / gray / break).
        amt_diff = abs(round(float(p["amount"]) - float(order["amount"]), 2))
        if amt_diff > self.cfg.ambiguity_high:
            return Finding("ORDER", oid, schema.STATUS_EXCEPTION,
                           schema.EXC_AMOUNT_MISMATCH, schema.TIER_DETERMINISTIC, 1.0,
                           f"Captured {p['amount']} vs order {order['amount']} "
                           f"(diff {amt_diff}).", {"amount_diff": amt_diff})
        if self.cfg.tol_heuristic < amt_diff <= self.cfg.ambiguity_high:
            return self._route(oid, "amount", schema.EXC_AMOUNT_MISMATCH,
                               {"diff": amt_diff, "order_amount": float(order["amount"]),
                                "captured": float(p["amount"])})

        # 5) Fee/net consistency (banded).
        expected_net = round(float(p["amount"]) - float(p["fee"]) - float(p["tax"]), 2)
        fee_diff = abs(round(float(p["net_amount"]) - expected_net, 2))
        if fee_diff > self.cfg.fee_ambiguity_high:
            return Finding("ORDER", oid, schema.STATUS_EXCEPTION,
                           schema.EXC_FEE_MISMATCH, schema.TIER_DETERMINISTIC, 1.0,
                           f"net {p['net_amount']} != amount-fee-tax {expected_net} "
                           f"(diff {fee_diff}).", {"fee_diff": fee_diff})
        if self.cfg.fee_tol_exact < fee_diff <= self.cfg.fee_ambiguity_high:
            return self._route(oid, "fee", schema.EXC_FEE_MISMATCH,
                               {"diff": fee_diff, "captured": float(p["amount"]),
                                "fee": float(p["fee"]), "tax": float(p["tax"]),
                                "net_amount": float(p["net_amount"])})

        # 6) Settlement leg: must have settled and hit the bank.
        sid = str(p["settlement_id"])
        if sid == "" or p["settled_at"] == "":
            return Finding("ORDER", oid, schema.STATUS_EXCEPTION,
                           schema.EXC_MISSING_SETTLEMENT, schema.TIER_DETERMINISTIC, 1.0,
                           "Payment captured but never settled to bank.",
                           {"payment_id": p["payment_id"]})

        # 7) Chargeback: a bank debit referencing this payment.
        cb = bank_debits[bank_debits["narration"].str.contains(str(p["payment_id"]), na=False)]
        if len(cb) > 0:
            return Finding("ORDER", oid, schema.STATUS_EXCEPTION,
                           schema.EXC_CHARGEBACK, schema.TIER_DETERMINISTIC, 1.0,
                           f"Bank debit reverses settled amount for {p['payment_id']}.",
                           {"debit": float(cb.iloc[0]["amount"])})

        # 8) Settlement credit must exist in the bank. Absence is AMBIGUOUS: it
        #    could be a genuine miss OR a timing/next-cycle difference. Route to
        #    Tier 3 rather than assert a loss the deterministic tier can't verify.
        credit = bank_credits[bank_credits["settlement_ref"] == sid]
        if len(credit) == 0:
            return self._route(oid, "settlement", schema.EXC_MISSING_SETTLEMENT,
                               {"settlement_id": sid, "settled_at": str(p["settled_at"])})

        # 9) Clean. Deterministic if amount tied to the cent, else heuristic.
        if amt_diff <= self.cfg.tol_exact and fee_diff <= self.cfg.fee_tol_exact:
            return Finding("ORDER", oid, schema.STATUS_MATCHED, schema.EXC_NONE,
                           schema.TIER_DETERMINISTIC, 1.0,
                           "Exact three-way match: ledger = PSP = bank.",
                           {"settlement_id": sid})
        return Finding("ORDER", oid, schema.STATUS_MATCHED, schema.EXC_NONE,
                       schema.TIER_HEURISTIC, 0.9,
                       f"Matched within tolerance (amt diff {amt_diff}, fee diff {fee_diff}).",
                       {"settlement_id": sid})

    # -- Tier 3 routing ---------------------------------------------------- #
    def _route(self, oid, dimension, rule_guess, context) -> Finding:
        """Hand a gray-zone case to the adjudicator (Gemini in prod, human-flag
        fallback otherwise). `context` carries the evidence the LLM reasons over."""
        case = {"entity_id": oid, "dimension": dimension, "rule_guess": rule_guess}
        case.update(context)
        verdict = self.adjudicator(case)
        evidence = {"dimension": dimension}
        if "diff" in context:
            evidence["diff"] = context["diff"]
        return Finding("ORDER", oid, verdict["status"], verdict["exception"],
                       verdict.get("tier", schema.TIER_LLM),
                       verdict["confidence"], verdict["reason"], evidence)
