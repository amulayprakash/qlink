"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { TokenUSDC, NetworkBase, NetworkEthereum, NetworkPolygon, TokenUSDT } from "@web3icons/react";

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
      {/* focal wash behind the product — enhanced for a better glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-10%] right-[-5%] h-[600px] w-[600px] rounded-full opacity-40 blur-[130px]"
        style={{
          background:
            "radial-gradient(circle, rgba(197,242,78,0.6), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[20%] left-[-10%] h-[400px] w-[400px] rounded-full opacity-20 blur-[100px]"
        style={{
          background:
            "radial-gradient(circle, rgba(168,85,247,0.5), transparent 70%)",
        }}
      />
      
      {/* Floating Animated Icons in the background — now encased in premium glass orbs */}

      <div className="container-app grid items-center gap-14 pt-16 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24 relative z-10">
        {/* Left */}
        <motion.div variants={container} initial="hidden" animate="show" className="relative z-20">
          <motion.div variants={item}>
            <span className="badge flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 font-medium text-white shadow-[0_0_20px_rgba(255,255,255,0.05)] backdrop-blur-md">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(197,242,78,0.8)]"></span>
              </span>
              Direct Wallet Payments · Zero Intermediaries
            </span>
          </motion.div>

          <motion.h1
            variants={item}
            className="font-display mt-7 text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl drop-shadow-xl"
          >
            Turn Your Passion into a{" "}
            <span className="bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(197,242,78,0.3)]">
              Web3 Side Hustle.
            </span>
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-6 max-w-lg text-lg text-muted/90 leading-relaxed drop-shadow-sm"
          >
            The easiest way to monetize your content. Get paid directly to your wallet with zero intermediaries, and tap into a massive, built-in crypto audience instantly.
          </motion.p>

          <motion.div variants={item} className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/login" className="btn-primary btn-lg group relative overflow-hidden shadow-[0_0_30px_rgba(197,242,78,0.25)] hover:shadow-[0_0_40px_rgba(197,242,78,0.4)] transition-all">
              <span className="relative z-10 flex items-center gap-2">
                Start Earning Today
                <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
              </span>
              <div className="absolute inset-0 translate-y-full bg-white/20 transition-transform duration-300 group-hover:translate-y-0" />
            </Link>
            <a href="#how" className="btn-outline btn-lg hover:bg-white/[0.05] transition-colors">
              See How it Works
            </a>
          </motion.div>
        </motion.div>

        {/* Right — live product preview (hyper-realistic glass card) */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto w-full max-w-md z-20"
        >
          <motion.div
            animate={reduce ? undefined : { y: [0, -12, 0] }}
            transition={{ duration: 7, ease: "easeInOut", repeat: Infinity }}
          >
            {/* Main Premium Card */}
            <div className="relative overflow-hidden rounded-[2.5rem] bg-[#0a0a0a]/70 p-7 backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_25px_50px_-12px_rgba(0,0,0,0.8),0_0_60px_rgba(197,242,78,0.15)] group">
              {/* Subtle glass reflection overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50 pointer-events-none" />
              
              <div className="flex items-center gap-4 relative z-10">
                <div className="relative h-14 w-14 overflow-hidden rounded-full ring-2 ring-white/10 shadow-[0_0_20px_rgba(197,242,78,0.2)]">
                  <Image src="/images/ava_avatar.png" alt="Ava Reyes" fill className="object-cover" />
                </div>
                <div>
                  <p className="font-display text-lg font-semibold tracking-tight text-white drop-shadow-md">
                    Ava Reyes
                  </p>
                  <p className="text-sm font-medium text-brand-400">@avareyes</p>
                </div>
              </div>

              <div className="mt-7 rounded-[1.5rem] border border-white/5 bg-gradient-to-b from-white/[0.06] to-transparent p-5 relative z-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-colors duration-500 group-hover:bg-white/[0.08]">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-medium text-white/90">Exclusive Web3 Mentorship</p>
                  <span className="font-display text-2xl font-bold text-brand-500 drop-shadow-[0_0_10px_rgba(197,242,78,0.3)]">
                    $150
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted/80 leading-relaxed">
                  1-hour strategy session to grow your decentralized brand and optimize your content.
                </p>
                <button className="mt-5 w-full rounded-xl bg-brand-500 hover:bg-brand-400 text-black font-semibold py-3.5 transition-all shadow-[0_0_20px_rgba(197,242,78,0.3)] hover:shadow-[0_0_30px_rgba(197,242,78,0.5)] hover:-translate-y-0.5 active:translate-y-0">
                  Pay with crypto
                </button>
              </div>

              <div className="mt-5 flex items-center justify-center gap-3 text-xs font-medium text-muted relative z-10">
                <span className="flex items-center gap-1.5 bg-white/[0.03] px-2.5 py-1 rounded-md border border-white/5">
                  <TokenUSDC variant="branded" size={16} /> USDC
                </span>
                <span className="text-white/20">via</span>
                <span className="flex items-center gap-1.5 bg-white/[0.03] px-2.5 py-1 rounded-md border border-white/5">
                  <NetworkBase variant="branded" size={16} /> Base
                </span>
              </div>
            </div>

            {/* confirmation chip */}
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.8, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.6, type: "spring", bounce: 0.4 }}
              className="absolute -right-6 -bottom-5 flex items-center gap-2.5 rounded-full border border-white/20 bg-brand-500 px-4 py-2.5 text-sm font-bold text-black shadow-[0_10px_30px_rgba(197,242,78,0.5)] backdrop-blur-md z-30"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-black/20 text-[10px]">
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
