"""Deterministic rule-based candidate action generation."""

from __future__ import annotations

from uuid import uuid4

from growrev.models import ActionType, BrandCaps, CampaignMetrics, CandidateAction

CPA_LOSER_THRESHOLD = 70.0
CPA_WINNER_THRESHOLD = 30.0
WINNER_BUDGET_BUMP = 150.0


def _has_sufficient_data(metrics: CampaignMetrics, caps: BrandCaps) -> bool:
    return (
        metrics.conversions >= caps.min_conversions_before_acting
        and metrics.impressions >= caps.min_impressions_before_acting
    )


def _candidate(
    campaign_id: str,
    action_type: ActionType,
    target_value: float,
    rule_id: str,
    rule_reason: str,
    priority_hint: int = 5,
) -> CandidateAction:
    return CandidateAction(
        candidate_id=str(uuid4()),
        campaign_id=campaign_id,
        action_type=action_type,
        target_value=target_value,
        rule_id=rule_id,
        rule_reason=rule_reason,
        priority_hint=priority_hint,
    )


def generate_candidates(
    metrics: list[CampaignMetrics],
    caps: BrandCaps,
    *,
    include_escalation_tests: bool = False,
) -> tuple[list[CandidateAction], list[dict[str, str]]]:
    """Return rule-generated candidates and campaigns skipped by rules."""
    candidates: list[CandidateAction] = []
    skipped: list[dict[str, str]] = []

    for m in metrics:
        if not _has_sufficient_data(m, caps):
            skipped.append(
                {
                    "campaign_id": m.campaign_id,
                    "reason": (
                        f"Insufficient data: {m.conversions} conv "
                        f"(min {caps.min_conversions_before_acting}), "
                        f"{m.impressions} impr "
                        f"(min {caps.min_impressions_before_acting})"
                    ),
                }
            )
            if include_escalation_tests and m.campaign_id == "camp_005":
                candidates.append(
                    _candidate(
                        m.campaign_id,
                        "PAUSE",
                        0.0,
                        "RULE_TEST_INSUFFICIENT_PAUSE",
                        "[TEST] Force pause candidate despite insufficient data",
                        priority_hint=9,
                    )
                )
            continue

        if m.status != "ACTIVE":
            skipped.append(
                {"campaign_id": m.campaign_id, "reason": "Campaign not ACTIVE"}
            )
            continue

        if m.cpa >= CPA_LOSER_THRESHOLD:
            candidates.append(
                _candidate(
                    m.campaign_id,
                    "PAUSE",
                    0.0,
                    "RULE_PAUSE_HIGH_CPA",
                    f"CPA ${m.cpa:.0f} >= ${CPA_LOSER_THRESHOLD:.0f} threshold",
                    priority_hint=2,
                )
            )
            continue

        if m.cpa <= CPA_WINNER_THRESHOLD:
            bump = min(WINNER_BUDGET_BUMP, caps.max_daily_budget_shift)
            target = min(
                m.daily_budget + bump,
                caps.spend_ceiling_per_campaign,
            )
            candidates.append(
                _candidate(
                    m.campaign_id,
                    "SHIFT_BUDGET",
                    target,
                    "RULE_SHIFT_WINNER",
                    (
                        f"CPA ${m.cpa:.0f} <= ${CPA_WINNER_THRESHOLD:.0f} - "
                        f"increase budget +${target - m.daily_budget:.0f}"
                    ),
                    priority_hint=1,
                )
            )

            if include_escalation_tests and m.campaign_id == "camp_003":
                oob = m.daily_budget + caps.max_daily_budget_shift + 500.0
                candidates.append(
                    _candidate(
                        m.campaign_id,
                        "SHIFT_BUDGET",
                        oob,
                        "RULE_AGGRESSIVE_SCALE",
                        (
                            f"Aggressive scale +${oob - m.daily_budget:.0f} "
                            f"exceeds max daily shift (${caps.max_daily_budget_shift:.0f})"
                        ),
                        priority_hint=8,
                    )
                )

            if include_escalation_tests and m.campaign_id == "camp_004":
                candidates.append(
                    _candidate(
                        m.campaign_id,
                        "SHIFT_BUDGET",
                        5_500.0,
                        "RULE_CEILING_BREACH",
                        (
                            f"Scale to $5,500 exceeds spend ceiling "
                            f"(${caps.spend_ceiling_per_campaign:.0f})"
                        ),
                        priority_hint=7,
                    )
                )
            continue

        reduce_target = max(m.daily_budget * 0.85, 0.0)
        candidates.append(
            _candidate(
                m.campaign_id,
                "SHIFT_BUDGET",
                round(reduce_target, 2),
                "RULE_REDUCE_MID_CPA",
                f"Mid-range CPA ${m.cpa:.0f} - trim budget 15%",
                priority_hint=4,
            )
        )

    return candidates, skipped
