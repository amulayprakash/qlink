import Link from "next/link";
import {
  NetworkEthereum,
  NetworkPolygon,
  NetworkArbitrumOne,
  NetworkOptimism,
  NetworkBase,
  NetworkTron,
  TokenUSDT,
  TokenUSDC,
} from "@web3icons/react";
import { Logo } from "@/components/Logo";
import { Hero } from "@/components/landing/Hero";
import { NetworksMarquee } from "@/components/landing/NetworksMarquee";
import { Reveal } from "@/components/motion/Reveal";

const STEPS = [
  {
    n: "1",
    t: "Claim your @handle",
    d: "Sign in with Google and pick a username. That becomes your public link.",
  },
  {
    n: "2",
    t: "Add packages & wallet",
    d: "Define your service tiers and drop in your EVM and Tron receiving addresses.",
  },
  {
    n: "3",
    t: "Share and get paid",
    d: "Send your link. Customers pay in stablecoins; we confirm it on-chain.",
  },
];

export default function Home() {
  return (
    <div className="grain flex min-h-dvh flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
        <div className="container-app flex h-16 items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost">
              Sign in
            </Link>
            <Link href="/login" className="btn-primary">
              Create your page
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Hero />

        {/* Networks strip */}
        <section className="container-app pb-8">
          <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted">
            Settle on every major chain
          </p>
          <NetworksMarquee />
        </section>

        {/* How it works — timeline */}
        <section id="how" className="container-app py-24">
          <Reveal>
            <h2 className="font-display max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
              From zero to paid in three steps.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.1}>
                <div className="relative">
                  <div className="flex items-center gap-4">
                    <span className="font-display grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-lg font-bold text-background">
                      {s.n}
                    </span>
                    <span className="hidden h-px flex-1 bg-gradient-to-r from-white/15 to-transparent md:block" />
                  </div>
                  <h3 className="font-display mt-5 text-xl font-semibold">
                    {s.t}
                  </h3>
                  <p className="mt-2 text-sm text-muted">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Feature bento */}
        <section className="container-app pb-24">
          <Reveal>
            <div className="mb-10 max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Built for creators who’d rather own their money.
              </h2>
            </div>
          </Reveal>

          <div className="grid auto-rows-[minmax(0,1fr)] grid-cols-1 gap-4 md:grid-cols-6">
            {/* Big statement */}
            <Reveal className="md:col-span-4 md:row-span-2">
              <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-7">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-16 -left-10 h-64 w-64 rounded-full opacity-[0.18] blur-[90px]"
                  style={{ background: "radial-gradient(circle,#c5f24e,transparent 70%)" }}
                />
                <span className="badge w-fit border border-white/10 bg-white/[0.03] text-muted">
                  Non-custodial
                </span>
                <div className="mt-8">
                  <h3 className="font-display text-2xl font-semibold sm:text-3xl">
                    Payments go straight to your wallet.
                  </h3>
                  <p className="mt-3 max-w-md text-sm text-muted">
                    No middleman account, no payout delays, no platform holding
                    your balance. The customer’s transfer lands directly at your
                    address, and we verify it on-chain before marking the order
                    paid.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Chains */}
            <Reveal className="md:col-span-2">
              <div className="flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-6">
                <h3 className="font-display font-semibold">Every EVM chain + Tron</h3>
                <div className="mt-5 flex flex-wrap gap-3">
                  {[NetworkEthereum, NetworkBase, NetworkArbitrumOne, NetworkOptimism, NetworkPolygon, NetworkTron].map(
                    (C, i) => (
                      <span key={i} className="grid h-8 w-8 place-items-center">
                        <C variant="branded" size={30} />
                      </span>
                    ),
                  )}
                </div>
              </div>
            </Reveal>

            {/* Tokens */}
            <Reveal className="md:col-span-2">
              <div className="flex h-full items-center justify-between rounded-2xl border border-border bg-card p-6">
                <div>
                  <h3 className="font-display font-semibold">Stablecoins only</h3>
                  <p className="mt-1 text-sm text-muted">USDT &amp; USDC</p>
                </div>
                <div className="flex -space-x-2">
                  <TokenUSDC variant="branded" size={40} />
                  <TokenUSDT variant="branded" size={40} />
                </div>
              </div>
            </Reveal>

            {/* Promo */}
            <Reveal className="md:col-span-3">
              <div className="flex h-full items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6">
                <div>
                  <h3 className="font-display font-semibold">Built-in promo codes</h3>
                  <p className="mt-1 text-sm text-muted">
                    Every creator gets a code worth 20% off for their customers.
                  </p>
                </div>
                <span className="font-display shrink-0 rounded-lg border border-dashed border-brand-600/50 bg-brand-50 px-3 py-2 text-sm font-bold tracking-widest text-brand-700">
                  AVA20
                </span>
              </div>
            </Reveal>

            {/* Verified */}
            <Reveal className="md:col-span-3">
              <div className="flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-6">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                  ✓
                </span>
                <div>
                  <h3 className="font-display font-semibold">Verified on-chain</h3>
                  <p className="mt-1 text-sm text-muted">
                    Each order is checked against the transaction before it counts
                    as paid.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="container-app pb-24">
          <Reveal>
            <div className="glass relative overflow-hidden px-6 py-16 text-center sm:px-16">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-24 mx-auto h-64 w-[70%] rounded-full opacity-25 blur-[110px]"
                style={{ background: "radial-gradient(circle,#c5f24e,transparent 70%)" }}
              />
              <h2 className="font-display mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
                Your next sale is one link away.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-muted">
                Set up your page, list your packages, and start accepting crypto
                today. It’s free to publish.
              </p>
              <Link href="/login" className="btn-primary btn-lg mt-8">
                Create your page
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="container-app flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted sm:flex-row">
          <Logo />
          <span>Non-custodial. You own your funds.</span>
        </div>
      </footer>
    </div>
  );
}
