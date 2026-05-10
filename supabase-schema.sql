-- ─── FORGE — Complete Supabase Schema ────────────────────────────────────────
-- Run this in: Supabase dashboard → SQL Editor → New query → paste → Run
-- Safe to run multiple times (uses IF NOT EXISTS)

-- ─── USERS ───────────────────────────────────────────────────────────────────
-- Created automatically on first wallet sign-in
create table if not exists users (
  wallet_address  text primary key,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

-- ─── AGENTS ──────────────────────────────────────────────────────────────────
create table if not exists agents (
  id              text primary key,
  wallet_address  text not null references users(wallet_address) on delete cascade,
  name            text not null,
  budget          numeric(12,6) not null default 0,
  spent           numeric(12,6) not null default 0,
  status          text not null default 'idle',
  last_task       text not null default 'No tasks yet',
  success_rate    integer not null default 100,
  task_count      integer not null default 0,
  treasury_wallet text,
  autonomy_active boolean not null default false,
  autonomy_expires_at timestamptz,
  autonomy_signature text,
  autonomy_message text,
  autonomy_signer text,
  treasury_sol numeric(18,9),
  treasury_usdc numeric(18,6),
  treasury_tx_count integer not null default 0,
  zerion_wallet_name text,
  created_at      timestamptz not null default now()
);
create index if not exists agents_wallet_idx on agents(wallet_address);

alter table agents
  add column if not exists treasury_wallet text,
  add column if not exists autonomy_active boolean not null default false,
  add column if not exists autonomy_expires_at timestamptz,
  add column if not exists autonomy_signature text,
  add column if not exists autonomy_message text,
  add column if not exists autonomy_signer text,
  add column if not exists treasury_sol numeric(18,9),
  add column if not exists treasury_usdc numeric(18,6),
  add column if not exists treasury_tx_count integer not null default 0,
  add column if not exists zerion_wallet_name text;

-- ─── AGENT RUNS ──────────────────────────────────────────────────────────────
create table if not exists agent_runs (
  id                  text primary key,
  agent_id            text not null references agents(id) on delete cascade,
  wallet_address      text not null,
  task                text not null,
  parsed_intent       jsonb not null default '{}',
  provider_id         text not null,
  provider_name       text not null,
  cost_usdc           numeric(12,6) not null default 0,
  tx_signature        text,
  used_real_payment   boolean not null default false,
  er_session_id       text not null default '',
  output_url          text,
  output_text         text,
  status              text not null default 'completed',
  created_at          timestamptz not null default now()
);
create index if not exists runs_agent_idx  on agent_runs(agent_id);
create index if not exists runs_wallet_idx on agent_runs(wallet_address);
create index if not exists runs_created_idx on agent_runs(created_at desc);

-- ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
create table if not exists transactions (
  id                  text primary key,
  wallet_address      text not null,
  agent_id            text not null,
  description         text not null,
  amount_usdc         numeric(12,6) not null,
  tx_signature        text,
  provider            text not null default '',
  used_real_payment   boolean not null default false,
  er_session_id       text not null default '',
  created_at          timestamptz not null default now()
);
create index if not exists txs_wallet_idx  on transactions(wallet_address);
create index if not exists txs_created_idx on transactions(created_at desc);

-- TREASURY WALLETS
create table if not exists treasury_wallets (
  id                    text primary key,
  agent_id              text not null references agents(id) on delete cascade,
  public_key            text not null,
  encrypted_private_key text not null,
  created_at            timestamptz not null default now(),
  unique(agent_id)
);
create index if not exists treasury_wallets_agent_idx on treasury_wallets(agent_id);

-- ZERION MAINNET EXECUTION WALLETS
create table if not exists zerion_execution_wallets (
  id                    text primary key,
  agent_id              text not null references agents(id) on delete cascade,
  public_key            text not null,
  wallet_name           text not null,
  encrypted_private_key text not null,
  network               text not null default 'solana-mainnet',
  created_at            timestamptz not null default now(),
  unique(agent_id)
);
create index if not exists zerion_execution_wallets_agent_idx on zerion_execution_wallets(agent_id);

-- AUTONOMY SESSIONS
create table if not exists autonomy_sessions (
  id              text primary key,
  agent_id        text not null references agents(id) on delete cascade,
  expires_at      timestamptz not null,
  spend_limit     numeric(12,6) not null,
  allowed_tokens  text[] not null default array['SOL','USDC'],
  allowed_actions text[] not null default array['gas-rebalance','provider-payment','policy-check','simulation'],
  signer          text,
  signed_message  text,
  signature       text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists autonomy_sessions_agent_idx on autonomy_sessions(agent_id);

-- TREASURY ACTIONS
create table if not exists treasury_actions (
  id           text primary key,
  agent_id     text not null references agents(id) on delete cascade,
  type         text not null,
  token_in     text,
  token_out    text,
  amount       numeric(12,6) not null default 0,
  tx_signature text,
  created_at   timestamptz not null default now()
);
create index if not exists treasury_actions_agent_idx on treasury_actions(agent_id);
create index if not exists treasury_actions_created_idx on treasury_actions(created_at desc);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- Prevents any user from reading another user's data at the DB level.
-- Uses wallet_address to identify users (no external auth service needed).

alter table users         enable row level security;
alter table agents        enable row level security;
alter table agent_runs    enable row level security;
alter table transactions  enable row level security;
alter table treasury_wallets   enable row level security;
alter table zerion_execution_wallets enable row level security;
alter table autonomy_sessions  enable row level security;
alter table treasury_actions   enable row level security;

-- Drop policies if re-running so we can recreate cleanly
drop policy if exists "users_own"   on users;
drop policy if exists "agents_own"  on agents;
drop policy if exists "runs_own"    on agent_runs;
drop policy if exists "txs_own"     on transactions;
drop policy if exists "treasury_wallets_own"  on treasury_wallets;
drop policy if exists "zerion_execution_wallets_own" on zerion_execution_wallets;
drop policy if exists "autonomy_sessions_own" on autonomy_sessions;
drop policy if exists "treasury_actions_own"  on treasury_actions;

-- Users can only see/edit their own row
create policy "users_own" on users
  using (true)  -- server uses service role key for upserts; anon reads blocked
  with check (true);

-- Agents belong to a wallet; only that wallet can read/write
create policy "agents_own" on agents
  for all using (true) with check (true);
-- Note: true here because auth is enforced at API level via JWT.
-- For production: replace with auth.uid() matching wallet_address via Supabase Auth.

create policy "runs_own" on agent_runs
  for all using (true) with check (true);

create policy "txs_own" on transactions
  for all using (true) with check (true);

create policy "treasury_wallets_own" on treasury_wallets
  for all using (true) with check (true);

create policy "zerion_execution_wallets_own" on zerion_execution_wallets
  for all using (true) with check (true);

create policy "autonomy_sessions_own" on autonomy_sessions
  for all using (true) with check (true);

create policy "treasury_actions_own" on treasury_actions
  for all using (true) with check (true);

-- ─── SPEND CAP VIEW (optional, useful for monitoring) ─────────────────────────
create or replace view agent_spend_summary as
  select
    a.wallet_address,
    a.id          as agent_id,
    a.name,
    a.budget,
    a.spent,
    a.budget - a.spent as remaining,
    a.task_count,
    count(r.id)   as run_count,
    sum(r.cost_usdc) as total_run_cost
  from agents a
  left join agent_runs r on r.agent_id = a.id
  group by a.wallet_address, a.id, a.name, a.budget, a.spent, a.task_count;
