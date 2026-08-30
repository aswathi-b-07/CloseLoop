"""FastAPI backend for CloseLoop.

Exposes the tiered controller over HTTP so the dashboard (and any other dev) can
drive it:

  POST /reconcile          run the pipeline on a seed; returns metrics + summary
  GET  /findings           the full finding stream for the current run
  GET  /exceptions         only the flagged exceptions (the honest exception list)
  GET  /metrics            KPIs + business impact + tier usage + error analysis
  GET  /entity/{id}        full drill-down for one entity (order+payment+bank+finding)
  GET  /audit/runs         list logged runs (the audit trail)
  GET  /audit/decisions    decision log rows (filter by run/entity/tier)
  POST /ask                Settlement Q&A agent (grounded, with citations)
  GET  /health             liveness + whether the Gemini tiers are wired

State is held in-memory for a single demo process; every reconcile also writes to
the SQLite audit trail so decisions persist and are queryable.
"""
from __future__ import annotations

import os
import sys
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Allow `import closeloop...` when run as `uvicorn closeloop.api:app` from src/,
# and also when the repo root is the CWD.
_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.dirname(_HERE)
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

try:  # load a local .env if present so GEMINI_API_KEY is picked up
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # python-dotenv is optional; env vars still work without it
    pass

from closeloop import datagen, evaluate, llm, schema     # noqa: E402
from closeloop.adjudicator import LLMAdjudicator          # noqa: E402
from closeloop.audit import AuditLog                      # noqa: E402
from closeloop.engine import ReconciliationEngine         # noqa: E402
from closeloop.qa_agent import QAAgent                     # noqa: E402

DATA_DIR = os.path.join(_SRC, os.pardir, "data")
CACHE_PATH = os.path.join(DATA_DIR, "llm_cache.json")
AUDIT_DB = os.path.join(DATA_DIR, "audit.db")


class AppState:
    """Holds the current reconciliation so every endpoint reads one consistent run."""

    def __init__(self) -> None:
        self.dataset: Optional[datagen.Dataset] = None
        self.findings: Optional[pd.DataFrame] = None
        self.result: Optional[dict] = None
        self.run_id: Optional[str] = None
        self.use_llm: bool = False
        self.audit = AuditLog(AUDIT_DB)

    def reconcile(self, seed: int, n_orders: int, exception_rate: float,
                  use_llm: bool) -> None:
        ds = datagen.generate(n_orders=n_orders, exception_rate=exception_rate, seed=seed)
        adjudicator = None
        self.use_llm = False
        if use_llm:
            adj = LLMAdjudicator(cache_path=CACHE_PATH)
            adjudicator = adj
            self.use_llm = adj.available
        engine = ReconciliationEngine(adjudicator=adjudicator)
        findings = engine.run(ds.orders, ds.payments, ds.bank)
        self.dataset = ds
        self.findings = findings
        self.result = evaluate.evaluate(findings, ds.ground_truth)
        self.run_id = self.audit.record_run(
            findings, dataset_seed=seed,
            notes=f"use_llm={self.use_llm} n={n_orders} rate={exception_rate}")

    @property
    def ready(self) -> bool:
        return self.findings is not None


state = AppState()

app = FastAPI(
    title="CloseLoop — AI Finance Controller",
    description="Tiered multi-source reconciliation with measured accuracy, "
                "honest exception reporting, and a full audit trail.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _warm_start() -> None:
    """Run the default reconciliation on boot so every endpoint is immediately
    usable (survives uvicorn --reload). Cached LLM verdicts make this instant."""
    try:
        state.reconcile(seed=1337, n_orders=150, exception_rate=0.30, use_llm=True)
    except Exception:
        pass  # a failed warm-start is non-fatal; endpoints self-heal on demand


# --------------------------------------------------------------------------- #
# Request/response models
# --------------------------------------------------------------------------- #
class ReconcileRequest(BaseModel):
    seed: int = 1337
    n_orders: int = 150
    exception_rate: float = 0.30
    use_llm: bool = True


class AskRequest(BaseModel):
    question: str


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _records(df: pd.DataFrame) -> list[dict]:
    """JSON-safe records: NaN/NaT -> None (float columns re-coerce None to NaN,
    so cast to object first) which keeps the response strictly JSON-compliant."""
    if df is None or len(df) == 0:
        return []
    return df.astype(object).where(pd.notna(df), None).to_dict(orient="records")


def _require_ready() -> None:
    if not state.ready:
        # Self-heal: the in-memory run is lost when the process restarts (e.g.
        # uvicorn --reload). Rather than 409-ing the UI, transparently run the
        # default reconciliation so /entity, /exceptions, /metrics stay usable.
        try:
            state.reconcile(seed=1337, n_orders=150, exception_rate=0.30, use_llm=True)
        except Exception:
            raise HTTPException(status_code=409,
                                detail="No reconciliation yet. POST /reconcile first.")


def _business_impact() -> dict:
    of = state.findings[state.findings["entity_type"] == "ORDER"].merge(
        state.dataset.orders, left_on="entity_id", right_on="order_id", how="left")
    reconciled = float(of.loc[of["predicted_status"] == "MATCHED", "amount"].sum())
    at_risk = float(of.loc[of["predicted_status"] == "EXCEPTION", "amount"].sum())
    total = reconciled + at_risk
    return {
        "ledger_value_inr": round(total, 2),
        "auto_reconciled_inr": round(reconciled, 2),
        "auto_reconciled_pct": round(reconciled / total, 4) if total else 0.0,
        "at_risk_inr": round(at_risk, 2),
        "at_risk_pct": round(at_risk / total, 4) if total else 0.0,
        "flow": _money_flow(of, total, reconciled, at_risk),
    }


def _money_flow(of: pd.DataFrame, total: float, reconciled: float,
                at_risk: float) -> dict:
    """The reconciliation loop as money moving through four stages.

    A strictly monotonic funnel measured on *order value* (the merchant's own
    money view): every rupee ordered is either captured, then settled, then
    bank-confirmed and auto-reconciled — or it drops out at a stage, which is
    exactly where reconciliation risk lives. Ledger >= Captured >= Settled >=
    Reconciled holds by construction, so the drops are real, attributable losses.
    """
    orders = state.dataset.orders
    payments = state.dataset.payments
    captured_ids = set(
        payments.loc[payments["status"].isin(["captured", "refunded"]), "order_id"])
    settled_ids = set(
        payments.loc[payments["settlement_id"].astype(str) != "", "order_id"])

    ledger = float(orders["amount"].sum())
    captured = float(orders.loc[orders["order_id"].isin(captured_ids), "amount"].sum())
    settled = float(orders.loc[orders["order_id"].isin(settled_ids), "amount"].sum())

    def pct(v: float) -> float:
        return round(v / ledger, 4) if ledger else 0.0

    stages = [
        {"key": "ordered", "label": "Orders (ledger)",
         "hint": "Every order booked in the system of record",
         "value_inr": round(ledger, 2), "pct": pct(ledger)},
        {"key": "captured", "label": "Razorpay captured",
         "hint": "A PSP capture exists for the order",
         "value_inr": round(captured, 2), "pct": pct(captured),
         "drop_inr": round(ledger - captured, 2)},
        {"key": "settled", "label": "Settled to bank",
         "hint": "Capture was batched into a settlement",
         "value_inr": round(settled, 2), "pct": pct(settled),
         "drop_inr": round(captured - settled, 2)},
        {"key": "reconciled", "label": "Bank-confirmed",
         "hint": "Three-way tie-out: ledger = PSP = bank",
         "value_inr": round(reconciled, 2), "pct": pct(reconciled),
         "drop_inr": round(settled - reconciled, 2)},
    ]
    return {
        "ledger_value_inr": round(ledger, 2),
        "stages": stages,
        "auto_reconciled_inr": round(reconciled, 2),
        "auto_reconciled_pct": pct(reconciled),
        "at_risk_inr": round(at_risk, 2),
        "at_risk_pct": pct(at_risk),
    }


def _metrics_payload() -> dict:
    r = state.result
    d = r["detection"]
    merged = r["merged"]
    misses = merged[merged["label"] != merged["predicted_exception"]]
    error_analysis = [
        {"entity_id": row["entity_id"], "true": row["label"],
         "predicted": row["predicted_exception"],
         "subtype": row.get("subtype", ""), "tier": row["tier"]}
        for _, row in misses.iterrows()
    ]
    return {
        "run_id": state.run_id,
        "use_llm": state.use_llm,
        "n_entities": r["n_entities"],
        "match_rate": r["match_rate"],
        "detection": d,
        "classification_macro": r["classification_macro"],
        "per_class": r["per_class"],
        "exception_type_accuracy": r["exception_type_accuracy"],
        "tier_usage": r["tier_usage"],
        "business_impact": _business_impact(),
        "error_analysis": error_analysis,
    }


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@app.get("/health")
def health() -> dict:
    has_key = llm.configured()
    return {"status": "ok", "llm_configured": has_key,
            "ready": state.ready, "run_id": state.run_id}


@app.post("/reconcile")
def reconcile(req: ReconcileRequest) -> dict:
    if not (0.0 <= req.exception_rate <= 1.0):
        raise HTTPException(400, "exception_rate must be between 0 and 1")
    if not (1 <= req.n_orders <= 5000):
        raise HTTPException(400, "n_orders must be between 1 and 5000")
    state.reconcile(req.seed, req.n_orders, req.exception_rate, req.use_llm)
    return {"run_id": state.run_id, "metrics": _metrics_payload()}


@app.get("/findings")
def findings() -> dict:
    _require_ready()
    return {"run_id": state.run_id, "findings": _records(state.findings)}


@app.get("/exceptions")
def exceptions() -> dict:
    _require_ready()
    exc = state.findings[state.findings["predicted_status"] == schema.STATUS_EXCEPTION]
    return {"run_id": state.run_id, "count": int(len(exc)),
            "exceptions": _records(exc)}


@app.get("/metrics")
def metrics() -> dict:
    _require_ready()
    return _metrics_payload()


@app.get("/entity/{entity_id}")
def entity(entity_id: str) -> dict:
    _require_ready()
    ds = state.dataset
    order = ds.orders[ds.orders["order_id"] == entity_id]
    pays = ds.payments[ds.payments["order_id"] == entity_id]
    finding = state.findings[state.findings["entity_id"] == entity_id]
    sids = set(pays["settlement_id"].astype(str)) if len(pays) else set()
    bank = ds.bank[ds.bank["settlement_ref"].astype(str).isin(sids)] if sids else ds.bank.iloc[0:0]
    if len(order) == 0 and len(finding) == 0:
        bank = ds.bank[ds.bank["bank_txn_id"] == entity_id]
        if len(bank) == 0:
            raise HTTPException(404, f"Unknown entity {entity_id}")
    trail = state.audit.trail_for(entity_id)
    return {
        "entity_id": entity_id,
        "order": _records(order),
        "payments": _records(pays),
        "bank_rows": _records(bank),
        "finding": _records(finding),
        "audit_trail": trail,
    }


@app.get("/audit/runs")
def audit_runs() -> dict:
    return {"runs": state.audit.list_runs()}


@app.get("/audit/decisions")
def audit_decisions(run_id: Optional[str] = None, entity_id: Optional[str] = None,
                    tier: Optional[str] = None, limit: int = 500) -> dict:
    return {"decisions": state.audit.decisions(run_id=run_id, entity_id=entity_id,
                                               tier=tier, limit=limit)}


@app.post("/ask")
def ask(req: AskRequest) -> dict:
    _require_ready()
    if not req.question.strip():
        raise HTTPException(400, "question must not be empty")
    agent = QAAgent(state.dataset.orders, state.dataset.payments,
                    state.dataset.bank, state.findings)
    return agent.answer(req.question.strip())
