"use client";

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { TokenUSDC, NetworkBase } from "@web3icons/react";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden">
      {/* focal wash behind the product — soft, not neon */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-10%] h-[520px] w-[520px] rounded-full opacity-30 blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, rgba(197,242,78,0.5), transparent 70%)",
        }}
      />
      <div className="container-app grid items-center gap-14 pt-16 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24">
        {/* Left */}
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item}>
            <span className="badge border border-white/10 bg-white/[0.03] text-muted">
              Non-custodial · settled on-chain
            </span>
          </motion.div>

          <motion.h1
            variants={item}
            className="font-display mt-5 text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
          >
            Sell your work.
            <br />
            Get paid in{" "}
            <span className="text-brand-600">crypto.</span>
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-6 max-w-md text-lg text-muted"
          >
            Build your page, list your packages, and accept USDT or USDC across
            every major chain and Tron.
          </motion.p>

          <motion.div variants={item} className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn-primary btn-lg">
              Create your page
            </Link>
            <a href="#how" className="btn-outline btn-lg">
              How it works
            </a>
          </motion.div>
        </motion.div>

        {/* Right — live product preview (real UI, not a mockup) */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto w-full max-w-sm"
        >
          <motion.div
            animate={reduce ? undefined : { y: [0, -10, 0] }}
            transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
          >
            <div className="glass p-5">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-brand-500 to-brand-700" />
                <div>
                  <p className="font-display font-semibold leading-tight">
                    Ava Reyes
                  </p>
                  <p className="text-xs text-muted">@avareyes</p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-border bg-white/[0.02] p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-medium">Brand identity sprint</p>
                  <span className="font-display text-lg font-bold text-brand-600">
                    $1,200
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Logo, type system, and a mini guideline in two weeks.
                </p>
                <button className="btn-primary mt-4 w-full" tabIndex={-1}>
                  Pay with crypto
                </button>
              </div>

              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
                <TokenUSDC variant="branded" size={16} />
                USDC
                <span className="text-white/20">·</span>
                <NetworkBase variant="branded" size={16} />
                Base
              </div>
            </div>

            {/* confirmation chip */}
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute -right-3 -bottom-3 flex items-center gap-2 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-background shadow-lg"
            >
              <span className="grid h-4 w-4 place-items-center rounded-full bg-background/20">
                ✓
              </span>
              Payment confirmed
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
