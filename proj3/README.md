# Atlas Travels — WhatsApp Community Gateway

**Project C** | Hajj & Umrah travel operator — one smart link routes leads to the right WhatsApp Community.

Many private WhatsApp Communities exist by city and language. Instead of dozens of invite URLs, Atlas provides a **public gateway** for automated routing and an **operator dashboard** for assisted broadcast — without unofficial WhatsApp automation.

## The problem

Operators need to scale lead routing and segment broadcasts across many WhatsApp Communities. The trap: **there is no compliant WhatsApp Communities API.** Auto-creating communities and auto-broadcasting requires browser bots or scrapers that risk number bans.

## Design principle

> **AI proposes or assists; deterministic code owns risky decisions.** Routing is automated and compliant. Community creation and message sending stay human-in-the-loop by necessity, not omission.

## Compliance boundary

| Automated (safe) | Assisted / manual (required) |
|------------------|------------------------------|
| Public landing form and consent capture | Community creation in WhatsApp |
| Deterministic segment + capacity router | Message broadcasting into communities |
| Suppression list (opt-out phones blocked) | Proxy count reconciliation |
| Lead logging and rejection audit | Copy message → send via WhatsApp Web |
| Dispatch task list generation | Mark Sent / Failed per row |

## Requirements

- Node.js **18+**
- No external API keys (in-memory datastore)

## Setup

```bash
cd proj3
npm install
```

## Run

```bash
npm run dev
```

| URL | Purpose |
|-----|---------|
| `http://localhost:3000/` | Public gateway — lead form + invite link |
| `http://localhost:3000/operator` | Operator dashboard — dispatch + community registry |

Next.js may pick the next available port if 3000 is in use — check the terminal output.

Production build:

```bash
npm run build
npm start
```

## Three pipelines

### 1 — Public gateway (automated)

Branded landing form captures name, phone, city, language, interest (Hajj / Umrah / Both), and consent.

```
POST /api/leads → Router → exactly one invite link (or rejection + audit log)
```

### 2 — Operator dispatch (assisted)

Compose one message + segment filter → ordered task list (one row per community) → operator copies and sends via WhatsApp Web → marks Sent or Failed.

Duplicate prevention: no new Pending/Sent tasks for the same message + segment + community.

### 3 — Dev simulation

Capacity overflow panel (visible on the operator dashboard in development) injects leads through the real router to prove fallback and rejection paths.

## Routing logic

Implemented in `src/lib/router.ts`:

1. Match **city + language + interest** (Both matches any; Hajj/Umrah match specific or Both communities)
2. Block phones on the **suppression list**
3. Skip communities marked **Full**, **Paused**, or **Privacy Risk**
4. Select community where `currentCount < proxyCapacity - 5` (buffer of 5)
5. Prefer lowest `currentCount` (load balancing)
6. Increment proxy counter and log the lead

## Seed demo scenarios

| Segment | Expected outcome |
|---------|------------------|
| Mumbai + Hindi + Umrah | Routed to lowest-count community |
| Chennai + Tamil + Hajj | Rejected (Full) |
| Bangalore + Kannada + Umrah | Rejected (Privacy Risk) |
| Lucknow + Hindi + Hajj | Rejected (Paused) |
| Any + phone `+919000000000` | Rejected (suppression list) |

## Tests

```bash
npm run test:unit   # Vitest — router + dispatch dedup
npm run test:e2e    # Playwright — onboarding + API rejection cases
npm run test:e2e:ui # Playwright with UI runner
```

## API routes

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/leads` | Submit lead → route or reject |
| `GET` | `/api/communities` | List communities |
| `POST` | `/api/communities` | Update community registry (invite links, status) |
| `POST` | `/api/dispatch` | Create dispatch task list |
| `GET` | `/api/dispatch` | List dispatch tasks |
| `POST` | `/api/simulate` | Dev capacity overflow injection |
| `GET` | `/api/join-clicks` | Join-click analytics log |
| `POST` | `/api/test/reset` | Reset in-memory datastore (tests) |

## Project structure

```
proj3/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Public gateway
│   │   ├── operator/page.tsx        # Operator dashboard
│   │   └── api/                     # REST endpoints
│   ├── components/
│   │   ├── GatewayForm.tsx
│   │   ├── OperatorDashboard.tsx
│   │   ├── DispatchTaskList.tsx
│   │   ├── CommunityRegistry.tsx
│   │   └── SimulationPanel.tsx
│   ├── lib/
│   │   ├── router.ts                # Deterministic routing engine
│   │   ├── dispatch.ts              # Task list + dedup
│   │   ├── datastore.ts             # In-memory singleton
│   │   └── router.test.ts           # Unit tests
│   └── data/
│       └── seed.json                # Communities, suppression list
├── e2e/
│   └── onboarding.spec.ts           # Playwright E2E
└── package.json
```

## What's mocked

| Component | MVP behavior | Production target |
|-----------|--------------|-------------------|
| WhatsApp invite links | Placeholder URLs until operators paste real links at `/operator` | Real links when community is created |
| Member counts | Proxy `currentCount` incremented on route | Hand-reconciled against actual WhatsApp size |
| Datastore | In-memory; resets on server restart | Postgres + admin CRUD |
| WhatsApp sending | Operator manually in WhatsApp Web | Same assisted workflow (no API) |
| Operator auth | `/operator` is open | Login / RBAC |

## Client question surfaced

For pure broadcast use cases, **WhatsApp Channels** may fit the privacy goal better than Communities — documented in [WRITEUP.md](WRITEUP.md).

## Related docs

| Document | Purpose |
|----------|---------|
| [HOW_IT_WORKS.md](HOW_IT_WORKS.md) | End-to-end flows and scenario reference |
| [PIPELINE.md](PIPELINE.md) | Detailed product / pipeline documentation |
| [WRITEUP.md](WRITEUP.md) | What works, what's mocked, the trap, next steps |
| [PLAN.md](PLAN.md) | Technical plan — problem, scope, architecture, risks |
| [BUILD_NOTES.md](BUILD_NOTES.md) | Build process and demo guide |
| [../TEAM_INTRO.md](../TEAM_INTRO.md) | All three builds overview |
