"""The signature metric: rules-only baseline vs. LLM-assisted, same held-out set.

This is the number that proves the Tier-3 Gemini adjudicator adds *measurable*
value — and, just as importantly, documents the residual cases it still gets
wrong. It runs the identical dataset through the engine twice:

  1. RULES ONLY   — Tier-3 = the conservative human-flag fallback.
  2. LLM ASSISTED — Tier-3 = Gemini, with the same fallback on failure.

Then prints a before/after table and the honest residual misses.

    python scripts/run_eval.py                 # uses GEMINI_API_KEY if present
    python scripts/run_eval.py --seed 2024     # a different held-out seed

Without a key, the "LLM assisted" column equals the baseline (every gray-zone
case falls back to human) and the script says so — the system still runs.
Get a free key at https://aistudio.google.com/apikey (no billing required).
"""
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from closeloop import datagen, evaluate  # noqa: E402
from closeloop.adjudicator import LLMAdjudicator  # noqa: E402
from closeloop.engine import ReconciliationEngine  # noqa: E402


def _run(ds, adjudicator):
    engine = ReconciliationEngine(adjudicator=adjudicator)
    findings = engine.run(ds.orders, ds.payments, ds.bank)
    return evaluate.evaluate(findings, ds.ground_truth)


def _row(label, res):
    d = res["detection"]
    m = res["classification_macro"]
    return (f"  {label:<16}"
            f"{d['precision']:>8.3f}{d['recall']:>8.3f}{d['f1']:>8.3f}"
            f"{d['accuracy']:>10.3f}{m['f1']:>10.3f}{res['match_rate']:>10.1%}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--n", type=int, default=150)
    ap.add_argument("--rate", type=float, default=0.30)
    args = ap.parse_args()

    ds = datagen.generate(n_orders=args.n, exception_rate=args.rate, seed=args.seed)

    baseline = _run(ds, adjudicator=None)  # human-flag fallback

    cache = os.path.join(ROOT, "data", "llm_cache.json")
    adj = LLMAdjudicator(cache_path=cache)
    llm = _run(ds, adjudicator=adj)

    print("=" * 78)
    print("  CloseLoop — Baseline vs. LLM-assisted (held-out seed "
          f"{args.seed}, {baseline['n_entities']} entities)")
    print("=" * 78)
    print(f"  {'variant':<16}{'det.P':>8}{'det.R':>8}{'det.F1':>8}"
          f"{'acc':>10}{'macroF1':>10}{'match':>10}")
    print("-" * 78)
    print(_row("rules-only", baseline))
    print(_row("+ Gemini T3", llm))
    print("-" * 78)

    lift = llm["detection"]["f1"] - baseline["detection"]["f1"]
    acc_lift = llm["detection"]["accuracy"] - baseline["detection"]["accuracy"]
    print(f"  detection F1 lift : {lift:+.3f}    accuracy lift : {acc_lift:+.3f}")
    print(f"  Gemini usage      : {adj.stats}")
    if not adj.available:
        print("  NOTE: GEMINI_API_KEY not set — Tier-3 fell back to human review, "
              "so\n        the LLM column equals the baseline by design. Set the free "
              "key\n        (https://aistudio.google.com/apikey) to see the lift.")

    # Honest residual misses under the LLM-assisted run.
    merged = llm["merged"]
    misses = merged[merged["label"] != merged["predicted_exception"]]
    print(f"\n  RESIDUAL MISSES after Tier-3 ({len(misses)} of {len(merged)}):")
    if len(misses) == 0:
        print("    (none — every entity classified correctly)")
    for _, r in misses.iterrows():
        print(f"    {r['entity_id']:<10} true={r['label']:<20} "
              f"pred={r['predicted_exception']:<20} "
              f"subtype={str(r.get('subtype','')):<15} tier={r['tier']}")
    print("=" * 78)


if __name__ == "__main__":
    main()
