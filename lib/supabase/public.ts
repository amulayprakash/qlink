import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for public, viewer-independent reads. NO cookies.
 *
 * The absence of cookies IS the feature, not an oversight.
 *
 * lib/supabase/server.ts reads cookies() so RLS can see who is asking. That is
 * correct everywhere the answer depends on the asker — the dashboard, the
 * editor, every action. It is exactly wrong on the public creator page, where
 * the answer is the same for everyone: cookies() is a Request-time API, and
 * Next will not cache anything reachable after one. Binding the page to a
 * session it never consults is what kept /[username] dynamic (ƒ), so every
 * visitor paid four Supabase round-trips to re-derive a page that had not
 * changed since the creator last touched it.
 *
 * Safe because the page asks nothing that depends on the viewer. 0001's
 * profiles_public_read / links_public_read / packages_public_read (and 0002's
 * sections_public_read) already grant anon select on published profiles, which
 * is the whole of what the public route reads. An owner viewing their own page
 * signed in saw the same bytes as a stranger — loadCreatorPage filters
 * is_active itself rather than leaning on RLS, precisely because the owner's
 * policy returns paused rows. So dropping to anon removes a privilege the page
 * was not spending.
 *
 * Do NOT use this anywhere a write, an auth check, or an owner-only read is
 * involved: with no session, RLS sees `anon` and those simply return nothing.
 *
 * Not module-scope. A client built at import time would bake in whatever
 * process.env held when the module was first evaluated, and be shared across
 * concurrent renders; building per call costs nothing (no connection, no
 * handshake — it is a fetch wrapper) and keeps that from being a question.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // There is no browser here to persist to and no session to refresh.
        // Left on, supabase-js reaches for storage and starts a refresh timer
        // in a process that will never have a user to refresh.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
