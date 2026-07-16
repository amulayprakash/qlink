"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Scroll-into-view reveal. Motivated: sequences content as the user arrives. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 22,
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  /** Render children as-is, with no observer and no initial opacity.
   *  Motivated: inside the editor's preview pane the scroll container is a div,
   *  not the window, so whileInView would either never fire or fire all at once.
   *  Passing motion a `root` ref is not an option, because a ref cannot cross
   *  the server boundary for the real page. Opting out entirely is honest. */
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  if (disabled) return <div className={className}>{children}</div>;
  return (
    <motion.div
      // Motivated: motion serializes `initial` into an inline opacity:0 during
      // SSR, so with scripting off this subtree never becomes visible. The tag
      // gives a <noscript> stylesheet something to override.
      data-reveal=""
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
