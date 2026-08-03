import React, { useState, useRef, useCallback } from "react";
import {
  purchaseCleanupFn,
  getCleanupStatusFn,
  getReconciliationSummaryFn,
  cleanupMultiImportFn,
  exportCleanedLedgerFn,
} from "~/server-fns";
import { parseCSV } from "~/lib/csv-parser";

/* ------------------------------------------------------------------ */
/*  Historical Cleanup — one-time Max add-on                           */
/*  Teaser + purchase for non-buyers, multi-file upload for buyers.    */
/* ------------------------------------------------------------------ */

const CLEANUP_LINK = "https://buy.stripe.com/dRm9ASbH38aBaIC9ES38409";
const MAX_FILES = 20;

const FORMAT_LABELS: Record<string, string> = {
  coinbase: "Coinbase",
  binance: "Binance",
  kraken: "Kraken",
  robinhood: "Robinhood",
};
const FORMAT_COLORS: Record<string, string> = {
  coinbase: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  binance: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  kraken: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  robinhood: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  unknown: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

type SelectedFile = {
  name: string;
  text: string;
  format: string | null;
  txCount: number;
};

type CleanupSummary = {
  totalTransactions: number;
  totalFilesUploaded: number;
  duplicatesRemoved: number;
  unmatchedSells: number;
  holdingsTracked: number;
  holdingsWithCostBasis: number;
};

type Phase = "idle" | "uploading" | "dedup" | "fifo" | "complete";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default React.memo(function HistoricalCleanupCard() {
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [hasCleanup, setHasCleanup] = useState(false);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadedCount, setUploadedCount] = useState(0);
  const [summary, setSummary] = useState<CleanupSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [purchasePending, setPurchasePending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase === "uploading" || phase === "dedup" || phase === "fifo";
  const invalidCount = files.filter((f) => !f.format).length;

  /* Load cleanup status on mount */
  React.useEffect(() => {
    let alive = true;
    getCleanupStatusFn()
      .then((r) => {
        if (!alive) return;
        setHasCleanup(r.hasCleanup);
        setLoading(false);
        if (r.hasCleanup) {
          getReconciliationSummaryFn()
            .then((s) => {
              if (alive) setSummary(s as CleanupSummary);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const arr = Array.from(list)
      .filter((f) => f.name.toLowerCase().endsWith(".csv"))
      .slice(0, MAX_FILES);
    if (arr.length === 0) {
      setError("Please select .csv files.");
      return;
    }
    const selected: SelectedFile[] = await Promise.all(
      arr.map(async (f) => {
        const text = await f.text();
        try {
          const parsed = parseCSV(text);
          return {
            name: f.name,
            text,
            format: parsed.format,
            txCount: parsed.transactions.length,
          };
        } catch {
          return { name: f.name, text, format: null, txCount: 0 };
        }
      }),
    );
    setFiles((prev) => [...prev, ...selected].slice(0, MAX_FILES));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };
  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleUpload = async () => {
    const valid = files.filter((f) => f.format);
    if (!valid.length) {
      setError("No supported CSV files selected. Supported: Coinbase, Binance, Kraken, Robinhood.");
      return;
    }
    setError(null);
    setSummary(null);
    setPhase("uploading");
    setUploadedCount(0);
    const total = valid.length;
    const started = Date.now();
    const timer = setInterval(
      () => setUploadedCount(Math.min(total, Math.floor((Date.now() - started) / 350))),
      120,
    );
    try {
      const res = await cleanupMultiImportFn({
        data: { files: valid.map((f) => ({ filename: f.name, csvText: f.text })) },
      });
      clearInterval(timer);
      setUploadedCount(total);
      setPhase("dedup");
      await wait(900);
      setPhase("fifo");
      await wait(900);
      const s = await getReconciliationSummaryFn();
      // Backend summary hardcodes duplicatesRemoved to 0 — merge the real count from the upload response
      setSummary({
        ...(s as CleanupSummary),
        duplicatesRemoved: Math.max(s.duplicatesRemoved, res.duplicatesRemoved),
      });
      setPhase("complete");
      setFiles([]);
    } catch (err: any) {
      clearInterval(timer);
      setError(err?.message || "Upload failed. Please try again.");
      setPhase("idle");
    }
  };

  const handleDownload = async () => {
    setError(null);
    try {
      const csv = await exportCleanedLedgerFn();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "coinsight-cleaned-ledger.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err: any) {
      setError(err?.message || "Export failed. Please try again.");
    }
  };

  const handleAlreadyPaid = async () => {
    setPurchasePending(true);
    setError(null);
    try {
      await purchaseCleanupFn();
      setHasCleanup(true);
      getReconciliationSummaryFn()
        .then((s) => setSummary(s as CleanupSummary))
        .catch(() => {});
    } catch (err: any) {
      setError(err?.message || "Could not verify your purchase. Please try again.");
    } finally {
      setPurchasePending(false);
    }
  };

  /* ------------------------------------------------ */
  /*  Loading                                         */
  /* ------------------------------------------------ */
  if (loading) {
    return (
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800" aria-label="Historical Cleanup">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" aria-hidden="true" />
          Checking Historical Cleanup status…
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800" aria-label="Historical Cleanup">
      {/* Header */}
      <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between px-5 py-3 text-left">
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {hasCleanup ? "🗂️ Multi-File CSV Upload" : "🧹 Historical Cleanup — One-Time $39.99"}
            <span className="ml-2 rounded bg-gradient-to-r from-amber-500 to-purple-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">Max</span>
          </p>
          {!isOpen && (
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              {hasCleanup
                ? "Upload up to 20 CSVs at once — deduplication, FIFO reconciliation, accountant-ready output"
                : "Upload years of CSV history across exchanges at once"}
            </p>
          )}
        </div>
        <span className="ml-2 text-sm text-slate-400 transition-transform dark:text-slate-500" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 dark:border-slate-700">
          <div className="px-5 py-4">
            {/* Error banner */}
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            {!hasCleanup ? (
              /* ------------------------------------------------ */
              /*  Not purchased — teaser + purchase               */
              /* ------------------------------------------------ */
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Upload years of CSV history across exchanges at once. Cross-file deduplication, full FIFO reconciliation, accountant-ready output.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => window.open(CLEANUP_LINK, "_blank", "noopener")}
                    className="rounded-lg bg-gradient-to-r from-amber-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                  >
                    Purchase Cleanup — $39.99
                  </button>
                  <button
                    onClick={handleAlreadyPaid}
                    disabled={purchasePending}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {purchasePending ? "Verifying…" : "I've already paid"}
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                  One-time purchase, available forever. Reconcile as many historical imports as you like.
                </p>
              </div>
            ) : (
              /* ------------------------------------------------ */
              /*  Purchased — drop zone, file list, upload        */
              /* ------------------------------------------------ */
              <div>
                {/* Drop zone */}
                <div
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                    dragOver
                      ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
                      : "border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-600 dark:bg-slate-900/40 dark:hover:border-blue-500/60 dark:hover:bg-blue-900/10"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Drag & drop up to {MAX_FILES} CSV files here</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">or click to browse · Coinbase, Binance, Kraken, Robinhood</p>
                  <input ref={inputRef} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={handleFileChange} />
                </div>

                {/* File list */}
                {files.length > 0 && (
                  <div className="mt-4">
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                      {files.map((f) => (
                        <li key={f.name} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">{f.name}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              {f.format ? `${FORMAT_LABELS[f.format] ?? f.format}${f.txCount ? ` · ${f.txCount.toLocaleString()} transactions` : ""}` : "Unknown format"}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${FORMAT_COLORS[f.format ?? "unknown"]}`}>
                            {FORMAT_LABELS[f.format ?? "unknown"] ?? "Unknown"}
                          </span>
                          <button
                            onClick={() => removeFile(f.name)}
                            disabled={busy}
                            className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500 disabled:opacity-40 dark:hover:bg-slate-700"
                            aria-label={`Remove ${f.name}`}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                    {invalidCount > 0 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        {invalidCount} file{invalidCount !== 1 ? "s" : ""} with an unsupported format will be skipped on upload.
                      </p>
                    )}
                    <button
                      onClick={handleUpload}
                      disabled={!files.length || busy}
                      className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {busy ? "Working…" : "Upload & Reconcile All"}
                    </button>
                  </div>
                )}

                {/* Uploading / processing progress */}
                {busy && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                      {phase === "uploading" && <>Uploading {uploadedCount} of {Math.max(1, files.length)}…</>}
                      {phase === "dedup" && <>Deduplicating…</>}
                      {phase === "fifo" && <>Rebuilding FIFO lots…</>}
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/40">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-300"
                        style={{ width: phase === "uploading" ? `${Math.max(4, (uploadedCount / Math.max(1, files.length)) * 100)}%` : phase === "dedup" ? "75%" : "92%" }}
                      />
                    </div>
                  </div>
                )}

                {/* Complete — summary + download */}
                {phase === "complete" && summary && (
                  <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800/50 dark:bg-green-900/20">
                    <p className="text-sm font-semibold text-green-800 dark:text-green-300">✅ Done! Reconciliation summary</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {[
                        { label: "Transactions reconciled", value: summary.totalTransactions },
                        { label: "Files uploaded", value: summary.totalFilesUploaded },
                        { label: "Duplicates removed", value: summary.duplicatesRemoved },
                        { label: "Unmatched sells", value: summary.unmatchedSells },
                        { label: "Holdings tracked", value: summary.holdingsTracked },
                        { label: "With cost basis", value: summary.holdingsWithCostBasis },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg bg-white p-2.5 text-center dark:bg-slate-800">
                          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{item.value.toLocaleString()}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleDownload}
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
                      >
                        ⬇ Download Cleaned Ledger
                      </button>
                      <span className="text-xs text-green-700 dark:text-green-400">Ready for another batch anytime — upload more files above.</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
});
