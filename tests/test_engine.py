"""Unit tests for the CloseLoop reconciliation engine.

These pin the deterministic behaviour of every tier so a refactor can't silently
change what the controller decides. They construct tiny, hand-built datasets so
the expected finding for each exception type is unambiguous — this is the
regression net behind the held-out metrics.
"""
import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "src"))

from closeloop import datagen, evaluate, schema  # noqa: E402
from closeloop.engine import EngineConfig, ReconciliationEngine  # noqa: E402


# --------------------------------------------------------------------------- #
# Row builders for minimal, explicit fixtures
# --------------------------------------------------------------------------- #
def order(oid, amount=1000.0, status="paid"):
    return {"order_id": oid, "expected_payment_id": f"pay_{oid}", "amount": amount,
            "currency": "INR", "created_at": "2026-07-01", "status": status,
            "method": "upi"}


def payment(pid, oid, amount=1000.0, fee=20.0, tax=3.6, net=976.4,
            sid="setl_1", settled_at="2026-07-02", status="captured"):
    return {"payment_id": pid, "order_id": oid, "amount": amount, "fee": fee,
            "tax": tax, "net_amount": net, "settlement_id": sid,
            "settled_at": settled_at, "method": "upi", "status": status}


def bank(txn_id, amount, sid, narration=None):
    return {"bank_txn_id": txn_id, "utr": f"UTR{txn_id}", "amount": amount,
            "value_date": "2026-07-02",
            "narration": narration or f"NEFT CR settlement {sid}",
            "settlement_ref": sid}


def run(orders, payments, banks, adjudicator=None):
    engine = ReconciliationEngine(adjudicator=adjudicator)
    return engine.run(pd.DataFrame(orders), pd.DataFrame(payments), pd.DataFrame(banks))


def only(findings, entity_id):
    rows = findings[findings["entity_id"] == entity_id]
    assert len(rows) == 1, f"expected one finding for {entity_id}, got {len(rows)}"
    return rows.iloc[0]


# --------------------------------------------------------------------------- #
# Clean match
# --------------------------------------------------------------------------- #
def test_clean_three_way_match_is_deterministic():
    f = run([order("O1")],
            [payment("p1", "O1")],
            [bank("b1", 976.4, "setl_1")])
    r = only(f, "O1")
    assert r["predicted_status"] == schema.STATUS_MATCHED
    assert r["predicted_exception"] == schema.EXC_NONE
    assert r["tier"] == schema.TIER_DETERMINISTIC


# --------------------------------------------------------------------------- #
# Each exception type
# --------------------------------------------------------------------------- #
def test_missing_payment():
    f = run([order("O1")], [], [])
    r = only(f, "O1")
    assert r["predicted_exception"] == schema.EXC_MISSING_PAYMENT
    assert r["tier"] == schema.TIER_DETERMINISTIC
    assert r["confidence"] == 1.0


def test_duplicate_payment():
    f = run([order("O1")],
            [payment("p1", "O1"), payment("p2", "O1")],
            [bank("b1", 976.4, "setl_1")])
    r = only(f, "O1")
    assert r["predicted_exception"] == schema.EXC_DUPLICATE_PAYMENT


def test_refund_not_reflected():
    f = run([order("O1", status="paid")],
            [payment("p1", "O1", status="refunded")],
            [])
    r = only(f, "O1")
    assert r["predicted_exception"] == schema.EXC_REFUND_NOT_REFLECTED


def test_amount_mismatch_large_is_deterministic():
    # Captured far below the order amount -> partial capture, unambiguous.
    f = run([order("O1", amount=1000.0)],
            [payment("p1", "O1", amount=500.0, fee=10.0, tax=1.8, net=488.2)],
            [bank("b1", 488.2, "setl_1")])
    r = only(f, "O1")
    assert r["predicted_exception"] == schema.EXC_AMOUNT_MISMATCH
    assert r["tier"] == schema.TIER_DETERMINISTIC


def test_missing_settlement_when_never_settled():
    f = run([order("O1")],
            [payment("p1", "O1", sid="", settled_at="")],
            [])
    r = only(f, "O1")
    assert r["predicted_exception"] == schema.EXC_MISSING_SETTLEMENT


def test_chargeback_detected_from_bank_debit():
    f = run([order("O1")],
            [payment("p1", "O1")],
            [bank("b1", 976.4, "setl_1"),
             bank("b2", -976.4, "setl_1", narration="CHARGEBACK DR ref p1 setl setl_1")])
    r = only(f, "O1")
    assert r["predicted_exception"] == schema.EXC_CHARGEBACK


def test_unmatched_bank_credit():
    f = run([order("O1")],
            [payment("p1", "O1")],
            [bank("b1", 976.4, "setl_1"),
             bank("orphan", 5000.0, "setl_ghost", narration="NEFT CR unmapped")])
    rows = f[f["predicted_exception"] == schema.EXC_UNMATCHED_BANK_CREDIT]
    assert len(rows) == 1
    assert rows.iloc[0]["entity_type"] == "BANK_TXN"


def test_fee_mismatch_large_is_deterministic():
    # net is way off amount-fee-tax -> clearly a fee error, not FX noise.
    f = run([order("O1")],
            [payment("p1", "O1", net=800.0)],  # expected ~976.4
            [bank("b1", 800.0, "setl_1")])
    r = only(f, "O1")
    assert r["predicted_exception"] == schema.EXC_FEE_MISMATCH


# --------------------------------------------------------------------------- #
# Tiering / routing behaviour
# --------------------------------------------------------------------------- #
def test_grayzone_fee_routes_to_adjudicator():
    """A small net discrepancy is ambiguous -> must hit the Tier-3 adjudicator,
    not be asserted deterministically."""
    captured = {}

    def spy(case):
        captured.update(case)
        return {"exception": schema.EXC_NONE, "status": schema.STATUS_MATCHED,
                "confidence": 0.9, "tier": schema.TIER_LLM, "reason": "benign"}

    f = run([order("O1")],
            [payment("p1", "O1", net=976.4 - 8.0)],  # ~8 off: gray zone
            [bank("b1", 976.4 - 8.0, "setl_1")],
            adjudicator=spy)
    r = only(f, "O1")
    assert captured.get("dimension") == "fee"
    assert r["tier"] == schema.TIER_LLM
    assert r["predicted_status"] == schema.STATUS_MATCHED


def test_default_adjudicator_flags_for_human():
    """With no adjudicator injected, gray-zone cases fall back to human review."""
    f = run([order("O1")],
            [payment("p1", "O1", net=976.4 - 8.0)],
            [bank("b1", 976.4 - 8.0, "setl_1")])
    r = only(f, "O1")
    assert r["tier"] == schema.TIER_FALLBACK
    assert r["predicted_status"] == schema.STATUS_EXCEPTION


def test_within_tolerance_is_a_match_not_an_exception():
    # A ~1 rupee amount rounding difference is within the heuristic tolerance
    # band (<= tol_heuristic) and should reconcile cleanly, not be flagged.
    f = run([order("O1", amount=1000.0)],
            [payment("p1", "O1", amount=1001.0, fee=20.02, tax=3.6, net=977.38)],
            [bank("b1", 977.38, "setl_1")])
    r = only(f, "O1")
    assert r["predicted_status"] == schema.STATUS_MATCHED
    assert r["tier"] in (schema.TIER_DETERMINISTIC, schema.TIER_HEURISTIC)


# --------------------------------------------------------------------------- #
# End-to-end on generated data: the held-out guarantees we advertise
# --------------------------------------------------------------------------- #
def test_generated_pipeline_has_no_false_negatives():
    ds = datagen.generate(n_orders=150, exception_rate=0.30, seed=1337)
    f = run(list(ds.orders.to_dict("records")),
            list(ds.payments.to_dict("records")),
            list(ds.bank.to_dict("records")))
    res = evaluate.evaluate(f, ds.ground_truth)
    # The metric a finance controller cares about most: never miss a real one.
    assert res["detection"]["recall"] == 1.0
    # And every miss must be a conservative fallback, never a silent wrong call.
    merged = res["merged"]
    misses = merged[merged["label"] != merged["predicted_exception"]]
    assert (misses["tier"] == schema.TIER_FALLBACK).all()


def test_datagen_is_reproducible():
    a = datagen.generate(seed=7)
    b = datagen.generate(seed=7)
    pd.testing.assert_frame_equal(a.orders, b.orders)
    pd.testing.assert_frame_equal(a.payments, b.payments)


def test_config_tolerances_are_held_out_constants():
    # Guard against someone tuning tolerances to the test seed.
    cfg = EngineConfig()
    assert cfg.tol_exact < cfg.tol_heuristic < cfg.ambiguity_high


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
