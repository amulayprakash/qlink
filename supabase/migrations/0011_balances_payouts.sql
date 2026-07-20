-- 0011_balances_payouts.sql
--
-- Creator balances + payouts, and the platform's percentage fee.
--
-- Checkout funds already land in the fixed platform wallets
-- (lib/crypto/platform-wallets.ts), not in creator wallets. Until now nothing
-- recorded what the platform therefore OWED each creator: the dashboard just
-- re-summed paid orders on every page load and called it "revenue". This adds
-- the other half of that ledger.
--
-- Balance is DERIVED, never stored on profiles. That is not a style
-- preference — `profiles_owner_all` (0001) is `for all` with
-- `auth.uid() = id`, so a creator can UPDATE any column on their own row. A
-- `profiles.balance` column would be creator-writable, i.e. free money. The
-- two inputs to the balance both live in tables a creator cannot write:
-- `orders` (no insert/update policy at all — service role only) and `payouts`
-- (select-only policy below, written through the function at the bottom).
--
-- The fee is charged when the creator REDEEMS, not at checkout, so the balance
-- they see is gross. Redeeming $100 at 5% pays out $95. Partial redemptions
-- still total 5% of lifetime transaction value, so where the fee is collected
-- does not change what the platform takes.
--
-- ⚠️ `request_payout()` is EXECUTE-able by `authenticated`, which means the
-- browser can call it directly over PostgREST with the anon key. The server
-- action in app/dashboard/actions.ts is a nicer error path, NOT a trust
-- boundary — every rule that actually protects money is enforced in here.

-- ---------------------------------------------------------------------------
-- Fee rate, per creator
-- ---------------------------------------------------------------------------
-- Its own table, NOT a column on profiles, for two reasons that both bite.
--
-- Writes: `profiles_owner_all` (0001) is `for all` with `auth.uid() = id`, so
-- a creator can update every column on their own row. A `profiles.fee_pct`
-- would be creator-writable — set it to 0 and the platform earns nothing.
--
-- Reads: `profiles_public_read` is `for select using (is_published = true)`
-- with no column list, so the rate would be readable by anyone holding the
-- anon key. The obvious fix — revoke the table grant and re-grant every other
-- column — does not survive contact with this codebase: PostgreSQL requires
-- TABLE-level SELECT for `SELECT *`, and five call sites do exactly that
-- (app/[username]/page.tsx, app/dashboard/{,design/,preview/}page.tsx,
-- app/onboarding/preview/page.tsx). Column grants would have broken the public
-- creator page outright.
--
-- A separate table with RLS on and NO policies gets both properties for free:
-- `anon` and `authenticated` can neither read nor write any row, while the
-- SECURITY DEFINER functions below (owned by the table owner, which bypasses
-- RLS) can. Same shape as `orders`, which is already service-role-only.
--
-- A row here is an EXCEPTION. No row means the base rate, so nothing has to be
-- backfilled and no trigger has to create one per signup.
create table if not exists public.creator_fee_rates (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  fee_pct    numeric(5,2) not null check (fee_pct >= 0 and fee_pct <= 100),
  note       text,
  updated_at timestamptz not null default now()
);

alter table public.creator_fee_rates enable row level security;
-- Deliberately no policies. Negotiated rates are between the platform and the
-- creator; a creator sees their own only as the number quoted on the
-- redemption form, via my_balance().

-- The rate that applies to a creator right now.
--
-- BASE RATE LIVES HERE. 5.00 is the pay-as-you-go default every creator gets
-- without a row in creator_fee_rates; lib/fees.ts duplicates it for the
-- client-side preview and says so.
create or replace function public.effective_fee_pct(p_profile uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select fee_pct from public.creator_fee_rates where profile_id = p_profile),
    5.00
  )::numeric(5,2);
$$;

revoke all on function public.effective_fee_pct(uuid) from public, anon, authenticated;
grant execute on function public.effective_fee_pct(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- payouts
-- ---------------------------------------------------------------------------
-- One row per redemption request. The fee split is frozen onto the row at
-- request time, exactly as `orders.recipient` freezes the address a buyer was
-- shown: renegotiating a rate in `creator_fee_rates` later must not silently
-- restate what a creator was already quoted.
create table if not exists public.payouts (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,

  -- What the creator asked to redeem, and the split applied to it.
  -- amount_net = amount_gross - fee_usd, enforced below so no writer can
  -- record a split that does not add up.
  amount_gross_usd  numeric(12,2) not null check (amount_gross_usd > 0),
  fee_pct           numeric(5,2)  not null check (fee_pct >= 0 and fee_pct <= 100),
  fee_usd           numeric(12,2) not null check (fee_usd >= 0),
  amount_net_usd    numeric(12,2) not null check (amount_net_usd > 0),

  -- Where it goes. Deliberately per-request and NOT read back from
  -- profiles.evm_wallet_address / tron_wallet_address — those columns are
  -- retired (see platform-wallets.ts) and this must not resurrect them.
  -- Shape is constrained below; membership of the network registry is checked
  -- in request_payout(), which is the only thing that inserts here.
  destination_address text not null,
  destination_network text not null,
  destination_token   text not null,

  status            text not null default 'pending'
                      check (status in ('pending','processing','paid','rejected')),
  -- Set when an operator settles or declines the request.
  tx_hash           text unique,
  note              text,

  created_at        timestamptz not null default now(),
  processed_at      timestamptz,

  constraint payouts_split_adds_up check (amount_net_usd = amount_gross_usd - fee_usd),
  constraint payouts_token_known check (destination_token in ('USDT','USDC')),
  -- A settlement instruction has to be actionable on the chain it names. The
  -- pairing check is what stops an EVM address being filed against a Tron
  -- payout (or the reverse), which is the one typo an operator could act on
  -- before noticing.
  constraint payouts_address_matches_network check (
    case
      when destination_network = 'tron'
        then destination_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
      else destination_address ~ '^0x[a-fA-F0-9]{40}$'
    end
  )
);

create index if not exists payouts_profile_idx on public.payouts(profile_id);
create index if not exists payouts_status_idx  on public.payouts(status);

alter table public.payouts enable row level security;

-- Read-only to its owner, mirroring `orders_owner_read` (0001). No insert or
-- update policy on purpose: a creator who could INSERT here could name their
-- own amount and fee. Requests go through request_payout() below, settlement
-- goes through the service role.
drop policy if exists "payouts_owner_read" on public.payouts;
create policy "payouts_owner_read" on public.payouts
  for select using (profile_id = auth.uid());

-- TRUNCATE ignores RLS entirely — it is a table-level operation, so "RLS on,
-- no insert policy" does not stop it, and Supabase's default
-- `grant all on all tables ... to anon, authenticated` includes it. Emptying
-- `payouts` would zero every creator's in_flight and paid_out_gross, making
-- already-redeemed balances redeemable again; emptying `creator_fee_rates`
-- would silently reset every negotiated rate to the 5% base.
--
-- Not reachable through PostgREST today (there is no TRUNCATE verb), and
-- `orders` has carried the same exposure since 0001. Closed here anyway
-- because these two tables are the ledger.
revoke truncate on public.payouts, public.creator_fee_rates
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- creator_balance()
-- ---------------------------------------------------------------------------
-- The single definition of what a creator is owed. Both the dashboard and
-- request_payout() read it, so the number the creator is shown and the number
-- their request is checked against cannot drift apart.
--
-- 'pending' and 'processing' payouts hold their funds: without that, a creator
-- could submit the same balance for redemption repeatedly while the first
-- request was still being settled. 'rejected' releases them.
create or replace function public.creator_balance(p_profile uuid)
returns table (
  gross_earned   numeric,
  in_flight      numeric,
  paid_out_gross numeric,
  fees_charged   numeric,
  net_received   numeric,
  available      numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with earned as (
    select coalesce(sum(price_usd), 0)::numeric(12,2) as total
    from public.orders
    where profile_id = p_profile and status = 'paid'
  ),
  -- Column aliases are deliberately NOT the function's output names: in a
  -- RETURNS TABLE function the output names are in scope over the body, and an
  -- unqualified reference to one that also names a column is ambiguous.
  moved as (
    select
      coalesce(sum(amount_gross_usd) filter (where status in ('pending','processing')), 0)::numeric(12,2) as mv_in_flight,
      coalesce(sum(amount_gross_usd) filter (where status = 'paid'), 0)::numeric(12,2) as mv_paid_gross,
      coalesce(sum(fee_usd)          filter (where status = 'paid'), 0)::numeric(12,2) as mv_fees,
      coalesce(sum(amount_net_usd)   filter (where status = 'paid'), 0)::numeric(12,2) as mv_net
    from public.payouts
    where profile_id = p_profile
  )
  select
    earned.total,
    moved.mv_in_flight,
    moved.mv_paid_gross,
    moved.mv_fees,
    moved.mv_net,
    -- Clamped at zero. The subtraction cannot go negative unless a payout was
    -- settled that the balance never covered, and surfacing that to a creator
    -- as "-$40.00 available" explains nothing; request_payout() rejects
    -- everything at zero either way.
    greatest(earned.total - moved.mv_in_flight - moved.mv_paid_gross, 0)::numeric(12,2)
  from earned, moved;
$$;

-- SECURITY DEFINER, so it must not be callable for someone else's profile.
revoke all on function public.creator_balance(uuid) from public, anon, authenticated;
grant execute on function public.creator_balance(uuid) to service_role;

-- The caller-scoped version is what the dashboard uses: no argument to forge.
-- It carries the fee rate too, because creator_fee_rates is unreadable to
-- `authenticated` and the redemption form still has to quote the split.
create or replace function public.my_balance()
returns table (
  gross_earned   numeric,
  in_flight      numeric,
  paid_out_gross numeric,
  fees_charged   numeric,
  net_received   numeric,
  available      numeric,
  fee_pct        numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.*, public.effective_fee_pct(auth.uid())
  from public.creator_balance(auth.uid()) b;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, so the revoke is what
-- actually scopes this — without it anon could call it too (harmlessly, since
-- auth.uid() would be null and every sum would come back zero, but a function
-- that reads money should not be callable by a role that has no money).
revoke all on function public.my_balance() from public, anon;
grant execute on function public.my_balance() to authenticated;

-- ---------------------------------------------------------------------------
-- request_payout()
-- ---------------------------------------------------------------------------
-- The only way a creator-initiated row reaches `payouts`.
--
-- Three things make this a function rather than an insert policy. The fee
-- split is computed here from the stored rate, so a client cannot post its own
-- fee_usd. supabase-js has no transactions, so a read-then-insert in
-- application code would let two concurrent requests both pass the balance
-- check and overdraw; the FOR UPDATE lock on the profile row serialises them.
-- And because `authenticated` can call this directly over PostgREST, every
-- validation that matters has to be on this side of the wire.
--
-- Every `raise exception` below is written to be shown to a creator verbatim,
-- and they all carry SQLSTATE P0001 (the default for a bare RAISE). The action
-- keys off that to decide what is safe to display — see requestPayout().
create or replace function public.request_payout(
  p_amount  numeric,
  p_address text,
  p_network text,
  p_token   text
)
returns public.payouts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_min       constant numeric(12,2) := 10.00;
  v_fee_pct   numeric(5,2);
  v_available numeric(12,2);
  v_amount    numeric(12,2);
  v_fee       numeric(12,2);
  v_address   text := btrim(coalesce(p_address, ''));
  v_row       public.payouts;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- Serialises concurrent requests from this creator. Everything below reads
  -- balances that only this creator's rows can change, so locking their
  -- profile row is enough. FOR UPDATE takes no lock and raises nothing when
  -- zero rows match, so the miss is checked rather than assumed.
  perform 1 from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'No profile found for this account';
  end if;

  v_fee_pct := public.effective_fee_pct(v_uid);

  -- ---- shape, before money ----
  -- Compared against 'NaN' explicitly, NOT via `p_amount <> p_amount`: that
  -- trick is IEEE float semantics, and `numeric` deliberately defines
  -- NaN = NaN as true so it can be indexed and sorted. NaN would still fail
  -- safe further down (NaN > anything is true, so the balance check rejects
  -- it) but with a message about the balance rather than about the amount.
  if p_amount is null or p_amount = 'NaN'::numeric then
    raise exception 'Enter an amount to redeem';
  end if;

  v_amount := round(p_amount, 2);

  if v_amount < v_min then
    raise exception 'Minimum redemption is %', to_char(v_min, 'FM$999999990.00');
  end if;

  if p_token is null or p_token not in ('USDT','USDC') then
    raise exception 'Choose USDT or USDC';
  end if;

  -- Mirrors the network ids in lib/crypto/config.ts, both the mainnet and
  -- testnet sets, since NEXT_PUBLIC_CRYPTO_ENV picks between them at runtime
  -- and this function cannot see it.
  --
  -- ⚠️ Adding a network means editing TWO places: this list, and the
  -- `payouts_address_matches_network` constraint above. The constraint's
  -- `else` branch assumes EVM, so a non-EVM network added only here would be
  -- silently held to the 0x regex and every request for it would fail on the
  -- constraint rather than on a message. Consistent today: config.ts uses
  -- id 'tron' for both Tron mainnet and Nile, and sepolia is EVM.
  if p_network is null or p_network not in (
    'ethereum','polygon','bsc','arbitrum','optimism','base','tron','sepolia'
  ) then
    raise exception 'Unsupported network';
  end if;

  -- Redundant with payouts_address_matches_network, on purpose: the constraint
  -- is the guarantee, this is the sentence a creator can act on.
  if p_network = 'tron' then
    if v_address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then
      raise exception 'That is not a Tron address — they start with T and are 34 characters';
    end if;
  elsif v_address !~ '^0x[a-fA-F0-9]{40}$' then
    raise exception 'That is not a valid EVM address — 0x followed by 40 hex characters';
  end if;

  -- ---- money ----
  select available into v_available from public.creator_balance(v_uid);

  if v_amount > v_available then
    raise exception 'Amount exceeds your available balance of %',
      to_char(v_available, 'FM$999999990.00');
  end if;

  -- Rounded half-away-from-zero, then net is the remainder rather than a
  -- second rounding, so the two always add back to the gross.
  v_fee := round(v_amount * v_fee_pct / 100, 2);

  -- Only reachable at a 100% fee rate, which is a configuration mistake rather
  -- than something a creator did. Caught here so it reads as a sentence
  -- instead of as a check-constraint violation.
  if v_amount - v_fee <= 0 then
    raise exception 'This account''s fee rate leaves nothing to pay out — contact support';
  end if;

  insert into public.payouts (
    profile_id, amount_gross_usd, fee_pct, fee_usd, amount_net_usd,
    destination_address, destination_network, destination_token
  ) values (
    v_uid, v_amount, v_fee_pct, v_fee, v_amount - v_fee,
    v_address, p_network, p_token
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.request_payout(numeric, text, text, text) from public, anon;
grant execute on function public.request_payout(numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- settle_payout()
-- ---------------------------------------------------------------------------
-- Operator-side completion, service role only. Exists so settling a payout is
-- one statement in the SQL editor rather than a hand-written UPDATE that might
-- forget `processed_at` or move a row out of a terminal state.
--
--   select public.settle_payout('<payout-uuid>', 'paid', '0xtxhash…', null);
--
-- Rejecting returns the funds to the creator's available balance, because
-- creator_balance() only reserves 'pending'/'processing'/'paid'.
create or replace function public.settle_payout(
  p_payout  uuid,
  p_status  text,
  p_tx_hash text default null,
  p_note    text default null
)
returns public.payouts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.payouts;
begin
  if p_status not in ('processing','paid','rejected') then
    raise exception 'Status must be processing, paid or rejected';
  end if;

  -- 'paid' permanently deducts the balance, so it has to point at a transfer
  -- somebody can verify. coalesce() below would otherwise let an omitted
  -- argument settle a payout to nothing.
  if p_status = 'paid'
     and coalesce(btrim(p_tx_hash), '') = ''
     and not exists (
       select 1 from public.payouts
       where id = p_payout and coalesce(btrim(tx_hash), '') <> ''
     )
  then
    raise exception 'Marking a payout paid requires the transaction hash';
  end if;

  update public.payouts
     set status       = p_status,
         tx_hash      = coalesce(nullif(btrim(p_tx_hash), ''), tx_hash),
         note         = coalesce(p_note, note),
         processed_at = case when p_status = 'processing' then processed_at else now() end
   where id = p_payout
     and status in ('pending','processing')   -- terminal states are final
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Payout % not found, or already settled', p_payout;
  end if;

  return v_row;
end;
$$;

revoke all on function public.settle_payout(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_payout(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Operator crib
-- ---------------------------------------------------------------------------
-- There is no admin UI for any of this yet; it is all SQL editor work.
--
--   -- what is waiting to be sent
--   select p.id, pr.username, p.amount_net_usd, p.destination_token,
--          p.destination_network, p.destination_address, p.created_at
--     from public.payouts p
--     join public.profiles pr on pr.id = p.profile_id
--    where p.status = 'pending'
--    order by p.created_at;
--
--   -- send the money, THEN record it
--   select public.settle_payout('<payout-uuid>', 'paid', '<tx-hash>');
--
--   -- decline one; the amount returns to the creator's available balance
--   select public.settle_payout('<payout-uuid>', 'rejected', null, 'reason shown to the creator');
--
--   -- put a creator on a negotiated rate (absent row = the 5% base rate)
--   insert into public.creator_fee_rates (profile_id, fee_pct, note)
--   values ('<profile-uuid>', 3.00, 'launch partner')
--   on conflict (profile_id) do update
--     set fee_pct = excluded.fee_pct, note = excluded.note, updated_at = now();
--
-- Rates apply from the moment they are set: each payout freezes the rate it
-- was quoted at into payouts.fee_pct, so changing this never restates history.
