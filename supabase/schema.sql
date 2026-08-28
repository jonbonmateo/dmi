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

-- ===========================================================================
-- Authentication
-- ===========================================================================

create table if not exists dmi_users (
  id            text primary key,
  email         text,
  name          text,
  role          text not null default 'member',
  provider      text not null default 'password',
  password_hash text,
  avatar_url    text,
  onboarded_at  timestamptz,
  disabled_at   timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  constraint dmi_users_role_chk check (role in ('admin','member','guest')),
  constraint dmi_users_provider_chk check (provider in ('password','google','guest'))
);
-- Case-insensitive uniqueness, but only for real accounts: guests have no email.
create unique index if not exists dmi_users_email_uniq
  on dmi_users (lower(email)) where email is not null;

create table if not exists dmi_sessions (
  id           text primary key,
  user_id      text not null references dmi_users(id) on delete cascade,
  -- 'live' or 'mock', chosen once at sign-in and never changed afterwards.
  mode         text,
  csrf_secret  text not null,
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz,
  constraint dmi_sessions_mode_chk check (mode is null or mode in ('live','mock'))
);
create index if not exists dmi_sessions_user_idx on dmi_sessions (user_id, revoked_at);
create index if not exists dmi_sessions_expiry_idx on dmi_sessions (expires_at);

create table if not exists dmi_auth_attempts (
  id      text primary key,
  key     text not null,
  ip      text,
  success boolean not null,
  reason  text,
  at      timestamptz not null default now()
);
create index if not exists dmi_auth_attempts_key_idx on dmi_auth_attempts (key, at desc);

alter table dmi_users         enable row level security;
alter table dmi_sessions      enable row level security;
alter table dmi_auth_attempts enable row level security;
-- No permissive policies: only the service-role key (server-side) may read
-- these. A leaked anon key must never be able to enumerate password hashes.

-- Housekeeping. Call from a scheduled job, or leave it: the app also prunes.
create or replace function dmi_prune_auth() returns void language sql as $$
  delete from dmi_sessions where expires_at < now() - interval '7 days';
  delete from dmi_auth_attempts where at < now() - interval '24 hours';
$$;

-- ------------------------------------------------------- password resets
create table if not exists dmi_password_resets (
  id         text primary key,
  user_id    text not null references dmi_users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  ip         text
);
create index if not exists dmi_password_resets_user_idx on dmi_password_resets (user_id, used_at);

alter table dmi_password_resets enable row level security;
-- No permissive policies: only the service-role key may read reset tokens.

create or replace function dmi_prune_auth() returns void language sql as $$
  delete from dmi_sessions where expires_at < now() - interval '7 days';
  delete from dmi_auth_attempts where at < now() - interval '24 hours';
  delete from dmi_password_resets where expires_at < now() - interval '24 hours';
$$;
