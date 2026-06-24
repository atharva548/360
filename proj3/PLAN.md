# Atlas Travels — WhatsApp Community Gateway (Project C)
## Technical Plan · 360 Labs Product & Growth Work Test

---

## 1. The real problem

Atlas Travels wants one public link that routes Hajj & Umrah leads into dozens of private WhatsApp Communities (by city, language, interest) and lets operators broadcast one message to many communities from a dashboard — **without** the WhatsApp Business API.

The hard part is not routing logic; it is **compliance and feasibility**. WhatsApp has **no official Communities API**. The only way to auto-create communities or auto-post into them is unofficial browser/device automation, which violates WhatsApp ToS and gets numbers banned — especially in high-volume lead-gen verticals like travel.

**Product judgment:** The MVP must automate what is safe (gateway, routing, task generation, audit) and keep what is unsafe as **assisted, human-confirmed workflows** (community creation, message sending, capacity reconciliation).

---

## 2. MVP scope and cuts

### In scope (automated, compliant)

| Feature | Rationale |
|---------|-----------|
| Branded public gateway form + consent capture | Standard web; required for DPDP-style opt-in |
| Deterministic router (city + language + interest + proxy capacity) | Core value — one link, right community |
| Skip Full / Paused / Privacy Risk communities | Operator-controlled lifecycle |
| Suppression list (opt-out phones blocked at router) | Compliance gate before any invite |
| Lead + rejection audit log | Proof of routing decisions |
| Assisted dispatch queue (message + segment → ordered task list) | Safe broadcast workflow |
| Per-task Sent / Failed tracking + duplicate prevention | Operator accountability |

### Explicit cuts (not built — and why)

| Cut | Reason |
|-----|--------|
| Auto-create WhatsApp Communities | No compliant API; ban risk |
| Auto-send messages into communities | Same — requires unofficial automation |
| Live WhatsApp member counts | Not readable via any compliant API |
| Browser bots / scrapers | ToS violation; excluded from committed build |
| Full CRM / payments / booking | Out of brief; not needed to prove core |

### Capacity model

Live member counts are unavailable. **Proxy capacity** = routed-user count + buffer (5). Operators reconcile proxy vs actual counts manually on a schedule.

---

## 3. Architecture

```
Public URL (/)
  → GatewayForm (consent + segment fields)
  → POST /api/leads
  → router.ts (deterministic)
  → JoinSuccess + native WhatsApp inviteLink

Operator URL (/operator)
  → Broadcast Composer (message + city/language filter)
  → POST /api/dispatch
  → dispatch.ts → 1 Pending task per matching community
  → Operator: Copy → WhatsApp Web → Mark Sent/Failed
  → PATCH /api/dispatch

Shared: in-memory datastore (seed.json) → production: Postgres
Mocked: invite links, WhatsApp itself (no API integration)
```

**Key decisions:**

1. **Router is 100% deterministic** — no LLM in the routing path; reproducible and auditable.
2. **Proxy capacity with buffer** — stop routing before hard cap since real counts are unknown.
3. **Assisted dispatch, not automation** — system generates tasks; humans send; status tracked for audit.

---

## 4. WhatsApp Channels vs Communities

For **pure one-to-many broadcast** (announcements, no member visibility), **WhatsApp Channels** may fit Atlas's privacy goal better than Communities — members follow anonymously, no group member list exposure. Communities remain right when **segmented, interactive** groups (city/language cohorts, Q&A) matter. Recommend confirming with Atlas: broadcast-heavy use cases → Channels; segmented community engagement → Communities + this gateway.

---

## 5. Biggest risk and mitigation

| Risk | Mitigation |
|------|------------|
| Client expects full automation | Draw compliance line in plan + demo; show assisted dispatch as the safe broadcast path |
| Number ban from unofficial automation | Never ship browser bots; document why in write-up |
| Proxy count drift vs real community size | Operator reconciliation UI (post-MVP); buffer reduces overshoot |
| Consent / opt-out gaps | Consent checkbox + suppression list at router |

---

## 6. Two-week build sequence

| Days | Work |
|------|------|
| 1–2 | Scope doc, compliance boundary, data model, seed communities |
| 3–4 | Router engine (segment match, capacity, status skip, logging) |
| 5–6 | Public gateway UI + leads API |
| 7–8 | Operator dispatch queue + status tracking |
| 9 | Suppression list, interest dimension, Paused status, dedup |
| 10 | Dev simulation panel + rejection audit |
| 11–12 | Unit + E2E tests; PLAN / WRITEUP / BUILD_NOTES |
| 13–14 | Polish, demo script, client confirmation questions |

---

*Stack: Next.js 16, TypeScript, Tailwind, in-memory store (Postgres in production).*
