# Sparrow Staff Portal (System 2)

The internal team dashboard for Sparrow — Slice 1: personal task management with
role-based visibility. **Static React (Vite) SPA + Supabase** (Postgres + Auth +
Row-Level Security). Hosts as static files on **Cloudflare Pages**; Supabase is the
only backend. Destined for `staff.sparrowinc.org`.

> Topology: the browser app talks **directly** to Supabase. There is no Node server —
> Supabase Row-Level Security enforces every permission. So hosting is just static file
> serving (Cloudflare Pages, free) — no Vercel/Railway needed.

> Status: **Sequence 1 (Spine)** — the parent hub the rooms plug into: customizable
> widget Home, triage inbox, cross-system task API, quick wins, team calendar, settings,
> values footer. Builds on Slice 1 (auth + tasks) and the Twin Oaks + LCP rooms.
> Full month/Gantt calendar, meeting postpone/cancel, and Signal-replacement chat are next.

## What you get so far
**Home dashboard (Sequence 1 spine)**
- **Customizable widget Home** — each person arranges their own widgets (My tasks today,
  Triage inbox, Notifications, Upcoming meetings, Quick wins, Calendar, Team pulse).
  Edit mode drags to reorder / removes / adds; the layout persists per user.
- **Triage inbox** — assigned and room-emitted tasks land *pending* (Accept / Defer /
  Push back) instead of dropping straight onto someone's day.
- **Quick wins** feed, **rotating values footer** (per-user toggle in Settings), and a
  three-tier priority vocabulary (🔴 Before you sleep · 🟡 This week · ⚪ When you get to it).

**My tasks**
- Tasks in **List / Board / Calendar** views (drag to change status or reschedule; remembers your last view).
- Create/assign tasks (to anyone), priorities, department tags, due dates, comments.
- **My team** view for managers (see/assign reports' tasks).

**Calendar** — 4-week agenda of the team calendar (recurring meeting cadences + one-offs).

**Notifications + announcements** — notification bell, on-Home notifications widget, and an admin-managed announcement bar.

**Twin Oaks Room**
- **Property grid** of all 61 lots, color-coded (green = current · amber = open work order ·
  red = rent overdue · gray = vacant). Click a lot for resident + rent + work orders.
- **ORS rent cap** shown per lot (HB 3054 logic ported from the concept system).
- **Work-order tracker** — create/assign/triage, with priority + status.
- **Resident records are RLS-gated to TOC staff + admins** (others see the grid, not the PII).

Permissions are enforced in the database via RLS — not in app code.

## One-time setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create a Supabase project
Create it under a **Sparrow-owned account** (per the SOW, deliverables become Sparrow's
property). In the dashboard, open **Settings → API** and copy the Project URL and the
`anon` public key.

```bash
cp .env.example .env.local
# paste the two values into .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
```

### 3. Create the schema + seed data
In the Supabase dashboard **SQL Editor**, run **migrations first (in order), then seeds**:

Migrations:
1. `supabase/migrations/0001_init.sql`   (profiles + tasks)
2. `supabase/migrations/0002_twin_oaks.sql`   (spaces + tenants + work orders)
3. `supabase/migrations/0003_notifications.sql`   (notifications + announcements + triggers)
4. `supabase/migrations/0004_staff_admin.sql`   (admin staff management)
5. `supabase/migrations/0005_lcp.sql`   (LifeChange Program — families, curriculum, vouchers)
6. `supabase/migrations/0006_spine.sql`   (cross-system task API, triage, settings, quick wins, calendar)

Seeds:
7. `supabase/seed.sql`   (staff + sample tasks)
8. `supabase/seed_twin_oaks.sql`   (61 lots + sample residents + work orders)
9. `supabase/seed_social.sql`   (sample announcement + notification)
10. `supabase/seed_lcp.sql`   (sample families + curriculum)
11. `supabase/seed_spine.sql`   (recurring meeting cadences + quick wins + a demo Home layout)

> ⚠️ Before staff sign in, edit `seed.sql` (or the `profiles` rows) so each `email`
> matches the person's **real Google Workspace address**. The email list is the
> sign-in allowlist — anyone not listed is rejected.

### 4. Configure Google sign-in
1. In **Google Cloud Console**, create an OAuth 2.0 Client (Web). Add the authorized
   redirect URI shown in Supabase **Authentication → Providers → Google**
   (`https://<project-ref>.supabase.co/auth/v1/callback`).
2. Paste the Google Client ID + Secret into Supabase's Google provider and enable it.
3. (Recommended) Restrict the OAuth consent screen to the `sparrowinc.org` Workspace.
4. In Supabase **Authentication → URL Configuration**, add your app origins to the
   redirect allow-list: `http://localhost:5173` (dev) and the Pages URL (prod).

### 5. Run it
```bash
npm run dev          # http://localhost:5173
```
For the first look, sign in with an **admin** account (Andrew or Susanna) — admins see
all seeded tasks, so the dashboard is populated immediately.

## Deploy to Cloudflare Pages
```bash
npm run build        # outputs static site to dist/
```
- Connect the repo in Cloudflare Pages (or `wrangler pages deploy dist`).
- **Build command:** `npm run build` · **Output dir:** `dist`
- Set the env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Pages project
  (they're baked into the static bundle at build time).
- `public/_redirects` already handles SPA routing + the OAuth return.
- Point `staff.sparrowinc.org` at the Pages project when ready.

## Verifying Slice 1
- Sign in → personal tasks appear grouped Overdue/Today/This week/Upcoming.
- "New task" → assign to another staff member → it shows on their list with an
  "Assigned by" badge.
- **RLS check:** a non-manager, non-admin cannot read another person's private tasks.

## Cross-system task API (the spine contract rooms build against)
Rooms (LCP, CRM, TOC) don't write System-2 tasks directly — they call two
`SECURITY DEFINER` functions so a single, deduped, triaged task surfaces on the right
person's dashboard. This is the seam the rest of the platform plugs into:

```sql
-- Surface (or update-in-place) a task from a room. (source_system, source_ref) is the
-- stable dedup key — re-emitting updates the same row instead of creating duplicates.
select emit_system_task(
  'lcp',                       -- source_system
  'homework:' || hw.id,        -- source_ref (room-stable)
  shelly_profile_id,           -- assignee
  'Overdue homework — Maria R.', -- title
  'lcp', 'p2', current_date    -- department, priority, due
);

-- Source condition cleared (homework submitted, issue resolved) → close the task.
select resolve_system_task('lcp', 'homework:' || hw.id);
```

Emitted tasks have `created_by = null` and land in the recipient's **Triage Inbox**
(`triage_status = 'pending'`) — nothing appears on someone's day without their okay.

## Notes / next steps / decisions
- **PII gate:** still stores only staff names/emails + tasks at the spine level. Before
  expanding Twin Oaks resident data and LCP case notes, settle data governance
  (Supabase ownership/region) against SOW §10.1.
- **Priority tiers:** the spine speaks the brief's 3 tiers (🔴/🟡/⚪) but keeps the stored
  `p1–p4` enum under the hood (mapping in `src/lib/tasks.ts`). **Open:** swap the
  TaskPanel priority picker to the 3-tier control to finish the reconciliation.
- **Notifications — bell vs. Home:** the brief says notifications live *only* on Home.
  This slice adds the Home notifications widget but **leaves the header bell in place** —
  confirm whether to retire the bell (a one-line removal in `Header.tsx`).
- **Deferred to the next slice:** full month grid + Gantt/timeline calendar, calendar
  add/edit + meeting postpone/cancel-with-reason, Triage "pick a date" defer, and
  filtering the full My-tasks list by triage status.
- The Twin Oaks Room still has to port from the concept system: rent ledger, notice
  deadlines, AMI eligibility, and the locked Financials tab (Andrew + Teresa only).
