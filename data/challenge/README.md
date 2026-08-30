# Adversarial Challenge Suite

An **independent, hand-authored** reconciliation test set — the answer to the
sharpest question a judge can ask:

> *"How do we know your generated data isn't too convenient for your algorithm?"*

Unlike `data/generated/` (produced by `src/closeloop/datagen.py`), **every case
here is written by hand** in [`scripts/build_challenge.py`](../../scripts/build_challenge.py)
to deliberately attack a specific assumption the engine makes. The engine's
tolerances were **never tuned against these cases**, and we report exactly which
ones it gets wrong.

## Run it

```bash
python scripts/run_challenge.py            # rules-only baseline
python scripts/run_challenge.py --use-llm  # with the Gemini Tier-3 adjudicator
```

To regenerate the frozen CSVs after editing the cases:

```bash
python scripts/build_challenge.py
```

## Files

| File | What it is |
|---|---|
| `orders.csv` | Internal ledger (same schema as production) |
| `razorpay_payments.csv` | PSP capture/settlement report |
| `bank_statement.csv` | Bank credits and debits |
| `ground_truth.csv` | The correct answer for every scored entity |
| `challenge_manifest.csv` | Each case's category, trap, design intent, and description |

The `design` column in the manifest tags each case as:

- **deterministic** — the engine should get this right (robustness checks & controls),
- **gray-zone** — inside a tolerance band; rules can only *route* it, not assert it,
- **adversarial-gap** — deliberately built to break a rule assumption (an honest miss).

## What it tests

Partial settlements · duplicate transaction IDs (incl. idempotent-retry same-ID) ·
near-identical amounts · delayed vs. genuinely missing settlements · incorrect fee
calculations (incl. wrong GST base) · FX / sub-rupee rounding ambiguity · refunds
crossing settlement cycles (incl. refunds that look like chargebacks) · chargebacks
after reconciliation (incl. debits without a payment reference) · bank credits with
confusing / case-mismatched references.

## Why the score is *lower* here — and why that's the point

On this suite the rules-only baseline scores **21/30 (detection F1 ≈ 0.71)** vs.
**F1 ≈ 0.92** on the generated held-out set. That gap is the credibility: the
suite is genuinely harder than our own data, and `run_challenge.py` names every
trap the rules miss. Those misses are the FX / timing / idempotency cases that are
exactly what the Gemini Tier-3 tier is built to resolve — measure the lift with
`--use-llm`.
