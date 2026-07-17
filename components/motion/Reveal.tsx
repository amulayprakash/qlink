"use client";

import { motion } from "motion/react";
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
  if (disabled) return <div className={className}>{children}</div>;
  return (
    <motion.div
      /**
       * `initial` is UNCONDITIONAL, and that is the whole point.
       *
       * motion serializes `initial` into an inline opacity:0 during SSR, which
       * makes it part of the HTML React then hydrates against. So anything this
       * prop depends on has to produce the same answer on the server and on the
       * client's first render — and useReducedMotion() does not. There is no
       * window on the server, so it answers `false` there and `true` in a
       * browser that asked for reduced motion: the server sent opacity:0 and the
       * client expected no style at all. React reported the mismatch and, in its
       * words, would not patch it up.
       *
       * Reduced motion is honoured in globals.css instead, by the same
       * [data-reveal] hook the <noscript> block in CreatorPageView uses. CSS is
       * not part of the hydration contract, so it can branch on a media query
       * freely — and !important author rules outrank both inline styles and the
       * animation origin, so they win over whatever motion does next.
       *
       * The rule: if a prop reaches the SSR'd markup, it may not depend on
       * anything the server cannot know.
       */
      data-reveal=""
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
