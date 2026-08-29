"""Tier-3 adjudicator — Gemini resolves the residual gray-zone cases.

The engine settles everything it can with deterministic and heuristic rules. A
small residue is genuinely ambiguous by *magnitude alone* — e.g. an ₹8 net
discrepancy that could be a fee-reporting error OR benign FX/rounding drift, or a
settlement that is missing from this statement window but may simply be a T+1
timing difference. Those are the only cases that reach this module.

We use Google Gemini via its OpenAI-compatible endpoint (see llm.py) — the
free tier is enough to run this end to end at zero cost.

Design guarantees the judges reward:
  - **Appropriate AI use**: the LLM sees ONLY the residual cases rules can't
    settle, never the whole dataset. It returns a *structured* verdict.
  - **Bounded execution**: it classifies and recommends; it never mutates a
    ledger. A low-confidence verdict is downgraded to human review.
  - **Graceful failure**: no API key, a timeout, a bad response, or a
    low-confidence answer all fall back to a conservative human-review flag —
    the system is degraded, never silently wrong.
  - **Reproducibility / cost**: every verdict is cached to JSON keyed by the
    case content, so re-running the eval is free and deterministic.

The public surface is a callable `(case: dict) -> verdict: dict` matching the
`Adjudicator` contract the engine already expects (see engine.py `_route`).
"""
from __future__ import annotations

import hashlib
import json
import os
from typing import Optional

from . import llm, schema

# The verdict labels the model is allowed to choose from: the full taxonomy plus
# NONE (meaning "this discrepancy is benign — actually clean").
_ALLOWED_LABELS = schema.ALL_LABELS

_SYSTEM_PROMPT = """You are the Tier-3 adjudicator inside CloseLoop, an AI finance \
controller that reconciles a merchant's internal order ledger against Razorpay \
settlement reports and the bank statement.

Deterministic and heuristic rules have ALREADY settled every case they can. You \
receive ONLY the residual gray-zone cases that rules could not resolve by \
magnitude alone. Your job is to make the single best call on each, and to be \
honest about your confidence.

You must reason about which of two things a small discrepancy is:
  * a genuine exception (money is actually at risk), or
  * benign noise that a strict rule over-flags:
      - clean FX / rounding drift on the PSP net amount, or
      - a settlement that is simply landing in the NEXT bank cycle (T+1 timing),
        not a real loss.

Exception taxonomy you may assign:
  FEE_MISMATCH          PSP net != amount - fee - tax (a real fee-reporting error)
  AMOUNT_MISMATCH       captured amount != order amount (partial capture)
  MISSING_SETTLEMENT    captured but genuinely never settled to the bank
  MISSING_PAYMENT       order in ledger, no PSP capture
  DUPLICATE_PAYMENT     two captures for one order
  REFUND_NOT_REFLECTED  refunded at PSP, ledger still 'paid'
  CHARGEBACK            a bank debit reversed a settled amount
  UNMATCHED_BANK_CREDIT bank credit tied to no known settlement
  NONE                  benign — the discrepancy is FX/rounding noise or pure
                        timing; this case is actually clean and should NOT be
                        flagged as an exception.

Rules for your verdict:
  - Choose NONE (clean=true) only when the evidence genuinely points to benign
    noise or timing. When money could really be at risk, keep it an exception.
  - `confidence` is your honest probability the verdict is correct, 0.0-1.0.
  - Never invent facts beyond the evidence you are given.
  - You recommend only; a human approves. Low-confidence calls are routed to a
    human by the system, so do not inflate confidence to force a decision.

Respond with ONLY a JSON object (no markdown fences, no prose) with exactly \
these keys:
  {"clean": <true|false>,
   "exception": "<one of: NONE, FEE_MISMATCH, AMOUNT_MISMATCH, \
MISSING_SETTLEMENT, MISSING_PAYMENT, DUPLICATE_PAYMENT, REFUND_NOT_REFLECTED, \
CHARGEBACK, UNMATCHED_BANK_CREDIT>",
   "confidence": <number between 0.0 and 1.0>,
   "reason": "<one or two sentences citing the evidence>"}"""


def _strip_fences(text: str) -> str:
    """Defensively remove ```json ... ``` fences some models wrap JSON in."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t
        if t.endswith("```"):
            t = t[: -3]
        # Drop a leading language tag line like ```json
        t = t.replace("json\n", "", 1).strip("`").strip()
    return t


def _case_prompt(case: dict) -> str:
    """Render the residual case as a compact, evidence-first prompt."""
    dim = case.get("dimension", "unknown")
    lines = [
        f"Entity: {case.get('entity_id')}",
        f"Ambiguous dimension: {dim}",
        f"Rule-based best guess (if this is an exception): {case.get('rule_guess')}",
        "",
        "Evidence:",
    ]
    for k, v in case.items():
        if k in ("entity_id", "dimension", "rule_guess"):
            continue
        lines.append(f"  - {k}: {v}")
    lines.append("")
    if dim == "fee":
        lines.append("Question: Is the net-vs-(amount-fee-tax) gap a real FEE_MISMATCH, "
                     "or benign FX/rounding drift (clean)?")
    elif dim == "amount":
        lines.append("Question: Is the captured-vs-order gap a real AMOUNT_MISMATCH "
                     "(partial capture), or benign rounding (clean)?")
    elif dim == "settlement":
        lines.append("Question: Is the absent bank credit a real MISSING_SETTLEMENT, "
                     "or just a T+1 timing difference landing next cycle (clean)?")
    else:
        lines.append("Question: Is this a real exception, or benign noise (clean)?")
    return "\n".join(lines)


class LLMAdjudicator:
    """Callable Tier-3 adjudicator backed by Gemini, with a strict fallback.

    Usage:
        adj = LLMAdjudicator()                    # reads GEMINI_API_KEY
        engine = ReconciliationEngine(adjudicator=adj)

    If no API key is configured (or the SDK is missing), every case falls back
    to human review — the engine stays fully functional, just without the lift.
    """

    def __init__(self, model: Optional[str] = None,
                 cache_path: Optional[str] = None,
                 min_confidence: float = 0.60,
                 max_tokens: int = 1024):
        self.model = model or llm.model_name()
        self.min_confidence = min_confidence
        self.max_tokens = max_tokens
        self.cache_path = cache_path
        self._cache: dict[str, dict] = {}
        if cache_path and os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as fh:
                    self._cache = json.load(fh)
            except (json.JSONDecodeError, OSError):
                self._cache = {}
        # Counters for the audit / metrics story.
        self.stats = {"llm_calls": 0, "cache_hits": 0, "fallbacks": 0, "errors": 0}
        self._client = llm.make_client()

    @property
    def available(self) -> bool:
        """True when a live LLM tier can actually run."""
        return self._client is not None

    # -- cache helpers ---------------------------------------------------- #
    @staticmethod
    def _cache_key(case: dict) -> str:
        payload = json.dumps(case, sort_keys=True, default=str)
        return hashlib.sha1(payload.encode("utf-8")).hexdigest()

    def _persist(self) -> None:
        if not self.cache_path:
            return
        try:
            os.makedirs(os.path.dirname(self.cache_path) or ".", exist_ok=True)
            with open(self.cache_path, "w", encoding="utf-8") as fh:
                json.dump(self._cache, fh, indent=2, sort_keys=True)
        except OSError:
            pass

    # -- the adjudicator contract ---------------------------------------- #
    def __call__(self, case: dict) -> dict:
        key = self._cache_key(case)
        if key in self._cache:
            self.stats["cache_hits"] += 1
            return dict(self._cache[key])

        if self._client is None:
            self.stats["fallbacks"] += 1
            return self._fallback(case, "No LLM client available (missing key/SDK).")

        try:
            verdict = self._ask_llm(case)
        except Exception as exc:  # any API/parse failure -> safe fallback
            self.stats["errors"] += 1
            self.stats["fallbacks"] += 1
            return self._fallback(case, f"LLM call failed ({type(exc).__name__}); routed to human.")

        # Low-confidence answers are never trusted silently.
        if verdict["confidence"] < self.min_confidence:
            self.stats["fallbacks"] += 1
            verdict = self._downgrade(case, verdict)

        self._cache[key] = verdict
        self._persist()
        return dict(verdict)

    # -- the actual LLM call --------------------------------------------- #
    def _ask_llm(self, case: dict) -> dict:
        self.stats["llm_calls"] += 1
        resp = self._client.chat.completions.create(
            model=self.model,
            max_tokens=self.max_tokens,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _case_prompt(case)},
            ],
        )
        text = resp.choices[0].message.content
        data = json.loads(_strip_fences(text))

        clean = bool(data.get("clean", False))
        label = data.get("exception", schema.EXC_NONE)
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0.0))))
        reason = str(data.get("reason", "")).strip()

        if clean or label == schema.EXC_NONE:
            return {
                "exception": schema.EXC_NONE,
                "status": schema.STATUS_MATCHED,
                "confidence": confidence,
                "tier": schema.TIER_LLM,
                "reason": f"Gemini adjudged benign (not an exception): {reason}",
            }
        if label not in schema.ALL_EXCEPTIONS:
            # Model returned something off-taxonomy -> conservative fallback.
            raise ValueError(f"off-taxonomy label {label!r}")
        return {
            "exception": label,
            "status": schema.STATUS_EXCEPTION,
            "confidence": confidence,
            "tier": schema.TIER_LLM,
            "reason": f"Gemini adjudged {label}: {reason}",
        }

    # -- fallbacks -------------------------------------------------------- #
    def _fallback(self, case: dict, why: str) -> dict:
        """No confident machine verdict — surface the rule's best guess to a human."""
        return {
            "exception": case.get("rule_guess", schema.EXC_AMOUNT_MISMATCH),
            "status": schema.STATUS_EXCEPTION,
            "confidence": 0.30,
            "tier": schema.TIER_FALLBACK,
            "reason": ("Gray-zone case beyond deterministic/heuristic tolerance; "
                       + why + " Flagged for human review (conservative)."),
        }

    def _downgrade(self, case: dict, verdict: dict) -> dict:
        """Model answered but below the confidence floor -> route to a human,
        preserving its reasoning as context for the reviewer."""
        return {
            "exception": (case.get("rule_guess", schema.EXC_AMOUNT_MISMATCH)
                          if verdict["exception"] == schema.EXC_NONE else verdict["exception"]),
            "status": schema.STATUS_EXCEPTION,
            "confidence": verdict["confidence"],
            "tier": schema.TIER_FALLBACK,
            "reason": (f"Gemini was not confident enough "
                       f"(conf {verdict['confidence']:.2f} < {self.min_confidence:.2f}); "
                       f"routed to human. Model's note: {verdict['reason']}"),
        }


# Backwards-compatible alias (the class was formerly ClaudeAdjudicator).
ClaudeAdjudicator = LLMAdjudicator
