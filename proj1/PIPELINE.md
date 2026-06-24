# GrowRev Data Flow & Decision Pipeline

This document describes how campaign data moves through the GrowRev control loop, with explicit branching inside the **Policy Decision Node** (`policy_engine.py`).

**Core rule:** The LLM never touches money. It outputs structured proposals only. All money-moving paths require deterministic policy approval.

---

## End-to-End Pipeline

```mermaid
flowchart TB
    subgraph layer1 [Layer 1 - Ingestion]
        MetaGoogle[Meta / Google Campaign APIs]
        MockData[mock_data.py - MOCK_CAMPAIGNS]
        Metrics[CampaignMetrics batch]
        Caps[BrandCaps]
        History[CampaignHistory]
        DB[(CampaignState DB)]
    end

    subgraph layer2 [Layer 2 - LLM Proposals]
        Gemini[GrowRevAgent - Gemini API]
        Proposals[ActionProposal array]
    end

    subgraph layer3 [Layer 3 - Policy Decision Node]
        PolicyEval[evaluate_proposals]
        Decisions[PolicyDecision array]
    end

    subgraph layer4 [Layer 4 - Executor]
        Executor[ReversibleExecutor]
        Snapshots[(Pre-action snapshots)]
        AuditLog[(Audit log)]
        UpdatedDB[(Updated Campaign DB)]
    end

    MetaGoogle -.->|future| Metrics
    MockData --> Metrics
    Metrics --> DB
    MockData --> Caps
    MockData --> History

    Metrics --> Gemini
    Caps --> Gemini
    Gemini --> Proposals

    Proposals --> PolicyEval
    Caps --> PolicyEval
    DB --> PolicyEval
    History --> PolicyEval
    PolicyEval --> Decisions

    Decisions --> Executor
    Metrics --> Executor
    Executor --> Snapshots
    Executor --> AuditLog
    Executor --> UpdatedDB
    UpdatedDB --> History
```

---

## Layer-by-Layer Data Contracts

| Layer | Input | Output | Mutates state? |
|-------|-------|--------|----------------|
| **1 — Ingestion** | Raw platform metrics | `CampaignMetrics[]`, `BrandCaps`, `CampaignHistory`, `CampaignState` DB | Seeds DB only |
| **2 — LLM** | Metrics + caps context | `ActionProposal[]` | No |
| **3 — Policy** | Proposals + caps + DB + history | `PolicyDecision[]` with status + violation code | No (read-only deep copy) |
| **4 — Executor** | Approved decisions + metrics | `ExecutionResult`, updated DB, audit log | Yes (approved only) |

---

## Policy Decision Node — Full Branching Logic

Each incoming `ActionProposal` is evaluated independently. The policy node deep-copies all inputs before evaluation and never mutates the live DB or history.

```mermaid
flowchart TD
    Start([ActionProposal received]) --> KillSwitch{emergency_kill_switch_active?}

    KillSwitch -->|Yes| RejectKill["REJECTED<br/>KILL_SWITCH_TRIGGERED<br/>All ops suspended"]
    RejectKill --> EndBlocked([Blocked - no executor])

    KillSwitch -->|No| KnownCampaign{campaign_id exists in DB?}

    KnownCampaign -->|No| RejectUnknown["REJECTED<br/>INVALID_VALUE<br/>Unknown campaign"]
    RejectUnknown --> EndBlocked

    KnownCampaign -->|Yes| SufficientData{conversions >= min AND<br/>impressions >= min?}

    SufficientData -->|No| RejectData["REJECTED<br/>INSUFFICIENT_DATA"]
    RejectData --> EndBlocked

    SufficientData -->|Yes| WeeklyLimit{changes_this_week >= max_changes_per_week?}

    WeeklyLimit -->|Yes| RejectWeekly["REJECTED<br/>WEEKLY_LIMIT_EXCEEDED"]
    RejectWeekly --> EndBlocked

    WeeklyLimit -->|No| ActionType{action_type?}

    ActionType -->|PAUSE| AlreadyPaused{status == PAUSED?}
    AlreadyPaused -->|Yes| RejectPaused["REJECTED<br/>INVALID_VALUE<br/>Already paused"]
    RejectPaused --> EndBlocked
    AlreadyPaused -->|No| ApprovePause["APPROVED"]
    ApprovePause --> EndExecute

    ActionType -->|SHIFT_BUDGET| NegativeTarget{target_value < 0?}
    NegativeTarget -->|Yes| RejectNegative["REJECTED<br/>INVALID_VALUE"]
    RejectNegative --> EndBlocked

    NegativeTarget -->|No| ShiftCheck{"abs(target - daily_budget)<br/>> max_daily_budget_shift?"}
    ShiftCheck -->|Yes| EscalateShift["ESCALATED<br/>BUDGET_SHIFT_BREACH<br/>Human review required"]
    EscalateShift --> EndBlocked

    ShiftCheck -->|No| CeilingCheck{target_value > spend_ceiling_per_campaign?}
    CeilingCheck -->|Yes| EscalateCeiling["ESCALATED<br/>SPEND_CEILING_BREACH<br/>Human review required"]
    EscalateCeiling --> EndBlocked

    CeilingCheck -->|No| ApproveShift["APPROVED"]
    ApproveShift --> EndExecute

    EndExecute([Forward to ReversibleExecutor])
```

---

## Branch Outcomes — What Happens Next

```mermaid
flowchart LR
    subgraph policyOutcomes [PolicyDecision status]
        Approved[APPROVED]
        Rejected[REJECTED]
        Escalated[ESCALATED]
    end

    subgraph nextSteps [Next step]
        Snapshot[Deep-copy campaign snapshot]
        ApplyChange[Apply PAUSE or SHIFT_BUDGET]
        AuditWrite[Write ExecutionResult to audit log]
        IncrementHistory[Increment changes_this_week]
        LogOnly[Log decision only]
        NoMutation[DB unchanged]
        HumanQueue[Queued for human review]
    end

    Approved --> Snapshot --> ApplyChange --> AuditWrite --> IncrementHistory
    Rejected --> LogOnly --> NoMutation
    Escalated --> LogOnly --> HumanQueue --> NoMutation
```

| Status | Violation codes | Executor called? | DB mutated? | Rollback available? |
|--------|-----------------|------------------|-------------|---------------------|
| `APPROVED` | — | Yes | Yes | Yes (`rollback(action_id)`) |
| `REJECTED` | `KILL_SWITCH_TRIGGERED`, `INSUFFICIENT_DATA`, `WEEKLY_LIMIT_EXCEEDED`, `INVALID_VALUE` | No | No | N/A |
| `ESCALATED` | `BUDGET_SHIFT_BREACH`, `SPEND_CEILING_BREACH` | No | No | N/A |

---

## Demo Pipeline Phases (`run_demo.py`)

The demo script exercises every branch of the money trust boundary:

```mermaid
flowchart TD
    DemoStart([run_demo.py]) --> Phase1[Phase 1: Ingest MOCK_CAMPAIGNS]
    Phase1 --> Phase1b[Gemini structured proposals]
    Phase1b --> Phase2[Phase 2: Policy evaluate_proposals]
    Phase2 --> Phase3[Phase 3: Execute APPROVED only]
    Phase3 --> Phase4[Phase 4: Rollback proof]
    Phase4 --> Phase5[Phase 5: Scenario A - ESCALATED + REJECTED]
    Phase5 --> Phase6[Phase 6: Scenario B - Kill switch lockdown]
    Phase6 --> Phase7[Phase 7: Adversarial rogue LLM payload]

    Phase5 --> EscBranch[Out-of-bounds shift -> ESCALATED]
    Phase5 --> RejBranch[Insufficient-data pause -> REJECTED]
    Phase6 --> KillBranch[All proposals -> REJECTED / KILL_SWITCH]
    Phase7 --> AdvBranch[3 forged proposals -> all blocked]
```

---

## Example Flow — Mock Campaign `camp_003` (Winner)

```
INGEST     camp_003: CPA $18, 228 conv, 120k impr, budget $500
    |
    v
LLM        SHIFT_BUDGET -> target $700 (+$200 rationale: low CPA winner)
    |
    v
POLICY     shift $200 <= max $500  -->  APPROVED
    |
    v
EXECUTOR   snapshot saved  -->  daily_budget: $500 -> $700  -->  audit log entry
    |
    v
ROLLBACK   (optional) restore snapshot  -->  daily_budget back to $500
```

## Example Flow — Adversarial Rogue Proposal

```
INGEST     camp_003: budget $500
    |
    v
LLM        SHIFT_BUDGET -> target $50,500  (rogue / hallucinated)
    |
    v
POLICY     shift $50,000 > max $500  -->  ESCALATED / BUDGET_SHIFT_BREACH
    |
    x
EXECUTOR   (skipped)  -->  DB unchanged
```

## Example Flow — Kill Switch Active

```
INGEST     4 legitimate proposals (2 PAUSE, 2 SHIFT_BUDGET)
    |
    v
POLICY     emergency_kill_switch_active = True
    |        -->  ALL proposals REJECTED / KILL_SWITCH_TRIGGERED
    x
EXECUTOR   (skipped)  -->  all campaigns remain ACTIVE, budgets unchanged
```

---

## Source File Map

| File | Role in pipeline |
|------|------------------|
| [`growrev/mock_data.py`](growrev/mock_data.py) | Ingestion seed data, `BrandCaps`, initial DB |
| [`growrev/models.py`](growrev/models.py) | All data contracts and `ViolationType` enum |
| [`growrev/llm_agent.py`](growrev/llm_agent.py) | Gemini structured proposal generation |
| [`growrev/test_pipeline.py`](growrev/test_pipeline.py) | Gemini integration test on fixture data |
| [`growrev/policy_engine.py`](growrev/policy_engine.py) | Decision node — all branching logic |
| [`growrev/executor.py`](growrev/executor.py) | Approved-action execution + rollback |
| [`growrev/run_demo.py`](growrev/run_demo.py) | Full pipeline orchestration and adversarial tests |
