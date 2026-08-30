"""Score CloseLoop against the INDEPENDENT ADVERSARIAL CHALLENGE SUITE.

This is the answer to "how do we know your generated data isn't too convenient
for your algorithm?" — the cases in data/challenge/ are hand-authored (see
scripts/build_challenge.py), the engine's tolerances were never tuned against
them, and we report exactly which ones the engine gets wrong.

    python scripts/run_challenge.py            # rules-only baseline
    python scripts/run_challenge.py --use-llm  # with the Gemini Tier-3 adjudicator

The suite is a frozen, inspectable artefact (committed CSVs); this script only
reads it. Regenerate it with scripts/build_challenge.py if you edit the cases.
"""
import argparse
import os
import sys

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

from closeloop import evaluate  # noqa: E402
from closeloop.engine import ReconciliationEngine  # noqa: E402

CH_DIR = os.path.join(ROOT, "data", "challenge")


def _load():
    def rd(name):
        path = os.path.join(CH_DIR, name)
        if not os.path.exists(path):
            sys.exit(f"[challenge] missing {path}\n"
                     f"           run: python scripts/build_challenge.py")
        # Keep ids/refs as strings so exact-match semantics match production.
        return pd.read_csv(path, dtype=str, keep_default_na=False)

    orders = rd("orders.csv")
    payments = rd("razorpay_payments.csv")
    bank = rd("bank_statement.csv")
    truth = rd("ground_truth.csv")
    manifest = rd("challenge_manifest.csv")
    # Numeric coercion for the columns the engine does arithmetic on.
    for col in ("amount", "fee", "tax", "net_amount"):
        if col in payments:
            payments[col] = pd.to_numeric(payments[col], errors="coerce")
    orders["amount"] = pd.to_numeric(orders["amount"], errors="coerce")
    bank["amount"] = pd.to_numeric(bank["amount"], errors="coerce")
    return orders, payments, bank, truth, manifest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--use-llm", action="store_true",
                    help="route gray-zone cases to the Gemini adjudicator")
    args = ap.parse_args()

    orders, payments, bank, truth, manifest = _load()

    adjudicator = None
    if args.use_llm:
        try:
            from closeloop.adjudicator import LLMAdjudicator
            adj = LLMAdjudicator(cache_path=os.path.join(ROOT, "data", "llm_cache.json"))
            adjudicator = adj if adj.available else None
            if adjudicator is None:
                print("[challenge] no Gemini key wired — falling back to rules-only.\n")
        except Exception as e:  # pragma: no cover - defensive
            print(f"[challenge] LLM unavailable ({e}); rules-only.\n")

    engine = ReconciliationEngine(adjudicator=adjudicator)
    findings = engine.run(orders, payments, bank)
    result = evaluate.evaluate(findings, truth)

    mode = "RULES + GEMINI TIER-3" if adjudicator else "RULES-ONLY BASELINE"
    print("=" * 72)
    print(f"  CloseLoop - ADVERSARIAL CHALLENGE SUITE   [{mode}]")
    print("  Hand-authored, held-out, deliberately breaks our assumptions")
    print("=" * 72)
    print(evaluate.format_report(result).split("\n", 2)[2])  # reuse body, own title

    # -- Per-case ledger: truth vs prediction, tagged with the trap ---------- #
    merged = result["merged"].merge(
        manifest[["entity_id", "category", "trap", "design", "description"]],
        on="entity_id", how="left")
    merged["correct"] = merged["label"] == merged["predicted_exception"]
    n_ok = int(merged["correct"].sum())
    n = len(merged)

    print(f"\nPER-CASE OUTCOME  ({n_ok}/{n} correct = {n_ok / n:.1%})")
    print(f"  {'':<3}{'entity':<15}{'trap':<32}{'truth':<22}{'predicted':<22}")
    for _, r in merged.sort_values(["design", "entity_id"]).iterrows():
        mark = "OK " if r["correct"] else "XX "
        print(f"  {mark}{r['entity_id']:<15}{str(r['trap']):<32}"
              f"{r['label']:<22}{r['predicted_exception']:<22}")

    # -- Honest gap analysis: the cases we designed to be hard --------------- #
    gaps = merged[merged["design"] == "adversarial-gap"]
    gap_ok = int(gaps["correct"].sum())
    print(f"\nADVERSARIAL-GAP CASES  ({gap_ok}/{len(gaps)} handled) - the ones built "
          f"to break assumptions:")
    for _, r in gaps.iterrows():
        status = "resolved " if r["correct"] else "MISSED   "
        print(f"  [{status}] {r['entity_id']} | {r['trap']}")
        print(f"              {r['description']}")

    misses = merged[~merged["correct"]]
    print(f"\nHONEST SUMMARY: {len(misses)} of {n} cases missed by this configuration.")
    if adjudicator is None:
        print("  Several misses are gray-zone FX/timing/idempotency cases the "
              "rules-only\n  baseline cannot resolve — exactly what the Gemini "
              "Tier-3 tier exists for.\n  Re-run with --use-llm to measure the lift.")
    print("=" * 72)


if __name__ == "__main__":
    main()
