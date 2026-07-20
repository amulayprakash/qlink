import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE } from "@/lib/referrals";

/**
 * A referral click: remember the code, then get out of the way.
 *
 * Deliberately does NOT resolve the code against the database. Doing so would
 * make this endpoint an oracle for which codes exist — an anonymous caller
 * could enumerate valid referrers by watching which codes redirect where — and
 * it would buy nothing, because `claim_referral()` (0012) has to re-check the
 * code at sign-up time anyway. A bad code simply attributes to nobody, which is
 * the same outcome as no code at all.
 *
 * The redirect goes to `/login` rather than to the landing page because the
 * link's entire purpose is a sign-up, and a cookie set on a page the visitor
 * then bounces off is a cookie wasted.
 */
export async function GET(_request: Request, ctx: RouteContext<"/r/[code]">) {
  const { code } = await ctx.params;

  // ⚠️ NOT `request.nextUrl.clone()`. Behind Netlify that carries the INTERNAL
  // deploy origin (main--loyalfan.netlify.app), not the domain the visitor
  // typed — the same trap /auth/callback documents.
  //
  // Here it is worse than an ugly URL. The cookie below is set on the host that
  // served THIS response; redirecting to a different host means /auth/callback
  // runs somewhere the cookie was never scoped to, so it is never sent back and
  // the attribution is lost in silence. Every referral would look like an
  // organic signup and nobody would ever see an error.
  const origin = await getAppUrl();
  const response = NextResponse.redirect(`${origin}/login`);

  // Shape-checked here so a junk path segment never reaches the cookie jar.
  // Matches the `referral_codes.code` check constraint in 0012.
  if (/^[a-z0-9]{6,12}$/.test(code)) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      // Not httpOnly: nothing here is a credential, and leaving it readable
      // lets client code surface "you were referred by…" later without a round
      // trip. It is an attribution hint, and the server re-validates it.
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}
