/**
 * HTTP Basic Auth for the app-wide admin area (/v1/admin).
 *
 * Basic Auth is a deliberate choice over a Supabase login: the admin is not a
 * creator and has no profile row, so there is nothing to sign in AS. The
 * browser's native credential prompt gates the whole /v1/admin subtree from the
 * edge (see proxy.ts), with no login page, session table or cookie to maintain.
 *
 * Credentials default to the values the product owner set and can be overridden
 * per-environment with ADMIN_USER / ADMIN_PASSWORD. These are read server-side
 * only — never expose them behind a NEXT_PUBLIC_ name.
 *
 * This module is intentionally pure and free of Node-only APIs so it runs both
 * in the edge middleware AND in the Node server component that re-checks it
 * (defense in depth). `atob` exists in both runtimes.
 */

const REALM = "Qlink Admin";

function expectedCredentials() {
  return {
    user: process.env.ADMIN_USER ?? "john",
    pass: process.env.ADMIN_PASSWORD ?? "Qspl@1234",
  };
}

/**
 * Length-checked, branch-even comparison. Not a hardened constant-time compare
 * (impossible to guarantee in JS), but it avoids the trivial early-return
 * timing leak of `a === b` and evaluates the whole string regardless.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** True when an `Authorization: Basic …` header carries the admin credentials. */
export function isAdminAuthorized(authorization: string | null | undefined): boolean {
  if (!authorization || !authorization.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = atob(authorization.slice(6).trim());
  } catch {
    return false;
  }

  const sep = decoded.indexOf(":");
  if (sep < 0) return false;

  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  const want = expectedCredentials();

  // Evaluate both halves so a wrong username costs the same as a wrong
  // password — no early exit on the first mismatch.
  const okUser = safeEqual(user, want.user);
  const okPass = safeEqual(pass, want.pass);
  return okUser && okPass;
}

/** The 401 that makes the browser show its username/password prompt. */
export function adminChallenge(): Response {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
