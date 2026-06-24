# VidyaGyan — AI Voice Agent (Inbound Slice)

**Project B** | HCL VidyaGyan lateral-admission exam support in **Hindi and English**.

An inbound voice layer for students and parents who prefer a call over the existing WhatsApp chatbot. Speech in → tool calls into a mock student DB → spoken answer grounded in that caller's data — not a fixed script.

## The problem

Rural exam support needs voice for low-literacy users, but minors, DPDP parental consent, and TRAI calling rules create hard gates. The trap: the LLM must never run a session when compliance fails.

## Design principle

> **Deterministic compliance runs before Gemini starts.** When blocked, `llmExecutionAllowed: false` — the model never sees the session.

## Requirements

- Node.js **18+**
- [Gemini API key](https://aistudio.google.com/apikey) (for live mode only)
- Microphone + speakers (live browser demo)

## Setup

```bash
cd proj2
npm install
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY=your_key_here
PORT=3000

# Optional
# GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
# GEMINI_VOICE_NAME=Aoede
```

Never commit `.env` — it is gitignored.

## Run

```bash
# Browser + Gemini Live (recommended)
npm run live
# → http://localhost:3000

# Text CLI simulator — no API key required
npm run cli
```

Allow microphone access when prompted. Select a demo caller, start a call, and speak in Hindi or English.

## Demo callers

| Phone | Student | Notes |
|-------|---------|-------|
| `+918180081316` | Kabir (Roll 200) | Hindi, full access |
| `+919876543210` | Priya Sharma | English |
| `+919988776655` | Ananya Patel | **DPDP block** — minor without parental consent |

Example prompts: *"Mera admit card kahan hai?"*, *"Exam kab hai?"*, *"Am I eligible?"*

## Architecture

```
Browser mic → WebSocket server → resolveStudent → compliance_gate
                                        ↓ pass
                              Gemini Live + function tools → mock DB
                                        ↓
                              PCM playback + outcome log
```

**Tool-first grounding:** The system prompt carries identity only (name, roll ID). Facts come from runtime tool calls — matching the spec's function-calling pattern and reducing hallucination risk.

### Call flow

1. Caller selects phone number → server resolves student profile
2. `compliance_gate.ts` checks DPDP consent, TRAI disclosure requirements
3. On pass: Gemini Live session starts; recording disclosure spoken at call start
4. Agent invokes tools (`student_tools.ts`) for admit card, exam center, schedule, registration, eligibility
5. Outcome written to `data/call_outcomes.jsonl`
6. On block: WhatsApp fallback template logged (simulated dispatch)

## Spec coverage

| Requirement | Implementation |
|-------------|----------------|
| Inbound voice (speech in/out) | Browser mic → Gemini Live → PCM playback |
| Mock student DB + tool calls | 6 runtime tools in `student_tools.ts` |
| Admit card, center, schedule, registration, eligibility | DB fields + dedicated tools |
| DPDP parental consent | `compliance_gate.ts` blocks before Gemini starts |
| TRAI recording disclosure | Logged and spoken at call start |
| WhatsApp fallback on block | Template logged when consent gate fails |
| Call outcome write-back | `data/call_outcomes.jsonl` |
| Barge-in | Gemini Live duplex audio; CLI `!` prefix in offline simulator |

## HTTP API

| Endpoint | Description |
|----------|-------------|
| `GET /api/callers` | Sample student profiles for the UI |
| `GET /api/outcomes` | Recent call outcome logs |
| `GET /health` | Server and config status |

WebSocket messages handle call lifecycle (`start_call`, `audio`, `stop_call`) and stream transcripts, latency metrics, and tool-call events.

## Project structure

```
proj2/
├── src/
│   ├── server.ts                    # Express + WebSocket server
│   ├── adapters/
│   │   └── gemini_live_bridge.ts    # Gemini Live API, tools, latency hooks
│   ├── student_tools.ts             # Tool declarations + handlers
│   ├── compliance_gate.ts           # DPDP / TRAI gates
│   ├── db_service.ts                # In-memory student registry
│   ├── outcome_service.ts           # Call outcome write-back
│   ├── voice_stream_engine.ts       # CLI mock engine
│   ├── run_demo.ts                  # CLI entry point
│   └── prompts/
│       ├── agent_persona.ts
│       └── vidyagyan_system_prompt.ts
├── public/
│   ├── index.html
│   └── live-client.js               # Browser audio capture + playback
├── data/
│   └── call_outcomes.jsonl          # Append-only call log
└── package.json
```

## Latency notes

Target: **sub-second perceived turn** (best-effort on Gemini Live; network-bound).

Key tunings in `gemini_live_bridge.ts`:

- VAD `silenceDurationMs: 280` — faster turn commit
- Smaller mic buffer (2048 samples @ 16 kHz)
- Shorter system prompt — identity only; tools fetch facts
- `temperature: 0.4`, `maxOutputTokens: 256`
- Sync tool execution — no artificial DB delay during live calls

Unavoidable latency: network RTT to Google's Live API, VAD silence window, and tool round-trips when facts are needed.

## Out of scope (by design)

- Outbound campaigns and DND scrubbing
- Exotel telephony integration (boundary documented; WebSocket server mocks the telephony edge)
- Production CRM / student registry sync

The brief allowed an inbound **or** outbound slice — this build chose inbound with compliance baked in.

## Related docs

- [../TEAM_INTRO.md](../TEAM_INTRO.md) — All three builds overview
