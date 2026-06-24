from __future__ import annotations

import copy

from growrev.models import (
    ActionProposal,
    BrandCaps,
    CampaignHistory,
    CampaignHistoryEntry,
    CampaignState,
    KILL_SWITCH_VIOLATION_MESSAGE,
    PolicyDecision,
    PolicyStatus,
    ViolationType,
)


def evaluate_proposals(
    proposals: list[ActionProposal],
    caps: BrandCaps,
    campaigns: dict[str, CampaignState],
    history: CampaignHistory,
) -> list[PolicyDecision]:
    """Evaluate proposals against brand caps. Strictly read-only - never mutates inputs."""
    campaigns_ro = copy.deepcopy(campaigns)
    history_ro = copy.deepcopy(history)

    if caps.emergency_kill_switch_active:
        return [
            PolicyDecision(
                proposal=proposal.model_copy(deep=True),
                status="REJECTED",
                violation_reason=KILL_SWITCH_VIOLATION_MESSAGE,
                violation_code=ViolationType.KILL_SWITCH_TRIGGERED,
            )
            for proposal in proposals
        ]

    decisions: list[PolicyDecision] = []
    for proposal in proposals:
        status, reason, code = _evaluate_single(
            proposal, caps, campaigns_ro, history_ro
        )
        decisions.append(
            PolicyDecision(
                proposal=proposal.model_copy(deep=True),
                status=status,
                violation_reason=reason,
                violation_code=code,
            )
        )

    return decisions


def _evaluate_single(
    proposal: ActionProposal,
    caps: BrandCaps,
    campaigns: dict[str, CampaignState],
    history: CampaignHistory,
) -> tuple[PolicyStatus, str | None, ViolationType | None]:
    campaign = campaigns.get(proposal.campaign_id)
    if campaign is None:
        return (
            "REJECTED",
            f"Unknown campaign: {proposal.campaign_id}",
            ViolationType.INVALID_VALUE,
        )

    if (
        campaign.conversions < caps.min_conversions_before_acting
        or campaign.impressions < caps.min_impressions_before_acting
    ):
        return (
            "REJECTED",
            (
                f"Insufficient data: {campaign.conversions} conversions "
                f"(min {caps.min_conversions_before_acting}), "
                f"{campaign.impressions} impressions "
                f"(min {caps.min_impressions_before_acting})"
            ),
            ViolationType.INSUFFICIENT_DATA,
        )

    entry = _history_entry(history, proposal.campaign_id)
    if entry.changes_this_week >= caps.max_changes_per_week:
        return (
            "REJECTED",
            f"Weekly change limit reached ({caps.max_changes_per_week}/week)",
            ViolationType.WEEKLY_LIMIT_EXCEEDED,
        )

    if proposal.action_type == "PAUSE":
        if campaign.status == "PAUSED":
            return (
                "REJECTED",
                "Campaign is already paused",
                ViolationType.INVALID_VALUE,
            )
        return "APPROVED", None, None

    current_budget = campaign.daily_budget
    target = proposal.target_value
    shift = abs(target - current_budget)

    if target < 0:
        return (
            "REJECTED",
            "Target budget cannot be negative",
            ViolationType.INVALID_VALUE,
        )

    if shift > caps.max_daily_budget_shift:
        return (
            "ESCALATED",
            f"Budget shift ${shift:.2f} exceeds max daily shift "
            f"(${caps.max_daily_budget_shift:.2f})",
            ViolationType.BUDGET_SHIFT_BREACH,
        )

    if target > caps.spend_ceiling_per_campaign:
        return (
            "ESCALATED",
            f"Target budget ${target:.2f} exceeds spend ceiling "
            f"(${caps.spend_ceiling_per_campaign:.2f})",
            ViolationType.SPEND_CEILING_BREACH,
        )

    return "APPROVED", None, None


def _history_entry(
    history: CampaignHistory, campaign_id: str
) -> CampaignHistoryEntry:
    """Read-only history lookup - does not insert missing entries."""
    return history.entries.get(campaign_id, CampaignHistoryEntry())
