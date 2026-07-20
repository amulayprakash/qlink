-- 0012_referrals.sql
--
-- Referrals: a creator shares a link, whoever signs up through it is attributed
-- to them, and the referrer earns a share of what that person redeems.
--
-- The share comes OUT OF THE PLATFORM FEE, not out of the referee's earnings.
-- Nobody earns less because they were referred, and the platform never pays out
-- more than it collected — every credit here is capped by the `fee_usd` that
-- was actually charged on the payout that triggered it.
--
-- Timing follows 0011's: the fee is collected when the referee REDEEMS, so the
-- referral credit is minted then too. Crediting at checkout would promise a
-- referrer a cut of a fee that has not been taken yet and might never be, since
-- an unredeemed balance is never charged.
--
-- ⚠️ THIS IS DELIBERATELY ONE LEVEL DEEP. See `single level` below — it is
-- enforced by the shape of the data, not by a rule someone has to remember.

-- ---------------------------------------------------------------------------
-- referral_codes
-- ---------------------------------------------------------------------------
-- The shareable code, in its own table rather than a column on `profiles`.
--
-- Same reason as `creator_fee_rates` in 0011: `profiles_owner_all` (0001) is
-- `for all` with `auth.uid() = id`, so a creator can UPDATE every column on
-- their own row. A creator-writable code is a code that can be RE-POINTED — set
-- yours to the string a competitor has been printing on flyers the moment they
-- change theirs, and their pending sign-ups attribute to you.
--
-- Not the username either, for the same mutability reason plus a worse one: a
-- creator who renames themselves would silently break every link they have
-- already shared, and the freed username could then be claimed by someone else.
-- A code is issued once and never changes.
create table if not exists public.referral_codes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  code       citext unique not null check (code ~ '^[a-z0-9]{6,12}$'),
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;
-- Deliberately no policies. A creator reads their own through
-- my_referral_code(); nobody enumerates the table. Anonymous resolution of a
-- code to a profile happens inside claim_referral(), which never returns the
-- referrer's identity to the caller.

-- ---------------------------------------------------------------------------
-- referrals
-- ---------------------------------------------------------------------------
-- Who referred whom. One row per referee, ever.
--
-- `referee_id` is the PRIMARY KEY, which is what makes attribution permanent:
-- there is no second row to add and no policy that permits an update, so a
-- referral cannot be re-pointed after the fact. That is also why this is not a
-- `profiles.referred_by` column — that column would be creator-writable, and a
-- creator who can set their own referrer can set it to their own second
-- account.
--
-- ⚠️ single level. This table is only ever read one hop: given a referee, find
-- their referrer, credit them, stop. There is no recursive query anywhere in
-- this migration and no `referrals` row is created as a consequence of another
-- one. Second-order leakage — A earning from B's earnings from C — is closed
-- separately, in credit_referral() below, by basing credits on the referee's
-- SALES rather than on their redemptions. Both halves are needed: this note is
-- the intent, that cap is the mechanism.
create table if not exists public.referrals (
  referee_id  uuid primary key references public.profiles(id) on delete cascade,
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),

  -- Self-referral, at the storage layer. claim_referral() rejects it with a
  -- sentence; this makes it unrepresentable even if something else ever writes
  -- here with the service role.
  constraint referrals_no_self check (referrer_id <> referee_id)
);

create index if not exists referrals_referrer_idx on public.referrals(referrer_id);

alter table public.referrals enable row level security;

-- A creator may see who they referred. They may NOT see who referred them:
-- that is the platform's attribution record, and surfacing it invites
-- "please re-point mine" support traffic over something that is deliberately
-- immutable.
drop policy if exists "referrals_referrer_read" on public.referrals;
create policy "referrals_referrer_read" on public.referrals
  for select using (referrer_id = auth.uid());

-- No insert or update policy: claim_referral() is the only writer.

-- ---------------------------------------------------------------------------
-- referral_earnings
-- ---------------------------------------------------------------------------
-- One row per payout that generated a credit. `payout_id` is UNIQUE, which is
-- what makes crediting idempotent — settle_payout() can be re-run against a row
-- without paying a referrer twice, exactly as `orders.tx_hash` being unique is
-- what makes on-chain verification idempotent.
--
-- The split is frozen here the same way `payouts` freezes its fee split: the
-- base rate moving from 2% later must not restate credits already earned.
create table if not exists public.referral_earnings (
  id               uuid primary key default gen_random_uuid(),
  referrer_id      uuid not null references public.profiles(id) on delete cascade,
  referee_id       uuid not null references public.profiles(id) on delete cascade,
  payout_id        uuid not null unique references public.payouts(id) on delete cascade,

  -- The portion of that payout that counted toward the credit. NOT the payout's
  -- full gross — see the sales cap in credit_referral(). Summing this column per
  -- referee is how the cap knows what it has already used.
  source_gross_usd numeric(12,2) not null check (source_gross_usd > 0),
  referral_pct     numeric(5,2)  not null check (referral_pct >= 0 and referral_pct <= 100),
  amount_usd       numeric(12,2) not null check (amount_usd > 0),

  created_at       timestamptz not null default now(),

  constraint referral_earnings_no_self check (referrer_id <> referee_id)
);

create index if not exists referral_earnings_referrer_idx on public.referral_earnings(referrer_id);
create index if not exists referral_earnings_referee_idx  on public.referral_earnings(referee_id);

alter table public.referral_earnings enable row level security;

-- Readable by the person who earned it — it is a line item in their balance and
-- an unexplained number on that screen is worse than no number. Not readable by
-- the referee: what someone else earns from your account is not your business,
-- and it is derivable back to their fee rate.
drop policy if exists "referral_earnings_owner_read" on public.referral_earnings;
create policy "referral_earnings_owner_read" on public.referral_earnings
  for select using (referrer_id = auth.uid());

-- Same exposure 0011 closed on `payouts`: TRUNCATE is a table-level operation
-- that RLS does not gate, and Supabase grants it to anon/authenticated by
-- default. Emptying `referral_earnings` would erase credits already counted
-- into balances; emptying `referrals` would detach every attribution.
revoke truncate on public.referrals, public.referral_earnings, public.referral_codes
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The referral rate
-- ---------------------------------------------------------------------------
-- BASE RATE LIVES HERE. lib/fees.ts duplicates it for the dashboard copy and
-- says so.
--
-- Capped at the referee's own fee rate, because the credit is carved out of
-- that fee. A creator on a negotiated 1% rate cannot fund a 2% referral: the
-- platform would be paying out more than it took. `least()` is not a rounding
-- detail, it is the solvency guarantee.
create or replace function public.referral_pct(p_fee_pct numeric)
returns numeric
language sql
immutable
as $$
  select least(2.00, coalesce(p_fee_pct, 0))::numeric(5,2);
$$;

revoke all on function public.referral_pct(numeric) from public, anon, authenticated;
grant execute on function public.referral_pct(numeric) to service_role;

-- ---------------------------------------------------------------------------
-- my_referral_code()
-- ---------------------------------------------------------------------------
-- The caller's code, minted on first read.
--
-- Lazy rather than a trigger on signup, for the reason 0011 gives for
-- `creator_fee_rates` having no backfill: a row that is created on demand needs
-- no migration for the users who already exist, and a user who never opens the
-- referrals screen never gets a row.
--
-- The code is hex sliced out of a random uuid, retried on collision. 32 bits is
-- 4.3e9 values, which sounds ample and is not: collisions start showing up
-- around 65k codes by the birthday bound, so the retry loop is load-bearing
-- rather than defensive — "the unique index will catch it" is only true if
-- something then tries again.
--
-- ⚠️ NOT gen_random_bytes(), which is the obvious choice and does not work
-- here. On Supabase pgcrypto is installed into the `extensions` schema, and
-- this function pins `search_path = public, pg_temp` — so gen_random_bytes is
-- simply not on the path and the call raises at runtime. It fails only when
-- invoked through PostgREST; a test run from the SQL editor passes, because
-- that session's search_path does include `extensions`. gen_random_uuid() is in
-- pg_catalog, which is always resolvable no matter what the path is pinned to.
-- Widening the search_path would also have fixed it and would have been the
-- wrong fix: pinning it is what stops a SECURITY DEFINER function being steered
-- at an attacker's shadow objects.
create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  v_try  int := 0;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select code into v_code from public.referral_codes where profile_id = v_uid;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_try := v_try + 1;
    if v_try > 10 then
      raise exception 'Could not allocate a referral code';
    end if;

    -- The first 8 hex digits of a v4 uuid: 32 random bits, already zero-padded
    -- to a fixed width by the uuid's own formatting. Taken from the FRONT
    -- deliberately — a v4 uuid pins its version nibble at hex position 13 and
    -- two variant bits at 17, so a slice from the middle would be partly
    -- constant across every code.
    v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    -- to_hex gives [0-9a-f]; that is already inside the table's [a-z0-9] check
    -- and avoids the ambiguous glyph problem entirely (no l/1, no O/0 pairs to
    -- confuse in a code someone reads off a screen).

    begin
      insert into public.referral_codes (profile_id, code)
      values (v_uid, v_code)
      returning code into v_code;
      return v_code;
    exception when unique_violation then
      -- Either the code collided (retry) or this profile raced itself in
      -- another tab (return what won).
      select code into v_code from public.referral_codes where profile_id = v_uid;
      if v_code is not null then
        return v_code;
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

-- ---------------------------------------------------------------------------
-- claim_referral()
-- ---------------------------------------------------------------------------
-- Attribution, called once just after sign-up with the code carried in from the
-- click (see app/auth/callback/route.ts).
--
-- Every rule that decides whether money later moves is in here rather than in
-- the callback, because `authenticated` can call this directly over PostgREST
-- with the anon key — same posture as request_payout() in 0011. The callback is
-- a convenient trigger, not a trust boundary.
--
-- Returns true when an attribution was recorded, false when there was nothing
-- to do. Refusals are NOT exceptions: the caller is a redirect handler, and a
-- stale cookie must not turn a successful sign-in into an error page.
create or replace function public.claim_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_referrer uuid;
  v_created  timestamptz;
  -- How long after signup an attribution can still be recorded. The cookie is
  -- the real clock (it is what carries the code); this is the backstop that
  -- keeps a hand-crafted PostgREST call from attributing a two-year-old account
  -- to whoever offers the most for it.
  v_window   constant interval := '30 days';
begin
  if v_uid is null then
    return false;
  end if;

  if p_code is null or btrim(p_code) = '' then
    return false;
  end if;

  select profile_id into v_referrer
  from public.referral_codes
  where code = btrim(p_code);

  if v_referrer is null or v_referrer = v_uid then
    return false;                              -- unknown code, or self-referral
  end if;

  select created_at into v_created from public.profiles where id = v_uid;
  if v_created is null or v_created < now() - v_window then
    return false;                              -- not a sign-up attribution
  end if;

  -- Reciprocal pairs. A referring B and B referring A is not fraud on its own,
  -- but it is the smallest loop that makes two accounts each other's upline,
  -- and it is free to close here.
  if exists (
    select 1 from public.referrals
    where referee_id = v_referrer and referrer_id = v_uid
  ) then
    return false;
  end if;

  -- First claim wins, permanently. ON CONFLICT rather than a prior SELECT so
  -- two tabs finishing the OAuth round-trip together cannot both insert.
  insert into public.referrals (referee_id, referrer_id)
  values (v_uid, v_referrer)
  on conflict (referee_id) do nothing;

  return found;
end;
$$;

revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- ---------------------------------------------------------------------------
-- credit_referral()
-- ---------------------------------------------------------------------------
-- Mints the credit for one settled payout. Called by settle_payout() only.
--
-- ⚠️ THE SALES CAP IS WHAT KEEPS THIS OUT OF MLM TERRITORY, and it is subtle
-- enough to be worth spelling out.
--
-- Referral credits land in the referrer's own balance, which means they are
-- redeemable, which means settling THAT redemption would run through here
-- again. Without a cap, a chain A <- B <- C compounds: C sells, B earns a
-- credit, B redeems, and A earns a credit on B's credit. Nothing in the
-- `referrals` table says "one level" loudly enough to stop that, because the
-- recursion is not in the table — it is in the money.
--
-- So credits are based on the referee's SALES, not on what they redeemed.
-- `source_gross_usd` accumulates toward their lifetime paid-order total and
-- stops there. Redeeming referral income moves money the referee never sold, so
-- it finds the cap already consumed and mints nothing. One level, structurally,
-- however deep the chain of accounts goes.
create or replace function public.credit_referral(p_payout uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payout      public.payouts;
  v_referrer    uuid;
  v_sales       numeric(12,2);
  v_used        numeric(12,2);
  v_base        numeric(12,2);
  v_pct         numeric(5,2);
  v_amount      numeric(12,2);
begin
  select * into v_payout from public.payouts where id = p_payout;
  if not found or v_payout.status <> 'paid' then
    return;
  end if;

  select referrer_id into v_referrer
  from public.referrals
  where referee_id = v_payout.profile_id;

  if v_referrer is null then
    return;
  end if;

  -- Lifetime sales, and how much of that base previous credits already spent.
  select coalesce(sum(price_usd), 0)::numeric(12,2) into v_sales
  from public.orders
  where profile_id = v_payout.profile_id and status = 'paid';

  select coalesce(sum(source_gross_usd), 0)::numeric(12,2) into v_used
  from public.referral_earnings
  where referee_id = v_payout.profile_id;

  v_base := least(v_payout.amount_gross_usd, greatest(v_sales - v_used, 0));
  if v_base <= 0 then
    return;                                    -- cap consumed; see the note above
  end if;

  v_pct := public.referral_pct(v_payout.fee_pct);
  v_amount := round(v_base * v_pct / 100, 2);

  -- Solvency, restated at the point of payment: the credit comes out of the fee
  -- this payout actually charged, so it can never exceed it. referral_pct()
  -- already guarantees this arithmetically; the clamp survives a future rate
  -- change that forgets to.
  v_amount := least(v_amount, v_payout.fee_usd);

  -- Sub-cent credits are dropped rather than stored as zero: the table's checks
  -- require a positive amount, and a $0.00 row in a creator's earnings list is
  -- a support question, not information.
  if v_amount <= 0 then
    return;
  end if;

  insert into public.referral_earnings (
    referrer_id, referee_id, payout_id, source_gross_usd, referral_pct, amount_usd
  ) values (
    v_referrer, v_payout.profile_id, v_payout.id, v_base, v_pct, v_amount
  )
  on conflict (payout_id) do nothing;         -- idempotent; see the unique index
end;
$$;

revoke all on function public.credit_referral(uuid) from public, anon, authenticated;
grant execute on function public.credit_referral(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- creator_balance() / my_balance() — replaced to include referral income
-- ---------------------------------------------------------------------------
-- DROP, not CREATE OR REPLACE: both gain an output column, and replace cannot
-- change a function's return type.
--
-- Safe to drop in this order despite request_payout() and my_balance() calling
-- creator_balance(): PostgreSQL does not record dependencies on functions
-- referenced from a quoted function body (only `BEGIN ATOMIC` bodies, which
-- these are not), so the callers keep working and simply resolve the new
-- definition on their next call. Nothing else needs re-creating.
drop function if exists public.my_balance();
drop function if exists public.creator_balance(uuid);

create function public.creator_balance(p_profile uuid)
returns table (
  gross_earned    numeric,
  referral_earned numeric,
  in_flight       numeric,
  paid_out_gross  numeric,
  fees_charged    numeric,
  net_received    numeric,
  available       numeric
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
  -- Referral income is spendable the moment it is minted, and it is minted only
  -- when the underlying payout has already settled 'paid' — so unlike orders
  -- there is no pending state to filter on here.
  referred as (
    select coalesce(sum(amount_usd), 0)::numeric(12,2) as total
    from public.referral_earnings
    where referrer_id = p_profile
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
    referred.total,
    moved.mv_in_flight,
    moved.mv_paid_gross,
    moved.mv_fees,
    moved.mv_net,
    -- Referral income is added to the redeemable pool on the same footing as
    -- sales: it is money we owe, and 0011's reservation of in-flight and
    -- settled payouts already covers whatever is drawn against it.
    greatest(
      earned.total + referred.total - moved.mv_in_flight - moved.mv_paid_gross, 0
    )::numeric(12,2)
  from earned, referred, moved;
$$;

revoke all on function public.creator_balance(uuid) from public, anon, authenticated;
grant execute on function public.creator_balance(uuid) to service_role;

create function public.my_balance()
returns table (
  gross_earned    numeric,
  referral_earned numeric,
  in_flight       numeric,
  paid_out_gross  numeric,
  fees_charged    numeric,
  net_received    numeric,
  available       numeric,
  fee_pct         numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.*, public.effective_fee_pct(auth.uid())
  from public.creator_balance(auth.uid()) b;
$$;

revoke all on function public.my_balance() from public, anon;
grant execute on function public.my_balance() to authenticated;

-- ---------------------------------------------------------------------------
-- settle_payout() — replaced to mint the referral credit
-- ---------------------------------------------------------------------------
-- Return type is unchanged, so this one really is a replace. Identical to 0011
-- apart from the credit_referral() call, which is placed AFTER the update and
-- guarded on the new status: a credit must never exist for a payout that was
-- rejected, and the update's `status in ('pending','processing')` guard means
-- this branch is reached exactly once per payout.
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

  -- Same transaction as the settlement: a credit cannot survive a rolled-back
  -- payout, and a settled payout cannot silently skip its credit.
  if v_row.status = 'paid' then
    perform public.credit_referral(v_row.id);
  end if;

  return v_row;
end;
$$;

revoke all on function public.settle_payout(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_payout(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Operator crib
-- ---------------------------------------------------------------------------
-- Referral credits mint themselves inside settle_payout(); there is nothing to
-- run by hand in the normal path. These are for answering questions about it.
--
--   -- who referred whom, and what it has earned
--   select ref.username as referrer, ree.username as referee,
--          r.created_at,
--          coalesce(sum(re.amount_usd), 0) as earned
--     from public.referrals r
--     join public.profiles ref on ref.id = r.referrer_id
--     join public.profiles ree on ree.id = r.referee_id
--     left join public.referral_earnings re on re.referee_id = r.referee_id
--    group by ref.username, ree.username, r.created_at
--    order by earned desc;
--
--   -- how much referral headroom a referee has left (the sales cap)
--   select (select coalesce(sum(price_usd),0) from public.orders
--            where profile_id = '<referee-uuid>' and status = 'paid')
--        - (select coalesce(sum(source_gross_usd),0) from public.referral_earnings
--            where referee_id = '<referee-uuid>') as uncredited_sales;
--
--   -- attribute a sign-up by hand (support fixing a lost cookie).
--   -- Bypasses claim_referral's 30-day window and self/cycle checks, so read
--   -- them first and satisfy them yourself.
--   insert into public.referrals (referee_id, referrer_id)
--   values ('<referee-uuid>', '<referrer-uuid>')
--   on conflict (referee_id) do nothing;
--
-- Reversing an attribution is deliberately not scripted. `referrals` is keyed
-- on referee_id with no update policy precisely so that "who referred this
-- person" is answered once; a DELETE here orphans nothing but does silently
-- stop future credits, so do it knowingly.
