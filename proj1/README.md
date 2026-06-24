# GrowRev — Autonomous Ad Optimization Prototype

**Project A** | Performance marketing control loop for Meta + Google campaigns.

Humans set strategy and hard limits; an agent runs tactics inside them. **Gemini proposes structured actions only** — a deterministic policy engine and reversible executor own every rupee-moving decision.

## The problem

Performance teams want autonomous budget shifts and pauses on live spend, but an LLM must never touch money directly. The trap: if the model can mutate budgets, a bad prompt, hallucination, or adversarial payload can burn real ad dollars.

## Design principle

> **The LLM is never trusted with money.** It outputs JSON proposals. Policy evaluation and execution are entirely deterministic.

## Pipeline

```
Mock metrics ? Rule candidates ? Gemini prioritize/explain ? Policy engine ? Reversible executor
```

| Layer | Module | Role |
|-------|--------|------|
| **1 — Ingest** | `mock_data.py` | Campaign metrics, brand caps, fixture DB |
| **2 — Rules** | `candidate_rules.py` | Deterministic budget-shift and pause candidates |
| **3 — LLM** | `llm_agent.py` | Gemini prioritizes and explains; never executes |
| **4 — Policy** | `policy_engine.py` | Enforces caps, kill switch, escalation vs auto-apply |
| **5 — Executor** | `executor.py` | Applies approved actions with snapshots + one-click rollback |

Policy caps (defaults in `mock_data.py`):

- Max daily budget shift: **$500**
- Max changes per week: **3**
- Minimum data before acting: **50 conversions**, **10,000 impressions**
- Emergency kill switch rejects all proposals with `KILL_SWITCH_TRIGGERED`

## Requirements

- Python **3.10+**
- [Gemini API key](https://aistudio.google.com/apikey)

## Setup

```bash
cd proj1
pip install -e .
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash   # optional
```

Never commit `.env` or API keys — it is gitignored.

## Run

```bash
# Interactive web UI (recommended) — scenario picker, audit trail, rollback
python -m growrev.web_app
# ? http://127.0.0.1:8765

# Full terminal demo — Gemini + policy + executor + adversarial proof
python -m growrev.run_demo

# Integration test suite
python -m growrev.test_pipeline
```

### Web UI scenarios

| Scenario | What it demonstrates |
|----------|----------------------|
| **Mixed** | Client demo: auto-approve within caps + manual review queue |
| **Normal** | Rules + mock LLM (no live API call) |
| **Gemini** | Live Gemini prioritization |
| **Escalation** | Out-of-bounds audience/creative edits escalated to humans |
| **Kill switch** | All proposals rejected before any execution |
| **Adversarial** | Forged rogue payload (e.g. $50,500 shift) blocked at policy |

## Standout features

- **Adversarial proof** — Rogue LLM payloads are rejected; mocked account never mutates
- **Emergency kill switch** — Hard stop before executor runs
- **Escalation path** — Risky edits go to human queue; only safe actions auto-apply
- **Audit trail** — Every action carries rationale, triggering metrics, and rollback ID
- **Integration tests** — End-to-end pipeline validation

## Project structure

```
proj1/
??? growrev/
?   ??? mock_data.py          # Fixture campaigns, brand caps
?   ??? candidate_rules.py    # Deterministic rule candidates
?   ??? llm_agent.py          # Gemini structured proposals
?   ??? policy_engine.py      # Cap enforcement (read-only evaluation)
?   ??? executor.py           # Apply + rollback
?   ??? pipeline_runner.py    # Web UI pipeline orchestration
?   ??? web_app.py            # FastAPI demo server
?   ??? run_demo.py           # Rich terminal demo
?   ??? test_pipeline.py      # Integration tests
??? PIPELINE.md               # Full data-flow and decision-node diagrams
??? pipeline_flowchart.html   # Visual pipeline reference
??? pyproject.toml
```

## What's mocked

| Component | MVP behavior | Production target |
|-----------|--------------|-------------------|
| Campaign metrics | `MOCK_CAMPAIGNS` fixture data | Meta Marketing API + Google Ads API |
| Ad account writes | In-memory DB with snapshots | Platform API calls with idempotency keys |
| LLM fallback | `prioritize_mock()` when no API key | Always live Gemini with monitoring |

Real Meta/Google API integration is the long pole for production. See [PIPELINE.md](PIPELINE.md) for the full branching logic inside the policy decision node.

## Related docs

- [PIPELINE.md](PIPELINE.md) — End-to-end data flow, policy branching, decision metrics
- [../TEAM_INTRO.md](../TEAM_INTRO.md) — All three builds overview
