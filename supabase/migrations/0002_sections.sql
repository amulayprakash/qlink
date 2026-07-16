-- ===========================================================================
-- Linktree-Q :: sections + per-creator page theme
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
--
-- A creator page becomes an ORDERED list of sections. v1 ships one kind
-- ('links'); the `kind` discriminant exists so later kinds do not need a
-- table rewrite. Widening it is one `alter ... check` in a later migration.
--
-- links.section_id is deliberately NULLABLE. Motivated: the onboarding wizard
-- and the old profile form write links without knowing about sections, and a
-- NOT NULL column would hard-break signup. Null means "the default section".
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- sections
-- ---------------------------------------------------------------------------
create table if not exists public.sections (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'links' check (kind in ('links')),
  title       text,
  position    int not null default 0,
  collapsible boolean not null default false,
  -- Render-time default for the <details open> attribute. A visitor toggling
  -- a section is NOT persisted; this is the creator's chosen starting state.
  default_open boolean not null default true,
  created_at  timestamptz not null default now(),
  -- Motivated: lets links carry a COMPOSITE fk so a link can never be
  -- attached to another creator's section.
  unique (id, profile_id)
);
create index if not exists sections_profile_idx on public.sections(profile_id);

-- ---------------------------------------------------------------------------
-- links.section_id  (nullable; composite fk pins section+owner together)
-- ---------------------------------------------------------------------------
alter table public.links
  add column if not exists section_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'links_section_fk'
  ) then
    alter table public.links
      add constraint links_section_fk
      foreign key (section_id, profile_id)
      references public.sections(id, profile_id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists links_section_idx on public.links(section_id);

-- ---------------------------------------------------------------------------
-- profiles.theme_config  (custom overrides on top of the `theme` preset id)
-- `theme` already exists and finally gets written by the editor.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists theme_config jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Backfill: every profile that already has links gets one untitled links
-- section, and its links are assigned to it. Untitled on purpose so existing
-- published pages do not sprout a heading they never asked for.
-- Idempotent: the `not exists` guard and the `section_id is null` filter make
-- a second run a no-op.
-- ---------------------------------------------------------------------------
insert into public.sections (profile_id, kind, title, position)
select distinct l.profile_id, 'links', null, 0
from public.links l
where not exists (
  select 1 from public.sections s
  where s.profile_id = l.profile_id and s.kind = 'links'
);

update public.links l
set section_id = pick.id
from (
  select distinct on (profile_id) profile_id, id
  from public.sections
  where kind = 'links'
  order by profile_id, position, created_at
) pick
where pick.profile_id = l.profile_id
  and l.section_id is null;

-- ---------------------------------------------------------------------------
-- New signups get a default section too. Motivated: the backfill above is a
-- one-shot, so without this every post-migration signup starts with zero
-- sections and the editor would have to special-case an empty page.
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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Row Level Security  (mirrors the links policies verbatim)
-- ===========================================================================
alter table public.sections enable row level security;

drop policy if exists "sections_public_read" on public.sections;
create policy "sections_public_read" on public.sections
  for select using (
    exists (select 1 from public.profiles p
            where p.id = sections.profile_id and p.is_published)
  );

drop policy if exists "sections_owner_all" on public.sections;
create policy "sections_owner_all" on public.sections
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ===========================================================================
-- Rollback (paste into the SQL editor to undo; links + positions survive)
-- ---------------------------------------------------------------------------
--   alter table public.links drop constraint if exists links_section_fk;
--   alter table public.links drop column if exists section_id;
--   alter table public.profiles drop column if exists theme_config;
--   drop table if exists public.sections cascade;
--   -- then re-run handle_new_user() from 0001_init.sql
-- ===========================================================================
