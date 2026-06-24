"""Shared pipeline orchestration for CLI demo and web UI."""

from __future__ import annotations

import copy
from datetime import datetime
from enum import StrEnum
from typing import Any

from growrev.candidate_rules import generate_candidates
from growrev.executor import ReversibleExecutor
from growrev.llm_agent import GrowRevAgent, prioritize_mock
from growrev.mock_data import (
    DEFAULT_BRAND_CAPS,
    MOCK_CAMPAIGNS,
    build_campaign_history,
    build_initial_db,
)
from growrev.models import ActionProposal, BrandCaps, CampaignMetrics, PolicyDecision
from growrev.session_store import create_session, build_final_decision_record, session_snapshot


class Scenario(StrEnum):
    NORMAL = "normal"
    GEMINI = "gemini"
    MIXED = "mixed"
    ESCALATION = "escalation"
    KILL_SWITCH = "kill_switch"
    ADVERSARIAL = "adversarial"


def build_adversarial_proposals() -> list[ActionProposal]:
    return [
        ActionProposal(
            campaign_id="camp_003",
            action_type="SHIFT_BUDGET",
            target_value=50_500.0,
            rationale="[ROGUE] Scale winner budget by $50,000 immediately!",
        ),
        ActionProposal(
            campaign_id="camp_005",
            action_type="PAUSE",
            target_value=0.0,
            rationale="[ROGUE] Pause campaign with zero historical data",
        ),
        ActionProposal(
            campaign_id="camp_ghost",
            action_type="SHIFT_BUDGET",
            target_value=10_000.0,
            rationale="[ROGUE] Target non-existent campaign",
        ),
    ]


def _serialize_model(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    if isinstance(obj, dict):
        return {k: _serialize_model(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize_model(i) for i in obj]
    return obj


def _serialize_decision(d: PolicyDecision) -> dict[str, Any]:
    return {
        "campaign_id": d.proposal.campaign_id,
        "action_type": d.proposal.action_type,
        "target_value": d.proposal.target_value,
        "rationale": d.proposal.rationale,
        "status": d.status,
        "violation_code": d.violation_code.value if d.violation_code else None,
        "violation_reason": d.violation_reason,
    }


def _run_propose_pipeline(
    scenario: Scenario,
    caps: BrandCaps,
    metrics: list[CampaignMetrics],
) -> tuple[list, list, list[ActionProposal], dict, dict]:
    """Rules -> LLM prioritize. Returns candidates, skipped, proposals, rules_meta, llm_meta."""

    if scenario == Scenario.ADVERSARIAL:
        proposals = build_adversarial_proposals()
        return [], [], proposals, {
            "bypassed": True,
            "note": "Adversarial test - rules and LLM bypassed, forged payload injected",
        }, {"bypassed": True, "source": "forged adversarial payload"}

    include_escalation = scenario in (
        Scenario.MIXED,
        Scenario.ESCALATION,
    )
    candidates, skipped = generate_candidates(
        metrics, caps, include_escalation_tests=include_escalation
    )

    rules_meta = {
        "candidate_count": len(candidates),
        "skipped_count": len(skipped),
        "rules_applied": list({c.rule_id for c in candidates}),
    }

    if scenario == Scenario.GEMINI:
        agent = GrowRevAgent(caps=caps)
        proposals, llm_meta = agent.prioritize(candidates, metrics)
    else:
        proposals, llm_meta = prioritize_mock(candidates, metrics)

    return candidates, skipped, proposals, rules_meta, llm_meta


def run_pipeline(scenario: Scenario = Scenario.NORMAL) -> dict[str, Any]:
    from growrev.policy_engine import evaluate_proposals

    caps = DEFAULT_BRAND_CAPS.model_copy(deep=True)
    if scenario == Scenario.KILL_SWITCH:
        caps.emergency_kill_switch_active = True

    metrics = MOCK_CAMPAIGNS
    db = build_initial_db()
    history = build_campaign_history()
    metrics_by_id = {m.campaign_id: m for m in metrics}

    candidates, skipped, proposals, rules_meta, llm_meta = _run_propose_pipeline(
        scenario, caps, metrics
    )
    decisions = evaluate_proposals(proposals, caps, db, history)

    executor = ReversibleExecutor(campaigns=db, history=history)
    executions: list[dict[str, Any]] = []
    blocked: list[dict[str, Any]] = []
    pending_escalated: list[PolicyDecision] = []

    for decision in decisions:
        m = metrics_by_id.get(decision.proposal.campaign_id)
        if m is None:
            m = metrics[0]
        if decision.status == "APPROVED":
            result = executor.execute(decision, m)
            if result:
                executions.append(_serialize_model(result))
        elif decision.status == "ESCALATED":
            pending_escalated.append(decision)
        else:
            blocked.append(_serialize_decision(decision))

    rollback_result = None
    if executions and scenario == Scenario.NORMAL:
        first_id = executions[0]["action_id"]
        rollback_result = _serialize_model(executor.rollback(first_id))
        first_decision = next(d for d in decisions if d.status == "APPROVED")
        cid = first_decision.proposal.campaign_id
        executor.execute(first_decision, metrics_by_id[cid])
        executions.append(
            {
                "note": "First action was rolled back then re-applied for demo continuity",
                "rollback": rollback_result,
            }
        )

    db_before = {cid: _serialize_model(build_initial_db()[cid]) for cid in build_initial_db()}
    db_after = {cid: _serialize_model(state) for cid, state in executor.campaigns.items()}

    session = create_session(
        scenario=scenario.value,
        caps=caps,
        campaigns=db,
        history=history,
        metrics_by_id=metrics_by_id,
        executor=executor,
        db_before=db_before,
        proposals=proposals,
        decisions=decisions,
        llm_meta=llm_meta,
        pending_decisions=pending_escalated,
        auto_executions=[e for e in executions if "action_id" in e],
        blocked=blocked,
    )

    approved = sum(1 for d in decisions if d.status == "APPROVED")
    rejected = sum(1 for d in decisions if d.status == "REJECTED")
    escalated = len(pending_escalated)
    pending_serialized = session_snapshot(session)["pending_reviews"]

    human_review_stage = None
    if pending_escalated:
        human_review_stage = {
            "id": "human_review",
            "title": "4b. Human Review",
            "subtitle": "ESCALATED proposals queued - approve or reject before execution",
            "status": "pending",
            "data": {
                "pending_count": len(pending_escalated),
                "items": pending_serialized,
            },
        }

    stages: list[dict[str, Any]] = [
        {
            "id": "ingest",
            "title": "1. Ingest",
            "subtitle": "mock_data.py -> CampaignMetrics batch",
            "status": "complete",
            "data": {
                "campaigns": [_serialize_model(m) for m in metrics],
                "brand_caps": _serialize_model(caps),
            },
        },
        {
            "id": "rules",
            "title": "2. Rule Candidates",
            "subtitle": "candidate_rules.py -> CandidateAction[] (deterministic)",
            "status": "complete",
            "data": {
                "candidates": [_serialize_model(c) for c in candidates],
                "skipped": skipped,
                "meta": rules_meta,
            },
        },
        {
            "id": "llm_prioritize",
            "title": "3. LLM Prioritize",
            "subtitle": "llm_agent.py -> rank, filter, and explain candidates",
            "status": "complete",
            "data": {
                "source": llm_meta.get("source", "unknown"),
                "input_candidates": llm_meta.get("input_candidates", len(candidates)),
                "kept": llm_meta.get("kept", len(proposals)),
                "dropped": llm_meta.get("dropped", []),
                "proposals": [_serialize_model(p) for p in proposals],
                "meta": llm_meta,
                "overridden": False,
            },
        },
        {
            "id": "policy",
            "title": "4. Policy",
            "subtitle": "policy_engine.py -> PolicyDecision[]",
            "status": "complete",
            "data": {
                "decisions": [_serialize_decision(d) for d in decisions],
                "summary": {
                    "approved": approved,
                    "rejected": rejected,
                    "escalated": escalated,
                },
                "overridden": False,
            },
        },
    ]

    if human_review_stage:
        stages.append(human_review_stage)

    stages.extend([
        {
            "id": "execute",
            "title": "5. Execute / Block",
            "subtitle": "executor.py - auto APPROVED only; ESCALATED waits for human",
            "status": "complete",
            "data": {
                "executed_count": len([e for e in executions if "action_id" in e]),
                "blocked_count": len(blocked),
                "pending_review_count": len(pending_escalated),
                "executions": executions,
                "blocked": blocked,
                "pending_escalated": pending_serialized,
            },
        },
        {
            "id": "audit",
            "title": "6. Audit",
            "subtitle": "ExecutionResult + snapshots + rollback",
            "status": "complete",
            "data": {
                "audit_log": [
                    _serialize_model(r)
                    for r in executor.audit_log
                    if hasattr(r, "action_id")
                ],
                "rollback_demo": rollback_result,
            },
        },
    ])

    return {
        "scenario": scenario.value,
        "scenario_label": _scenario_label(scenario),
        "session_id": session.session_id,
        "pending_reviews": pending_serialized,
        "stages": stages,
        "db_before": db_before,
        "db_after": db_after,
        "trust_boundary": {
            "blocked_at_policy": len(blocked),
            "pending_human_review": len(pending_escalated),
            "db_mutated_only_by_approved": True,
            "message": (
                f"{approved} auto-approved -> executed | "
                f"{escalated} escalated -> human review | "
                f"{rejected} rejected -> blocked"
            ),
        },
        "final_decision_record": build_final_decision_record(session),
    }


def _scenario_label(scenario: Scenario) -> str:
    labels = {
        Scenario.NORMAL: "Normal pipeline (rules + mock LLM)",
        Scenario.GEMINI: "Live Gemini prioritization",
        Scenario.MIXED: "Client demo: auto-approve + manual review",
        Scenario.ESCALATION: "Escalation + rejection test",
        Scenario.KILL_SWITCH: "Emergency kill switch",
        Scenario.ADVERSARIAL: "Adversarial rogue LLM payload",
    }
    return labels[scenario]


def get_bootstrap() -> dict[str, Any]:
    return {
        "campaigns": [_serialize_model(m) for m in MOCK_CAMPAIGNS],
        "brand_caps": _serialize_model(DEFAULT_BRAND_CAPS),
        "scenarios": [
            {"id": Scenario.MIXED.value, "label": _scenario_label(Scenario.MIXED)},
            {"id": Scenario.NORMAL.value, "label": _scenario_label(Scenario.NORMAL)},
            {"id": Scenario.GEMINI.value, "label": _scenario_label(Scenario.GEMINI)},
            {"id": Scenario.ESCALATION.value, "label": _scenario_label(Scenario.ESCALATION)},
            {"id": Scenario.KILL_SWITCH.value, "label": _scenario_label(Scenario.KILL_SWITCH)},
            {"id": Scenario.ADVERSARIAL.value, "label": _scenario_label(Scenario.ADVERSARIAL)},
        ],
    }
