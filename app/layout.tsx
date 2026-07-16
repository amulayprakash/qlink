import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// preload: false, for the same reason as the serif below: --font-mono is a
// design token that no component currently renders with, so preloading it spent
// a font fetch on every page for a face nothing draws. The @font-face still
// ships, so the day something uses font-mono it just works — one fetch, then.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Creator pages can pick a serif. Motivated: preload is off because only the
// creator pages that opted into it use this face, so preloading on every route
// would spend bytes for nothing. The @font-face still ships, and the browser
// only fetches the file when a page actually sets --page-font to it.
const newsreader = Newsreader({
  variable: "--font-page-serif",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Qlink: one link to sell your packages and get paid in crypto",
  description:
    "Create your page, define service packages, and accept stablecoin payments (USDT/USDC) across every EVM chain and Tron.",
};

/**
 * Deliberately not async, and deliberately reads nothing per-request.
 *
 * This used to call `headers()` to hand the wallet providers the cookie for
 * wagmi's SSR hydration. `headers()` is a dynamic API, and a dynamic API in the
 * ROOT layout opts every route in the app out of static rendering — the
 * marketing page included, which is pure markup and should be served from the
 * CDN. The providers now live behind BuyButton's lazy boundary and read their
 * own state from document.cookie, so nothing in the shell needs the request.
 *
 * Keep it that way: adding headers()/cookies() here makes all 22 routes dynamic
 * again, and the build's "ƒ (Dynamic)" markers are how you'd notice.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Motivated: no inline colorScheme on <html>. An inline style outranks every
  // stylesheet rule, which would defeat a themed creator page switching the
  // canvas to light. globals.css already sets html { color-scheme: dark }.
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
