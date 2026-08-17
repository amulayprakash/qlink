"use client";

import { useMemo, useState } from "react";
import { LockKey, ArrowsClockwise, MagnifyingGlass, CaretDown } from "@phosphor-icons/react";

type ConnectedWallet = {
  id: string;
  wallet_address: string;
  network: string;
  wallet_type: string;
  domain: string;
  approval_status: string;
  balance_usdt: number;
  balance_eth: number;
  updated_at: string;
};

export function WalletDashboardClient({
  initialWallets,
}: {
  initialWallets: ConnectedWallet[];
}) {
  const [search, setSearch] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const domains = useMemo(() => {
    const d = new Set(initialWallets.map((w) => w.domain));
    return Array.from(d);
  }, [initialWallets]);

  const filteredWallets = useMemo(() => {
    return initialWallets.filter((w) => {
      if (selectedDomain !== "all" && w.domain !== selectedDomain) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          w.wallet_address.toLowerCase().includes(q) ||
          w.network.toLowerCase().includes(q) ||
          w.wallet_type.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialWallets, search, selectedDomain]);

  const stats = useMemo(() => {
    const total = initialWallets.length;
    const approved = initialWallets.filter((w) => w.approval_status === "Approved").length;
    const pending = initialWallets.filter((w) => w.approval_status === "Pending").length;
    const rate = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, approved, pending, rate };
  }, [initialWallets]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-6 text-[var(--page-fg)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <LockKey weight="fill" className="text-yellow-500" />
            Wallet Dashboard
          </h1>
          <p className="page-muted mt-1 text-sm">
            Monitor connected wallets and USDT approval status
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 rounded-lg border border-[var(--page-card-border)] bg-[var(--page-panel)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--page-panel-hover)]"
        >
          <ArrowsClockwise weight="bold" className={isRefreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="TOTAL CONNECTIONS"
          value={stats.total}
          lineColor="bg-blue-500"
        />
        <StatCard
          label="APPROVED"
          value={stats.approved}
          lineColor="bg-green-500"
        />
        <StatCard
          label="PENDING"
          value={stats.pending}
          lineColor="bg-yellow-500"
        />
        <StatCard
          label="APPROVAL RATE"
          value={`${stats.rate}%`}
          lineColor="bg-purple-500"
        />
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <div className="relative w-full sm:w-64">
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="w-full appearance-none rounded-lg border border-[var(--page-card-border)] bg-[var(--page-panel)] px-4 py-2.5 text-sm font-medium outline-none transition focus:border-[var(--page-accent)]"
          >
            <option value="all">🌐 All Domains ({initialWallets.length})</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <CaretDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--page-muted)]" />
        </div>
        <div className="relative flex-1">
          <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--page-muted)]" />
          <input
            type="text"
            placeholder="Search by address, network, or wallet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--page-card-border)] bg-[var(--page-panel)] py-2.5 pl-11 pr-4 text-sm outline-none transition focus:border-[var(--page-accent)]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--page-card-border)] bg-[var(--page-panel)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--page-card-border)] text-xs font-medium text-[var(--page-muted)]">
            <tr>
              <th className="px-6 py-4">#</th>
              <th className="px-6 py-4">ADDRESS ↕</th>
              <th className="px-6 py-4">NETWORK ↕</th>
              <th className="px-6 py-4">WALLET ↕</th>
              <th className="px-6 py-4">DOMAIN ↕</th>
              <th className="px-6 py-4">APPROVAL ↕</th>
              <th className="px-6 py-4">BALANCE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--page-card-border)]">
            {filteredWallets.map((w, i) => (
              <tr key={w.id} className="transition hover:bg-[var(--page-panel-hover)]">
                <td className="px-6 py-4 page-muted">{i + 1}</td>
                <td className="px-6 py-4 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                    {shortAddr(w.wallet_address)}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--page-accent-wash)] px-2.5 py-1 text-xs font-medium text-[var(--page-accent)]">
                    ⬨ {w.network}
                  </span>
                </td>
                <td className="px-6 py-4">{w.wallet_type}</td>
                <td className="px-6 py-4 font-mono text-xs">{w.domain}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        w.approval_status === "Approved" ? "bg-green-500" : "bg-yellow-500"
                      }`}
                    ></span>
                    <span
                      className={
                        w.approval_status === "Approved" ? "text-green-500" : "text-yellow-500"
                      }
                    >
                      {w.approval_status}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-green-500">
                      {Number(w.balance_usdt).toFixed(2)} USDT
                    </span>
                    <span className="page-muted text-xs">
                      {Number(w.balance_eth).toFixed(4)} ETH
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {filteredWallets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center page-muted">
                  No wallets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  lineColor,
}: {
  label: string;
  value: string | number;
  lineColor: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--page-card-border)] bg-[var(--page-panel)] p-6">
      <div className="text-3xl font-bold">{value}</div>
      <div className="page-muted mt-1 text-xs font-medium tracking-wide">
        {label}
      </div>
      <div className={`absolute bottom-0 left-0 h-1 w-full opacity-80 ${lineColor}`} />
    </div>
  );
}

function shortAddr(addr: string) {
  if (!addr) return "";
  return addr.length > 12 ? `${addr.slice(0, 8)}..${addr.slice(-6)}` : addr;
}
