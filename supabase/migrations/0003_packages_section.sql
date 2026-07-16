-- ===========================================================================
-- Linktree-Q :: the packages block becomes a real section
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
--
-- Until now "Packages" was hard-coded at the bottom of CreatorPageView: not in
-- the sections list, so it could not be reordered and could not be collapsed.
-- 0002 anticipated exactly this ("widening it is one `alter ... check` in a
-- later migration"), so this is that widening.
--
-- A packages section owns NO links. It is a positioned, titled, collapsible
-- placeholder that tells the page WHERE to render packages, which continue to
-- live in their own table and are still edited on /dashboard/packages.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Widen the kind discriminant.
--
-- 0002 declared the check inline, so Postgres auto-named it. Every check
-- constraint on the table that mentions `kind` is dropped by lookup rather
-- than by a guessed name. Motivated: `drop constraint if exists
-- sections_kind_check` SILENTLY SUCCEEDS against a differently-named
-- constraint, and we would then add the widened rule alongside the old
-- `kind in ('links')` — which still fails every packages insert, at runtime,
-- long after the migration reported success.
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'sections'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.sections drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.sections
  add constraint sections_kind_check check (kind in ('links', 'packages'));

-- ---------------------------------------------------------------------------
-- 2. At most one packages section per profile.
-- Motivated: packages are a single table-backed list, so two packages sections
-- would render the SAME packages twice with no way to tell them apart. The app
-- rejects a second one in zod, but the browser is not a trust boundary and a
-- partial unique index costs nothing.
-- ---------------------------------------------------------------------------
create unique index if not exists sections_one_packages_per_profile
  on public.sections (profile_id)
  where kind = 'packages';

-- ---------------------------------------------------------------------------
-- 3. Backfill: every profile gets a packages section, at the end.
--
-- EVERY profile, not just profiles that currently have packages. Motivated: a
-- creator who adds their first package next week must find the section already
-- sitting in the editor, otherwise the editor has to mint one on read and we
-- are back to special-casing. The section renders nothing while the profile
-- has no packages, so an unused row is invisible.
--
-- position = after everything that exists today, which reproduces the current
-- layout exactly: links first, packages last. Untitled on purpose so the page
-- keeps rendering the default "Packages" heading rather than sprouting a new
-- one. collapsible=false / default_open=true likewise preserve today's look.
--
-- Idempotent via the `not exists` guard (and the index in 2 as a backstop).
-- ---------------------------------------------------------------------------
insert into public.sections (profile_id, kind, title, position, collapsible, default_open)
select
  p.id,
  'packages',
  null,
  coalesce(
    (select max(s.position) + 1 from public.sections s where s.profile_id = p.id),
    0
  ),
  false,
  true
from public.profiles p
where not exists (
  select 1 from public.sections s
  where s.profile_id = p.id and s.kind = 'packages'
);

-- ---------------------------------------------------------------------------
-- 4. New signups get one too.
-- Motivated: the backfill above is a one-shot. Without this, every
-- post-migration signup starts with no packages section and their packages
-- would render only via the app-side fallback.
--
-- Restated in full rather than patched: `create or replace function` has no
-- partial form. This is 0002's body plus the second insert.
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

  insert into public.sections (profile_id, kind, title, position)
  select new.id, 'links', null, 0
  where not exists (
    select 1 from public.sections s
    where s.profile_id = new.id and s.kind = 'links'
  );

  insert into public.sections (profile_id, kind, title, position)
  select new.id, 'packages', null, 1
  where not exists (
    select 1 from public.sections s
    where s.profile_id = new.id and s.kind = 'packages'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS needs no change: the policies in 0002 are per-table, not per-kind, so a
-- packages section is already readable when published and writable by its
-- owner.

-- ===========================================================================
-- Rollback (paste into the SQL editor to undo)
--
-- Link sections, their positions, and the packages table itself all survive;
-- only the packages SECTIONS are dropped, and the page falls back to rendering
-- packages last, exactly as it did before this migration.
--
-- The last step is NOT optional. handle_new_user() below still inserts a
-- packages section, and once the check constraint is narrowed again that
-- insert violates it — which aborts the trigger, which aborts the signup.
-- Verified: skipping it fails every new signup with
-- `violates check constraint "sections_kind_check"`.
-- ---------------------------------------------------------------------------
--   delete from public.sections where kind = 'packages';
--   drop index if exists public.sections_one_packages_per_profile;
--   alter table public.sections drop constraint if exists sections_kind_check;
--   alter table public.sections
--     add constraint sections_kind_check check (kind in ('links'));
--   -- REQUIRED: re-run handle_new_user() from 0002_sections.sql, or signup
--   -- breaks for every new user.
-- ===========================================================================
