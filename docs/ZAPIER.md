# Zapier Integration

Full reference for the three Zaps that connect DMI to the rest of the stack:
getting a booked discovery call *into* DMI, and mirroring DMI's results back
out to the Google Sheet and the Ads Budget Card board the team already uses.
For what DMI writes directly onto the GoHighLevel contact (no Zapier
involved), see [GOHIGHLEVEL.md](./GOHIGHLEVEL.md).

**Contents**
- [Why Zapier, and only for these two directions](#why-zapier-and-only-for-these-two-directions)
- [The three Zaps at a glance](#the-three-zaps-at-a-glance)
- [Zap 1 — discovery call in, DMI started](#zap-1--discovery-call-in-dmi-started)
- [Zap 2 — tracking spreadsheet mirror](#zap-2--tracking-spreadsheet-mirror)
- [Zap 3 — Ads Budget Card](#zap-3--ads-budget-card)
- [Authentication on each direction](#authentication-on-each-direction)
- [Idempotency and duplicate protection](#idempotency-and-duplicate-protection)
- [What happens if a Zap fails or is missing](#what-happens-if-a-zap-fails-or-is-missing)
- [Testing each Zap](#testing-each-zap)
- [Troubleshooting](#troubleshooting)
- [Field reference tables](#field-reference-tables)
- [Source files](#source-files)

---

## Why Zapier, and only for these two directions

DMI's own code handles everything else — the four review categories,
scoring, the budget model, and writing directly onto the GoHighLevel contact
(see [GOHIGHLEVEL.md](./GOHIGHLEVEL.md)). Zapier is used for exactly the two
edges where it earns its place over custom code:

1. **GoHighLevel appointment → DMI.** GoHighLevel's appointment-booked event
   is a trigger Zapier already understands natively; there's no reason to
   build and maintain a GoHighLevel webhook subscription by hand when Zapier
   already has the trigger built.
2. **DMI results → Google Sheets / your budget-card board.** These are
   destinations the team already uses and already knows how to edit. Writing
   directly to the Google Sheets API or to whatever specific board tool the
   team uses would mean maintaining that integration's auth and quirks
   inside DMI for no benefit — Zapier's Sheets and general-purpose actions
   already do this well, and swapping destinations (a different sheet, a
   Trello board instead of Notion) becomes a five-minute Zap edit instead of
   a code change.

Everything **between** those two edges — the actual inspection, the scoring,
the retry logic, the review queue — is code, on purpose: that's where the
hard parts (partial failure, resumability, idempotency) live, and hiding
those inside Zapier's black box would make them much harder to reason about
and test.

## The three Zaps at a glance

| Zap | Trigger | Action | Direction |
| --- | --- | --- | --- |
| **1. Intake** | GoHighLevel appointment booked | Webhook POST to `/api/intake` | GoHighLevel → DMI |
| **2. Tracking mirror** | Webhook Catch Hook (from DMI) | Google Sheets: create/update row | DMI → Google Sheets |
| **3. Ads Budget Card** | Webhook Catch Hook (from DMI) | Whatever board the team uses | DMI → Budget board |

Zaps 2 and 3 are **optional**. Without them, DMI still records the tracking
row and the budget card in its own database and shows them on the report —
only the external mirror to Sheets/the board is skipped. Zap 1 is how DMI
receives new work at all; without it, you'd need to POST to `/api/intake`
some other way (manually, via `curl`, or via the CLI script) for anything to
happen.

---

## Zap 1 — discovery call in, DMI started

**Trigger:** GoHighLevel → *Appointment Created* (or *Contact Created* / a
custom booking-form trigger, if that's what fires when a discovery call is
booked in your setup).

**Action:** Webhooks by Zapier → **POST**

- **URL:** `https://<your-app>/api/intake`
- **Payload type:** JSON
- **Headers:** `x-dmi-secret: <DMI_INTAKE_SECRET>` (see
  [Authentication](#authentication-on-each-direction) — required once you've
  set `DMI_INTAKE_SECRET`, which you should before going live)
- **Data:** map the fields below from the GoHighLevel trigger's available
  fields

### Field mapping

DMI's intake endpoint accepts both `camelCase` and `snake_case` versions of
every field (and a couple of alternate names GoHighLevel itself sometimes
uses), so you can map whichever Zapier presents from the trigger step. Only
the shop name is required — everything else is optional, and anything
missing is explicitly reported on the resulting DMI rather than silently
skipped (see the [main README's uncertainty
handling](../README.md#12-assumptions)).

| DMI field | Accepted incoming names | Example value | Required? |
| --- | --- | --- | --- |
| First name | `firstName` / `first_name` | `Ray` | optional |
| Last name | `lastName` / `last_name` | `Miller` | optional |
| Email | `email` | `ray@millersgarage.example` | optional, but strongly recommended — used for GoHighLevel contact matching |
| Phone | `phone` | `(419) 555-0188` | optional |
| Shop / business name | `shopName` / `shop_name` / `companyName` / `company_name` / `businessName` | `Miller's Garage` | **required** — this is the only field DMI needs to start |
| Website | `website` / `websiteUrl` / `website_url` | `millersgarage.example` | optional — works with or without `https://` |
| Meeting type | `meetingType` / `meeting_type` / `calendarName` | `Discovery Call` | optional |
| Discovery-call date/time | `discoveryCallAt` / `discovery_call_at` / `appointmentStartTime` / `startTime` | `2026-09-03T18:30:00Z` | optional — any parseable date string |
| How they heard about you | `heardAboutUs` / `heard_about_us` / `howDidYouHear` | `Referred by another shop owner` | optional |
| What they want to improve | `marketingPainPoint` / `marketing_pain_point` / `whatDoYouDislike` | `Our website looks dated and we never post anything.` | optional |
| GoHighLevel contact ID | `ghlContactId` / `contact_id` / `contactId` | `PIBWiL84wZ2ZSAqM1Bcp` | optional, but recommended — see [GOHIGHLEVEL.md → contact matching](./GOHIGHLEVEL.md#contact-matching-logic) |
| GoHighLevel opportunity ID | `ghlOpportunityId` / `opportunity_id` | `9wQjLIRPzq1e6mAmzVBs` | optional |
| Free-text notes | `notes` | `Currently running $500/mo on FB.` | optional — merged into the prospect's extra data |

**Anything else** you include in the payload — a custom form field DMI
doesn't know about, e.g. `numberOfBays` or `dmsSystem` — is preserved rather
than dropped, stored on the prospect record's `extra` field for later
reference. You do not need to strip unmapped fields out of the Zap.

### What the response looks like

`/api/intake` responds immediately (it does not wait for the inspection to
finish):

```json
{
  "runId": "dmi_a1e9fc9306be46d8874e",
  "prospectId": "psp_f65382f2e3174ab8bbe0",
  "shopName": "Miller's Garage",
  "duplicate": false,
  "state": "queued",
  "missingIntakeFields": [],
  "reportUrl": "https://dmi.yourapp.com/dmi/dmi_a1e9fc9306be46d8874e",
  "message": "DMI queued. The report URL is live immediately and fills in as the inspection progresses."
}
```

- HTTP **202** for a new inspection, HTTP **200** if it collapsed onto an
  existing one (see [Idempotency](#idempotency-and-duplicate-protection)).
- `reportUrl` is usable immediately — the report page renders as soon as
  each pipeline step completes, so opening it right after the webhook fires
  shows a run in progress rather than an error.
- If you want Zapier to do anything with the result (e.g. post the
  `reportUrl` into a Slack channel, or as a next step in the same Zap),
  these are the fields available to reference from the webhook action's
  output.

### A note on timing

The webhook returns in well under a second — the actual inspection (crawling
the website, calling Google/Meta APIs, scoring) runs in the background on
the server after the response is sent. Do not build a Zap step that waits
for the DMI to be "done" before continuing; if you need to react to
completion, watch the tracking sheet (Zap 2's destination) for the row's
weekly status changing to `Completed`, or poll `GET /api/runs/:id`.

---

## Zap 2 — tracking spreadsheet mirror

**Trigger:** Webhooks by Zapier → **Catch Hook**. Create this trigger first
— Zapier will give you a unique webhook URL. Copy that URL into the
`ZAPIER_TRACKING_WEBHOOK_URL` environment variable on your DMI deployment.

**Action:** Google Sheets → **Create Spreadsheet Row**, or **Create or
Update Spreadsheet Row** if your Sheets connector supports it (recommended —
see below on why "or update" matters).

- Pick the spreadsheet and worksheet the team already uses as the DMI
  Tracking Spreadsheet.
- **Key column for updates:** `row_id`. DMI sends the same `row_id` every
  time a given tracking row changes (created once, then updated in place
  as the score finalises and the weekly status changes), so using "Create or
  Update" keyed on `row_id` avoids duplicate rows piling up in the sheet.
  If your Zapier plan or Sheets connector only offers a plain "Create Row"
  action, you'll get a new row on every write instead of an update — pick
  "Update Row" as a second, separate Zap watching the same hook if you need
  updates without duplication, or upgrade to a connector that supports
  upsert-by-key.

### When this fires

Every time a DMI's tracking row is created or changed — which happens: once
right after the inspection starts (so the shop shows up on the sheet
immediately, before scoring finishes), and again every time the weekly
status flips (e.g. from "Needs Review" to "Completed" the moment the last
open question is answered).

### Field mapping

| Sheet column | Incoming field | Example value | Notes |
| --- | --- | --- | --- |
| Row ID | `row_id` | `trk_9c2f1a...` | Use as the **key** for update-in-place |
| Run ID | `run_id` | `dmi_a1e9fc...` | Internal DMI run identifier |
| Shop Name | `shop_name` | `Miller's Garage` | |
| Contact Name | `contact_name` | `Ray Miller` | First + last name, joined |
| Email | `email` | `ray@millersgarage.example` | |
| Phone | `phone` | `(419) 555-0188` | |
| Website | `website` | `https://millersgarage.example` | Resolved/verified URL when available, otherwise as submitted |
| Discovery Call | `discovery_call_at` | `2026-09-03T18:30:00.000Z` | ISO timestamp |
| Inspection Date | `inspection_date` | `2026-08-28` | Date the DMI was run |
| DMI Score | `dmi_score` | `16` | Out of 20, confirmed score only |
| Classification | `classification` | `green` | `red` / `yellow` / `green` |
| DMI Link | `dmi_link` | `https://dmi.yourapp.com/dmi/dmi_a1e9fc...` | Direct link to the full report |
| Week Of | `week_of` | `2026-08-31` | Monday of the discovery-call week, `YYYY-MM-DD` |
| Weekly Status | `weekly_status` | `Needs Review` | `Not Started` / `In Progress` / `Needs Review` / `Completed` |

**On a weekly-status-only update** (the last review question got answered,
after the DMI was already recorded), DMI sends a smaller payload with just
`row_id`, `run_id`, `weekly_status`, and `dmi_link` — map those same four
columns; the others simply won't be present in that particular webhook call,
which is fine for an update-by-key action.

### Why "Weekly Status" flips on its own

DMI computes `weekly_status` automatically:

- **`Needs Review`** — the inspection is complete, but one or more of the
  twenty criteria couldn't be confirmed and are waiting on a human answer in
  the [review queue](../README.md#8-the-interface).
- **`Completed`** — every criterion is resolved (either confirmed
  automatically, or answered by a human). This flips the moment the *last*
  open question for that inspection gets answered — no manual step needed.

You never need a Zap to set this column; DMI pushes the update itself the
instant the state changes.

---

## Zap 3 — Ads Budget Card

**Trigger:** Webhooks by Zapier → **Catch Hook**. Copy the generated URL
into `ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL`.

**Action:** whatever the team's board actually is. This Zap is intentionally
open-ended — DMI doesn't assume a specific tool. Common choices:

- **Trello** → Create Card, one list per pipeline stage.
- **Notion** → Create Database Item.
- **Asana / ClickUp / Monday.com** → Create Task/Item.
- **GoHighLevel Opportunity** → Create/Update Opportunity, if the team tracks
  ad budgets as part of the sales pipeline rather than a separate board.
- **Slack** → Post Message, if "the board" is really just a channel someone
  reads.

### Field mapping

| Card/item field (suggested) | Incoming field | Example value |
| --- | --- | --- |
| Card title | `shop_name` | `Miller's Garage` |
| Card ID (internal) | `card_id` | `card_71f5d2f3e3fb466fa669` |
| Run ID | `run_id` | `dmi_a1e9fc...` |
| Contact email | `contact_email` | `ray@millersgarage.example` |
| Google Ads budget | `google_ads_monthly_usd` | `900` |
| Local Services Ads budget | `local_services_monthly_usd` | `750` |
| Total monthly budget | `total_monthly_usd` | `1650` |
| Link back to DMI | `dmi_link` | `https://dmi.yourapp.com/dmi/dmi_a1e9fc...` |
| DMI score (context) | `dmi_score` | `11` |
| Classification (context) | `classification` | `yellow` |
| Rationale (full text) | `rationale` | *(long text — see below)* |

`rationale` is the full, multi-paragraph explanation of how both budget
numbers were derived (market tier, competitor density, clicks-per-repair-
order, the works) — the same text shown in the "Model inputs" section of the
DMI report. It's long; map it to a description/notes field on your card
rather than the title.

### When budgets can't be produced

If the pipeline couldn't build a defensible budget recommendation (most
commonly: no verified business location, so local competitive density
couldn't be measured), `google_ads_monthly_usd`, `local_services_monthly_usd`
and `total_monthly_usd` will all be `null`. Design the Zap's action (or a
Zapier Filter step ahead of it) to handle that gracefully — e.g. skip
creating a card entirely when `total_monthly_usd` is empty, or create it with
a "needs review" label instead of a dollar figure.

---

## Authentication on each direction

**Zap 1 (GoHighLevel → DMI):** DMI's `/api/intake` endpoint checks for a
shared secret. Set `DMI_INTAKE_SECRET` on your DMI deployment (generate one
with `openssl rand -hex 24`), then add a header to Zap 1's webhook action:

```
x-dmi-secret: <the same value>
```

If `DMI_INTAKE_SECRET` is left unset, the endpoint is open to anyone who
finds the URL — fine for local development, wrong for production. Once set,
a request without the matching header gets HTTP 401.

**Zaps 2 and 3 (DMI → Zapier):** these are the reverse direction — DMI is
calling *Zapier's* webhook URL, which Zapier's Catch Hook trigger generates
per-Zap and which is itself the secret (anyone who has the URL can trigger
that Zap, so treat `ZAPIER_TRACKING_WEBHOOK_URL` and
`ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL` as sensitive values — they go in
environment variables, never committed to source control, same as any other
credential).

---

## Idempotency and duplicate protection

Zapier retries failed webhook deliveries, and a flaky network can cause a
trigger to fire twice for the same real-world event. DMI is built to make
that harmless on the intake side:

- Every inspection has an **idempotency key** derived from the shop name,
  the website domain, and the discovery-call date (see
  [`src/lib/intake.ts`](../src/lib/intake.ts)).
- A second `/api/intake` call with the same shop + website + call day
  **does not** start a second inspection — it returns the *existing* run
  (HTTP 200, `duplicate: true`) instead of a new one (HTTP 202,
  `duplicate: false`).
- A different discovery-call date for the same shop **is** treated as a new,
  separate inspection — re-engaging a past prospect months later correctly
  gets its own DMI.

This means Zap 1 can safely retry on failure (Zapier's default behavior)
without ever double-booking an inspection or double-billing your API quota
for the same shop.

Zaps 2 and 3 don't need similar protection on DMI's end — they're DMI
*sending* a webhook to Zapier, and if the Sheets/board action itself is
keyed by `row_id`/`card_id` (see each Zap's field mapping above), a retried
Zap run safely updates the same row/card rather than creating a duplicate.

---

## What happens if a Zap fails or is missing

| Zap | If it's not set up | If it fails at runtime |
| --- | --- | --- |
| 1 (Intake) | No inspections start at all — this is the entry point | Zapier's own retry/error handling applies; DMI never sees a failed delivery |
| 2 (Tracking mirror) | The tracking row still exists in DMI's database and shows on the `/tracking` page — only the Google Sheet copy is missing | The report shows `unable_to_evaluate` with the HTTP status or error from Zapier's endpoint; the DMI itself is unaffected |
| 3 (Budget Card) | The budget numbers still exist in DMI's database and show on the report — only the external card is missing | Same as above — recorded as a publish-step warning, does not fail the run |

Both Zaps 2 and 3 run in parallel with the GoHighLevel sync
(`Promise.all` in [`publish.ts`](../src/lib/pipeline/steps/publish.ts)), so a
slow or down Zapier webhook can't block or delay the other outputs.

---

## Testing each Zap

**Zap 1**, without touching a real deployment:

```bash
curl -X POST http://localhost:3000/api/intake \
  -H 'content-type: application/json' \
  -H 'x-dmi-secret: <DMI_INTAKE_SECRET>' \
  -d '{
    "first_name": "Ray",
    "company_name": "Miller'\''s Garage",
    "website_url": "millersgarage.example",
    "email": "ray@millersgarage.example",
    "appointmentStartTime": "2026-09-03T18:30:00Z"
  }'
```

Or trigger it for real: use Zapier's "Test trigger" on the GoHighLevel step
with a real recent appointment, then "Test action" on the webhook step — you
should get a 202 response with a `reportUrl` you can open immediately.

**Zaps 2 and 3**, once `ZAPIER_TRACKING_WEBHOOK_URL` /
`ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL` are set: run any inspection
(`npm run seed` for a fully offline demo, or a real intake call) and check
Zapier's **Task History** for that Zap — you should see one run per
inspection (plus one more per weekly-status change, for Zap 2). If nothing
shows up in Task History, the webhook URL is wrong or unset; check
`/api/runs/:id`'s `publish.trackingRow`/`publish.adsBudgetCard` fields for
the exact error DMI recorded.

---

## Troubleshooting

**Zap 1 returns 401.** `DMI_INTAKE_SECRET` is set on the DMI deployment but
the `x-dmi-secret` header isn't set (or doesn't match) on the Zapier webhook
action. Copy the value again carefully — there's no way to retrieve it after
generation other than reading it back out of your own environment variables.

**Zap 1 returns 400 "invalid payload".** The JSON body Zapier sent didn't
parse as valid JSON, or one of the mapped fields has an unexpected type
(e.g. a number where a string field is expected). Check the "Payload Type"
on the webhook action is set to **JSON**, not "Form".

**A new row is created every time instead of updating.** Your Google Sheets
action is "Create Spreadsheet Row" rather than an update/upsert action —
switch to "Update Spreadsheet Row" or "Create or Update", keyed on the
`row_id` column (see [Zap 2](#zap-2--tracking-spreadsheet-mirror)).

**The tracking row never shows up in the sheet at all.** Confirm
`ZAPIER_TRACKING_WEBHOOK_URL` is set on the DMI deployment and that you
redeployed after setting it — then check the report's "Where this DMI was
recorded" section: if it says "database only" or shows an HTTP error, the
env var is missing or Zapier's endpoint rejected the request. Check Zapier's
Task History for the actual payload received.

**The Ads Budget Card is missing dollar amounts.** This is often correct
behavior, not a bug — see [When budgets can't be
produced](#when-budgets-cant-be-produced). Confirm by opening the DMI report
directly and checking whether the budget section shows numbers there too; if
it does but the card doesn't, the issue is in the Zap's field mapping, not
DMI.

**I changed a Zap's field mapping and now nothing updates.** DMI always
sends the same field *names* in its webhook payload (documented in the
tables above) — if a mapped column stopped updating, re-check the mapping
step in the Zap rather than assuming DMI's payload shape changed; it's
versioned by this document and by the source files listed below.

---

## Field reference tables

Quick-lookup copies of every payload DMI sends or receives via Zapier, for
pasting into a Zap's field-mapping screen without hunting through the prose
above.

### Zap 1 — DMI receives (via `/api/intake`)

```
firstName / first_name
lastName / last_name
email
phone
shopName / shop_name / companyName / company_name / businessName   ← required
website / websiteUrl / website_url
meetingType / meeting_type / calendarName
discoveryCallAt / discovery_call_at / appointmentStartTime / startTime
heardAboutUs / heard_about_us / howDidYouHear
marketingPainPoint / marketing_pain_point / whatDoYouDislike
ghlContactId / contact_id / contactId
ghlOpportunityId / opportunity_id
notes
```

### Zap 2 — DMI sends (to the tracking webhook)

```
row_id
run_id
shop_name
contact_name
email
phone
website
discovery_call_at
inspection_date
dmi_score
classification
dmi_link
week_of
weekly_status
```

### Zap 3 — DMI sends (to the budget-card webhook)

```
card_id
run_id
shop_name
contact_email
google_ads_monthly_usd
local_services_monthly_usd
total_monthly_usd
dmi_link
dmi_score
classification
rationale
```

---

## Source files

| File | Responsibility |
| --- | --- |
| [`src/app/api/intake/route.ts`](../src/app/api/intake/route.ts) | Zap 1's endpoint — auth check, payload validation, queues the run |
| [`src/lib/intake.ts`](../src/lib/intake.ts) | Field-name normalisation, idempotency key, missing-field reporting |
| [`src/lib/integrations/tracking.ts`](../src/lib/integrations/tracking.ts) | Builds and sends Zap 2's payload; computes `week_of` and `weekly_status` |
| [`src/lib/integrations/budget-card.ts`](../src/lib/integrations/budget-card.ts) | Builds and sends Zap 3's payload |
| [`src/lib/pipeline/steps/publish.ts`](../src/lib/pipeline/steps/publish.ts) | Calls all three integrations (GoHighLevel + both Zaps) at the end of every run |
| [`src/lib/env.ts`](../src/lib/env.ts) | `DMI_INTAKE_SECRET`, `ZAPIER_TRACKING_WEBHOOK_URL`, `ZAPIER_ADS_BUDGET_CARD_WEBHOOK_URL` definitions |
