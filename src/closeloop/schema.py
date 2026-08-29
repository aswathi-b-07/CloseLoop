"""Shared vocabulary for CloseLoop: the exception taxonomy and status labels.

Keeping these as a single source of truth means the data generator, the
reconciliation engine, and the evaluation harness all speak the same language —
which is what makes the held-out metrics meaningful.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Top-level outcome for a single order once the loop is closed.
# ---------------------------------------------------------------------------
STATUS_MATCHED = "MATCHED"        # fully reconciled across all three sources
STATUS_EXCEPTION = "EXCEPTION"    # something did not tie out; needs attention

# ---------------------------------------------------------------------------
# Exception taxonomy. Every injected discrepancy in the synthetic data and
# every prediction from the engine uses exactly one of these labels, so we can
# compute per-class precision/recall on a held-out split.
# ---------------------------------------------------------------------------
EXC_NONE = "NONE"                          # clean, fully matched
EXC_FEE_MISMATCH = "FEE_MISMATCH"          # net_amount != amount - fee - tax
EXC_AMOUNT_MISMATCH = "AMOUNT_MISMATCH"    # captured amount != order amount
EXC_MISSING_SETTLEMENT = "MISSING_SETTLEMENT"  # captured but never hit the bank
EXC_MISSING_PAYMENT = "MISSING_PAYMENT"    # order exists, no payment recorded
EXC_DUPLICATE_PAYMENT = "DUPLICATE_PAYMENT"    # two captures for one order
EXC_REFUND_NOT_REFLECTED = "REFUND_NOT_REFLECTED"  # refunded at PSP, ledger still 'paid'
EXC_CHARGEBACK = "CHARGEBACK"              # bank debit reversing a settlement
EXC_UNMATCHED_BANK_CREDIT = "UNMATCHED_BANK_CREDIT"  # bank credit with no settlement

# Ordered for stable reporting / confusion matrices.
ALL_EXCEPTIONS = [
    EXC_FEE_MISMATCH,
    EXC_AMOUNT_MISMATCH,
    EXC_MISSING_SETTLEMENT,
    EXC_MISSING_PAYMENT,
    EXC_DUPLICATE_PAYMENT,
    EXC_REFUND_NOT_REFLECTED,
    EXC_CHARGEBACK,
    EXC_UNMATCHED_BANK_CREDIT,
]

ALL_LABELS = [EXC_NONE] + ALL_EXCEPTIONS

# Human-readable, one-line descriptions used in the exception report and the
# pitch. Being able to *name and explain* each exception is half the battle.
EXCEPTION_DESCRIPTIONS = {
    EXC_NONE: "Clean — reconciled across ledger, PSP, and bank.",
    EXC_FEE_MISMATCH: "PSP net settlement does not equal captured amount minus stated fee and tax.",
    EXC_AMOUNT_MISMATCH: "Captured amount does not match the order amount in the ledger.",
    EXC_MISSING_SETTLEMENT: "Payment was captured but never appeared in the bank settlement.",
    EXC_MISSING_PAYMENT: "Order exists in the ledger but no corresponding PSP payment was found.",
    EXC_DUPLICATE_PAYMENT: "More than one successful capture is linked to a single order.",
    EXC_REFUND_NOT_REFLECTED: "Payment was refunded at the PSP but the ledger still marks it as paid.",
    EXC_CHARGEBACK: "A bank debit reversed a previously settled amount (chargeback / dispute).",
    EXC_UNMATCHED_BANK_CREDIT: "A bank credit could not be tied to any known settlement.",
}

# ---------------------------------------------------------------------------
# Which tier of the engine produced a decision — key to the audit trail and to
# the "appropriate AI use" story (LLM only touches what rules cannot resolve).
# ---------------------------------------------------------------------------
TIER_DETERMINISTIC = "DETERMINISTIC"   # exact, rule-certain
TIER_HEURISTIC = "HEURISTIC"           # tolerance / fuzzy rules
TIER_LLM = "LLM"                       # Gemini adjudication of residual ambiguity
TIER_FALLBACK = "FALLBACK"             # LLM unavailable/low-confidence -> flagged for human
