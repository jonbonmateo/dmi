# GoHighLevel Integration

Full reference for how DMI talks to GoHighLevel: what it reads, what it
writes, exactly which API calls it makes, how to set it up, and how to
diagnose it when something isn't syncing. For the other half of the pipeline
(the webhook that gets appointment data *out of* GoHighLevel and into DMI),
see [ZAPIER.md](./ZAPIER.md) — GoHighLevel and DMI are never connected
directly; Zapier is what sits between them on the intake side.

**Contents**
- [What this integration does](#what-this-integration-does)
- [What it does *not* do](#what-it-does-not-do)
- [Architecture](#architecture)
- [Setup, step by step](#setup-step-by-step)
- [The ten custom fields, in detail](#the-ten-custom-fields-in-detail)
- [The note that gets attached](#the-note-that-gets-attached)
- [Contact matching logic](#contact-matching-logic)
- [API calls DMI makes, exactly](#api-calls-dmi-makes-exactly)
- [Required scopes and why](#required-scopes-and-why)
- [Dry-run mode (no credentials)](#dry-run-mode-no-credentials)
- [Error handling and partial failure](#error-handling-and-partial-failure)
- [Where to see the result](#where-to-see-the-result)
- [Troubleshooting](#troubleshooting)
- [Testing this integration](#testing-this-integration)
- [Security notes](#security-notes)
- [Source files](#source-files)

---

## What this integration does

Once a Digital Marketing Inspection finishes, DMI writes two things back onto
the prospect's GoHighLevel contact record:

1. **Ten custom fields** — the score, the colour classification, a link to
   the full report, the inspection date, the two suggested ad budgets, and
   how many questions are still open for a human. A salesperson looking at
   the contact in GoHighLevel sees the outcome without leaving the CRM.
2. **A note** — a full, readable summary of all twenty criteria (pass/fail/
   unclear, with a one-line reason for each), the budget numbers with their
   ranges, and the report link. This is meant to be read top to bottom by a
   human, not parsed by a machine.

This happens automatically as the last step of every inspection ("publish"),
whether the inspection was triggered by the Zapier webhook or run manually
from the CLI or the dashboard's "run" button.

## What it does *not* do

- **It does not create the contact from a form fill.** That's Zapier's job —
  DMI receives prospect data that already includes (or can look up) a
  GoHighLevel contact, and only writes *back* to it.
- **It does not read anything from GoHighLevel mid-inspection.** All the
  business intelligence in a DMI report (website, SEO, ads, social) comes
  from public sources and paid APIs (Google, Meta), never from GoHighLevel.
  GoHighLevel is purely a destination for the finished result.
- **It does not manage pipelines, opportunities, tags, or workflows.** If you
  want a DMI completion to move an opportunity stage or fire a GoHighLevel
  workflow, that's a job for a Zap watching for the custom fields to be set
  (or watching the tracking spreadsheet), not something DMI does directly.
- **It does not delete or overwrite anything else on the contact.** The
  `PUT /contacts/:id` call only ever sends the `customFields` array — first
  name, tags, other custom fields, and everything else on the contact is left
  alone.

## Architecture

```
DMI pipeline finishes all 4 categories + scoring + budgets
        │
        ▼
  publish() step  (src/lib/pipeline/steps/publish.ts)
        │
        ├──▶ upsertTracking()      → tracking spreadsheet (see ZAPIER.md)
        ├──▶ createBudgetCard()    → Ads Budget Card      (see ZAPIER.md)
        └──▶ syncGhl()             → THIS integration
                  │
                  ├─ 1. find or create the GoHighLevel contact
                  ├─ 2. PUT the 7 custom fields onto it
                  └─ 3. POST a summary note onto it
```

`syncGhl()` lives in [`src/lib/integrations/gohighlevel.ts`](../src/lib/integrations/gohighlevel.ts)
and is called once, at the very end of every run, from
[`src/lib/pipeline/steps/publish.ts`](../src/lib/pipeline/steps/publish.ts).
It runs in parallel with the tracking-row and budget-card writes (via
`Promise.all`), so a slow or failing GoHighLevel call never blocks or breaks
the other two.

## Setup, step by step

### 1. Create the ten custom fields

In GoHighLevel: **Settings → Custom Fields → Contact**. Create ten fields,
all type **Text**, with **exactly** these field keys (not just similar
labels — DMI writes to the field by key):

| Field key | What DMI puts in it | Example |
| --- | --- | --- |
| `dmi_total_score` | Total score out of 20 | `16` |
| `dmi_classification` | Colour band | `green` |
| `dmi_report_link` | Full URL to the report | `https://dmi.yourapp.com/dmi/dmi_a1b2c3` |
| `dmi_inspection_date` | Date the inspection ran | `2026-08-29` |
| `dmi_google_ads_budget` | Suggested Google Ads monthly budget, USD, no symbol | `1300` |
| `dmi_lsa_budget` | Suggested Local Services Ads monthly budget, USD, no symbol | `950` |
| `dmi_open_review_items` | Count of criteria still needing a human | `4` |
| `dmi_meeting_type` | Meeting type from the Discovery Call Form | `Discovery Call` |
| `dmi_heard_about_us` | How they heard about Shop Marketing Pros | `Referred by another shop owner` |
| `dmi_marketing_pain_point` | What they currently dislike about their marketing | `We spend a lot on Google Ads but can't tell what's working.` |

A field key in GoHighLevel is normally auto-generated from the field's
display *name* the first time you save it (lowercased, spaces to
underscores). The simplest way to get the key right is to name the field
exactly `DMI Total Score`, `DMI Classification`, `DMI Report Link`, `DMI
Inspection Date`, `DMI Google Ads Budget`, `DMI LSA Budget`, `DMI Open Review
Items`, `DMI Meeting Type`, `DMI Heard About Us`, and `DMI Marketing Pain
Point` — GoHighLevel will generate `dmi_total_score` etc. automatically.
After saving, open the field again and confirm the key shown matches the
table above exactly; if your account has custom field key behavior that
differs, edit the key directly to match.

These fields can be created on any object level ("Contact" is what DMI
targets), and it doesn't matter which folder/group you file them under.

The rest of the Discovery Call Form — first name, last name, email, phone,
shop name and website — doesn't need a custom field at all. Those map onto
GoHighLevel's own native contact fields (First Name, Last Name, Email, Phone,
Company Name, Website) and DMI keeps them in sync on every publish, same as
the custom fields above.

### 2. Create a Private Integration token

**Settings → Private Integrations → Create New Integration.**

- Name it something recognisable, e.g. "DMI".
- Grant these three scopes (see [Required scopes](#required-scopes-and-why)
  for why each is needed):
  - `contacts.readonly`
  - `contacts.write`
  - `contacts/notes.write`
- Save, then copy the generated token. It's shown once — if you lose it,
  you'll need to create a new integration.

Set it as the `GHL_API_KEY` environment variable.

### 3. Copy the location ID

The location ID identifies which GoHighLevel sub-account DMI writes to. It's
in the URL when you're inside that sub-account
(`app.gohighlevel.com/location/<this-part>/...`), or under **Settings →
Business Profile**.

Set it as `GHL_LOCATION_ID`.

### 4. Redeploy

Both `GHL_API_KEY` and `GHL_LOCATION_ID` must be set together — DMI only
attempts to call GoHighLevel when both are present. Add them to your
deployment's environment variables (Vercel: **Settings → Environment
Variables**) and redeploy.

### 5. Verify

Run an inspection (or use `npm run seed` locally with real credentials — see
[Testing this integration](#testing-this-integration)) and check:

- The `/setup` page in the DMI app shows "GoHighLevel — contact fields and DMI
  note" as connected.
- The finished report's "Where this DMI was recorded" section shows
  `Confirmed` for both "GoHighLevel contact" and "GoHighLevel note", with a
  note like *"Updated GoHighLevel contact loc_xxx with the discovery call
  details, DMI score, colour, link and budgets."*
- Open the contact in GoHighLevel and confirm the ten custom fields are
  populated and a new note appears.

## The ten custom fields, in detail

All ten are written on **every** publish, including a re-run of a run that
already published once (DMI upserts by contact ID, so re-running an
inspection just updates the same fields rather than creating duplicates).

**`dmi_total_score`** — the confirmed score, 0–20. This is the score that
only counts criteria with confirmed evidence; it does *not* include the
"potential" score shown on the report for unconfirmed criteria. If a
salesperson is filtering or sorting contacts by this field, they're sorting
by the honest, defensible number.

**`dmi_classification`** — one of `red`, `yellow`, or `green` (lowercase,
matching the report's colour band exactly). Useful for a GoHighLevel smart
list filter or a workflow trigger ("classification changed to green").

**`dmi_report_link`** — the full DMI report URL
(`<NEXT_PUBLIC_APP_URL>/dmi/<runId>`). Click straight through from the
contact record to the report.

**`dmi_inspection_date`** — an ISO date (`YYYY-MM-DD`) for when the
inspection was run, not when the discovery call happens. If a run is
resumed across multiple days (a crash-and-retry), this is the date the run
was originally *created*, not the date it finally completed.

**`dmi_google_ads_budget`** and **`dmi_lsa_budget`** — the two suggested
monthly ad budgets in whole US dollars, with no currency symbol, no commas
(e.g. `1300`, not `$1,300`). These come from the pipeline's budget model
([documented in the main README, §10](../README.md#10-scoring)); if the
model couldn't produce a defensible number (e.g. no verified business
location to measure local competition from), the field is written as an
empty string rather than a fabricated number.

**`dmi_open_review_items`** — how many of the twenty criteria still need a
human to look at them (the same count shown as "N open" on the DMI dashboard
and in the review queue). `0` means the DMI is fully resolved with no open
questions.

**`dmi_meeting_type`**, **`dmi_heard_about_us`** and
**`dmi_marketing_pain_point`** — copied straight from the Discovery Call
Form (meeting type, how they heard about Shop Marketing Pros, and what they
currently dislike about their marketing). These are the three fields of the
form GoHighLevel has no native contact field for; DMI writes them so step 3
of the DMI process ("review the Discovery Call Form information... fill out
the required GHL fields") happens automatically as part of the same publish
that syncs the DMI results, rather than as a separate manual step.

## The note that gets attached

Every publish also posts a GoHighLevel **note** to the contact — the same
kind of note a human would type after a call, but generated automatically.
It's built by `buildNote()` in
[`gohighlevel.ts`](../src/lib/integrations/gohighlevel.ts) and looks like
this:

```
DIGITAL MARKETING INSPECTION — Precision Auto Care
Inspected 2026-08-28
Score 16/20 — Green — strong digital marketing presence
(3 criteria could not be confirmed automatically — the score could reach 19/20 once reviewed.)

Website: 5/5
  [+] Homepage shows a logo image, a phone number, a street address, the shop name.
  [+] Accessibility support provided by UserWay.
  [+] A call to action appears above the fold and 2 CTA link(s) appear across the page.
  [+] 6 of 6 images are hosted on the shop's own domain.
  [+] Mobile 87/100, desktop 96/100, responsive viewport present.

Search Engine Optimization: 4/5
  [+] Blog updated 11 day(s) ago.
  [+] 3 service page(s) with 300+ words of content.
  [+] 9/10 on-page SEO checks passed (90%).
  [?] Google Business Profile 7/7 optimised. Weekly-update cadence needs a human check.
  [+] Citation score 88% against a 60% benchmark.

Digital Advertising: 4/5
  ...

Suggested monthly ad budgets:
  Google Ads: $1300 (range $1050-$1650)
  Local Services Ads: $950 (range $750-$1200)

3 item(s) need a human before this DMI is final.
Full report: https://dmi.yourapp.com/dmi/dmi_a1b2c3
```

`[+]` means the criterion passed (point awarded on confirmed evidence), `[-]`
means it failed, `[?]` means it's unresolved and routed to the review queue —
the same three marks used throughout the report UI. A salesperson can read
this note top to bottom in under a minute and know exactly what to say on
the call.

## Contact matching logic

DMI never wants to create a duplicate contact for the same person. The
lookup order is:

1. **If the prospect record already has a `ghlContactId`** (set either by
   Zapier passing `contact_id`/`contactId` on intake, or by a previous DMI
   run for the same prospect), that ID is used directly — no lookup needed.
2. **Otherwise, if the prospect has an email address**, DMI calls
   GoHighLevel's `GET /contacts/search/duplicate` endpoint with that email.
   If GoHighLevel finds an existing contact with that email, its ID is used.
3. **If neither of the above resolves a contact**, DMI creates a brand new
   contact via `POST /contacts/`, populated with the prospect's first name,
   last name, email, phone, company name (the shop name), and website — plus
   the ten custom fields — in one call.

Once a contact ID is resolved (found or created), it's saved back onto the
prospect record (`prospect.ghlContactId`) so every future run for the same
prospect reuses it without another lookup.

**Practical implication:** if you want DMI to write onto a contact that
GoHighLevel already has from your booking form, make sure Zapier passes the
contact ID through on intake (see
[ZAPIER.md → Zap 1 field mapping](./ZAPIER.md#zap-1--discovery-call-in-dmi-started)).
If it doesn't, DMI will look the contact up by email — which works fine as
long as the email on the discovery-call form matches the email GoHighLevel
already has for that person.

## API calls DMI makes, exactly

All calls go to `https://services.leadconnectorhq.com` (GoHighLevel's
LeadConnector v2 API), with these headers on every request:

```
Authorization: Bearer <GHL_API_KEY>
Version: 2021-07-28
Content-Type: application/json
Accept: application/json
```

| Step | Method & path | When it happens |
| --- | --- | --- |
| Duplicate check | `GET /contacts/search/duplicate?locationId=<id>&email=<email>` | Only if no contact ID is already known, and the prospect has an email |
| Create contact | `POST /contacts/` | Only if no contact ID could be found or looked up |
| Update contact | `PUT /contacts/:id` | Always, once a contact ID is known — this is what sets the 7 custom fields |
| Attach note | `POST /contacts/:id/notes` | Always, once a contact ID is known |

The `PUT` and note calls are what actually deliver the DMI results; the
duplicate-check and create calls only run when needed to resolve a contact
ID in the first place.

## Required scopes and why

| Scope | Why DMI needs it |
| --- | --- |
| `contacts.readonly` | The duplicate-search lookup (`GET /contacts/search/duplicate`) is a read operation. |
| `contacts.write` | Creating a new contact and updating the custom fields (`POST /contacts/`, `PUT /contacts/:id`). |
| `contacts/notes.write` | Attaching the summary note (`POST /contacts/:id/notes`). |

DMI never requests any scope beyond these three — no opportunities, no
calendars, no conversations, no workflows. If your Private Integration token
has broader scopes for other purposes, that's fine; DMI simply doesn't use
them.

## Dry-run mode (no credentials)

If `GHL_API_KEY` or `GHL_LOCATION_ID` is missing, DMI does **not** fail the
run or skip the step silently. Instead, `syncGhl()` composes the exact
payloads it *would* have sent — every custom field value, and the full note
text — and returns them as the "note" field on the run's publish record, with
status `requires_human_review`. You can see this directly on the finished
report, under "Where this DMI was recorded":

> GoHighLevel is not configured (GHL_API_KEY / GHL_LOCATION_ID missing).
> Would have set on contact (lookup by dana@precisionautocare.example):
> dmi_total_score=16, dmi_classification=green, dmi_report_link=..., ...

This is deliberate: it lets you review exactly what will be sent before any
credential exists, and it means a DMI is still fully complete and useful
(scored, evidenced, recorded in the tracking sheet) even with GoHighLevel
entirely disconnected.

## Error handling and partial failure

GoHighLevel syncing is **never allowed to fail the inspection**. If the
GoHighLevel API is down, rate-limited, or returns an error, the DMI itself is
still scored, evidenced, and recorded in the tracking spreadsheet — only the
CRM write is marked as failed (status `unable_to_evaluate`), with the
specific HTTP status and response body (truncated) recorded in the note for
diagnosis. This surfaces as a run-level error in the run's log (visible on
the report under "Run log"), but does not change the run's overall state from
`completed`/`needs_review` to `failed`.

The contact-update and the note-attach are independent outcomes: it's
possible (though unusual) for the custom fields to update successfully while
the note fails to attach, or vice versa — each is reported separately on the
report.

## Where to see the result

| Where | What you'll see |
| --- | --- |
| The DMI report page, "Where this DMI was recorded" section | Status pill (Confirmed / Requires human review / Unable to evaluate) + a one-line explanation for both the contact update and the note |
| `GET /api/runs/:id` | `publish.ghlContact` and `publish.ghlNote`, each `{status, id, note}` |
| GoHighLevel contact record | The ten custom fields, and the note in the Notes tab |
| `/setup` page | Whether GoHighLevel is connected at all, at the deployment level |

## Troubleshooting

**"GoHighLevel is not configured" appears even though I set the env vars.**
Both `GHL_API_KEY` and `GHL_LOCATION_ID` must be set — if only one is
present, DMI treats it as not configured (there's no way to write to a
location without knowing which location). Confirm both are set in your
deployment's environment variables and that you redeployed after adding
them (Vercel does not hot-reload environment variable changes).

**Contact updates return HTTP 401.** The Private Integration token is
invalid, expired, or was regenerated. Create a new one and update
`GHL_API_KEY`.

**Contact updates return HTTP 403.** The token's scopes don't include
`contacts.write` (or `contacts/notes.write` for the note specifically). Go
back to the Private Integration and add the missing scope — you may need to
create a new token, since GoHighLevel does not always allow editing scopes
on an existing token.

**A duplicate contact gets created instead of updating the existing one.**
This means the duplicate-search lookup didn't find a match. Check that the
email on the discovery-call form (or passed through by Zapier) matches
*exactly* what's on the existing GoHighLevel contact — the search is by
email, and GoHighLevel's duplicate matching can be case-sensitive or
whitespace-sensitive depending on how the original contact was entered. If
Zapier already knows the contact ID (e.g. the appointment trigger fires with
a `contactId` field), map that through on intake instead of relying on the
email lookup — see [ZAPIER.md](./ZAPIER.md#zap-1--discovery-call-in-dmi-started).

**The custom fields show up blank in GoHighLevel.** Double-check the field
*keys* match exactly (see the table in
[step 1](#1-create-the-ten-custom-fields)) — GoHighLevel's API writes by
key, so a field with the right display name but a different underlying key
will silently receive nothing while a genuinely empty field sits unfilled.
Open each field's settings and compare the key shown there against the table
above.

**The note doesn't appear.** Confirm the token has `contacts/notes.write`.
If the contact update succeeded but the note failed, the report will show
this distinctly — check the "GoHighLevel note" status specifically, separate
from "GoHighLevel contact".

**I want to test this without touching a real GoHighLevel account.** Leave
`GHL_API_KEY`/`GHL_LOCATION_ID` unset (or run with `DMI_FORCE_MOCK=1` /
mock-mode session) — see [Dry-run mode](#dry-run-mode-no-credentials) above.
The exact payload GoHighLevel would have received is printed on the report,
so you can review the wiring without any live account.

## Testing this integration

- **Unit tests**: `tests/intake.test.ts` covers how GoHighLevel's field names
  (snake_case from a raw webhook, camelCase from a cleaner Zap) get
  normalised on the way in — this is what determines whether `ghlContactId`
  gets picked up in the first place.
- **End-to-end (mock mode)**: `npm run seed` runs five sample inspections
  fully offline; each one's publish step exercises `syncGhl()` in dry-run
  mode (since no credentials are configured), and you can see the exact
  payload on each seeded report at `/dmi/<runId>`.
- **Manual, with real credentials**: set `GHL_API_KEY` and `GHL_LOCATION_ID`
  in `.env.local`, run `npm run dev`, and use
  `npm run dmi -- --shop "Your Test Shop" --email you@yourdomain.com` (see
  the main [README §5](../README.md#5-how-to-run-it)) to run one real
  inspection against your own test contact.

## Source files

| File | Responsibility |
| --- | --- |
| [`src/lib/integrations/gohighlevel.ts`](../src/lib/integrations/gohighlevel.ts) | All GoHighLevel API calls, the note builder, the field constants |
| [`src/lib/pipeline/steps/publish.ts`](../src/lib/pipeline/steps/publish.ts) | Calls `syncGhl()` as part of the publish step |
| [`src/lib/intake.ts`](../src/lib/intake.ts) | Where `ghlContactId`/`ghlOpportunityId` get parsed off an incoming webhook |
| [`src/lib/env.ts`](../src/lib/env.ts) | `GHL_API_KEY` / `GHL_LOCATION_ID` environment variable definitions |
