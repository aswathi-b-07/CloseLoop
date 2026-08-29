# CloseLoop — AI Finance Controller
### Razorpay AI Buildathon 2026 · Full Project Overview & Plan

> *"An AI Finance Controller that closes the reconciliation loop across Razorpay settlements, the internal order ledger, and the bank — with measured accuracy and a full audit trail."*

---

## 0. TL;DR (read this first)

- **Track:** AI Finance Controller (chosen deliberately — lowest competition, metrics baked into the problem).
- **What we build:** A system that reconciles three financial sources three ways, isolates and *explains* every exception, answers finance questions in plain English, and logs every decision — while never auto-posting to a ledger.
- **Why it wins:** It is engineered around exactly what the judges reward — **measured accuracy on a held-out test set, honest exception lists, graceful failure/fallback, bounded execution + audit trails, and *appropriate* AI use** (LLM only where rules can't decide).
- **Deadline:** **September 5, 2026.** Today: Aug 24, 2026 → ~12 days, full-time.
- **Status:** Backbone already built and running (data generator + tiered engine + eval harness produce real precision/recall). See §7.

---

## 1. The opportunity & the rules we must satisfy

**Program:** Razorpay AI Buildathon — "Build. Show. Get hired." Student-only hiring funnel for the **AI Builder Internship** (₹75,000/month, in-person Bangalore, 6 or 12 months). Shortlisted builders go **straight to a panel — no aptitude test, no group discussion.**

**Eligibility:** Currently enrolled students / freshers, any degree. (Applicant qualifies.)

**Mandatory submission artifacts:**
| # | Artifact | Requirement |
|---|----------|-------------|
| 1 | **Public GitHub repo** | Another developer can clone and run it from the README (deps, env, usage). |
| 2 | **5-minute pitch video** | Structured: *Problem → Solution → Architecture → Live Demo → Technical Decisions → What Failed → Lessons Learned.* |
| 3 | **Architecture documentation** | Components (frontend, backend, data, AI/LLM, APIs, deploy) + trade-offs. |
| + | **Audit trails & graceful failure handling** | Explicitly called out "where applicable" — and it *is* applicable to us. |

**The AI Finance Controller track prompt:** *Build an agent closing one finance-ops loop across 50+ synthetic records with **match rate** and **exception reporting**.* Example directions Razorpay listed: multi-source reconciliation, settlement Q&A agent, cash forecaster, tax-line matcher. → **We do multi-source reconciliation + a settlement Q&A agent.**

**What the judges actually score (the real rubric):**
1. Working product that demonstrably solves the problem.
2. **Measured accuracy / metrics on held-out test sets.**
3. **Honest exception lists** and reliability evidence (they want to see what you got wrong).
4. **Compliance & bounded execution** (especially finance track).
5. **AI Judgment** — was AI/LLM/agents applied *appropriately*, not forced?
6. **Failure Recovery** — how you detect runtime failures and engineer graceful fallbacks.

> **Design thesis:** Most students will ship a flashy agent demo and skip 2–4 and 6. CloseLoop is engineered *around* 2–6. That contrast is our entire competitive edge.

---

## 2. The product: what CloseLoop does

A merchant using Razorpay has three records that must agree every day:

1. **Internal order ledger** — the merchant's system of record (what they *think* they sold).
2. **Razorpay settlement/payment report** — what the PSP actually captured, its fees/tax, and what it settled.
3. **Bank statement** — the money that actually landed (or got reversed).

In reality these **never** perfectly agree. Fees differ, settlements go missing, refunds don't sync, chargebacks reverse money, duplicate charges slip through, orphan credits appear. A human "finance controller" spends hours chasing these. **CloseLoop is that controller, automated.**

**It does four things:**
1. **Reconciles** all three sources three-ways, matching everything it confidently can.
2. **Classifies exceptions** into a clear taxonomy (8 types) with a plain-English reason each.
3. **Answers questions** in natural language over the reconciled data ("Why is settlement X short by ₹2,300?") — the **Settlement Q&A agent**, with citations to the underlying records.
4. **Logs every decision** (which tier decided, confidence, evidence, timestamp) to an exportable audit trail — and **never auto-mutates a ledger**; it *recommends*, a human approves.

### The exception taxonomy (what "exception reporting" means here)
| Label | Meaning |
|-------|---------|
| `FEE_MISMATCH` | PSP net ≠ amount − fee − tax |
| `AMOUNT_MISMATCH` | Captured amount ≠ order amount (partial capture) |
| `MISSING_SETTLEMENT` | Captured but never hit the bank |
| `MISSING_PAYMENT` | Order in ledger, no PSP capture |
| `DUPLICATE_PAYMENT` | Two captures for one order |
| `REFUND_NOT_REFLECTED` | Refunded at PSP, ledger still "paid" |
| `CHARGEBACK` | Bank debit reversed a settled amount |
| `UNMATCHED_BANK_CREDIT` | Bank credit ties to no known settlement |

---

## 3. Architecture

### 3.1 The core idea — a *tiered* controller ("use the cheapest tool that can be right")

This tiering **is** the "appropriate AI use" story the judges reward. The LLM never touches what a deterministic rule can settle for free.

```
                 ┌─────────────────────────────────────────────┐
   3 sources ──▶ │  TIER 1  DETERMINISTIC                       │
  (ledger,       │  exact id + zero-diff matches, clear breaks  │──▶ certain result
   PSP report,   ├─────────────────────────────────────────────┤
   bank stmt)    │  TIER 2  HEURISTIC                           │
                 │  tolerance rules (rounding / FX / T+1 timing)│──▶ high-confidence
                 ├─────────────────────────────────────────────┤
                 │  TIER 3  LLM (Gemini, free tier)             │
                 │  ONLY the residual gray-zone cases           │──▶ adjudicated + reasoned
                 ├─────────────────────────────────────────────┤
                 │  FALLBACK                                    │
                 │  LLM down / low-confidence → flag for human  │──▶ never silently wrong
                 └─────────────────────────────────────────────┘
                                    │
                                    ▼
        Findings stream ──▶ Audit trail (SQLite) + Exception report + Dashboard + Q&A
```

Every entity produces exactly one **Finding**: `{entity, predicted_status, predicted_exception, tier, confidence, reason, evidence}`. Everything downstream (metrics, report, dashboard, audit log) is built from that one stream.

### 3.2 Component diagram

```
┌────────────────┐     ┌──────────────────────────────────────────┐
│  React + Vite  │◀───▶│  FastAPI backend                         │
│  dashboard     │ HTTP│  /reconcile  /findings  /exceptions       │
│  (demo UI)     │     │  /audit      /ask (Q&A)                   │
└────────────────┘     │                                          │
                       │  ┌────────────────────────────────────┐  │
                       │  │ ReconciliationEngine (tiered)      │  │
                       │  │  Tier1/2 rules  +  Tier3 adjudicator│─┼──▶ Gemini API
                       │  └────────────────────────────────────┘  │   (test-key optional)
                       │  ┌────────────────────────────────────┐  │
                       │  │ Settlement Q&A agent (tool-use)    │──┼──▶ Gemini API
                       │  └────────────────────────────────────┘  │
                       │  ┌────────────────────────────────────┐  │
                       │  │ Audit log (SQLite) · Eval harness  │  │
                       │  └────────────────────────────────────┘  │
                       └──────────────────────────────────────────┘
                                     │
                       ┌─────────────┴─────────────┐
                       │ Synthetic data generator  │  (Razorpay test-mode shape,
                       │ + ground-truth labels     │   seeded & reproducible)
                       └───────────────────────────┘
```

### 3.3 Tech stack (impressive *and* appropriate — no buzzword-stuffing)
| Layer | Choice | Why |
|-------|--------|-----|
| Language / core | **Python 3.10+** | Best fit for finance-data + LLM orchestration |
| Data | **pandas** | Fast, transparent tabular reconciliation |
| API | **FastAPI + Uvicorn** | Typed, async, auto-docs — reads as production-grade |
| LLM | **Google Gemini** (free tier, OpenAI-compatible API; structured output + tool use) | Tier-3 adjudication + Q&A; strong at reasoning + JSON; **zero cost** to run. Provider-swappable via env. |
| Storage | **SQLite** | Zero-config audit trail, ships in the repo |
| Frontend | **React + Vite + Tailwind** | Clean dashboard = the visual "wow" for the video |
| Packaging | **Docker + docker-compose** | "Any dev can run it" (submission requirement) |
| CI | **GitHub Actions** (tests + eval) | Signals engineering maturity |
| Tests | **pytest** | Unit tests on the engine rules |

### 3.4 Why the LLM is justified (and bounded)
- **Justified:** Tier-3 handles genuinely ambiguous gray-zone cases (e.g., a ₹18 discrepancy that could be FX rounding *or* a fee error) and powers natural-language Q&A. We will **prove** its value with a baseline-vs-LLM metric lift on the same held-out set.
- **Bounded:** It only sees residual cases rules couldn't settle; it returns a **structured verdict** (type + confidence + reason); it **never writes to a ledger**; low confidence or API failure → **FALLBACK → human review**, logged.

---

## 4. Data strategy — why our metrics are credible

**Synthetic, seeded, ground-truth-labeled data.** For every generated record we know the correct answer, so we can compute honest precision/recall — and because it's seeded, results are reproducible.

**Held-out evaluation:** engine tolerances are fixed independently of the test seed, so the reported numbers are genuinely out-of-sample (not tuned to the test set).

**Deliberately realistic difficulty (planned upgrade):** A perfect 100% score on self-generated data looks like grading your own homework. We will inject genuine gray-zone ambiguity (FX rounding vs fee error, near-timing near-duplicates, partial settlements) so the score becomes a *believable* strong-but-imperfect number — and then we report the honest misses with an error analysis. **This is what the "honest exception lists" criterion is asking for.**

**The signature metric:** a **before/after** table — rules-only baseline vs LLM-assisted — on the identical held-out set, proving the LLM tier adds measurable value, plus the residual cases still wrong and *why*.

**The "money" metric (for the pitch):** the controller also reports business impact in rupees — e.g. a sample run auto-reconciles **~₹2.09L (60% of ledger value) hands-off** and **surfaces ~₹1.39L as at-risk for review instead of leaking silently.** A single number in ₹ is far more persuasive to judges than an F1 score alone; we lead the demo with it, then back it with the accuracy metrics.

---

## 5. Alignment matrix — every requirement mapped to a feature

| Judging / submission requirement | How CloseLoop satisfies it |
|---|---|
| Working product solving the problem | Runs end-to-end: generate → reconcile → report (already working). |
| Measured accuracy on held-out set | Eval harness: detection P/R/F1 + per-type classification + confusion matrix. |
| Honest exception list | Categorized exception report with reason + confidence per item; documented misses. |
| Compliance & bounded execution | Engine recommends only; never auto-posts; all actions gated + logged. |
| Audit trail | SQLite log: entity, tier, confidence, evidence, timestamp — exportable. |
| Graceful failure recovery | LLM timeout/failure/low-confidence → deterministic fallback + human-review flag. |
| Appropriate AI use | Tiered design; LLM only on residual gray-zone + Q&A; proven with a lift metric. |
| Public runnable repo | README + Docker + `pip install -r requirements.txt` + one-command run. |
| 5-min video structure | Script follows the exact required beats (see §8). |
| Architecture doc | This file + `ARCHITECTURE.md` with the diagrams above. |
| 50+ synthetic records | Generator produces 150 orders + payments + bank rows by default. |

---

## 6. Repository structure

```
razorpay/
├── PROJECT_PLAN.md            ← this file
├── README.md                  ← quickstart, run instructions (for judges)
├── ARCHITECTURE.md            ← deep-dive architecture doc (planned)
├── requirements.txt
├── .env.example               ← GEMINI_API_KEY (free) / Razorpay test keys
├── .gitignore
├── docker-compose.yml         ← (planned)
├── src/closeloop/
│   ├── __init__.py
│   ├── schema.py              ← exception taxonomy + tier/status constants
│   ├── datagen.py             ← seeded synthetic data + ground truth
│   ├── engine.py              ← tiered reconciliation engine (Tier 1/2/3 + fallback)
│   ├── evaluate.py            ← held-out metrics (P/R/F1, confusion matrix)
│   ├── adjudicator.py         ← Gemini Tier-3 adjudicator (planned)
│   ├── qa_agent.py            ← Settlement Q&A agent (planned)
│   ├── audit.py               ← SQLite audit trail (planned)
│   └── api.py                 ← FastAPI app (planned)
├── scripts/
│   └── run_pipeline.py        ← end-to-end backbone run (working)
├── frontend/                  ← React + Vite + Tailwind dashboard (planned)
├── tests/
│   └── test_engine.py         ← engine unit tests (planned)
└── data/generated/            ← generated CSVs + findings (gitignored)
```

---

## 7. Current status (built & verified)

**✅ Working today** (`python scripts/run_pipeline.py`, no API key needed):
- Seeded synthetic data generator producing ledger + Razorpay-shaped payments + bank statement + ground-truth labels (150 orders, ~30% exceptions batched into T+1 settlements).
- Tiered reconciliation engine detecting all 8 exception types across the 3 sources, emitting a findings stream with tier + confidence + reason + evidence.
- Held-out evaluation harness: detection P/R/F1, per-type classification, macro scores, confusion matrix, tier-usage counts, match rate.
- Exception report export.
- **Realistic gray-zone difficulty** injected (FX-rounding drift, next-cycle timing) with a per-record `subtype` tag, so metrics are believable and honest.
- **Error-analysis output**: lists every misclassification with its difficulty subtype and the tier that produced it — direct material for the video's "What Failed" beat.

**Verified run (rules-only baseline, held-out seed=1337, 154 entities):**
- Exception **detection**: precision **0.860**, recall **1.000**, F1 **0.924**, accuracy **0.948**.
- Classification **macro-F1 0.924**; match rate 63.0%.
- **Zero false negatives** — no real exception is missed (the metric a finance controller cares about most).
- All **8 misses are conservative false positives**, every one routed to `FALLBACK` (human review) at low confidence — the system is never *silently* wrong.
- Misses are the deliberately injected gray-zone clean cases: 5 `clean_fx_noise` (over-flagged as `FEE_MISMATCH`), 3 `clean_timing` (over-flagged as `MISSING_SETTLEMENT`) — genuinely inseparable by rule magnitude, which is precisely the slot the Gemini Tier-3 adjudicator is built to resolve. **Target lift: 0.924 → ~0.98 with documented residual misses.**

This is a *believable, honest* baseline by design (see §4) — not a suspicious 100%.

**✅ Built since (P2–P7):**
- **Gemini Tier-3 adjudicator** (`adjudicator.py`) — Google Gemini via its OpenAI-compatible endpoint (free tier, zero cost); structured JSON verdicts, verdict cache to JSON, three-layer strict fallback (no key / API error / low-confidence → human review).
- **Settlement Q&A agent** (`qa_agent.py`) — read-only tool-use over the reconciled data with citations; graceful degraded mode without a key.
- **SQLite audit trail** (`audit.py`) — one decision row per finding per run; queryable by run/entity/tier; per-entity trail.
- **FastAPI backend** (`api.py`) — `/reconcile /metrics /findings /exceptions /entity/{id} /audit/* /ask /health`.
- **Baseline-vs-LLM lift eval** (`scripts/run_eval.py`) — the signature before/after metric on the identical held-out set + residual misses.
- **Engine unit tests** (`tests/test_engine.py`, 15 passing) — regression net; also hardened the engine to be robust to empty sources.
- **Docs + infra** — `README.md`, `ARCHITECTURE.md`, `Dockerfile`, `docker-compose.yml`, GitHub Actions CI, `pyproject.toml`.
- **React + Vite + Tailwind dashboard** (`frontend/`).

**⏳ Remaining (owner: applicant):** record the 5-min pitch video (§9), create the public GitHub repo, add a free `GEMINI_API_KEY` (https://aistudio.google.com/apikey) to see the Tier-3 lift, code-walkthrough prep.

---

## 8. 12-day execution plan (Aug 24 → Sep 5)

| Phase | Days | Deliverable | "Done" =  |
|-------|------|-------------|-----------|
| **P0 Backbone** | ✅ done | data gen + engine + eval | pipeline runs, prints metrics |
| **P1 Realistic data + honesty** | ✅ done | gray-zone injection, error analysis | score believable (F1 0.924) & documented |
| **P2 LLM Tier-3 + fallback** | 3–4 | Gemini adjudicator, strict fallback | baseline-vs-LLM lift metric produced |
| **P3 Audit + API** | 5 | SQLite audit trail, FastAPI endpoints | every decision logged & queryable |
| **P4 Q&A agent** | 6 | Settlement Q&A with citations | answers real questions over the data |
| **P5 Dashboard** | 7–8 | React KPIs + exception table + Q&A + audit drill-down | demo-ready UI |
| **P6 Eval + writeup** | 9 | final held-out numbers + honest misses | numbers frozen, analysis written |
| **P7 Docs + Docker + CI + tests** | 10 | README, ARCHITECTURE, compose, GH Actions | `docker compose up` works clean |
| **P8 Video** | 11 | 5-min pitch (script in §9) | recorded & edited |
| **P9 Buffer + submit** | 12 | final polish, submit | repo public, form submitted |

---

## 9. The 5-minute video script (structure locked to Razorpay's required beats)

1. **Problem (0:00–0:45)** — Merchants reconcile ledger vs Razorpay settlements vs bank daily; it's manual, error-prone, and money silently leaks (missing settlements, chargebacks, fee drift).
2. **Solution (0:45–1:30)** — CloseLoop: an AI finance controller that closes the loop, flags exceptions with reasons, and answers questions — without ever auto-posting.
3. **Architecture (1:30–2:30)** — The tiered engine (deterministic → heuristic → LLM → fallback); "cheapest tool that can be right"; audit trail; bounded execution.
4. **Live demo (2:30–3:45)** — Dashboard: run reconciliation, watch match rate + exceptions populate, drill into one exception's evidence, ask the Q&A agent a question, show the audit log.
5. **Technical decisions (3:45–4:15)** — Why tiered (appropriate AI), why held-out eval, why the LLM is bounded + has a fallback.
6. **What failed / lessons (4:15–5:00)** — The honest misses from the error analysis; what the LLM tier fixed vs didn't; what we'd do with more time. *(This beat is where we out-honest every competitor.)*

---

## 10. Risks & mitigations

| Risk | Severity | Mitigation | Status |
|------|----------|-----------|--------|
| Metrics near-perfect "by construction" | High | Injected gray-zone ambiguity (FX drift, timing, partials); report honest residual misses + error analysis. Believable **F1 0.924** with clear failure modes beats a fake 100%. | ✅ done (P1) |
| LLM Tier-3 + Q&A not yet built | High | Prioritized next (P2/P4). Structured tool-use / JSON output. System stays fully functional without a key via FALLBACK. Prove **lift vs rules-only baseline** on the same held-out set. | ⏳ next |
| No UI / FastAPI / audit / Docker yet | Med-High | One-page dashboard (KPIs + exception table + Q&A + audit drill-down). Docker + clean README are **non-negotiable** for "any dev can run it". | ⏳ P3/P5/P7 |
| Synthetic-only data | Med | Acceptable & expected for this track. Generator uses Razorpay-shaped fields; seed + ground-truth process documented. Document how it plugs into **real Razorpay test-mode settlement reports** later. | Documented |
| Scope vs 12 days | Med | Strict phase gates. Cut anything not serving match rate, exception reporting, audit, or the demo. One polished page > half-finished multi-page app. | Ongoing |
| Video & explanation quality | Med | "What Failed / Lessons" is the differentiator (§9 beat 6). Rehearse the 5-min structure tightly; be ready to **walk the code** in the panel. | ⏳ P8 |
| API key / cost | Low | **Gemini free tier → zero cost.** FALLBACK covers absence entirely. **Cache LLM verdicts to JSON** so eval is reproducible & free to re-run. | Done |
| Live demo fails on the day | Low | Keep a **recorded backup demo** (screen capture of a clean run) + committed sample outputs, so a network/API hiccup never tanks the pitch. | Planned |
| Idea not novel enough | Low | Emphasize the unique angle: **tiered "cheapest-tool-that-can-be-right" controller with a proven LLM-lift metric, bounded execution, and a full audit trail** — most reconciliation tools are opaque black boxes. Lead the pitch with this. | Framing |
| Security / secret leakage | Low | `.env` gitignored; `.env.example` only; no secrets in logs or audit trail; note TLS/at-rest as production considerations in `ARCHITECTURE.md`. | Planned (P7) |
| Compliance oversight (finance track) | Low | Bounded execution (no auto-posting), full audit trail, and honest exception reporting *are* the compliance story. Document data-privacy stance (synthetic data, no PII). | Planned (P7) |
| Can't explain code in panel | Med | Every module is commented; **code-walkthrough prep session** scheduled before submission. | ⏳ pre-submit |

---

## 11. Open items (need input)

- [ ] **Free Gemini API key** added to `.env`? (Not blocking — fallback path covers it; get one free at https://aistudio.google.com/apikey.)
- [ ] **GitHub username / repo name** to initialize the public repo.
- [ ] Preferred **6- or 12-month** internship duration (mentioned in the application, not the build).
- [ ] Confirm applicant will do a **code walkthrough session** before submission (interview prep).

---

*Prepared for the Razorpay AI Buildathon 2026 submission. Track: AI Finance Controller. Chosen for low competition and maximum alignment with the judging rubric.*
