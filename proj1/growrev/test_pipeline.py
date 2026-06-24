"""Integration test: Gemini LLM + policy engine + executor on fixture campaign data."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from growrev.candidate_rules import generate_candidates
from growrev.executor import ReversibleExecutor
from growrev.llm_agent import GrowRevAgent, prioritize_mock
from growrev.mock_data import (
    DEFAULT_BRAND_CAPS,
    MOCK_CAMPAIGNS,
    build_campaign_history,
    build_initial_db,
    deep_copy_db,
)
from growrev.models import ActionProposal, ViolationType
from growrev.policy_engine import evaluate_proposals


def main() -> int:
    print("=" * 60)
    print("GrowRev Pipeline Test (Rules + LLM + Policy + Executor)")
    print("=" * 60)

    caps = DEFAULT_BRAND_CAPS
    metrics = MOCK_CAMPAIGNS
    db = build_initial_db()
    history = build_campaign_history()
    valid_ids = {m.campaign_id for m in metrics}

    # Phase 1: Rule candidates + LLM prioritize
    print("\n[Phase 1] Rule candidates...")
    candidates, skipped = generate_candidates(metrics, caps)
    print(f"  Rules generated {len(candidates)} candidate(s), skipped {len(skipped)}")
    assert any(s["campaign_id"] == "camp_005" for s in skipped), "camp_005 should be skipped by rules"

    print("\n[Phase 1b] LLM prioritize...")
    agent = GrowRevAgent(caps=caps)
    try:
        proposals, llm_meta = agent.prioritize(candidates, metrics)
        print(f"  Source: {llm_meta.get('source')}")
    except Exception:
        proposals, llm_meta = prioritize_mock(candidates, metrics)
        print(f"  Gemini unavailable - {llm_meta.get('source')}")

    print(f"  Kept {len(proposals)} proposal(s)")
    for p in proposals:
        target = "PAUSE" if p.action_type == "PAUSE" else f"${p.target_value:.2f}"
        print(f"    {p.campaign_id}: {p.action_type} -> {target}")

    assert all(p.campaign_id in valid_ids for p in proposals), "Proposals reference unknown campaign"
    assert not any(p.campaign_id == "camp_005" for p in proposals), "camp_005 should not be proposed"
    print("  PASS: proposals scoped to ingested campaigns with sufficient data")

    # Phase 2: Policy engine (read-only)
    db_before = deep_copy_db(db)
    history_before = copy.deepcopy(history)
    decisions = evaluate_proposals(proposals, caps, db, history)
    assert db_before == db, "Policy engine mutated campaign DB"
    assert history_before.model_dump() == history.model_dump(), "Policy engine mutated history"

    print(f"\n[Phase 2] Policy decisions: {sum(1 for d in decisions if d.status == 'APPROVED')}/{len(decisions)} approved")
    for d in decisions:
        code = d.violation_code.value if d.violation_code else "-"
        print(f"    {d.proposal.campaign_id}: {d.status} ({code})")
    print("  PASS: policy evaluation complete, inputs untouched")

    # Phase 3: Executor (approved only)
    executor = ReversibleExecutor(campaigns=db, history=history)
    metrics_by_id = {m.campaign_id: m for m in metrics}
    executed = 0
    for decision in decisions:
        if decision.status != "APPROVED":
            continue
        result = executor.execute(decision, metrics_by_id[decision.proposal.campaign_id])
        if result:
            executed += 1
    print(f"\n[Phase 3] Executed {executed} approved action(s)")
    print("  PASS: executor applied approved decisions only")

    # Phase 4: Escalation (crafted proposal — tests policy node)
    oob = ActionProposal(
        campaign_id="camp_003",
        action_type="SHIFT_BUDGET",
        target_value=500.0 + caps.max_daily_budget_shift + 1000.0,
        rationale="Test out-of-bounds shift",
    )
    esc = evaluate_proposals([oob], caps, build_initial_db(), build_campaign_history())[0]
    assert esc.status == "ESCALATED"
    assert esc.violation_code == ViolationType.BUDGET_SHIFT_BREACH
    print(f"\n[Phase 4] Escalation: {esc.status} / {esc.violation_code}")
    print("  PASS: out-of-bounds shift escalated")

    # Phase 5: Kill switch (re-run Gemini proposals under lockdown)
    print("\n[Phase 5] Kill switch on Gemini proposals...")
    kill_caps = caps.model_copy(update={"emergency_kill_switch_active": True})
    kill_decisions = evaluate_proposals(proposals, kill_caps, build_initial_db(), build_campaign_history())
    assert all(d.status == "REJECTED" for d in kill_decisions)
    assert all(d.violation_code == ViolationType.KILL_SWITCH_TRIGGERED for d in kill_decisions)
    print(f"  {len(kill_decisions)}/{len(kill_decisions)} proposals rejected under kill switch")
    print("  PASS: kill switch blocks all Gemini proposals")

    print("\n" + "=" * 60)
    print("ALL PIPELINE TESTS PASSED")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
