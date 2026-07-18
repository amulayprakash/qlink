-- ===========================================================================
-- Qlink :: page analytics events
-- ---------------------------------------------------------------------------
-- The visitor funnel on public creator pages. Four events are recorded here;
-- the fifth funnel stage (paid) is read from `orders`, which is already the
-- authoritative record of a completed payment.
--
--   page_view       visitor landed on /<username>
--   section_view    a section scrolled into view    (section: links|packages|promo)
--   package_open    a package detail modal opened    (package_id set)
--   checkout_start  the checkout modal opened        (package_id set)
--
-- Trust model mirrors `orders`: rows are written ONLY by the service role in
-- app/api/events (which bypasses RLS), never by the anonymous visitor's client.
-- They are read by the app-wide admin dashboard (/v1/admin), also via the
-- service role, so no anon read policy is granted. The owner-read policy below
-- exists for parity with orders_owner_read (a creator could one day read their
-- own page's events); nothing depends on it yet.
-- ===========================================================================

create table if not exists public.page_events (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  type        text not null
                check (type in ('page_view','section_view','package_open','checkout_start')),
  -- Only meaningful for section_view; null otherwise.
  section     text
                check (section is null or section in ('links','packages','promo')),
  -- Only meaningful for package_open / checkout_start. set null (not cascade
  -- delete) so removing a package never erases the history of it being viewed.
  package_id  uuid references public.packages(id) on delete set null,
  -- Anonymous, client-generated id (localStorage) used to count unique
  -- visitors. Deliberately not a fingerprint and not tied to any account.
  visitor_id  text,
  created_at  timestamptz not null default now()
);

-- profile_id + created_at together serve the admin dashboard's core query
-- ("this creator's events in the last N days"); the standalone type index
-- helps the section/funnel breakdowns.
create index if not exists page_events_profile_created_idx
  on public.page_events(profile_id, created_at);
create index if not exists page_events_created_idx on public.page_events(created_at);
create index if not exists page_events_type_idx    on public.page_events(type);

alter table public.page_events enable row level security;

-- No insert policy on purpose: writes go through the service role (server
-- route), exactly like orders. With RLS on and no anon policy, the anon client
-- can neither read nor write this table directly.
drop policy if exists "page_events_owner_read" on public.page_events;
create policy "page_events_owner_read" on public.page_events
  for select using (profile_id = auth.uid());
