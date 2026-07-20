"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  NetworkEthereum,
  NetworkPolygon,
  NetworkBinanceSmartChain,
  NetworkArbitrumOne,
  NetworkOptimism,
  NetworkBase,
  NetworkTron,
  TokenUSDT,
  TokenUSDC,
} from "@web3icons/react";

const ICONS = [
  { C: NetworkEthereum, key: "eth" },
  { C: TokenUSDC, key: "usdc" },
  { C: NetworkBase, key: "base" },
  { C: NetworkArbitrumOne, key: "arb" },
  { C: TokenUSDT, key: "usdt" },
  { C: NetworkPolygon, key: "poly" },
  { C: NetworkOptimism, key: "op" },
  { C: NetworkBinanceSmartChain, key: "bnb" },
  { C: NetworkTron, key: "tron" },
];

function Row() {
  return (
    <div className="flex shrink-0 items-center gap-12 pr-12">
      {ICONS.map(({ C, key }) => (
        <span
          key={key}
          className="grid h-9 w-9 place-items-center opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
          aria-hidden
        >
          <C variant="branded" size={36} />
        </span>
      ))}
    </div>
  );
}

export function NetworksMarquee() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto max-w-5xl rounded-full border border-white/10 bg-white/[0.02] py-4 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)] backdrop-blur-xl">
      <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]">
        <motion.div
          className="flex w-max"
          animate={reduce ? undefined : { x: ["0%", "-50%"] }}
          transition={{ duration: 32, ease: "linear", repeat: Infinity }}
        >
          <Row />
          <Row />
        </motion.div>
      </div>
    </div>
  );
}
