# CloseLoop — AI Finance Controller

> An AI finance controller that **closes the reconciliation loop** across a
> merchant's order ledger, Razorpay settlement reports, and their bank statement
> — with **measured accuracy on a held-out test set**, an **honest exception
> list**, a **full audit trail**, and **bounded execution** (it recommends, it
> never auto-posts to a ledger).

*Razorpay AI Buildathon 2026 · Track: AI Finance Controller*

---

## The problem

A Razorpay merchant has three records that must agree every day:

1. **Internal order ledger** — what they think they sold.
2. **Razorpay settlement/payment report** — what the PSP actually captured, its
   fees and tax, and what it settled.
3. **Bank statement** — the money that actually landed (or got reversed).

In reality these never perfectly agree — fees drift, settlements go missing,
refunds don't sync, chargebacks reverse money, duplicate charges slip through,
orphan credits appear. A human finance controller spends hours chasing this.
CloseLoop automates that controller.

## What it does

1. **Reconciles** all three sources three ways, matching everything it
   confidently can.
2. **Classifies exceptions** into an 8-type taxonomy, each with a plain-English
   reason and a confidence.
3. **Answers questions** in natural language over the reconciled data — the
   **Settlement Q&A agent**, grounded with citations to the underlying records.
4. **Logs every decision** (which tier decided, confidence, evidence, timestamp)
   to a queryable SQLite audit trail — and **never mutates a ledger**.

## Why it's built this way — the tiered controller

> *Use the cheapest tool that can be right.* The LLM never touches what a
> deterministic rule can settle for free. **This is the "appropriate AI use"
> story.**

```
 3 sources ─▶  TIER 1  DETERMINISTIC   exact ids + zero-diff, clear breaks  ─▶ certain
 (ledger,      TIER 2  HEURISTIC       tolerance rules (rounding / FX / T+1) ─▶ high-conf
  PSP report,  TIER 3  LLM (Gemini)    ONLY residual gray-zone cases         ─▶ adjudicated
  bank stmt)   FALLBACK                LLM down / low-confidence → human      ─▶ never silently wrong
```

Every entity produces exactly one **Finding**
`{entity, predicted_status, predicted_exception, tier, confidence, reason, evidence}`.
Metrics, the exception report, the dashboard, and the audit log are all built
from that one stream.

---

## Quickstart

### Option A — one command (Docker)

```bash
docker compose up --build
# backend  → http://localhost:8000  (API docs at /docs)
# dashboard → http://localhost:5173
```

The system runs **with no API key** — Tier-3 and the Q&A agent degrade
gracefully to a human-review fallback. To enable the Gemini tiers, copy
`.env.example` to `.env` and set `GEMINI_API_KEY` before `docker compose up`.
Gemini's **free tier** is enough — no billing is required.

### Option B — run locally

**Backend (Python 3.10+):**

```bash
pip install -r requirements.txt

# 1) End-to-end pipeline with held-out metrics (no key needed)
python scripts/run_pipeline.py

# 2) The signature metric: rules-only baseline vs. LLM-assisted, same held-out set
python scripts/run_eval.py

# 3) Score against the INDEPENDENT hand-authored adversarial challenge suite
python scripts/run_challenge.py            # add --use-llm to measure the Tier-3 lift

# 4) Serve the API
uvicorn closeloop.api:app --app-dir src --reload --port 8000
```

**Frontend (Node 18+):**

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173  (proxies/points to :8000)
```

**Tests:**

```bash
pip install pytest
pytest -q
```

### Enabling the Gemini tiers (free)

CloseLoop calls **Google Gemini** through its OpenAI-compatible endpoint. The
**free tier** covers this project end to end — **no billing required**. Grab a
key at <https://aistudio.google.com/apikey>, then:

```bash
cp .env.example .env
# edit .env and set:
#   GEMINI_API_KEY=...        # free key from Google AI Studio
```

Verdicts are cached to `data/llm_cache.json`, so re-running the eval is
reproducible and free after the first pass. The LLM layer is provider-agnostic
(OpenAI-compatible) — you can point `LLM_BASE_URL` / `CLOSELOOP_MODEL` at any
compatible provider (e.g. Groq, or a local Ollama) instead.

---

## What the numbers look like (held-out, seed 1337, 154 entities)

Rules-only baseline (`python scripts/run_pipeline.py`):

| Metric | Value |
|---|---|
| Exception detection precision | **0.860** |
| Exception detection recall | **1.000** — zero real exceptions missed |
| Detection F1 | **0.924** |
| Classification macro-F1 | **0.924** |
| Match rate | **63.0%** |
| Auto-reconciled hands-off | **~₹2.09L (60% of ledger value)** |
| Surfaced as at-risk for review | **~₹1.39L** |

**All 8 misses are conservative false positives**, every one routed to
`FALLBACK` (human review) at low confidence — the system is never *silently*
wrong. Those misses are the deliberately-injected gray-zone clean cases
(`clean_fx_noise`, `clean_timing`) that are inseparable by rule magnitude alone
— precisely the slot the Gemini Tier-3 adjudicator is built to resolve. Run
`scripts/run_eval.py` with a (free) key set to see the before/after lift.

> This is a *believable, honest* baseline **by design** (see
> [ARCHITECTURE.md](ARCHITECTURE.md) §Data strategy) — not a suspicious 100%.

### Independent adversarial challenge suite

*"How do we know the generated data isn't too convenient for the algorithm?"* —
so we also score against a **separate, hand-authored, adversarial suite** the
engine's tolerances were **never tuned against** (`python scripts/run_challenge.py`).
The 30 cases in [`data/challenge/`](data/challenge/) are written by hand — not by
the generator — to deliberately break specific assumptions: partial captures on
the tolerance boundary, idempotent-retry duplicates (same `payment_id` twice),
settlement timing vs. genuine loss, FX drift that mimics a fee error, refunds
that look like chargebacks, chargebacks with the "wrong" narration, and bank
credits with case-mismatched references.

| On the adversarial suite (rules-only) | Value |
|---|---|
| Cases correct | **21 / 30 (70%)** |
| Detection F1 | **0.71** (vs. 0.92 on generated data) |
| Deliberate "break-our-assumptions" gaps | **9**, each reported by name |

The point is the **gap**: the score is honestly *lower* than on our own data, and
the script prints exactly which traps the rules miss — the FX/timing/idempotency
cases that are precisely what the Gemini Tier-3 tier exists to resolve
(`run_challenge.py --use-llm`). A suite the engine aces would prove nothing; one
that exposes its edges is the credible test. See
[`data/challenge/README.md`](data/challenge/README.md).

### The reconciliation-loop visual

The dashboard leads with a **money-flow waterfall** — every rupee followed
`Orders → Captured → Settled → Bank-confirmed`, ending in the one split a finance
lead cares about: **~₹2.09L auto-reconciled hands-off vs. ~₹1.39L surfaced for
review**. Every figure is live from the engine, not hardcoded (backend
`business_impact.flow`).

---

## API

`uvicorn closeloop.api:app --app-dir src` exposes (full schema at `/docs`):

| Method | Path | Purpose |
|---|---|---|
| POST | `/reconcile` | Run the pipeline on a seed; returns metrics + summary |
| GET | `/metrics` | KPIs, per-class accuracy, tier usage, business impact, error analysis |
| GET | `/findings` | The full finding stream for the current run |
| GET | `/exceptions` | Only the flagged exceptions (the honest exception list) |
| GET | `/entity/{id}` | Full drill-down: order + payment(s) + bank rows + finding + audit trail |
| GET | `/audit/runs` · `/audit/decisions` | The queryable audit trail |
| POST | `/ask` | Settlement Q&A agent (grounded answer + citations) |
| GET | `/health` | Liveness + whether the Gemini tiers are configured |

---

## Repository layout

```
razorpay/
├── README.md · ARCHITECTURE.md · PROJECT_PLAN.md
├── requirements.txt · .env.example · Dockerfile · docker-compose.yml
├── src/closeloop/
│   ├── schema.py        exception taxonomy + tier/status constants
│   ├── datagen.py       seeded synthetic data + ground-truth labels
│   ├── engine.py        tiered reconciliation engine (Tier 1/2/3 + fallback)
│   ├── adjudicator.py   Gemini Tier-3 adjudicator (cached, with strict fallback)
│   ├── llm.py           LLM provider config (Gemini via OpenAI-compatible API)
│   ├── qa_agent.py      Settlement Q&A agent (tool-use, grounded, cited)
│   ├── audit.py         SQLite audit trail
│   ├── evaluate.py      held-out metrics (P/R/F1, confusion matrix)
│   └── api.py           FastAPI app
├── scripts/
│   ├── run_pipeline.py    end-to-end run + honest error analysis
│   ├── run_eval.py        baseline vs. LLM-assisted lift table
│   ├── build_challenge.py authors the hand-designed adversarial suite
│   └── run_challenge.py   scores the engine on that independent suite
├── frontend/            React + Vite + Tailwind dashboard (money-flow loop first)
├── tests/test_engine.py engine unit tests (regression net behind the metrics)
├── data/challenge/      frozen, committed adversarial challenge CSVs + manifest
└── data/generated/      generated CSVs, audit.db, llm_cache.json (gitignored)
```

## Data & privacy

All data is **synthetic, seeded, and ground-truth-labelled** — no real merchant
data or PII. The generator uses Razorpay-shaped fields (fees, GST-on-fee, T+1
settlement batching) so the same engine plugs into real Razorpay **test-mode**
settlement reports later. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full
design, trade-offs, and how held-out evaluation is kept honest.

