# Project RISHI — UC Berkeley

This is the website and member dashboard for Project RISHI at UC Berkeley, the
student-run nonprofit chapter that has worked with the village of Bharog Baneri
in Himachal Pradesh, India since 2012. The public pages explain who we are and
what our four project teams are working on. Behind a member login there's an
internal tool the club uses to assign work, keep a shared calendar, message each
other, look each other up, send club email, and record chapter history.

Live at **ucbprojectrishi.org**.

## The public site

The front of the site is for prospective members, partners, and anyone curious
about the work.

**Home** opens on the chapter name over a full-bleed photo, then moves into our
mission and a few numbers (founding year, village population, active teams). The
hero has a second image slot beside the title on desktop.

**About** covers the things people actually ask about: our mission and values,
the five-step methodology we use on every project (Understand, Research,
Finance, Implement, Evaluate), the chapter's history, and where Bharog Baneri
is and what it's like. There's a photo gallery from past India trips, a team
picture, and a list of the other Project RISHI chapters with links.

**Projects** is split into an index page with an embedded trip video and four
team pages, one each for Education, Water & Sanitation, Women's Empowerment, and
Health. Every team page follows the same shape: a short overview, a quote, the
current term's highlights with photos, and a record of past projects. All of
that text and the photo paths come out of a single content file, so updating a
team page each semester doesn't mean touching any code.

**Apply** lays out the recruitment timeline and points to the interest form,
coffee-chat signup, and application. **Contact** and **Donate** are
straightforward. There are also **Privacy Policy** and **Terms of Service**
pages, linked from the footer; the privacy page in particular is required for
Google's OAuth review.

A newsletter signup sits in the footer on every page. The whole site is built
mobile-first — the nav collapses to a menu on small screens, sections stack into
a single column, and all the scroll animations turn themselves off if your
device is set to reduce motion.

## The member dashboard

Members sign in with Google. Only people on the club roster can get in, and the
check happens on the server.

### Tasks & Events

This is where the club runs its work. You can assign tasks and create events, and
everything assigned to you shows up on a personal month calendar alongside events
for your project group and the whole club.

Who can assign what depends on your role: the VP and President can assign to
specific people, to an entire project group, or to the whole club, and team leads
can assign across their own group. Co-leads (and co-NMT leaders) share control of
each other's items, so anything a lead assigns can be managed by their peers too.
The member picker has a search box and sorts alphabetically, which matters once
you're scrolling through fifty-odd names. When you assign the same task to
several people it collapses into one card, and you can open it to see each
person's status, edit it, add or remove assignees, or archive or delete it — per
person or for everyone at once.

Each task has a lifecycle: the assignee can submit a note and/or a link
(optionally required) and mark it done, which puts it into a pending state for
the assigner to approve or send back; either side can comment. Every card — task
or event, active or archived — opens into a detail view with its full history.

**Auto-archive on approval.** When an assignee's task is approved, their copy
archives itself and leaves their board and calendar. The whole task archives once
*every* assignee is approved. Taking an approval back un-archives it again. If
the assigner (or a co-lead) is also an assignee, their own row is held open until
everyone else is done, so the task stays visible on the managing side.

**Nudge.** An assigner or co-lead can send one assignee a personal reminder email
straight from the task ("… is reminding you to complete …, it is due in X days
and Y hours"). The button locks for five seconds to prevent spam, shows a
confirmation, and the nudge is written into the task's activity log.

**Filters.** Both the personal view and the club overview have a **Show**
(Active / All) and a **Period** (Day / Week / Month / All time) toggle, which
filter the calendar and the lists below it together. "Active" means outstanding:
a task disappears once it's complete or archived, and an event once it has passed
or been archived.

**Full Club Overview.** Every member can flip the board into a club-wide view,
colour-coded by project team, NMT, and other, listing every task and event in the
club. Transparency is the point. Acting on an item is still limited to the people
whose permissions cover it — a Health lead can see, but not act on, an Education
lead's task.

### Member Directory

A searchable table of every member's name, role, project team, email, and phone,
open to all members regardless of role, on its own page. Emails and phone numbers
default to the roster but each member can override their own contact details from
the directory or from Settings; that changes only the directory listing, never the
email they log in with. Phone numbers are auto-formatted to `(###) ###-####`.

### Notifications & email

Every task and event action — assigned, submitted, approved, sent back,
unmarked, nudged, archived, deleted, event created/cancelled — writes an
in-dashboard notification (the bell) and sends a matching email. The club sends
from connected Google accounts using send-only access, and the two sending
accounts are deliberately separate:

- **announcements account** — announcements and newsletters, composed by officers,
  with optional mail-merge fields;
- **notifications account** — automated task/event notifications, reminders, and
  nudges.

Members can also connect their own account to send messages they author.

**Reminders** go out as a task's due date approaches (several days out down to the
last hour, plus a daily nudge once overdue) and stop once it's done. They're
triggered by an external scheduler hitting a secret-protected endpoint.

**Background push.** Members can opt into browser/OS notifications, so dashboard
alerts and new chat messages reach them with the tab closed. Uses a service worker
and Web Push; off until the member allows notifications.

### Chat

A floating widget lets any member start a direct message or a group chat, with an
emoji picker and tapback reactions, a panel that resizes up to fullscreen, and
conversations saved so they persist. New messages fire a background push to the
other people in the thread. Deleting a conversation removes it from your own list
only; it comes back if someone sends a new message.

### Google Calendar sync

Members can optionally push their RISHI tasks and events into their own Google
Calendar. It's off by default and entirely opt-in — you click Connect, approve
calendar access, and from then on your items sync automatically whenever they
change, with a manual "Sync now" if you want it. Disconnecting removes everything
the app added. We kept this separate from the login on purpose, so signing in
stays a clean, single permission and nobody grants calendar access they didn't ask
for. Refresh tokens are stored server-side and never touch the browser.

### RISHI Lineage

A page of the chapter's big/little family trees, drawn as actual branching
diagrams, with the logged-in member's own spot badged.

### Settings

Profile photo, directory contact details, and the Google Calendar / Gmail
connections. Officers additionally manage the club's two shared sending accounts;
the Webmaster also gets the roster controls.

## Roles

Roles live on each member and decide what they can do. The umbrella roles are
`newbie`, `internal`, `lead`, `nmtLeader`, `exec`, and `vpp` (VP/President).
Alongside them are specific titles used for display and for future
role-specific permissions: `outreach` (Director of Outreach), `financeDirector`,
`president`, `vpProjects`, and `vpInternal`. In the directory a specific title is
shown on its own in place of the umbrella term.

`webmaster` is the site administrator. It implies **every** permission on the
site and is the only role that can sync the roster. It's never shown in the
directory. The flags are expanded in `getCurrentMember()` — the one place every
permission check flows through — so the stored roster keeps showing a person's
real roles rather than claiming the webmaster is a newbie.

## The roster: code and spreadsheet

Membership can be managed **without touching code**.

- `lib/members.ts` holds `BASE_MEMBERS` — the roster in code. It seeds the
  spreadsheet and is the permanent fallback.
- The **roster Google Sheet** has a `Roster` tab with a column per attribute and
  per role. Officers edit it to add or remove members and change roles.
- The sheet is pulled into the `lms_roster` table and becomes the live roster.
  Once that table has at least one active row, **the sheet is authoritative**:
  adding a row grants access, deleting a row or setting `Active = FALSE` removes
  it.

Syncing happens hourly via cron, or immediately from **Settings → Member roster →
Sync roster from sheet** (Webmaster only). Each sync pulls the sheet in, then
pushes the normalised roster back out, so the sheet always shows what the site is
actually using.

Safety rules worth knowing, because a roster bug locks people out:

- If the sheet yields **no active members**, the sync refuses rather than wiping
  the roster.
- If the roster table is empty or the database is unreachable, the **code roster**
  is used.
- A **missing column** means "the sheet has no opinion" — the value falls back to
  the code roster. Only a column that's actually present can turn a role off.
- The sheet can **grant** `webmaster` but can never strip it from someone who has
  it in code, so there's always a way back in.
- Duplicate emails collapse to the last row rather than failing the sync.

Values are lenient: `TRUE / yes / y / x / 1 / ✓` all read as true, and the project
group accepts either `E` or `Education`.

**Settings → Copy members.ts code** (Webmaster only) generates the `BASE_MEMBERS`
array from the live roster so you can paste it back into `lib/members.ts` and
commit — keeping the code fallback current. It emits only the array, not the whole
file, so the helpers around it are never clobbered.

## Google Sheets sync

Three private sheets mirror the dashboard, written by a Google **service account**
(no user OAuth, so it's outside the consent-screen review):

| Sheet | Tabs | Contents |
| --- | --- | --- |
| Directory | (single) | Name, role, project group, email, phone |
| Tasks | `Active Tasks`, `Archived Tasks`, `Submissions` | Every task field, per assignee, plus the full submission history |
| Roster | `Roster` | Login email, name, group, phone, Active, Hidden, one column per role |

The task sheet syncs in real time on every task action (create, submit, approve,
return, unmark, comment, nudge, edit, assignee changes, archive, delete) and the
directory syncs whenever a member edits their contact details. An hourly cron
rebuilds all three from scratch as a safety net, so nothing can drift for longer
than an hour. Set `SHEETS_SYNC_MODE=cron` to turn off real-time task syncing and
leave it all to the cron.

Access tokens are cached for the hour and each sync writes its tabs in two
batched calls, so real-time syncing costs roughly a few hundred milliseconds per
action. Every sync **overwrites** its tabs (columns A–T on the task tabs, A–J on
Submissions, A–E on the directory), so keep manual notes on separate tabs.

Sheets failures never break the dashboard — they're logged (`sheets: …`) and the
action still succeeds. `/api/lms/cron/sheets` returns a per-sheet result so a
silent failure is always diagnosable.

## Built with

It's a [Next.js](https://nextjs.org) 14 app written in TypeScript, using the App
Router, styled with Tailwind, and animated with Framer Motion. The two typefaces
(Fraunces for headings, Inter for body) are self-hosted through `next/font`, so
nothing is fetched from a font CDN at runtime.

The member side uses **NextAuth** for Google sign-in and **Supabase** (Postgres)
for tasks, events, submissions, comments, notifications, chat, push
subscriptions, profiles, announcements/newsletters, contact overrides, the
roster, and the calendar and Gmail tokens. Every table has row-level security on
and is only reachable with the server-side service role, so the public key has no
access at all. Calendar sync talks to the **Google Calendar API**; club email goes
through the **Gmail API** with send-only scope; background alerts use **Web Push**
(`web-push` + VAPID); the spreadsheets use the **Google Sheets API** via a service
account. The site runs on Vercel, with Web Analytics and Speed Insights on.

A couple of design choices worth noting. The palette — deep pine green and warm
marigold on a paper background — comes from the terraced foothills around the
village. The faint topographic contour lines behind headers and hero sections are
a recurring motif meant to echo that hilly terrain. Images throughout the site go
through a single `Media` component that shows a labelled placeholder box until a
real photo is dropped in, which makes it obvious what's missing at a glance.

## Working on the site

Most content changes happen in one file, `lib/content.ts`: page text, recruitment
dates, the chapter list, every external link, and which image each slot uses.
Photos go in `public/images/` (there are `projects/` and `gallery/` subfolders
already), and you reference them by path without the `public` prefix. The club
roster, roles, and teams live in `lib/members.ts` — or, in practice, in the roster
sheet.

```
app/                 routes — one folder per page
  dashboard/         the member side (login-gated)
    directory/       member directory
    lineage/         big/little trees
    settings/        profile, contacts, Gmail/Calendar, roster (webmaster)
  projects/          the four team pages
  privacy/ terms/    legal pages
  api/lms/           dashboard endpoints:
                       tasks, events, overview, meta, profile, directory,
                       notifications, push, chat, announcements, newsletters,
                       messages, compose, gcal/*, gmail/*,
                       roster/sync, roster/export,
                       cron/reminders, cron/sheets
components/          shared UI (Navbar, Footer, Media, LmsBoard,
                     NotificationBell, ChatWidget, PushManager, …)
lib/
  content.ts         site text, links, image paths
  members.ts         the code roster, roles, and role labels
  auth.ts            NextAuth config + the login gate
  lms/               tasks, events, permissions, calendar, gmail, notify,
                     notifications, push, chat, directory, phone, roster, sheets
  lineage.ts         the big/little trees
public/
  images/            photos
  sw.js              push service worker
supabase-schema.sql  the full database schema (run in the Supabase SQL editor)
```

To run it locally:

```bash
npm install
npm run dev      # http://localhost:3000
```

The public pages run without any configuration. The dashboard needs environment
variables — in `.env.local` locally, or in Vercel's project settings for
production (a redeploy is required after changing them there):

| Variable | What it's for |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth (sign-in, Calendar, Gmail send) |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | NextAuth session config |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database (server-side only) |
| `CRON_SECRET` | Protects both cron endpoints |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (background notifications) |
| `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY` | Google Sheets service account |
| `DIRECTORY_SHEET_ID`, `TASK_SHEET_ID`, `ROSTER_SHEET_ID` | Optional — override the default sheet IDs |
| `SHEETS_SYNC_MODE` | `realtime` (default) or `cron` |
| `LMS_PREVIEW_EMAIL` | Optional: preview the dashboard as a given member in dev |

Without Supabase configured, the dashboard falls back to an in-memory store with
seeded demo data, which is handy for local development.

### Database

Run `supabase-schema.sql` in the Supabase SQL editor to create every table (it's
safe to re-run — everything is `if not exists`). Each table enables row-level
security and grants only the `service_role`. The tables are: `lms_tasks`,
`lms_events`, `lms_gcal`, `lms_gmail`, `lms_profiles`, `lms_announcements`,
`lms_announcement_reads`, `lms_newsletters`, `lms_newsletter_reads`,
`lms_newsletter_subscribers`, `lms_notifications`, `lms_push_subscriptions`,
`lms_chats`, `lms_chat_members`, `lms_messages`, `lms_contact_overrides`, and
`lms_roster`.

### Cron jobs (external scheduler)

Two endpoints, both authorised with `Authorization: Bearer <CRON_SECRET>`:

| Endpoint | Frequency | Does |
| --- | --- | --- |
| `POST /api/lms/cron/reminders` | every ~5 min | Sends due-date reminder emails |
| `POST /api/lms/cron/sheets` | hourly | Pulls the roster sheet in, then rebuilds all three sheets |
| `/api/lms/cron/files` | hourly | Syncs the Drive mirror, then extracts file text |

The files job takes longer than cron-job.org's 30-second limit, so it answers
**202 immediately** and finishes in the background (Vercel `waitUntil`, up to
60s; see `lib/lms/cron.ts`). Its result is saved in `lms_settings` as
`cron:files` and returned as `previous` on the next call, so the job history in
cron-job.org shows whether the last run worked. Add `?wait=1` to run it inline
and see the full result.

Both are idempotent, so a tight interval is fine. Use a dedicated cron service
(e.g. cron-job.org) rather than GitHub Actions, which throttles short-interval
schedules heavily and will silently stretch a 5-minute job to hours. Vercel's
built-in Cron only runs once a day on the Hobby plan.

### Background push

Generate a VAPID key pair with `npx web-push generate-vapid-keys`, set the three
`VAPID_*` variables, and members who allow notifications are subscribed
automatically. Without the keys, push no-ops and in-app notifications still work.
iOS only delivers web push if the member adds the site to their Home Screen —
an Apple limitation, not ours.

### Sending email

Club email sends through connected Gmail accounts (send-only). An officer connects
them from Settings — one for announcements and newsletters, one for notifications
and reminders. If the Google OAuth consent screen is in "Testing" mode, add the
sending accounts as test users; publishing to production also avoids the 7-day
refresh-token expiry Google applies in test mode, which otherwise makes email
"work, then quietly stop".

### Google Sheets service account

1. Google Cloud Console → **APIs & Services → Enable APIs** → enable **Google
   Sheets API**.
2. **IAM & Admin → Service Accounts → Create**. No project roles are needed —
   skip the optional grant steps.
3. On the account's **Keys** tab: **Add key → Create new key → JSON**, and keep
   the download safe.
4. Share **each** of the three sheets with the service account's `client_email`
   as an **Editor**. This share *is* the permission; nothing else grants it.
5. Set `GOOGLE_SA_EMAIL` and `GOOGLE_SA_PRIVATE_KEY` (paste the `private_key`
   value exactly, `\n` sequences and all) and redeploy.

### OAuth scopes

The app requests only:

```
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/gmail.send
```

The first three are non-sensitive; `calendar.events` and `gmail.send` are
sensitive but **not restricted**, so verification needs a justification and demo
video but no third-party security assessment. Don't add restricted scopes (any
Gmail read/modify scope, full Drive) without understanding that they trigger a
CASA assessment.
