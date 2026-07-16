-- ===========================================================================
-- Linktree-Q :: a link can know what it is, and render as an icon
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
--
-- Two columns, one feature. Creators do not think of "instagram.com/ada" as a
-- URL — they think of it as their Instagram. `platform` records that, which is
-- what lets the page draw a glyph instead of a word, and `show_as_icon` says
-- to actually do it: render the link as a small icon under the bio rather than
-- as a full-width pill in the list.
--
-- Deliberately NOT a second table. A social icon is a link — same URL, same
-- ownership, same 50-per-page budget, same delete-and-reinsert save path. A
-- `socials` table would duplicate all of that to model one boolean, and would
-- then need its own answer for "what happens when you want it as a pill
-- instead".
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. platform: which well-known site this link points at.
--
-- Nullable, and free text rather than an enum or a check against a fixed list.
-- Motivated on both counts:
--   * null is the honest value for a custom link, which is most of them. It is
--     not "unknown" — there IS no platform.
--   * the catalogue lives in lib/platforms.ts and will grow. An enum would
--     make adding TikTok a migration, and — worse — REMOVING one would leave
--     stored rows that no longer satisfy the constraint, so the creator could
--     not re-save a page they had not touched. The render path falls back to a
--     generic link glyph for a slug it does not recognise, so an unknown value
--     degrades instead of failing.
-- The format check is the guard that matters: it keeps the column to the slug
-- shape lib/validation.ts enforces, so it can never hold a URL or free prose.
-- ---------------------------------------------------------------------------
alter table public.links
  add column if not exists platform text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'links_platform_slug'
  ) then
    alter table public.links
      add constraint links_platform_slug
      check (platform is null or platform ~ '^[a-z0-9_]{1,32}$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. show_as_icon: render under the bio instead of in the list.
--
-- default false, not null: every link that exists today is a pill and must
-- stay one. Same shape as is_active from 0004 — not null with a default that
-- preserves current behaviour — so a boolean on this table always means one
-- thing.
--
-- The two are independent: is_active decides WHETHER a link renders,
-- show_as_icon decides WHERE. A paused icon is hidden exactly like a paused
-- pill, and unpausing puts it back under the bio.
-- ---------------------------------------------------------------------------
alter table public.links
  add column if not exists show_as_icon boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. An icon needs something to draw.
--
-- show_as_icon with no platform is a link that renders as a mystery glyph with
-- no label — the one combination with no sensible rendering. The picker cannot
-- produce it (the icon toggle only exists once a platform is chosen) and
-- linkSchema rejects it, but PostgREST is reachable with the anon key and the
-- creator's own RLS policy lets them write their rows directly. This is the
-- rule rather than a convention three layers agree to follow.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'links_icon_needs_platform'
  ) then
    alter table public.links
      add constraint links_icon_needs_platform
      check (not show_as_icon or platform is not null);
  end if;
end $$;

-- ===========================================================================
-- Rollback (paste into the SQL editor to undo)
--
-- Constraints first: dropping a column that a check references fails with a
-- dependency error.
-- ---------------------------------------------------------------------------
--   alter table public.links drop constraint if exists links_icon_needs_platform;
--   alter table public.links drop constraint if exists links_platform_slug;
--   alter table public.links drop column if exists show_as_icon;
--   alter table public.links drop column if exists platform;
-- ===========================================================================
