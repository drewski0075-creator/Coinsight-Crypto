import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  checkAuthFn, exportTaxCsvFn, exportTaxPdfFn, getAuthFn,
  createShareLinkFn, revokeShareLinkFn, listShareLinksFn,
} from "~/server-fns";

export const Route = createFileRoute("/reports")({
  beforeLoad: async () => { if (!(await checkAuthFn()).authenticated) throw redirect({ to: "/login" }); },
  component: Reports,
});

type Holding = { symbol: string; coin_id: string; amount: number; cost_basis: number; purchase_price: number };
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

/* ------------------------------------------------------------------ */
/*  Shared Access (Max only) — accountant share links                   */
/* ------------------------------------------------------------------ */
type ShareLink = {
  id: number;
  user_id: number;
  token: string;
  label: string;
  expires_at: string | null;
  revoked: number;
  created_at: string;
};
const SHARE_BASE_URL = "https://www.coinsight-crypto.com/share/";
const fmtShareExpiryDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
};
const fmtShareExpiry = (expiresAt: string | null): string => {
  if (!expiresAt) return "Never expires";
  const t = new Date(expiresAt.replace(" ", "T") + "Z");
  if (isNaN(t.getTime())) return "Expires " + expiresAt;
  const days = Math.ceil((t.getTime() - Date.now()) / 86400000);
  if (days <= 0) return "Expired";
  if (days <= 30) return `Expires in ${days} day${days === 1 ? "" : "s"}`;
  return "Expires " + fmtShareExpiryDate(t.toISOString());
};
const ShareLinksSection = React.memo(function ShareLinksSection() {
  const [isOpen, setIsOpen] = useState(true);
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [label, setLabel] = useState("");
  const [expiryChoice, setExpiryChoice] = useState("30");
  const [customDate, setCustomDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLinks(await listShareLinksFn());
    } catch {
      setLinks([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeLinks = useMemo(() => {
    if (!links) return [];
    const now = Date.now();
    return links.filter((l) => {
      if (!l.expires_at) return true;
      const t = new Date(l.expires_at.replace(" ", "T") + "Z").getTime();
      return !isNaN(t) && t > now;
    });
  }, [links]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setCreateError(null);
    try {
      let days = Number(expiryChoice);
      if (expiryChoice === "custom") {
        if (!customDate) {
          setCreateError("Choose a custom expiry date.");
          setGenerating(false);
          return;
        }
        const end = new Date(customDate + "T23:59:59").getTime();
        days = Math.max(1, Math.ceil((end - Date.now()) / 86400000));
      }
      const result = await createShareLinkFn({ data: { expiresInDays: days, label: label.trim() || undefined } });
      setCreated({ url: result.url, expiresAt: new Date(Date.now() + days * 86400000).toISOString() });
      setLabel("");
      setExpiryChoice("30");
      setCustomDate("");
      refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create share link.");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    try {
      await revokeShareLinkFn({ data: { token } });
      setLinks((prev) => (prev ? prev.filter((l) => l.token !== token) : prev));
    } catch {
      refresh();
    }
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
            🔗 Shared Access
            <span className="ml-1.5 rounded bg-gradient-to-r from-amber-500 to-purple-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Max
            </span>
          </p>
          {activeLinks.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              {activeLinks.length}
            </span>
          )}
        </div>
        <span
          className="ml-2 text-sm text-slate-400 transition-transform dark:text-slate-500"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Share a read-only snapshot of your portfolio with your accountant. Links are token-based and expire automatically.
          </p>
          <button
            onClick={() => {
              setCreated(null);
              setCreateError(null);
              setShowModal(true);
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-purple-600 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            + Create Share Link
          </button>

          {/* Active links list */}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Active share links
            </p>
            {links === null ? (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Loading share links...</p>
            ) : activeLinks.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
                No active share links. Create one to share with your accountant.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {activeLinks.map((l) => (
                  <li
                    key={l.token}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {l.label || "Unnamed link"}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-slate-400 dark:text-slate-500">
                        {l.token.slice(0, 8)}…
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{fmtShareExpiry(l.expires_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => copyToClipboard(SHARE_BASE_URL + l.token, l.token)}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
                      >
                        {copied === l.token ? "Copied!" : "Copy"}
                      </button>
                      <button
                        onClick={() => handleRevoke(l.token)}
                        className="min-h-11 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        Revoke
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ---------- Create Share Link Modal ---------- */}
      {showModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
            <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-blue-600 to-purple-700 px-6 py-4">
              <h2 className="text-lg font-bold text-white">Create Share Link</h2>
              <button
                onClick={() => setShowModal(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-200 transition-colors hover:bg-blue-500 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5">
              {created ? (
                <div>
                  <p className="text-sm font-semibold text-green-600 dark:text-green-400">✓ Share link created</p>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 font-mono text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                      {created.url}
                    </code>
                    <button
                      onClick={() => copyToClipboard(created.url, "created")}
                      className="min-h-11 shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      {copied === "created" ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Expires {fmtShareExpiryDate(created.expiresAt)}
                  </p>
                  <button
                    onClick={() => {
                      setShowModal(false);
                      setCreated(null);
                    }}
                    className="mt-5 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Label <span className="font-normal normal-case text-slate-400 dark:text-slate-500">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. CPA tax prep 2026"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Expires in
                    </label>
                    <select
                      value={expiryChoice}
                      onChange={(e) => setExpiryChoice(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
                    >
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="custom">Custom date</option>
                    </select>
                  </div>
                  {expiryChoice === "custom" && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Expiry date
                      </label>
                      <input
                        type="date"
                        value={customDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-colors focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
                      />
                    </div>
                  )}
                  {createError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                      {createError}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setShowModal(false)}
                      className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      Close
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="flex-1 rounded-lg bg-gradient-to-r from-amber-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {generating ? "Generating..." : "Generate"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

function Reports() {
  const [isPro, setIsPro] = useState(false);
  const [isMax, setIsMax] = useState(false);
  const [email, setEmail] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { (async () => { try { const auth = await getAuthFn(); if (!auth.user) return; setIsPro(auth.user.is_pro === 1); setIsMax(auth.user.is_max === 1); setEmail(auth.user.email); setHoldings(auth.holdings); const ids = [...new Set(auth.holdings.map((h) => h.coin_id))]; if (ids.length) { const r = await fetch(`/api/coingecko/prices?ids=${ids.join(",")}`); const data = await r.json(); const mapped: Record<string, number> = {}; for (const h of auth.holdings) mapped[h.coin_id] = data[h.coin_id]?.usd ?? 0; setPrices(mapped); } } catch { setError("Unable to load portfolio data."); } finally { setLoading(false); } })(); }, []);
  const wealth = useMemo(() => holdings.reduce((n, h) => n + h.amount * (prices[h.coin_id] || 0), 0), [holdings, prices]);
  const cost = useMemo(() => holdings.reduce((n, h) => n + (h.cost_basis || h.amount * (h.purchase_price || 0)), 0), [holdings]);
  const pnl = wealth - cost;
  const download = async (kind: "csv" | "pdf") => { setBusy(kind); setError(""); try { if (kind === "csv") { const csv = await exportTaxCsvFn(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "coinsight-tax-report.csv"; a.click(); URL.revokeObjectURL(a.href); } else { const b64 = await exportTaxPdfFn(); const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })); a.download = "coinsight-tax-summary.pdf"; a.click(); URL.revokeObjectURL(a.href); } } catch (e) { setError(e instanceof Error ? e.message : "Export failed."); } finally { setBusy(null); } };
  return <div className="min-h-dvh bg-slate-50 dark:bg-slate-900"><header className="sticky top-0 z-50 h-16 bg-white shadow-sm dark:bg-slate-800"><div className="mx-auto flex h-full max-w-4xl items-center justify-between px-4 sm:px-6"><Link to="/app" className="flex items-center gap-2"><img src="/logo-icon.png" alt="CoinSight" className="h-7 w-7" /><span className="text-lg font-bold text-slate-900 dark:text-slate-100">CoinSight</span></Link><nav className="flex items-center gap-2 sm:gap-4"><Link to="/app" className="flex min-h-11 items-center text-sm font-medium text-slate-600 hover:text-blue-600 dark:text-slate-400">Dashboard</Link><span className="text-sm font-medium text-blue-600">Reports {isMax ? <span className="ml-1 rounded bg-gradient-to-r from-amber-500 to-purple-600 px-1.5 py-0.5 text-[10px] font-bold text-white">MAX</span> : <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold dark:bg-blue-900/40">PRO</span>}</span></nav></div></header><main className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><div className="mb-8"><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Tax Reports</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Export your reconciled ledger for tax preparation.</p></div>{!isPro ? <div className="rounded-xl border border-blue-200 bg-white p-8 text-center shadow-sm dark:border-blue-800/50 dark:bg-slate-800"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-2xl dark:bg-blue-900/40">🔒</div><h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Tax Reports are a Pro feature</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">Upgrade to export tax-ready spreadsheet and PDF summaries from your transaction ledger.</p><Link to="/app" className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Upgrade to Pro</Link></div> : <><div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-600 dark:bg-slate-800"><div className="rounded-t-xl border-t-4 border-t-emerald-500" /><div className="p-4 sm:p-6"><p className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Wealth</p><p className="mt-1 font-mono text-3xl font-bold text-slate-900 sm:text-4xl dark:text-slate-100">{loading ? "…" : money(wealth)}</p><p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{holdings.length} holdings tracked</p></div></div><div className="rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-600 dark:bg-slate-800"><div className="rounded-t-xl border-t-4 border-t-blue-600" /><div className="p-4 sm:p-6"><p className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Portfolio P&amp;L</p><p className="mt-1 font-mono text-3xl font-bold text-slate-900 sm:text-4xl dark:text-slate-100">{loading ? "…" : money(wealth)}</p><div className="mt-3 flex gap-6"><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Cost Basis</p><p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{cost ? money(cost) : "—"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">P&amp;L</p><p className={`text-sm font-bold ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>{cost ? money(pnl) : "—"}</p></div></div></div></div></div><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800 sm:p-6"><h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Tax-ready exports</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Download your transaction activity in formats ready to review.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button onClick={() => download("csv")} disabled={!!busy} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"><span>↓</span>{busy === "csv" ? "Preparing…" : "Download Spreadsheet Report"}</button><button onClick={() => download("pdf")} disabled={!!busy} className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"><span>▤</span>{busy === "pdf" ? "Preparing…" : "Download PDF Summary"}</button></div>{error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}<p className="mt-5 text-xs text-slate-400 dark:text-slate-500">{isMax ? "FIFO-based calculation." : "Average-cost calculation."} Tax-ready exports include all reconciled transactions from your ledger. Consult a tax professional for filing advice.</p></section>{isMax && <ShareLinksSection />}</>}</main></div>;
}
