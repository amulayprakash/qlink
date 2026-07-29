import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { SECTION_NAMES, type SectionName } from "@/lib/analytics/events";
import { RefreshButton } from "@/components/admin/RefreshButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin analytics · Qlink",
  robots: { index: false, follow: false },
};

const RANGES = [
  { key: "today", label: "Today", days: 1 },
  { key: "all", label: "Full time", days: null },
] as const;

const EVENTS_CAP = 100_000;

type Row = {
  id: string;
  username: string | null;
  published: boolean;
  views: number;
  visitors: Set<string>;
  opens: number;
  checkouts: number;
  walletClicks: number;
  orders: number;
  paid: number;
  revenue: number;
};

const EVENT_LABELS: Record<string, string> = {
  page_view: "Page view",
  section_view: "Section view",
  package_open: "Package open",
  checkout_start: "Checkout start",
  wallet_button_click: "Clicked Connect Wallet",
  wallet_connect_click: "Selected a wallet",
  wallet_connected: "Wallet connected",
};

function eventLabel(type: string) {
  return EVENT_LABELS[type] || type;
}

function timeAgo(dateStr: string) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDay(dayStr: string) {
  const d = new Date(`${dayStr}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function money(n: number) {
  return `$${n % 1 === 0 ? n : n.toFixed(2)}`;
}

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.min(100, Math.round((part / whole) * 100))}%` : "—";
}

function cutoffFor(days: number | null): string | null {
  if (days === null) return null;
  if (days === 1) {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    return now.toISOString();
  }
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function renderedAt(): string {
  return `${new Date().toISOString().slice(11, 16)} UTC`;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; tab?: string }>;
}) {
  if (!isAdminAuthorized((await headers()).get("authorization"))) notFound();

  const sp = await searchParams;
  const tab = sp.tab === "approvals" ? "approvals" : "analytics";
  const range = RANGES.find((r) => r.key === sp.days) ?? RANGES[0];
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

  const profilesQuery = admin.from("profiles").select("id, username, is_published");

  let eventsQuery = admin
    .from("page_events")
    .select("id, profile_id, type, section, package_id, visitor_id, network, wallet_type, created_at");
  if (cutoffIso) eventsQuery = eventsQuery.gte("created_at", cutoffIso);

  let ordersQuery = admin.from("orders").select("profile_id, status, price_usd, created_at");
  if (cutoffIso) ordersQuery = ordersQuery.gte("created_at", cutoffIso);

  const [profilesRes, eventsRes, ordersRes] = await Promise.all([
    profilesQuery,
    eventsQuery.order("created_at", { ascending: false }).limit(EVENTS_CAP),
    ordersQuery,
  ]);

  if (eventsRes.error) {
    return <SetupNotice message={eventsRes.error.message} />;
  }

  const profiles = profilesRes.data ?? [];
  const events = eventsRes.data ?? [];
  const orders = ordersRes.data ?? [];

  const rows = new Map<string, Row>();
  const usernameMap = new Map<string, string>();
  for (const p of profiles) {
    usernameMap.set(p.id, p.username || "unknown");
    rows.set(p.id, {
      id: p.id,
      username: p.username,
      published: p.is_published,
      views: 0,
      visitors: new Set(),
      opens: 0,
      checkouts: 0,
      walletClicks: 0,
      orders: 0,
      paid: 0,
      revenue: 0,
    });
  }

  const sections: Record<SectionName, number> = { links: 0, packages: 0, promo: 0 };
  const globalVisitors = new Set<string>();
  
  // Funnel tracking
  let walletButtonClicked = 0;
  let walletConnectClicked = 0;
  let walletConnected = 0;
  
  // Daily Tracking
  const dailyData = new Map<string, any>();

  for (const e of events) {
    const row = rows.get(e.profile_id);
    const day = e.created_at.slice(0, 10);
    
    if (!dailyData.has(day)) {
      dailyData.set(day, { visitors: new Set(), views: 0, walletClicks: 0, connected: 0 });
    }
    const dayEntry = dailyData.get(day);

    if (e.type === "wallet_button_click") {
      walletButtonClicked++;
      dayEntry.walletClicks++;
      if (row) row.walletClicks++;
    } else if (e.type === "wallet_connect_click") {
      walletConnectClicked++;
    } else if (e.type === "wallet_connected") {
      walletConnected++;
      dayEntry.connected++;
    }

    if (!row) continue;
    switch (e.type) {
      case "page_view":
        row.views++;
        dayEntry.views++;
        if (e.visitor_id) {
          row.visitors.add(e.visitor_id);
          globalVisitors.add(e.visitor_id);
          dayEntry.visitors.add(e.visitor_id);
        }
        break;
      case "section_view":
        if (e.section && e.section in sections) sections[e.section as SectionName]++;
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

  const dailyTable = Array.from(dailyData.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14)
    .map(([day, types]) => {
      const visitors = types.visitors.size;
      const clicks = types.walletClicks;
      const connected = types.connected;
      const dropOff = clicks > 0 ? Math.round(((clicks - connected) / clicks) * 100) : null;
      return { day, visitors, pageViews: types.views, clicks, connected, dropOff };
    });

  let earliestEventMs: number | null = null;
  for (const e of events) {
    const t = Date.parse(e.created_at);
    if (!Number.isNaN(t) && (earliestEventMs === null || t < earliestEventMs)) {
      earliestEventMs = t;
    }
  }
  const trackedFromMs = earliestEventMs;

  const funnelOrders =
    trackedFromMs === null
      ? orders
      : orders.filter((o) => Date.parse(o.created_at) >= trackedFromMs);
  const funnelPaidCount = funnelOrders.filter((o) => o.status === "paid").length;

  const list = [...rows.values()].sort((a, b) => b.views - a.views || b.revenue - a.revenue);
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
  const capped = events.length >= EVENTS_CAP;
  const recentEvents = events.slice(0, 50);

  const funnel = [
    { label: "Visitors", value: globalVisitors.size },
    { label: "Clicked Connect Wallet", value: walletButtonClicked },
    { label: "Selected a Wallet", value: walletConnectClicked },
    { label: "Connected", value: walletConnected },
    { label: "Paid", value: funnelPaidCount },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10">
      <div className="mb-6 flex gap-4 border-b border-border pb-4 text-sm font-medium">
        <Link href="/v1/admin?tab=analytics" className={tab === "analytics" ? "text-foreground" : "text-muted hover:text-foreground"}>
          Analytics
        </Link>
        <Link href="/v1/admin?tab=approvals" className={tab === "approvals" ? "text-foreground" : "text-muted hover:text-foreground"}>
          Connections
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-brand-700 uppercase">Admin</p>
          <h1 className="mt-1 text-3xl font-bold">{tab === "approvals" ? "Connections" : "Analytics"}</h1>
          {tab === "analytics" && (
            <p className="mt-1 text-sm text-muted">
              Visitor funnel across all {list.length} creator {list.length === 1 ? "page" : "pages"} · {range.label.toLowerCase()} · updated {renderedAt()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
                    active ? "bg-brand-600 text-background" : "text-muted hover:text-foreground",
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
          Showing the most recent {EVENTS_CAP.toLocaleString()} events — counts for this range are a lower bound. Narrow the range for exact figures.
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
                        <Link href={`/${a.username}`} target="_blank" className="font-medium text-brand-700 hover:underline">
                          @{a.username}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">{a.token_contract}</td>
                    <td className="px-4 py-3">{a.chain_id}</td>
                    <td className="px-4 py-3 text-right">{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {approvals.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted">No connections yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total Visitors" value={globalVisitors.size.toLocaleString()} />
            <Stat label="Total Page Views" value={totals.views.toLocaleString()} />
            <Stat label="Wallets Connected" value={walletConnected.toLocaleString()} />
            <Stat label="Revenue (paid)" value={money(totals.revenue)} accent />
          </div>

          <section className="mt-6 card p-5">
            <h2 className="text-sm font-semibold">Wallet-Connect Funnel</h2>
            <div className="mt-4 space-y-3">
              {funnel.map((stage) => (
                <FunnelBar key={stage.label} label={stage.label} value={stage.value} total={Math.max(1, globalVisitors.size)} />
              ))}
            </div>
            {walletButtonClicked > walletConnected && (
               <p className="mt-4 text-sm text-amber-500">
                 {walletButtonClicked - walletConnected} visitor(s) clicked "Connect Wallet" but didn't connect.
               </p>
            )}
          </section>

          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">Last 14 Days</h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <Th>Visitors</Th>
                    <Th>Page Views</Th>
                    <Th>Wallet Clicks</Th>
                    <Th>Connected</Th>
                    <Th>Drop-off</Th>
                  </tr>
                </thead>
                <tbody>
                  {dailyTable.map((row) => (
                    <tr key={row.day} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">{formatDay(row.day)}</td>
                      <Td>{row.visitors}</Td>
                      <Td>{row.pageViews}</Td>
                      <Td>{row.clicks}</Td>
                      <Td>{row.connected}</Td>
                      <Td>{row.dropOff === null ? "—" : `${row.dropOff}%`}</Td>
                    </tr>
                  ))}
                  {dailyTable.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted">No activity recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">Recent Activity</h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Creator</th>
                    <th className="px-4 py-3 font-medium">Network / Wallet</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((ev) => (
                    <tr key={ev.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3" title={ev.created_at}>{timeAgo(ev.created_at)}</td>
                      <td className="px-4 py-3">{eventLabel(ev.type)}</td>
                      <td className="px-4 py-3 text-muted">
                         {usernameMap.get(ev.profile_id) ? `@${usernameMap.get(ev.profile_id)}` : "unknown"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {ev.network ? `${ev.network.toUpperCase()}${ev.wallet_type ? ` · ${ev.wallet_type}` : ""}` : "—"}
                      </td>
                    </tr>
                  ))}
                  {recentEvents.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-muted">No events yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">By creator</h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="px-4 py-3 font-medium">Username</th>
                    <Th>Views</Th>
                    <Th>Visitors</Th>
                    <Th>Connects</Th>
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
                          <Link href={`/${r.username}`} target="_blank" className="font-medium text-brand-700 hover:underline">
                            @{r.username}
                          </Link>
                        ) : (
                          <span className="text-muted">— no handle</span>
                        )}
                        {!r.published && <span className="badge ml-2 bg-white/[0.06] text-muted">draft</span>}
                      </td>
                      <Td>{r.views.toLocaleString()}</Td>
                      <Td>{r.visitors.size.toLocaleString()}</Td>
                      <Td>{r.walletClicks.toLocaleString()}</Td>
                      <Td>{r.orders.toLocaleString()}</Td>
                      <Td>{r.paid.toLocaleString()}</Td>
                      <Td>{r.revenue > 0 ? money(r.revenue) : "—"}</Td>
                    </tr>
                  ))}
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted">No creators yet.</td>
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

function Stat({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-accent" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function FunnelBar({ label, value, total }: { label: string; value: number; total: number }) {
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
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${width}%` }} />
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

function SetupNotice({ message }: { message: string }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-16">
      <h1 className="text-2xl font-bold">Analytics not set up yet</h1>
      <p className="mt-2 text-sm text-muted">
        The <code className="text-brand-700">page_events</code> table could not be read. 
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-card p-4 text-xs text-muted">
        {message}
      </pre>
    </main>
  );
}
