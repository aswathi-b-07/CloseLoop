# CloseLoop — Architecture

This document is the deep dive behind [README.md](README.md): the components, the
data flow, the design decisions, and the trade-offs. It maps directly onto the
Razorpay AI Buildathon judging criteria (working product, measured accuracy,
honest exception lists, compliance/bounded execution, appropriate AI use, and
failure recovery).

---

## 1. System overview

```
┌────────────────┐   HTTP    ┌───────────────────────────────────────────────┐
│  React + Vite  │◀────────▶│  FastAPI backend  (src/closeloop/api.py)         │
│  dashboard     │           │  /reconcile /metrics /findings /exceptions       │
│  (frontend/)   │           │  /entity/{id} /audit/* /ask /health              │
└────────────────┘           │                                                  │
                             │  ┌────────────────────────────────────────────┐ │
                             │  │ ReconciliationEngine (engine.py) — tiered   │ │
                             │  │  Tier 1/2 rules  +  Tier 3 adjudicator hook │─┼─▶ Gemini API
                             │  └────────────────────────────────────────────┘ │   (adjudicator.py,
                             │  ┌────────────────────────────────────────────┐ │    optional, free)
                             │  │ Settlement Q&A agent (qa_agent.py, tool-use)│─┼─▶ Gemini API
                             │  └────────────────────────────────────────────┘ │
                             │  ┌────────────────────────────────────────────┐ │
                             │  │ AuditLog (audit.py, SQLite)  ·  Evaluate    │ │
                             │  └────────────────────────────────────────────┘ │
                             └──────────────────────┬───────────────────────────┘
                                                    │
                              ┌─────────────────────┴──────────────────────┐
                              │ Synthetic data generator (datagen.py)       │
                              │  + ground-truth labels (seeded, Razorpay-   │
                              │  shaped: fees, GST-on-fee, T+1 batching)    │
                              └─────────────────────────────────────────────┘
```

**One data contract ties it all together.** Every reconcilable entity produces
exactly one `Finding`:

```python
Finding(entity_type, entity_id, predicted_status, predicted_exception,
        tier, confidence, reason, evidence)
```

Metrics, the exception report, the audit trail, the dashboard, and the Q&A
agent's tools are all views over that single finding stream. This is what keeps
the numbers and the UI provably consistent.

---

## 2. Components

| Component | File | Responsibility |
|---|---|---|
| Taxonomy | `schema.py` | 8 exception labels + status + tier constants — the shared vocabulary all modules speak. |
| Data generator | `datagen.py` | Seeded synthetic ledger + Razorpay-shaped payments + bank statement **+ ground truth**. Reproducible. |
| Engine | `engine.py` | The tiered controller. Deterministic + heuristic rules; routes only the residue to a pluggable adjudicator. |
| Adjudicator | `adjudicator.py` | Tier-3 Gemini call for gray-zone cases. Structured JSON verdict, verdict cache, strict fallback. |
| LLM provider | `llm.py` | Provider config — Gemini via its OpenAI-compatible endpoint (free tier); swappable to any OpenAI-compatible backend via env. |
| Q&A agent | `qa_agent.py` | Read-only tool-use agent answering NL questions over the reconciled data, with citations. |
| Audit log | `audit.py` | SQLite trail: one row per decision, keyed by run, queryable by entity/tier. |
| Evaluation | `evaluate.py` | Held-out detection + per-class P/R/F1, macro scores, confusion matrix, tier usage, match rate. |
| API | `api.py` | FastAPI surface + in-memory current-run state; wires engine + adjudicator + audit + Q&A. |
| Dashboard | `frontend/` | React + Vite + Tailwind demo UI (KPIs, exceptions, drill-down, Q&A, error analysis). |

---

## 3. The tiered engine — "cheapest tool that can be right"

The engine reconciles each order across the three sources and emits one finding.
For each amount/fee dimension it bands the discrepancy:

- `≤ tol_exact (0.01)` → **Tier 1 deterministic** exact match.
- `≤ tol_heuristic (2.0)` (amount) → **Tier 2 heuristic** tolerated rounding/FX.
- gray band (up to `ambiguity_high`) → **Tier 3** — routed to the adjudicator.
- `> ambiguity_high` → **Tier 1 deterministic** clear break (unambiguous exception).

Clear structural exceptions (missing payment, duplicate capture, refund not
reflected, chargeback debit in the bank, orphan bank credit) are settled
deterministically with confidence 1.0. Only the genuinely magnitude-ambiguous
residue (a small net gap that could be a fee error *or* FX noise; an absent bank
credit that could be a real miss *or* T+1 timing) reaches Tier 3.

**Why this matters:** the LLM is invoked on a handful of cases per run, not on
all 150+ entities. That is *appropriate* AI use — and it's measurable: the tier
usage counts are reported in `/metrics` and shown on the dashboard.

### Bounded execution (compliance)

The engine has no write path to any ledger. It classifies and **recommends**.
A human approves. This is enforced structurally — there is simply no mutation
API — and every recommendation is logged (see §6).

---

## 4. Tier-3 adjudicator (Gemini) — justified *and* bounded

`adjudicator.py` implements the `(case) -> verdict` contract the engine's
`_route` expects.

- **Justified:** it resolves gray-zone cases that rules cannot separate by
  magnitude, and its value is *proven* by the baseline-vs-LLM lift on the
  identical held-out set (`scripts/run_eval.py`).
- **Bounded:** it sees only the residual case (not the dataset); it returns a
  **structured JSON verdict** (`clean`, `exception`, `confidence`, `reason`)
  validated against a strict schema; it can only classify — never mutate.
- **Graceful failure (three layers):**
  1. No API key / SDK missing → conservative human-flag fallback.
  2. API error / timeout / off-taxonomy response → caught → human-flag fallback.
  3. Verdict below the confidence floor (`min_confidence`, default 0.60) →
     downgraded to `FALLBACK` and routed to a human, preserving the model's note.
- **Reproducible & cheap:** every verdict is cached to `data/llm_cache.json`,
  keyed by a content hash of the case, so eval re-runs are deterministic and free.

Model: `gemini-3.6-flash` by default (override with `CLOSELOOP_MODEL`), called
via the **Google Gemini free tier** through its OpenAI-compatible endpoint (the
stock `openai` SDK) with JSON-object structured output. No billing is required
to run the project. The provider is swappable: point `LLM_BASE_URL` at any
OpenAI-compatible backend (e.g. Groq or a local Ollama) without code changes.

---

## 5. Settlement Q&A agent

`qa_agent.py` is a read-only tool-use agent. The model is given three query tools —
`get_metrics_summary`, `list_exceptions`, `get_entity` — and must call them to
gather the exact records it needs before answering. Every record it touches is
captured as a **citation** returned alongside the answer, so the dashboard can
link each claim back to the underlying order/payment/bank row. No key → the
endpoint returns a grounded exception summary instead of failing.

This keeps the NL surface honest: it cannot invent numbers because it only ever
reports what the tools returned, and the user can verify every cited entity.

---

## 6. Audit trail (SQLite)

`audit.py` writes one `runs` row and one `decisions` row per finding per run.
Each decision records the tier, confidence, reason, and JSON evidence, with a
UTC timestamp. `/audit/runs`, `/audit/decisions`, and the per-entity
`audit_trail` in `/entity/{id}` expose it. This is the compliance evidence: any
recommendation the controller ever made can be replayed and defended.

Zero-config (a file that ships in the repo working dir), no network, no secrets
in the log.

---

## 7. Data strategy — why the metrics are credible

- **Synthetic, seeded, ground-truth-labelled.** For every entity we know the
  correct label, so precision/recall are honest, not hand-waved. Seeding makes
  the dataset reproducible.
- **Held-out evaluation.** Engine tolerances (`EngineConfig`) are fixed
  constants, independent of the test seed — a unit test guards this — so the
  reported numbers are genuinely out-of-sample, not tuned to the test set.
- **Deliberate gray-zone difficulty.** A slice of otherwise-clean orders are
  injected with FX/rounding drift (`clean_fx_noise`) or next-cycle settlement
  timing (`clean_timing`), with deltas that overlap the real fee-error band on
  purpose. Rules *cannot* separate these by magnitude, which is why the baseline
  is a believable ~0.92 F1 with documented misses rather than a suspicious 1.0.
- **The signature metric.** `scripts/run_eval.py` runs the same held-out set
  twice — rules-only vs. Gemini-assisted — and prints the before/after lift plus
  the residual misses that remain. That contrast is the core evidence that the
  LLM tier earns its place.
- **The money metric.** `/metrics.business_impact` reports rupees
  auto-reconciled hands-off vs. rupees surfaced as at-risk — the number to lead
  a pitch with.

---

## 8. Tech stack & trade-offs

| Layer | Choice | Why / trade-off |
|---|---|---|
| Core | Python 3.10+, pandas | Transparent tabular reconciliation; pandas keeps the rules readable and auditable vs. a DB-heavy approach. |
| API | FastAPI + Uvicorn | Typed, async, auto-docs at `/docs`; reads as production-grade with little code. |
| LLM | Google Gemini (free tier) via OpenAI-compatible API, structured output + tool use | Strong at reasoning + JSON; free to run; used *only* where rules can't decide. Soft dependency — absence degrades, never breaks. Provider-swappable via env. |
| Storage | SQLite | Zero-config audit trail that ships in the repo. Trade-off: single-process; a real deployment would use Postgres. |
| Frontend | React + Vite + Tailwind | Fast dev, clean single-page dashboard = the visual demo. |
| Packaging | Docker + docker-compose | "Any dev can run it" — the submission requirement. |
| CI | GitHub Actions | Runs tests + the held-out pipeline on every push — engineering-maturity signal. |

### Known limitations / what we'd do with more time

- Synthetic data only (by track design); next step is ingesting real Razorpay
  test-mode settlement reports through the same `Finding` contract.
- In-memory current-run state in the API (fine for a single-process demo; a real
  deployment would persist runs and add auth/multitenancy).
- SQLite + single Uvicorn worker; production would need Postgres, TLS, secrets
  management, and encryption at rest (the audit log holds no PII today).
- The Q&A agent uses a manual tool loop capped at a few iterations; a production
  version would add streaming and richer tools (time-series, forecasting).

---

## 9. How this maps to the judging rubric

| Criterion | Where it lives |
|---|---|
| Working product solving the problem | End-to-end: `run_pipeline.py`, the API, the dashboard. |
| Measured accuracy on held-out set | `evaluate.py`, `run_eval.py`, `/metrics`. |
| Honest exception list | `/exceptions`, the error-analysis panel, documented residual misses. |
| Compliance & bounded execution | No ledger writes; recommend-only; every decision gated + logged. |
| Audit trail | `audit.py` + `/audit/*` + per-entity trail. |
| Graceful failure recovery | Three-layer adjudicator fallback; Q&A degraded mode; engine robust to empty sources. |
| Appropriate AI use | Tiered design; LLM only on residual gray-zone + Q&A; proven with the lift metric. |
