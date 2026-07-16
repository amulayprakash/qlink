-- ===========================================================================
-- Linktree-Q :: initial schema
-- Run in the Supabase SQL editor (or `supabase db push`).
-- ===========================================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  username            citext unique
                        check (username is null or username ~ '^[a-z0-9_]{3,30}$'),
  display_name        text,
  bio                 text,
  avatar_url          text,
  theme               text not null default 'default',
  evm_wallet_address  text,
  tron_wallet_address text,
  promo_code          citext unique,
  promo_discount_pct  int not null default 20 check (promo_discount_pct between 0 and 100),
  is_published        boolean not null default false,
  onboarding_step     text not null default 'username',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- links
-- ---------------------------------------------------------------------------
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  url         text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists links_profile_idx on public.links(profile_id);

-- ---------------------------------------------------------------------------
-- packages  (paid service tiers)
-- ---------------------------------------------------------------------------
create table if not exists public.packages (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  description text,
  price_usd   numeric(12,2) not null check (price_usd >= 0),
  features    jsonb not null default '[]'::jsonb,
  position    int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists packages_profile_idx on public.packages(profile_id);

-- ---------------------------------------------------------------------------
-- orders  (crypto payments — written/verified by the service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  package_id      uuid references public.packages(id) on delete set null,
  buyer_wallet    text,
  network         text not null,
  token_symbol    text not null,
  token_contract  text not null,
  recipient       text not null,          -- creator address locked at creation
  amount_expected numeric(38,0) not null,   -- base units
  amount_paid     numeric(38,0),
  price_usd       numeric(12,2) not null,
  promo_applied   boolean not null default false,
  discount_pct    int not null default 0,
  tx_hash         text unique,
  status          text not null default 'pending' check (status in ('pending','paid','failed')),
  created_at      timestamptz not null default now(),
  verified_at     timestamptz
);
create index if not exists orders_profile_idx on public.orders(profile_id);
create index if not exists orders_status_idx  on public.orders(status);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- auto-create a profile row on signup (pulls Google name + avatar)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.profiles enable row level security;
alter table public.links    enable row level security;
alter table public.packages enable row level security;
alter table public.orders   enable row level security;

-- profiles: anyone reads published pages; owner manages own row.
drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read" on public.profiles
  for select using (is_published = true);

drop policy if exists "profiles_owner_all" on public.profiles;
create policy "profiles_owner_all" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- links: public read when the owning profile is published; owner manages.
drop policy if exists "links_public_read" on public.links;
create policy "links_public_read" on public.links
  for select using (
    exists (select 1 from public.profiles p
            where p.id = links.profile_id and p.is_published)
  );

drop policy if exists "links_owner_all" on public.links;
create policy "links_owner_all" on public.links
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- packages: public read active packages of published profiles; owner manages.
drop policy if exists "packages_public_read" on public.packages;
create policy "packages_public_read" on public.packages
  for select using (
    is_active and exists (
      select 1 from public.profiles p
      where p.id = packages.profile_id and p.is_published
    )
  );

drop policy if exists "packages_owner_all" on public.packages;
create policy "packages_owner_all" on public.packages
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- orders: creator reads own orders. Inserts/updates happen via the service
-- role (server routes), which bypasses RLS — no anon insert policy on purpose.
drop policy if exists "orders_owner_read" on public.orders;
create policy "orders_owner_read" on public.orders
  for select using (profile_id = auth.uid());

-- ===========================================================================
-- Storage :: avatars bucket
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
