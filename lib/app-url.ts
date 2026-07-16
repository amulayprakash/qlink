import { headers } from "next/headers";

const ENV_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

/**
 * The origin this request was actually served from.
 *
 * NEXT_PUBLIC_APP_URL is inlined at build time, so a deploy that forgot to set
 * it hands creators a localhost link they cannot share. The request headers
 * always know the real host, so ask them first and keep the env var as the
 * fallback for contexts with no request (cron, scripts).
 */
export async function getAppUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host) {
    const proto =
      h.get("x-forwarded-proto") ||
      (host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https");
    return `${proto}://${host}`;
  }
  return ENV_URL || "http://localhost:3000";
}
