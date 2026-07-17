"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type PromoValue = {
  /** Raw, as typed. The input only uppercases it visually, and resolvePromo
   *  compares case-insensitively, so there is nothing to normalise here. */
  promo: string;
  setPromo: (v: string) => void;
};

const PromoContext = createContext<PromoValue | null>(null);

/**
 * Carries the promo code from the section above the packages into the checkout
 * modal each package's button opens.
 *
 * Context rather than props, and not as a style preference: the two ends sit in
 * different subtrees — the input is a sibling of PackagesSection, the modal is a
 * leaf under a BuyButton inside it — and the obvious fix, hoisting the state
 * into a client component that renders both, is ILLEGAL here. CreatorPageView
 * hands PackagesSection a `buySlot` FUNCTION, and functions cannot cross a
 * server/client boundary; a client wrapper would force it to. That is the same
 * constraint CreatorPageView's own file header describes.
 *
 * Wrapped around the sections list rather than the whole page, per the Next.js
 * guidance to render providers as deep as possible so the static parts of the
 * server tree stay optimisable.
 */
export function PromoProvider({ children }: { children: ReactNode }) {
  const [promo, setPromo] = useState("");
  // Memoised: without it every keystroke hands a fresh object to every
  // consumer, and one of the consumers is the checkout modal mid-transaction.
  const value = useMemo(() => ({ promo, setPromo }), [promo]);
  return <PromoContext.Provider value={value}>{children}</PromoContext.Provider>;
}

/**
 * Null when nothing provides above, which is a supported state rather than a
 * bug: CheckoutModal is the one consumer reachable from outside a creator page,
 * and it falls back to its own local input.
 */
export function usePromo() {
  return useContext(PromoContext);
}
