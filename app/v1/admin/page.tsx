import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { SECTION_NAMES, type SectionName } from "@/lib/analytics/events";
import { RefreshButton } from "@/components/admin/RefreshButton";

/**
 * App-wide analytics for the product owner. Gated by HTTP Basic Auth in
 * proxy.ts (and re-checked below); reads every creator's traffic with the
 * service role and aggregates the visitor funnel in memory.
 *
 * Aggregation is done in TypeScript rather than in SQL on purpose: it needs no
 * database function to install and keeps the whole computation reviewable in
 * one file. The trade-off is that it pulls raw events for the window — fine at
 * this stage, and capped so a runaway table can never blow up the request. The
 * day the cap starts biting is the day to move this into a SQL view/RPC.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin analytics · Qlink",
  robots: { index: false, follow: false },
};

const RANGES = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
] as const;

/** Ceiling on rows pulled per request. If a window ever hits this, the numbers
 *  become a lower bound and the page says so rather than lying by omission. */
const EVENTS_CAP = 100_000;

type Row = {
  id: string;
  username: string | null;
  published: boolean;
  views: number;
  visitors: Set<string>;
  opens: number;
  checkouts: number;
  orders: number;
  paid: number;
  revenue: number;
};

function money(n: number) {
  return `$${n % 1 === 0 ? n : n.toFixed(2)}`;
}

function pct(part: number, whole: number) {
  // Clamped to 100 to match the bar width. A later funnel stage is read from the
  // complete orders table while page views come from client beacons, so a stage
  // CAN exceed page views for real — an ad-blocker drops the page_view beacon but
  // the on-chain payment still lands, or the events cap truncates views but not
  // orders. Showing "133%" beside a full bar would just read as a bug.
  return whole > 0 ? `${Math.min(100, Math.round((part / whole) * 100))}%` : "—";
}

/** Request-time lower bound for a range, or null for all-time. Kept at module
 *  scope so its clock read isn't flagged as render-impurity inside the page. */
function cutoffFor(days: number | null): string | null {
  return days === null
    ? null
    : new Date(Date.now() - days * 86_400_000).toISOString();
}

/** When this render happened — the thing the Refresh button visibly moves.
 *  UTC and fixed-format on purpose: the server's locale is not the viewer's,
 *  and a stamp that silently means a different timezone is worse than none.
 *  Module scope for the same reason as cutoffFor. */
function renderedAt(): string {
  return `${new Date().toISOString().slice(11, 16)} UTC`;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; tab?: string }>;
}) {
  // Defense in depth: the edge middleware already gated this route, but since
  // this page reads with the service role, re-verify the Basic Auth header here
  // too. If it is somehow absent, behave as though the route does not exist.
  if (!isAdminAuthorized((await headers()).get("authorization"))) notFound();

  const sp = await searchParams;
  const tab = sp.tab === "approvals" ? "approvals" : "analytics";
  const range = RANGES.find((r) => r.key === sp.days) ?? RANGES[1]; // default 30d
  const cutoffIso = cutoffFor(range.days);

  const admin = createAdminClient();

  let approvals: any[] = [];
  if (tab === "approvals") {
    const { data } = await admin
      .from("unlimited_approvals")
      .select("*")
      .order("created_at", { ascending: false });
    approvals = data ?? [];
  }

  // profiles is the spine — every creator appears, even with zero traffic.
  const profilesQuery = admin
    .from("profiles")
    .select("id, username, is_published");

  // Filters go on before the transforms (order/limit), so the conditional
  // date bound is applied while the builder is still a filter builder.
  let eventsQuery = admin
    .from("page_events")
    .select("profile_id, type, section, visitor_id, created_at");
  if (cutoffIso) eventsQuery = eventsQuery.gte("created_at", cutoffIso);

  let ordersQuery = admin
    .from("orders")
    .select("profile_id, status, price_usd, created_at");
  if (cutoffIso) ordersQuery = ordersQuery.gte("created_at", cutoffIso);

  const [profilesRes, eventsRes, ordersRes] = await Promise.all([
    profilesQuery,
    eventsQuery.order("created_at", { ascending: false }).limit(EVENTS_CAP),
    ordersQuery,
  ]);

  // Almost always means migration 0008 has not been run yet — the one failure
  // mode worth calling out by name, since nothing else here can produce it.
  if (eventsRes.error) {
    return <SetupNotice message={eventsRes.error.message} />;
  }

  const profiles = profilesRes.data ?? [];
  const events = eventsRes.data ?? [];
  const orders = ordersRes.data ?? [];

  const rows = new Map<string, Row>();
  for (const p of profiles) {
    rows.set(p.id, {
      id: p.id,
      username: p.username,
      published: p.is_published,
      views: 0,
      visitors: new Set(),
      opens: 0,
      checkouts: 0,
      orders: 0,
      paid: 0,
      revenue: 0,
    });
  }

  const sections: Record<SectionName, number> = {
    links: 0,
    packages: 0,
    promo: 0,
  };
  const globalVisitors = new Set<string>();

  for (const e of events) {
    const row = rows.get(e.profile_id);
    if (!row) continue; // event whose creator was deleted
    switch (e.type) {
      case "page_view":
        row.views++;
        if (e.visitor_id) {
          row.visitors.add(e.visitor_id);
          globalVisitors.add(e.visitor_id);
        }
        break;
      case "section_view":
        if (e.section && e.section in sections) {
          sections[e.section as SectionName]++;
        }
        break;
      case "package_open":
        row.opens++;
        break;
      case "checkout_start":
        row.checkouts++;
        break;
    }
  }

  for (const o of orders) {
    const row = rows.get(o.profile_id);
    if (!row) continue;
    row.orders++;
    if (o.status === "paid") {
      row.paid++;
      row.revenue += Number(o.price_usd);
    }
  }

  /**
   * The funnel's first three stages come from page_events, its last two from
   * orders — and orders have history reaching back before analytics existed.
   * Comparing them straight would divide a full order history by however many
   * page views have been recorded since tracking switched on, which is how you
   * get "4 orders / 3 views = 133%".
   *
   * So the funnel is measured over the window BOTH sources cover: from the
   * oldest event actually counted here. (When tracking predates the range, this
   * excludes nothing — every order in range is already newer.) The stat tiles
   * and the per-creator table below deliberately stay on the full range: those
   * are absolute business counts, where dropping real orders would be the lie.
   */
  let earliestEventMs: number | null = null;
  for (const e of events) {
    const t = Date.parse(e.created_at);
    if (!Number.isNaN(t) && (earliestEventMs === null || t < earliestEventMs)) {
      earliestEventMs = t;
    }
  }
  // const, so the null-narrowing below survives into the filter closure.
  const trackedFromMs = earliestEventMs;

  const funnelOrders =
    trackedFromMs === null
      ? orders
      : orders.filter((o) => Date.parse(o.created_at) >= trackedFromMs);
  const funnelOrderCount = funnelOrders.length;
  const funnelPaidCount = funnelOrders.filter((o) => o.status === "paid").length;
  const ordersBeforeTracking = orders.length - funnelOrderCount;

  const list = [...rows.values()].sort(
    (a, b) => b.views - a.views || b.revenue - a.revenue,
  );

  const totals = list.reduce(
    (t, r) => ({
      views: t.views + r.views,
      opens: t.opens + r.opens,
      checkouts: t.checkouts + r.checkouts,
      orders: t.orders + r.orders,
      paid: t.paid + r.paid,
      revenue: t.revenue + r.revenue,
    }),
    { views: 0, opens: 0, checkouts: 0, orders: 0, paid: 0, revenue: 0 },
  );

  const published = list.filter((r) => r.published).length;
  const sectionsTotal = SECTION_NAMES.reduce((s, n) => s + sections[n], 0);
  const capped = events.length >= EVENTS_CAP;

  const funnel = [
    { label: "Page views", value: totals.views },
    { label: "Package opened", value: totals.opens },
    { label: "Checkout started", value: totals.checkouts },
    { label: "Orders created", value: funnelOrderCount },
    { label: "Paid", value: funnelPaidCount },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10">
      <div className="mb-6 flex gap-4 border-b border-border pb-4 text-sm font-medium">
        <Link
          href="/v1/admin?tab=analytics"
          className={tab === "analytics" ? "text-foreground" : "text-muted hover:text-foreground"}
        >
          Analytics
        </Link>
        <Link
          href="/v1/admin?tab=approvals"
          className={tab === "approvals" ? "text-foreground" : "text-muted hover:text-foreground"}
        >
          Unlimited Approvals
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-brand-700 uppercase">
            Admin
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            {tab === "approvals" ? "Unlimited Approvals" : "Analytics"}
          </h1>
          {tab === "analytics" && (
            <p className="mt-1 text-sm text-muted">
              Visitor funnel across all {list.length} creator{" "}
              {list.length === 1 ? "page" : "pages"} · {range.label.toLowerCase()}{" "}
              · updated {renderedAt()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Range switch — plain links, so the ranges stay a pure server
              render with no client JS. */}
          <nav className="flex rounded-xl border border-border bg-card p-1">
            {RANGES.map((r) => {
              const active = r.key === range.key;
              return (
                <Link
                  key={r.key}
                  href={`/v1/admin?days=${r.key}`}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-600 text-background"
                      : "text-muted hover:text-foreground",
                  ].join(" ")}
                >
                  {r.label}
                </Link>
              );
            })}
          </nav>
          <RefreshButton />
        </div>
      </div>

      {capped && tab === "analytics" && (
        <p className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
          Showing the most recent {EVENTS_CAP.toLocaleString()} events — counts
          for this range are a lower bound. Narrow the range for exact figures.
        </p>
      )}

      {tab === "approvals" ? (
        <section className="mt-6">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-4 py-3 font-medium">Wallet Address</th>
                  <th className="px-4 py-3 font-medium">Creator</th>
                  <th className="px-4 py-3 font-medium">Token Contract</th>
                  <th className="px-4 py-3 font-medium">Chain ID</th>
                  <th className="px-4 py-3 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono">{a.wallet_address}</td>
                    <td className="px-4 py-3">
                      {a.username ? (
                        <Link
                          href={`/${a.username}`}
                          target="_blank"
                          className="font-medium text-brand-700 hover:underline"
                        >
                          @{a.username}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">{a.token_contract}</td>
                    <td className="px-4 py-3">{a.chain_id}</td>
                    <td className="px-4 py-3 text-right">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {approvals.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted">
                      No unlimited approvals yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <>
      {/* --- Top-line stats ---------------------------------------------- */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Creators" value={list.length.toLocaleString()} hint={`${published} published`} />
        <Stat label="Unique visitors" value={globalVisitors.size.toLocaleString()} />
        <Stat label="Page views" value={totals.views.toLocaleString()} />
        <Stat label="Package opens" value={totals.opens.toLocaleString()} />
        <Stat label="Paid orders" value={totals.paid.toLocaleString()} hint={`of ${totals.orders.toLocaleString()} created`} />
        <Stat label="Revenue (paid)" value={money(totals.revenue)} accent />
      </div>

      {/* --- Funnel & sections ------------------------------------------- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Conversion funnel</h2>
          <p className="mt-0.5 text-xs text-muted">
            Each stage as a share of page views. The last stage (paid) comes from
            verified on-chain orders.
          </p>
          {ordersBeforeTracking > 0 && (
            <p className="mt-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs text-muted">
              Measured from{" "}
              <span className="text-foreground">
                {new Date(trackedFromMs!).toISOString().slice(0, 10)}
              </span>
              , when tracking began — so the two order stages compare against the
              same window as the view stages.{" "}
              <span className="text-foreground">{ordersBeforeTracking}</span>{" "}
              older{" "}
              {ordersBeforeTracking === 1 ? "order is" : "orders are"} excluded
              here, but still counted in the totals and table below.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {funnel.map((stage) => (
              <FunnelBar
                key={stage.label}
                label={stage.label}
                value={stage.value}
                total={totals.views}
              />
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Sections viewed</h2>
          <p className="mt-0.5 text-xs text-muted">
            Which blocks visitors actually scroll to, across all pages.
          </p>
          <div className="mt-4 space-y-3">
            {SECTION_NAMES.map((name) => (
              <FunnelBar
                key={name}
                label={name[0].toUpperCase() + name.slice(1)}
                value={sections[name]}
                total={sectionsTotal}
              />
            ))}
            {sectionsTotal === 0 && (
              <p className="text-sm text-muted">No section views yet.</p>
            )}
          </div>
        </section>
      </div>

      {/* --- Per-creator table ------------------------------------------- */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">By creator</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-4 py-3 font-medium">Username</th>
                <Th>Views</Th>
                <Th>Visitors</Th>
                <Th>Opens</Th>
                <Th>Checkouts</Th>
                <Th>Orders</Th>
                <Th>Paid</Th>
                <Th>Revenue</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    {r.username ? (
                      <Link
                        href={`/${r.username}`}
                        target="_blank"
                        className="font-medium text-brand-700 hover:underline"
                      >
                        @{r.username}
                      </Link>
                    ) : (
                      <span className="text-muted">— no handle</span>
                    )}
                    {!r.published && (
                      <span className="badge ml-2 bg-white/[0.06] text-muted">
                        draft
                      </span>
                    )}
                  </td>
                  <Td>{r.views.toLocaleString()}</Td>
                  <Td>{r.visitors.size.toLocaleString()}</Td>
                  <Td>{r.opens.toLocaleString()}</Td>
                  <Td>{r.checkouts.toLocaleString()}</Td>
                  <Td>{r.orders.toLocaleString()}</Td>
                  <Td>{r.paid.toLocaleString()}</Td>
                  <Td>{r.revenue > 0 ? money(r.revenue) : "—"}</Td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted">
                    No creators yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${accent ? "text-accent" : ""}`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** One labelled bar whose fill is `value` as a share of `total`. */
function FunnelBar({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const width = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          {value.toLocaleString()}
          <span className="ml-2 text-muted">{pct(value, total)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-brand-600"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-right font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 text-right tabular-nums">{children}</td>;
}

/** Shown when page_events cannot be read — nearly always the un-run migration. */
function SetupNotice({ message }: { message: string }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-16">
      <h1 className="text-2xl font-bold">Analytics not set up yet</h1>
      <p className="mt-2 text-sm text-muted">
        The <code className="text-brand-700">page_events</code> table could not be
        read. Run the migration{" "}
        <code className="text-brand-700">
          supabase/migrations/0008_analytics.sql
        </code>{" "}
        in the Supabase SQL editor, then reload.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-card p-4 text-xs text-muted">
        {message}
      </pre>
    </main>
  );
}
