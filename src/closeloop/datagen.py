"""Synthetic, ground-truth-labelled finance data for CloseLoop.

We generate three sources that a real merchant reconciles every day:

  1. orders            — the internal ledger / system of record
  2. razorpay_payments — the PSP settlement report (Razorpay test-mode shape)
  3. bank_statement    — credits (and the occasional debit) hitting the bank

Crucially we ALSO emit `ground_truth`: for every reconcilable entity we know
the correct answer (clean, or which exception). That label is what lets us
report honest precision/recall on a held-out split instead of hand-waving.

Everything is seeded, so a given seed always produces the same dataset — the
data generator is reproducible and the metrics are defensible.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta

import pandas as pd

from . import schema

# Razorpay standard-ish economics for the synthetic PSP: 2% platform fee, then
# 18% GST charged *on the fee*. net = amount - fee - tax.
FEE_RATE = 0.02
GST_ON_FEE = 0.18

# How the exception budget is split across types (weights, need not sum to 1).
EXCEPTION_MIX = {
    schema.EXC_FEE_MISMATCH: 3,
    schema.EXC_AMOUNT_MISMATCH: 3,
    schema.EXC_MISSING_SETTLEMENT: 3,
    schema.EXC_MISSING_PAYMENT: 2,
    schema.EXC_DUPLICATE_PAYMENT: 2,
    schema.EXC_REFUND_NOT_REFLECTED: 2,
    schema.EXC_CHARGEBACK: 2,
    schema.EXC_UNMATCHED_BANK_CREDIT: 2,
}

METHODS = ["upi", "card", "netbanking", "wallet"]


@dataclass
class Dataset:
    orders: pd.DataFrame
    payments: pd.DataFrame
    bank: pd.DataFrame
    ground_truth: pd.DataFrame
    seed: int
    meta: dict = field(default_factory=dict)

    def to_csv_dir(self, out_dir: str) -> None:
        import os
        os.makedirs(out_dir, exist_ok=True)
        self.orders.to_csv(os.path.join(out_dir, "orders.csv"), index=False)
        self.payments.to_csv(os.path.join(out_dir, "razorpay_payments.csv"), index=False)
        self.bank.to_csv(os.path.join(out_dir, "bank_statement.csv"), index=False)
        self.ground_truth.to_csv(os.path.join(out_dir, "ground_truth.csv"), index=False)


def _fee_for(amount: float) -> tuple[float, float, float]:
    fee = round(amount * FEE_RATE, 2)
    tax = round(fee * GST_ON_FEE, 2)
    net = round(amount - fee - tax, 2)
    return fee, tax, net


def _assign_labels(n: int, exception_rate: float, rng: random.Random) -> list[str]:
    """Return a label per order. `exception_rate` fraction get an exception drawn
    from EXCEPTION_MIX (excluding the bank-only UNMATCHED_BANK_CREDIT, which is
    injected separately since it has no originating order)."""
    n_exc = round(n * exception_rate)
    order_exc_types = {k: v for k, v in EXCEPTION_MIX.items()
                       if k != schema.EXC_UNMATCHED_BANK_CREDIT}
    pool, weights = list(order_exc_types), list(order_exc_types.values())
    labels = [schema.EXC_NONE] * n
    idx = rng.sample(range(n), n_exc)
    for i in idx:
        labels[i] = rng.choices(pool, weights=weights, k=1)[0]
    return labels


def _assign_subtypes(labels: list[str], rng: random.Random,
                     fx_rate: float = 0.05, timing_rate: float = 0.03) -> list[str]:
    """Tag each order with a difficulty subtype used for error analysis.

    Exceptions keep their label as subtype. A slice of the *clean* orders are
    turned into deliberately AMBIGUOUS-but-clean cases:
      - clean_fx_noise : FX/rounding drift that looks like a small fee error
      - clean_timing   : settled, but the bank credit lands in the next cycle
    These are the cases deterministic rules must get wrong (honest misses) and
    the Tier-3 LLM is meant to resolve — the basis of the baseline-vs-LLM lift.
    """
    subs = []
    for lab in labels:
        if lab != schema.EXC_NONE:
            subs.append(lab)
            continue
        r = rng.random()
        if r < fx_rate:
            subs.append("clean_fx_noise")
        elif r < fx_rate + timing_rate:
            subs.append("clean_timing")
        else:
            subs.append("clean")
    return subs


def generate(n_orders: int = 120, exception_rate: float = 0.28,
             seed: int = 42, start: date | None = None) -> Dataset:
    rng = random.Random(seed)
    start = start or date(2026, 7, 1)

    orders, payments, bank, truth = [], [], [], []
    labels = _assign_labels(n_orders, exception_rate, rng)
    subtypes = _assign_subtypes(labels, rng)

    # Buffer of settled payments -> batched into settlements -> bank credits.
    # Keyed by settlement date so a settlement batches a day's captures.
    settlement_buffer: dict[date, list[dict]] = {}
    # Chargebacks discovered during generation, emitted as later bank debits.
    pending_chargebacks: list[dict] = []

    for i in range(n_orders):
        label = labels[i]
        subtype = subtypes[i]
        oid = f"ORD{i+1:05d}"
        pid = f"pay_{seed:04d}{i+1:05d}"
        amount = round(rng.choice([199, 299, 499, 999, 1499, 2499, 4999, 7999])
                       + rng.choice([0, 0, 0, 0.50, 0.99]), 2)
        created = start + timedelta(days=rng.randint(0, 27))
        settled_day = created + timedelta(days=1)  # T+1 settlement cycle
        method = rng.choice(METHODS)

        order_status = "paid"
        # Ground-truth entity for this order (subtype = difficulty tag).
        truth.append({"entity_type": "ORDER", "entity_id": oid,
                      "label": label, "subtype": subtype})

        # ---- Build the payment + bank leg per label -------------------------
        if label == schema.EXC_MISSING_PAYMENT:
            # Order recorded, but the PSP has no capture. No payment/bank rows.
            orders.append(_order_row(oid, pid, amount, created, order_status, method))
            continue

        if label == schema.EXC_REFUND_NOT_REFLECTED:
            order_status = "paid"  # ledger wrongly still 'paid'
        orders.append(_order_row(oid, pid, amount, created, order_status, method))

        captured = amount
        if label == schema.EXC_AMOUNT_MISMATCH:
            # Partial capture: PSP captured less than the order.
            captured = round(amount * rng.choice([0.5, 0.6, 0.75, 0.9]), 2)

        fee, tax, net = _fee_for(captured)

        if label == schema.EXC_FEE_MISMATCH:
            # net inconsistent with amount - fee - tax (PSP report error).
            # Deltas overlap the FX-noise band on purpose -> not separable by
            # magnitude alone, so rules can't perfectly split fee-error vs FX.
            net = round(net + rng.choice([-1, 1]) * rng.choice([5.0, 8.0, 12.0, 18.0, 25.0]), 2)
        elif subtype == "clean_fx_noise":
            # Genuine FX/rounding drift on an otherwise clean settlement.
            net = round(net + rng.choice([-1, 1]) * rng.choice([3.0, 5.0, 8.0, 12.0]), 2)

        pay_status = "captured"
        settlement_id = ""
        settled_at = ""

        if label == schema.EXC_MISSING_SETTLEMENT:
            # Captured but never settled to bank.
            settlement_id, settled_at = "", ""
        elif label == schema.EXC_REFUND_NOT_REFLECTED:
            pay_status = "refunded"
            # a refund debit shows in bank later; not settled as a normal credit
        elif subtype == "clean_timing":
            # Settled per PSP, but the bank credit lands in the NEXT cycle and is
            # absent from this statement window. Deterministic rules see a missing
            # credit; only date-aware context knows it's timing, not a loss.
            settlement_id = f"setl_pending_{seed:04d}{i:05d}"
            settled_at = settled_day.isoformat()
            # deliberately NOT added to the settlement buffer -> no bank credit
        else:
            settlement_id = _batch(settlement_buffer, settled_day, net)
            settled_at = settled_day.isoformat()

        payments.append(_payment_row(pid, oid, captured, fee, tax, net,
                                     settlement_id, settled_at, method, pay_status))

        if label == schema.EXC_DUPLICATE_PAYMENT:
            # A second, duplicate capture for the same order.
            pid2 = pid + "d"
            fee2, tax2, net2 = _fee_for(captured)
            sid2 = _batch(settlement_buffer, settled_day, net2)
            payments.append(_payment_row(pid2, oid, captured, fee2, tax2, net2,
                                         sid2, settled_day.isoformat(), method, "captured"))

        if label == schema.EXC_CHARGEBACK:
            # Settled normally, then reversed by the bank a few days later.
            pending_chargebacks.append({
                "settlement_id": settlement_id, "amount": net,
                "value_date": settled_day + timedelta(days=rng.randint(3, 9)),
                "ref": pid,
            })

    # ---- Materialise settlements into bank credits --------------------------
    for sday, items in sorted(settlement_buffer.items()):
        by_sid: dict[str, float] = {}
        for it in items:
            by_sid[it["settlement_id"]] = round(by_sid.get(it["settlement_id"], 0.0)
                                                 + it["net"], 2)
        for sid, total in by_sid.items():
            bank.append(_bank_row(sid, total, sday, credit=True))

    # ---- Chargeback debits --------------------------------------------------
    for cb in pending_chargebacks:
        bank.append(_bank_row(cb["settlement_id"], -abs(cb["amount"]),
                              cb["value_date"], credit=False,
                              narration=f"CHARGEBACK DR ref {cb['ref']} setl {cb['settlement_id']}"))

    # ---- Orphan bank credits (UNMATCHED_BANK_CREDIT) ------------------------
    n_orphans = max(1, round(n_orders * exception_rate * 0.08))
    for j in range(n_orphans):
        fake_sid = f"setl_orphan{seed:04d}{j:03d}"
        amt = round(rng.choice([1500, 3200, 8800, 12000]) + rng.random() * 50, 2)
        vday = start + timedelta(days=rng.randint(2, 27))
        row = _bank_row(fake_sid, amt, vday, credit=True,
                        narration=f"NEFT CR unmapped {fake_sid}")
        bank.append(row)
        truth.append({"entity_type": "BANK_TXN", "entity_id": row["bank_txn_id"],
                      "label": schema.EXC_UNMATCHED_BANK_CREDIT,
                      "subtype": schema.EXC_UNMATCHED_BANK_CREDIT})

    ds = Dataset(
        orders=pd.DataFrame(orders),
        payments=pd.DataFrame(payments),
        bank=pd.DataFrame(bank),
        ground_truth=pd.DataFrame(truth),
        seed=seed,
        meta={"n_orders": n_orders, "exception_rate": exception_rate},
    )
    return ds


# --------------------------------------------------------------------------- #
# Row builders (kept tiny and explicit so the CSV schema is obvious)
# --------------------------------------------------------------------------- #
def _order_row(oid, pid, amount, created, status, method):
    return {"order_id": oid, "expected_payment_id": pid, "amount": amount,
            "currency": "INR", "created_at": created.isoformat(),
            "status": status, "method": method}


def _payment_row(pid, oid, amount, fee, tax, net, sid, settled_at, method, status):
    return {"payment_id": pid, "order_id": oid, "amount": amount, "fee": fee,
            "tax": tax, "net_amount": net, "settlement_id": sid,
            "settled_at": settled_at, "method": method, "status": status}


def _bank_row(sid, amount, value_date, credit, narration=None):
    # Deterministic id derived from content (no time-based randomness needed).
    txn_id = f"bank_{abs(hash((sid, round(amount,2), value_date.isoformat()))) % (10**10):010d}"
    utr = f"UTR{abs(hash((txn_id, sid))) % (10**12):012d}"
    if narration is None:
        narration = f"{'NEFT CR' if credit else 'DR'} settlement {sid}"
    return {"bank_txn_id": txn_id, "utr": utr, "amount": round(amount, 2),
            "value_date": value_date.isoformat(), "narration": narration,
            "settlement_ref": sid}


def _batch(buffer: dict, sday: date, net: float) -> str:
    """Assign a payment to that day's settlement batch and return its id."""
    sid = f"setl_{sday.isoformat().replace('-', '')}"
    buffer.setdefault(sday, []).append({"settlement_id": sid, "net": net})
    return sid


if __name__ == "__main__":  # quick smoke test
    ds = generate()
    print("orders:", len(ds.orders), "payments:", len(ds.payments),
          "bank:", len(ds.bank), "truth:", len(ds.ground_truth))
    print(ds.ground_truth["label"].value_counts().to_string())
