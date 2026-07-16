"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Eye,
  LinkSimple,
  Package,
  Receipt,
  Wallet,
} from "@phosphor-icons/react";

/**
 * The dashboard's nav.
 *
 * Every entry points at a route that EXISTS. The reference this is modelled on
 * has Shop, Insights, Audience and a Tools section; we do not have those, and a
 * nav item that opens nothing is worse than a shorter nav.
 *
 * Grouped rather than flat because the two groups answer different questions —
 * "what does my page look like" and "what have I earned" — and the group label
 * is what makes Wallets findable at all: nobody goes looking for a receiving
 * address under a link editor.
 */
const GROUPS: {
  label: string;
  items: { href: string; label: string; icon: typeof LinkSimple }[];
}[] = [
  {
    label: "My page",
    items: [
      { href: "/dashboard", label: "Links", icon: LinkSimple },
      { href: "/dashboard/packages", label: "Packages", icon: Package },
      { href: "/dashboard/preview", label: "Preview", icon: Eye },
    ],
  },
  {
    label: "Earn",
    items: [
      { href: "/dashboard/orders", label: "Orders", icon: Receipt },
      { href: "/dashboard/wallets", label: "Wallets", icon: Wallet },
    ],
  },
];

/** Exact match only. Motivated: every route here is a sibling under /dashboard,
 *  so a `startsWith` test would light up "Links" (/dashboard) on every single
 *  page in the section. */
function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href;
}

export function SidebarNav() {
  const isActive = useIsActive();

  return (
    <nav className="space-y-6">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-xs font-medium tracking-wide text-muted uppercase">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "text-muted hover:bg-white/[0.06] hover:text-foreground",
                    ].join(" ")}
                  >
                    <Icon size={17} weight={active ? "fill" : "regular"} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * The same destinations as a horizontal strip, for screens with no room for a
 * sidebar. Motivated: the sidebar is `lg:` only, so without this a phone can
 * reach no dashboard page except by typing the URL.
 */
export function MobileNav() {
  const isActive = useIsActive();
  const items = GROUPS.flatMap((g) => g.items);

  return (
    <nav className="flex gap-1 overflow-x-auto px-5 pb-2 lg:hidden">
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-brand-50 text-brand-700"
                : "text-muted hover:bg-white/[0.06] hover:text-foreground",
            ].join(" ")}
          >
            <Icon size={16} weight={active ? "fill" : "regular"} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
