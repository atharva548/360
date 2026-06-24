from __future__ import annotations

import copy

from growrev.models import (
    BrandCaps,
    CampaignHistory,
    CampaignMetrics,
    CampaignState,
)

DEFAULT_BRAND_CAPS = BrandCaps(
    max_daily_budget_shift=500.0,
    max_changes_per_week=3,
    min_conversions_before_acting=50,
    min_impressions_before_acting=10_000,
    spend_ceiling_per_campaign=5_000.0,
)

MOCK_CAMPAIGNS: list[CampaignMetrics] = [
    # High CPA - poor performers
    CampaignMetrics(
        campaign_id="camp_001",
        platform="META",
        spend=3200.0,
        cpa=85.0,
        ctr=0.012,
        conversions=65,
        impressions=45_000,
        daily_budget=400.0,
        status="ACTIVE",
    ),
    CampaignMetrics(
        campaign_id="camp_002",
        platform="GOOGLE",
        spend=2800.0,
        cpa=92.0,
        ctr=0.009,
        conversions=55,
        impressions=38_000,
        daily_budget=350.0,
        status="ACTIVE",
    ),
    # Low CPA - strong performers
    CampaignMetrics(
        campaign_id="camp_003",
        platform="META",
        spend=4100.0,
        cpa=18.0,
        ctr=0.045,
        conversions=228,
        impressions=120_000,
        daily_budget=500.0,
        status="ACTIVE",
    ),
    CampaignMetrics(
        campaign_id="camp_004",
        platform="GOOGLE",
        spend=3600.0,
        cpa=22.0,
        ctr=0.038,
        conversions=164,
        impressions=95_000,
        daily_budget=450.0,
        status="ACTIVE",
    ),
    # Insufficient data - below min thresholds
    CampaignMetrics(
        campaign_id="camp_005",
        platform="META",
        spend=120.0,
        cpa=60.0,
        ctr=0.015,
        conversions=2,
        impressions=800,
        daily_budget=100.0,
        status="ACTIVE",
    ),
]


def metrics_to_state(metrics: CampaignMetrics) -> CampaignState:
    return CampaignState(
        campaign_id=metrics.campaign_id,
        platform=metrics.platform,
        spend=metrics.spend,
        cpa=metrics.cpa,
        ctr=metrics.ctr,
        conversions=metrics.conversions,
        impressions=metrics.impressions,
        daily_budget=metrics.daily_budget,
        status=metrics.status,
    )


def build_initial_db() -> dict[str, CampaignState]:
    return {m.campaign_id: metrics_to_state(m) for m in MOCK_CAMPAIGNS}


def build_campaign_history() -> CampaignHistory:
    history = CampaignHistory()
    for campaign in MOCK_CAMPAIGNS:
        history.get(campaign.campaign_id)
    return history


def deep_copy_db(db: dict[str, CampaignState]) -> dict[str, CampaignState]:
    return copy.deepcopy(db)
