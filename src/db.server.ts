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
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

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

  return db
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Transaction;
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

  return { inserted, skipped, total: inserted + skipped };
}

export function deleteTransaction(userId: number, txId: number): boolean {
  const result = db
    .prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?")
    .run(txId, userId);
  return result.changes > 0;
}

/* ------------------------------------------------------------------ */
/*  User helpers                                                       */
/* ------------------------------------------------------------------ */
export interface User {
  id: number;
  email: string;
  is_pro: number;
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
  return db.prepare("SELECT id, email, is_pro, created_at FROM users WHERE id = ?").get(id) as any;
}

export function setUserPro(userId: number, isPro: boolean): void {
  db.prepare("UPDATE users SET is_pro = ? WHERE id = ?").run(
    isPro ? 1 : 0,
    userId,
  );
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
      `SELECT u.id, u.email, u.is_pro, u.created_at
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
