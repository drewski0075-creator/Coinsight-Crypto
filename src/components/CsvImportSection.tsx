import React, { useState, useRef } from "react";
import { importCSVFn } from "~/server-fns";

type ParsedTransaction = {
  tx_date: string;
  symbol: string;
  type: string;
  amount: number;
  amount_usd: number;
  price_per_unit: number;
  fee: number;
  fee_symbol: string;
  exchange_source: string;
  tx_hash: string;
  notes: string;
};

type CsvPreview = {
  format: string;
  transactions: ParsedTransaction[];
};

type CsvResult = {
  inserted: number;
  skipped: number;
};

type Props = {
  onImportComplete: () => void;
};

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

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1) {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return "$" + n.toFixed(6);
}

function fmtCrypto(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toFixed(8);
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

export default function CsvImportSection({ onImportComplete }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvResult | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setCsvError("Please select a .csv file.");
      return;
    }
    setCsvFile(file);
    setCsvError(null);
    setCsvResult(null);

    // Parse locally for preview only
    try {
      const text = await file.text();
      const preview = parseCSVLocally(text);
      setCsvPreview(preview);
    } catch (e: any) {
      setCsvError(e.message || "Failed to parse CSV");
      setCsvPreview(null);
    }
  };

  const handleImport = async () => {
    if (!csvFile) return;
    setCsvImporting(true);
    setCsvError(null);
    try {
      const text = await csvFile.text();
      const res = await importCSVFn({ data: { csvText: text } });
      setCsvResult({ inserted: res.inserted, skipped: res.skipped });
      setCsvPreview(null);
      setCsvFile(null);
      onImportComplete();
    } catch (e: any) {
      setCsvError(e.message || "Import failed");
    } finally {
      setCsvImporting(false);
    }
  };

  const handleCancel = () => {
    setCsvFile(null);
    setCsvPreview(null);
    setCsvResult(null);
    setCsvError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            📥 Import Transactions
          </p>
          {!isOpen && (
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              Drag and drop a Coinbase, Binance, Kraken, or Robinhood CSV to import your transaction history
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
            {/* Success state */}
            {csvResult && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800/50 dark:bg-green-900/20">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  ✅ Import complete
                </p>
                <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                  {csvResult.inserted} transaction{csvResult.inserted !== 1 ? "s" : ""} imported
                  {csvResult.skipped > 0 && <>, {csvResult.skipped} duplicate{csvResult.skipped !== 1 ? "s" : ""} skipped</>}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setCsvResult(null);
                      setCsvFile(null);
                      setCsvPreview(null);
                    }}
                    className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/30"
                  >
                    Import Another File
                  </button>
                </div>
              </div>
            )}

            {/* Error state */}
            {csvError && !csvResult && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/50 dark:bg-red-900/20">
                <p className="text-sm text-red-700 dark:text-red-400">{csvError}</p>
              </div>
            )}

            {/* Drag-and-drop zone (when no file selected) */}
            {!csvFile && !csvResult && (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                  dragOver
                    ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
                    : "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-700/50"
                }`}
              >
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {dragOver ? "Drop your CSV here" : "Drag and drop your CSV file here"}
                </p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  or
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="csv-file-input"
                />
                <label
                  htmlFor="csv-file-input"
                  className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Browse Files
                </label>
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Supports Coinbase, Binance, Kraken, and Robinhood
                </p>
              </div>
            )}

            {/* Preview state */}
            {csvPreview && !csvResult && (
              <div>
                {/* Detected format badge */}
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Detected format:</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${FORMAT_COLORS[csvPreview.format] || "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"}`}>
                    {FORMAT_LABELS[csvPreview.format] || csvPreview.format}
                  </span>
                </div>

                {/* Preview table */}
                <div className="mb-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-700/50">
                        <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Date</th>
                        <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Type</th>
                        <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Symbol</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Amount</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">USD</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Fee</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {csvPreview.transactions.slice(0, 10).map((tx, i) => {
                        const badge = TYPE_BADGES[tx.type] || { label: tx.type, cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400" };
                        return (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{formatDate(tx.tx_date)}</td>
                            <td className="px-3 py-1.5">
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-mono font-medium text-slate-900 dark:text-slate-100">{tx.symbol}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-700 dark:text-slate-300">{fmtCrypto(tx.amount)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-700 dark:text-slate-300">{fmtUsd(tx.amount_usd)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-500 dark:text-slate-400">{tx.fee > 0 ? fmtUsd(tx.fee) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {csvPreview.transactions.length > 10 && (
                  <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
                    ... and {csvPreview.transactions.length - 10} more transaction{csvPreview.transactions.length - 10 !== 1 ? "s" : ""}
                  </p>
                )}

                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  {csvPreview.transactions.length} transaction{csvPreview.transactions.length !== 1 ? "s" : ""} ready to import
                </p>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleImport}
                    disabled={csvImporting}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {csvImporting ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Importing...
                      </span>
                    ) : (
                      `Import ${csvPreview.transactions.length} Transaction${csvPreview.transactions.length !== 1 ? "s" : ""}`
                    )}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={csvImporting}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Local CSV parser (for preview only — mirrors csv-parser.ts)       */
/* ------------------------------------------------------------------ */
function parseCSVLinesLocal(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field.trim());
        field = "";
      } else if (ch === "\n") {
        row.push(field.trim());
        field = "";
        if (row.length > 0 && row.some((f) => f !== "")) {
          rows.push(row);
        }
        row = [];
      } else if (ch === "\r") {
        // skip
      } else {
        field += ch;
      }
    }
  }

  row.push(field.trim());
  if (row.length > 0 && row.some((f) => f !== "")) {
    rows.push(row);
  }

  return rows;
}

function detectFormatLocal(headers: string[]): string | null {
  const h = headers.map((s) => s.toLowerCase().trim());

  const hasCoinbase =
    h.some((c) => c === "timestamp") &&
    h.some((c) => c === "transaction type") &&
    h.some((c) => c === "asset") &&
    h.some((c) => c.includes("quantity"));
  if (hasCoinbase) return "coinbase";

  const hasBinance =
    h.some((c) => c === "date(utc)") &&
    h.some((c) => c === "pair") &&
    h.some((c) => c === "side");
  if (hasBinance) return "binance";

  const hasKraken =
    h.some((c) => c === "txid") &&
    h.some((c) => c === "time") &&
    h.some((c) => c === "type") &&
    h.some((c) => c === "asset");
  if (hasKraken) return "kraken";

  const hasRobinhood =
    h.some((c) => c === "date") &&
    h.some((c) => c === "transaction type") &&
    h.some((c) => c === "asset name") &&
    h.some((c) => c === "asset symbol");
  if (hasRobinhood) return "robinhood";

  return null;
}

function parseCSVLocally(csvText: string): CsvPreview {
  const rows = parseCSVLinesLocal(csvText);
  if (rows.length < 2) {
    throw new Error("CSV must have a header row and at least one data row");
  }

  const headers = rows[0];
  const format = detectFormatLocal(headers);

  if (!format) {
    throw new Error(
      "Unsupported CSV format. Supported exchanges: Coinbase, Binance, Kraken, Robinhood."
    );
  }

  const dataRows = rows.slice(1);
  const transactions: ParsedTransaction[] = [];

  for (const row of dataRows) {
    try {
      const tx = parseRowLocal(row, headers, format);
      if (tx) transactions.push(tx);
    } catch {
      // skip
    }
  }

  return { format, transactions };
}

function parseRowLocal(
  row: string[],
  headers: string[],
  format: string,
): ParsedTransaction | null {
  const h = headers.map((s) => s.toLowerCase().trim());
  const map: Record<string, string> = {};
  for (let i = 0; i < h.length; i++) {
    map[h[i]] = row[i] ?? "";
  }

  switch (format) {
    case "coinbase":
      return parseCoinbaseLocal(map);
    case "binance":
      return parseBinanceLocal(map);
    case "kraken":
      return parseKrakenLocal(map);
    case "robinhood":
      return parseRobinhoodLocal(map);
    default:
      return null;
  }
}

function parseCoinbaseLocal(map: Record<string, string>): ParsedTransaction | null {
  const rawType = map["transaction type"] ?? "";
  const asset = (map["asset"] ?? "").toUpperCase();
  const amountStr = map["quantity transacted"] ?? "0";
  const usdStr = map["usd subtotal"] ?? "0";
  const feeStr = map["fees"] ?? "0";
  const notes = map["notes"] ?? "";
  const timestamp = map["timestamp"] ?? "";

  if (!asset) return null;

  const type = coinbaseTypeLocal(rawType);
  const amount = Math.abs(parseFloat(amountStr) || 0);
  const amountUsd = parseFloat(usdStr) || 0;
  const fee = parseFloat(feeStr) || 0;

  return {
    tx_date: tryParseDate(timestamp),
    symbol: asset,
    type,
    amount,
    amount_usd: amountUsd,
    price_per_unit: amount > 0 ? amountUsd / amount : 0,
    fee,
    fee_symbol: "",
    exchange_source: "coinbase",
    tx_hash: "",
    notes,
  };
}

function coinbaseTypeLocal(t: string): string {
  const lower = t.toLowerCase().trim();
  if (lower === "buy") return "buy";
  if (lower === "sell") return "sell";
  if (lower === "send") return "send";
  if (lower === "receive") return "receive";
  if (lower.includes("staking")) return "staking_reward";
  if (lower.includes("earn")) return "airdrop";
  if (lower.includes("interest")) return "interest";
  if (lower.includes("fee") || lower.includes("coinbase fee")) return "fee";
  return lower || "transfer";
}

function parseBinanceLocal(map: Record<string, string>): ParsedTransaction | null {
  const pair = map["pair"] ?? "";
  const side = (map["side"] ?? "").toUpperCase();
  const priceStr = map["price"] ?? "0";
  const executedStr = map["executed"] ?? "0";
  const feeStr = map["fee"] ?? "0";
  const totalStr = map["total"] ?? "0";
  const dateStr = map["date(utc)"] ?? "";

  const symbol = extractBaseFromPairLocal(pair);
  if (!symbol) return null;

  const amount = Math.abs(parseFloat(executedStr) || 0);
  const price = parseFloat(priceStr) || 0;
  const fee = parseFloat(feeStr) || 0;
  const total = parseFloat(totalStr) || 0;

  return {
    tx_date: tryParseDate(dateStr),
    symbol,
    type: side === "BUY" ? "buy" : side === "SELL" ? "sell" : side === "DEPOSIT" ? "receive" : side === "WITHDRAW" ? "send" : side.toLowerCase(),
    amount,
    amount_usd: total > 0 ? total : amount * price,
    price_per_unit: price,
    fee,
    fee_symbol: "",
    exchange_source: "binance",
    tx_hash: "",
    notes: pair,
  };
}

const QUOTES = ["USDT", "USDC", "BUSD", "TUSD", "USD", "DAI", "BTC", "ETH", "BNB", "FDUSD"];

function extractBaseFromPairLocal(pair: string): string | null {
  if (!pair) return null;
  const upper = pair.toUpperCase();
  const sorted = [...QUOTES].sort((a, b) => b.length - a.length);
  for (const quote of sorted) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return upper.slice(0, upper.length - quote.length);
    }
  }
  return upper;
}

function parseKrakenLocal(map: Record<string, string>): ParsedTransaction | null {
  const txid = map["txid"] ?? "";
  const timeStr = map["time"] ?? "";
  const typeStr = (map["type"] ?? "").toLowerCase();
  const asset = (map["asset"] ?? "").toUpperCase();
  const amountStr = map["amount"] ?? "0";
  const feeStr = map["fee"] ?? "0";
  const priceStr = map["price"] ?? "0";

  if (!asset) return null;

  const amount = Math.abs(parseFloat(amountStr) || 0);
  const price = parseFloat(priceStr) || 0;
  const fee = parseFloat(feeStr) || 0;

  return {
    tx_date: tryParseDate(timeStr),
    symbol: asset,
    type: typeStr || "transfer",
    amount,
    amount_usd: amount * price,
    price_per_unit: price,
    fee,
    fee_symbol: "",
    exchange_source: "kraken",
    tx_hash: txid,
    notes: "",
  };
}

function parseRobinhoodLocal(map: Record<string, string>): ParsedTransaction | null {
  const dateStr = map["date"] ?? "";
  const rawType = map["transaction type"] ?? "";
  const symbol = (map["asset symbol"] ?? "").toUpperCase();
  const totalSpent = map["total spent (usd)"] ?? "0";
  const feeStr = map["fees (usd)"] ?? "0";
  const quantityStr = map["quantity"] ?? "0";

  if (!symbol) return null;

  const amount = Math.abs(parseFloat(quantityStr) || 0);
  const totalUsd = parseFloat(totalSpent) || 0;
  const fee = parseFloat(feeStr) || 0;
  const netUsd = totalUsd - fee;
  const pricePerUnit = amount > 0 ? netUsd / amount : 0;

  return {
    tx_date: tryParseDate(dateStr),
    symbol,
    type: robinhoodTypeLocal(rawType),
    amount,
    amount_usd: Math.abs(netUsd),
    price_per_unit: Math.abs(pricePerUnit),
    fee,
    fee_symbol: "",
    exchange_source: "robinhood",
    tx_hash: "",
    notes: "",
  };
}

function robinhoodTypeLocal(t: string): string {
  const lower = t.toLowerCase().trim();
  if (lower === "buy") return "buy";
  if (lower === "sell") return "sell";
  if (lower === "transfer") return "transfer";
  if (lower.includes("dividend") || lower.includes("interest")) return "interest";
  return lower || "transfer";
}

function tryParseDate(raw: string): string {
  if (!raw || !raw.trim()) return new Date().toISOString();
  const trimmed = raw.trim();
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString();
  const withT = trimmed.replace(" ", "T");
  const d2 = new Date(withT);
  if (!isNaN(d2.getTime())) return d2.toISOString();
  const parts = trimmed.split(/[/\s-]/);
  if (parts.length >= 3) {
    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
      const d3 = new Date(year, month - 1, day);
      if (!isNaN(d3.getTime())) return d3.toISOString();
    }
  }
  return new Date().toISOString();
}
