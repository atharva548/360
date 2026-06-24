from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

Platform = Literal["META", "GOOGLE"]
CampaignStatus = Literal["ACTIVE", "PAUSED"]
ActionType = Literal["SHIFT_BUDGET", "PAUSE"]
PolicyStatus = Literal["APPROVED", "REJECTED", "ESCALATED"]


class ViolationType(StrEnum):
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
    WEEKLY_LIMIT_EXCEEDED = "WEEKLY_LIMIT_EXCEEDED"
    BUDGET_SHIFT_BREACH = "BUDGET_SHIFT_BREACH"
    SPEND_CEILING_BREACH = "SPEND_CEILING_BREACH"
    INVALID_VALUE = "INVALID_VALUE"
    KILL_SWITCH_TRIGGERED = "KILL_SWITCH_TRIGGERED"


KILL_SWITCH_VIOLATION_MESSAGE = (
    "CRITICAL: Brand Emergency Kill Switch is ACTIVE. All autonomous operations suspended."
)


class CampaignMetrics(BaseModel):
    campaign_id: str
    platform: Platform
    spend: float = Field(ge=0)
    cpa: float = Field(ge=0)
    ctr: float = Field(ge=0)
    conversions: int = Field(ge=0)
    impressions: int = Field(ge=0)
    daily_budget: float = Field(ge=0)
    status: CampaignStatus = "ACTIVE"


class CampaignState(BaseModel):
    campaign_id: str
    platform: Platform
    spend: float = Field(ge=0)
    cpa: float = Field(ge=0)
    ctr: float = Field(ge=0)
    conversions: int = Field(ge=0)
    impressions: int = Field(ge=0)
    daily_budget: float = Field(ge=0)
    status: CampaignStatus = "ACTIVE"


class BrandCaps(BaseModel):
    max_daily_budget_shift: float = Field(gt=0)
    max_changes_per_week: int = Field(gt=0)
    min_conversions_before_acting: int = Field(ge=0)
    min_impressions_before_acting: int = Field(ge=0)
    spend_ceiling_per_campaign: float = Field(gt=0)
    emergency_kill_switch_active: bool = False


class ActionProposal(BaseModel):
    campaign_id: str
    action_type: ActionType
    target_value: float = Field(ge=0)
    rationale: str


class CandidateAction(BaseModel):
    """Rule-generated action candidate before LLM prioritization."""

    candidate_id: str
    campaign_id: str
    action_type: ActionType
    target_value: float = Field(ge=0)
    rule_id: str
    rule_reason: str
    priority_hint: int = Field(ge=1, default=5)


class PolicyDecision(BaseModel):
    proposal: ActionProposal
    status: PolicyStatus
    violation_reason: str | None = None
    violation_code: ViolationType | None = None


class ExecutionResult(BaseModel):
    action_id: str
    status: PolicyStatus
    original_state: CampaignState
    new_state: CampaignState | None = None
    triggering_metrics: CampaignMetrics
    rationale: str
    timestamp: datetime
    rolled_back: bool = False


class CampaignHistoryEntry(BaseModel):
    changes_this_week: int = Field(ge=0, default=0)
    last_change_at: datetime | None = None


class CampaignHistory(BaseModel):
    entries: dict[str, CampaignHistoryEntry] = Field(default_factory=dict)

    def get(self, campaign_id: str) -> CampaignHistoryEntry:
        return self.entries.setdefault(campaign_id, CampaignHistoryEntry())

    def peek(self, campaign_id: str) -> CampaignHistoryEntry:
        """Read-only lookup without mutating entries."""
        return self.entries.get(campaign_id, CampaignHistoryEntry())
