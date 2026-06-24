"""GrowRev pipeline demo web UI."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from growrev.pipeline_runner import Scenario, get_bootstrap, run_pipeline
from growrev.session_store import (
    get_session,
    override_llm_proposals,
    override_policy_decisions,
    review_action,
    session_snapshot,
)

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(title="GrowRev Pipeline Demo", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class RunRequest(BaseModel):
    scenario: str = "mixed"


class ReviewRequest(BaseModel):
    session_id: str
    queue_id: str
    approve: bool


class LlmOverrideRequest(BaseModel):
    session_id: str
    proposals: list[dict]


class PolicyOverrideRequest(BaseModel):
    session_id: str
    decisions: list[dict]


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/bootstrap")
async def bootstrap() -> dict:
    return get_bootstrap()


@app.post("/api/run")
async def run(req: RunRequest) -> dict:
    try:
        scenario = Scenario(req.scenario)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Unknown scenario: {req.scenario}") from exc

    try:
        return run_pipeline(scenario)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/review")
async def review(req: ReviewRequest) -> dict:
    try:
        return review_action(req.session_id, req.queue_id, req.approve)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/override/llm")
async def override_llm(req: LlmOverrideRequest) -> dict:
    try:
        return override_llm_proposals(req.session_id, req.proposals)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/override/policy")
async def override_policy(req: PolicyOverrideRequest) -> dict:
    try:
        return override_policy_decisions(req.session_id, req.decisions)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/session/{session_id}")
async def get_session_state(session_id: str) -> dict:
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_snapshot(session)


def main() -> None:
    import uvicorn

    uvicorn.run("growrev.web_app:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    main()
