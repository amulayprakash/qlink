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
    <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <motion.div
        className="flex w-max"
        animate={reduce ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration: 32, ease: "linear", repeat: Infinity }}
      >
        <Row />
        <Row />
      </motion.div>
    </div>
  );
}
