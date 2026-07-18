import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { adminChallenge, isAdminAuthorized } from "@/lib/admin-auth";

// Next.js 16 renamed the "middleware" convention to "proxy".
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // App-wide admin area: HTTP Basic Auth, enforced at the edge before anything
  // else. The admin is not a Supabase user, so this path skips updateSession
  // entirely — there is no session to refresh.
  if (pathname.startsWith("/v1/admin")) {
    if (!isAdminAuthorized(request.headers.get("authorization"))) {
      return adminChallenge();
    }
    return NextResponse.next({ request });
  }

  // Anonymous analytics beacons carry no session, so skip the getUser()
  // round-trip updateSession makes on every other request.
  if (pathname.startsWith("/api/events")) {
    return NextResponse.next({ request });
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files so the
     * session cookie is refreshed everywhere it matters.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
