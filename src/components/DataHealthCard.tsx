import React from "react";

export type DataHealth = {
  costBasisCoverage: { tracked: number; total: number };
  fifoReconciliation: { matched: number; total: number };
  walletFreshness: { synced: number; total: number; oldestSync: string | null };
  dataCompleteness: { pct: number };
  overall: "high" | "attention" | "unverified";
};

type Tone = "green" | "yellow" | "red";
const toneClass: Record<Tone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400",
  yellow: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400",
};
function relativeTime(value: string | null) {
  if (!value) return "Never synced";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3600000));
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
export default React.memo(function DataHealthCard({ data }: { data: DataHealth }) {
  const basisPct = data.costBasisCoverage.total ? data.costBasisCoverage.tracked / data.costBasisCoverage.total : 1;
  const sellPct = data.fifoReconciliation.total ? data.fifoReconciliation.matched / data.fifoReconciliation.total : 1;
  const age = data.walletFreshness.oldestSync ? Date.now() - new Date(data.walletFreshness.oldestSync).getTime() : Infinity;
  const walletTone: Tone = data.walletFreshness.total === 0 || (data.walletFreshness.synced === data.walletFreshness.total && age <= 86400000) ? "green" : age <= 604800000 && data.walletFreshness.synced === data.walletFreshness.total ? "yellow" : "red";
  const indicators: { icon: string; label: string; value: string; tone: Tone }[] = [
    { icon: "◈", label: "Cost Basis Coverage", value: `${data.costBasisCoverage.tracked} of ${data.costBasisCoverage.total} holdings tracked`, tone: basisPct >= .8 ? "green" : basisPct >= .5 ? "yellow" : "red" },
    { icon: "↔", label: "FIFO Reconciliation", value: data.fifoReconciliation.matched === data.fifoReconciliation.total ? "All sales matched" : `${data.fifoReconciliation.total - data.fifoReconciliation.matched} unmatched sales`, tone: sellPct === 1 ? "green" : sellPct > 0 ? "yellow" : "red" },
    { icon: "◷", label: "Wallet Freshness", value: `${data.walletFreshness.synced} wallets synced · Last sync: ${relativeTime(data.walletFreshness.oldestSync)}`, tone: walletTone },
    { icon: "✓", label: "Data Completeness", value: `${data.dataCompleteness.pct}% complete`, tone: data.dataCompleteness.pct >= 90 ? "green" : data.dataCompleteness.pct >= 60 ? "yellow" : "red" },
  ];
  const overall = data.overall === "high" ? { text: "High Confidence", sub: "fully reconciled", tone: "green" as Tone } : data.overall === "attention" ? { text: "Needs Attention", sub: "review highlighted items", tone: "yellow" as Tone } : { text: "Unverified", sub: "add purchase data", tone: "red" as Tone };
  return <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800 sm:p-5" aria-label="Data health">
    <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Data Health</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">How complete and trustworthy your portfolio data is</p></div><span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${toneClass[overall.tone]}`}>{overall.text} <span className="font-normal">— {overall.sub}</span></span></div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{indicators.map((item) => <div key={item.label} className={`rounded-full border px-3 py-2 text-xs ${toneClass[item.tone]}`}><div className="flex items-center gap-2"><span className="text-sm" aria-hidden="true">{item.icon}</span><span className="min-w-0"><strong className="block font-semibold">{item.label}</strong><span className="block truncate font-normal">{item.value}</span></span></div></div>)}</div>
  </section>;
});
