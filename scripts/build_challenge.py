"""Author the CloseLoop ADVERSARIAL CHALLENGE SUITE.

This is deliberately *separate* from `datagen.py`. Every case below is
hand-designed to attack a specific assumption the reconciliation engine makes —
partial captures on a tolerance boundary, idempotent-retry duplicates, timing
vs. genuine settlement loss, FX rounding that mimics a fee error, refunds that
look like chargebacks, chargebacks with the "wrong" narration, and bank credits
with confusing references.

Crucially, the engine's tolerances were NEVER tuned against these cases. Some are
things the engine gets right; several are honest breaks we expect it to miss.
Reporting both is the whole point — it answers the sharpest judge question:

    "How do we know your generated data isn't too convenient for your algorithm?"

Run this once to (re)write the frozen CSVs under data/challenge/. The suite is
then a fixed, inspectable artefact that `scripts/run_challenge.py` scores.

    python scripts/build_challenge.py
"""
from __future__ import annotations

import os
from datetime import date, timedelta

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data", "challenge")

# Same PSP economics as production, restated locally so this file is fully
# self-contained and independent of the generator: 2% fee, 18% GST on the fee.
FEE_RATE = 0.02
GST_ON_FEE = 0.18
START = date(2026, 7, 1)


def fee_of(amount: float):
    fee = round(amount * FEE_RATE, 2)
    tax = round(fee * GST_ON_FEE, 2)
    net = round(amount - fee - tax, 2)
    return fee, tax, net


class Builder:
    """Tiny imperative helper so each case reads like the scenario it encodes."""

    def __init__(self):
        self.orders, self.payments, self.bank = [], [], []
        self.truth, self.manifest = [], []
        self._bank_n = 0

    # -- row emitters ----------------------------------------------------- #
    def order(self, oid, amount, status="paid", day=0, method="upi"):
        self.orders.append({
            "order_id": oid, "expected_payment_id": f"pay_{oid}",
            "amount": round(amount, 2), "currency": "INR",
            "created_at": (START + timedelta(days=day)).isoformat(),
            "status": status, "method": method,
        })

    def payment(self, pid, oid, amount, *, status="captured", settlement_id="",
                settled_day=None, net_override=None, method="upi"):
        fee, tax, net = fee_of(amount)
        if net_override is not None:
            net = round(net_override, 2)
        self.payments.append({
            "payment_id": pid, "order_id": oid, "amount": round(amount, 2),
            "fee": fee, "tax": tax, "net_amount": net,
            "settlement_id": settlement_id,
            "settled_at": settled_day.isoformat() if settled_day else "",
            "method": method, "status": status,
        })
        return net

    def credit(self, ref, amount, *, day=1, narration=None):
        self._bank_n += 1
        bid = f"bank_ch_{self._bank_n:04d}"
        self.bank.append({
            "bank_txn_id": bid, "utr": f"UTR{self._bank_n:012d}",
            "amount": round(amount, 2),
            "value_date": (START + timedelta(days=day)).isoformat(),
            "narration": narration or f"NEFT CR settlement {ref}",
            "settlement_ref": ref,
        })
        return bid

    def debit(self, ref, amount, *, day=5, narration=None):
        self._bank_n += 1
        bid = f"bank_ch_{self._bank_n:04d}"
        self.bank.append({
            "bank_txn_id": bid, "utr": f"UTR{self._bank_n:012d}",
            "amount": -abs(round(amount, 2)),
            "value_date": (START + timedelta(days=day)).isoformat(),
            "narration": narration or f"DR settlement {ref}",
            "settlement_ref": ref,
        })
        return bid

    def label(self, entity_type, entity_id, truth, trap):
        self.truth.append({"entity_type": entity_type, "entity_id": entity_id,
                           "label": truth, "subtype": trap})

    def case(self, entity_type, entity_id, truth, *, category, trap, design, desc):
        """Register a scored entity + its documented adversarial intent."""
        self.label(entity_type, entity_id, truth, trap)
        self.manifest.append({
            "entity_id": entity_id, "category": category, "trap": trap,
            "design": design, "truth": truth, "description": desc,
        })


def build() -> Builder:
    b = Builder()
    d1 = START + timedelta(days=1)

    # =====================================================================
    # CONTROLS — perfectly clean three-way matches. The suite must not be
    # all-hard: these verify the engine does NOT invent false positives.
    # =====================================================================
    for oid, amt in [("CH0001", 2500.0), ("CH0002", 999.0), ("CH0003", 4999.0)]:
        sid = f"setl_{oid}"
        net = b.payment(f"pay_{oid}", oid, amt, settlement_id=sid, settled_day=d1)
        b.order(oid, amt)
        b.credit(sid, net)
        b.case("ORDER", oid, "NONE", category="control", trap="clean_match",
               design="deterministic", desc="Clean ledger=PSP=bank three-way match.")

    # =====================================================================
    # PARTIAL SETTLEMENTS / AMOUNT MISMATCH
    # =====================================================================
    # Clear partial: captured 6000 on a 10000 order (diff 4000 >> band).
    sid = "setl_CH0010"
    net = b.payment("pay_CH0010", "CH0010", 6000.0, settlement_id=sid, settled_day=d1)
    b.order("CH0010", 10000.0)
    b.credit(sid, net)
    b.case("ORDER", "CH0010", "AMOUNT_MISMATCH", category="partial_settlement",
           trap="partial_capture_large", design="deterministic",
           desc="PSP captured 6,000 against a 10,000 order — clear partial capture.")

    # Boundary partial: diff 45 sits inside the (2, 50] gray band -> routed.
    sid = "setl_CH0011"
    net = b.payment("pay_CH0011", "CH0011", 955.0, settlement_id=sid, settled_day=d1)
    b.order("CH0011", 1000.0)
    b.credit(sid, net)
    b.case("ORDER", "CH0011", "AMOUNT_MISMATCH", category="partial_settlement",
           trap="partial_capture_boundary", design="gray-zone",
           desc="45 short on a 1,000 order — inside the amount ambiguity band; "
                "rules can only route it, not assert it.")

    # Legit sub-tolerance rounding: diff 1.40 (<= 2.00) — must be tolerated.
    sid = "setl_CH0012"
    net = b.payment("pay_CH0012", "CH0012", 498.60, settlement_id=sid, settled_day=d1)
    b.order("CH0012", 500.0)
    b.credit(sid, net)
    b.case("ORDER", "CH0012", "NONE", category="partial_settlement",
           trap="rounding_within_tolerance", design="deterministic",
           desc="1.40 rounding drift on a 500 order — legitimately within tolerance; "
                "engine must NOT flag it.")

    # Honest gap: a real 1.50 underpayment that hides just under tolerance.
    sid = "setl_CH0013"
    net = b.payment("pay_CH0013", "CH0013", 998.50, settlement_id=sid, settled_day=d1)
    b.order("CH0013", 1000.0)
    b.credit(sid, net)
    b.case("ORDER", "CH0013", "AMOUNT_MISMATCH", category="partial_settlement",
           trap="shortfall_under_tolerance", design="adversarial-gap",
           desc="A genuine 1.50 shortfall deliberately parked just under the 2.00 "
                "tolerance — a tolerance-based rule cannot catch this.")

    # =====================================================================
    # NEAR-IDENTICAL AMOUNTS — two clean orders that differ by 0.50; a naive
    # amount-based matcher could cross them. Ours keys on order_id.
    # =====================================================================
    for oid, amt in [("CH0020", 2499.0), ("CH0021", 2499.5)]:
        sid = f"setl_{oid}"
        net = b.payment(f"pay_{oid}", oid, amt, settlement_id=sid, settled_day=d1)
        b.order(oid, amt)
        b.credit(sid, net)
        b.case("ORDER", oid, "NONE", category="near_identical_amounts",
               trap="near_identical_amount", design="deterministic",
               desc=f"Amount {amt} — nearly identical to a sibling order; must not cross-match.")

    # =====================================================================
    # DUPLICATE TRANSACTION IDS / DUPLICATE PAYMENTS
    # =====================================================================
    # True double charge: two distinct captures on one order.
    sid = "setl_CH0030"
    b.order("CH0030", 1500.0)
    net = b.payment("pay_CH0030a", "CH0030", 1500.0, settlement_id=sid, settled_day=d1)
    net2 = b.payment("pay_CH0030b", "CH0030", 1500.0, settlement_id=sid, settled_day=d1)
    b.credit(sid, round(net + net2, 2))
    b.case("ORDER", "CH0030", "DUPLICATE_PAYMENT", category="duplicate",
           trap="true_double_charge", design="deterministic",
           desc="Two separate captures booked against one order — a real double charge.")

    # Idempotent retry: the SAME payment_id exported twice (data glitch), not a
    # real double charge. A row-count rule over-flags this.
    sid = "setl_CH0031"
    b.order("CH0031", 800.0)
    net = b.payment("pay_CH0031", "CH0031", 800.0, settlement_id=sid, settled_day=d1)
    b.payment("pay_CH0031", "CH0031", 800.0, settlement_id=sid, settled_day=d1)  # dup id
    b.credit(sid, net)
    b.case("ORDER", "CH0031", "NONE", category="duplicate",
           trap="idempotent_retry_same_id", design="adversarial-gap",
           desc="One payment_id appears twice from a report-export glitch (idempotent "
                "retry). It is ONE payment; a naive row count calls it a duplicate.")

    # Captured + failed: the failed attempt must be ignored, not counted.
    sid = "setl_CH0032"
    b.order("CH0032", 1200.0)
    net = b.payment("pay_CH0032", "CH0032", 1200.0, settlement_id=sid, settled_day=d1)
    b.payment("pay_CH0032f", "CH0032", 1200.0, status="failed")
    b.credit(sid, net)
    b.case("ORDER", "CH0032", "NONE", category="duplicate",
           trap="failed_attempt_ignored", design="deterministic",
           desc="One successful capture plus one FAILED attempt — must not be a duplicate.")

    # =====================================================================
    # DELAYED / MISSING SETTLEMENTS
    # =====================================================================
    # Genuine missing settlement: captured but never settled.
    b.order("CH0040", 3000.0)
    b.payment("pay_CH0040", "CH0040", 3000.0, settlement_id="", settled_day=None)
    b.case("ORDER", "CH0040", "MISSING_SETTLEMENT", category="settlement_timing",
           trap="never_settled", design="deterministic",
           desc="Captured at the PSP but no settlement id and no bank credit — genuine miss.")

    # Timing: settled per PSP, credit lands NEXT cycle (absent this statement).
    b.order("CH0041", 2200.0)
    b.payment("pay_CH0041", "CH0041", 2200.0,
              settlement_id="setl_CH0041_pending", settled_day=d1)
    # NB: no bank credit emitted -> looks missing, but it is only delayed.
    b.case("ORDER", "CH0041", "NONE", category="settlement_timing",
           trap="settlement_next_cycle", design="adversarial-gap",
           desc="Settled per PSP but the bank credit falls in the next cycle. A "
                "date-blind rule reads this as a loss; it is only timing.")

    # Delayed-but-present: credit exists with a much later value date; ref ties.
    sid = "setl_CH0042"
    net = b.payment("pay_CH0042", "CH0042", 1800.0, settlement_id=sid, settled_day=d1)
    b.order("CH0042", 1800.0)
    b.credit(sid, net, day=9)  # arrived late but it did arrive, and the ref ties
    b.case("ORDER", "CH0042", "NONE", category="settlement_timing",
           trap="delayed_but_present", design="deterministic",
           desc="Credit arrived 8 days late but the settlement ref ties out — clean.")

    # =====================================================================
    # INCORRECT FEE CALCULATIONS
    # =====================================================================
    # Large fee error: net short by 120 (well past the fee band).
    sid = "setl_CH0050"
    _, _, correct = fee_of(5000.0)
    net = b.payment("pay_CH0050", "CH0050", 5000.0, settlement_id=sid,
                    settled_day=d1, net_override=correct - 120)
    b.order("CH0050", 5000.0)
    b.credit(sid, net)
    b.case("ORDER", "CH0050", "FEE_MISMATCH", category="fee",
           trap="fee_error_large", design="deterministic",
           desc="Net is 120 short of amount-fee-tax — an unambiguous fee/net break.")

    # Small fee error in the gray band (off by 20) -> routed.
    sid = "setl_CH0051"
    _, _, correct = fee_of(2500.0)
    net = b.payment("pay_CH0051", "CH0051", 2500.0, settlement_id=sid,
                    settled_day=d1, net_override=correct - 20)
    b.order("CH0051", 2500.0)
    b.credit(sid, net)
    b.case("ORDER", "CH0051", "FEE_MISMATCH", category="fee",
           trap="fee_error_grayband", design="gray-zone",
           desc="Net off by 20 — inside the fee ambiguity band; rules can only route it.")

    # Wrong GST base: GST charged on the whole amount, not on the fee.
    sid = "setl_CH0052"
    amt = 3000.0
    wrong_net = round(amt - (amt * FEE_RATE) - (amt * 0.18), 2)  # GST on amount!
    net = b.payment("pay_CH0052", "CH0052", amt, settlement_id=sid,
                    settled_day=d1, net_override=wrong_net)
    b.order("CH0052", amt)
    b.credit(sid, net)
    b.case("ORDER", "CH0052", "FEE_MISMATCH", category="fee",
           trap="wrong_gst_base", design="deterministic",
           desc="GST wrongly applied to the full amount instead of the fee — realistic "
                "PSP-report tax error.")

    # =====================================================================
    # FX / ROUNDING AMBIGUITY — genuinely clean settlements whose net drifts by
    # a few rupees. Indistinguishable by magnitude from a small fee error.
    # =====================================================================
    sid = "setl_CH0060"
    _, _, correct = fee_of(4000.0)
    net = b.payment("pay_CH0060", "CH0060", 4000.0, settlement_id=sid,
                    settled_day=d1, net_override=correct + 8.0)
    b.order("CH0060", 4000.0)
    b.credit(sid, net)
    b.case("ORDER", "CH0060", "NONE", category="fx_rounding",
           trap="fx_drift_clean", design="adversarial-gap",
           desc="8.00 FX/rounding drift on an otherwise clean settlement — looks exactly "
                "like a small fee error to a magnitude rule.")

    sid = "setl_CH0061"
    _, _, correct = fee_of(1500.0)
    net = b.payment("pay_CH0061", "CH0061", 1500.0, settlement_id=sid,
                    settled_day=d1, net_override=correct + 0.50)
    b.order("CH0061", 1500.0)
    b.credit(sid, net)
    b.case("ORDER", "CH0061", "NONE", category="fx_rounding",
           trap="fx_drift_subrupee", design="adversarial-gap",
           desc="Sub-rupee (0.50) rounding drift — clean, but above the 0.01 exact-fee "
                "tolerance, so a strict rule still routes it.")

    # =====================================================================
    # REFUNDS CROSSING SETTLEMENT CYCLES
    # =====================================================================
    # Refund not reflected: PSP refunded, ledger still 'paid'.
    sid = "setl_CH0070"
    net = b.payment("pay_CH0070", "CH0070", 2000.0, status="refunded",
                    settlement_id=sid, settled_day=d1)
    b.order("CH0070", 2000.0, status="paid")
    b.credit(sid, net)
    b.case("ORDER", "CH0070", "REFUND_NOT_REFLECTED", category="refund",
           trap="refund_not_reflected", design="deterministic",
           desc="PSP marks the payment refunded but the ledger still shows 'paid'.")

    # Refund correctly reflected, refund debit narrated cleanly (no payment id).
    sid = "setl_CH0071"
    net = b.payment("pay_CH0071", "CH0071", 2600.0, status="refunded",
                    settlement_id=sid, settled_day=d1)
    b.order("CH0071", 2600.0, status="refunded")
    b.credit(sid, net)
    b.debit(sid, net, day=6, narration=f"REFUND DR settlement {sid}")
    b.case("ORDER", "CH0071", "NONE", category="refund",
           trap="refund_reflected_clean", design="deterministic",
           desc="Refund handled correctly on both sides; refund debit narrated as a "
                "refund — must NOT be flagged.")

    # Refund debit that carries the original payment id in its narration — looks
    # like a chargeback to a narration-substring rule.
    sid = "setl_CH0072"
    pid = "pay_CH0072"
    net = b.payment(pid, "CH0072", 3200.0, status="refunded",
                    settlement_id=sid, settled_day=d1)
    b.order("CH0072", 3200.0, status="refunded")
    b.credit(sid, net)
    b.debit(sid, net, day=6, narration=f"REFUND reversal ref {pid} setl {sid}")
    b.case("ORDER", "CH0072", "NONE", category="refund",
           trap="refund_looks_like_chargeback", design="adversarial-gap",
           desc="A properly reflected refund whose bank debit quotes the payment id — "
                "a substring rule mistakes it for a chargeback.")

    # =====================================================================
    # CHARGEBACK AFTER ORIGINAL RECONCILIATION
    # =====================================================================
    # Classic chargeback: settled, then reversed; debit quotes the payment id.
    sid = "setl_CH0080"
    pid = "pay_CH0080"
    net = b.payment(pid, "CH0080", 4500.0, settlement_id=sid, settled_day=d1)
    b.order("CH0080", 4500.0, status="paid")
    b.credit(sid, net)
    b.debit(sid, net, day=7, narration=f"CHARGEBACK DR ref {pid} setl {sid}")
    b.case("ORDER", "CH0080", "CHARGEBACK", category="chargeback",
           trap="chargeback_with_ref", design="deterministic",
           desc="Settled then reversed; the debit references the payment id — textbook "
                "chargeback.")

    # Chargeback whose debit does NOT quote the payment id (only a UTR/setl ref).
    sid = "setl_CH0081"
    net = b.payment("pay_CH0081", "CH0081", 5200.0, settlement_id=sid, settled_day=d1)
    b.order("CH0081", 5200.0, status="paid")
    b.credit(sid, net)
    b.debit(sid, net, day=8, narration=f"CHARGEBACK DR dispute UTR009988 setl {sid}")
    b.case("ORDER", "CH0081", "CHARGEBACK", category="chargeback",
           trap="chargeback_no_payment_ref", design="adversarial-gap",
           desc="A real chargeback whose debit omits the payment id — a narration-"
                "substring rule never sees it and calls the order clean.")

    # =====================================================================
    # BANK CREDITS WITH CONFUSING REFERENCES
    # =====================================================================
    # Genuine orphan credit: settlement ref maps to nothing.
    bid = b.credit("setl_orphan_CH0090", 8800.0, day=3,
                   narration="NEFT CR unmapped setl_orphan_CH0090")
    b.case("BANK_TXN", bid, "UNMATCHED_BANK_CREDIT", category="bank_reference",
           trap="true_orphan_credit", design="deterministic",
           desc="A bank credit whose settlement ref matches no known settlement — a "
                "genuine unmatched credit.")

    # Case-mismatched ref: a valid settlement credit typed in a different case.
    # Both the order (credit not found) and the credit (ref unknown) get confused.
    sid = "setl_CH0091"
    net = b.payment("pay_CH0091", "CH0091", 2750.0, settlement_id=sid, settled_day=d1)
    b.order("CH0091", 2750.0)
    bid = b.credit("SETL_CH0091", net, narration="NEFT CR settlement SETL_CH0091")  # upper
    b.case("ORDER", "CH0091", "NONE", category="bank_reference",
           trap="settlement_ref_case_mismatch", design="adversarial-gap",
           desc="The bank typed the settlement ref in a different case (SETL_ vs setl_). "
                "An exact-string match loses the tie on both the order and the credit.")
    b.case("BANK_TXN", bid, "NONE", category="bank_reference",
           trap="settlement_ref_case_mismatch", design="adversarial-gap",
           desc="Same case-mismatch, seen from the bank side: a valid credit looks orphaned.")

    # Confusing narration but correct ref: narration mentions another order id.
    sid = "setl_CH0092"
    net = b.payment("pay_CH0092", "CH0092", 3100.0, settlement_id=sid, settled_day=d1)
    b.order("CH0092", 3100.0)
    b.credit(sid, net, narration=f"NEFT CR settlement {sid} incl ORD99999 batch")
    b.case("ORDER", "CH0092", "NONE", category="bank_reference",
           trap="confusing_narration_correct_ref", design="deterministic",
           desc="Narration name-drops an unrelated order id, but the settlement ref is "
                "correct — must still match cleanly.")

    # =====================================================================
    # MISSING PAYMENT
    # =====================================================================
    b.order("CH0100", 1750.0)
    b.case("ORDER", "CH0100", "MISSING_PAYMENT", category="missing_payment",
           trap="order_without_capture", design="deterministic",
           desc="Order exists in the ledger with no PSP capture at all.")

    return b


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    b = build()
    frames = {
        "orders.csv": pd.DataFrame(b.orders),
        "razorpay_payments.csv": pd.DataFrame(b.payments),
        "bank_statement.csv": pd.DataFrame(b.bank),
        "ground_truth.csv": pd.DataFrame(b.truth),
        "challenge_manifest.csv": pd.DataFrame(b.manifest),
    }
    for name, df in frames.items():
        df.to_csv(os.path.join(OUT_DIR, name), index=False)

    gt = frames["ground_truth.csv"]
    man = frames["challenge_manifest.csv"]
    print(f"[challenge] wrote {len(frames)} files -> {OUT_DIR}")
    print(f"[challenge] {len(gt)} scored entities "
          f"({len(frames['orders.csv'])} orders, "
          f"{len(frames['razorpay_payments.csv'])} payments, "
          f"{len(frames['bank_statement.csv'])} bank rows)")
    print("[challenge] label distribution:")
    print(gt["label"].value_counts().to_string())
    print("\n[challenge] design intent:")
    print(man["design"].value_counts().to_string())


if __name__ == "__main__":
    main()
