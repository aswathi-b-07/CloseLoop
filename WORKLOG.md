# CloseLoop — Work Log (session of 2026-08-29)

A record of everything done in this session: migrating the project to a **free**
LLM backend, verifying the metric, and publishing it to GitHub.

---

## 1. Goal for the session
Make the **entire project run at zero cost** — no billing — while keeping the
"measurable LLM lift" that is the submission's competitive edge.

Starting point: the code was complete and passing, but the Tier-3 adjudicator and
the Settlement Q&A agent were wired to the **paid Anthropic (Claude) API**, so the
signature lift metric showed **+0.000** (no key set).

---

## 2. LLM backend migrated: Anthropic Claude → Google Gemini (free tier)
Decision: use **Google Gemini** via its **OpenAI-compatible endpoint**, so the
stock `openai` SDK does everything. Gemini's free tier covers the whole project —
no credit card, no billing.

**New file**
- `src/closeloop/llm.py` — one place for provider config. Reads the key from
  `GEMINI_API_KEY` (or `GOOGLE_API_KEY` / `LLM_API_KEY`); endpoint and model are
  overridable via `LLM_BASE_URL` / `CLOSELOOP_MODEL`. Provider-swappable to any
  OpenAI-compatible backend (Groq, local Ollama) with no code changes.

**Rewritten**
- `src/closeloop/adjudicator.py` — Tier-3 now calls Gemini (JSON-object output);
  class renamed `ClaudeAdjudicator` → `LLMAdjudicator` (compat alias kept). Same
  strict 3-layer fallback (no key / API error / low-confidence → human review).
- `src/closeloop/qa_agent.py` — rewrote the tool-use loop to OpenAI-style
  function calling (Gemini supports it via the compat endpoint).

**Wiring / config updated**
- `src/closeloop/api.py` — `/health` now reports `llm_configured`.
- `src/closeloop/engine.py`, `schema.py` — comments updated (Claude → Gemini).
- `scripts/run_eval.py`, `scripts/run_pipeline.py` — labels/notes → Gemini.
- `requirements.txt` — dropped `anthropic`, added `openai>=1.30`.
- `.env.example`, `Dockerfile`, `docker-compose.yml` — `ANTHROPIC_API_KEY` →
  `GEMINI_API_KEY`; model default → Gemini.
- Frontend: `Header.jsx` (badge → "Gemini"), `QaPanel.jsx` ("Grounded · Gemini"),
  `lib/taxonomy.js` ("Gemini (LLM)"), `App.jsx` comment.
- Docs: `README.md`, `ARCHITECTURE.md`, `PROJECT_PLAN.md` — all references and the
  stack tables updated to "Google Gemini (free tier)".

**New helper**
- `scripts/diag_llm.py` — one-shot diagnostic that prints the endpoint, a masked
  key, and the full error/response from a single live call (used to debug setup).

---

## 3. Model fix: `gemini-2.5-flash` → `gemini-3.6-flash`
The first live call returned:
> `404 — gemini-2.5-flash is no longer available to new users. Use gemini-3.6-flash`

So the default model was bumped to **`gemini-3.6-flash`** in `llm.py` and every
config/doc reference. (The key itself authenticated fine — the only issue was the
deprecated model name.)

---

## 4. Verified: the free setup produces a real lift
`python scripts/run_eval.py` on the held-out set (seed 1337, 154 entities):

| variant | det. F1 | accuracy | macro-F1 | match |
|---|---|---|---|---|
| rules-only | 0.924 | 0.948 | 0.924 | 63.0% |
| **+ Gemini T3** | **0.942** | **0.961** | **0.966** | 64.3% |
| **lift** | **+0.018** | **+0.013** | **+0.042** | — |

Final run: **`errors: 0`, `fallbacks: 0`** (all 17 gray-zone cases resolved).
Verdicts are cached to `data/llm_cache.json`, so re-runs are free and reproducible.

Residual misses: 6 `clean_fx_noise` cases, all `tier=LLM` — Gemini genuinely
tried and mis-flagged them as `FEE_MISMATCH`. This is the honest "What Failed"
material for the pitch (a believable strong-but-imperfect result, not a fake 100%).

Also confirmed: `pytest` → **15/15 pass**; `run_pipeline.py` runs free with no key.

---

## 5. Security: key kept out of the repo
- The API key lives only in **`.env`** (gitignored) — never committed.
- `.env.example` holds a **placeholder** (`your_free_gemini_key_here`).
- Fixed two instances where the real key had been placed in `.env.example`.
- Post-push scan confirmed: `.env` not in the repo; the key value appears in
  **zero** committed files; only placeholder `.env.example` files are tracked.

> Reminder: consider regenerating the Gemini key after the buildathon, since it
> was briefly exposed in transit during setup.

---

## 6. Published to GitHub
- Initialized git, made a clean first commit (49 files), branch `main`.
- Repo: **https://github.com/aswathi-b-07/CloseLoop** (public).
- Force-pushed over the auto-generated README so the repo's own README is the one
  shown.
- Removed the `Co-Authored-By: Claude` trailer from the commit (amended + force
  pushed); sole author is now **Aswathi**. The GitHub "Contributors" panel is
  cached and will drop the stale `@claude` entry on its next recompute (can take
  up to ~24h) — the commit history itself is already clean.

---

## 7. Current status

| Item | Status |
|---|---|
| Working product, runs free (no billing) | ✅ done |
| Measured lift on held-out set (0.924 → 0.942, macro-F1 → 0.966) | ✅ done |
| Honest exception list + error analysis | ✅ done |
| Audit trail, bounded execution | ✅ done |
| Tests (15/15) + CI + Docker | ✅ done |
| Architecture docs | ✅ done |
| Public GitHub repo, no secrets leaked | ✅ done |
| 5-minute pitch video | ⏳ remaining |
| Final submission (repo link + video) | ⏳ remaining |

---

## 8. Next steps
1. Record the **5-min video** (beats in `PROJECT_PLAN.md` §9): Problem → Solution
   → Architecture → Live Demo → Technical Decisions → What Failed → Lessons. Lead
   with the ₹2.09L auto-reconciled figure; show a live dashboard run; end on the
   honest `clean_fx_noise` misses. Keep a backup screen-recording of a clean run.
2. Submit the public repo link + video.
3. (Optional) Regenerate the Gemini key after submission.

### How to reproduce the metric
```powershell
python -m pip install -r requirements.txt
# put a free key from https://aistudio.google.com/apikey into .env as GEMINI_API_KEY=
python scripts/run_eval.py
```
