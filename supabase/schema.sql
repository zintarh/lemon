-- ─────────────────────────────────────────────────────────────────────────────
-- Lemon — Supabase schema
-- Run this in the Supabase SQL editor to initialise the database.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── agents ──────────────────────────────────────────────────────────────────

create table if not exists agents (
  wallet            text        primary key,   -- lowercase 0x address
  name              text        not null,
  avatar_uri        text        not null default '',
  agent_uri         text        not null default '',
  personality       text        not null default '',
  preferences       text        not null default '',
  deal_breakers     text[]      not null default '{}',
  billing_mode      smallint    not null default 0,  -- 0=SPLIT 1=SOLO
  erc8004_agent_id      text        not null default '0',
  selfclaw_public_key   text        not null default '',
  selfclaw_private_key  text        not null default '',
  selfclaw_session_id   text        not null default '',
  selfclaw_human_id     text        not null default '',
  selfclaw_verified     boolean     not null default false,
  agent_wallet          text        not null default '',
  agent_private_key     text        not null default '',
  registered_at         bigint      not null default 0,
  active            boolean     not null default true,
  indexed_at        timestamptz not null default now()
);

create index if not exists agents_active_idx on agents (active);

-- ─── dates ───────────────────────────────────────────────────────────────────

create table if not exists dates (
  date_id       text        primary key,   -- uint256 as text
  agent_a       text        not null,
  agent_b       text        not null,
  template      smallint    not null,      -- 0=COFFEE 1=BEACH 2=WORK 3=ROOFTOP_DINNER 4=GALLERY_WALK
  status        smallint    not null default 0,  -- 0=PENDING 1=ACTIVE 2=COMPLETED 3=CANCELLED
  payer_mode    smallint    not null default 2,  -- 0=AGENT_A 1=AGENT_B 2=SPLIT
  cost_usd      text        not null default '0',
  payment_token text        not null default '',
  x402_tx_hash  text        not null default '',
  nft_token_id  text,
  scheduled_at  bigint      not null default 0,
  completed_at  bigint,
  metadata_uri  text,
  image_url     text,
  tweet_url     text,
  indexed_at    timestamptz not null default now()
);

create index if not exists dates_agent_a_idx on dates (agent_a);
create index if not exists dates_agent_b_idx on dates (agent_b);
create index if not exists dates_status_idx  on dates (status);

-- ─── conversations ────────────────────────────────────────────────────────────

create table if not exists conversations (
  id                  uuid        primary key default gen_random_uuid(),
  wallet_a            text        not null,
  wallet_b            text        not null,
  transcript          jsonb       not null default '{}',
  passed              boolean     not null default false,
  deal_breaker_hit    text,
  template_suggested  text,
  shared_interests    text[]      not null default '{}',
  created_at          timestamptz not null default now()
);

create index if not exists conversations_wallet_a_idx on conversations (wallet_a);
create index if not exists conversations_wallet_b_idx on conversations (wallet_b);

-- ─── matches ─────────────────────────────────────────────────────────────────

create table if not exists matches (
  id          uuid        primary key default gen_random_uuid(),
  wallet_a    text        not null,
  wallet_b    text        not null,
  score       numeric     not null,
  reasoning   text        not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists matches_wallet_a_idx on matches (wallet_a);
create index if not exists matches_wallet_b_idx on matches (wallet_b);

-- ─── Migrations (run after initial schema if table already exists) ───────────
-- Add SelfClaw columns if upgrading an existing database
alter table agents add column if not exists selfclaw_public_key   text    not null default '';
alter table agents add column if not exists selfclaw_private_key  text    not null default '';
alter table agents add column if not exists selfclaw_session_id   text    not null default '';
alter table agents add column if not exists selfclaw_human_id     text    not null default '';
alter table agents add column if not exists selfclaw_verified     boolean not null default false;
alter table agents add column if not exists agent_wallet          text    not null default '';
alter table agents add column if not exists agent_private_key     text    not null default '';
alter table dates  add column if not exists needs_user_mint       boolean not null default false;
alter table dates  add column if not exists failure_reason        text;
alter table dates  add column if not exists refund_status         text;
alter table dates  add column if not exists refund_note           text;

-- ─── contact_reveals ─────────────────────────────────────────────────────────
-- Private contact info users can optionally share after 3 dates.
-- NOT publicly readable — service role only.

create table if not exists contact_reveals (
  wallet            text        primary key,   -- lowercase 0x address
  telegram_handle   text        not null default '',
  telegram_chat_id  text        not null default '',  -- set when user starts the bot
  email             text        not null default '',
  phone             text        not null default '',
  updated_at        timestamptz not null default now()
);

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- Server uses service-role key (bypasses RLS).

alter table agents           enable row level security;
alter table dates            enable row level security;
alter table conversations    enable row level security;
alter table matches          enable row level security;
alter table contact_reveals  enable row level security;
-- contact_reveals has NO public read policy — only the service-role key can access it

-- Public read on agents + dates for frontend direct queries
create policy "public can read agents" on agents for select using (true);
create policy "public can read dates"  on dates  for select using (true);
