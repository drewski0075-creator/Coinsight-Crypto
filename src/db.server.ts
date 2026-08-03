import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";

/* ------------------------------------------------------------------ */
/*  SQLite database setup (using Bun's built-in sqlite)                */
/* ------------------------------------------------------------------ */
const DB_PATH = path.join(process.cwd(), "data", "coinsight.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_pro INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migration: add is_max column to users if it doesn't exist (non-destructive)
let userColumns =
  db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
if (!userColumns.some((c) => c.name === "is_max")) {
  db.run("ALTER TABLE users ADD COLUMN is_max INTEGER DEFAULT 0");
}
db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    coin_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    coin_name TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Migration: add source column if it doesn't exist
let columns =
  db.prepare("PRAGMA table_info(holdings)").all() as { name: string }[];
if (!columns.some((c) => c.name === "source")) {
  db.run("ALTER TABLE holdings ADD COLUMN source TEXT DEFAULT 'manual'");
}

// Portfolios table
db.run(`
  CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Migration: add portfolio_id, cost_basis, purchase_price to holdings
columns =
  db.prepare("PRAGMA table_info(holdings)").all() as { name: string }[];
if (!columns.some((c) => c.name === "portfolio_id")) {
  db.run("ALTER TABLE holdings ADD COLUMN portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE SET NULL");
}
if (!columns.some((c) => c.name === "cost_basis")) {
  db.run("ALTER TABLE holdings ADD COLUMN cost_basis REAL DEFAULT 0");
}
if (!columns.some((c) => c.name === "purchase_price")) {
  db.run("ALTER TABLE holdings ADD COLUMN purchase_price REAL DEFAULT 0");
}

// Migration: Create default portfolios for existing users who have holdings but no portfolio
const usersNeedingPortfolio = db
  .prepare(
    `SELECT DISTINCT u.id FROM users u
     INNER JOIN holdings h ON h.user_id = u.id
     WHERE h.portfolio_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM portfolios p WHERE p.user_id = u.id)`
  )
  .all() as { id: number }[];

const insertPortfolio = db.prepare(
  "INSERT INTO portfolios (user_id, name, is_default) VALUES (?, 'Default', 1)"
);

for (const row of usersNeedingPortfolio) {
  const result = insertPortfolio.run(row.id);
  const portfolioId = Number(result.lastInsertRowid);
  db.prepare("UPDATE holdings SET portfolio_id = ?, cost_basis = 0, purchase_price = 0 WHERE user_id = ? AND portfolio_id IS NULL")
    .run(portfolioId, row.id);
}

// Also ensure ALL existing holdings have cost_basis/purchase_price set to 0
db.run("UPDATE holdings SET cost_basis = 0 WHERE cost_basis IS NULL");
db.run("UPDATE holdings SET purchase_price = 0 WHERE purchase_price IS NULL");

// Alerts table
db.run(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    coin_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    target_price REAL NOT NULL,
    direction TEXT NOT NULL DEFAULT 'above',
    active INTEGER DEFAULT 1,
    triggered INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Wallet addresses table
db.run(`
  CREATE TABLE IF NOT EXISTS wallet_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    address TEXT NOT NULL,
    blockchain TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    last_synced_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Migration: track wallet balance freshness for existing address-book entries
let walletColumns = db.prepare("PRAGMA table_info(wallet_addresses)").all() as { name: string }[];
if (!walletColumns.some((c) => c.name === "last_synced_at")) {
  db.run("ALTER TABLE wallet_addresses ADD COLUMN last_synced_at TEXT");
}

// Add unique constraint on (user_id, address) — ignore if exists
try {
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_user_address ON wallet_addresses(user_id, address)");
} catch { /* index may already exist */ }

// Exchange holdings table (manual entries for exchange-held crypto)
db.run(`
  CREATE TABLE IF NOT EXISTS exchange_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    amount REAL NOT NULL,
    exchange_name TEXT NOT NULL,
    cost_basis REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Transactions table
db.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    coin_id TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    amount_usd REAL NOT NULL DEFAULT 0,
    price_per_unit REAL NOT NULL DEFAULT 0,
    fee REAL NOT NULL DEFAULT 0,
    fee_symbol TEXT NOT NULL DEFAULT '',
    exchange_source TEXT NOT NULL DEFAULT '',
    tx_hash TEXT NOT NULL DEFAULT '',
    tx_date TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Index on (user_id, tx_date) for fast lookups
try {
  db.run("CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, tx_date)");
} catch { /* index may already exist */ }

// Unique constraint for dedup
try {
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_dedup ON transactions(user_id, exchange_source, tx_date, symbol, type, amount)");
} catch { /* index may already exist */ }

// Migration: add realized_pnl column to transactions if it doesn't exist (nullable —
// NULL means the sell has not been matched against FIFO lots yet)
let txColumns =
  db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
if (!txColumns.some((c) => c.name === "realized_pnl")) {
  db.run("ALTER TABLE transactions ADD COLUMN realized_pnl REAL");
}

// Lots table — FIFO cost-basis lots created on buys, consumed on sells
db.run(`
  CREATE TABLE IF NOT EXISTS lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    coin_id TEXT,
    amount REAL NOT NULL,
    cost_basis REAL NOT NULL,
    purchase_price REAL,
    purchase_date TEXT,
    source_tx_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Index on (user_id, symbol, purchase_date) for fast FIFO lookups
try {
  db.run("CREATE INDEX IF NOT EXISTS idx_lots_user_symbol_date ON lots(user_id, symbol, purchase_date)");
} catch { /* index may already exist */ }

// Password reset tokens table
db.run(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

export default db;

/* ------------------------------------------------------------------ */
/*  Transaction helpers                                                 */
/* ------------------------------------------------------------------ */
export interface Transaction {
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
}

export function getTransactions(userId: number): Transaction[] {
  return db
    .prepare(
      "SELECT * FROM transactions WHERE user_id = ? ORDER BY tx_date DESC",
    )
    .all(userId) as Transaction[];
}

export function addTransaction(
  userId: number,
  tx: Omit<Transaction, "id" | "user_id" | "created_at">,
): Transaction | null {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO transactions
     (user_id, symbol, coin_id, type, amount, amount_usd, price_per_unit,
      fee, fee_symbol, exchange_source, tx_hash, tx_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const result = stmt.run(
    userId,
    tx.symbol,
    tx.coin_id,
    tx.type,
    tx.amount,
    tx.amount_usd,
    tx.price_per_unit,
    tx.fee,
    tx.fee_symbol,
    tx.exchange_source,
    tx.tx_hash,
    tx.tx_date,
    tx.notes,
  );

  if (result.changes === 0) return null; // duplicate, skipped

  const inserted = db
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Transaction;

  // Maintain FIFO lots + realized P&L for this symbol
  recomputeFIFOForSymbol(userId, inserted.symbol);

  return inserted;
}

export function addTransactionsBatch(
  userId: number,
  txs: Omit<Transaction, "id" | "user_id" | "created_at">[],
): { inserted: number; skipped: number; total: number } {
  let inserted = 0;
  let skipped = 0;

  const insertBatch = db.transaction((txs: Omit<Transaction, "id" | "user_id" | "created_at">[]) => {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO transactions
       (user_id, symbol, coin_id, type, amount, amount_usd, price_per_unit,
        fee, fee_symbol, exchange_source, tx_hash, tx_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const tx of txs) {
      const result = stmt.run(
        userId,
        tx.symbol,
        tx.coin_id,
        tx.type,
        tx.amount,
        tx.amount_usd,
        tx.price_per_unit,
        tx.fee,
        tx.fee_symbol,
        tx.exchange_source,
        tx.tx_hash,
        tx.tx_date,
        tx.notes,
      );
      if (result.changes > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }
  });

  insertBatch(txs);

  // Rebuild FIFO lots + realized P&L for every symbol touched by this import.
  // Recomputing per symbol (instead of inline) keeps ordering correct even when
  // buys and sells are interleaved in the file.
  const symbols = [...new Set(txs.map((t) => t.symbol.toUpperCase()))];
  for (const sym of symbols) {
    recomputeFIFOForSymbol(userId, sym);
  }

  return { inserted, skipped, total: inserted + skipped };
}

export function deleteTransaction(userId: number, txId: number): boolean {
  const row = db
    .prepare("SELECT user_id, symbol FROM transactions WHERE id = ? AND user_id = ?")
    .get(txId, userId) as { user_id: number; symbol: string } | undefined;
  if (!row) return false;

  const result = db
    .prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?")
    .run(txId, userId);

  if (result.changes > 0) {
    // Rebuild FIFO lots + realized P&L so deleting a buy (removes its lot) or
    // a sell (restores consumed lots) keeps the lot ledger consistent.
    recomputeFIFOForSymbol(userId, row.symbol);
  }
  return result.changes > 0;
}

/* ------------------------------------------------------------------ */
/*  FIFO lot helpers (CoinSight Max)                                    */
/* ------------------------------------------------------------------ */
export interface Lot {
  id: number;
  user_id: number;
  symbol: string;
  coin_id: string | null;
  amount: number;
  cost_basis: number;
  purchase_price: number | null;
  purchase_date: string | null;
  source_tx_id: number | null;
  created_at: string;
}

export function createLot(
  userId: number,
  symbol: string,
  coinId: string | null,
  amount: number,
  costBasis: number,
  purchasePrice: number | null,
  purchaseDate: string | null,
  sourceTxId: number | null,
): Lot | null {
  if (!amount || amount <= 0) return null;
  const result = db
    .prepare(
      `INSERT INTO lots (user_id, symbol, coin_id, amount, cost_basis, purchase_price, purchase_date, source_tx_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, symbol.toUpperCase(), coinId, amount, costBasis, purchasePrice, purchaseDate, sourceTxId);
  return db
    .prepare("SELECT * FROM lots WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Lot;
}

export function getLots(userId: number): Lot[] {
  return db
    .prepare(
      "SELECT * FROM lots WHERE user_id = ? ORDER BY purchase_date ASC, id ASC",
    )
    .all(userId) as Lot[];
}

export function getLotsBySymbol(userId: number, symbol: string): Lot[] {
  return db
    .prepare(
      "SELECT * FROM lots WHERE user_id = ? AND symbol = ? ORDER BY purchase_date ASC, id ASC",
    )
    .all(userId, symbol.toUpperCase()) as Lot[];
}

/** Reduce a lot's remaining amount (and cost basis proportionally). */
export function consumeLot(lotId: number, amount: number): boolean {
  const lot = db
    .prepare("SELECT * FROM lots WHERE id = ?")
    .get(lotId) as Lot | undefined;
  if (!lot || amount <= 0) return false;

  const remaining = lot.amount - amount;
  if (remaining <= 1e-9) {
    // Depleted — remove the lot entirely
    db.prepare("DELETE FROM lots WHERE id = ?").run(lotId);
    return true;
  }
  // Scale cost basis down proportionally to the remaining amount
  const newCost = lot.cost_basis * (remaining / lot.amount);
  db.prepare("UPDATE lots SET amount = ?, cost_basis = ? WHERE id = ?").run(
    remaining,
    newCost,
    lotId,
  );
  return true;
}

/**
 * Consume lots FIFO (oldest purchase date first) to match a sell.
 * Returns the consumed lot segments for realized P&L computation.
 */
export function consumeLotsFIFO(
  userId: number,
  symbol: string,
  sellAmount: number,
): { lotId: number; consumedAmount: number; costBasis: number }[] {
  const lots = getLotsBySymbol(userId, symbol);
  const consumed: { lotId: number; consumedAmount: number; costBasis: number }[] = [];

  let remainingToSell = sellAmount;
  for (const lot of lots) {
    if (remainingToSell <= 0) break;
    const take = Math.min(lot.amount, remainingToSell);
    const takeCost = lot.cost_basis * (take / lot.amount);
    consumed.push({ lotId: lot.id, consumedAmount: take, costBasis: takeCost });
    consumeLot(lot.id, take);
    remainingToSell -= take;
  }

  // Any amount we couldn't match to a lot has zero cost basis
  if (remainingToSell > 1e-9) {
    consumed.push({
      lotId: -1,
      consumedAmount: remainingToSell,
      costBasis: 0,
    });
  }

  return consumed;
}

/**
 * Rebuild FIFO lots and realized P&L for one user/symbol from the full
 * transaction history. Idempotent — used after inserts, imports, and deletes.
 */
export function recomputeFIFOForSymbol(userId: number, symbol: string): void {
  const sym = symbol.toUpperCase();
  const txs = db
    .prepare(
      "SELECT * FROM transactions WHERE user_id = ? AND symbol = ? ORDER BY tx_date ASC, id ASC",
    )
    .all(userId, sym) as Transaction[];

  // Wipe existing lots for this user/symbol and rebuild from scratch
  db.prepare("DELETE FROM lots WHERE user_id = ? AND symbol = ?").run(userId, sym);

  for (const tx of txs) {
    const type = tx.type.toLowerCase();
    if (type === "buy") {
      createLot(userId, sym, tx.coin_id, tx.amount, tx.amount_usd, tx.price_per_unit, tx.tx_date, tx.id);
    } else if (type === "sell") {
      const consumed = consumeLotsFIFO(userId, sym, tx.amount);
      const costBasis = consumed.reduce((sum, c) => sum + c.costBasis, 0);
      const proceeds = Number(tx.amount_usd) || Number(tx.amount) * Number(tx.price_per_unit) || 0;
      const realizedPnl = proceeds - costBasis;
      db.prepare("UPDATE transactions SET realized_pnl = ? WHERE id = ?").run(
        realizedPnl,
        tx.id,
      );
    }
  }
}

/** Realized P&L summary from sell transactions matched against FIFO lots. */
export function getRealizedPnLSummary(
  userId: number,
): { symbol: string; soldAmount: number; proceeds: number; costBasis: number; realizedPnl: number }[] {
  return db
    .prepare(
      `SELECT symbol,
              SUM(amount) as soldAmount,
              SUM(amount_usd) as proceeds,
              SUM(COALESCE(amount_usd, 0) - COALESCE(realized_pnl, 0)) as costBasis,
              SUM(COALESCE(realized_pnl, 0)) as realizedPnl
       FROM transactions
       WHERE user_id = ? AND LOWER(type) = 'sell'
       GROUP BY symbol
       ORDER BY symbol`,
    )
    .all(userId) as any[];
}

/* ------------------------------------------------------------------ */
/*  Position audit (CoinSight Max)                                      */
/* ------------------------------------------------------------------ */
export interface AuditConsumedLot {
  lotDate: string | null;
  amount: number;
  costBasis: number;
}

export interface AuditTraceRow {
  tx: Transaction;
  runningBalance: number;
  consumedLots: AuditConsumedLot[];
}

export interface AuditLot {
  purchaseDate: string | null;
  originalAmount: number;
  remainingAmount: number;
  originalCostBasis: number;
  remainingCostBasis: number;
  purchasePrice: number | null;
  source: string;
}

export interface AuditLotEvent {
  date: string;
  kind: "created" | "consumed";
  amount: number;
  costBasis: number;
}

export interface PositionAudit {
  symbol: string;
  trace: AuditTraceRow[];
  lots: AuditLot[];
  lotEvents: AuditLotEvent[];
  netBalance: number;
}

/**
 * Reconstructs the full audit trail for one asset: every transaction in
 * chronological order with the running balance after each, the FIFO lot
 * lifecycle (created on buys, consumed on sells), and the per-lot
 * original/remaining amounts. Uses the same buy/sell FIFO semantics as
 * recomputeFIFOForSymbol so the numbers always match the lots table.
 */
export function getPositionAudit(userId: number, symbol: string): PositionAudit | null {
  const sym = symbol.toUpperCase();
  const txs = db
    .prepare(
      "SELECT * FROM transactions WHERE user_id = ? AND symbol = ? ORDER BY tx_date ASC, id ASC",
    )
    .all(userId, sym) as Transaction[];
  if (txs.length === 0) return null;

  const ADDS = new Set(["buy", "receive", "staking_reward", "airdrop", "interest", "transfer"]);
  const SUBS = new Set(["sell", "send", "fee"]);

  // Open FIFO lots (oldest first). Mirrors consumeLotsFIFO but non-destructive.
  const open: {
    buyTxId: number;
    date: string | null;
    amount: number;
    costBasis: number;
    price: number | null;
    source: string;
  }[] = [];
  const lotOrigins = new Map<
    number,
    { date: string | null; amount: number; costBasis: number; price: number | null; source: string }
  >();
  const lotEvents: AuditLotEvent[] = [];
  const trace: AuditTraceRow[] = [];
  let running = 0;

  for (const tx of txs) {
    const type = tx.type.toLowerCase();
    if (ADDS.has(type)) running += tx.amount;
    else if (SUBS.has(type)) running -= tx.amount;

    const source = tx.exchange_source || "manual";

    if (type === "buy") {
      const orig = {
        date: tx.tx_date,
        amount: tx.amount,
        costBasis: Number(tx.amount_usd) || 0,
        price: tx.price_per_unit || null,
        source,
      };
      open.push({ buyTxId: tx.id, ...orig });
      lotOrigins.set(tx.id, orig);
      lotEvents.push({ date: tx.tx_date, kind: "created", amount: tx.amount, costBasis: orig.costBasis });
      trace.push({ tx, runningBalance: running, consumedLots: [] });
    } else if (type === "sell") {
      const consumedLots: AuditConsumedLot[] = [];
      let remaining = tx.amount;
      while (remaining > 1e-9 && open.length > 0) {
        const lot = open[0];
        const take = Math.min(lot.amount, remaining);
        const takeCost = lot.costBasis * (take / lot.amount);
        consumedLots.push({ lotDate: lot.date, amount: take, costBasis: takeCost });
        lot.amount -= take;
        lot.costBasis -= takeCost;
        remaining -= take;
        if (lot.amount <= 1e-9) open.shift();
        lotEvents.push({ date: tx.tx_date, kind: "consumed", amount: take, costBasis: takeCost });
      }
      if (remaining > 1e-9) {
        // Sold more than we ever bought — zero cost basis for the remainder
        lotEvents.push({ date: tx.tx_date, kind: "consumed", amount: remaining, costBasis: 0 });
      }
      trace.push({ tx, runningBalance: running, consumedLots });
    } else {
      trace.push({ tx, runningBalance: running, consumedLots: [] });
    }
  }

  // Per-lot listing: every buy that ever created a lot, with original vs remaining.
  const lots: AuditLot[] = [...lotOrigins.entries()].map(([buyTxId, orig]) => {
    const openLot = open.find((l) => l.buyTxId === buyTxId);
    return {
      purchaseDate: orig.date,
      originalAmount: orig.amount,
      remainingAmount: openLot?.amount ?? 0,
      originalCostBasis: orig.costBasis,
      remainingCostBasis: openLot?.costBasis ?? 0,
      purchasePrice: orig.price,
      source: orig.source,
    };
  });

  return { symbol: sym, trace, lots, lotEvents, netBalance: running };
}

/* ------------------------------------------------------------------ */
/*  User helpers                                                       */
/* ------------------------------------------------------------------ */
export interface User {
  id: number;
  email: string;
  is_pro: number;
  is_max: number;
  created_at: string;
}

export function createUser(
  email: string,
  passwordHash: string,
): User {
  const stmt = db.prepare(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)",
  );
  const result = stmt.run(email, passwordHash);
  return {
    id: Number(result.lastInsertRowid),
    email,
    is_pro: 0,
    is_max: 0,
    created_at: new Date().toISOString(),
  };
}

export function getUserByEmail(
  email: string,
): (User & { password_hash: string }) | undefined {
  return db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email) as any;
}

export function getUserById(id: number): User | undefined {
  return db.prepare("SELECT id, email, is_pro, is_max, created_at FROM users WHERE id = ?").get(id) as any;
}

export function setUserPro(userId: number, isPro: boolean): void {
  db.prepare("UPDATE users SET is_pro = ? WHERE id = ?").run(
    isPro ? 1 : 0,
    userId,
  );
}

/** Activate (or deactivate) the Max tier. Max always implies Pro. */
export function setUserMax(userId: number, isMax: boolean): void {
  if (isMax) {
    db.prepare("UPDATE users SET is_max = 1, is_pro = 1 WHERE id = ?").run(userId);
  } else {
    db.prepare("UPDATE users SET is_max = 0 WHERE id = ?").run(userId);
  }
}

export function isUserMax(userId: number): boolean {
  const row = db
    .prepare("SELECT is_max FROM users WHERE id = ?")
    .get(userId) as { is_max: number } | undefined;
  return row?.is_max === 1;
}

/* ------------------------------------------------------------------ */
/*  Session helpers                                                    */
/* ------------------------------------------------------------------ */
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createSession(userId: number): string {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString();
  db.prepare(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
  ).run(userId, token, expiresAt);
  // Clean up expired sessions
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(
    new Date().toISOString(),
  );
  return token;
}

export function validateSession(token: string): User | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.is_pro, u.is_max, u.created_at
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, new Date().toISOString()) as User | undefined;
  return row ?? null;
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/* ------------------------------------------------------------------ */
/*  Holdings helpers                                                   */
/* ------------------------------------------------------------------ */
export interface Holding {
  id: number;
  user_id: number;
  coin_id: string;
  symbol: string;
  coin_name: string;
  amount: number;
  source: string;
  portfolio_id: number | null;
  cost_basis: number;
  purchase_price: number;
  created_at: string;
}

export function getUserHoldings(userId: number): Holding[] {
  return db
    .prepare(
      "SELECT id, user_id, coin_id, symbol, coin_name, amount, COALESCE(source,'manual') as source, portfolio_id, COALESCE(cost_basis,0) as cost_basis, COALESCE(purchase_price,0) as purchase_price, created_at FROM holdings WHERE user_id = ? ORDER BY created_at",
    )
    .all(userId) as Holding[];
}

export function getHoldingsByPortfolio(userId: number, portfolioId: number): Holding[] {
  return db
    .prepare(
      "SELECT id, user_id, coin_id, symbol, coin_name, amount, COALESCE(source,'manual') as source, portfolio_id, COALESCE(cost_basis,0) as cost_basis, COALESCE(purchase_price,0) as purchase_price, created_at FROM holdings WHERE user_id = ? AND portfolio_id = ? ORDER BY created_at",
    )
    .all(userId, portfolioId) as Holding[];
}

export function addHolding(
  userId: number,
  coinId: string,
  symbol: string,
  coinName: string,
  amount: number,
  source: string = "manual",
  portfolioId?: number,
  costBasis?: number,
  purchasePrice?: number,
): Holding {
  // Only merge with existing holding of the same source AND same portfolio
  const existing = db
    .prepare(
      "SELECT * FROM holdings WHERE user_id = ? AND symbol = ? AND COALESCE(source,'manual') = ? AND portfolio_id IS ?",
    )
    .get(userId, symbol, source, portfolioId ?? null) as Holding | undefined;

  if (existing) {
    // Update amount and recalculate cost basis (weighted average)
    const newAmount = existing.amount + amount;
    const existingTotalCost = existing.amount * existing.purchase_price;
    const newTotalCost = amount * (purchasePrice ?? 0);
    const avgPrice = newAmount > 0 ? (existingTotalCost + newTotalCost) / newAmount : 0;
    const totalCostBasis = (existing.cost_basis ?? 0) + (costBasis ?? 0);

    db.prepare(
      "UPDATE holdings SET amount = ?, cost_basis = ?, purchase_price = ? WHERE id = ?"
    ).run(newAmount, totalCostBasis, avgPrice, existing.id);
    return {
      ...existing,
      amount: newAmount,
      cost_basis: totalCostBasis,
      purchase_price: avgPrice,
    };
  }

  const result = db
    .prepare(
      "INSERT INTO holdings (user_id, coin_id, symbol, coin_name, amount, source, portfolio_id, cost_basis, purchase_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(userId, coinId, symbol, coinName, amount, source, portfolioId ?? null, costBasis ?? 0, purchasePrice ?? 0);
  return {
    id: Number(result.lastInsertRowid),
    user_id: userId,
    coin_id: coinId,
    symbol,
    coin_name: coinName,
    amount,
    source,
    portfolio_id: portfolioId ?? null,
    cost_basis: costBasis ?? 0,
    purchase_price: purchasePrice ?? 0,
    created_at: new Date().toISOString(),
  };
}

export function removeHolding(holdingId: number, userId: number): boolean {
  const result = db
    .prepare("DELETE FROM holdings WHERE id = ? AND user_id = ?")
    .run(holdingId, userId);
  return result.changes > 0;
}

export function clearHoldings(userId: number): void {
  db.prepare("DELETE FROM holdings WHERE user_id = ?").run(userId);
}

export function getHoldingCount(userId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM holdings WHERE user_id = ?")
    .get(userId) as any;
  return row.count;
}

/* ------------------------------------------------------------------ */
/*  Alert helpers                                                        */
/* ------------------------------------------------------------------ */
export interface Alert {
  id: number;
  user_id: number;
  coin_id: string;
  symbol: string;
  target_price: number;
  direction: string;
  active: number;
  triggered: number;
  created_at: string;
}

export function getAlerts(userId: number): Alert[] {
  return db
    .prepare(
      "SELECT * FROM alerts WHERE user_id = ? AND active = 1 ORDER BY created_at DESC",
    )
    .all(userId) as Alert[];
}

export function createAlert(
  userId: number,
  coinId: string,
  symbol: string,
  targetPrice: number,
  direction: string,
): Alert {
  const result = db
    .prepare(
      "INSERT INTO alerts (user_id, coin_id, symbol, target_price, direction) VALUES (?, ?, ?, ?, ?)",
    )
    .run(userId, coinId, symbol, targetPrice, direction);
  return {
    id: Number(result.lastInsertRowid),
    user_id: userId,
    coin_id: coinId,
    symbol,
    target_price: targetPrice,
    direction,
    active: 1,
    triggered: 0,
    created_at: new Date().toISOString(),
  };
}

export function deleteAlert(alertId: number, userId: number): boolean {
  const result = db
    .prepare("DELETE FROM alerts WHERE id = ? AND user_id = ?")
    .run(alertId, userId);
  return result.changes > 0;
}

export function markTriggered(alertId: number): void {
  db.prepare("UPDATE alerts SET triggered = 1, active = 0 WHERE id = ?").run(
    alertId,
  );
}

/* ------------------------------------------------------------------ */
/*  Watchlist helpers                                                   */
/* ------------------------------------------------------------------ */
export interface WatchlistEntry {
  id: number;
  user_id: number;
  coin_id: string;
  symbol: string;
  coin_name: string;
  position: number;
}

// Create watchlist table
db.run(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    coin_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    coin_name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

export function getWatchlist(userId: number): WatchlistEntry[] {
  return db
    .prepare(
      "SELECT * FROM watchlist WHERE user_id = ? ORDER BY position, id",
    )
    .all(userId) as WatchlistEntry[];
}

export function addToWatchlist(
  userId: number,
  coinId: string,
  symbol: string,
  coinName: string,
): WatchlistEntry | null {
  // Check limit (max 10)
  const count = db
    .prepare("SELECT COUNT(*) as count FROM watchlist WHERE user_id = ?")
    .get(userId) as any;
  if (count.count >= 10) return null;

  // Check duplicate
  const existing = db
    .prepare("SELECT * FROM watchlist WHERE user_id = ? AND coin_id = ?")
    .get(userId, coinId) as WatchlistEntry | undefined;
  if (existing) return existing;

  // Get next position
  const maxPos = db
    .prepare("SELECT MAX(position) as maxPos FROM watchlist WHERE user_id = ?")
    .get(userId) as any;
  const nextPos = (maxPos?.maxPos ?? -1) + 1;

  const result = db
    .prepare(
      "INSERT INTO watchlist (user_id, coin_id, symbol, coin_name, position) VALUES (?, ?, ?, ?, ?)",
    )
    .run(userId, coinId, symbol, coinName, nextPos);

  return {
    id: Number(result.lastInsertRowid),
    user_id: userId,
    coin_id: coinId,
    symbol,
    coin_name: coinName,
    position: nextPos,
  };
}

export function removeFromWatchlist(id: number, userId: number): boolean {
  const result = db
    .prepare("DELETE FROM watchlist WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}

/* ------------------------------------------------------------------ */
/*  Wallet holdings sync                                                */
/* ------------------------------------------------------------------ */

export function markWalletsSynced(userId: number, addresses: string[]): void {
  if (!addresses.length) return;
  const stmt = db.prepare("UPDATE wallet_addresses SET last_synced_at = ? WHERE user_id = ? AND address = ?");
  const now = new Date().toISOString();
  for (const address of addresses) stmt.run(now, userId, address);
}

export function syncWalletHoldings(
  userId: number,
  walletHoldings: { coinId: string; symbol: string; coinName: string; amount: number }[],
  walletSource: string = "wallet",
): void {
  const source = `wallet:${walletSource}`;

  // Ensure default portfolio exists
  let portfolioId = getDefaultPortfolio(userId)?.id;
  if (!portfolioId) {
    portfolioId = createPortfolio(userId, "Default", true).id;
  }

  // Delete all existing wallet-sourced holdings for this user
  db.prepare(
    "DELETE FROM holdings WHERE user_id = ? AND COALESCE(source,'manual') LIKE 'wallet%'",
  ).run(userId);

  // Insert new wallet holdings
  const stmt = db.prepare(
    "INSERT INTO holdings (user_id, coin_id, symbol, coin_name, amount, source, portfolio_id, cost_basis, purchase_price) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)",
  );

  for (const h of walletHoldings) {
    if (h.amount > 0) {
      stmt.run(userId, h.coinId, h.symbol, h.coinName, h.amount, source, portfolioId);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Portfolio helpers                                                   */
/* ------------------------------------------------------------------ */
export interface Portfolio {
  id: number;
  user_id: number;
  name: string;
  is_default: number;
  created_at: string;
}

export function getPortfolios(userId: number): Portfolio[] {
  return db
    .prepare(
      "SELECT * FROM portfolios WHERE user_id = ? ORDER BY is_default DESC, created_at ASC",
    )
    .all(userId) as Portfolio[];
}

export function getDefaultPortfolio(userId: number): Portfolio | undefined {
  return db
    .prepare("SELECT * FROM portfolios WHERE user_id = ? AND is_default = 1 LIMIT 1")
    .get(userId) as Portfolio | undefined;
}

export function createPortfolio(
  userId: number,
  name: string,
  isDefault: boolean = false,
): Portfolio {
  // Free tier: max 1 portfolio
  const user = db.prepare("SELECT is_pro FROM users WHERE id = ?").get(userId) as any;
  if (!user || !user.is_pro) {
    const count = db
      .prepare("SELECT COUNT(*) as count FROM portfolios WHERE user_id = ?")
      .get(userId) as any;
    if (count.count >= 1) {
      throw new Error("Free tier limited to 1 portfolio. Upgrade to Pro for unlimited portfolios.");
    }
  }

  const result = db
    .prepare(
      "INSERT INTO portfolios (user_id, name, is_default) VALUES (?, ?, ?)",
    )
    .run(userId, name, isDefault ? 1 : 0);
  return {
    id: Number(result.lastInsertRowid),
    user_id: userId,
    name,
    is_default: isDefault ? 1 : 0,
    created_at: new Date().toISOString(),
  };
}

export function renamePortfolio(
  portfolioId: number,
  userId: number,
  name: string,
): boolean {
  const result = db
    .prepare("UPDATE portfolios SET name = ? WHERE id = ? AND user_id = ?")
    .run(name, portfolioId, userId);
  return result.changes > 0;
}

export function deletePortfolio(
  portfolioId: number,
  userId: number,
): { success: boolean; error?: string } {
  const portfolio = db
    .prepare("SELECT * FROM portfolios WHERE id = ? AND user_id = ?")
    .get(portfolioId, userId) as Portfolio | undefined;

  if (!portfolio) return { success: false, error: "Portfolio not found" };
  if (portfolio.is_default) {
    return { success: false, error: "Cannot delete the default portfolio" };
  }

  // Delete holdings in this portfolio
  db.prepare("DELETE FROM holdings WHERE portfolio_id = ? AND user_id = ?").run(
    portfolioId,
    userId,
  );
  // Delete the portfolio
  db.prepare("DELETE FROM portfolios WHERE id = ? AND user_id = ?").run(
    portfolioId,
    userId,
  );
  return { success: true };
}

export function getPortfolioPnL(
  userId: number,
  portfolioId: number,
): { symbol: string; amount: number; cost_basis: number; purchase_price: number }[] {
  return db
    .prepare(
      `SELECT symbol, amount, COALESCE(cost_basis,0) as cost_basis, COALESCE(purchase_price,0) as purchase_price
       FROM holdings
       WHERE user_id = ? AND portfolio_id = ?
       ORDER BY symbol`,
    )
    .all(userId, portfolioId) as any[];
}

export interface DataHealth {
  costBasisCoverage: { tracked: number; total: number };
  fifoReconciliation: { matched: number; total: number };
  walletFreshness: { synced: number; total: number; oldestSync: string | null };
  dataCompleteness: { pct: number };
  overall: "high" | "attention" | "unverified";
}

export function getDataHealth(userId: number): DataHealth {
  const basis = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN COALESCE(cost_basis,0) > 0 THEN 1 ELSE 0 END) as tracked FROM holdings WHERE user_id = ?").get(userId) as any;
  const sells = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN realized_pnl IS NOT NULL THEN 1 ELSE 0 END) as matched FROM transactions WHERE user_id = ? AND lower(type) = 'sell'").get(userId) as any;
  const wallets = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN last_synced_at IS NOT NULL THEN 1 ELSE 0 END) as synced, MIN(last_synced_at) as oldestSync FROM wallet_addresses WHERE user_id = ?").get(userId) as any;
  const tracked = Number(basis.tracked || 0), total = Number(basis.total || 0), matched = Number(sells.matched || 0), sellTotal = Number(sells.total || 0);
  const walletTotal = Number(wallets.total || 0), walletSynced = Number(wallets.synced || 0);
  const basisPct = total ? tracked / total : 1;
  const fifoPct = sellTotal ? matched / sellTotal : 1;
  const walletGreen = walletTotal === 0 || (walletSynced === walletTotal && !!wallets.oldestSync && Date.now() - new Date(wallets.oldestSync).getTime() <= 24 * 3600000);
  const walletYellow = walletTotal === 0 || (walletSynced === walletTotal && !!wallets.oldestSync && Date.now() - new Date(wallets.oldestSync).getTime() <= 7 * 86400000);
  const completeDenom = total + sellTotal;
  const pct = completeDenom ? Math.round(((tracked + matched) / completeDenom) * 100) : 100;
  const colors = [basisPct >= .8 ? "green" : basisPct >= .5 ? "yellow" : "red", matched === sellTotal ? "green" : matched > 0 ? "yellow" : "red", walletGreen ? "green" : walletYellow ? "yellow" : "red", pct >= 90 ? "green" : pct >= 60 ? "yellow" : "red"];
  const reds = colors.filter((c) => c === "red").length, yellows = colors.filter((c) => c === "yellow").length;
  return { costBasisCoverage: { tracked, total }, fifoReconciliation: { matched, total: sellTotal }, walletFreshness: { synced: walletSynced, total: walletTotal, oldestSync: wallets.oldestSync || null }, dataCompleteness: { pct }, overall: reds >= 2 || (reds === 1 && yellows === 0) ? "unverified" : yellows > 0 || reds > 0 ? "attention" : "high" };
}

/* ------------------------------------------------------------------ */
/*  Wallet address helpers                                             */
/* ------------------------------------------------------------------ */
export interface WalletAddress {
  id: number;
  user_id: number;
  label: string;
  address: string;
  blockchain: string;
  created_at: string;
  last_synced_at: string | null;
}

export function getWalletAddresses(userId: number): WalletAddress[] {
  return db
    .prepare("SELECT * FROM wallet_addresses WHERE user_id = ? ORDER BY created_at")
    .all(userId) as WalletAddress[];
}

export function addWalletAddress(
  userId: number,
  label: string,
  address: string,
  blockchain: string,
): WalletAddress {
  const result = db
    .prepare(
      "INSERT INTO wallet_addresses (user_id, label, address, blockchain) VALUES (?, ?, ?, ?)",
    )
    .run(userId, label, address, blockchain);
  return {
    id: Number(result.lastInsertRowid),
    user_id: userId,
    label,
    address,
    blockchain,
    created_at: new Date().toISOString(),
  };
}

export function removeWalletAddress(id: number, userId: number): boolean {
  const result = db
    .prepare("DELETE FROM wallet_addresses WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}

/* ------------------------------------------------------------------ */
/*  Exchange holdings helpers                                          */
/* ------------------------------------------------------------------ */
export interface ExchangeHolding {
  id: number;
  user_id: number;
  symbol: string;
  amount: number;
  exchange_name: string;
  cost_basis: number;
  created_at: string;
  updated_at: string;
}

export function getExchangeHoldings(userId: number): ExchangeHolding[] {
  return db
    .prepare(
      "SELECT * FROM exchange_holdings WHERE user_id = ? ORDER BY created_at",
    )
    .all(userId) as ExchangeHolding[];
}

export function addExchangeHolding(
  userId: number,
  symbol: string,
  amount: number,
  exchangeName: string,
  costBasis: number = 0,
): ExchangeHolding {
  const result = db
    .prepare(
      "INSERT INTO exchange_holdings (user_id, symbol, amount, exchange_name, cost_basis) VALUES (?, ?, ?, ?, ?)",
    )
    .run(userId, symbol.toUpperCase(), amount, exchangeName, costBasis);
  return {
    id: Number(result.lastInsertRowid),
    user_id: userId,
    symbol: symbol.toUpperCase(),
    amount,
    exchange_name: exchangeName,
    cost_basis: costBasis,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function updateExchangeHolding(
  id: number,
  userId: number,
  symbol: string,
  amount: number,
  exchangeName: string,
  costBasis: number = 0,
): boolean {
  const result = db
    .prepare(
      "UPDATE exchange_holdings SET symbol = ?, amount = ?, exchange_name = ?, cost_basis = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
    )
    .run(symbol.toUpperCase(), amount, exchangeName, costBasis, id, userId);
  return result.changes > 0;
}

export function deleteExchangeHolding(id: number, userId: number): boolean {
  const result = db
    .prepare("DELETE FROM exchange_holdings WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}

export function syncExchangeHoldings(userId: number): void {
  // Ensure default portfolio exists
  let portfolioId: number | null = null;
  const def = db
    .prepare("SELECT id FROM portfolios WHERE user_id = ? AND is_default = 1 LIMIT 1")
    .get(userId) as { id: number } | undefined;
  if (def) {
    portfolioId = def.id;
  }

  // Delete all existing exchange-manual sourced holdings
  db.prepare(
    "DELETE FROM holdings WHERE user_id = ? AND COALESCE(source,'manual') = 'exchange-manual'",
  ).run(userId);

  // Copy exchange holdings into main holdings table
  const exchangeHoldings = db
    .prepare("SELECT * FROM exchange_holdings WHERE user_id = ?")
    .all(userId) as ExchangeHolding[];

  for (const eh of exchangeHoldings) {
    if (eh.amount > 0) {
      // Check if a matching coin exists in SYMBOL_MAP by looking at the existing holdings
      // We try to find the coin info from an existing holding first, then fallback
      const existingHolding = db
        .prepare(
          "SELECT coin_id, coin_name FROM holdings WHERE user_id = ? AND symbol = ? LIMIT 1",
        )
        .get(userId, eh.symbol) as { coin_id: string; coin_name: string } | undefined;

      const coinId = existingHolding?.coin_id ?? eh.symbol.toLowerCase();
      const coinName = existingHolding?.coin_name ?? eh.symbol;

      db.prepare(
        "INSERT INTO holdings (user_id, coin_id, symbol, coin_name, amount, source, portfolio_id, cost_basis, purchase_price) VALUES (?, ?, ?, ?, ?, 'exchange-manual', ?, ?, ?)",
      ).run(userId, coinId, eh.symbol, coinName, eh.amount, portfolioId, eh.cost_basis, 0);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Password reset token helpers                                       */
/* ------------------------------------------------------------------ */
export function createPasswordResetToken(userId: number): string {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare(
    "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
  ).run(userId, token, expiresAt);
  // Clean up expired tokens
  db.prepare("DELETE FROM password_reset_tokens WHERE expires_at < ?").run(
    new Date().toISOString(),
  );
  return token;
}

export function validateResetToken(token: string): number | null {
  const row = db
    .prepare(
      "SELECT user_id FROM password_reset_tokens WHERE token = ? AND expires_at > ?",
    )
    .get(token, new Date().toISOString()) as { user_id: number } | undefined;
  return row?.user_id ?? null;
}

export function consumeResetToken(token: string): void {
  db.prepare("DELETE FROM password_reset_tokens WHERE token = ?").run(token);
}

export function resetUserPassword(userId: number, passwordHash: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    passwordHash,
    userId,
  );
}
