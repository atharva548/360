from __future__ import annotations

import copy
from datetime import datetime, timezone
from uuid import uuid4

from growrev.models import (
    CampaignHistory,
    CampaignMetrics,
    CampaignState,
    ExecutionResult,
    PolicyDecision,
)


class ReversibleExecutor:
    """Applies approved actions to the mock campaign DB with full audit trail."""

    def __init__(
        self,
        campaigns: dict[str, CampaignState],
        history: CampaignHistory,
    ) -> None:
        self.campaigns = campaigns
        self.history = history
        self.snapshots: dict[str, CampaignState] = {}
        self.audit_log: list[ExecutionResult] = []

    def execute(
        self,
        decision: PolicyDecision,
        metrics: CampaignMetrics,
    ) -> ExecutionResult | None:
        if decision.status != "APPROVED":
            return None

        campaign = self.campaigns.get(decision.proposal.campaign_id)
        if campaign is None:
            return None

        action_id = str(uuid4())
        original = copy.deepcopy(campaign)
        self.snapshots[action_id] = original

        new_state = copy.deepcopy(campaign)
        proposal = decision.proposal

        if proposal.action_type == "PAUSE":
            new_state.status = "PAUSED"
        elif proposal.action_type == "SHIFT_BUDGET":
            new_state.daily_budget = proposal.target_value

        self.campaigns[campaign.campaign_id] = new_state

        entry = self.history.get(campaign.campaign_id)
        entry.changes_this_week += 1
        entry.last_change_at = datetime.now(timezone.utc)

        result = ExecutionResult(
            action_id=action_id,
            status="APPROVED",
            original_state=original,
            new_state=new_state,
            triggering_metrics=metrics,
            rationale=proposal.rationale,
            timestamp=datetime.now(timezone.utc),
        )
        self.audit_log.append(result)
        return result

    def rollback(self, action_id: str) -> ExecutionResult:
        snapshot = self.snapshots.get(action_id)
        if snapshot is None:
            raise ValueError(f"No snapshot found for action {action_id}")

        original_action = next(
            (r for r in self.audit_log if r.action_id == action_id and not r.rolled_back),
            None,
        )
        if original_action is None:
            raise ValueError(f"No executed action found for {action_id}")

        campaign_id = snapshot.campaign_id
        current_before = copy.deepcopy(self.campaigns[campaign_id])
        restored = copy.deepcopy(snapshot)
        self.campaigns[campaign_id] = restored

        entry = self.history.get(campaign_id)
        if entry.changes_this_week > 0:
            entry.changes_this_week -= 1

        result = ExecutionResult(
            action_id=action_id,
            status="APPROVED",
            original_state=current_before,
            new_state=restored,
            triggering_metrics=original_action.triggering_metrics,
            rationale=f"Rollback of action {action_id}",
            timestamp=datetime.now(timezone.utc),
            rolled_back=True,
        )
        self.audit_log.append(result)
        return result

    def get_campaign(self, campaign_id: str) -> CampaignState | None:
        return self.campaigns.get(campaign_id)
