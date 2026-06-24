# Atlas Travels — Project C Write-Up
## 360 Labs Product & Growth Work Test

---

## What works (demo paths)

1. **Public gateway** — `http://localhost:3001/` (or port from `npm run dev`)
   - Branded landing form: name, phone, city, language, **interest** (Hajj / Umrah / Both), consent checkbox
   - Successful route → success screen with **one** native WhatsApp invite link
   - Failed route → inline error + rejection logged

2. **Deterministic router** (`src/lib/router.ts`)
   - Matches city + language + interest (Both matches any; Hajj/Umrah match specific or Both communities)
   - Skips **Full**, **Paused**, and **Privacy Risk** communities
   - Uses proxy capacity with buffer of 5; load-balances to lowest `currentCount`
   - Blocks phones on **suppression list** (seed: `+919000000000`)

3. **Assisted dispatch** — `http://localhost:3001/operator`
   - Compose message + filter by city or language
   - Generates ordered task list (one row per matching community)
   - Copy message → Launch WhatsApp Web → Mark Sent / Failed
   - **Duplicate prevention:** won't create new Pending/Sent tasks for same message + segment + community

4. **Dev simulation** — capacity overflow panel (development only)
   - Injects 10 Mumbai/Hindi leads through real router; shows routed vs rejected + audit log

5. **Tests**
   - Unit: `npm run test:unit` — router + dispatch dedup
   - E2E: `npm run test:e2e` — onboarding happy path + API rejection cases

---

## What is mocked

| Component | MVP behavior | Production target |
|-----------|--------------|-------------------|
| WhatsApp invite links | Placeholder `chat.whatsapp.com/...` URLs | Real links from operator when community is created |
| Member counts | Proxy `currentCount` (incremented on route) | Hand-reconciled against actual WhatsApp size |
| Datastore | In-memory singleton; resets on server restart | Postgres + admin CRUD |
| WhatsApp sending | Operator manually in WhatsApp Web | Same (assisted workflow — no API) |
| Operator auth | `/operator` is open | Login / RBAC |
| Community creation | Outside the app (manual in WhatsApp) | Assisted workflow in operator dashboard |

---

## The trap

**There is no compliant WhatsApp Communities API.** Auto-creating communities and auto-broadcasting cannot be delivered without unofficial automation that risks **number bans** — exactly what WhatsApp polices hardest for lead-gen travel verticals.

The correct MVP is **not** a WhatsApp bot. It is:
- One smart gateway link (works because the user taps an ordinary invite link)
- Deterministic routing with proxy capacity
- Assisted dispatch queue for broadcasts

Recognizing this boundary — and not pretending automation exists — is the core product judgment for this build.

---

## What to confirm with Atlas (client)

1. **Automation expectations** — Are they aligned that community creation and message sending stay human-in-the-loop?
2. **Capacity reconciliation cadence** — How often will operators reconcile proxy counts vs actual community size?
3. **Consent copy** — Is the checkbox wording acceptable under DPDP / their legal review?
4. **Opt-out process** — Who adds numbers to the suppression list, and within what SLA?
5. **Channels vs Communities** — For pure announcements, would WhatsApp Channels (anonymous follow) better match their privacy goal?
6. **Interest taxonomy** — Is Hajj / Umrah / Both sufficient, or do they need finer segments (e.g. package tier)?

---

## What I would build next

1. Persistent database + admin UI to manage communities, invite links, and status lifecycle
2. Operator reconciliation screen (proxy count vs manual actual count entry)
3. Suppression list management UI + API for opt-out requests
4. Assisted community-creation checklist (operator steps, not automation)
5. SMS/email fallback when routing fails (segment full or no match)
6. Auth for operator dashboard
7. Evaluate WhatsApp Channels integration for broadcast-only messaging

---

*Prototype repo: `proj3/` · Docs: `PLAN.md`, `PIPELINE.md`, `HOW_IT_WORKS.md`, `BUILD_NOTES.md`*
