-- ============================================================================
--  Project RISHI — LMS database schema (Supabase / Postgres)
--  Paste this whole file into the Supabase SQL Editor and click "Run".
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---- Tasks -----------------------------------------------------------------
create table if not exists lms_tasks (
  id             uuid primary key default gen_random_uuid(),
  group_id       text,                                      -- shared by tasks assigned to multiple people at once
  title          text not null,
  description    text default '',
  tags           text[] default '{}',
  due_at         timestamptz not null,
  requires_file  boolean default false,
  assigner_email text not null,
  assignee_email text not null,
  status         text not null default 'not_complete', -- not_complete | pending | complete
  submitted_at   timestamptz,
  archived       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ---- Events ----------------------------------------------------------------
create table if not exists lms_events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text default '',
  start_at      timestamptz not null,
  end_at        timestamptz,
  creator_email text not null,
  scope_kind    text not null,           -- members | group | club | all_newbies
  scope_emails  text[] default '{}',
  scope_groups  text[] default '{}',
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- If you already created these tables earlier, run this migration once to add
-- the new columns to your existing data:
--   alter table lms_tasks  add column if not exists group_id text;
--   alter table lms_tasks  add column if not exists archived boolean not null default false;
--   alter table lms_events add column if not exists archived boolean not null default false;

create index if not exists lms_tasks_assignee_idx on lms_tasks (assignee_email);
create index if not exists lms_tasks_assigner_idx on lms_tasks (assigner_email);
create index if not exists lms_events_start_idx   on lms_events (start_at);

-- ---- Google Calendar connections -------------------------------------------
-- One row per member who connected their Google Calendar. Holds the refresh
-- token (server-only) and the set of items already pushed (for delete sync).
create table if not exists lms_gcal (
  user_email    text primary key,
  refresh_token text not null,
  sync_enabled  boolean not null default true,
  synced_keys   text[] default '{}',
  updated_at    timestamptz not null default now()
);

-- ---- Security --------------------------------------------------------------
-- Turn ON row-level security with NO policies. This blocks the public "anon"
-- key from touching these tables. The website talks to the database only from
-- the server using the SERVICE ROLE key, which bypasses RLS — so the app keeps
-- working while the data stays private.
alter table lms_tasks  enable row level security;
alter table lms_events enable row level security;
alter table lms_gcal   enable row level security;

-- ---- Grants ----------------------------------------------------------------
-- The website talks to the database only from the server, using the secret
-- (service_role) key. If "Automatically expose new tables" is OFF in your
-- project (recommended), new tables get no grants by default — so grant the
-- service_role explicitly here. We deliberately do NOT grant anon/authenticated,
-- so the public key has no access to these tables at all.
grant all privileges on table lms_tasks  to service_role;
grant all privileges on table lms_events to service_role;
grant all privileges on table lms_gcal   to service_role;

alter table lms_tasks  add column if not exists group_id text;
alter table lms_tasks  add column if not exists archived boolean not null default false;
alter table lms_events add column if not exists archived boolean not null default false;

create table if not exists lms_profiles (
  email text primary key, avatar text, updated_at timestamptz not null default now()
);
alter table lms_profiles enable row level security;
grant all privileges on table lms_profiles to service_role;

-- ---- Gmail send connections (Phase 3) --------------------------------------
create table if not exists lms_gmail (
  account_email          text primary key,
  refresh_token          text not null,
  connected_google_email text,
  is_shared              boolean not null default false,
  connected_by           text,
  updated_at             timestamptz not null default now()
);

-- ---- Announcements (Phase 3) -----------------------------------------------
create table if not exists lms_announcements (
  id               text primary key,
  author_email     text not null,
  author_name      text not null,
  sender_email     text not null,
  subject          text not null,
  body_html        text not null,
  recipient_emails text[] not null default '{}',
  created_at       timestamptz not null default now()
);

create table if not exists lms_announcement_reads (
  announcement_id text not null,
  user_email      text not null,
  read            boolean not null default true,
  updated_at      timestamptz not null default now(),
  primary key (announcement_id, user_email)
);

create index if not exists lms_announcements_created_idx on lms_announcements (created_at desc);

alter table lms_gmail               enable row level security;
alter table lms_announcements       enable row level security;
alter table lms_announcement_reads  enable row level security;

grant all privileges on table lms_gmail               to service_role;
grant all privileges on table lms_announcements       to service_role;
grant all privileges on table lms_announcement_reads  to service_role;

alter table lms_announcements add column if not exists mail_merge boolean not null default false;

create table if not exists lms_newsletters (
  id text primary key, author_email text not null, author_name text not null,
  sender_email text not null, subject text not null, body_html text not null,
  mail_merge boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists lms_newsletter_reads (
  newsletter_id text not null, user_email text not null, read boolean not null default true,
  updated_at timestamptz not null default now(), primary key (newsletter_id, user_email)
);
create table if not exists lms_newsletter_subscribers (
  email text primary key, created_at timestamptz not null default now()
);
create index if not exists lms_newsletters_created_idx on lms_newsletters (created_at desc);
alter table lms_newsletters enable row level security;
alter table lms_newsletter_reads enable row level security;
alter table lms_newsletter_subscribers enable row level security;
grant all privileges on table lms_newsletters to service_role;
grant all privileges on table lms_newsletter_reads to service_role;
grant all privileges on table lms_newsletter_subscribers to service_role;

alter table lms_announcements add column if not exists merge_data jsonb not null default '{}'::jsonb;
alter table lms_tasks add column if not exists email_template jsonb;

-- ============================================================================
--  Dashboard / Calendar / Tasks / Events overhaul
-- ============================================================================

-- ---- Tasks: lifecycle, submission, comments, history, reminders ------------
alter table lms_tasks add column if not exists submission_text  text;
alter table lms_tasks add column if not exists submission_link  text;
alter table lms_tasks add column if not exists require_submission boolean not null default false;
alter table lms_tasks add column if not exists history          jsonb not null default '[]'::jsonb;
alter table lms_tasks add column if not exists comments         jsonb not null default '[]'::jsonb;
alter table lms_tasks add column if not exists reminders_sent   jsonb not null default '[]'::jsonb;

-- ---- Events: all-day support (end_at already exists, optional range) --------
alter table lms_events add column if not exists all_day boolean not null default false;

-- ---- Notification center ---------------------------------------------------
-- Every task/event email is also written here as an in-dashboard notification
-- (title = email subject, body = email body). The bell icon reads from this.
create table if not exists lms_notifications (
  id          text primary key,
  user_email  text not null,
  title       text not null,
  body        text not null,
  kind        text not null default 'info',  -- task_assigned | approved | rejected | ...
  ref_id      text,                          -- task/event id this relates to (optional)
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists lms_notifications_user_idx on lms_notifications (user_email, created_at desc);
alter table lms_notifications enable row level security;
grant all privileges on table lms_notifications to service_role;

-- ============================================================================
--  Background push notifications (web push) + Chat / group chat
-- ============================================================================

-- One row per browser/device subscription, keyed by its push endpoint.
create table if not exists lms_push_subscriptions (
  endpoint    text primary key,
  user_email  text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_push_user on lms_push_subscriptions (user_email);

-- A conversation: a 1:1 DM (is_group false) or a group chat (is_group true).
create table if not exists lms_chats (
  id          uuid primary key,
  is_group    boolean not null default false,
  title       text,
  created_by  text not null,
  created_at  timestamptz not null default now()
);

-- Membership rows (one per member per chat).
create table if not exists lms_chat_members (
  chat_id  uuid not null references lms_chats(id) on delete cascade,
  email    text not null,
  primary key (chat_id, email)
);
create index if not exists idx_chat_members_email on lms_chat_members (email);

-- Messages. Tapback reactions are stored inline as a jsonb array of
-- { "email": "...", "emoji": "..." } objects.
create table if not exists lms_messages (
  id          uuid primary key,
  chat_id     uuid not null references lms_chats(id) on delete cascade,
  sender_email text not null,
  body        text not null,
  reactions   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_messages_chat on lms_messages (chat_id, created_at);

-- ============================================================================
--  Security + grants for push & chat tables  (THE MISSING PIECE)
-- ----------------------------------------------------------------------------
--  Every other table above enables RLS and grants the service_role. The push
--  and chat tables were created without these, so when "Automatically expose
--  new tables" is OFF the server's service-role key had NO access to them —
--  which made every chat query fail (the empty "no members" picker). These
--  lines bring them in line with the rest of the schema. Safe to re-run.
-- ============================================================================
alter table lms_push_subscriptions enable row level security;
alter table lms_chats              enable row level security;
alter table lms_chat_members       enable row level security;
alter table lms_messages           enable row level security;

grant all privileges on table lms_push_subscriptions to service_role;
grant all privileges on table lms_chats              to service_role;
grant all privileges on table lms_chat_members       to service_role;
grant all privileges on table lms_messages           to service_role;

-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1) Chat: "delete conversation for yourself" (per-member hide).
alter table lms_chat_members add column if not exists hidden_at timestamptz;

-- 2) Member directory: per-member contact overrides (email/phone shown in the
--    directory only; never affects the login email or members.ts).
create table if not exists lms_contact_overrides (
  email         text primary key,
  contact_email text,
  phone         text,
  updated_at    timestamptz not null default now()
);
alter table lms_contact_overrides enable row level security;
grant all privileges on table lms_contact_overrides to service_role;


-- ============================================================================
--  Roster table — lets the Google Sheet control who can log in and their roles.
--  Run once in the Supabase SQL editor. Safe to re-run.
--
--  This table MIRRORS the roster Google Sheet. It is populated by the roster
--  sync (hourly cron, or the "Sync roster from sheet" button in Settings).
--  If it's empty, the app falls back to the roster in lib/members.ts.
-- ============================================================================
create table if not exists lms_roster (
  email       text primary key,
  first_name  text not null default '',
  last_name   text not null default '',
  group_code  text not null default 'E',   -- E | R | W | H
  phone       text not null default '',
  hidden      boolean not null default false,
  active      boolean not null default true, -- false = keep the row, block login
  roles       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table lms_roster enable row level security;
grant all privileges on table lms_roster to service_role;

-- Run once in the Supabase SQL editor. Safe to re-run.
-- Stores the roster-source toggle (members.ts-only vs Google Sheet).
create table if not exists lms_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
alter table lms_settings enable row level security;
grant all privileges on table lms_settings to service_role;


-- Meetings: per-group agendas + notes, integrated with tasks. Safe to re-run.
create table if not exists lms_meetings (
  id          uuid primary key default gen_random_uuid(),
  group_code  text not null,                       -- E | R | W | H
  title       text not null default '',
  meeting_date date,
  location    text not null default '',
  notetaker   text not null default '',
  snack       text not null default '',
  attendees   jsonb not null default '[]'::jsonb,   -- string[] of member emails
  blocks      jsonb not null default '[]'::jsonb,   -- outline: agenda + notes
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists lms_meetings_group_idx on lms_meetings (group_code, meeting_date desc);

create table if not exists lms_meeting_templates (
  group_code  text primary key,                    -- E | R | W | H
  blocks      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Link tasks created inside a meeting back to that meeting.
alter table lms_tasks add column if not exists meeting_id uuid;

alter table lms_meetings enable row level security;
alter table lms_meeting_templates enable row level security;
grant all privileges on table lms_meetings to service_role;
grant all privileges on table lms_meeting_templates to service_role;

-- Rich-text meeting content (TipTap HTML). Safe to re-run.
alter table lms_meetings          add column if not exists body text;
alter table lms_meeting_templates add column if not exists body text;

