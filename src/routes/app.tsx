import {
createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteTransactionFn,
  getAuthFn,
  addHoldingFn,
  removeHoldingFn,
  migrateFn,
  activateProFn,
  logoutFn,
  checkAuthFn,
  getAlertsFn,
  createAlertFn,
  deleteAlertFn,
  markAlertTriggeredFn,
  getWatchlistFn,
  addToWatchlistFn,
  removeFromWatchlistFn,
  createPortfolioFn,
  renamePortfolioFn,
  deletePortfolioFn,
  getWalletAddressesFn,
  addWalletAddressFn,
  removeWalletAddressFn,
  lookupWalletBalances,
  syncWalletBalancesFn,
  getExchangeHoldingsFn,
  addExchangeHoldingFn,
  updateExchangeHoldingFn,
  deleteExchangeHoldingFn,
  syncExchangeHoldingsFn,
  importCSVFn,
  getTransactionsFn,
  sendAlertEmailFn,
} from "~/server-fns";
import {
  SYMBOL_MAP,
} from "~/constants";
import AdBanner from "~/components/AdBanner";
import PortfolioAllocationChart from "~/components/PortfolioAllocationChart";
import CsvImportSection from "~/components/CsvImportSection";
import TransactionLedger from "~/components/TransactionLedger";
import QuickToolsPanel from "~/components/QuickToolsPanel";
/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
type Holding = {
  id: number;
  symbol: string;
  coin_id: string;
  coin_name: string;
  amount: number;
  source: string;
  portfolio_id: number | null;
  cost_basis: number;
  purchase_price: number;
};

type Portfolio = {
  id: number;
  name: string;
  is_default: number;
};

type PriceData = Record<string, number | null>;

type TopCoin = {
  id: string;
  name: string;
  symbol: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  sparkline_in_7d: { price: number[] };
};

type TrendingCoin = {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string;
  price: number | null;
  price_change_percentage_24h_usd: number | null;
};

type WatchlistCoinData = TopCoin;

type WatchlistEntry = {
  id: number;
  user_id: number;
  coin_id: string;
  symbol: string;
  coin_name: string;
  position: number;
};

type Alert = {
  id: number;
  user_id: number;
  coin_id: string;
  symbol: string;
  target_price: number;
  direction: string;
  active: number;
  triggered: number;
  created_at: string;
};

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
  created_at: string;
};

/* -- Sparkline SVG component ------------------------------------------ */
const Sparkline = React.memo(function Sparkline({
  prices,
  width,
  height,
  positive,
}: {
  prices: number[];
  width: number;
  height: number;
  positive: boolean;
}) {
  if (!prices || prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const color = positive ? "#16a34a" : "#dc2626";

  const points = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = height - ((p - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}, (prevProps, nextProps) => {
  // Only re-render if data actually changed or dimensions changed
  if (prevProps.width !== nextProps.width || prevProps.height !== nextProps.height) return false;
  if (prevProps.positive !== nextProps.positive) return false;
  if (prevProps.prices && nextProps.prices) {
    if (prevProps.prices.length !== nextProps.prices.length) return false;
    if (prevProps.prices[0] !== nextProps.prices[0]) return false;
    if (prevProps.prices[prevProps.prices.length - 1] !== nextProps.prices[nextProps.prices.length - 1]) return false;
  }
  return true; // props are equal, skip re-render
});

/* -- Portfolio Performance Card (Pro only) ---------------------------- */
type HistoryPoint = { timestamp: number; value: number };

const PortfolioPerformanceCard = React.memo(function PortfolioPerformanceCard({
  holdings,
  fmt,
  fmtCompact,
}: {
  holdings: Holding[];
  fmt: (n: number) => string;
  fmtCompact: (n: number) => string;
}) {
  const [historyCache, setHistoryCache] = useState<Record<string, [number, number][] | null>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Stable key derived from holdings to trigger refetch
  const holdingsKey = useMemo(
    () => holdings.map((h) => `${h.coin_id}:${h.amount}`).sort().join(","),
    [holdings],
  );

  // Fetch 7-day history for each coin
  useEffect(() => {
    if (holdings.length === 0) {
      setHistoryCache({});
      return;
    }

    let cancelled = false;
    const fetchAll = async () => {
      setHistoryLoading(true);
      setHistoryError(false);

      const results: Record<string, [number, number][] | null> = {};

      // Fetch in parallel, but with a concurrency cap of 3 to avoid rate limits
      const coins = holdings.map((h) => ({ symbol: h.symbol.toUpperCase(), coinId: h.coin_id }));
      const uniqueCoins = [...new Map(coins.map((c) => [c.coinId, c])).values()];

      const chunked = uniqueCoins.reduce<typeof uniqueCoins[]>((acc, coin, i) => {
        const chunk = Math.floor(i / 3);
        if (!acc[chunk]) acc[chunk] = [];
        acc[chunk].push(coin);
        return acc;
      }, []);

      for (const chunk of chunked) {
        if (cancelled) return;
        const promises = chunk.map(async (coin) => {
          try {
            const res = await fetch(
              `/api/coingecko/chart?coinId=${coin.coinId}&days=7`,
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { prices: [number, number][] };
            return { coinId: coin.coinId, prices: data.prices };
          } catch {
            return { coinId: coin.coinId, prices: null };
          }
        });

        const batchResults = await Promise.all(promises);
        for (const r of batchResults) {
          results[r.coinId] = r.prices;
        }

        // Small delay between batches to be nice to the API
        if (chunk !== chunked[chunked.length - 1]) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (!cancelled) {
        setHistoryCache(results);
        setHistoryLoading(false);
      }
    };

    fetchAll().catch(() => {
      if (!cancelled) {
        setHistoryError(true);
        setHistoryLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [holdingsKey]);

  // Build combined portfolio time series
  const portfolioHistory = useMemo((): HistoryPoint[] => {
    if (holdings.length === 0) return [];

    // Collect all time series and find the common timestamps
    const allSeries: { coinId: string; amount: number; points: Map<number, number> }[] = [];

    for (const h of holdings) {
      const prices = historyCache[h.coin_id];
      if (!prices || prices.length === 0) continue;
      const pointMap = new Map<number, number>();
      for (const [ts, price] of prices) {
        pointMap.set(ts, price);
      }
      allSeries.push({ coinId: h.coin_id, amount: h.amount, points: pointMap });
    }

    if (allSeries.length === 0) return [];

    // Use the first successful series' timestamps as reference
    const referenceTimestamps = [...allSeries[0].points.keys()].sort((a, b) => a - b);
    if (referenceTimestamps.length === 0) return [];

    const result: HistoryPoint[] = [];

    for (const ts of referenceTimestamps) {
      let totalValue = 0;
      for (const series of allSeries) {
        // Find closest timestamp
        const price = series.points.get(ts) ?? findClosestPrice(ts, series.points);
        if (price != null) {
          totalValue += price * series.amount;
        }
      }
      result.push({ timestamp: ts, value: totalValue });
    }

    return result;
  }, [historyCache, holdings]);

  // Find closest price for a given timestamp
  function findClosestPrice(ts: number, points: Map<number, number>): number | null {
    let bestPrice: number | null = null;
    let bestDiff = Infinity;
    for (const [t, p] of points) {
      const diff = Math.abs(t - ts);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestPrice = p;
      }
    }
    return bestPrice;
  }

  // P&L metrics
  const metrics = useMemo(() => {
    if (portfolioHistory.length < 2) return null;
    const first = portfolioHistory[0];
    const last = portfolioHistory[portfolioHistory.length - 1];

    // 24h ago = last timestamp - 86400000 ms (24 hours in ms)
    const twentyFourHoursAgo = last.timestamp - 86_400_000;
    let point24hAgo = first;
    let bestDiff = Infinity;
    for (const p of portfolioHistory) {
      const diff = Math.abs(p.timestamp - twentyFourHoursAgo);
      if (diff < bestDiff) {
        bestDiff = diff;
        point24hAgo = p;
      }
    }

    const change7d = last.value - first.value;
    const change7dPct = first.value > 0 ? (change7d / first.value) * 100 : 0;
    const change24h = last.value - point24hAgo.value;
    const change24hPct = point24hAgo.value > 0 ? (change24h / point24hAgo.value) * 100 : 0;

    return {
      currentValue: last.value,
      change24h,
      change24hPct,
      change7d,
      change7dPct,
      isUp7d: change7d >= 0,
    };
  }, [portfolioHistory]);

  // Chart calculations
  const chartData = useMemo(() => {
    if (portfolioHistory.length < 2) return null;
    const values = portfolioHistory.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const isUp = metrics?.isUp7d ?? true;

    return { min, max, range, isUp, values, timestamps: portfolioHistory.map((p) => p.timestamp) };
  }, [portfolioHistory, metrics]);

  // SVG mouse handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!chartData || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const pointCount = chartData.values.length;
      const idx = Math.round((x / width) * (pointCount - 1));
      const clamped = Math.max(0, Math.min(pointCount - 1, idx));
      setHoverIndex(clamped);
    },
    [chartData],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  // Touch handlers for mobile
  const handleTouchMove = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      if (!chartData || !svgRef.current || !e.touches[0]) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const width = rect.width;
      const pointCount = chartData.values.length;
      const idx = Math.round((x / width) * (pointCount - 1));
      const clamped = Math.max(0, Math.min(pointCount - 1, idx));
      setHoverIndex(clamped);
    },
    [chartData],
  );

  const handleTouchEnd = useCallback(() => {
    // Keep the tooltip visible briefly after touch ends
    setTimeout(() => setHoverIndex(null), 2000);
  }, []);

  // Build SVG path/polyline data
  const svgLine = useMemo(() => {
    if (!chartData) return "";
    const { values, min, range } = chartData;
    const h = 200; // chart inner height
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [chartData]);

  const svgArea = useMemo(() => {
    if (!chartData) return "";
    const { values, min, range } = chartData;
    const h = 200;
    const linePath = values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
    return `${linePath} L 100 ${h} L 0 ${h} Z`;
  }, [chartData]);

  // Date formatter
  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // If no holdings, show nothing
  if (holdings.length === 0) return null;

  return (

    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <div className="px-5 py-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          📈 Portfolio Performance
        </p>
      </div>

      <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-700">
        {/* Loading skeleton */}
        {historyLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="flex gap-6">
              <div className="flex-1">
                <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-600 mb-2" />
                <div className="h-6 w-28 rounded bg-slate-200 dark:bg-slate-600" />
              </div>
              <div className="flex-1">
                <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-600 mb-2" />
                <div className="h-6 w-24 rounded bg-slate-200 dark:bg-slate-600" />
              </div>
              <div className="flex-1">
                <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-600 mb-2" />
                <div className="h-6 w-24 rounded bg-slate-200 dark:bg-slate-600" />
              </div>
            </div>
            <div className="h-[240px] rounded-lg bg-slate-200 dark:bg-slate-600" />
          </div>
        )}

        {/* Error state */}
        {!historyLoading && historyError && (
          <div className="py-4 text-center">
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Unable to load chart data. The CoinGecko API may be rate-limited. Try again in a minute.
            </p>
          </div>
        )}

        {/* Chart + Metrics */}
        {!historyLoading && !historyError && chartData && metrics && (
          <>
            {/* P&L Metrics Row */}
            <div className="mb-4 flex flex-wrap gap-4 sm:gap-8">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Current Value
                </p>
                <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  {fmtCompact(metrics.currentValue)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  24h Change
                </p>
                <p
                  className={`text-base sm:text-lg font-bold ${
                    metrics.change24h >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {metrics.change24h >= 0 ? "+" : ""}
                  {fmtCompact(metrics.change24h)}{" "}
                  <span className="text-sm font-medium">
                    ({metrics.change24hPct >= 0 ? "+" : ""}
                    {metrics.change24hPct.toFixed(2)}%)
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  7d Change
                </p>
                <p
                  className={`text-base sm:text-lg font-bold ${
                    metrics.change7d >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {metrics.change7d >= 0 ? "+" : ""}
                  {fmtCompact(metrics.change7d)}{" "}
                  <span className="text-sm font-medium">
                    ({metrics.change7dPct >= 0 ? "+" : ""}
                    {metrics.change7dPct.toFixed(2)}%)
                  </span>
                </p>
              </div>
            </div>

            {/* Chart */}
            <div className="relative">
              <svg
                ref={svgRef}
                viewBox="0 0 100 200"
                preserveAspectRatio="none"
                className="h-[240px] w-full"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={chartData.isUp ? "#16a34a" : "#dc2626"}
                      stopOpacity="0.3"
                    />
                    <stop
                      offset="100%"
                      stopColor={chartData.isUp ? "#16a34a" : "#dc2626"}
                      stopOpacity="0.02"
                    />
                  </linearGradient>
                </defs>
                {/* Area fill */}
                <path d={svgArea} fill="url(#chartGradient)" />
                {/* Line */}
                <path
                  d={svgLine}
                  fill="none"
                  stroke={chartData.isUp ? "#16a34a" : "#dc2626"}
                  strokeWidth="0.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />

                {/* Hover guide line + dot */}
                {hoverIndex != null && (
                  <>
                    <line
                      x1={(hoverIndex / (chartData.values.length - 1)) * 100}
                      y1="0"
                      x2={(hoverIndex / (chartData.values.length - 1)) * 100}
                      y2="200"
                      stroke="currentColor"
                      strokeWidth="0.2"
                      strokeDasharray="1,1"
                      className="text-slate-400 dark:text-slate-500"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={(hoverIndex / (chartData.values.length - 1)) * 100}
                      cy={200 - ((chartData.values[hoverIndex] - chartData.min) / chartData.range) * 200}
                      r="1"
                      fill={chartData.isUp ? "#16a34a" : "#dc2626"}
                      stroke="white"
                      strokeWidth="0.3"
                    />
                  </>
                )}
              </svg>

              {/* Hover tooltip */}
              {hoverIndex != null && chartData && (
                <div
                  className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-600 dark:bg-slate-800"
                  style={{
                    left: `${(hoverIndex / (chartData.values.length - 1)) * 100}%`,
                    top: "0.5rem",
                    transform: hoverIndex / chartData.values.length > 0.8
                      ? "translateX(-100%)"
                      : hoverIndex / chartData.values.length < 0.2
                        ? "translateX(0)"
                        : "translateX(-50%)",
                  }}
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(chartData.timestamps[hoverIndex])}
                  </p>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {fmtCompact(chartData.values[hoverIndex])}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Fallback: data loaded but no chart data */}
        {!historyLoading && !historyError && !chartData && portfolioHistory.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
            Waiting for price data...
          </p>
        )}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const STORAGE_KEY = "coinsight-holdings";
const PRO_KEY = "coinsight_pro";
const BANNER_DISMISSED_KEY = "coinsight_banner_dismissed";
const MONTHLY_STRIPE_URL = "https://buy.stripe.com/00w28qaCZfD33gabN038406";
const ANNUAL_STRIPE_URL = "https://buy.stripe.com/aFa7sKdPb0I9dUOaIW38405";
const FREE_LIMIT = 10;

/*
 * Coinzilla ad zone ID.
 * - Sign up at https://coinzilla.com/publishers
 * - Create an ad zone and copy the zone ID
 * - Paste it here (or set the COINZILLA_ZONE_ID env var)
 * - Leave empty to disable ads entirely
 */
const COINZILLA_ZONE_ID: string = "";

/* ------------------------------------------------------------------ */
/*  EIP-1193 type declaration (MetaMask)                                 */
/* ------------------------------------------------------------------ */
declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      isPhantom?: boolean;
      isTrust?: boolean;
      isCoinbaseWallet?: boolean;
      isRainbow?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, cb: (...args: unknown[]) => void) => void;
      removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
      selectedAddress?: string;
      chainId?: string;
    };
    phantom?: {
      solana?: {
        connect: () => Promise<{ publicKey: { toString: () => string } }>;
        disconnect: () => Promise<void>;
      };
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Route with auth guard                                               */
/* ------------------------------------------------------------------ */
export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const result = await checkAuthFn();
    if (!result.authenticated) throw redirect({ to: "/login" });
  },
  component: App,
});

/* ------------------------------------------------------------------ */
/*  App component                                                       */
/* ------------------------------------------------------------------ */
function App() {
  const navigate = useNavigate();

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<PriceData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  /* -- Top coins state ------------------------------------------------ */
  const [topCoins, setTopCoins] = useState<TopCoin[]>([]);
  const [topCoinsLoading, setTopCoinsLoading] = useState(true);
  const [topCoinsError, setTopCoinsError] = useState<string | null>(null);

  /* -- Watchlist state (Pro only) ------------------------------------- */
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [watchlistCoins, setWatchlistCoins] = useState<WatchlistCoinData[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistSymbol, setWatchlistSymbol] = useState("");
  const [watchlistError, setWatchlistError] = useState<string | null>(null);

  /* -- Pro state (from DB — loaded in useEffect) -------------------- */
  const [isPro, setIsPro] = useState(false);

  /* -- Portfolio state ---------------------------------------------- */
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<number | null>(null);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [showNewPortfolioInput, setShowNewPortfolioInput] = useState(false);
  const [renamePortfolioId, setRenamePortfolioId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [totalCost, setTotalCost] = useState("");

  /* -- Alert state -------------------------------------------------- */
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertSymbol, setAlertSymbol] = useState("");
  const [alertPrice, setAlertPrice] = useState("");
  const [alertDirection, setAlertDirection] = useState("above");
  const [alertError, setAlertError] = useState<string | null>(null);
  const [alertBanner, setAlertBanner] = useState<string | null>(null);

  /* -- Crypto Calculator state (Pro only) ---------------------------- */
  const [calcFromCoin, setCalcFromCoin] = useState("BTC");
  const [calcToCoin, setCalcToCoin] = useState("USD");
  const [calcAmount, setCalcAmount] = useState("1");
  const [calcPrices, setCalcPrices] = useState<PriceData>({});
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  /* -- Trending state (Pro only) ---------------------------------- */
  const [trendingCoins, setTrendingCoins] = useState<TrendingCoin[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState<string | null>(null);

  /* -- Exchange Holdings state --------------------------------------- */
  const [exchangeHoldings, setExchangeHoldings] = useState<
    { id: number; symbol: string; amount: number; exchange_name: string; cost_basis: number; created_at: string }[]
  >([]);
  const [exchangeShowAddForm, setExchangeShowAddForm] = useState(false);
  const [exchangeEditId, setExchangeEditId] = useState<number | null>(null);
  const [exchangeSymbol, setExchangeSymbol] = useState("");
  const [exchangeAmount, setExchangeAmount] = useState("");
  const [exchangeAmountMode, setExchangeAmountMode] = useState<"amount" | "usd">("amount");
  const [exchangeUsdValue, setExchangeUsdValue] = useState("");
  const [exchangeExchange, setExchangeExchange] = useState("Coinbase");
  const [exchangeCostBasis, setExchangeCostBasis] = useState("");
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [exchangeLoading, setExchangeLoading] = useState(false);

  /* -- Transaction state (Pro only) ----------------------------------- */
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);


  // Build coin options from SYMBOL_MAP + USD
  const coinOptions = useMemo(() => {
    const opts = Object.entries(SYMBOL_MAP).map(([sym, info]) => ({
      symbol: sym,
      name: info.name,
      id: info.id,
    }));
    opts.sort((a, b) => a.symbol.localeCompare(b.symbol));
    opts.unshift({ symbol: "USD", name: "US Dollar", id: "usd" });
    return opts;
  }, []);

  // Fetch calculator prices when from/to coins change (only for crypto, not USD)
  useEffect(() => {
    if (!isPro) return;
    const coinsToFetch: string[] = [];
    if (calcFromCoin !== "USD") {
      const info = SYMBOL_MAP[calcFromCoin];
      if (info && prices[calcFromCoin] == null && calcPrices[calcFromCoin] == null) {
        coinsToFetch.push(info.id);
      }
    }
    if (calcToCoin !== "USD") {
      const info = SYMBOL_MAP[calcToCoin];
      if (info && prices[calcToCoin] == null && calcPrices[calcToCoin] == null) {
        if (!coinsToFetch.includes(info.id)) coinsToFetch.push(info.id);
      }
    }

    if (coinsToFetch.length === 0) return;

    let cancelled = false;
    setCalcLoading(true);
    setCalcError(null);

    const fetchCalc = async () => {
      try {
        const res = await fetch(
          `/api/coingecko/prices?ids=${coinsToFetch.join(",")}`,
        );
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = (await res.json()) as Record<string, { usd: number }>;

        if (cancelled) return;
        setCalcPrices((prev) => {
          const next = { ...prev };
          for (const [coinId, priceData] of Object.entries(data)) {
            const sym = Object.entries(SYMBOL_MAP).find(([, v]) => v.id === coinId)?.[0];
            if (sym) next[sym] = priceData.usd;
          }
          return next;
        });
        setCalcError(null);
      } catch {
        if (!cancelled) setCalcError("Unable to fetch rates");
      } finally {
        if (!cancelled) setCalcLoading(false);
      }
    };

    fetchCalc();
    return () => { cancelled = true; };
  }, [calcFromCoin, calcToCoin, isPro, prices, calcPrices]);

  // Compute conversion result
  const calcResult = useMemo(() => {
    const amount = parseFloat(calcAmount);
    if (isNaN(amount) || amount <= 0) return null;

    let fromUsd: number | null = null;
    if (calcFromCoin === "USD") {
      fromUsd = 1;
    } else {
      fromUsd = prices[calcFromCoin] ?? calcPrices[calcFromCoin] ?? null;
    }

    let toUsd: number | null = null;
    if (calcToCoin === "USD") {
      toUsd = 1;
    } else {
      toUsd = prices[calcToCoin] ?? calcPrices[calcToCoin] ?? null;
    }

    if (fromUsd == null || toUsd == null) return null;

    const rate = fromUsd / toUsd;
    const converted = amount * rate;
    const inverseRate = toUsd / fromUsd;

    return { rate, converted, inverseRate };
  }, [calcAmount, calcFromCoin, calcToCoin, prices, calcPrices]);

  // Format calculator result
  const fmtCalcRate = (n: number) => {
    if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    if (n >= 0.01) return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  };

  const swapCalcCoins = () => {
    setCalcFromCoin(calcToCoin);
    setCalcToCoin(calcFromCoin);
  };

  /* -- Fetch trending coins from CoinGecko ------------------------- */
  const fetchTrending = useCallback(async () => {
    try {
      const res = await fetch("/api/coingecko/trending");
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      const coins: TrendingCoin[] = (data.coins || [])
        .slice(0, 7)
        .map((entry: { item: {
          id: string;
          name: string;
          symbol: string;
          market_cap_rank: number | null;
          thumb: string;
          data?: { price?: number; price_change_percentage_24h?: { usd?: number } };
        } }) => ({
          id: entry.item.id,
          name: entry.item.name,
          symbol: entry.item.symbol,
          market_cap_rank: entry.item.market_cap_rank ?? null,
          thumb: entry.item.thumb,
          price: entry.item.data?.price ?? null,
          price_change_percentage_24h_usd: entry.item.data?.price_change_percentage_24h?.usd ?? null,
        }));
      setTrendingCoins(coins);
      setTrendingError(null);
    } catch (err) {
      setTrendingError(
        err instanceof Error ? err.message : "Failed to fetch trending data",
      );
    } finally {
      setTrendingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPro) return;
    fetchTrending();
    const interval = setInterval(fetchTrending, 300_000); // 5 minutes
    return () => clearInterval(interval);
  }, [fetchTrending, isPro]);


  /* -- Upgrade modal ------------------------------------------------- */
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);



  /* -- Upgrade banner ------------------------------------------------ */
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(BANNER_DISMISSED_KEY) === "true";
    }
    return false;
  });

  const dismissBanner = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, "true");
    setBannerDismissed(true);
  };

  /* -- Load holdings from DB + migrate localStorage ----------------- */
  const refreshHoldings = useCallback(async (portfolioId?: number | null) => {
    const result = await getAuthFn();
    if (!result.user) return;
    setHoldings(result.holdings);
    setIsPro(result.user.is_pro === 1);
    setPortfolios(result.portfolios || []);
    // Set active portfolio if not set
    const pid = portfolioId !== undefined ? portfolioId : activePortfolioId;
    if (!pid && result.portfolios && result.portfolios.length > 0) {
      const def = result.portfolios.find((p: Portfolio) => p.is_default) || result.portfolios[0];
      setActivePortfolioId(def.id);
    }
  }, [activePortfolioId]);

  useEffect(() => {
    const load = async () => {
      const result = await getAuthFn();
      if (!result.user) return;

      // Set portfolios
      setPortfolios(result.portfolios || []);
      if (result.portfolios && result.portfolios.length > 0 && !activePortfolioId) {
        const def = result.portfolios.find((p: Portfolio) => p.is_default) || result.portfolios[0];
        setActivePortfolioId(def.id);
      }

      // Check for localStorage migration
      if (result.holdings.length === 0) {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              await migrateFn({ holdings: parsed });
              localStorage.removeItem(STORAGE_KEY);
              // Reload holdings after migration
              const reloaded = await getAuthFn();
              setHoldings(reloaded.holdings);
              setPortfolios(reloaded.portfolios || []);
              setIsPro(reloaded.user?.is_pro === 1);
              return;
            }
          }
        } catch {
          /* migration failed — just continue */
        }
      }

      // Also migrate old pro flag
      if (!result.user.is_pro && localStorage.getItem(PRO_KEY) === "true") {
        try {
          await activateProFn();
          localStorage.removeItem(PRO_KEY);
          setIsPro(true);
        } catch {
          /* ignore */
        }
      }

      setHoldings(result.holdings);
      setIsPro(result.user.is_pro === 1);
    };

    load();
  }, []);


  const fetchExchangeHoldings = useCallback(async () => {
    try {
      const result = await getExchangeHoldingsFn();
      setExchangeHoldings(result as any[]);
    } catch {
      // ignore
    }
  }, []);

  // Fetch exchange holdings on auth load
  useEffect(() => {
    if (!holdings) return; // wait until auth has loaded
    fetchExchangeHoldings();
  }, [holdings, fetchExchangeHoldings]);

  /* -- Transactions ---------------------------------------------------- */
  const fetchTransactions = useCallback(async () => {
    try {
      setTxLoading(true);
      const result = await getTransactionsFn();
      setTransactions(result as Transaction[]);
    } catch {
      // ignore
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!holdings || !isPro) return;
    fetchTransactions();
  }, [holdings, isPro, fetchTransactions]);

  const handleDeleteTransaction = useCallback(async (txId: number) => {
    try {
      await deleteTransactionFn({ data: { txId } });
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
    } catch {
      // ignore
    }
  }, []);

  const handleImportComplete = useCallback(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  /* -- Check alerts after price refresh ------------------------------ */
  const checkAlerts = useCallback(
    (currentPrices: PriceData) => {
      if (!isPro || alerts.length === 0) return;

      for (const alert of alerts) {
        const price = currentPrices[alert.symbol];
        if (price == null) continue;

        let triggered = false;
        if (alert.direction === "above" && price >= alert.target_price) {
          triggered = true;
        } else if (alert.direction === "below" && price <= alert.target_price) {
          triggered = true;
        }

        if (triggered) {
          const dirLabel = alert.direction === "above" ? "above" : "below";
          setAlertBanner(
            `🚨 ${alert.symbol} hit ${fmtPrice(price)} (${dirLabel} ${fmtPrice(alert.target_price)} target)`,
          );
          // Mark triggered on server (fire-and-forget)
          markAlertTriggeredFn({ data: { alertId: alert.id } }).catch(() => {});
          // Send email notification (fire-and-forget)
          sendAlertEmailFn({ data: { symbol: alert.symbol, targetPrice: alert.target_price, currentPrice: price, direction: alert.direction } }).catch(() => {});
          // Remove from local state
          setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
          break; // Show one banner at a time
        }
      }
    },
    [isPro, alerts],
  );

  /* -- Filter holdings by active portfolio -------------------------- */
  const portfolioHoldings = useMemo(() => {
    if (activePortfolioId == null) return holdings;
    return holdings.filter((h) => h.portfolio_id === activePortfolioId);
  }, [holdings, activePortfolioId]);

  /* -- P&L computations for current portfolio ----------------------- */
  const portfolioTotalCostBasis = useMemo(() => {
    return portfolioHoldings.reduce((sum, h) => sum + (h.cost_basis || 0), 0);
  }, [portfolioHoldings]);

  const portfolioPnL = useMemo(() => {
    const totalVal = portfolioHoldings.reduce((sum, h) => {
      const price = prices[h.symbol.toUpperCase()];
      if (price == null) return sum;
      return sum + price * h.amount;
    }, 0);
    const costBasis = portfolioTotalCostBasis;
    const pnl = totalVal - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    return { totalValue: totalVal, costBasis, pnl, pnlPct, hasCostData: costBasis > 0 };
  }, [portfolioHoldings, prices, portfolioTotalCostBasis]);

  /* -- Total wealth (ALL holdings across all sources) ---------------- */
  const totalWealth = useMemo(() => {
    return holdings.reduce((sum, h) => {
      const price = prices[h.symbol.toUpperCase()];
      if (price == null) return sum;
      return sum + price * h.amount;
    }, 0);
  }, [holdings, prices]);

  /* -- Total wealth 24h change (weighted by holding value) ----------- */
  const totalWealth24h = useMemo(() => {
    if (holdings.length === 0 || topCoins.length === 0) return 0;
    const topCoinBySymbol: Record<string, { price_change_percentage_24h: number }> = {};
    for (const coin of topCoins) {
      topCoinBySymbol[coin.symbol.toUpperCase()] = coin;
    }
    let totalWeight = 0;
    let weightedChange = 0;
    for (const h of holdings) {
      const price = prices[h.symbol.toUpperCase()];
      if (price == null) continue;
      const value = price * h.amount;
      totalWeight += value;
      const coin = topCoinBySymbol[h.symbol.toUpperCase()];
      if (coin) {
        weightedChange += value * coin.price_change_percentage_24h;
      }
    }
    return totalWeight > 0 ? weightedChange / totalWeight : 0;
  }, [holdings, prices, topCoins]);

  /* -- Source breakdown (wallet / exchange / manual) ----------------- */
  const sourceBreakdown = useMemo(() => {
    const walletSource = holdings.filter((h) => h.source === 'wallet-address-book');
    const exchangeSource = holdings.filter((h) => h.source === 'exchange-manual');
    const manualSource = holdings.filter((h) => h.source === 'manual' || !h.source);

    const sumUsd = (items: Holding[]) =>
      items.reduce((sum, h) => {
        const price = prices[h.symbol.toUpperCase()];
        if (price == null) return sum;
        return sum + price * h.amount;
      }, 0);

    return {
      wallet: { count: walletSource.length, usd: sumUsd(walletSource) },
      exchange: { count: exchangeSource.length, usd: sumUsd(exchangeSource) },
      manual: { count: manualSource.length, usd: sumUsd(manualSource) },
    };
  }, [holdings, prices]);

  /* -- Fetch prices from CoinGecko --------------------------------- */
  const fetchPrices = useCallback(async () => {
    const symbols = holdings.map((h) => h.symbol.toUpperCase());
    const uniqueSymbols = [...new Set(symbols)];

    if (uniqueSymbols.length === 0) {
      setPrices({});
      setLoading(false);
      return;
    }

    const ids = uniqueSymbols
      .map((s) => SYMBOL_MAP[s]?.id)
      .filter(Boolean)
      .join(",");

    if (!ids) {
      setPrices({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/coingecko/prices?ids=${ids}`,
      );
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = (await res.json()) as Record<string, { usd: number }>;

      const newPrices: PriceData = {};
      for (const sym of uniqueSymbols) {
        const coinId = SYMBOL_MAP[sym]?.id;
        newPrices[sym] = coinId && data[coinId] ? data[coinId].usd : null;
      }
      setPrices(newPrices);
      checkAlerts(newPrices);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch prices",
      );
    } finally {
      setLoading(false);
    }
  }, [portfolioHoldings, checkAlerts]);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, isPro ? 30_000 : 60_000);
    return () => clearInterval(interval);
  }, [fetchPrices, isPro]);

  /* -- Fetch top coins from CoinGecko --------------------------------- */
  const fetchTopCoins = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/coingecko/markets?per_page=10&sparkline=true&price_change_percentage=24h",
      );
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: TopCoin[] = await res.json();
      setTopCoins(data);
      setTopCoinsError(null);
    } catch (err) {
      setTopCoinsError(
        err instanceof Error ? err.message : "Failed to fetch top coins",
      );
    } finally {
      setTopCoinsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopCoins();
    const interval = setInterval(fetchTopCoins, isPro ? 30_000 : 60_000);
    return () => clearInterval(interval);
  }, [fetchTopCoins, isPro]);

  /* -- Watchlist: load entries from DB -------------------------------- */
  const loadWatchlist = useCallback(async () => {
    try {
      const entries = await getWatchlistFn();
      setWatchlist(entries);
    } catch {
      /* ignore */
    }
  }, []);

  /* -- Watchlist: fetch coin data from CoinGecko ---------------------- */
  const fetchWatchlistCoins = useCallback(async () => {
    if (watchlist.length === 0) {
      setWatchlistCoins([]);
      return;
    }

    const ids = watchlist.map((w) => w.coin_id).join(",");
    setWatchlistLoading(true);

    try {
      const res = await fetch(
        `/api/coingecko/markets?ids=${ids}&sparkline=true&price_change_percentage=24h`,
      );
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: WatchlistCoinData[] = await res.json();
      setWatchlistCoins(data);
    } catch {
      /* silently ignore — stale data better than error flicker */
    } finally {
      setWatchlistLoading(false);
    }
  }, [watchlist]);

  // Load watchlist on mount when Pro
  useEffect(() => {
    if (isPro) {
      loadWatchlist();
    } else {
      setWatchlist([]);
      setWatchlistCoins([]);
    }
  }, [isPro, loadWatchlist]);

  // Fetch watchlist coin data when entries change
  useEffect(() => {
    if (isPro && watchlist.length > 0) {
      fetchWatchlistCoins();
      const interval = setInterval(fetchWatchlistCoins, 30_000);
      return () => clearInterval(interval);
    } else {
      setWatchlistCoins([]);
    }
  }, [isPro, watchlist, fetchWatchlistCoins]);

  /* -- Watchlist: add coin -------------------------------------------- */
  const addToWatchlistHandler = async () => {
    setWatchlistError(null);
    const sym = watchlistSymbol.trim().toUpperCase();

    if (!sym) {
      setWatchlistError("Enter a coin symbol.");
      return;
    }
    const info = SYMBOL_MAP[sym];
    if (!info) {
      setWatchlistError("Coin not found. Check the symbol and try again.");
      return;
    }

    // Check duplicate
    if (watchlist.some((w) => w.coin_id === info.id)) {
      setWatchlistError(`${sym} is already in your watchlist.`);
      return;
    }

    // Check limit
    if (watchlist.length >= 10) {
      setWatchlistError("Watchlist is full (max 10 coins). Remove one first.");
      return;
    }

    try {
      await addToWatchlistFn({
        data: { coinId: info.id, symbol: sym, coinName: info.name },
      });
      setWatchlistSymbol("");
      await loadWatchlist();
    } catch (err) {
      setWatchlistError(
        err instanceof Error ? err.message : "Failed to add coin.",
      );
    }
  };

  /* -- Watchlist: remove coin ----------------------------------------- */
  const removeFromWatchlistHandler = async (id: number) => {
    try {
      await removeFromWatchlistFn({ data: { id } });
      await loadWatchlist();
    } catch {
      /* ignore */
    }
  };

  /* -- Activate Pro -------------------------------------------------- */
  const activatePro = async () => {
    try {
      await activateProFn();
      setIsPro(true);
      setShowUpgradeModal(false);
    } catch {
      /* ignore */
    }
  };

  /* -- Load alerts (Pro only) ---------------------------------------- */
  const loadAlerts = useCallback(async () => {
    try {
      const result = await getAlertsFn();
      setAlerts(result);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isPro) {
      loadAlerts();
    } else {
      setAlerts([]);
    }
  }, [isPro, loadAlerts]);

  /* -- CSV Export (Pro only) ----------------------------------------- */
  const exportCSV = useCallback(() => {
    const rows = [["Symbol", "Coin Name", "Amount", "Price (USD)", "Value (USD)"]];

    for (const h of holdings) {
      const sym = h.symbol.toUpperCase();
      const info = SYMBOL_MAP[sym];
      const price = prices[sym];
      const value = price != null ? price * h.amount : 0;

      rows.push([
        sym,
        info?.name ?? sym,
        h.amount.toString(),
        price != null ? price.toString() : "N/A",
        value.toString(),
      ]);
    }

    const csvContent = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "coinsight-portfolio.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [portfolioHoldings, prices]);

  /* -- Create alert -------------------------------------------------- */
  const createAlertHandler = async () => {
    setAlertError(null);
    const sym = alertSymbol.trim().toUpperCase();

    if (!sym) {
      setAlertError("Enter a coin symbol.");
      return;
    }
    const info = SYMBOL_MAP[sym];
    if (!info) {
      setAlertError("Coin not found.");
      return;
    }

    const price = parseFloat(alertPrice);
    if (isNaN(price) || price <= 0) {
      setAlertError("Enter a valid target price.");
      return;
    }

    try {
      await createAlertFn({
        data: {
          coinId: info.id,
          symbol: sym,
          targetPrice: price,
          direction: alertDirection,
        },
      });
      setAlertSymbol("");
      setAlertPrice("");
      setAlertDirection("above");
      await loadAlerts();
    } catch {
      setAlertError("Failed to create alert.");
    }
  };

  /* -- Delete alert -------------------------------------------------- */
  const deleteAlertHandler = async (alertId: number) => {
    try {
      await deleteAlertFn({ data: { alertId } });
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      /* ignore */
    }
  };

  /* -- Add holding -------------------------------------------------- */
  const addHolding = async () => {
    setValidationError(null);
    const sym = symbol.trim().toUpperCase();

    if (!sym) {
      setValidationError("Enter a coin symbol.");
      return;
    }
    if (!SYMBOL_MAP[sym]) {
      setValidationError("Coin not found. Check the symbol and try again.");
      return;
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setValidationError("Enter a valid amount greater than zero.");
      return;
    }

    // Check free-tier limit for new (non-existing) coins
    const isExisting = portfolioHoldings.some((h) => h.symbol.toUpperCase() === sym);
    if (!isExisting && !isPro && portfolioHoldings.length >= FREE_LIMIT) {
      setShowUpgradeModal(true);
      return;
    }

    const pp = parseFloat(purchasePrice);
    const tc = parseFloat(totalCost);
    const costBasis = !isNaN(tc) && tc > 0 ? tc : (!isNaN(pp) && pp > 0 ? pp * amt : 0);
    const purchasePriceVal = !isNaN(pp) && pp > 0 ? pp : 0;

    try {
      await addHoldingFn({
        symbol: sym,
        amount: amt,
        portfolioId: activePortfolioId ?? undefined,
        costBasis,
        purchasePrice: purchasePriceVal,
      });
      await refreshHoldings(activePortfolioId);
      setSymbol("");
      setAmount("");
      setPurchasePrice("");
      setTotalCost("");
    } catch {
      setValidationError("Failed to add holding. Please try again.");
    }
  };

  const removeHolding = async (holdingId: number) => {
    try {
      await removeHoldingFn({ holdingId });
      await refreshHoldings(activePortfolioId);
    } catch {
      /* ignore */
    }
  };

  /* -- Portfolio CRUD ---------------------------------------------- */
  const handleCreatePortfolio = async () => {
    const name = newPortfolioName.trim();
    if (!name) return;
    try {
      await createPortfolioFn({ data: { name } });
      setNewPortfolioName("");
      setShowNewPortfolioInput(false);
      const result = await getAuthFn();
      setPortfolios(result.portfolios || []);
      // Switch to new portfolio
      const newest = result.portfolios?.reduce((a, b) => a.id > b.id ? a : b);
      if (newest) {
        setActivePortfolioId(newest.id);
        await refreshHoldings(newest.id);
      }
    } catch (err: any) {
      if (err?.message?.includes("Free tier")) {
        setShowUpgradeModal(true);
        setShowNewPortfolioInput(false);
        setNewPortfolioName("");
      }
    }
  };

  const handleRenamePortfolio = async (portfolioId: number) => {
    const name = renameName.trim();
    if (!name) {
      setRenamePortfolioId(null);
      return;
    }
    try {
      await renamePortfolioFn({ data: { portfolioId, name } });
      setRenamePortfolioId(null);
      setRenameName("");
      const result = await getAuthFn();
      setPortfolios(result.portfolios || []);
    } catch { /* ignore */ }
  };

  const handleDeletePortfolio = async (portfolioId: number) => {
    if (!confirm("Delete this portfolio and all its holdings? This cannot be undone.")) return;
    try {
      await deletePortfolioFn({ data: { portfolioId } });
      const result = await getAuthFn();
      setPortfolios(result.portfolios || []);
      if (result.portfolios && result.portfolios.length > 0) {
        const def = result.portfolios.find((p: Portfolio) => p.is_default) || result.portfolios[0];
        setActivePortfolioId(def.id);
        await refreshHoldings(def.id);
      } else {
        setActivePortfolioId(null);
        setHoldings([]);
      }
    } catch { /* ignore */ }
  };

  const handleSwitchPortfolio = async (portfolioId: number) => {
    setActivePortfolioId(portfolioId);
    await refreshHoldings(portfolioId);
  };

  /* -- Logout ------------------------------------------------------- */
  const handleLogout = async () => {
    try {
      await logoutFn();
    } catch {
      /* ignore */
    }
    navigate({ to: "/" });
  };

  /* -- Computed values ---------------------------------------------- */


  /* -- Currency formatter ------------------------------------------- */
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const fmtCompact = (n: number) => {
    if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
    return fmt(n);
  };

  const fmtPrice = (n: number) => {
    if (n >= 1000) return fmt(n);
    if (n >= 1)
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(n);
    if (n >= 0.01)
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 4,
        maximumFractionDigits: 6,
      }).format(n);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(n);
  };

  const holdingsCount = holdings.length;

  /* ---------------------------------------------------------------- */
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900">
      {/* App Bar */}
      <header className="sticky top-0 z-50 h-16 bg-white shadow-sm dark:bg-slate-800 dark:shadow-slate-900/50">
        <div className="mx-auto flex h-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="CoinSight" className="h-7 w-7" />
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">CoinSight</span>
            {isPro && (
              <span className="ml-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                PRO
              </span>
            )}
          </div>
          <nav className="flex items-center gap-6">
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Dashboard</span>
            <Link
              to="/"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Home
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-slate-500 transition-colors hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-8">
        {/* Error banner */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20">
            <p className="text-sm text-red-700 dark:text-red-400">
              Unable to fetch live prices. Please try again later.
            </p>
            <button
              onClick={fetchPrices}
              className="mt-1 text-sm font-medium text-red-700 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            >
              Retry
            </button>
          </div>
        )}

        {/* Alert notification banner */}
        {alertBanner && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800/50 dark:bg-yellow-900/20">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              {alertBanner}
            </p>
            <button
              onClick={() => setAlertBanner(null)}
              className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-yellow-500 transition-colors hover:bg-yellow-200 hover:text-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-800/50 dark:hover:text-yellow-200"
              aria-label="Dismiss alert"
            >
              ×
            </button>
          </div>
        )}

        {/* Portfolio Selector */}
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Portfolio:</label>
            <select
              value={activePortfolioId ?? ""}
              onChange={(e) => {
                const id = parseInt(e.target.value);
                if (id) handleSwitchPortfolio(id);
              }}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-blue-500 dark:focus:ring-blue-700"
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.is_default ? " (Default)" : ""}
                </option>
              ))}
            </select>
          </div>
          {portfolios.length > 0 && activePortfolioId && (
            <>
              {renamePortfolioId === activePortfolioId ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenamePortfolio(activePortfolioId);
                      if (e.key === "Escape") { setRenamePortfolioId(null); setRenameName(""); }
                    }}
                    placeholder="New name"
                    className="h-8 w-36 rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    autoFocus
                  />
                  <button
                    onClick={() => handleRenamePortfolio(activePortfolioId)}
                    className="h-8 rounded-lg bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setRenamePortfolioId(null); setRenameName(""); }}
                    className="h-8 rounded-lg border border-slate-300 px-2 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const current = portfolios.find((p) => p.id === activePortfolioId);
                      setRenameName(current?.name || "");
                      setRenamePortfolioId(activePortfolioId);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                    title="Rename portfolio"
                  >
                    ✏️
                  </button>
                  {!portfolios.find((p) => p.id === activePortfolioId)?.is_default && (
                    <button
                      onClick={() => handleDeletePortfolio(activePortfolioId)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      title="Delete portfolio"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {!showNewPortfolioInput ? (
            <button
              onClick={() => setShowNewPortfolioInput(true)}
              className="h-9 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-400"
            >
              + New Portfolio
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newPortfolioName}
                onChange={(e) => setNewPortfolioName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreatePortfolio();
                  if (e.key === "Escape") { setShowNewPortfolioInput(false); setNewPortfolioName(""); }
                }}
                placeholder="Portfolio name"
                className="h-9 w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                autoFocus
              />
              <button
                onClick={handleCreatePortfolio}
                disabled={!newPortfolioName.trim()}
                className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => { setShowNewPortfolioInput(false); setNewPortfolioName(""); }}
                className="h-9 rounded-lg border border-slate-300 px-2.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Two-Card Top Row: Total Wealth + Portfolio P&L */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left: Total Wealth Card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-600 dark:bg-slate-800 dark:shadow-slate-900/50">
            <div className="rounded-t-xl border-t-4 border-t-emerald-500" />
            <div className="p-4 sm:p-6">
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Wealth</p>
              {loading && holdings.length > 0 ? (
                <div className="mt-1 h-10 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
              ) : (
                <p className="mt-1 font-mono text-3xl font-bold text-slate-900 sm:text-4xl dark:text-slate-100">{fmt(totalWealth)}</p>
              )}
              <p className={`mt-1 text-sm ${totalWealth24h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {totalWealth24h >= 0 ? '▲' : '▼'} {Math.abs(totalWealth24h).toFixed(1)}% (24h)
              </p>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                {sourceBreakdown.wallet.count + sourceBreakdown.exchange.count + sourceBreakdown.manual.count} sources tracked
              </p>
            </div>
          </div>
          
          {/* Right: Portfolio P&L Card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-600 dark:bg-slate-800 dark:shadow-slate-900/50">
            <div className="rounded-t-xl border-t-4 border-t-blue-600" />
            <div className="p-4 sm:p-6">
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Portfolio P&amp;L</p>
              {loading && portfolioHoldings.length > 0 ? (
                <div className="mt-1 h-10 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
              ) : (
                <p className="mt-1 font-mono text-3xl font-bold text-slate-900 sm:text-4xl dark:text-slate-100">{fmt(portfolioPnL.totalValue)}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-4 sm:gap-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Cost Basis</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {portfolioPnL.hasCostData ? fmtCompact(portfolioPnL.costBasis) : '—'}
                  </p>
                </div>
                {portfolioPnL.hasCostData ? (
                  <>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">P&amp;L</p>
                      <p className={`text-sm font-bold ${portfolioPnL.pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {portfolioPnL.pnl >= 0 ? '▲' : '▼'} {fmtCompact(Math.abs(portfolioPnL.pnl))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Return</p>
                      <p className={`text-sm font-bold ${portfolioPnL.pnlPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {portfolioPnL.pnlPct >= 0 ? '+' : ''}{portfolioPnL.pnlPct.toFixed(1)}%
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center">
                    <p className="text-xs text-slate-400 dark:text-slate-500">Add purchase prices to track P&amp;L</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Source Breakdown Row */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">💼 On-Chain Wallets</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{fmtCompact(sourceBreakdown.wallet.usd)}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{sourceBreakdown.wallet.count} address{sourceBreakdown.wallet.count !== 1 ? 'es' : ''}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">🏦 Exchanges</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{fmtCompact(sourceBreakdown.exchange.usd)}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{sourceBreakdown.exchange.count} holding{sourceBreakdown.exchange.count !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">📝 Manual</p>
            <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{fmtCompact(sourceBreakdown.manual.usd)}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{sourceBreakdown.manual.count} holding{sourceBreakdown.manual.count !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* My Wallets Section */}
        <MyWalletsSection
          isPro={isPro}
          prices={prices}
          onHoldingsSynced={refreshHoldings}
        />


        {/* Two-column grid: Exchange Holdings (left) | Portfolio (right) */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left column: Exchange Holdings */}
          <div>
        {/* Exchange Holdings Section */}
        <ExchangeHoldingsSection
          isPro={isPro}
          prices={prices}
          exchangeHoldings={exchangeHoldings}
          onRefresh={fetchExchangeHoldings}
          onHoldingsSynced={refreshHoldings}
          showAddForm={exchangeShowAddForm}
          setShowAddForm={setExchangeShowAddForm}
          editId={exchangeEditId}
          setEditId={setExchangeEditId}
          symbol={exchangeSymbol}
          setSymbol={setExchangeSymbol}
          amount={exchangeAmount}
          setAmount={setExchangeAmount}
          amountMode={exchangeAmountMode}
          setAmountMode={setExchangeAmountMode}
          usdValue={exchangeUsdValue}
          setUsdValue={setExchangeUsdValue}
          exchange={exchangeExchange}
          setExchange={setExchangeExchange}
          costBasis={exchangeCostBasis}
          setCostBasis={setExchangeCostBasis}
          error={exchangeError}
          setError={setExchangeError}
          loading={exchangeLoading}
          setLoading={setExchangeLoading}
        />

          </div>

          {/* Right column: Free tier counter + Add Holding Form + Holdings Table */}
          <div>
        {/* Free tier coin count indicator (non-Pro only) */}
        {!isPro && (
          <div className="mb-6 text-right">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {portfolioHoldings.length}/{FREE_LIMIT} free coins used
              {portfolioHoldings.length >= FREE_LIMIT && (
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  className="ml-2 font-medium text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Upgrade for unlimited
                </button>
              )}
            </span>
          </div>
        )}

        {/* Add Holding Form */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
          <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Add a Holding
          </p>
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">
            <div className="w-full sm:w-auto">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Coin</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setValidationError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addHolding();
                }}
                placeholder="e.g. BTC"
                className={`h-10 w-full sm:w-40 rounded-lg border px-3 py-2 text-sm placeholder-slate-400 transition-colors duration-150 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 ${
                  validationError
                    ? "border-red-400 ring-2 ring-red-200 dark:border-red-500 dark:ring-red-800/50"
                    : "border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                }`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Amount</label>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => {
                  const amt = e.target.value;
                  setAmount(amt);
                  setValidationError(null);
                  // Auto-calc total cost if purchase price is set
                  const pp = parseFloat(purchasePrice);
                  const a = parseFloat(amt);
                  if (!isNaN(pp) && pp > 0 && !isNaN(a) && a > 0) {
                    setTotalCost((pp * a).toFixed(2));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addHolding();
                }}
                placeholder="Amount"
                className={`h-10 w-40 rounded-lg border px-3 py-2 text-sm placeholder-slate-400 transition-colors duration-150 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 ${
                  validationError
                    ? "border-red-400 ring-2 ring-red-200 dark:border-red-500 dark:ring-red-800/50"
                    : "border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                }`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Purchase Price ($)</label>
              <input
                type="number"
                step="any"
                value={purchasePrice}
                onChange={(e) => {
                  setPurchasePrice(e.target.value);
                  const pp = parseFloat(e.target.value);
                  const a = parseFloat(amount);
                  if (!isNaN(pp) && pp > 0 && !isNaN(a) && a > 0) {
                    setTotalCost((pp * a).toFixed(2));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addHolding();
                }}
                placeholder="Price per coin"
                className="h-10 w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Total Cost ($)</label>
              <input
                type="number"
                step="any"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addHolding();
                }}
                placeholder="Total paid"
                className="h-10 w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
              />
            </div>
            <button
              onClick={addHolding}
              disabled={!symbol.trim() || !amount}
              className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {validationError && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400">{validationError}</p>
          )}
        </div>

        {/* Holdings Table or Empty State */}
        {portfolioHoldings.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-12 text-center dark:border-slate-600 dark:bg-slate-800">
            <div className="mb-4 text-5xl text-slate-300 dark:text-slate-600">📊</div>
            <p className="mb-1 text-lg font-semibold text-slate-700 dark:text-slate-300">
              No holdings added yet
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Add your first coin above or save a wallet address to start tracking your portfolio.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
            <div className="overflow-x-auto">
            {/* Table header */}
            <div className="flex min-w-[640px] items-center border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-700">
              <span className="sticky left-0 z-10 min-w-[100px] flex-1 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-700 dark:text-slate-400" style={{margin: '-0.75rem 0', paddingLeft: '1rem', paddingRight: '1rem'}}>
                Coin
              </span>
              <span className="w-20 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Symbol
              </span>
              <span className="w-24 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Amount
              </span>
              <span className="w-28 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Price
              </span>
              <span className="w-28 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Value
              </span>
              <span className="w-24 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                P&amp;L
              </span>
              <span className="w-20 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Return
              </span>
              {isPro ? (
                <span className="w-20 text-right">
                  <button
                    onClick={exportCSV}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
                  >
                    Export CSV
                  </button>
                </span>
              ) : (
                <span className="w-12" />
              )}
            </div>

            {/* Table rows */}
            {portfolioHoldings.map((h) => {
              const sym = h.symbol.toUpperCase();
              const info = SYMBOL_MAP[sym];
              const price = prices[sym];
              const currentValue = price != null ? price * h.amount : null;
              const costBasis = h.cost_basis || 0;
              const pnlVal = currentValue != null && costBasis > 0 ? currentValue - costBasis : null;
              const pnlPct = pnlVal != null && costBasis > 0 ? (pnlVal / costBasis) * 100 : null;

              return (
                <div
                  key={h.id}
                  className="flex min-w-[640px] items-center border-b border-slate-100 px-4 py-3 transition-colors duration-100 last:border-b-0 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-900/20"
                >
                  <span className="sticky left-0 z-10 min-w-[100px] flex-1 bg-white px-4 py-3 text-sm font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100" style={{margin: '-0.75rem 0', paddingLeft: '1rem', paddingRight: '1rem'}}>
                    {info?.name ?? sym}
                    {h.source !== "manual" && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        💳 wallet
                      </span>
                    )}
                  </span>
                  <Link
                    to="/coin/$coinId"
                    params={{ coinId: info?.id ?? h.coin_id }}
                    preload="intent"
                    className="w-20 font-mono text-xs uppercase text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                  >
                    {sym}
                  </Link>
                  <span className="w-24 text-right font-mono text-xs text-slate-900 dark:text-slate-100">
                    {h.amount.toLocaleString(undefined, {
                      maximumFractionDigits: 8,
                    })}
                  </span>
                  <span className="w-28 text-right font-mono text-xs text-slate-900 dark:text-slate-100">
                    {loading ? (
                      <span className="inline-block h-4 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                    ) : price != null ? (
                      fmt(price)
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </span>
                  <span className="w-28 text-right font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {loading ? (
                      <span className="inline-block h-4 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                    ) : currentValue != null ? (
                      fmtCompact(currentValue)
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </span>
                  <span className="w-24 text-right font-mono text-xs font-semibold">
                    {loading ? (
                      <span className="inline-block h-4 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                    ) : pnlVal != null ? (
                      <span className={pnlVal >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                        {pnlVal >= 0 ? "▲" : "▼"} {fmtCompact(Math.abs(pnlVal))}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </span>
                  <span className="w-20 text-right font-mono text-xs font-medium">
                    {loading ? (
                      <span className="inline-block h-4 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-600" />
                    ) : pnlPct != null ? (
                      <span className={pnlPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                        {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </span>
                  <span className="flex w-12 justify-center">
                    <button
                      onClick={() => removeHolding(h.id)}
                      aria-label={`Remove ${sym}`}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                </div>
              );
            })}
            </div>
          </div>
        )}
          </div>
        </div>

        {/* Transaction Ledger (Pro only) */}
        {isPro && (
          <TransactionLedger
            transactions={transactions}
            loading={txLoading}
            onDelete={handleDeleteTransaction}
          />
        )}



        {/* CSV Import (Pro only) */}
        {isPro && (
          <CsvImportSection
            onImportComplete={handleImportComplete}
          />
        )}

        {/* Portfolio Allocation (Pro only) */}
        {isPro && (
          <PortfolioAllocationChart
            holdings={portfolioHoldings}
            prices={prices}
            fmtCompact={fmtCompact}
          />
        )}
        {/* Portfolio Performance Card (Pro only) */}
        {isPro && (
          <PortfolioPerformanceCard
            holdings={portfolioHoldings}
            fmt={fmt}
            fmtCompact={fmtCompact}
          />
        )}


        {/* Crypto Calculator (Pro only) */}
        {isPro && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <div className="px-5 py-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                🔄 Crypto Calculator
              </p>
            </div>
            <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-700">
              {/* Coin selectors + Swap button */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                {/* From */}
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    From
                  </label>
                  <select
                    value={calcFromCoin}
                    onChange={(e) => setCalcFromCoin(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                  >
                    {coinOptions.map((coin) => (
                      <option key={coin.symbol} value={coin.symbol}>
                        {coin.symbol} — {coin.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Swap button */}
                <button
                  onClick={swapCalcCoins}
                  aria-label="Swap coins"
                  className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full border border-slate-300 bg-white text-lg transition-colors hover:bg-slate-100 sm:self-end dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  ⇄
                </button>

                {/* To */}
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    To
                  </label>
                  <select
                    value={calcToCoin}
                    onChange={(e) => setCalcToCoin(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                  >
                    {coinOptions.map((coin) => (
                      <option key={coin.symbol} value={coin.symbol}>
                        {coin.symbol} — {coin.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Amount input */}
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Amount
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(e.target.value)}
                  placeholder="1"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                />
              </div>

              {/* Result */}
              <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-700/50">
                {calcLoading && !calcError && (
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-slate-600" />
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      Loading rates...
                    </span>
                  </div>
                )}

                {calcError && !calcLoading && (
                  <p className="text-sm text-red-500 dark:text-red-400">
                    Unable to fetch rates
                  </p>
                )}

                {!calcLoading && !calcError && calcResult && (
                  <>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      {calcAmount || "1"} {calcFromCoin} = {fmtCalcRate(calcResult.converted)} {calcToCoin}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      1 {calcToCoin} = {fmtCalcRate(calcResult.inverseRate)} {calcFromCoin}
                    </p>
                  </>
                )}

                {!calcLoading && !calcError && !calcResult && (
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    Enter an amount to see the conversion.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Coinzilla Ad (free users only, only when zone ID is configured) */}
        {!isPro && COINZILLA_ZONE_ID && (
          <>
            <AdBanner zoneId={COINZILLA_ZONE_ID} />
            <p className="-mt-4 mb-6 text-center text-[11px] text-slate-400 dark:text-slate-500">
              <button
                onClick={() => setShowUpgradeModal(true)}
                className="underline hover:text-blue-500 dark:hover:text-blue-400"
              >
                Upgrade to Pro for an ad-free experience.
              </button>
            </p>
          </>
        )}


        {/* Upgrade Banner (free users, not dismissed, not Pro) */}
        {!isPro && !bannerDismissed && (
          <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 sm:px-5 py-3 shadow-sm dark:border-blue-800/50 dark:from-blue-900/20 dark:to-indigo-900/20">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              ✨ Upgrade to CoinSight Pro — unlimited coins, ad-free, Pro badge, and more.{" "}
              <button
                onClick={() => setShowUpgradeModal(true)}
                className="font-semibold text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Learn more
              </button>
            </p>
            <button
              onClick={dismissBanner}
              aria-label="Dismiss"
              className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              ×
            </button>
          </div>
        )}

      {/* Quick Tools floating panel */}
      <QuickToolsPanel
        topCoins={topCoins}
        topCoinsLoading={topCoinsLoading}
        topCoinsError={topCoinsError}
        watchlist={watchlist}
        watchlistCoins={watchlistCoins}
        watchlistLoading={watchlistLoading}
        watchlistSymbol={watchlistSymbol}
        setWatchlistSymbol={setWatchlistSymbol}
        watchlistError={watchlistError}
        setWatchlistError={setWatchlistError}
        addToWatchlistHandler={addToWatchlistHandler}
        removeFromWatchlist={removeFromWatchlistHandler}
        trendingCoins={trendingCoins}
        trendingLoading={trendingLoading}
        trendingError={trendingError}
        isPro={isPro}
        fmt={fmt}
        fmtCompact={fmtCompact}
        fmtPrice={fmtPrice}
        alerts={alerts}
        alertSymbol={alertSymbol}
        setAlertSymbol={setAlertSymbol}
        alertPrice={alertPrice}
        setAlertPrice={setAlertPrice}
        alertDirection={alertDirection}
        setAlertDirection={setAlertDirection}
        alertError={alertError}
        setAlertError={setAlertError}
        createAlertHandler={createAlertHandler}
        deleteAlertHandler={deleteAlertHandler}
      />

      </main>

      {/* ---------- Upgrade Modal ---------- */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowUpgradeModal(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
            {/* Modal header */}
            <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <h2 className="text-lg font-bold text-white">
                Upgrade to CoinSight Pro
              </h2>
              <button
                onClick={() => setShowUpgradeModal(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-200 transition-colors hover:bg-blue-500 hover:text-white"
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5">
              {/* Benefits list */}
              <ul className="mb-5 space-y-3">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-blue-600 dark:text-blue-400">✓</span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    <strong>Unlimited coins</strong> — track as many
                    cryptocurrencies as you want
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-blue-600 dark:text-blue-400">✓</span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    <strong>Ad-free</strong> — clean, uninterrupted portfolio
                    tracking
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-blue-600 dark:text-blue-400">✓</span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    <strong>Pro badge</strong> — show off your Pro status in the
                    app
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-blue-600 dark:text-blue-400">✓</span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    <strong>Multi-wallet address book</strong> — save public
                    addresses from Ethereum, Solana &amp; Bitcoin and track
                    native balances read-only
                  </span>
                </li>
              </ul>

              {/* Plan picker */}
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-700">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Monthly</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">$7.99<span className="text-sm font-normal text-slate-500 dark:text-slate-400">/month</span></p>
                  <p className="mt-1 min-h-10 text-xs text-slate-500 dark:text-slate-400">Flexible, cancel anytime</p>
                  <a href={MONTHLY_STRIPE_URL} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-lg border border-blue-600 px-3 py-2 text-center text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/30">Subscribe</a>
                </div>
                <div className="relative rounded-xl border-2 border-blue-500 bg-blue-50 p-4 dark:bg-blue-900/20">
                  <span className="absolute -top-3 right-3 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white">Best Value</span>
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Annual</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">$80<span className="text-sm font-normal text-slate-500 dark:text-slate-400">/year</span></p>
                  <p className="mt-1 min-h-10 text-xs text-blue-700 dark:text-blue-300">Save 17% — two months free</p>
                  <a href={ANNUAL_STRIPE_URL} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-700">Subscribe</a>
                </div>
              </div>

              {/* Manual activation */}
              <p className="mb-2 text-center text-xs text-slate-400 dark:text-slate-500">
                Already paid? Click here to activate Pro.
              </p>
              <button
                onClick={activatePro}
                className="block w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-center text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                I've paid — activate Pro
              </button>

              {/* Grandfathering note */}
              <p className="mt-4 text-center text-[11px] text-slate-400 dark:text-slate-500">
                Accounts with recurring subscriptions coming soon — early Pro
                supporters will be grandfathered in.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  MyWalletsSection Component                                          */
/* ================================================================== */
function MyWalletsSection({
  isPro,
  prices,
  onHoldingsSynced,
}: {
  isPro: boolean;
  prices: Record<string, number | null>;
  onHoldingsSynced: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [walletAddresses, setWalletAddresses] = useState<
    { id: number; label: string; address: string; blockchain: string; created_at: string }[]
  >([]);
  const [balances, setBalances] = useState<
    Record<number, { nativeBalance: number; nativeSymbol: string }>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load wallet addresses on mount
  useEffect(() => {
    const load = async () => {
      try {
        const addrs = await getWalletAddressesFn();
        setWalletAddresses(addrs);
      } catch {
        /* ignore */
      }
    };
    load();
  }, []);

  // Look up balances for all addresses
  const refreshBalances = async (addrs?: typeof walletAddresses) => {
    const targets = addrs ?? walletAddresses;
    if (targets.length === 0) return;
    setRefreshing(true);
    setError(null);
    try {
      const result = await lookupWalletBalances({
        data: { addresses: targets.map((a) => ({ id: a.id, address: a.address, blockchain: a.blockchain })) },
      });
      const map: Record<number, { nativeBalance: number; nativeSymbol: string }> = {};
      for (const b of result) {
        const addr = targets.find((a) => a.address === b.address);
        if (addr) {
          map[addr.id] = { nativeBalance: b.nativeBalance, nativeSymbol: b.nativeSymbol };
        }
      }
      setBalances(map);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to look up balances");
      return [];
    } finally {
      setRefreshing(false);
    }
  };

  // Load balances on address change
  useEffect(() => {
    if (walletAddresses.length > 0) {
      refreshBalances(walletAddresses);
    }
  }, [walletAddresses.length]);

  // Auto-detect blockchain from address format
  const detectBlockchain = (addr: string): string | null => {
    const trimmed = addr.trim();
    if (trimmed.startsWith("0x") && trimmed.length === 42) return "ethereum";
    if (/^(1|3|bc1)[a-zA-Z0-9]{25,62}$/.test(trimmed)) return "bitcoin";
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return "solana";
    return null;
  };

  // Add wallet address
  const handleAdd = async () => {
    setAddError(null);
    const label = newLabel.trim();
    const address = newAddress.trim();
    if (!label || !address) {
      setAddError("Label and address are required");
      return;
    }
    const blockchain = detectBlockchain(address);
    if (!blockchain) {
      setAddError("Unrecognized address format. Use a 0x... Ethereum address, a base58 Solana address, or a Bitcoin address (1..., 3..., bc1...)");
      return;
    }
    setAddLoading(true);
    try {
      const added = await addWalletAddressFn({ data: { label, address, blockchain } });
      setWalletAddresses((prev) => [...prev, added]);
      setNewLabel("");
      setNewAddress("");
      setShowAddForm(false);
      setAddError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add address";
      setAddError(msg.includes("UNIQUE") ? "This address is already saved" : msg);
    } finally {
      setAddLoading(false);
    }
  };

  // Remove wallet address
  const handleRemove = async (id: number) => {
    try {
      await removeWalletAddressFn({ data: { id } });
      setWalletAddresses((prev) => prev.filter((a) => a.id !== id));
      setBalances((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDeleteConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove address");
    }
  };

  // Sync balances to holdings
  const handleSyncToHoldings = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await syncWalletBalancesFn();
      onHoldingsSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sync balances");
    } finally {
      setRefreshing(false);
    }
  };

  // MetaMask connect — detect and auto-fill
  const handleMetaMaskConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      const ethereum = window.ethereum;
      if (!ethereum) throw new Error("No Ethereum wallet detected. Install MetaMask first.");
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts || accounts.length === 0) throw new Error("No accounts found");
      setNewLabel("MetaMask");
      setNewAddress(accounts[0]);
      setShowAddForm(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      if (msg.includes("User rejected") || msg.includes("denied")) {
        setError("Connection rejected. Please approve the connection request in your wallet.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Phantom connect — try Solana first, fallback to EVM
  const handlePhantomConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      // Try Solana provider first (Phantom is best known for Solana)
      const phantomSol = window.phantom?.solana;
      if (phantomSol) {
        const resp = await phantomSol.connect();
        const addr = resp.publicKey.toString();
        if (!addr) throw new Error("No Solana address found");
        setNewLabel("Phantom (Solana)");
        setNewAddress(addr);
        setShowAddForm(true);
        return;
      }
      // Fallback to EVM provider
      const ethereum = window.ethereum;
      if (ethereum?.isPhantom) {
        const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
        if (!accounts || accounts.length === 0) throw new Error("No accounts found");
        setNewLabel("Phantom");
        setNewAddress(accounts[0]);
        setShowAddForm(true);
        return;
      }
      throw new Error("Phantom not detected. Install the Phantom extension.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      if (msg.includes("User rejected") || msg.includes("denied")) {
        setError("Connection rejected. Please approve the connection request in your wallet.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Trust Wallet connect
  const handleTrustWalletConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      const ethereum = window.ethereum;
      if (!ethereum?.isTrust) throw new Error("Trust Wallet not detected. Install the Trust Wallet extension.");
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts || accounts.length === 0) throw new Error("No accounts found");
      setNewLabel("Trust Wallet");
      setNewAddress(accounts[0]);
      setShowAddForm(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      if (msg.includes("User rejected") || msg.includes("denied")) {
        setError("Connection rejected. Please approve the connection request in your wallet.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Coinbase Wallet connect
  const handleCoinbaseWalletConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      const ethereum = window.ethereum;
      if (!ethereum?.isCoinbaseWallet) throw new Error("Coinbase Wallet not detected. Install the Coinbase Wallet extension.");
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts || accounts.length === 0) throw new Error("No accounts found");
      setNewLabel("Coinbase Wallet");
      setNewAddress(accounts[0]);
      setShowAddForm(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      if (msg.includes("User rejected") || msg.includes("denied")) {
        setError("Connection rejected. Please approve the connection request in your wallet.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Rainbow connect
  const handleRainbowConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      const ethereum = window.ethereum;
      if (!ethereum?.isRainbow) throw new Error("Rainbow not detected. Install the Rainbow extension.");
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts || accounts.length === 0) throw new Error("No accounts found");
      setNewLabel("Rainbow");
      setNewAddress(accounts[0]);
      setShowAddForm(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect";
      if (msg.includes("User rejected") || msg.includes("denied")) {
        setError("Connection rejected. Please approve the connection request in your wallet.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Compute aggregated totals
  const walletTotalUsd = useMemo(() => {
    let total = 0;
    for (const addr of walletAddresses) {
      const bal = balances[addr.id];
      if (bal && bal.nativeBalance > 0) {
        const price = prices[bal.nativeSymbol];
        if (price) total += bal.nativeBalance * price;
      }
    }
    return total;
  }, [walletAddresses, balances, prices]);

  const blockchainIcon = (bc: string) => {
    switch (bc) {
      case "ethereum": return "⟠";
      case "solana": return "◎";
      case "bitcoin": return "₿";
      default: return "?";
    }
  };

  const blockchainLabel = (bc: string) => {
    switch (bc) {
      case "ethereum": return "ETH";
      case "solana": return "SOL";
      case "bitcoin": return "BTC";
      default: return bc;
    }
  };

  const truncateAddr = (addr: string) =>
    addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
      {/* Header — clickable toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            💼 My Wallets
          </span>
          {walletAddresses.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {walletAddresses.length}
            </span>
          )}
        </div>
        <span
          className={`text-slate-400 transition-transform duration-200 dark:text-slate-500 ${
            expanded ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {/* Collapsible body */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-700">
          {/* Subtitle */}
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Read-only. We never access your keys — just public blockchain data. Does not support exchange wallets (Webull, Robinhood, Coinbase, etc.) — only on-chain addresses.
          </p>

          {/* Error message */}
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Aggregate display */}
          {walletAddresses.length > 0 && (
            <div className="mb-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 dark:from-blue-900/10 dark:to-indigo-900/10">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Total from wallets:{" "}
                <span className="text-blue-700 dark:text-blue-400">
                  ${walletTotalUsd.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                  ({walletAddresses.length} address{walletAddresses.length !== 1 ? "es" : ""})
                </span>
              </p>
            </div>
          )}

          {/* Saved addresses list */}
          {walletAddresses.length > 0 && (
            <div className="mb-3 space-y-2">
              {walletAddresses.map((addr) => {
                const bal = balances[addr.id];
                const usdValue =
                  bal && bal.nativeBalance > 0 && prices[bal.nativeSymbol]
                    ? bal.nativeBalance * (prices[bal.nativeSymbol] ?? 0)
                    : null;
                return (
                  <div
                    key={addr.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-600 dark:bg-slate-700/50"
                  >
                    {/* Label */}
                    <span className="min-w-0 flex-shrink font-medium text-sm text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                      {addr.label}
                    </span>

                    {/* Address (truncated) */}
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                      {truncateAddr(addr.address)}
                    </span>

                    {/* Blockchain badge */}
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-600 dark:text-slate-300 flex-shrink-0">
                      {blockchainIcon(addr.blockchain)} {blockchainLabel(addr.blockchain)}
                    </span>

                    {/* Balance */}
                    <span className="ml-auto text-right flex-shrink-0">
                      {bal ? (
                        <>
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {bal.nativeBalance < 0.0001
                              ? bal.nativeBalance.toFixed(8)
                              : bal.nativeBalance.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 4,
                                })}{" "}
                            {bal.nativeSymbol}
                          </span>
                          {usdValue != null && usdValue > 0 && (
                            <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">
                              (${usdValue.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })})
                            </span>
                          )}
                        </>
                      ) : refreshing ? (
                        <span className="text-xs text-slate-400">Loading...</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </span>

                    {/* Delete button with confirmation */}
                    {deleteConfirm === addr.id ? (
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleRemove(addr.id)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(addr.id)}
                        aria-label="Delete wallet"
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* No addresses yet */}
          {walletAddresses.length === 0 && !showAddForm && (
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              No wallets saved yet. Add a public address to track its balance.
            </p>
          )}

          {/* Action buttons row */}
          <div className="flex flex-wrap items-center gap-2">
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                + Add Wallet
              </button>
            )}

            {/* MetaMask connect button (always shown as secondary) */}
            {!showAddForm && (
              <button
                onClick={handleMetaMaskConnect}
                disabled={loading}
                className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:opacity-50 dark:border-orange-800/50 dark:bg-orange-900/20 dark:text-orange-300 dark:hover:bg-orange-900/30"
              >
                {loading ? "Connecting..." : "🦊 MetaMask"}
              </button>
            )}

            {/* Phantom connect button */}
            {!showAddForm && (
              <button
                onClick={handlePhantomConnect}
                disabled={loading}
                className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50 dark:border-purple-800/50 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/30"
              >
                {loading ? "Connecting..." : "👻 Phantom"}
              </button>
            )}

            {/* Trust Wallet connect button */}
            {!showAddForm && (
              <button
                onClick={handleTrustWalletConnect}
                disabled={loading}
                className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                {loading ? "Connecting..." : "🛡️ Trust Wallet"}
              </button>
            )}

            {/* Coinbase Wallet connect button */}
            {!showAddForm && (
              <button
                onClick={handleCoinbaseWalletConnect}
                disabled={loading}
                className="rounded-lg border border-blue-400 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                {loading ? "Connecting..." : "🔷 Coinbase"}
              </button>
            )}

            {/* Rainbow connect button */}
            {!showAddForm && (
              <button
                onClick={handleRainbowConnect}
                disabled={loading}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
              >
                {loading ? "Connecting..." : "🌈 Rainbow"}
              </button>
            )}

            {walletAddresses.length > 0 && (
              <>
                <button
                  onClick={() => refreshBalances()}
                  disabled={refreshing}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
                >
                  {refreshing ? "Loading..." : "🔄 Refresh Balances"}
                </button>
                <button
                  onClick={handleSyncToHoldings}
                  disabled={refreshing}
                  className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 dark:border-green-800/50 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30"
                >
                  {refreshing ? "Syncing..." : "📥 Sync to Portfolio"}
                </button>
              </>
            )}
          </div>

          {/* Add wallet form */}
          {showAddForm && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/30 p-3 dark:border-blue-800/50 dark:bg-blue-900/10">
              <p className="mb-2 text-xs font-medium text-blue-700 dark:text-blue-400">
                Add Public Wallet Address
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="My Ledger"
                  className="flex-1 min-w-[120px] rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="0x... or bc1... or Solana address"
                  className="flex-[2] min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
                <button
                  onClick={handleAdd}
                  disabled={addLoading || !newLabel.trim() || !newAddress.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  {addLoading ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewLabel("");
                    setNewAddress("");
                    setAddError(null);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
              {addError && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{addError}</p>
              )}
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-slate-600" />
              Connecting to wallet...
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ================================================================== */
/*  ExchangeHoldingsSection Component                                   */
/* ================================================================== */
function ExchangeHoldingsSection({
  isPro,
  prices,
  exchangeHoldings,
  onRefresh,
  onHoldingsSynced,
  showAddForm,
  setShowAddForm,
  editId,
  setEditId,
  symbol,
  setSymbol,
  amount,
  setAmount,
  amountMode,
  setAmountMode,
  usdValue,
  setUsdValue,
  exchange,
  setExchange,
  costBasis,
  setCostBasis,
  error,
  setError,
  loading,
  setLoading,
}: {
  isPro: boolean;
  prices: Record<string, number | null>;
  exchangeHoldings: { id: number; symbol: string; amount: number; exchange_name: string; cost_basis: number; created_at: string }[];
  onRefresh: () => void;
  onHoldingsSynced: () => void;
  showAddForm: boolean;
  setShowAddForm: (v: boolean) => void;
  editId: number | null;
  setEditId: (v: number | null) => void;
  symbol: string;
  setSymbol: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  amountMode: "amount" | "usd";
  setAmountMode: (v: "amount" | "usd") => void;
  usdValue: string;
  setUsdValue: (v: string) => void;
  exchange: string;
  setExchange: (v: string) => void;
  costBasis: string;
  setCostBasis: (v: string) => void;
  error: string | null;
  setError: (v: string | null) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const EXCHANGES = [
    "Coinbase", "Binance", "Kraken", "Robinhood", "Webull",
    "Gemini", "Crypto.com", "KuCoin", "Bybit", "OKX", "Other",
  ];

  const coinOptions = useMemo(() => {
    const opts = Object.entries(SYMBOL_MAP).map(([sym, info]) => ({
      symbol: sym,
      name: info.name,
    }));
    opts.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return opts;
  }, []);

  // Convert USD value to asset amount
  const usdToAmount = (usd: string, sym: string): string => {
    const price = prices[sym.toUpperCase()];
    if (!price || price <= 0) return "";
    const val = parseFloat(usd);
    if (isNaN(val)) return "";
    return (val / price).toFixed(8).replace(/\.?0+$/, "");
  };

  // Convert asset amount to USD
  const amountToUsd = (amt: string, sym: string): string => {
    const price = prices[sym.toUpperCase()];
    if (!price || price <= 0) return "";
    const val = parseFloat(amt);
    if (isNaN(val)) return "";
    return (val * price).toFixed(2);
  };

  const handleAdd = async () => {
    setError(null);
    let finalAmount: number;
    if (amountMode === "usd") {
      const price = prices[symbol.toUpperCase()];
      if (!price || price <= 0) {
        setError("Price data not available for " + symbol.toUpperCase());
        return;
      }
      finalAmount = parseFloat(usdValue) / price;
    } else {
      finalAmount = parseFloat(amount);
    }

    if (!symbol.trim()) {
      setError("Please select a coin.");
      return;
    }
    if (isNaN(finalAmount) || finalAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    if (!exchange.trim()) {
      setError("Please select an exchange.");
      return;
    }

    const cb = costBasis.trim() ? parseFloat(costBasis) : 0;
    setLoading(true);
    try {
      if (editId != null) {
        await updateExchangeHoldingFn({ data: { id: editId, symbol: symbol.toUpperCase(), amount: finalAmount, exchangeName: exchange, costBasis: cb } });
      } else {
        await addExchangeHoldingFn({ data: { symbol: symbol.toUpperCase(), amount: finalAmount, exchangeName: exchange, costBasis: cb } });
      }
      setShowAddForm(false);
      setEditId(null);
      setSymbol("");
      setAmount("");
      setUsdValue("");
      setExchange("Coinbase");
      setCostBasis("");
      setError(null);
      onRefresh();
      onHoldingsSynced();
    } catch (err: any) {
      setError(err.message || "Failed to save holding.");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (eh: { id: number; symbol: string; amount: number; exchange_name: string; cost_basis: number }) => {
    setEditId(eh.id);
    setSymbol(eh.symbol);
    setAmount(eh.amount.toString());
    setUsdValue("");
    setAmountMode("amount");
    setExchange(eh.exchange_name);
    setCostBasis(eh.cost_basis ? eh.cost_basis.toString() : "");
    setError(null);
    setShowAddForm(true);
  };

  const handleDelete = async (id: number) => {
    setLoading(true);
    try {
      await deleteExchangeHoldingFn({ data: { id } });
      onRefresh();
      onHoldingsSynced();
    } catch (err: any) {
      setError(err.message || "Failed to delete holding.");
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setShowAddForm(false);
    setEditId(null);
    setSymbol("");
    setAmount("");
    setUsdValue("");
    setExchange("Coinbase");
    setCostBasis("");
    setError(null);
  };

  // Calculate exchange total
  const exchangeTotal = useMemo(() => {
    return exchangeHoldings.reduce((sum, eh) => {
      const price = prices[eh.symbol];
      return sum + (price ? eh.amount * price : 0);
    }, 0);
  }, [exchangeHoldings, prices]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const fmtCrypto = (n: number) => {
    if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
    return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          🏦 Exchange Holdings
          {exchangeHoldings.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
              ({exchangeHoldings.length} holding{exchangeHoldings.length !== 1 ? "s" : ""})
            </span>
          )}
        </span>
        <span className="text-xs text-slate-400 transition-transform dark:text-slate-500" style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-700">
          {/* Disclaimer */}
          <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
            Your data is stored privately and visible only to you. Not end-to-end encrypted.
          </p>

          {/* Existing holdings */}
          {exchangeHoldings.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
                    <th className="pb-2 font-medium">Exchange</th>
                    <th className="pb-2 font-medium">Asset</th>
                    <th className="pb-2 font-medium text-right">Amount</th>
                    <th className="pb-2 font-medium text-right">Value</th>
                    <th className="pb-2 font-medium text-right">P&amp;L</th>
                    <th className="pb-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {exchangeHoldings.map((eh) => {
                    const price = prices[eh.symbol] ?? 0;
                    const value = eh.amount * price;
                    const pnl = eh.cost_basis > 0 ? value - eh.cost_basis : null;
                    const pnlPct = eh.cost_basis > 0 ? ((value - eh.cost_basis) / eh.cost_basis) * 100 : null;
                    return (
                      <tr key={eh.id} className="border-b border-slate-50 dark:border-slate-700/50">
                        <td className="py-2 pr-3">
                          <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {eh.exchange_name}
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-200">
                          {eh.symbol}
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-600 dark:text-slate-400">
                          {fmtCrypto(eh.amount)}
                        </td>
                        <td className="py-2 pr-3 text-right font-medium text-slate-800 dark:text-slate-200">
                          {fmt(value)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {pnl != null ? (
                            <span className={pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                              {pnl >= 0 ? "+" : ""}{fmt(Math.abs(pnl))}
                              <span className="ml-1 text-xs">
                                ({pnlPct! >= 0 ? "+" : ""}{pnlPct!.toFixed(2)}%)
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">\u2014</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(eh)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                              title="Edit"
                            >
                              \u270f\ufe0f
                            </button>
                            <button
                              onClick={() => handleDelete(eh.id)}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                              title="Delete"
                            >
                              \u2715
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Exchange total summary */}
          {exchangeHoldings.length > 0 && (
            <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-700/50">
              <span className="text-slate-600 dark:text-slate-300">
                Exchange total:{" "}
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {fmt(exchangeTotal)}
                </span>{" "}
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  ({exchangeHoldings.length} holding{exchangeHoldings.length !== 1 ? "s" : ""})
                </span>
              </span>
            </div>
          )}

          {/* Error message */}
          {error && !showAddForm && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Add/Edit Form */}
          {showAddForm && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
              <p className="mb-3 text-xs font-medium text-blue-700 dark:text-blue-400">
                {editId != null ? "Edit Holding" : "Add Holding"}
              </p>

              {/* Exchange dropdown */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Exchange
                </label>
                <select
                  value={exchange}
                  onChange={(e) => setExchange(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                >
                  {EXCHANGES.map((ex) => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                </select>
              </div>

              {/* Coin dropdown */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Coin
                </label>
                <select
                  value={symbol}
                  onChange={(e) => {
                    setSymbol(e.target.value);
                    if (amountMode === "usd" && usdValue) {
                      const amt = usdToAmount(usdValue, e.target.value);
                      if (amt) setAmount(amt);
                    }
                  }}
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                >
                  <option value="">Select a coin...</option>
                  {coinOptions.map((c) => (
                    <option key={c.symbol} value={c.symbol}>
                      {c.symbol} \u2014 {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode toggle */}
              <div className="mb-3 flex gap-2">
                <button
                  onClick={() => setAmountMode("amount")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    amountMode === "amount"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600"
                  }`}
                >
                  Asset Amount
                </button>
                <button
                  onClick={() => setAmountMode("usd")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    amountMode === "usd"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600"
                  }`}
                >
                  USD Value
                </button>
              </div>

              {/* Input fields based on mode */}
              {amountMode === "amount" ? (
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Amount ({symbol || "BTC"})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                    placeholder="0.00"
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                  />
                  {symbol && prices[symbol.toUpperCase()] && amount && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      \u2248 {fmt(parseFloat(amount || "0") * (prices[symbol.toUpperCase()] || 0))}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    USD Value ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={usdValue}
                    onChange={(e) => {
                      setUsdValue(e.target.value);
                      const amt = usdToAmount(e.target.value, symbol);
                      if (amt) setAmount(amt);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                    placeholder="0.00"
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                  />
                  {symbol && prices[symbol.toUpperCase()] && usdValue && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      \u2248 {fmtCrypto(parseFloat(usdValue || "0") / (prices[symbol.toUpperCase()] || 1))} {symbol}
                    </p>
                  )}
                </div>
              )}

              {/* Cost Basis (optional) */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Cost Basis ($) \u2014 optional
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={costBasis}
                  onChange={(e) => setCostBasis(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  placeholder="Total cost in USD"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={loading}
                  className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Saving..." : editId != null ? "Update" : "Save"}
                </button>
                <button
                  onClick={cancelEdit}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Add button (when form not shown) */}
          {!showAddForm && (
            <button
              onClick={() => {
                setShowAddForm(true);
                setEditId(null);
                setSymbol("");
                setAmount("");
                setUsdValue("");
                setExchange("Coinbase");
                setCostBasis("");
                setError(null);
              }}
              className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              + Add Holding
            </button>
          )}

          {/* Loading indicator */}
          {loading && !showAddForm && (
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-slate-600" />
              Processing...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
