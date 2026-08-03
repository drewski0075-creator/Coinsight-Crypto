import React, { useEffect, useState } from "react";
import { getPositionAuditFn } from "~/server-fns";

/* ------------------------------------------------------------------ */
/*  Types (mirror the server-side audit shape)                         */
/* ------------------------------------------------------------------ */
export type AuditConsumedLot = {
  lotDate: string | null;
  amount: number;
  costBasis: number;
};

export type AuditTraceRow = {
  tx: {
    id: number;
    symbol: string;
    type: string;
    amount: number;
    amount_usd: number;
    price_per_unit: number;
    exchange_source: string;
    tx_date: string;
    notes: string;
    realized_pnl: number | null;
  };
  runningBalance: number;
  consumedLots: AuditConsumedLot[];
};

export type AuditLot = {
  purchaseDate: string | null;
  originalAmount: number;
  remainingAmount: number;
  originalCostBasis: number;
  remainingCostBasis: number;
  purchasePrice: number | null;
  source: string;
};

export type AuditLotEvent = {
  date: string;
  kind: "created" | "consumed";
  amount: number;
  costBasis: number;
};

export type PositionAudit = {
  symbol: string;
  trace: AuditTraceRow[];
  lots: AuditLot[];
  lotEvents: AuditLotEvent[];
  netBalance: number;
};

/* ------------------------------------------------------------------ */
/*  Shared formatting + badge maps                                     */
/* ------------------------------------------------------------------ */
const TYPE_BADGES: Record<string, { label: string; cls: string }> = {
  buy: { label: "Buy", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  sell: { label: "Sell", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  send: { label: "Send", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  receive: { label: "Receive", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  staking_reward: { label: "Staking", cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  airdrop: { label: "Airdrop", cls: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  interest: { label: "Interest", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  fee: { label: "Fee", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" },
  transfer: { label: "Transfer", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" },
};

const SOURCE_LABELS: Record<string, string> = {
  coinbase: "Coinbase",
  binance: "Binance",
  kraken: "Kraken",
  robinhood: "Robinhood",
  manual: "Manual",
};

const ADDS = new Set(["buy", "receive", "staking_reward", "airdrop", "interest", "transfer"]);

function fmtUsd(n: number): string {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1) {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return "$" + n.toFixed(4);
}

function fmtCrypto(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toFixed(6);
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

/* ------------------------------------------------------------------ */
/*  Drawer                                                             */
/* ------------------------------------------------------------------ */
type Props = {
  symbol: string | null;
  onClose: () => void;
};

export default function PositionHistoryDrawer({ symbol, onClose }: Props) {
  const [audit, setAudit] = useState<PositionAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = symbol != null;

  useEffect(() => {
    if (!symbol) {
      setAudit(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAudit(null);
    getPositionAuditFn({ data: { symbol } })
      .then((a) => {
        if (!cancelled) setAudit(a);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load position history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const buyAmount = audit?.trace.filter((r) => r.tx.type.toLowerCase() === "buy").reduce((s, r) => s + r.tx.amount, 0) ?? 0;
  const sellAmount = audit?.trace.filter((r) => r.tx.type.toLowerCase() === "sell").reduce((s, r) => s + r.tx.amount, 0) ?? 0;
  const realizedPnl =
    audit?.trace
      .filter((r) => r.tx.type.toLowerCase() === "sell")
      .reduce((s, r) => {
        const proceeds = Number(r.tx.amount_usd) || Number(r.tx.amount) * Number(r.tx.price_per_unit) || 0;
        const cost = r.consumedLots.reduce((c, l) => c + l.costBasis, 0);
        return s + proceeds - cost;
      }, 0) ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Slide-out panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Position history"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out dark:bg-slate-800 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-600">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              🧾 {symbol ?? ""} — Position History
            </p>
            <span className="rounded bg-gradient-to-r from-amber-500 to-purple-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Max
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close position history"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && audit && (
            <>
              {/* Summary */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-700/40">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Net Balance</p>
                  <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{fmtCrypto(audit.netBalance)} {audit.symbol}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-700/40">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Realized P&amp;L</p>
                  <p className={`font-mono text-sm font-bold ${realizedPnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {realizedPnl >= 0 ? "+" : "−"}{fmtUsd(Math.abs(realizedPnl))}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-700/40">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Buys</p>
                  <p className="font-mono text-sm font-semibold text-green-600 dark:text-green-400">{fmtCrypto(buyAmount)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-600 dark:bg-slate-700/40">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Sells</p>
                  <p className="font-mono text-sm font-semibold text-red-600 dark:text-red-400">{fmtCrypto(sellAmount)}</p>
                </div>
              </div>

              {/* Mini lot view */}
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">🔗 Lot View</p>
                {audit.lotEvents.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">No lot activity — buys and sells create/consume FIFO lots.</p>
                ) : (
                  <div className="space-y-1">
                    {audit.lotEvents.map((ev, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs ${
                          ev.kind === "created"
                            ? "border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-900/20"
                            : "border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-900/20"
                        }`}
                      >
                        <span className={`font-mono ${ev.kind === "created" ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {ev.kind === "created" ? "+" : "−"}{fmtCrypto(ev.amount)} {audit.symbol}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {ev.kind === "created" ? "lot created" : "lot consumed"} · {ev.costBasis > 0 ? `basis ${fmtUsd(ev.costBasis)}` : "no basis"} · {fmtDate(ev.date)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Open lots table */}
              {audit.lots.length > 0 && (
                <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-600 dark:bg-slate-700/50">
                        <th className="px-2 py-1.5 font-medium text-slate-500 dark:text-slate-400">Purchased</th>
                        <th className="px-2 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">Original</th>
                        <th className="px-2 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">Remaining</th>
                        <th className="px-2 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">Basis</th>
                        <th className="px-2 py-1.5 font-medium text-slate-500 dark:text-slate-400">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {audit.lots.map((lot, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                            {lot.purchaseDate ? fmtDate(lot.purchaseDate) : "—"}
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-slate-700 dark:text-slate-300">{fmtCrypto(lot.originalAmount)}</td>
                          <td className="px-2 py-1 text-right font-mono text-slate-700 dark:text-slate-300">
                            {lot.remainingAmount > 0 ? (
                              <span className="font-semibold text-slate-900 dark:text-slate-100">{fmtCrypto(lot.remainingAmount)}</span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">0</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-slate-500 dark:text-slate-400">
                            {lot.remainingCostBasis > 0 ? fmtUsd(lot.remainingCostBasis) : "—"}
                          </td>
                          <td className="px-2 py-1 text-slate-500 dark:text-slate-400">
                            {(SOURCE_LABELS[lot.source] ?? lot.source) || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Transaction history */}
              <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">📜 Every Transaction</p>
              {audit.trace.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">No transactions for this asset.</p>
              ) : (
                <div className="space-y-1.5">
                  {audit.trace.map((row) => {
                    const type = row.tx.type.toLowerCase();
                    const badge = TYPE_BADGES[type] || { label: row.tx.type, cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" };
                    const isAdd = ADDS.has(type);
                    return (
                      <div key={row.tx.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">{fmtDate(row.tx.tx_date)}</span>
                          </div>
                          <span className={`font-mono text-xs font-semibold ${isAdd ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            {isAdd ? "+" : "−"}{fmtCrypto(row.tx.amount)} {row.tx.symbol.toUpperCase()}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{row.tx.amount_usd > 0 ? fmtUsd(row.tx.amount_usd) : "—"}</span>
                          <span className="font-mono">
                            balance after: <span className="font-semibold text-slate-700 dark:text-slate-300">{fmtCrypto(row.runningBalance)}</span>
                          </span>
                        </div>
                        {type === "sell" && row.consumedLots.length > 0 && (
                          <div className="mt-1 border-t border-dashed border-slate-200 pt-1 text-[10px] text-slate-400 dark:border-slate-600 dark:text-slate-500">
                            {row.consumedLots.map((c, j) => (
                              <span key={j} className="mr-2 inline-block">
                                consumed {fmtCrypto(c.amount)} from {c.lotDate ? fmtDate(c.lotDate) : "no-lot"} lot
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
