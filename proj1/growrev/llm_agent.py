from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field, ValidationError

from growrev.models import ActionProposal, BrandCaps, CampaignMetrics, CandidateAction

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

PRIORITIZE_SYSTEM_PROMPT = """You are GrowRev, a tactical campaign optimization analyst.

You receive PRE-GENERATED candidate actions from a deterministic rule engine.
Your job is ONLY to:
1. Prioritize which candidates to keep (drop weak or redundant ones).
2. Write a clear rationale explaining each kept candidate.

You MUST NOT invent new campaigns or new action types.
You MUST NOT change campaign_id, action_type, or target_value of any kept candidate.
You MAY drop candidates you deem low priority.

Return JSON: {"proposals": [...], "dropped": [{"candidate_id": "...", "reason": "..."}]}
Each proposal must include: campaign_id, action_type, target_value, rationale, candidate_id.
For PAUSE actions, target_value must be 0.
"""


class PrioritizedProposal(ActionProposal):
    candidate_id: str = Field(min_length=1)


class PrioritizedBatch(BaseModel):
    proposals: list[PrioritizedProposal]
    dropped: list[dict[str, str]] = Field(default_factory=list)


class GrowRevAgent:
    """Gemini prioritization pass - ranks and explains rule-generated candidates."""

    def __init__(
        self,
        caps: BrandCaps | None = None,
        *,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self.caps = caps
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self.model = model or os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
        self._client = None
        if self.api_key:
            self._client = genai.Client(api_key=self.api_key)

    def prioritize(
        self,
        candidates: list[CandidateAction],
        metrics: list[CampaignMetrics],
    ) -> tuple[list[ActionProposal], dict]:
        if not candidates:
            return [], {"source": "none", "dropped": [], "kept": 0}

        if self._client is None:
            return prioritize_mock(candidates, metrics)

        prompt = _build_prioritize_prompt(candidates, metrics, self.caps)
        schema = PrioritizedBatch.model_json_schema()

        response = self._client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=PRIORITIZE_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_json_schema=schema,
                temperature=0.2,
            ),
        )

        raw = response.text
        if not raw:
            raise RuntimeError("Gemini returned an empty response")

        try:
            batch = PrioritizedBatch.model_validate_json(raw)
        except ValidationError as exc:
            raise RuntimeError(
                f"Gemini response failed schema validation: {exc}\nRaw: {raw}"
            ) from exc

        proposals = _validate_prioritized(batch.proposals, candidates)
        return proposals, {
            "source": f"Gemini ({self.model})",
            "dropped": batch.dropped,
            "kept": len(proposals),
            "input_candidates": len(candidates),
        }

    def analyze(self, metrics: list[CampaignMetrics]) -> list[ActionProposal]:
        """Legacy entry: run rules + prioritize (used by CLI demo)."""
        from growrev.candidate_rules import generate_candidates
        from growrev.mock_data import DEFAULT_BRAND_CAPS

        caps = self.caps or DEFAULT_BRAND_CAPS
        candidates, _ = generate_candidates(metrics, caps)
        proposals, _ = self.prioritize(candidates, metrics)
        return proposals


def prioritize_mock(
    candidates: list[CandidateAction],
    metrics: list[CampaignMetrics],
) -> tuple[list[ActionProposal], dict]:
    """Deterministic prioritization when Gemini is unavailable."""
    metrics_by_id = {m.campaign_id: m for m in metrics}
    sorted_candidates = sorted(candidates, key=lambda c: c.priority_hint)

    proposals: list[ActionProposal] = []
    dropped: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for c in sorted_candidates:
        key = (c.campaign_id, c.action_type)
        m = metrics_by_id.get(c.campaign_id)

        if c.action_type == "PAUSE" and c.rule_id != "RULE_TEST_INSUFFICIENT_PAUSE":
            if key in seen:
                dropped.append(
                    {"candidate_id": c.candidate_id, "reason": "Duplicate pause for campaign"}
                )
                continue
            seen.add(key)

        if c.rule_id == "RULE_AGGRESSIVE_SCALE" and any(
            p.campaign_id == c.campaign_id and p.action_type == "SHIFT_BUDGET"
            for p in proposals
        ):
            pass

        cpa_note = f"CPA ${m.cpa:.0f}" if m else "unknown CPA"
        proposals.append(
            ActionProposal(
                campaign_id=c.campaign_id,
                action_type=c.action_type,
                target_value=c.target_value,
                rationale=(
                    f"[Priority {c.priority_hint}] {c.rule_reason}. "
                    f"LLM review: {cpa_note} supports this {c.action_type}."
                ),
            )
        )

    return proposals, {
        "source": "mock prioritizer (deterministic fallback)",
        "dropped": dropped,
        "kept": len(proposals),
        "input_candidates": len(candidates),
    }


def _build_prioritize_prompt(
    candidates: list[CandidateAction],
    metrics: list[CampaignMetrics],
    caps: BrandCaps | None,
) -> str:
    payload = {
        "candidates": [c.model_dump() for c in candidates],
        "campaign_metrics": [m.model_dump() for m in metrics],
        "brand_caps": caps.model_dump() if caps else None,
    }
    return (
        "Prioritize and explain the following rule-generated candidates.\n"
        "Drop low-priority or redundant candidates if needed.\n\n"
        f"{json.dumps(payload, indent=2)}"
    )


def _validate_prioritized(
    proposals: list[PrioritizedProposal],
    candidates: list[CandidateAction],
) -> list[ActionProposal]:
    by_id = {c.candidate_id: c for c in candidates}
    valid: list[ActionProposal] = []

    for p in proposals:
        source = by_id.get(p.candidate_id)
        if source is None:
            continue
        if (
            p.campaign_id != source.campaign_id
            or p.action_type != source.action_type
            or abs(p.target_value - source.target_value) > 0.01
        ):
            continue
        valid.append(
            ActionProposal(
                campaign_id=p.campaign_id,
                action_type=p.action_type,
                target_value=p.target_value,
                rationale=p.rationale,
            )
        )

    return valid
