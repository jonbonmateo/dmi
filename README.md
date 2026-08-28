# DMI — automated Digital Marketing Inspection

Turns a booked discovery call into a finished, evidence-backed Digital Marketing
Inspection for an automotive repair shop, and records it everywhere the manual
process records it today.

The design principle behind every decision in this repo: **a criterion earns a
point only when confirmed evidence shows it is met.** Anything the automation
could not establish is reported as an explicit, named uncertainty with a
question a person can answer in seconds — never as a guess, and never as a
silent failure.

---

**Contents** — [What it does](#1-what-the-solution-does) ·
[Architecture](#2-architecture-and-technology-choices) · [Setup](#3-setup) ·
[Environment](#4-required-credentials-and-environment-variables) ·
[Running](#5-how-to-run-it) · [Testing](#6-how-to-test-it) ·
[Live vs mocked](#7-live-vs-mocked) · [Interface](#8-the-interface) ·
[Security](#9-security) · [Scoring](#10-scoring) ·
[The phone criterion](#11-the-phone-criterion) · [Assumptions](#12-assumptions) ·
[Limitations](#13-known-limitations)

## 1. What the solution does

It replaces steps 2–10 of the current manual sequence:

| Manual step | Here |
| --- | --- |
| 2. Email notification arrives | Zapier posts the appointment to `POST /api/intake` |
| 3. Prospect info in GoHighLevel | Intake accepts GHL's field names directly and stores the prospect |
| 4. Added to DMI Tracking Spreadsheet | A `dmi_tracking_rows` record is created, mirrored to the Sheet via Zapier |
| 5. GHL record, notes, fields prepared | `syncGhl()` sets seven custom fields and appends a salesperson-readable note |
| 6. Ads Budget Card created | `dmi_budget_cards` record + Zapier push, with the derivation printed on it |
| 7. The DMI is completed | Four category steps, twenty criteria, evidence captured for each |
| 8. Scores + budget calculated | Unchanged 0–20 scoring and red/yellow/green bands, plus a transparent budget model |
| 9. DMI link added to the spreadsheet | The report URL is written into the tracking row |
| 10. Weekly status marked Completed | Set automatically — `Completed` when nothing is left for a human, `Needs Review` otherwise, flipping to `Completed` the moment the last question is answered |

The output is a web page at `/dmi/<runId>` written for a salesperson: shop
name, website, inspection date, profile links, all twenty criteria with a
plain-English verdict and the evidence behind it, per-category scores,
suggested ad budgets, the total, the colour band, and a link that goes straight
into the tracking spreadsheet. It prints cleanly to PDF.

### Signing in, and the mode you sign in to

The app is behind an account. There are three ways in — email + password,
Google, or a throwaway guest session — and immediately afterwards, one
question:

> **How should this session run?** Live, or mock?

That choice is written onto the session and **cannot be changed until you sign
out**. It is not a toggle in a settings page on purpose: whether a DMI was
built from real observations or from fixtures has to be a fact about the run,
not something someone might have flipped halfway through. Every page carries a
banner saying which mode is in force, every run row is tagged, and a mock
report says so above the fold.

Live mode is only offered when the deployment can actually do it. If a required
credential is missing the button is disabled and the screen prints the exact
steps to fix it, per service, with the environment variable named.

### What it explicitly refuses to do

- **Award a point it cannot evidence.** `finding()` enforces this in code: an
  outcome of `pass` with anything other than `confirmed` status is downgraded
  to `undetermined` before it can be scored. There is a test for it.
- **Auto-dial the shop.** See §11.
- **Claim "no Google ads" from an automated check.** Google's Ads Transparency
  Center has no API and forbids scraping, so that criterion is corroborated
  from on-site tags and then handed to a human with a one-click link.
- **Present its own citation approximation as the aggregator's score.** The 60%
  benchmark was calibrated against a paid tool; our first-party NAP comparison
  is labelled an approximation and routed to review.
- **Let a mock run pass for a real one.** In live mode the fixture files are
  never even read; a stale fixture masquerading as an observation is exactly
  the failure this system exists to prevent.

---

## 2. Architecture and technology choices

```
                    ┌──────────────────────────────────────────┐
  Person ─────────▶ │ /login   password · Google · guest       │
                    │ /mode    live or mock — once per session │
                    │ /onboarding  six-step tour, replayable   │
                    └────────────────────┬─────────────────────┘
                                         │ signed, httpOnly session cookie
                                         │ + CSRF double-submit + rate limits
                                         ▼
Discovery call booked in GoHighLevel
        │
        │  Zapier  ─── POST /api/intake  (x-dmi-secret, no session)
        ▼
  ┌───────────────────────────────────────────────────────────┐
  │ intake()                                                  │
  │  · normalises GHL/Zapier/form field names                 │
  │  · reports missing fields, never invents them             │
  │  · idempotency key = shop + domain + call day             │
  └───────────────────────┬───────────────────────────────────┘
                          ▼
  ┌───────────────────────────────────────────────────────────┐
  │ runPipeline()   8 checkpointed steps, resumable           │
  │                                                           │
  │  verify_business ─┐  ← gates everything downstream        │
  │  website          │                                       │
  │  seo              ├─ each writes a CategoryResult          │
  │  advertising      │   (5 findings, evidence, captured)     │
  │  social          ─┘                                       │
  │  score      → 0–20, red/yellow/green                      │
  │  budget     → Google Ads + LSA monthly recommendations    │
  │  publish    → tracking row · GHL · Ads Budget Card        │
  └───────────────────────┬───────────────────────────────────┘
                          ▼
  Supabase (Postgres)
        │
        ├─▶ /            inspections — sortable, filterable, searchable
        ├─▶ /dmi/<id>    the report a salesperson reads
        ├─▶ /review      open questions, grouped and filterable
        ├─▶ /tracking    the spreadsheet view
        └─▶ /setup       what is connected, and how to connect the rest
                          ▲
        Vercel Cron ─── GET /api/cron  (drains queued + stuck runs)
```

**Next.js 16 (App Router) on Vercel** — the report, the review queue and the
webhook are one deployable. Server Components read straight from the store, so
the report has no client-side data fetching at all.

**Self-hosted auth rather than Supabase Auth.** Sessions are opaque ids in an
HMAC-signed cookie, with every fact about the session (user, mode, expiry,
revocation) read from the database per request — so signing out or revoking a
session takes effect immediately, rather than whenever a self-contained token
happens to expire. It also means the whole app, sign-in included, still runs
with no Supabase project at all, which is what keeps the offline test suite
possible. Passwords are scrypt with per-password salts and parameters recorded
in the hash string.

**Supabase** for persistence. The tracking spreadsheet's source of truth is the
`dmi_tracking_rows` table, not the Sheet: a spreadsheet is a poor database and a
worse audit log. The Sheet stays in sync through Zapier, so the team keeps the
view they already use.

**Zapier** for the two directions where it genuinely earns its place: GoHighLevel
appointment → our webhook, and our records → Google Sheets / the budget-card
board. Everything in between is code, because retry semantics and partial
failure are the hard part and Zapier hides them.

**GoHighLevel** via the LeadConnector v2 API for contact custom fields and notes.

Three structural decisions worth calling out:

1. **A pluggable store.** `Store` is an interface with a Supabase driver and a
   file-backed local driver. The whole pipeline, including tracking rows and
   budget cards, runs with no accounts at all — which is what makes the offline
   test suite and `npm run seed` possible.
2. **Checkpointed steps.** Each step's output is written to `dmi_runs.steps` the
   moment it finishes. A crashed, timed-out or redeployed run resumes at the
   first unfinished step instead of re-crawling the shop's website. A step
   failing does not kill the run — its criteria come out `unable_to_evaluate`
   and everything else still reports.
3. **Mode is a property of the session, carried by AsyncLocalStorage.** Threading
   a `mock` flag through every provider signature would be forgotten in one of
   them eventually. Instead `withMode()` wraps the run and every provider reads
   `isMock()`. Concurrent runs in different modes cannot bleed into each other —
   there is a test that runs two at once to prove it — and a resumed run
   re-enters the mode it was created in rather than silently switching sources.
4. **Uncertainty is a first-class value, not an error.** `EvidenceStatus` is
   part of every finding, and `requires_human_review` items become rows in a
   queue with the exact question to answer. Answering one recomputes the score,
   the classification and the weekly tracking status in the same request.

---

## 3. Setup

```bash
git clone <this repo> && cd dmi
npm install
cp .env.example .env.local     # every value is optional
npm run seed                   # three sample DMIs, fully offline
npm run dev                    # http://localhost:3000
```

`npm run seed` needs no credentials and no internet. It loads three demo shops
that land green, yellow and red, exercising the pass, fail and
cannot-determine paths.

### First sign-in

Open the app and it will send you to `/login`. With no accounts yet, the form
opens on **Create account** and tells you this first one becomes the admin.
Passwords need 12+ characters; length is checked, not symbol soup.

Then you are asked to choose a mode. On a fresh laptop install **live mode will
be disabled** — there is no Google Places key — and the screen lists exactly
what is missing and how to fix it. Choose **mock mode** and the six-step tour
starts. You can replay it any time from the account menu.

To look around without an account at all, use **Continue as a guest**: a
two-hour, read-only session pinned to mock mode.

### Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → paste [`supabase/schema.sql`](supabase/schema.sql) → Run. It is
   idempotent, so re-running after a schema change is safe.
3. Project Settings → API → copy the **Project URL** and the **`service_role`**
   key into `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

RLS is enabled on all five tables with **no permissive policies**. The app uses
the service-role key from server code only, which bypasses RLS; a leaked anon
key reads nothing. The service-role key must never reach the browser — it is
only ever read in `src/lib/storage/supabase.ts`, which is server-only.

`GET /api/health` reports `storage.driver` — `supabase` once both variables are
set, `local` otherwise.

### Vercel

1. Import the repo. Framework preset: Next.js. No build overrides needed.
2. Add every variable from `.env.example` you intend to use, for Production and
   Preview.
3. Set `NEXT_PUBLIC_APP_URL` to the real deployment URL — the DMI link written
   into the tracking spreadsheet is built from it.
4. `vercel.json` already registers the cron (`/api/cron` every 10 minutes).
   Vercel injects `CRON_SECRET`; set the same value in the environment so the
   endpoint rejects anything else.
5. `/api/intake` and `/api/cron` declare `maxDuration = 300`. On Hobby the cap
   is 60s — an inspection that exceeds it is resumed by the next cron tick
   rather than lost, but Pro is the comfortable choice.

### GoHighLevel

1. Settings → Custom Fields → create seven text fields on the Contact object
   with exactly these keys (they are the constants in
   `src/lib/integrations/gohighlevel.ts`):
   `dmi_total_score`, `dmi_classification`, `dmi_report_link`,
   `dmi_inspection_date`, `dmi_google_ads_budget`, `dmi_lsa_budget`,
   `dmi_open_review_items`.
2. Settings → Private Integrations → new token with scopes
   `contacts.readonly`, `contacts.write`, `contacts/notes.write`. Copy it into
   `GHL_API_KEY`.
3. Copy the sub-account (location) id into `GHL_LOCATION_ID`.

Until both are set, the GHL step is a **dry run**: it composes the exact
payloads and returns them in the run's publish record, so the wiring is
reviewable before any credential exists.

### Zapier

**Zap 1 — discovery call in, DMI started.**
Trigger: GoHighLevel → *Appointment Created* (or your booking-form trigger).
Action: Webhooks by Zapier → *POST* to `https://<your-app>/api/intake`,
JSON payload, header `x-dmi-secret: <DMI_INTAKE_SECRET>`. Map: first name,
last name, email, phone, company/shop name, website, calendar name, appointment
start time, how-they-heard, what-they-dislike, contact id. Unrecognised fields
are preserved in the prospect's `extra` object rather than dropped.

**Zap 2 — tracking spreadsheet mirror.**
Trigger: Webhooks by Zapier → *Catch Hook*. Paste the hook URL into
`ZAPIER_TRACKING_WEBHOOK_URL`. Action: Google Sheets → *Create or update
spreadsheet row*, keyed on `row_id`. Incoming fields: `row_id`, `run_id`,
`shop_name`, `contact_name`, `email`, `phone`, `website`, `discovery_call_at`,
`inspection_date`, `dmi_score`, `classification`, `dmi_link`, `week_of`,
`weekly_status`.

**Zap 3 — Ads Budget Card.**
Trigger: Catch Hook → `ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL`. Action: whatever
board the team uses. Fields: `card_id`, `shop_name`, `google_ads_monthly_usd`,
`local_services_monthly_usd`, `total_monthly_usd`, `dmi_link`, `dmi_score`,
`classification`, `rationale`.

Without Zaps 2 and 3 the tracking row and budget card still exist in Postgres
and on the report; only the external mirror is skipped, and the report says so.

### Google Sign-In (optional)

1. Google Cloud Console → APIs &amp; Services → OAuth consent screen. Configure it
   (Internal is right if you have Workspace).
2. Credentials → Create credentials → OAuth client ID → **Web application**.
3. Authorised redirect URI — exactly this, including the path:
   `<NEXT_PUBLIC_APP_URL>/api/auth/google/callback`
   (locally: `http://localhost:3000/api/auth/google/callback`)
4. Copy the client id and secret into `GOOGLE_OAUTH_CLIENT_ID` and
   `GOOGLE_OAUTH_CLIENT_SECRET`.
5. Optionally set `AUTH_ALLOWED_DOMAINS=yourdomain.com` so only your team can
   sign in. Without it, any Google account with a verified address can.

The button only appears on the sign-in page when both variables are set.

### Google APIs

Both are in Google Cloud Console → *APIs & Services*:

- **PageSpeed Insights API** → API key → `PAGESPEED_API_KEY`. Works unkeyed at a
  low rate limit; the key just raises it.
- **Places API (New)** → API key → `GOOGLE_MAPS_API_KEY`. This one carries the
  most weight: it is how the shop's identity is verified and how the Google
  Business Profile and competitive-density inputs are gathered. Restrict the key
  to the Places API and to your Vercel deployment.

### Meta

developers.facebook.com → your app → Marketing API → app access token →
`META_AD_LIBRARY_TOKEN`. Note the coverage caveat in §10.

---

## 4. Required credentials and environment variables

Every variable is optional; each one turns a component from mocked to live.

| Variable | Purpose | Without it |
| --- | --- | --- |
| `AUTH_SECRET` | Signs session cookies | **Production refuses to boot.** Dev uses a known insecure key |
| `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` | Google Sign-In | Button hidden; password and guest sign-in still work |
| `AUTH_ALLOWED_DOMAINS` | Restrict sign-up to your domains | Any address may sign up |
| `AUTH_ALLOW_GUEST` / `AUTH_ALLOW_SIGNUP` | Feature switches (`0` disables) | Both enabled |
| `NEXT_PUBLIC_APP_URL` | Base for the DMI link, and the OAuth redirect | Defaults to `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Postgres store | Local JSON store in `.data/` |
| `PAGESPEED_API_KEY` | Lighthouse scores | Live but rate-limited; fixture fallback |
| `GOOGLE_MAPS_API_KEY` | Business verification, Google Business Profile, market density | Fixtures, else `unable_to_evaluate` + review task |
| `META_AD_LIBRARY_TOKEN` | Facebook/Instagram ad activity | Manual-review task with a deep link |
| `GHL_API_KEY` + `GHL_LOCATION_ID` | Contact fields + DMI note | Dry run; payloads returned in the run record |
| `ZAPIER_TRACKING_WEBHOOK_URL` | Google Sheets mirror | Database only |
| `ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL` | Budget card in the team's board | Database only |
| `DMI_INTAKE_SECRET` | Authenticates `/api/intake` | Endpoint is open |
| `CRON_SECRET` | Authenticates `/api/cron` | Endpoint is open |
| `DMI_FORCE_MOCK` | `1` = fixtures for everything, crawler included | Live fetching |
| `DMI_DATA_DIR`, `DMI_LOG_LEVEL` | Local store path, log verbosity | `.data`, `info` |

---

## 5. How to run it

**The demo, offline, no credentials:**

```bash
npm run seed && npm run dev
```

`/` lists the runs, `/dmi/<id>` is the report, `/review` is the queue.

**One shop from the command line:**

```bash
npm run dmi -- --shop "Precision Auto Care" \
               --website https://precisionautocare.example \
               --phone "(512) 555-0142" --mock

# against a real shop, using whatever credentials are configured
npm run dmi -- --shop "Some Real Shop" --website https://theirsite.com
```

**As an API.** Everything except the machine endpoints needs a session cookie
and the CSRF header, so `curl` needs a cookie jar:

```bash
# sign in and keep the cookies
curl -c jar.txt -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"your passphrase"}'

# choose a mode for the session (once)
CSRF=$(grep dmi_csrf jar.txt | awk '{print $7}')
curl -b jar.txt -X POST localhost:3000/api/auth/mode \
  -H "content-type: application/json" -H "x-dmi-csrf: $CSRF" \
  -d '{"mode":"mock"}'

curl -b jar.txt localhost:3000/api/runs
```

The intake and cron endpoints are machine-to-machine and use their own shared
secrets instead:

```bash
# start an inspection
curl -X POST http://localhost:3000/api/intake \
  -H 'content-type: application/json' \
  -H 'x-dmi-secret: <DMI_INTAKE_SECRET>' \
  -d '{"first_name":"Ray","company_name":"Miller'\''s Garage",
       "website_url":"millersgarage.example","email":"ray@millersgarage.example",
       "appointmentStartTime":"2026-09-03T18:30:00Z"}'

curl localhost:3000/api/health          # which components are live
curl localhost:3000/api/runs            # all inspections
curl localhost:3000/api/runs/<id>       # run + prospect + reviews + tracking + card
curl -X POST localhost:3000/api/runs/<id>/execute   # run or resume, synchronously
curl localhost:3000/api/review?status=open

# answer a review question; recomputes score, colour and weekly status
curl -X PATCH localhost:3000/api/review/<itemId> \
  -H 'content-type: application/json' \
  -d '{"status":"resolved","outcome":"pass","resolution":"Rita answered in two rings.","by":"jon"}'
```

---

## 6. How to test it

```bash
npm test          # unit tests, fully offline, no server
npm run test:e2e  # builds, then boots the real app and drives it
npm run test:all  # both
npm run typecheck
npm run lint
```

### Unit tests (`tests/*.test.ts`) — 61 tests

Fast, offline, no server, no network. They cover:

- **`tests/scoring.test.ts`** — the classification bands, and the invariant that
  a point cannot be awarded on unconfirmed evidence (asserted from both
  directions), plus human overrides.
- **`tests/intake.test.ts`** — GHL/Zapier field-name variants, missing fields
  being reported rather than defaulted, unknown form fields being preserved, and
  duplicate collapse across differing input spellings and timezones.
- **`tests/budget.test.ts`** — market tiering, and that the assumptions table
  stays monotonic and bounded.
- **`tests/providers.test.ts`** — URL normalisation, pixel/platform detection,
  social-link discovery (ignoring share and post URLs), posting frequency,
  phone comparison, Monday-based tracking weeks.
- **`tests/pipeline.e2e.test.ts`** — three shops end to end against fixtures:
  green scores green, red scores red, every finding carries timestamped
  evidence, the phone criterion goes to a human, a duplicate webhook starts no
  second run, a crashed run resumes without redoing finished steps, and
  answering a review question moves the score by exactly one point.
- **`tests/auth.test.ts`** — scrypt round-trips, salting, malformed hashes
  rejected rather than thrown, password-strength rules, session token signing
  and four kinds of tampering, guest TTLs, CSRF comparison, the persisted
  lockout (including that a success clears the streak and that lockouts are
  per-identifier), and the burst bucket.
- **`tests/table.test.ts`** — numeric vs natural text sorting ("Shop 2" before
  "Shop 10"), empties sorting last in *both* directions, no mutation of the
  caller's array, the asc → desc → off click cycle, multi-term search that
  narrows rather than widens, and facet filtering.
- **`tests/mode.test.ts`** — mode does not leak out of its scope, survives
  `await`, and two concurrent runs in different modes do not contaminate each
  other; guests cannot use live mode; readiness gates live mode and every check
  explains its consequence and its fix; and a run resumed from *outside* any
  mode scope re-enters the mode it was created in.

### End-to-end tests (`tests/e2e/*.e2e.test.mjs`)

These build the app and boot a real `next start` on a throwaway port with its
own data directory, so middleware, cookies, CSRF and rate limiting are met
exactly as a browser meets them. Each test client presents its own
`X-Forwarded-For` so per-IP limits do not cross-contaminate — the limiter
itself is exercised deliberately, from one client, in its own test.

**`api.e2e.test.mjs`** — 22 tests over HTTP:

- anonymous callers get 401 on APIs and a redirect (preserving `?next=`) on
  pages; every security header is asserted by name
- the first account becomes admin, the second a member; duplicate addresses are
  refused; weak passwords come back with specific reasons
- a wrong password and an unknown address return **byte-identical** errors
- repeated failures on one address produce a 429 with `Retry-After`
- live mode is refused with **412** and the missing check named; mock mode
  starts; a second mode change is refused with **409**; sign-out then sign-in
  brings the question back
- guests read but get **403** on writes and cannot escalate to live
- a mutating request without the CSRF header is refused; a revoked session stops
  working immediately; a forged cookie is rejected
- answering a review question moves the score by exactly one and records the
  *signed-in* user, ignoring a deliberately falsified `by` field
- the intake webhook still works unauthenticated and still collapses duplicates

**`ui.e2e.test.mjs`** — 16 tests in real Chromium, asserting zero console errors
on every page it visits:

- anonymous → `/login`; guest button works; a bad password shows the error
- the live-mode button is **disabled** and "How do I fix this?" names
  `GOOGLE_MAPS_API_KEY`
- choosing mock leads into the tour; revisiting `/mode` redirects away
- the tour steps through and finishing it stops it reappearing
- the dashboard shows three seeded rows and the mock banner; sorting by score
  really reorders ascending then descending; search narrows to one row and the
  count updates; the band facet filters; no-match shows a message
- a report renders exactly 20 criteria and says it used mock data
- answering a question by clicking raises the score on the dashboard
- the tracking sheet filters by weekly status
- sign-out returns to login and the session is gone

Manual smoke test of the full loop:

```bash
npm run seed && npm run dev
# sign up → choose mock mode → skip the tour
# open the green inspection → 16/20, "could reach 19 after review"
# open /review, answer the four questions
# back to /  → 19/20, state completed, weekly status Completed
```

---

## 7. Live vs mocked

| Component | Status | Notes |
| --- | --- | --- |
| Website crawl, HTML parsing | **Live** | Real fetch with a declared UA; bot walls detected and reported, never silently treated as a pass |
| Platform / CMS / pixel detection | **Live** | 28 signatures matched against markup we already downloaded |
| PageSpeed / Lighthouse | **Live** | Real API; unkeyed works at a low rate limit |
| Blog, service pages, on-page SEO | **Live** | Real crawl of the blog index and up to three sampled service pages |
| Business verification | **Live with a key** | Google Places (New); fixture fallback, else `unable_to_evaluate` |
| Google Business Profile | **Partly live** | Places gives optimisation elements; **Posts cadence has no API** → review task |
| Local citations | **Approximation + manual** | No free aggregator API; our first-party NAP check is labelled an approximation, never the aggregator's number |
| Meta ad activity | **Live with a token** | Ad Library Graph API; coverage caveat in §10 |
| Google ad activity | **Manual, by design** | No public API and scraping the Transparency Center is against its terms; on-site tags are gathered as corroboration and a one-click verify link is provided |
| Meta Pixel / retargeting | **Live** | Read from homepage markup |
| Phone answered by a person | **Manual, by design** | See §9 |
| Social profile discovery | **Live** | Harvested from the shop's own website markup |
| Social About / posts / engagement | **Fixture or manual** | Meta gates logged-out profiles; nothing is estimated |
| Scoring, classification | **Live** | Pure functions, unit-tested |
| Budget model | **Live, documented assumptions** | Density measured from Places; CPC/conversion rates from a versioned assumptions table, printed on the report |
| Authentication | **Live** | Self-hosted: scrypt passwords, HMAC session cookies, CSRF, rate limiting — no external service |
| Google Sign-In | **Live with credentials** | Button hidden when the OAuth client is not configured |
| Guest sessions | **Live** | Real short-lived accounts, read-only, pinned to mock mode |
| Supabase store | **Live with credentials** | Local JSON store otherwise |
| Tracking row + weekly status | **Live** | In Postgres always; Sheet mirror needs the Zapier hook |
| GoHighLevel sync | **Live with credentials** | Dry run otherwise, with payloads shown |
| Ads Budget Card | **Live** | In Postgres always; external card needs the Zapier hook |

Demo fixtures live in `fixtures/<domain>.json` and include the page HTML, so a
mock-mode session runs the entire pipeline with no network. Every
fixture-derived observation is tagged `[MOCK]` in its evidence, the banner is
purple on every page, each run row is tagged, and a mock report carries a
callout above the fold.

**Live mode never touches the fixture files.** Every provider gates its fixture
fallback on `isMock()`, so a stale fixture cannot masquerade as a real
observation in a live run — it degrades to `unable_to_evaluate` and a review
question instead.

---

## 8. The interface

Five pages, one shell. The mode banner sits above everything, in purple for
mock and teal for live, and it says in words what the mode means rather than
just naming it.

| Page | What it is for |
| --- | --- |
| `/` **Inspections** | Every DMI, with counts by band. Sortable on any column, faceted by band, state, data source and weekly status, and free-text searchable. |
| `/dmi/<id>` **Report** | The salesperson-facing document: verification, twenty criteria with evidence, budgets, and where it was recorded. Prints cleanly to PDF. |
| `/review` **Review queue** | The open questions. Filter by shop, area or status; answer in place. |
| `/tracking` **Tracking sheet** | The spreadsheet view: scores, links, week-of and weekly status. |
| `/setup` **Setup** | What is connected, what breaks when it is not, and the steps to fix it. |

**Tables.** Sorting, filtering and search are one component (`DataTable`) over
pure functions in `src/lib/table.ts`, so every table behaves identically and the
logic is unit-tested without a DOM. Numbers sort numerically; text sorts
naturally, so "Shop 2" comes before "Shop 10"; and empty cells sort last in
*both* directions, because an absent value is not a small one. Headers carry
`aria-sort`, and the result count is announced with `aria-live`.

**Readability.** A 16px base with a 1.65 line height, a type scale that stops at
four sizes, and colour reserved almost entirely for the four status states so
they carry meaning rather than decoration. Focus rings are visible and
consistent, there is a skip link, `prefers-reduced-motion` is honoured, and the
whole thing has a dark theme that follows the system setting.

## 9. Security

**Authentication.** Email + password (scrypt, 2^15 cost, per-password salt),
Google OAuth 2.0 with PKCE and a state check, or a guest session. The first
account created on an empty deployment becomes the admin; everyone after is a
member. `AUTH_ALLOWED_DOMAINS` optionally restricts sign-up to your own domains.

**Sessions.** An opaque id plus an HMAC, in an `httpOnly`, `SameSite=Lax`,
`Secure` (in production) cookie. Twelve hours for members, two for guests.
Revocation is immediate because the session record is consulted on every
request. In production the app refuses to boot without `AUTH_SECRET` rather
than falling back to a known development key.

**Rate limiting**, in two layers, because they stop different things:

| Layer | Scope | Behaviour |
| --- | --- | --- |
| Persisted lockout | per email **and** per IP, in the database | 5 failures in 15 minutes → lockout, doubling 1 → 30 min with each further failure. A success clears the streak. |
| In-memory token bucket | per instance | 10 logins/min per IP, 5 signups/min, 5 guest sessions/min, 120 API calls/min per session, 10 inspections/min. |

Counting the email and the IP separately matters: one attacker must not be able
to lock out every user by guessing at addresses, and one user's own mistakes
must not be hideable behind a rotating proxy.

**Account enumeration.** A wrong password and an unknown address return an
identical message, and the unknown-address path burns the same scrypt work so
the timing matches. There is a test asserting the two responses are byte-equal.

**CSRF.** Double-submit: the session cookie is `httpOnly`, a second cookie holds
a per-session token that JS can read, and every mutating request must echo it in
`x-dmi-csrf`. A cross-site attacker can cause a request but cannot read the
token. Enforced centrally in `requireAuth`, so it cannot be forgotten one
endpoint at a time.

**Authorisation.** Guests read; only `admin`/`member` write. Guests cannot reach
live mode at all, because live mode spends real API quota and writes to the real
CRM. Audit fields record the *signed-in* user, never a client-supplied name —
asserted in the e2e suite by sending a false `by` value and checking it is
ignored.

**Headers** (middleware, every response): a CSP with `object-src 'none'`,
`frame-ancestors 'none'` and a per-request script nonce in production;
`X-Frame-Options: DENY`; `X-Content-Type-Options: nosniff`;
`Referrer-Policy: strict-origin-when-cross-origin`; a `Permissions-Policy`
denying camera/mic/geolocation/payment; `Cross-Origin-Opener-Policy`; HSTS with
preload; and `Cache-Control: private, no-store` so no proxy caches a
session-rendered page.

**Database.** RLS is enabled on all eight tables with **no permissive policies**.
The app uses the service-role key from server code only; a leaked anon key can
read nothing, including the password-hash column.

**Input handling.** Every request body is parsed with a zod schema. The intake
webhook takes a shared secret; the cron endpoint takes its own. Outbound
crawling declares a real user agent and treats a bot wall as `unable_to_evaluate`
rather than trying to evade it.

**What is deliberately not done:** there is no password reset (no mail
transport is configured — an admin re-creates the account), no 2FA, and no
per-shop tenancy. See §13.

## 10. Scoring

Unchanged from the manual DMI, and deliberately so:

- 1 point per satisfied criterion, 5 per category, 20 total
- **1–10 Red**, **11–15 Yellow**, **16–20 Green**

### A proposed improvement, kept separate

The existing output is preserved exactly. Alongside it the report shows a
second number: **the potential score**.

A 0–20 total collapses two very different situations. "We checked and the shop
has no blog" and "the blog is behind Cloudflare and we could not read it" both
cost a point, but only one is a finding you can sell against. So each run also
reports `potentialTotalScore` — the confirmed score plus every criterion that is
still `undetermined` — and the report renders it as *"16/20 · could reach 19/20
after review"*.

Three things follow from it:

1. The salesperson knows how solid the number is before they walk into the call.
2. The colour band is always computed from the **confirmed** score, so it can
   only improve as questions are answered — a DMI never gets worse in front of
   the prospect.
3. The gap between the two numbers is a direct measure of how much of the
   inspection the automation is actually covering, per shop and in aggregate. It
   is the metric to drive down over time.

If you want it in the tracking spreadsheet, it is already on the run object; add
`potential_total_score` to the Zapier field mapping.

---

## 11. The phone criterion

Advertising criterion 5 — *a real person answers the shop's phone* — is
deliberately **not** automated. Three reasons, in order of weight:

1. **Legal.** An automated outbound call to a business line is a robocall under
   the TCPA unless a human initiates it. Doing it at scale from a server is
   exactly the pattern the FCC enforces against.
2. **Accuracy.** "A real person answered" is a judgement about tone, hold time
   and whether they could actually book you in. A speech classifier guessing at
   that is precisely the invented certainty this system exists to avoid.
3. **Relationship.** This is a prospect a salesperson is about to call anyway. A
   mystery-shop call is a natural part of that conversation, not a robot's job.

What *is* automated: pulling the number to call from the verified sources, and
gathering every lead-response signal observable without dialling — online
booking software, booking links, live chat, call tracking, published hours. Those
go on the report as context, and a single question lands in the review queue:

> Call (512) 555-0142 as a customer. Did a real person answer, and could they
> book you in?
> Record: who answered (person / voicemail / IVR / no answer), rings before
> pickup, and whether they offered an appointment.

Answering it awards or withholds the point and updates the score immediately.

If the agency later wants this automated, the honest version is a
human-initiated click-to-call from the review queue with recording consent, not
an unattended dialler.

---

## 12. Assumptions

- **One DMI per shop + website + discovery-call day.** Two calls a month apart
  are two inspections; a Zapier retry is not.
- **A shop name is the only required intake field.** Everything else missing is
  reported as missing. A DMI with no website is a legitimate, very red result.
- **Brand-wide vs per-location.** Website, ads and social findings are treated
  as brand-wide; Google Business Profile and citations are per-location. When
  multiple locations are detected the report lists them and asks which one the
  call is about.
- **Benchmarks match the manual process.** Performance ≥ 80 on both mobile and
  desktop; citations ≥ 60%; blog updated monthly (45-day tolerance, so a shop
  posting on the 1st is not failed on the 32nd); 3+ social posts per week; 3+
  distinct Google ads.
- **Thresholds the manual form leaves to judgement**, chosen once and stated on
  every report: a service page needs 300+ words to count as "original content";
  on-page SEO is "consistent" at 70% of checks passing; imagery is "primarily
  stock" above 30%; authentic social content must be more than half of posts.
- **The budget model** sizes campaigns to add 25 incremental repair orders a
  month, split two-thirds paid search / one-third LSA, at 12 clicks or 4 LSA
  leads per booked RO, with CPC and cost-per-lead from a versioned assumptions
  table (`src/lib/providers/keyword-demand.ts`) and market tier measured from
  local competitive density. Results are clamped to $750–$8,000 (Google) and
  $500–$4,000 (LSA). Every input is printed on the report so a human can
  disagree with a specific number rather than the whole figure.
- **The tracking spreadsheet's source of truth is Postgres**, mirrored to Sheets.
- **Weeks start on Monday** for the weekly status column.

---

## 13. Known limitations

- **Google ad activity cannot be confirmed automatically.** No public API;
  scraping the Ads Transparency Center is against its terms. Criteria 1 and 3
  are corroborated from on-site tags and resolved by a human in about ten
  seconds. On-site tags prove Google Ads is *configured*, never that it is
  *currently spending*.
- **The Meta Ad Library API guarantees coverage only for issue/political ads**
  outside the EU. A miss is evidence of absence, not proof, and the report says
  so in those words.
- **Meta gates logged-out profiles.** About sections, cover images, post history
  and engagement are not retrievable without a Page access token for a Page the
  agency manages. Four of the five social criteria therefore route to human
  review on a live run unless a fixture supplies the observations. This is the
  single biggest gap; the fix is a Meta app review for `pages_read_engagement`,
  or accepting a per-shop manual pass.
- **Citation scoring needs a paid aggregator.** Our approximation compares the
  NAP the shop publishes against the Google profile — directional only, and
  never presented as the aggregator's number the 60% benchmark was set against.
- **Google Posts cadence has no API**, so "updated at least weekly" on the
  Business Profile is always a human check.
- **Design quality and content originality are judgement calls.** Template
  detection and word counts get close; "does it reflect the shop's brand" and
  "is this copy the vendor's boilerplate" are asked of a person, with the exact
  check to run.
- **JavaScript-rendered sites are under-read.** The crawler parses HTML, not a
  rendered DOM, so CSS-background imagery and client-rendered content can be
  missed. Detected as "0 images found" and routed to review rather than scored
  as a fail. A headless-browser step is the obvious upgrade.
- **Screenshots are not captured.** The evidence model has a `screenshotUrl`
  field and the report renders it; nothing populates it yet. It needs a headless
  browser plus Supabase Storage.
- **Serverless duration.** A full inspection is roughly 10–60 seconds depending
  on how many pages are sampled and whether PageSpeed runs live. On Vercel Hobby
  (60s) a slow run can be cut short — it resumes on the next cron tick, but Pro
  is the right choice for production.
- **The local JSON store is single-process.** Writes are serialised in-process,
  which is fine for development and the test suite and wrong for anything
  concurrent. Use Supabase in production.
- **No password reset.** No mail transport is configured, so a forgotten
  password means an admin re-creates the account (or the user signs in with
  Google at the same verified address, which links to the same account). Adding
  reset means adding an email provider and a signed, single-use token.
- **No 2FA**, and no account-management screen — roles are assigned by order of
  creation (first user is admin) and changed in the database.
- **No per-shop tenancy.** Every signed-in user sees every inspection. Fine for
  one agency; wrong the moment this is offered to clients.
- **The in-memory burst limiter is per instance.** On Vercel that means a
  serverless fan-out gets a proportionally larger burst allowance. The persisted
  lockout — the layer that actually stops credential stuffing — is shared,
  because it lives in the database.
- **The CSP allows `'unsafe-inline'` for styles**, which Next.js requires for
  its injected styles. Scripts use a nonce with `strict-dynamic` in production.
