-- ===========================================================================
-- Linktree-Q :: a link can be paused
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
--
-- Until now the only way to take a link off a published page was to delete it,
-- which throws away the title and the URL to make a change the creator often
-- means to undo next week. `is_active` makes hiding reversible: a paused link
-- keeps its row and its place in the order, stays in the editor, and renders
-- nowhere.
--
-- Mirrors packages.is_active from 0001 deliberately — same column name, same
-- default, same meaning — so "paused" means one thing across the product.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The column.
--
-- default true, not null: every link that exists today was visible, and must
-- stay visible. A nullable column would make "not yet decided" a third state
-- that every reader would have to collapse back to true anyway.
-- ---------------------------------------------------------------------------
alter table public.links
  add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Public reads skip paused links.
--
-- Motivated: the app filters `is_active` in loadCreatorPage, but the anon key
-- is public and PostgREST is reachable from a browser console — without this,
-- a paused link is hidden from the page and still served to anyone who asks
-- for it by table name. "Hidden" has to mean hidden at the trust boundary.
--
-- Restated in full rather than patched: policies have no partial form. This is
-- 0001's links_public_read plus the is_active predicate.
--
-- The owner path is unaffected: links_owner_all is a SEPARATE policy, and
-- permissive policies are OR'd, so the creator keeps reading their own paused
-- links in the editor.
-- ---------------------------------------------------------------------------
drop policy if exists "links_public_read" on public.links;
create policy "links_public_read" on public.links
  for select using (
    is_active
    and exists (select 1 from public.profiles p
                where p.id = links.profile_id and p.is_published)
  );

-- ===========================================================================
-- Rollback (paste into the SQL editor to undo)
--
-- Order matters: the policy references the column, so the policy has to go
-- back to its 0001 form BEFORE the column is dropped, or the drop fails with
-- a dependency error.
-- ---------------------------------------------------------------------------
--   drop policy if exists "links_public_read" on public.links;
--   create policy "links_public_read" on public.links
--     for select using (
--       exists (select 1 from public.profiles p
--               where p.id = links.profile_id and p.is_published)
--     );
--   alter table public.links drop column if exists is_active;
-- ===========================================================================
