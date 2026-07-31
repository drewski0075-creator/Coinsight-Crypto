import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import {
  validateSession,
  deleteSession,
  getUserHoldings,
  addHolding as dbAddHolding,
  removeHolding as dbRemoveHolding,
  getHoldingCount,
  setUserPro,
  createUser,
  createSession,
  getUserByEmail,
  syncWalletHoldings,
  getAlerts,
  createAlert as dbCreateAlert,
  deleteAlert as dbDeleteAlert,
  markTriggered,
  getWatchlist,
  addToWatchlist as dbAddToWatchlist,
  removeFromWatchlist as dbRemoveFromWatchlist,
  getPortfolios,
  getDefaultPortfolio,
  createPortfolio as dbCreatePortfolio,
  renamePortfolio as dbRenamePortfolio,
  deletePortfolio as dbDeletePortfolio,
  getPortfolioPnL,
  getWalletAddresses as dbGetWalletAddresses,
  addWalletAddress as dbAddWalletAddress,
  removeWalletAddress as dbRemoveWalletAddress,
  getExchangeHoldings as dbGetExchangeHoldings,
  addExchangeHolding as dbAddExchangeHolding,
  updateExchangeHolding as dbUpdateExchangeHolding,
  deleteExchangeHolding as dbDeleteExchangeHolding,
  syncExchangeHoldings as dbSyncExchangeHoldings,
  getTransactions as dbGetTransactions,
  addTransactionsBatch as dbAddTransactionsBatch,
  deleteTransaction,
  createPasswordResetToken,
  validateResetToken,
  consumeResetToken,
  resetUserPassword,
} from "~/db.server";
import { SYMBOL_MAP } from "~/constants";
import { getCached, setCache } from "~/lib/wallet-cache";
import { parseCSV } from "~/lib/csv-parser";
import {
  sendEmail,
  buildWelcomeEmail,
  buildResetEmail,
  buildAlertEmail,
  buildPurchaseConfirmationEmail,
} from "~/lib/email.server";
import bcrypt from "bcryptjs";

/* ------------------------------------------------------------------ */
/*  Auth: signup                                                        */
/* ------------------------------------------------------------------ */
export const signupFn = createServerFn().handler(
  async (input: { data: { email: string; password: string } }) => {
    const { email, password } = input.data;

    if (!email || !password) {
      return { success: false, error: "Email and password are required." };
    }
    if (password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters." };
    }
    if (!email.includes("@")) {
      return { success: false, error: "Please enter a valid email address." };
    }

    const existing = getUserByEmail(email.toLowerCase().trim());
    if (existing) {
      return { success: false, error: "An account with this email already exists." };
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const user = createUser(email.toLowerCase().trim(), passwordHash);
    const token = createSession(user.id);

    setCookie("coinsight_session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    // Send welcome email (fire-and-forget)
    const welcome = buildWelcomeEmail();
    sendEmail({ to: user.email, subject: welcome.subject, html: welcome.html }).catch(() => {});

    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Auth: login                                                         */
/* ------------------------------------------------------------------ */
export const loginFn = createServerFn().handler(
  async (input: { data: { email: string; password: string } }) => {
    const { email, password } = input.data;

    if (!email || !password) {
      return { success: false, error: "Email and password are required." };
    }

    const user = getUserByEmail(email.toLowerCase().trim());
    if (!user) {
      return { success: false, error: "Invalid email or password." };
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return { success: false, error: "Invalid email or password." };
    }

    const token = createSession(user.id);
    setCookie("coinsight_session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Auth: logout                                                        */
/* ------------------------------------------------------------------ */
export const logoutFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (token) {
    deleteSession(token);
  }
  deleteCookie("coinsight_session", { path: "/" });
  return { success: true };
});

/* ------------------------------------------------------------------ */
/*  Auth: check session                                                 */
/* ------------------------------------------------------------------ */
export const getAuthFn = createServerFn().handler(async (): Promise<{
  user: { id: number; email: string; is_pro: number } | null;
  holdings: { id: number; symbol: string; coin_id: string; coin_name: string; amount: number; source: string; portfolio_id: number | null; cost_basis: number; purchase_price: number }[];
  holdingCount: number;
  portfolios: { id: number; name: string; is_default: number }[];
}> => {
  const token = getCookie("coinsight_session");
  if (!token) return { user: null, holdings: [], holdingCount: 0, portfolios: [] };

  const user = validateSession(token);
  if (!user) return { user: null, holdings: [], holdingCount: 0, portfolios: [] };

  const dbHoldings = getUserHoldings(user.id);
  const holdings = dbHoldings.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    coin_id: h.coin_id,
    coin_name: h.coin_name,
    amount: h.amount,
    source: h.source,
    portfolio_id: h.portfolio_id,
    cost_basis: h.cost_basis,
    purchase_price: h.purchase_price,
  }));

  const portfolios = getPortfolios(user.id);

  return {
    user: { id: user.id, email: user.email, is_pro: user.is_pro },
    holdings,
    holdingCount: holdings.length,
    portfolios,
  };
});

/* ------------------------------------------------------------------ */
/*  Holdings: add                                                       */
/* ------------------------------------------------------------------ */
export const addHoldingFn = createServerFn().handler(
  async (input: { symbol: string; amount: number; portfolioId?: number; costBasis?: number; purchasePrice?: number }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const sym = input.symbol.toUpperCase();
    const info = SYMBOL_MAP[sym];
    if (!info) throw new Error("Unknown coin");

    dbAddHolding(user.id, info.id, sym, info.name, input.amount, "manual", input.portfolioId, input.costBasis, input.purchasePrice);
    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Holdings: remove                                                    */
/* ------------------------------------------------------------------ */
export const removeHoldingFn = createServerFn().handler(
  async (input: { holdingId: number }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    dbRemoveHolding(input.holdingId, user.id);
    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Holdings: migrate from localStorage                                 */
/* ------------------------------------------------------------------ */
export const migrateFn = createServerFn().handler(
  async (input: { holdings: { symbol: string; amount: number }[] }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const count = getHoldingCount(user.id);
    if (count > 0) return { migrated: false };

    for (const h of input.holdings) {
      const sym = h.symbol.toUpperCase();
      const info = SYMBOL_MAP[sym];
      if (info) {
        dbAddHolding(user.id, info.id, sym, info.name, h.amount);
      }
    }
    return { migrated: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Auth: check (for beforeLoad)                                        */
/* ------------------------------------------------------------------ */
export const checkAuthFn = createServerFn().handler(async (): Promise<{
  authenticated: boolean;
}> => {
  const token = getCookie("coinsight_session");
  if (!token) return { authenticated: false };

  const user = validateSession(token);
  if (!user) return { authenticated: false };

  // Refresh session cookie
  setCookie("coinsight_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return { authenticated: true };
});

/* ------------------------------------------------------------------ */
/*  Pro: activate                                                       */
/* ------------------------------------------------------------------ */
export const activateProFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");

  setUserPro(user.id, true);

  // Send purchase confirmation email (fire-and-forget)
  const confirm = buildPurchaseConfirmationEmail();
  sendEmail({ to: user.email, subject: confirm.subject, html: confirm.html }).catch(() => {});

  return { success: true };
});

/* ------------------------------------------------------------------ */
/*  Wallet: sync holdings from wallet                                   */
/* ------------------------------------------------------------------ */
export const syncWalletHoldingsFn = createServerFn().handler(
  async (input: {
    holdings: { symbol: string; amount: number }[];
    walletSource?: string;
  }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const walletHoldings: { coinId: string; symbol: string; coinName: string; amount: number }[] = [];
    for (const h of input.holdings) {
      const sym = h.symbol.toUpperCase();
      const info = SYMBOL_MAP[sym];
      if (info && h.amount > 0) {
        walletHoldings.push({
          coinId: info.id,
          symbol: sym,
          coinName: info.name,
          amount: h.amount,
        });
      }
    }

    syncWalletHoldings(user.id, walletHoldings, input.walletSource ?? "wallet");
    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Alerts: get, create, delete, mark triggered                         */
/* ------------------------------------------------------------------ */
export const getAlertsFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");

  return getAlerts(user.id);
});

export const createAlertFn = createServerFn().handler(
  async (input: {
    data: { coinId: string; symbol: string; targetPrice: number; direction: string };
  }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const { coinId, symbol, targetPrice, direction } = input.data;
    return dbCreateAlert(user.id, coinId, symbol, targetPrice, direction);
  },
);

export const deleteAlertFn = createServerFn().handler(
  async (input: { data: { alertId: number } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    return dbDeleteAlert(input.data.alertId, user.id);
  },
);

export const markAlertTriggeredFn = createServerFn().handler(
  async (input: { data: { alertId: number } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    markTriggered(input.data.alertId);
    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Watchlist: get, add, remove                                         */
/* ------------------------------------------------------------------ */
export const getWatchlistFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");

  return getWatchlist(user.id);
});

export const addToWatchlistFn = createServerFn().handler(
  async (input: { data: { coinId: string; symbol: string; coinName: string } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const result = dbAddToWatchlist(
      user.id,
      input.data.coinId,
      input.data.symbol,
      input.data.coinName,
    );

    if (!result) throw new Error("Watchlist is full (max 10 coins)");
    return result;
  },
);

export const removeFromWatchlistFn = createServerFn().handler(
  async (input: { data: { id: number } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const ok = dbRemoveFromWatchlist(input.data.id, user.id);
    if (!ok) throw new Error("Watchlist entry not found");
    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Portfolio: list                                                     */
/* ------------------------------------------------------------------ */
export const listPortfoliosFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");

  return getPortfolios(user.id);
});

/* ------------------------------------------------------------------ */
/*  Portfolio: create                                                   */
/* ------------------------------------------------------------------ */
export const createPortfolioFn = createServerFn().handler(
  async (input: { data: { name: string } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const portfolio = dbCreatePortfolio(user.id, input.data.name);
    return portfolio;
  },
);

/* ------------------------------------------------------------------ */
/*  Portfolio: rename                                                   */
/* ------------------------------------------------------------------ */
export const renamePortfolioFn = createServerFn().handler(
  async (input: { data: { portfolioId: number; name: string } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const ok = dbRenamePortfolio(input.data.portfolioId, user.id, input.data.name);
    if (!ok) throw new Error("Portfolio not found");
    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Portfolio: delete                                                   */
/* ------------------------------------------------------------------ */
export const deletePortfolioFn = createServerFn().handler(
  async (input: { data: { portfolioId: number } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const result = dbDeletePortfolio(input.data.portfolioId, user.id);
    if (!result.success) throw new Error(result.error ?? "Failed to delete portfolio");
    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Portfolio: P&L data                                                 */
/* ------------------------------------------------------------------ */
export const getPortfolioPnLFn = createServerFn().handler(
  async (input: { data: { portfolioId: number } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    return getPortfolioPnL(user.id, input.data.portfolioId);
  },
);

/* ------------------------------------------------------------------ */
/*  Wallet Addresses: CRUD                                              */
/* ------------------------------------------------------------------ */
export const getWalletAddressesFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");

  return dbGetWalletAddresses(user.id);
});

export const addWalletAddressFn = createServerFn().handler(
  async (input: { data: { label: string; address: string; blockchain: string } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const { label, address, blockchain } = input.data;
    return dbAddWalletAddress(user.id, label.trim(), address.trim(), blockchain);
  },
);

export const removeWalletAddressFn = createServerFn().handler(
  async (input: { data: { id: number } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const ok = dbRemoveWalletAddress(input.data.id, user.id);
    if (!ok) throw new Error("Wallet address not found");
    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Wallet Balances: RPC lookup (server-side only)                      */
/* ------------------------------------------------------------------ */
interface WalletBalance {
  address: string;
  blockchain: string;
  nativeBalance: number;
  nativeSymbol: string;
}

const BALANCE_CACHE_TTL = 30_000; // 30 seconds

export const lookupWalletBalances = createServerFn().handler(
  async (input: {
    data: { addresses: { id: number; address: string; blockchain: string }[] };
  }): Promise<WalletBalance[]> => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const results: WalletBalance[] = [];

    for (const addr of input.data.addresses) {
      const cacheKey = `bal:${addr.blockchain}:${addr.address}`;
      const cached = getCached<WalletBalance>(cacheKey);
      if (cached) {
        results.push(cached);
        continue;
      }

      let balance: WalletBalance | null = null;

      try {
        if (addr.blockchain === "ethereum") {
          const res = await fetch("https://eth.llamarpc.com", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "eth_getBalance",
              params: [addr.address, "latest"],
              id: 1,
            }),
          });
          const data = await res.json();
          if (data.result) {
            const eth = parseInt(data.result, 16) / 1e18;
            balance = {
              address: addr.address,
              blockchain: "ethereum",
              nativeBalance: eth,
              nativeSymbol: "ETH",
            };
          }
        } else if (addr.blockchain === "solana") {
          const res = await fetch("https://api.mainnet-beta.solana.com", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "getBalance",
              params: [addr.address],
              id: 1,
            }),
          });
          const data = await res.json();
          if (data.result?.value != null) {
            const sol = data.result.value / 1e9;
            balance = {
              address: addr.address,
              blockchain: "solana",
              nativeBalance: sol,
              nativeSymbol: "SOL",
            };
          }
        } else if (addr.blockchain === "bitcoin") {
          const res = await fetch(
            `https://blockstream.info/api/address/${addr.address}`,
          );
          if (res.ok) {
            const data = await res.json();
            const funded = data.chain_stats?.funded_txo_sum ?? 0;
            const spent = data.chain_stats?.spent_txo_sum ?? 0;
            const btc = (funded - spent) / 1e8;
            balance = {
              address: addr.address,
              blockchain: "bitcoin",
              nativeBalance: Math.max(0, btc),
              nativeSymbol: "BTC",
            };
          }
        }
      } catch {
        // RPC error — skip this address
      }

      if (balance) {
        setCache(cacheKey, balance, BALANCE_CACHE_TTL);
        results.push(balance);
      }
    }

    return results;
  },
);

/* ------------------------------------------------------------------ */
/*  Wallet: sync balances to holdings                                   */
/* ------------------------------------------------------------------ */
export const syncWalletBalancesFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");

  const addresses = dbGetWalletAddresses(user.id);
  if (addresses.length === 0) return { success: true, count: 0 };

  // Fetch balances for all addresses
  const balanceResults: WalletBalance[] = [];

  for (const addr of addresses) {
    const cacheKey = `bal:${addr.blockchain}:${addr.address}`;
    const cached = getCached<WalletBalance>(cacheKey);
    if (cached) {
      balanceResults.push(cached);
      continue;
    }

    let balance: WalletBalance | null = null;
    try {
      if (addr.blockchain === "ethereum") {
        const res = await fetch("https://eth.llamarpc.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_getBalance",
            params: [addr.address, "latest"],
            id: 1,
          }),
        });
        const data = await res.json();
        if (data.result) {
          const eth = parseInt(data.result, 16) / 1e18;
          balance = {
            address: addr.address,
            blockchain: "ethereum",
            nativeBalance: eth,
            nativeSymbol: "ETH",
          };
        }
      } else if (addr.blockchain === "solana") {
        const res = await fetch("https://api.mainnet-beta.solana.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "getBalance",
            params: [addr.address],
            id: 1,
          }),
        });
        const data = await res.json();
        if (data.result?.value != null) {
          const sol = data.result.value / 1e9;
          balance = {
            address: addr.address,
            blockchain: "solana",
            nativeBalance: sol,
            nativeSymbol: "SOL",
          };
        }
      } else if (addr.blockchain === "bitcoin") {
        const res = await fetch(
          `https://blockstream.info/api/address/${addr.address}`,
        );
        if (res.ok) {
          const data = await res.json();
          const funded = data.chain_stats?.funded_txo_sum ?? 0;
          const spent = data.chain_stats?.spent_txo_sum ?? 0;
          const btc = (funded - spent) / 1e8;
          balance = {
            address: addr.address,
            blockchain: "bitcoin",
            nativeBalance: Math.max(0, btc),
            nativeSymbol: "BTC",
          };
        }
      }
    } catch {
      // skip
    }

    if (balance) {
      setCache(cacheKey, balance, BALANCE_CACHE_TTL);
      balanceResults.push(balance);
    }
  }

  // Aggregate by symbol
  const agg: Record<string, number> = {};
  for (const b of balanceResults) {
    agg[b.nativeSymbol] = (agg[b.nativeSymbol] || 0) + b.nativeBalance;
  }

  const holdings = Object.entries(agg)
    .filter(([, amount]) => amount > 0)
    .map(([symbol, amount]) => {
      const info = SYMBOL_MAP[symbol];
      return {
        coinId: info?.id ?? symbol.toLowerCase(),
        symbol,
        coinName: info?.name ?? symbol,
        amount,
      };
    });

  if (holdings.length > 0) {
    syncWalletHoldings(user.id, holdings, "wallet-address-book");
  }

  return { success: true, count: holdings.length };
});

/* ------------------------------------------------------------------ */
/*  Exchange Holdings: CRUD + sync                                     */
/* ------------------------------------------------------------------ */
export const getExchangeHoldingsFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");

  return dbGetExchangeHoldings(user.id);
});

export const addExchangeHoldingFn = createServerFn().handler(
  async (input: {
    data: { symbol: string; amount: number; exchangeName: string; costBasis?: number };
  }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const { symbol, amount, exchangeName, costBasis } = input.data;
    const sym = symbol.toUpperCase();
    const info = SYMBOL_MAP[sym];
    if (!info) throw new Error("Unknown coin: " + sym);

    const entry = dbAddExchangeHolding(user.id, sym, amount, exchangeName, costBasis ?? 0);
    // Sync to main holdings table
    dbSyncExchangeHoldings(user.id);
    return entry;
  },
);

export const updateExchangeHoldingFn = createServerFn().handler(
  async (input: {
    data: { id: number; symbol: string; amount: number; exchangeName: string; costBasis?: number };
  }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const { id, symbol, amount, exchangeName, costBasis } = input.data;
    const sym = symbol.toUpperCase();
    const info = SYMBOL_MAP[sym];
    if (!info) throw new Error("Unknown coin: " + sym);

    const ok = dbUpdateExchangeHolding(id, user.id, sym, amount, exchangeName, costBasis ?? 0);
    if (!ok) throw new Error("Exchange holding not found");
    // Sync to main holdings table
    dbSyncExchangeHoldings(user.id);
    return { success: true };
  },
);

export const deleteExchangeHoldingFn = createServerFn().handler(
  async (input: { data: { id: number } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const ok = dbDeleteExchangeHolding(input.data.id, user.id);
    if (!ok) throw new Error("Exchange holding not found");
    // Sync to main holdings table
    dbSyncExchangeHoldings(user.id);
    return { success: true };
  },
);

export const syncExchangeHoldingsFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");

  dbSyncExchangeHoldings(user.id);
  return { success: true };
});

/* ------------------------------------------------------------------ */
/*  CSV Import (Pro only)                                               */
/* ------------------------------------------------------------------ */
export const importCSVFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid request body");
    }
    const d = data as Record<string, unknown>;
    if (typeof d.csvText !== "string" || !d.csvText.trim()) {
      throw new Error("csvText must be a non-empty string");
    }
    return { csvText: d.csvText as string };
  })
  .handler(async ({ data }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    // Pro-only check
    if (user.is_pro !== 1) {
      throw new Error("CSV import is a Pro feature. Upgrade to CoinSight Pro to use it.");
    }

    // Parse the CSV
    const { format, transactions: parsed } = parseCSV(data.csvText);

    // Map symbols to coin_ids
    const normalized = parsed.map((tx) => {
      const info = SYMBOL_MAP[tx.symbol.toUpperCase()];
      return {
        symbol: tx.symbol,
        coin_id: info?.id ?? tx.symbol.toLowerCase(),
        type: tx.type,
        amount: tx.amount,
        amount_usd: tx.amount_usd,
        price_per_unit: tx.price_per_unit,
        fee: tx.fee,
        fee_symbol: tx.fee_symbol,
        exchange_source: tx.exchange_source,
        tx_hash: tx.tx_hash,
        tx_date: tx.tx_date,
        notes: tx.notes,
      };
    });

    // Batch insert with dedup
    const result = dbAddTransactionsBatch(user.id, normalized);

    return {
      format,
      inserted: result.inserted,
      skipped: result.skipped,
      total: result.total,
    };
  });

/* ------------------------------------------------------------------ */
/*  Get transactions list                                               */
/* ------------------------------------------------------------------ */
export const getTransactionsFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");

  return dbGetTransactions(user.id);
});

/* ------------------------------------------------------------------ */
/*  Delete a transaction                                                */
/* ------------------------------------------------------------------ */
export const deleteTransactionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { txId: number };
    if (!d || typeof d.txId !== "number") {
      throw new Error("txId must be a number");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");
    deleteTransaction(user.id, data.txId);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/*  Password reset: forgot password                                     */
/* ------------------------------------------------------------------ */
export const forgotPasswordFn = createServerFn().handler(
  async (input: { data: { email: string } }) => {
    const { email } = input.data;

    if (!email || !email.includes("@")) {
      return { success: false, error: "Please enter a valid email address." };
    }

    const user = getUserByEmail(email.toLowerCase().trim());
    if (!user) {
      // Don't reveal whether the email exists — always return success
      return { success: true };
    }

    const resetToken = createPasswordResetToken(user.id);
    const baseUrl =
      process.env.SITE_URL ??
      "https://b7b7222827a9407fadc1f53cb3561c0d.ctonew.app";
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

    const emailContent = buildResetEmail(resetLink);
    await sendEmail({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Password reset: reset password                                      */
/* ------------------------------------------------------------------ */
export const resetPasswordFn = createServerFn().handler(
  async (input: {
    data: { token: string; password: string };
  }) => {
    const { token, password } = input.data;

    if (!token) {
      return { success: false, error: "Invalid reset link." };
    }
    if (!password || password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters." };
    }

    const userId = validateResetToken(token);
    if (!userId) {
      return { success: false, error: "This reset link has expired or is invalid. Please request a new one." };
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    resetUserPassword(userId, passwordHash);

    // Consume the token so it can't be reused
    consumeResetToken(token);

    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Email: send alert notification                                      */
/* ------------------------------------------------------------------ */
export const sendAlertEmailFn = createServerFn().handler(
  async (input: {
    data: { symbol: string; targetPrice: number; currentPrice: number; direction: string };
  }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");

    const { symbol, targetPrice, currentPrice, direction } = input.data;
    const emailContent = buildAlertEmail(symbol, targetPrice, currentPrice, direction);

    await sendEmail({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return { success: true };
  },
);
