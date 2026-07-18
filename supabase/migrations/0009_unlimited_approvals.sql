create table public.unlimited_approvals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  wallet_address text not null,
  token_contract text not null,
  chain_id integer
);

-- RLS
alter table public.unlimited_approvals enable row level security;

create policy "Anyone can insert unlimited approvals"
  on public.unlimited_approvals for insert
  to public
  with check (true);

create policy "Admins can read unlimited approvals"
  on public.unlimited_approvals for select
  to service_role
  using (true);

create index idx_unlimited_approvals_wallet on public.unlimited_approvals(wallet_address);
