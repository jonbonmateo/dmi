-- DMI schema. Paste into Supabase Studio > SQL Editor > Run.
-- Safe to run repeatedly.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- prospects
create table if not exists dmi_prospects (
  id                   text primary key,
  first_name           text,
  last_name            text,
  email                text,
  phone                text,
  shop_name            text not null,
  website_url          text,
  meeting_type         text,
  discovery_call_at    timestamptz,
  heard_about_us       text,
  marketing_pain_point text,
  ghl_contact_id       text,
  ghl_opportunity_id   text,
  extra                jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists dmi_prospects_email_idx on dmi_prospects (lower(email));
create index if not exists dmi_prospects_ghl_idx on dmi_prospects (ghl_contact_id);

-- --------------------------------------------------------------------- runs
create table if not exists dmi_runs (
  id                    text primary key,
  prospect_id           text not null references dmi_prospects(id) on delete cascade,
  state                 text not null default 'queued',
  -- One DMI per shop+website+discovery-call. Duplicate intake webhooks
  -- (Zapier retries, double form submits) collapse onto the same run.
  idempotency_key       text not null unique,
  inspection_date       date not null,
  mode                  text not null default 'hybrid',
  verification          jsonb,
  categories            jsonb not null default '[]'::jsonb,
  budgets               jsonb not null default '[]'::jsonb,
  total_score           int not null default 0,
  potential_total_score int not null default 0,
  classification        text,
  steps                 jsonb not null default '[]'::jsonb,
  errors                jsonb not null default '[]'::jsonb,
  report_url            text,
  publish               jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  completed_at          timestamptz,
  constraint dmi_runs_state_chk
    check (state in ('queued','running','needs_review','completed','failed')),
  constraint dmi_runs_class_chk
    check (classification is null or classification in ('red','yellow','green'))
);
create index if not exists dmi_runs_state_idx on dmi_runs (state, updated_at);
create index if not exists dmi_runs_prospect_idx on dmi_runs (prospect_id);

-- ------------------------------------------------------------ review queue
create table if not exists dmi_review_items (
  id          text primary key,
  run_id      text not null references dmi_runs(id) on delete cascade,
  finding_id  text,
  category    text not null,
  reason      text not null,
  question    text not null,
  instruction text not null,
  status      text not null default 'open',
  resolution  text,
  resolved_by text,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint dmi_review_status_chk check (status in ('open','resolved','dismissed'))
);
create index if not exists dmi_review_run_idx on dmi_review_items (run_id, status);

-- --------------------------------------------- tracking spreadsheet mirror
create table if not exists dmi_tracking_rows (
  id                text primary key,
  run_id            text not null unique references dmi_runs(id) on delete cascade,
  prospect_id       text not null references dmi_prospects(id) on delete cascade,
  shop_name         text not null,
  website_url       text,
  contact_name      text,
  email             text,
  phone             text,
  discovery_call_at timestamptz,
  inspection_date   date not null,
  total_score       int,
  classification    text,
  dmi_link          text,
  week_of           date not null,
  weekly_status     text not null default 'Not Started',
  updated_at        timestamptz not null default now(),
  constraint dmi_tracking_status_chk
    check (weekly_status in ('Not Started','In Progress','Completed','Needs Review'))
);
create index if not exists dmi_tracking_week_idx on dmi_tracking_rows (week_of, weekly_status);

-- ---------------------------------------------------------- ads budget card
create table if not exists dmi_budget_cards (
  id                         text primary key,
  run_id                     text not null unique references dmi_runs(id) on delete cascade,
  shop_name                  text not null,
  google_ads_monthly_usd     numeric,
  local_services_monthly_usd numeric,
  total_monthly_usd          numeric,
  rationale                  text not null default '',
  created_at                 timestamptz not null default now()
);

-- ------------------------------------------------------------------- RLS
-- The app talks to Postgres with the service-role key from server code only,
-- which bypasses RLS. Policies are still enabled so that an accidentally
-- leaked anon key cannot read prospect data.
alter table dmi_prospects     enable row level security;
alter table dmi_runs          enable row level security;
alter table dmi_review_items  enable row level security;
alter table dmi_tracking_rows enable row level security;
alter table dmi_budget_cards  enable row level security;

-- No permissive policies are created on purpose: anon/authenticated get nothing.
