import React, { useMemo, useState } from "react";

type Transaction = {
  id: number;
  user_id: number;
  symbol: string;
  coin_id: string;
  type: string;
  amount: number;
  amount_usd: number;
  price_per_unit: number;
  fee: number;
  fee_symbol: string;
  exchange_source: string;
  tx_hash: string;
  tx_date: string;
  notes: string;
  realized_pnl: number | null;
  created_at: string;
};

type Props = {
  transactions: Transaction[];
  loading: boolean;
  onDelete: (id: number) => void;
  isMax?: boolean;
};

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

const EXCHANGE_BADGES: Record<string, { label: string; cls: string }> = {
  coinbase: { label: "Coinbase", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  binance: { label: "Binance", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  kraken: { label: "Kraken", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  robinhood: { label: "Robinhood", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const ALL_TYPES = ["", "buy", "sell", "send", "receive", "staking_reward", "airdrop", "interest", "fee", "transfer"];

const ALL_EXCHANGES = ["", "coinbase", "binance", "kraken", "robinhood"];

function fmtUsd(n: number): string {
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

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function TransactionLedger({ transactions, loading, onDelete, isMax = false }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [exchangeFilter, setExchangeFilter] = useState("");

  const filtered = useMemo(() => {
    let result = transactions;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (tx) =>
          tx.symbol.toLowerCase().includes(q) ||
          tx.notes.toLowerCase().includes(q),
      );
    }
    if (typeFilter) {
      result = result.filter((tx) => tx.type === typeFilter);
    }
    if (exchangeFilter) {
      result = result.filter((tx) => tx.exchange_source === exchangeFilter);
    }
    return result;
  }, [transactions, search, typeFilter, exchangeFilter]);

  const summary = useMemo(() => {
    let totalBuy = 0;
    let totalSell = 0;
    let totalRealizedPnl = 0;
    for (const tx of filtered) {
      if (tx.type === "buy") totalBuy += tx.amount_usd;
      if (tx.type === "sell") {
        totalSell += tx.amount_usd;
        if (tx.realized_pnl != null) totalRealizedPnl += tx.realized_pnl;
      }
    }
    return { totalBuy, totalSell, netFlow: totalSell - totalBuy, totalRealizedPnl };
  }, [filtered]);

  // Cost basis per row: buys = amount paid; sells = proceeds - realized P&L (FIFO)
  const costBasisFor = (tx: Transaction): number | null => {
    const type = tx.type.toLowerCase();
    if (type === "buy") return tx.amount_usd;
    if (type === "sell" && tx.realized_pnl != null) {
      return Number(tx.amount_usd) - Number(tx.realized_pnl);
    }
    return null;
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            📒 Transaction Ledger
          </p>
          {transactions.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              {transactions.length}
            </span>
          )}
        </div>
        <span className="ml-2 text-sm text-slate-400 transition-transform dark:text-slate-500" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 dark:border-slate-700">
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 border-b border-slate-100 px-3 sm:px-5 py-3 dark:border-slate-700">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by symbol or notes..."
              className="h-8 w-full sm:w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-xs placeholder-slate-400 transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500"
            >
              <option value="">All Types</option>
              {ALL_TYPES.slice(1).map((t) => {
                const badge = TYPE_BADGES[t];
                return <option key={t} value={t}>{badge?.label || t}</option>;
              })}
            </select>
            <select
              value={exchangeFilter}
              onChange={(e) => setExchangeFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500"
            >
              <option value="">All Exchanges</option>
              {ALL_EXCHANGES.slice(1).map((ex) => {
                const badge = EXCHANGE_BADGES[ex];
                return <option key={ex} value={ex}>{badge?.label || ex}</option>;
              })}
            </select>
            {filtered.length !== transactions.length && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Showing {filtered.length} of {transactions.length}
              </span>
            )}
          </div>

          {/* Loading state */}
          {loading && (
            <div className="space-y-2 px-5 py-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-4">
                  <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-12 rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-8 rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-600" />
                  <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-600" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && filtered.length === 0 && transactions.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No transactions match your filters.
              </p>
            </div>
          )}

          {!loading && transactions.length === 0 && (
            <div className="px-5 py-4">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No transactions yet. Import a CSV to get started.
              </p>
            </div>
          )}

          {/* Table */}
          {!loading && filtered.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-700/50">
                      <th className="px-2 sm:px-3 py-1.5 font-medium text-slate-500 dark:text-slate-400">Date</th>
                      <th className="px-2 sm:px-3 py-1.5 font-medium text-slate-500 dark:text-slate-400">Type</th>
                      <th className="px-2 sm:px-3 py-1.5 font-medium text-slate-500 dark:text-slate-400">Symbol</th>
                      <th className="px-2 sm:px-3 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">Amount</th>
                      <th className="px-2 sm:px-3 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">USD Value</th>
                      {isMax && (
                        <th className="px-2 sm:px-3 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">Cost Basis</th>
                      )}
                      <th className="px-2 sm:px-3 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">Fee</th>
                      {isMax && (
                        <th className="px-2 sm:px-3 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">Realized P&amp;L</th>
                      )}
                      <th className="px-2 sm:px-3 py-1.5 font-medium text-slate-500 dark:text-slate-400">Exchange</th>
                      <th className="px-2 sm:px-3 py-1.5 font-medium text-slate-500 dark:text-slate-400">Notes</th>
                      <th className="w-8 px-1 py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                    {filtered.map((tx) => {
                      const typeBadge = TYPE_BADGES[tx.type] || { label: tx.type, cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" };
                      const exBadge = EXCHANGE_BADGES[tx.exchange_source];
                      return (
                        <tr key={tx.id} className="py-0 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="whitespace-nowrap px-2 sm:px-3 py-1 text-slate-500 dark:text-slate-400">
                            <span className="block">{formatDate(tx.tx_date)}</span>
                            <span className="block text-[10px] text-slate-400 dark:text-slate-500">{formatTime(tx.tx_date)}</span>
                          </td>
                          <td className="px-2 sm:px-3 py-1">
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${typeBadge.cls}`}>
                              {typeBadge.label}
                            </span>
                          </td>
                          <td className="px-2 sm:px-3 py-1 font-mono font-medium text-slate-900 dark:text-slate-100">{tx.symbol}</td>
                          <td className="px-2 sm:px-3 py-1 text-right font-mono text-slate-700 dark:text-slate-300">{fmtCrypto(tx.amount)}</td>
                          <td className="px-2 sm:px-3 py-1 text-right font-mono text-slate-700 dark:text-slate-300">{fmtUsd(tx.amount_usd)}</td>
                          {isMax && (
                            <td className="px-2 sm:px-3 py-1 text-right font-mono text-slate-700 dark:text-slate-300">
                              {(() => {
                                const cb = costBasisFor(tx);
                                return cb != null ? fmtUsd(cb) : "—";
                              })()}
                            </td>
                          )}
                          <td className="whitespace-nowrap px-2 sm:px-3 py-1 text-right font-mono text-slate-500 dark:text-slate-400">
                            {tx.fee > 0 ? (
                              <span>
                                {fmtUsd(tx.fee)}
                                {tx.fee_symbol && <span className="ml-0.5 text-[10px]">{tx.fee_symbol}</span>}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          {isMax && (
                            <td className="px-2 sm:px-3 py-1 text-right font-mono text-slate-700 dark:text-slate-300">
                              {tx.type.toLowerCase() === "sell" && tx.realized_pnl != null ? (
                                <span className={tx.realized_pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                  {tx.realized_pnl >= 0 ? "+" : "−"}{fmtUsd(Math.abs(tx.realized_pnl))}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
                          <td className="px-2 sm:px-3 py-1">
                            {exBadge ? (
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${exBadge.cls}`}>
                                {exBadge.label}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>
                          <td className="max-w-[120px] truncate px-2 sm:px-3 py-1 text-slate-500 dark:text-slate-400">
                            {tx.notes || "—"}
                          </td>
                          <td className="px-1 py-1 text-center">
                            <button
                              onClick={() => onDelete(tx.id)}
                              aria-label={`Delete transaction ${tx.id}`}
                              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary footer */}
              <div className="flex flex-wrap gap-2 sm:gap-4 border-t border-slate-100 px-3 sm:px-5 py-2 dark:border-slate-700">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Total Buys: </span>
                  <span className="text-[11px] font-semibold text-green-600 dark:text-green-400">{fmtUsd(summary.totalBuy)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Total Sells: </span>
                  <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">{fmtUsd(summary.totalSell)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Net Cash Flow: </span>
                  <span className={`text-[11px] font-semibold ${summary.netFlow >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {summary.netFlow >= 0 ? "+" : ""}{fmtUsd(summary.netFlow)}
                  </span>
                </div>
                {isMax && (
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Realized P&amp;L: </span>
                    <span className={`text-[11px] font-semibold ${summary.totalRealizedPnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {summary.totalRealizedPnl >= 0 ? "+" : "−"}{fmtUsd(Math.abs(summary.totalRealizedPnl))}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
