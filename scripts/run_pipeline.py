"""End-to-end backbone run: generate a HELD-OUT dataset, reconcile it, and
report honest metrics — no API key required.

    python scripts/run_pipeline.py

The engine's tolerances live in EngineConfig and are fixed independently of the
test seed, so the metrics below are genuinely held-out.
"""
import os
import sys

# Make `src/` importable without installing the package.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

from closeloop import datagen, evaluate  # noqa: E402
from closeloop.engine import ReconciliationEngine  # noqa: E402


def main():
    out_dir = os.path.join(ROOT, "data", "generated")

    # Held-out test set: a seed the engine was never tuned against.
    ds = datagen.generate(n_orders=150, exception_rate=0.30, seed=1337)
    ds.to_csv_dir(out_dir)
    print(f"[data] generated -> {out_dir}")
    print("[data] ground-truth label distribution:")
    print(ds.ground_truth["label"].value_counts().to_string())
    print()

    engine = ReconciliationEngine()
    findings = engine.run(ds.orders, ds.payments, ds.bank)
    findings_path = os.path.join(out_dir, "findings.csv")
    findings.to_csv(findings_path, index=False)
    print(f"[engine] {len(findings)} findings -> {findings_path}\n")

    result = evaluate.evaluate(findings, ds.ground_truth)
    print(evaluate.format_report(result))

    print("\nCONFUSION MATRIX (rows = truth, cols = predicted):")
    print(result["confusion_matrix"].to_string())

    # Honest error analysis — the misses, with their difficulty subtype. This is
    # the material for the video's "What Failed / Lessons Learned" beat.
    merged = result["merged"]
    misses = merged[merged["label"] != merged["predicted_exception"]]
    print(f"\nERROR ANALYSIS  ({len(misses)} misclassified of {len(merged)}):")
    if len(misses) == 0:
        print("  (none)")
    for _, r in misses.iterrows():
        print(f"  {r['entity_id']:<10} true={r['label']:<22} "
              f"pred={r['predicted_exception']:<22} "
              f"subtype={str(r.get('subtype','')):<16} tier={r['tier']}")
    print("\nNOTE: this is the RULES-ONLY baseline (Tier-3 = human-flag fallback).")
    print("      The Gemini adjudicator is expected to resolve the gray-zone")
    print("      clean_fx_noise / clean_timing misses -> measurable lift.")

    # Exception report: the honest list of what needs human attention.
    exceptions = findings[findings["predicted_status"] == "EXCEPTION"]
    exc_path = os.path.join(out_dir, "exception_report.csv")
    exceptions.to_csv(exc_path, index=False)
    print(f"\n[report] {len(exceptions)} exceptions flagged -> {exc_path}")

    # Business ("money") metric — the single number to put in front of judges.
    of = findings[findings["entity_type"] == "ORDER"].merge(
        ds.orders, left_on="entity_id", right_on="order_id", how="left")
    reconciled = of.loc[of["predicted_status"] == "MATCHED", "amount"].sum()
    at_risk = of.loc[of["predicted_status"] == "EXCEPTION", "amount"].sum()
    total = reconciled + at_risk
    print("\nBUSINESS IMPACT")
    print(f"  Ledger value processed : Rs {total:,.2f}")
    print(f"  Auto-reconciled        : Rs {reconciled:,.2f} "
          f"({reconciled/total:.1%} of value, hands-off)")
    print(f"  Surfaced as at-risk    : Rs {at_risk:,.2f} "
          f"({at_risk/total:.1%}) routed to review instead of leaking silently")


if __name__ == "__main__":
    main()
