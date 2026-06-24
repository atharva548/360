"""Session state, human review, and manual override reprocessing."""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from growrev.executor import ReversibleExecutor
from growrev.models import (
    ActionProposal,
    BrandCaps,
    CampaignHistory,
    CampaignMetrics,
    CampaignState,
    PolicyDecision,
    PolicyStatus,
    ViolationType,
)
from growrev.policy_engine import evaluate_proposals


@dataclass
class PendingReview:
    queue_id: str
    decision: PolicyDecision
    status: str = "pending"
    reviewed_at: datetime | None = None
    execution: dict[str, Any] | None = None


@dataclass
class PipelineSession:
    session_id: str
    scenario: str
    caps: BrandCaps
    campaigns: dict[str, CampaignState]
    history: CampaignHistory
    initial_campaigns: dict[str, CampaignState]
    initial_history: CampaignHistory
    metrics_by_id: dict[str, CampaignMetrics]
    executor: ReversibleExecutor
    db_before: dict[str, dict[str, Any]]
    proposals: list[ActionProposal] = field(default_factory=list)
    decisions: list[PolicyDecision] = field(default_factory=list)
    llm_meta: dict[str, Any] = field(default_factory=dict)
    llm_overridden: bool = False
    policy_overridden: bool = False
    pending: list[PendingReview] = field(default_factory=list)
    auto_executions: list[dict[str, Any]] = field(default_factory=list)
    blocked: list[dict[str, Any]] = field(default_factory=list)


_sessions: dict[str, PipelineSession] = {}


def create_session(
    scenario: str,
    caps: BrandCaps,
    campaigns: dict[str, CampaignState],
    history: CampaignHistory,
    metrics_by_id: dict[str, CampaignMetrics],
    executor: ReversibleExecutor,
    db_before: dict[str, dict[str, Any]],
    proposals: list[ActionProposal],
    decisions: list[PolicyDecision],
    llm_meta: dict[str, Any],
    pending_decisions: list[PolicyDecision],
    auto_executions: list[dict[str, Any]],
    blocked: list[dict[str, Any]],
) -> PipelineSession:
    session = PipelineSession(
        session_id=str(uuid4()),
        scenario=scenario,
        caps=caps,
        campaigns=campaigns,
        history=history,
        initial_campaigns=copy.deepcopy(campaigns),
        initial_history=copy.deepcopy(history),
        metrics_by_id=metrics_by_id,
        executor=executor,
        db_before=db_before,
        proposals=copy.deepcopy(proposals),
        decisions=copy.deepcopy(decisions),
        llm_meta=copy.deepcopy(llm_meta),
        pending=[
            PendingReview(queue_id=str(uuid4()), decision=d)
            for d in pending_decisions
        ],
        auto_executions=auto_executions,
        blocked=blocked,
    )
    _sessions[session.session_id] = session
    return session


def get_session(session_id: str) -> PipelineSession | None:
    return _sessions.get(session_id)


def _serialize_execution(result: Any) -> dict[str, Any]:
    if hasattr(result, "model_dump"):
        return result.model_dump(mode="json")
    return result


def _proposal_key(proposal: ActionProposal) -> tuple[str, str, float]:
    return (proposal.campaign_id, proposal.action_type, proposal.target_value)


def _find_auto_execution(
    session: PipelineSession, proposal: ActionProposal
) -> dict[str, Any] | None:
    for ex in session.auto_executions:
        if "action_id" not in ex:
            continue
        original = ex.get("original_state") or {}
        if original.get("campaign_id") != proposal.campaign_id:
            continue
        new_state = ex.get("new_state") or {}
        if proposal.action_type == "PAUSE" and new_state.get("status") == "PAUSED":
            return ex
        if proposal.action_type == "SHIFT_BUDGET" and abs(
            float(new_state.get("daily_budget", 0)) - proposal.target_value
        ) < 0.01:
            return ex
    return None


def _summarize_execution(ex: dict[str, Any] | None) -> dict[str, Any] | None:
    if not ex:
        return None
    original = ex.get("original_state") or {}
    new_state = ex.get("new_state") or {}
    return {
        "action_id": ex.get("action_id"),
        "budget_before": original.get("daily_budget"),
        "budget_after": new_state.get("daily_budget"),
        "status_before": original.get("status"),
        "status_after": new_state.get("status"),
        "timestamp": ex.get("timestamp"),
    }


def _find_pending_item(
    session: PipelineSession, proposal: ActionProposal
) -> PendingReview | None:
    key = _proposal_key(proposal)
    for item in session.pending:
        if _proposal_key(item.decision.proposal) == key:
            return item
    for item in session.pending:
        p = item.decision.proposal
        if (
            p.campaign_id == proposal.campaign_id
            and p.action_type == proposal.action_type
            and abs(p.target_value - proposal.target_value) < 0.01
        ):
            return item
    return None


def build_final_decision_record(session: PipelineSession) -> list[dict[str, Any]]:
    """Resolved outcomes for every proposal — for audit reference and future decisions."""
    recorded_at = datetime.now(timezone.utc).isoformat()
    records: list[dict[str, Any]] = []

    for decision in session.decisions:
        proposal = decision.proposal
        pending_item = _find_pending_item(session, proposal)
        target_display = (
            "PAUSE" if proposal.action_type == "PAUSE" else f"${proposal.target_value:.2f}"
        )

        record: dict[str, Any] = {
            "campaign_id": proposal.campaign_id,
            "action_type": proposal.action_type,
            "target_value": proposal.target_value,
            "target_display": target_display,
            "rationale": proposal.rationale,
            "policy_status": decision.status,
        }

        if decision.status == "APPROVED":
            exec_data = _find_auto_execution(session, proposal)
            record.update({
                "final_outcome": "APPROVED",
                "decision_source": (
                    "Policy override" if session.policy_overridden else "Policy (auto-approved)"
                ),
                "executed": True,
                "execution": _summarize_execution(exec_data),
                "recorded_at": (exec_data or {}).get("timestamp") or recorded_at,
            })
        elif decision.status == "REJECTED":
            record.update({
                "final_outcome": "REJECTED",
                "decision_source": (
                    "Policy override" if session.policy_overridden else "Policy engine"
                ),
                "executed": False,
                "violation_code": (
                    decision.violation_code.value if decision.violation_code else None
                ),
                "reason": decision.violation_reason or "Rejected by policy",
                "recorded_at": recorded_at,
            })
        elif decision.status == "ESCALATED":
            if pending_item and pending_item.status == "approved":
                record.update({
                    "final_outcome": "APPROVED",
                    "decision_source": "Human review (approved)",
                    "executed": True,
                    "execution": _summarize_execution(pending_item.execution),
                    "recorded_at": (
                        pending_item.reviewed_at.isoformat()
                        if pending_item.reviewed_at
                        else recorded_at
                    ),
                })
            elif pending_item and pending_item.status == "rejected":
                record.update({
                    "final_outcome": "REJECTED",
                    "decision_source": "Human review (rejected)",
                    "executed": False,
                    "reason": "Rejected by human reviewer",
                    "violation_code": (
                        pending_item.decision.violation_code.value
                        if pending_item.decision.violation_code
                        else None
                    ),
                    "recorded_at": (
                        pending_item.reviewed_at.isoformat()
                        if pending_item.reviewed_at
                        else recorded_at
                    ),
                })
            else:
                record.update({
                    "final_outcome": "PENDING",
                    "decision_source": "Awaiting human review",
                    "executed": False,
                    "violation_code": (
                        decision.violation_code.value if decision.violation_code else None
                    ),
                    "reason": decision.violation_reason or "Escalated — requires human review",
                    "recorded_at": None,
                })

        records.append(record)

    return records


def _serialize_decision(d: PolicyDecision) -> dict[str, Any]:
    return {
        "campaign_id": d.proposal.campaign_id,
        "action_type": d.proposal.action_type,
        "target_value": d.proposal.target_value,
        "rationale": d.proposal.rationale,
        "status": d.status,
        "violation_code": d.violation_code.value if d.violation_code else None,
        "violation_reason": d.violation_reason,
        "overridden": d.violation_reason and "Manually overridden" in d.violation_reason,
    }


def _reset_runtime(session: PipelineSession) -> None:
    session.campaigns = copy.deepcopy(session.initial_campaigns)
    session.history = copy.deepcopy(session.initial_history)
    session.executor = ReversibleExecutor(session.campaigns, session.history)
    session.pending = []
    session.auto_executions = []
    session.blocked = []


def _execute_decisions(session: PipelineSession, decisions: list[PolicyDecision]) -> None:
    for decision in decisions:
        proposal = decision.proposal
        metrics = session.metrics_by_id.get(proposal.campaign_id)
        if metrics is None:
            metrics = next(iter(session.metrics_by_id.values()))

        if decision.status == "APPROVED":
            result = session.executor.execute(decision, metrics)
            if result:
                session.auto_executions.append(_serialize_execution(result))
        elif decision.status == "ESCALATED":
            session.pending.append(
                PendingReview(queue_id=str(uuid4()), decision=decision.model_copy(deep=True))
            )
        else:
            session.blocked.append(_serialize_decision(decision))


def override_llm_proposals(
    session_id: str, proposals_data: list[dict[str, Any]]
) -> dict[str, Any]:
    session = get_session(session_id)
    if session is None:
        raise ValueError(f"Session not found: {session_id}")

    session.proposals = [ActionProposal.model_validate(p) for p in proposals_data]
    session.llm_overridden = True
    session.policy_overridden = False

    _reset_runtime(session)
    session.decisions = evaluate_proposals(
        session.proposals, session.caps, session.campaigns, session.history
    )
    _execute_decisions(session, session.decisions)

    return _override_response(
        session,
        "LLM proposals overridden — policy and execute stages re-run from your edits.",
    )


def override_policy_decisions(
    session_id: str, decisions_data: list[dict[str, Any]]
) -> dict[str, Any]:
    session = get_session(session_id)
    if session is None:
        raise ValueError(f"Session not found: {session_id}")

    decisions: list[PolicyDecision] = []
    for row in decisions_data:
        status: PolicyStatus = row["status"]
        code = row.get("violation_code")
        violation_code = ViolationType(code) if code else None
        reason = row.get("violation_reason") or "Manually overridden by user in UI"
        if status != "APPROVED" and not reason.startswith("Manually"):
            reason = f"Manually overridden by user: {reason}"

        decisions.append(
            PolicyDecision(
                proposal=ActionProposal(
                    campaign_id=row["campaign_id"],
                    action_type=row["action_type"],
                    target_value=float(row["target_value"]),
                    rationale=row.get("rationale") or "",
                ),
                status=status,
                violation_reason=reason if status != "APPROVED" else None,
                violation_code=violation_code if status != "APPROVED" else None,
            )
        )

    session.decisions = decisions
    session.policy_overridden = True

    _reset_runtime(session)
    _execute_decisions(session, session.decisions)

    return _override_response(
        session,
        "Policy decisions overridden — execute stage re-run with your status changes.",
    )


def review_action(session_id: str, queue_id: str, approve: bool) -> dict[str, Any]:
    session = get_session(session_id)
    if session is None:
        raise ValueError(f"Session not found: {session_id}")

    item = next((p for p in session.pending if p.queue_id == queue_id), None)
    if item is None:
        raise ValueError(f"Queue item not found: {queue_id}")
    if item.status != "pending":
        raise ValueError(f"Item already {item.status}")

    item.reviewed_at = datetime.now(timezone.utc)
    proposal = item.decision.proposal

    if approve:
        human_decision = PolicyDecision(
            proposal=proposal.model_copy(deep=True),
            status="APPROVED",
            violation_reason="Manually approved by human reviewer (override ESCALATED)",
            violation_code=None,
        )
        metrics = session.metrics_by_id.get(proposal.campaign_id)
        if metrics is None:
            raise ValueError(f"No metrics for campaign {proposal.campaign_id}")

        result = session.executor.execute(human_decision, metrics)
        item.status = "approved"
        item.execution = _serialize_execution(result) if result else None
        message = f"Approved and executed: {proposal.campaign_id} {proposal.action_type}"
    else:
        item.status = "rejected"
        item.execution = None
        message = f"Rejected by human reviewer: {proposal.campaign_id} {proposal.action_type}"

    snapshot = session_snapshot(session)
    snapshot["message"] = message
    snapshot["downstream"] = _downstream_stages(session)
    return snapshot


def _downstream_stages(session: PipelineSession) -> list[dict[str, Any]]:
    approved = sum(1 for d in session.decisions if d.status == "APPROVED")
    rejected = sum(1 for d in session.decisions if d.status == "REJECTED")
    escalated = sum(1 for d in session.decisions if d.status == "ESCALATED")
    pending_serialized = _serialize_pending(session)

    stages: list[dict[str, Any]] = [
        {
            "id": "llm_prioritize",
            "title": "3. LLM Prioritize",
            "subtitle": "llm_agent.py -> rank, filter, and explain candidates",
            "status": "complete",
            "data": {
                "source": session.llm_meta.get("source", "unknown"),
                "input_candidates": session.llm_meta.get("input_candidates", 0),
                "kept": len(session.proposals),
                "dropped": session.llm_meta.get("dropped", []),
                "proposals": [p.model_dump(mode="json") for p in session.proposals],
                "meta": session.llm_meta,
                "overridden": session.llm_overridden,
            },
        },
        {
            "id": "policy",
            "title": "4. Policy",
            "subtitle": "policy_engine.py -> PolicyDecision[]",
            "status": "complete",
            "data": {
                "decisions": [_serialize_decision(d) for d in session.decisions],
                "summary": {
                    "approved": approved,
                    "rejected": rejected,
                    "escalated": escalated,
                },
                "overridden": session.policy_overridden,
            },
        },
    ]

    if session.pending:
        stages.append(
            {
                "id": "human_review",
                "title": "4b. Human Review",
                "subtitle": "ESCALATED proposals queued - approve or reject before execution",
                "status": "pending",
                "data": {
                    "pending_count": len(session.pending),
                    "items": pending_serialized,
                },
            }
        )

    stages.extend([
        {
            "id": "execute",
            "title": "5. Execute / Block",
            "subtitle": "executor.py - auto APPROVED only; ESCALATED waits for human",
            "status": "complete",
            "data": {
                "executed_count": len(session.auto_executions),
                "blocked_count": len(session.blocked),
                "pending_review_count": sum(
                    1 for p in session.pending if p.status == "pending"
                ),
                "executions": session.auto_executions,
                "blocked": session.blocked,
                "pending_escalated": pending_serialized,
            },
        },
        {
            "id": "audit",
            "title": "6. Audit",
            "subtitle": "ExecutionResult + snapshots",
            "status": "complete",
            "data": {
                "audit_log": [
                    r.model_dump(mode="json")
                    for r in session.executor.audit_log
                    if hasattr(r, "action_id")
                ],
                "rollback_demo": None,
            },
        },
    ])
    return stages


def _serialize_pending(session: PipelineSession) -> list[dict[str, Any]]:
    pending = []
    for p in session.pending:
        pending.append({
            "queue_id": p.queue_id,
            "campaign_id": p.decision.proposal.campaign_id,
            "action_type": p.decision.proposal.action_type,
            "target_value": p.decision.proposal.target_value,
            "rationale": p.decision.proposal.rationale,
            "violation_code": (
                p.decision.violation_code.value if p.decision.violation_code else None
            ),
            "violation_reason": p.decision.violation_reason,
            "review_status": p.status,
            "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
            "execution": p.execution,
        })
    return pending


def _override_response(session: PipelineSession, message: str) -> dict[str, Any]:
    approved = sum(1 for d in session.decisions if d.status == "APPROVED")
    rejected = sum(1 for d in session.decisions if d.status == "REJECTED")
    escalated = sum(1 for d in session.decisions if d.status == "ESCALATED")
    pending_serialized = _serialize_pending(session)

    snapshot = session_snapshot(session)
    snapshot["message"] = message
    snapshot["downstream"] = _downstream_stages(session)
    snapshot["trust_boundary"] = {
        "message": (
            f"{approved} auto-approved -> executed | "
            f"{escalated} escalated -> human review | "
            f"{rejected} rejected -> blocked"
        ),
    }
    snapshot["llm_overridden"] = session.llm_overridden
    snapshot["policy_overridden"] = session.policy_overridden
    snapshot["final_decision_record"] = build_final_decision_record(session)
    return snapshot


def session_snapshot(session: PipelineSession, message: str = "") -> dict[str, Any]:
    db_after = {
        cid: state.model_dump(mode="json")
        for cid, state in session.campaigns.items()
    }

    return {
        "session_id": session.session_id,
        "message": message,
        "pending_reviews": _serialize_pending(session),
        "auto_executions": session.auto_executions,
        "blocked": session.blocked,
        "db_after": db_after,
        "proposals": [p.model_dump(mode="json") for p in session.proposals],
        "decisions": [_serialize_decision(d) for d in session.decisions],
        "llm_overridden": session.llm_overridden,
        "policy_overridden": session.policy_overridden,
        "audit_log": [
            r.model_dump(mode="json")
            for r in session.executor.audit_log
            if hasattr(r, "action_id")
        ],
        "summary": {
            "pending": sum(1 for p in session.pending if p.status == "pending"),
            "approved": sum(1 for p in session.pending if p.status == "approved"),
            "rejected": sum(1 for p in session.pending if p.status == "rejected"),
        },
        "final_decision_record": build_final_decision_record(session),
    }
