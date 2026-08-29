"""Honest, held-out evaluation for CloseLoop.

We join the engine's findings against ground truth and report:
  - detection metrics  : exception vs clean (precision / recall / F1)
  - classification     : per-exception-type precision / recall / F1 + macro
  - a full confusion matrix over every label

No sklearn dependency — the maths is short and being able to show it plainly is
part of the point. All metrics are meant to be run on a *held-out* dataset the
engine's tolerances were never tuned against.
"""
from __future__ import annotations

import pandas as pd

from . import schema


def _prf(tp: int, fp: int, fn: int) -> dict:
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    return {"precision": round(precision, 4), "recall": round(recall, 4),
            "f1": round(f1, 4), "tp": tp, "fp": fp, "fn": fn}


def evaluate(findings: pd.DataFrame, ground_truth: pd.DataFrame) -> dict:
    # Align on entity identity. Left-join truth <- predictions.
    merged = ground_truth.merge(
        findings[["entity_type", "entity_id", "predicted_status",
                  "predicted_exception", "tier", "confidence"]],
        on=["entity_type", "entity_id"], how="left",
    )
    # Any truth entity with no finding counts as "predicted clean/matched".
    merged["predicted_exception"] = merged["predicted_exception"].fillna(schema.EXC_NONE)
    merged["predicted_status"] = merged["predicted_status"].fillna(schema.STATUS_MATCHED)

    merged["true_is_exc"] = merged["label"] != schema.EXC_NONE
    merged["pred_is_exc"] = merged["predicted_status"] == schema.STATUS_EXCEPTION

    # -- Detection (binary) ------------------------------------------------- #
    tp = int(((merged.true_is_exc) & (merged.pred_is_exc)).sum())
    fp = int(((~merged.true_is_exc) & (merged.pred_is_exc)).sum())
    fn = int(((merged.true_is_exc) & (~merged.pred_is_exc)).sum())
    tn = int(((~merged.true_is_exc) & (~merged.pred_is_exc)).sum())
    detection = _prf(tp, fp, fn)
    detection["accuracy"] = round((tp + tn) / len(merged), 4) if len(merged) else 0.0
    detection["tn"] = tn

    # -- Per-class classification ------------------------------------------ #
    per_class = {}
    macro = {"precision": 0.0, "recall": 0.0, "f1": 0.0}
    present = 0
    for cls in schema.ALL_EXCEPTIONS:
        ctp = int(((merged.label == cls) & (merged.predicted_exception == cls)).sum())
        cfp = int(((merged.label != cls) & (merged.predicted_exception == cls)).sum())
        cfn = int(((merged.label == cls) & (merged.predicted_exception != cls)).sum())
        support = int((merged.label == cls).sum())
        if support == 0 and (ctp + cfp) == 0:
            continue
        m = _prf(ctp, cfp, cfn)
        m["support"] = support
        per_class[cls] = m
        macro["precision"] += m["precision"]
        macro["recall"] += m["recall"]
        macro["f1"] += m["f1"]
        present += 1
    if present:
        macro = {k: round(v / present, 4) for k, v in macro.items()}

    # -- Overall type accuracy on the true exceptions ---------------------- #
    true_exc = merged[merged.true_is_exc]
    type_acc = round(
        (true_exc.label == true_exc.predicted_exception).mean(), 4
    ) if len(true_exc) else 0.0

    # -- Confusion matrix (label -> predicted) ----------------------------- #
    confusion = pd.crosstab(merged["label"], merged["predicted_exception"],
                            dropna=False)

    # -- Match rate & tier usage ------------------------------------------- #
    n = len(merged)
    match_rate = round((merged.predicted_status == schema.STATUS_MATCHED).mean(), 4) if n else 0.0
    tier_counts = findings["tier"].value_counts().to_dict()

    return {
        "n_entities": n,
        "detection": detection,
        "classification_macro": macro,
        "per_class": per_class,
        "exception_type_accuracy": type_acc,
        "match_rate": match_rate,
        "tier_usage": tier_counts,
        "confusion_matrix": confusion,
        "merged": merged,
    }


def format_report(result: dict) -> str:
    d = result["detection"]
    lines = []
    lines.append("=" * 66)
    lines.append("  CloseLoop - Held-out Evaluation Report")
    lines.append("=" * 66)
    lines.append(f"Entities evaluated : {result['n_entities']}")
    lines.append(f"Match rate         : {result['match_rate']:.1%}")
    lines.append("")
    lines.append("EXCEPTION DETECTION (exception vs clean)")
    lines.append(f"  precision {d['precision']:.3f} | recall {d['recall']:.3f} | "
                 f"F1 {d['f1']:.3f} | accuracy {d['accuracy']:.3f}")
    lines.append(f"  TP {d['tp']}  FP {d['fp']}  FN {d['fn']}  TN {d['tn']}")
    lines.append("")
    m = result["classification_macro"]
    lines.append("EXCEPTION CLASSIFICATION (per type)")
    lines.append(f"  macro  precision {m['precision']:.3f} | recall {m['recall']:.3f} | F1 {m['f1']:.3f}")
    lines.append(f"  type accuracy on true exceptions: {result['exception_type_accuracy']:.3f}")
    lines.append(f"  {'type':<24}{'prec':>6}{'rec':>7}{'f1':>7}{'supp':>6}")
    for cls, mm in result["per_class"].items():
        lines.append(f"  {cls:<24}{mm['precision']:>6.2f}{mm['recall']:>7.2f}"
                     f"{mm['f1']:>7.2f}{mm['support']:>6}")
    lines.append("")
    lines.append(f"TIER USAGE: {result['tier_usage']}")
    lines.append("=" * 66)
    return "\n".join(lines)
