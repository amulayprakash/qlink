import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk, Newsreader } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookies = (await headers()).get("cookie");

  // Motivated: no inline colorScheme on <html>. An inline style outranks every
  // stylesheet rule, which would defeat a themed creator page switching the
  // canvas to light. globals.css already sets html { color-scheme: dark }.
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers cookies={cookies}>{children}</Providers>
      </body>
    </html>
  );
}
