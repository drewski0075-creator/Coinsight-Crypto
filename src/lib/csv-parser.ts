/* ------------------------------------------------------------------ */
/*  CSV Parser — exchange transaction import                           */
/*  Supports: Coinbase, Binance, Kraken, Robinhood                     */
/* ------------------------------------------------------------------ */

export interface ParsedTransaction {
  tx_date: string;       // ISO 8601
  symbol: string;        // e.g. "BTC"
  type: string;          // buy, sell, send, receive, staking_reward, airdrop, interest, fee, transfer
  amount: number;        // absolute value (positive)
  amount_usd: number;
  price_per_unit: number;
  fee: number;
  fee_symbol: string;
  exchange_source: string; // "coinbase" | "binance" | "kraken" | "robinhood"
  tx_hash: string;
  notes: string;
}

/* ------------------------------------------------------------------ */
/*  CSV line parser (handles quoted fields, commas in quotes)          */
/* ------------------------------------------------------------------ */
function parseCSVLines(text: string): string[][] {
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
        // skip carriage returns
      } else {
        field += ch;
      }
    }
  }

  // Handle last field (file may not end with newline)
  row.push(field.trim());
  if (row.length > 0 && row.some((f) => f !== "")) {
    rows.push(row);
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/*  Exchange format detection                                          */
/* ------------------------------------------------------------------ */

/** Normalize headers: lowercase + trim each */
function normHeaders(headers: string[]): string[] {
  return headers.map((h) => h.toLowerCase().trim());
}

export function detectExchangeFormat(headers: string[]): string | null {
  const h = normHeaders(headers);

  // Coinbase: has "timestamp", "transaction type", "asset", "quantity transacted"
  const hasCoinbase =
    h.some((c) => c === "timestamp") &&
    h.some((c) => c === "transaction type") &&
    h.some((c) => c === "asset") &&
    h.some((c) => c.includes("quantity"));
  if (hasCoinbase) return "coinbase";

  // Binance: has "date(utc)", "pair", "side"
  const hasBinance =
    h.some((c) => c === "date(utc)") &&
    h.some((c) => c === "pair") &&
    h.some((c) => c === "side");
  if (hasBinance) return "binance";

  // Kraken: has "txid", "time", "type", "asset", "amount"
  const hasKraken =
    h.some((c) => c === "txid") &&
    h.some((c) => c === "time") &&
    h.some((c) => c === "type") &&
    h.some((c) => c === "asset");
  if (hasKraken) return "kraken";

  // Robinhood: has "date", "transaction type", "asset name", "asset symbol"
  const hasRobinhood =
    h.some((c) => c === "date") &&
    h.some((c) => c === "transaction type") &&
    h.some((c) => c === "asset name") &&
    h.some((c) => c === "asset symbol");
  if (hasRobinhood) return "robinhood";

  return null;
}

/* ------------------------------------------------------------------ */
/*  Parse a full CSV text into normalized transactions                 */
/* ------------------------------------------------------------------ */
export function parseCSV(csvText: string): {
  format: string;
  transactions: ParsedTransaction[];
} {
  const rows = parseCSVLines(csvText);
  if (rows.length < 2) {
    throw new Error("CSV must have a header row and at least one data row");
  }

  const headers = rows[0];
  const format = detectExchangeFormat(headers);

  if (!format) {
    throw new Error(
      "Unsupported CSV format. Supported exchanges: Coinbase, Binance, Kraken, Robinhood."
    );
  }

  const dataRows = rows.slice(1);
  const transactions: ParsedTransaction[] = [];

  for (const row of dataRows) {
    try {
      const tx = parseRow(row, headers, format);
      if (tx) transactions.push(tx);
    } catch {
      // Skip malformed rows silently
    }
  }

  return { format, transactions };
}

/* ------------------------------------------------------------------ */
/*  Row-level parsers per exchange                                     */
/* ------------------------------------------------------------------ */

function parseRow(
  row: string[],
  headers: string[],
  format: string,
): ParsedTransaction | null {
  // Build a map: lowercase header -> value
  const map: Record<string, string> = {};
  const h = normHeaders(headers);
  for (let i = 0; i < h.length; i++) {
    map[h[i]] = row[i] ?? "";
  }

  switch (format) {
    case "coinbase":
      return parseCoinbase(map);
    case "binance":
      return parseBinance(map);
    case "kraken":
      return parseKraken(map);
    case "robinhood":
      return parseRobinhood(map);
    default:
      return null;
  }
}

/* ---------- Coinbase ---------- */
function parseCoinbase(map: Record<string, string>): ParsedTransaction | null {
  const rawType = map["transaction type"] ?? "";
  const asset = (map["asset"] ?? "").toUpperCase();
  const amountStr = map["quantity transacted"] ?? "0";
  const usdStr = map["usd subtotal"] ?? "0";
  const feeStr = map["fees"] ?? "0";
  const notes = map["notes"] ?? "";
  const timestamp = map["timestamp"] ?? "";

  if (!asset) return null;

  const type = coinbaseType(rawType);
  const amount = Math.abs(parseFloat(amountStr) || 0);
  const amountUsd = parseFloat(usdStr) || 0;
  const fee = parseFloat(feeStr) || 0;

  return {
    tx_date: parseDate(timestamp),
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

function coinbaseType(t: string): string {
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

/* ---------- Binance ---------- */
function parseBinance(map: Record<string, string>): ParsedTransaction | null {
  const pair = map["pair"] ?? "";
  const side = (map["side"] ?? "").toUpperCase();
  const priceStr = map["price"] ?? "0";
  const executedStr = map["executed"] ?? "0";
  const feeStr = map["fee"] ?? "0";
  const totalStr = map["total"] ?? "0";
  const dateStr = map["date(utc)"] ?? "";

  const symbol = extractBaseFromPair(pair);
  if (!symbol) return null;

  const amount = Math.abs(parseFloat(executedStr) || 0);
  const price = parseFloat(priceStr) || 0;
  const fee = parseFloat(feeStr) || 0;
  const total = parseFloat(totalStr) || 0;

  const type = binanceType(side);

  return {
    tx_date: parseDate(dateStr),
    symbol,
    type,
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

function binanceType(side: string): string {
  if (side === "BUY") return "buy";
  if (side === "SELL") return "sell";
  if (side === "DEPOSIT") return "receive";
  if (side === "WITHDRAW") return "send";
  return side.toLowerCase();
}

/* Known quote currencies for Binance pair extraction */
const QUOTE_CURRENCIES = [
  "USDT", "USDC", "BUSD", "TUSD", "USD", "DAI",
  "BTC", "ETH", "BNB", "FDUSD",
];

function extractBaseFromPair(pair: string): string | null {
  if (!pair) return null;
  const upper = pair.toUpperCase();

  // Sort by length descending so we match "USDT" before "USD"
  const sorted = [...QUOTE_CURRENCIES].sort((a, b) => b.length - a.length);

  for (const quote of sorted) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return upper.slice(0, upper.length - quote.length);
    }
  }

  // Fallback: return the whole pair
  return upper;
}

/* ---------- Kraken ---------- */
function parseKraken(map: Record<string, string>): ParsedTransaction | null {
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
    tx_date: parseDate(timeStr),
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

/* ---------- Robinhood ---------- */
function parseRobinhood(map: Record<string, string>): ParsedTransaction | null {
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
    tx_date: parseDate(dateStr),
    symbol,
    type: robinhoodType(rawType),
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

function robinhoodType(t: string): string {
  const lower = t.toLowerCase().trim();
  if (lower === "buy") return "buy";
  if (lower === "sell") return "sell";
  if (lower === "transfer") return "transfer";
  if (lower.includes("dividend") || lower.includes("interest")) return "interest";
  return lower || "transfer";
}

/* ------------------------------------------------------------------ */
/*  Date parsing helpers                                               */
/* ------------------------------------------------------------------ */

function parseDate(raw: string): string {
  if (!raw || !raw.trim()) return new Date().toISOString();

  const trimmed = raw.trim();

  // Try parsing as-is
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString();

  // Coinbase format: "2024-01-15T10:30:00Z" — should work natively
  // Binance format: "2024-01-15 10:30:00" — replace space with T
  const withT = trimmed.replace(" ", "T");
  const d2 = new Date(withT);
  if (!isNaN(d2.getTime())) return d2.toISOString();

  // Robinhood format: "01/15/2024" or "01/15/2024 10:30:00"
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
