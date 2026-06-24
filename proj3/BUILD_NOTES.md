# Build Notes — How This Prototype Was Built

This documents the AI-assisted build process for Project C (Atlas Travels), as requested in the 360 Labs work test brief.

---

## Tooling

- **Cursor IDE** with Claude (Agent mode) for implementation
- **Stack chosen:** Next.js 16 + TypeScript + Tailwind (standard web stack per brief)
- **Testing:** Vitest (unit) + Playwright (E2E)

---

## Build sequence (prompt-driven)

### Phase 1 — Core routing engine

**Goal:** Deterministic router with compliance boundary documented upfront.

Prompts / tasks:
- Scaffold Next.js app with in-memory datastore seeded from JSON
- Implement `routeLead()` — segment match, capacity buffer, status skip, audit log
- Build public gateway form with consent checkbox
- Document compliance line: no browser bots, no unofficial WhatsApp automation

**Output:** `router.ts`, `datastore.ts`, `GatewayForm.tsx`, `POST /api/leads`

### Phase 2 — Operator dispatch

**Goal:** Assisted broadcast workflow — task generation only, not sending.

- Implement `createDispatchTasks()` — one Pending row per matching community
- Build operator dashboard with Copy / Launch WhatsApp / Mark Sent|Failed
- Add duplicate prevention (Sent rows locked; later: skip duplicate task creation)

**Output:** `dispatch.ts`, `OperatorDashboard.tsx`, `POST/PATCH /api/dispatch`

### Phase 3 — Edge cases and demo tooling

- Dev simulation panel for capacity overflow (`POST /api/simulate`)
- Rejection audit log visible in operator sidebar
- Playwright E2E for Mumbai/Hindi happy path

### Phase 4 — Gap closure (submission hardening)

Per evaluation checklist:
- Added **interest** dimension (Hajj / Umrah / Both) to form + router
- Added **Paused** community status (Lucknow seed community)
- Added **suppression list** stub (`suppressedPhones` in seed + router gate)
- Dispatch **dedup** for repeat broadcasts (same message + segment + community)
- Unit tests (`router.test.ts`) + API E2E tests (`e2e/routing.spec.ts`)
- Submission docs: `PLAN.md`, `WRITEUP.md`, this file

---

## Key files to review in a demo

| Path | Purpose |
|------|---------|
| `src/lib/router.ts` | Deterministic routing + suppression |
| `src/lib/dispatch.ts` | Task generation + dedup |
| `src/app/page.tsx` | Public gateway |
| `src/app/operator/page.tsx` | Operator control center |
| `e2e/onboarding.spec.ts` | Happy-path E2E |
| `e2e/routing.spec.ts` | Rejection + dedup E2E |

---

## Running the prototype

```bash
cd proj3
npm install
npm run dev          # Public: /  ·  Operator: /operator
npm run test:unit    # Router + dispatch unit tests
npm run test:e2e     # Playwright (starts dev server on port 3001)
```

---

## Honest limitations (by design)

- Invite links and member counts are mocked
- No real WhatsApp API integration (none exists for Communities)
- In-memory store resets on server restart
- Operator dashboard has no authentication

These are documented in `WRITEUP.md` and demonstrated as intentional scope cuts, not oversights.
