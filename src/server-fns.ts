import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie, getRequestHeader } from "@tanstack/react-start/server";
import {
  validateSession,
  deleteSession,
  getUserHoldings,
  addHolding as dbAddHolding,
  removeHolding as dbRemoveHolding,
  getHoldingCount,
  setUserPro,
  setUserMax,
  isUserMax,
  setUserCleanup,
  isUserCleanup,
  deduplicateTransactions,
  recomputeFIFOForSymbol,
  recordCleanupUpload,
  getCleanupSummary,
  getLots,
  getRealizedPnLSummary,
  getPositionAudit,
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
  getDataHealth,
  markWalletsSynced,
  addTransactionsBatch as dbAddTransactionsBatch,
  deleteTransaction,
  createPasswordResetToken,
  validateResetToken,
  consumeResetToken,
  resetUserPassword,
  getShareToken,
  createShareToken,
  revokeShareToken,
  listShareTokens,
  trackPageView,
  getPageViewStats,
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
  user: { id: number; email: string; is_pro: number; is_max: number } | null;
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
    user: { id: user.id, email: user.email, is_pro: user.is_pro, is_max: user.is_max },
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
  isMax: boolean;
}> => {
  const token = getCookie("coinsight_session");
  if (!token) return { authenticated: false, isMax: false };

  const user = validateSession(token);
  if (!user) return { authenticated: false, isMax: false };

  // Refresh session cookie
  setCookie("coinsight_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return { authenticated: true, isMax: user.is_max === 1 };
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
/*  Max: activate (manual upgrade — Max implies Pro)                    */
/* ------------------------------------------------------------------ */
export const activateMaxFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");

  setUserMax(user.id, true);

  // Send purchase confirmation email (fire-and-forget)
  const confirm = buildPurchaseConfirmationEmail();
  sendEmail({ to: user.email, subject: confirm.subject, html: confirm.html }).catch(() => {});

  return { success: true };
});

/* ------------------------------------------------------------------ */
/*  Max: FIFO lot summary (Max only)                                    */
/* ------------------------------------------------------------------ */
export const getLotSummaryFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");
  if (user.is_max !== 1) {
    throw new Error("FIFO lot tracking is a CoinSight Max feature. Upgrade to Max to use it.");
  }

  const lots = getLots(user.id);
  // Group by symbol, oldest lot first
  const bySymbol: Record<string, typeof lots> = {};
  for (const lot of lots) {
    (bySymbol[lot.symbol] ??= []).push(lot);
  }
  return {
    symbols: Object.keys(bySymbol).sort(),
    lots: bySymbol,
    totalLots: lots.length,
  };
});

/* ------------------------------------------------------------------ */
/*  Max: realized P&L summary (Max only)                                */
/* ------------------------------------------------------------------ */
export const getRealizedPnLFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user) throw new Error("Not authenticated");
  if (user.is_max !== 1) {
    throw new Error("Realized P&L is a CoinSight Max feature. Upgrade to Max to use it.");
  }

  const perSymbol = getRealizedPnLSummary(user.id);
  const totals = perSymbol.reduce(
    (acc, r) => {
      acc.proceeds += r.proceeds || 0;
      acc.costBasis += r.costBasis || 0;
      acc.realizedPnl += r.realizedPnl || 0;
      return acc;
    },
    { proceeds: 0, costBasis: 0, realizedPnl: 0 },
  );
  return { perSymbol, totals };
});

/* ------------------------------------------------------------------ */
/*  Max: position audit — full transaction history for one asset       */
/*  (Max only)                                                          */
/* ------------------------------------------------------------------ */
export const getPositionAuditFn = createServerFn().handler(
  async (input: { data: { symbol: string } }) => {
    const token = getCookie("coinsight_session");
    if (!token) throw new Error("Not authenticated");
    const user = validateSession(token);
    if (!user) throw new Error("Not authenticated");
    if (user.is_max !== 1) {
      throw new Error("Position history audit is a CoinSight Max feature. Upgrade to Max to use it.");
    }

    const audit = getPositionAudit(user.id, input.data.symbol);
    if (!audit) throw new Error("No transactions found for this asset.");
    return audit;
  },
);

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

  markWalletsSynced(user.id, balanceResults.map((b) => b.address));

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
    if (typeof d.csvText !== "string" || !d.csvText.trim()) { throw new Error("csvText must be a non-empty string"); }
    return { csvText: d.csvText as string, filename: typeof d.filename === "string" ? d.filename : "import.csv" };
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
    if (data.filename) recordCleanupUpload(user.id, data.filename);

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
/*  Tax reports (Pro only)                                             */
/* ------------------------------------------------------------------ */
type TaxRow = { date: string; type: string; asset: string; amount: number; costBasis: number; proceeds: number; gainLoss: number };
function getTaxRows(userId: number): TaxRow[] {
  const transactions = dbGetTransactions(userId);
  // FIFO lot queue per symbol: oldest buys consumed first
  const lots = new Map<string, { amount: number; cost: number }[]>();
  return [...transactions].sort((a, b) => a.tx_date.localeCompare(b.tx_date)).map((tx) => {
    const type = ["buy", "sell", "transfer"].includes(tx.type.toLowerCase()) ? tx.type.toLowerCase() : "transfer";
    const value = Number(tx.amount_usd) || (Number(tx.amount) * Number(tx.price_per_unit)) || 0;
    const symbol = tx.symbol.toUpperCase();
    const symbolLots = lots.get(symbol) || [];
    let costBasis = 0; let proceeds = 0; let gainLoss = 0;
    if (type === "buy") {
      costBasis = value;
      symbolLots.push({ amount: tx.amount, cost: value });
    } else if (type === "sell") {
      proceeds = value;
      let remaining = tx.amount;
      while (remaining > 1e-9 && symbolLots.length > 0) {
        const first = symbolLots[0];
        const take = Math.min(first.amount, remaining);
        costBasis += first.cost * (take / first.amount);
        first.amount -= take;
        remaining -= take;
        if (first.amount <= 1e-9) symbolLots.shift();
      }
      // Any unmatched sell amount has zero cost basis
      gainLoss = proceeds - costBasis;
    }
    lots.set(symbol, symbolLots);
    return { date: tx.tx_date, type, asset: symbol, amount: tx.amount, costBasis, proceeds, gainLoss };
  });
}
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export const exportTaxCsvFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  const user = token ? validateSession(token) : null;
  if (!user) throw new Error("Not authenticated");
  if (user.is_pro !== 1) throw new Error("Tax reports are a Pro feature.");
  const rows = getTaxRows(user.id);
  return ["Date,Type,Asset,Amount,Cost Basis,Proceeds,Gains/Losses", ...rows.map((r) => [r.date, r.type, r.asset, r.amount, r.costBasis.toFixed(2), r.proceeds.toFixed(2), r.gainLoss.toFixed(2)].map(csvCell).join(","))].join("\n");
});
export const exportTaxPdfFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  const user = token ? validateSession(token) : null;
  if (!user) throw new Error("Not authenticated");
  if (user.is_pro !== 1) throw new Error("Tax reports are a Pro feature.");
  const rows = getTaxRows(user.id);
  const assets = new Map<string, { buys: number; sells: number; gain: number }>();
  for (const r of rows) { const a = assets.get(r.asset) || { buys: 0, sells: 0, gain: 0 }; if (r.type === "buy") a.buys += r.amount; if (r.type === "sell") a.sells += r.amount; a.gain += r.gainLoss; assets.set(r.asset, a); }
  const totalBuys = rows.filter((r) => r.type === "buy").reduce((n, r) => n + r.costBasis, 0);
  const totalSells = rows.filter((r) => r.type === "sell").reduce((n, r) => n + r.proceeds, 0);
  const net = rows.reduce((n, r) => n + r.gainLoss, 0);
  const dates = rows.map((r) => r.date).sort();
  const text = `COINSIGHT TAX SUMMARY\n\nTaxpayer: ${user.email}\nDate range: ${dates[0] || "No transactions"} to ${dates[dates.length - 1] || "No transactions"}\nGenerated: ${new Date().toISOString().slice(0, 10)}\nCalculation: FIFO (first-in, first-out) lot matching\n\nTotal buys: ${totalBuys.toFixed(2)}\nTotal sells: ${totalSells.toFixed(2)}\nNet gain/loss: ${net.toFixed(2)}\n\nASSET SUMMARY\nAsset          Buys          Sells          Gain/Loss\n${[...assets].map(([asset, a]) => `${asset.padEnd(15)} ${a.buys.toFixed(6).padStart(12)} ${a.sells.toFixed(6).padStart(12)} ${a.gain.toFixed(2).padStart(10)}`).join("\n")}\n\nTax-ready export. Consult a tax professional for filing advice.`;
  return Buffer.from(text, "utf8").toString("base64");
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

/** Max-only reconciliation health summary. */
export const getDataHealthFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user || !isUserMax(user.id)) throw new Error("Max subscription required");
  return getDataHealth(user.id);
});


/** Secure, token-only read-only accountant sharing (Max). */
export const createShareLinkFn = createServerFn().handler(async (input: { data: { expiresInDays: number; label?: string } }) => {
  const session = getCookie("coinsight_session"); const user = session ? validateSession(session) : null;
  if (!user || !isUserMax(user.id)) throw new Error("Max subscription required");
  const days = Math.max(1, Math.min(365, Number(input.data.expiresInDays) || 30));
  const expires = new Date(Date.now() + days * 86400000).toISOString().replace('T',' ').replace(/\.\d{3}Z$/, '');
  const token = createShareToken(user.id, expires, input.data.label || "");
  return { token, url: `https://www.coinsight-crypto.com/share/${token}` };
});
export const revokeShareLinkFn = createServerFn().handler(async (input: { data: { token: string } }) => {
  const session = getCookie("coinsight_session"); const user = session ? validateSession(session) : null;
  if (!user || !isUserMax(user.id)) throw new Error("Max subscription required");
  const owned = listShareTokens(user.id).some((x) => x.token === input.data.token);
  if (!owned) throw new Error("Share link not found");
  revokeShareToken(input.data.token); return { success: true };
});
export const listShareLinksFn = createServerFn().handler(async () => {
  const session = getCookie("coinsight_session"); const user = session ? validateSession(session) : null;
  if (!user || !isUserMax(user.id)) throw new Error("Max subscription required");
  return listShareTokens(user.id);
});
export const getShareDataFn = createServerFn().handler(async (input: { data: { token: string } }) => {
  const share = getShareToken(input.data.token);
  if (!share) return { error: "This link has expired or been revoked." } as const;
  const holdings = getUserHoldings(share.user_id);
  const transactions = dbGetTransactions(share.user_id);
  const lots = getLots(share.user_id);
  const pnl = getPortfolioPnL(share.user_id);
  const health = getDataHealth(share.user_id);
  const ids = [...new Set(holdings.map((h) => h.coin_id).filter(Boolean))];
  let prices: Record<string, number> = {};
  if (ids.length) { try { const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`); const d = await r.json() as Record<string,{usd?:number}>; prices = Object.fromEntries(ids.map((id) => [id, d[id]?.usd ?? 0])); } catch { /* prices are optional */ } }
  return { ownerEmail: share.email, expiresAt: share.expires_at, label: share.label, holdings, transactions, lots, pnl, health, prices };
});


export const purchaseCleanupFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session"); const user = token ? validateSession(token) : null;
  if (!user) throw new Error("Not authenticated"); if (user.is_max !== 1) throw new Error("Historical Cleanup is a Max feature.");
  setUserCleanup(user.id, true); return { success: true };
});
export const getCleanupStatusFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session"); const user = token ? validateSession(token) : null;
  if (!user) throw new Error("Not authenticated"); if (user.is_max !== 1) throw new Error("Historical Cleanup is a Max feature.");
  return { hasCleanup: isUserCleanup(user.id) };
});
export const getReconciliationSummaryFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session"); const user = token ? validateSession(token) : null;
  if (!user) throw new Error("Not authenticated"); if (user.is_max !== 1 || !isUserCleanup(user.id)) throw new Error("Purchase a cleanup pass first.");
  return getCleanupSummary(user.id);
});
export const cleanupMultiImportFn = createServerFn({ method: "POST" }).handler(async (input: { data: { files: { filename: string; csvText: string }[] } }) => {
  const token = getCookie("coinsight_session"); const user = token ? validateSession(token) : null;
  if (!user) throw new Error("Not authenticated"); if (user.is_max !== 1 || !isUserCleanup(user.id)) throw new Error("Purchase a cleanup pass first.");
  if (!Array.isArray(input.data.files) || input.data.files.length > 20) throw new Error("Upload up to 20 CSV files.");
  let inserted=0, skipped=0; const symbols = new Set<string>();
  for (const file of input.data.files) { const parsed=parseCSV(file.csvText); const normalized=parsed.transactions.map(tx=>({ ...tx, symbol:tx.symbol.toUpperCase(), coin_id:SYMBOL_MAP[tx.symbol.toUpperCase()]?.id ?? tx.symbol.toLowerCase() })); const result=dbAddTransactionsBatch(user.id, normalized); inserted+=result.inserted; skipped+=result.skipped; normalized.forEach(tx=>symbols.add(tx.symbol)); recordCleanupUpload(user.id,file.filename); }
  const duplicatesRemoved=deduplicateTransactions(user.id); for (const symbol of symbols) recomputeFIFOForSymbol(user.id,symbol);
  return { inserted, skipped, duplicatesRemoved, summary:getCleanupSummary(user.id) };
});
export const exportCleanedLedgerFn = createServerFn().handler(async () => {
  const token=getCookie("coinsight_session"); const user=token ? validateSession(token) : null; if (!user) throw new Error("Not authenticated"); if (user.is_max!==1 || !isUserCleanup(user.id)) throw new Error("Purchase a cleanup pass first.");
  const rows=dbGetTransactions(user.id); return ["Date,Type,Asset,Amount,Cost Basis,Proceeds,Gains/Losses,Exchange", ...rows.map(t=>[t.tx_date,t.type,t.symbol,t.amount,t.amount_usd,t.amount_usd,t.realized_pnl ?? "",t.exchange_source].map(csvCell).join(","))].join("\n");
});

/* ------------------------------------------------------------------ */
/*  Page views: track (privacy-native, no auth required)               */
/* ------------------------------------------------------------------ */
function shortenUserAgent(ua: string | undefined | null): string {
  if (!ua) return "Other";
  const u = ua.toLowerCase();
  if (u.includes("edg/")) return "Edge";
  if (u.includes("opr/") || u.includes("opera")) return "Opera";
  if (u.includes("chrome")) return "Chrome";
  if (u.includes("firefox")) return "Firefox";
  if (u.includes("safari")) return "Safari";
  if (u.includes("msie") || u.includes("trident")) return "IE";
  return "Other";
}

export const trackPageViewFn = createServerFn().handler(
  async (input: { data: { path: string } }) => {
    const path = (input.data && input.data.path) || "";
    if (!path) return { success: false };
    // Only the browser family is stored — never the full user agent or IP
    trackPageView(path, shortenUserAgent(getRequestHeader("user-agent")));
    return { success: true };
  },
);

/* ------------------------------------------------------------------ */
/*  Page views: stats (Pro only)                                       */
/* ------------------------------------------------------------------ */
export const getPageViewStatsFn = createServerFn().handler(async () => {
  const token = getCookie("coinsight_session");
  if (!token) throw new Error("Not authenticated");
  const user = validateSession(token);
  if (!user || user.is_pro !== 1) throw new Error("Page view stats require the Pro plan.");
  return getPageViewStats();
});
