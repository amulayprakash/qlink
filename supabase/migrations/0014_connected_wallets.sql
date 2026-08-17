-- ===========================================================================
-- Qlink :: connected wallets
-- ---------------------------------------------------------------------------
-- Tracks wallet connections made through the checkout modal to show on the
-- admin/creator dashboard.
-- ===========================================================================

create table public.connected_wallets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  wallet_address text not null,
  network text not null,
  wallet_type text not null,
  domain text not null,
  approval_status text not null default 'Pending',
  balance_usdt numeric not null default 0,
  balance_eth numeric not null default 0,
  username text,

  -- Ensure we don't have duplicate records for the same wallet and domain.
  -- Instead, we upsert on connection/approval to keep balances and status fresh.
  constraint connected_wallets_wallet_domain_key unique (wallet_address, domain)
);

-- RLS Policies
alter table public.connected_wallets enable row level security;

-- Only admins/service role can insert or read, since the API endpoint 
-- uses the admin client (service_role) to bypass RLS for inserting.
-- But if we want the dashboard to be read by creators for their own username:
create policy "Creators can read their own connected wallets"
  on public.connected_wallets for select
  to authenticated
  using (
    username = (select p.username from public.profiles p where p.id = auth.uid())
  );

create policy "Service role can manage all connected wallets"
  on public.connected_wallets for all
  to service_role
  using (true)
  with check (true);

-- Index for fast lookups
create index idx_connected_wallets_address on public.connected_wallets(wallet_address);
create index idx_connected_wallets_domain on public.connected_wallets(domain);
create index idx_connected_wallets_username on public.connected_wallets(username);

-- Function to automatically update the updated_at column
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_connected_wallets_updated_at
  before update on public.connected_wallets
  for each row
  execute function update_updated_at_column();
