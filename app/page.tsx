import Image from "next/image";
import Link from "next/link";

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
    t: "Add your packages",
    d: "Define your service tiers and what each one includes.",
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
        <section id="how" className="container-app py-24 relative">
          {/* Subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-brand-500/10 blur-[120px] pointer-events-none rounded-full" />
          
          <Reveal>
            <div className="text-center mb-16">
              <h2 className="font-display mx-auto max-w-xl text-3xl font-bold tracking-tight sm:text-5xl">
                From zero to paid in <span className="text-brand-500">three steps.</span>
              </h2>
              <p className="mt-4 text-muted max-w-lg mx-auto">Getting started is completely free and takes less than 2 minutes.</p>
            </div>
          </Reveal>
          
          <div className="grid gap-6 md:grid-cols-3 relative z-10">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.1}>
                <div className="relative group h-full rounded-2xl border border-white/5 bg-white/[0.01] p-8 transition-all hover:bg-white/[0.03] hover:border-white/10 hover:-translate-y-1">
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                      <span className="font-display flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-xl font-bold text-brand-500 border border-brand-500/20 shadow-[0_0_15px_rgba(197,242,78,0.15)] transition-all group-hover:scale-110 group-hover:bg-brand-600 group-hover:text-background group-hover:shadow-[0_0_25px_rgba(197,242,78,0.4)]">
                        {s.n}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-semibold text-white drop-shadow-sm">
                        {s.t}
                      </h3>
                      <p className="mt-3 text-sm text-muted/90 leading-relaxed">
                        {s.d}
                      </p>
                    </div>
                  </div>
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
            {/* Feature 1: The Side Hustle Angle */}
            <Reveal className="md:col-span-4 md:row-span-2">
              <div className="relative flex h-full flex-col sm:flex-row justify-between overflow-hidden rounded-2xl border border-border bg-card group">
                <div className="flex-1 p-7 relative z-10 flex flex-col justify-center">
                  <span className="badge w-fit border border-white/10 bg-white/[0.03] text-muted">
                    Creator Economy
                  </span>
                  <div className="mt-8">
                    <h3 className="font-display text-2xl font-semibold sm:text-3xl drop-shadow-md">
                      Your New Favorite Side Hustle.
                    </h3>
                    <p className="mt-3 max-w-md text-sm text-muted">
                      Whether you're a designer, developer, or content creator, your skills have value. We provide the tools you need to monetize your craft effortlessly. Build your personal brand and start generating a new stream of crypto income today.
                    </p>
                  </div>
                </div>
                {/* Image side */}
                <div className="relative hidden sm:block w-[45%] shrink-0 h-[280px] sm:h-auto">
                  <div className="absolute inset-0 bg-gradient-to-r from-card via-card/50 to-transparent z-10" />
                  <Image 
                    src="/images/side_hustle.png" 
                    alt="Side Hustle" 
                    fill 
                    className="object-cover object-left opacity-80 transition-transform duration-700 group-hover:scale-105" 
                  />
                </div>
              </div>
            </Reveal>

            {/* Feature 2: Direct Wallet Payments */}
            <Reveal className="md:col-span-2 md:row-span-2">
              <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card group">
                <div className="p-7 relative z-10">
                  <span className="badge w-fit border border-white/10 bg-white/[0.03] text-muted">
                    0% Middleman Fees
                  </span>
                  <h3 className="font-display mt-6 text-xl font-semibold sm:text-2xl drop-shadow-md">
                    Your Money. Your Wallet.
                  </h3>
                  <p className="mt-3 text-sm text-muted">
                    No middlemen. Funds go directly into your crypto wallet instantly with total ownership.
                  </p>
                </div>
                <div className="relative flex-1 min-h-[160px] w-full mt-auto">
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent z-10" />
                  <Image 
                    src="/images/direct_wallet.png" 
                    alt="Direct Wallet Payments" 
                    fill 
                    className="object-cover object-top opacity-80 transition-transform duration-700 group-hover:scale-105" 
                  />
                </div>
              </div>
            </Reveal>

            {/* Feature 3: Exposure to a Large Crypto Audience */}
            <Reveal className="md:col-span-6">
              <div className="relative flex h-full flex-col md:flex-row items-center justify-between gap-8 overflow-hidden rounded-2xl border border-border bg-card p-7 group">
                <div className="absolute inset-0 z-0">
                  <Image 
                    src="/images/community.png" 
                    alt="Crypto Community" 
                    fill 
                    className="object-cover object-center opacity-20 transition-transform duration-700 group-hover:scale-105 group-hover:opacity-30" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-card via-card/80 to-card/40" />
                </div>
                
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.12] blur-[100px]"
                  style={{ background: "radial-gradient(circle,#a855f7,transparent 70%)" }}
                />
                
                <div className="max-w-xl relative z-10">
                  <span className="badge w-fit border border-white/10 bg-white/[0.03] text-muted mb-4 block">
                    Community Growth
                  </span>
                  <h3 className="font-display text-2xl font-semibold sm:text-3xl drop-shadow-md">
                    Tap Into a Thriving Web3 Community.
                  </h3>
                  <p className="mt-3 text-sm text-muted drop-shadow">
                    Don't build in a vacuum. By joining our platform, you instantly put your work in front of thousands of crypto-native users actively looking to support creators. Grow your audience on day one.
                  </p>
                </div>
                
                {/* Animated graphic for the community */}
                <div className="relative z-10 flex-1 flex items-center justify-center min-h-[140px] w-full mt-6 md:mt-0">
                  <div className="relative w-full max-w-[280px] h-[80px]">
                    {/* Connecting Lines */}
                    <div className="absolute top-1/2 left-[10%] w-[35%] h-[2px] bg-gradient-to-r from-transparent via-brand-500/30 to-brand-500/80 -translate-y-1/2" />
                    <div className="absolute top-1/2 right-[10%] w-[35%] h-[2px] bg-gradient-to-l from-transparent via-brand-500/30 to-brand-500/80 -translate-y-1/2" />
                    
                    {/* Pulse Rings */}
                    <div className="absolute top-1/2 left-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500/20 animate-ping" style={{ animationDuration: '3s' }} />
                    <div className="absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-500/40 animate-ping delay-700" style={{ animationDuration: '3s' }} />

                    {/* Surrounding Nodes */}
                    <div className="absolute top-1/2 left-0 -translate-y-1/2 h-12 w-12 rounded-full border border-white/10 bg-gradient-to-br from-card to-card/50 flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:-translate-x-3">
                       <div className="h-6 w-6 rounded-full bg-blue-500/20" />
                    </div>
                    <div className="absolute top-1/2 right-0 -translate-y-1/2 h-12 w-12 rounded-full border border-white/10 bg-gradient-to-bl from-card to-card/50 flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:translate-x-3">
                       <div className="h-6 w-6 rounded-full bg-purple-500/20" />
                    </div>
                    
                    {/* Center Node */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 transition-transform duration-500 group-hover:scale-110">
                      <div className="h-16 w-16 rounded-full bg-brand-500 shadow-[0_0_40px_rgba(197,242,78,0.4)] flex items-center justify-center">
                         <div className="h-6 w-6 rounded-full bg-background" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="container-app pb-24">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.02] px-6 py-20 text-center sm:px-16 shadow-[inset_0_0_40px_rgba(255,255,255,0.02)] backdrop-blur-xl group">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-24 mx-auto h-64 w-[70%] rounded-full opacity-30 blur-[100px] transition-opacity duration-700 group-hover:opacity-50"
                style={{ background: "radial-gradient(circle,#c5f24e,transparent 70%)" }}
              />
              <div className="relative z-10">
                <h2 className="font-display mx-auto max-w-2xl text-4xl font-bold tracking-tight sm:text-6xl drop-shadow-lg">
                  Your next sale is <span className="text-brand-500">one link away.</span>
                </h2>
                <p className="mx-auto mt-6 max-w-xl text-lg text-muted/90">
                  Set up your page, list your packages, and start accepting crypto
                  today. Join thousands of creators earning without middlemen.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-6">
                  <Link href="/login" className="btn-primary btn-lg group/btn relative overflow-hidden">
                    <span className="relative z-10">Create your page for free</span>
                    <div className="absolute inset-0 bg-white/20 translate-y-full transition-transform duration-300 group-hover/btn:translate-y-0" />
                  </Link>
                  <p className="text-xs text-muted font-medium uppercase tracking-wider">No credit card required</p>
                </div>
              </div>
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
