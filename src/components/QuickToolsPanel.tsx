import React, { useEffect, useRef, useState, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types (mirrored from app.tsx)                                      */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */
interface QuickToolsPanelProps {
  topCoins: TopCoin[];
  topCoinsLoading: boolean;
  topCoinsError: string | null;
  watchlist: WatchlistEntry[];
  watchlistCoins: WatchlistCoinData[];
  watchlistLoading: boolean;
  watchlistSymbol: string;
  setWatchlistSymbol: (s: string) => void;
  watchlistError: string | null;
  setWatchlistError: (e: string | null) => void;
  addToWatchlistHandler: () => void;
  removeFromWatchlist: (id: number) => void;
  trendingCoins: TrendingCoin[];
  trendingLoading: boolean;
  trendingError: string | null;
  isPro: boolean;
  fmt: (n: number) => string;
  fmtCompact: (n: number) => string;
  fmtPrice: (n: number) => string;
  // Alerts
  alerts: Alert[];
  alertSymbol: string;
  setAlertSymbol: (s: string) => void;
  alertPrice: string;
  setAlertPrice: (p: string) => void;
  alertDirection: string;
  setAlertDirection: (d: string) => void;
  alertError: string | null;
  setAlertError: (e: string | null) => void;
  createAlertHandler: () => void;
  deleteAlertHandler: (id: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Sparkline SVG component (copied from app.tsx)                      */
/* ------------------------------------------------------------------ */
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
  if (prevProps.width !== nextProps.width || prevProps.height !== nextProps.height) return false;
  if (prevProps.positive !== nextProps.positive) return false;
  if (prevProps.prices && nextProps.prices) {
    if (prevProps.prices.length !== nextProps.prices.length) return false;
    if (prevProps.prices[0] !== nextProps.prices[0]) return false;
    if (prevProps.prices[prevProps.prices.length - 1] !== nextProps.prices[nextProps.prices.length - 1]) return false;
  }
  return true;
});

/* ------------------------------------------------------------------ */
/*  Tab type                                                           */
/* ------------------------------------------------------------------ */
type TabKey = "top" | "watchlist" | "trending" | "alerts";

const TAB_LABELS: Record<TabKey, string> = {
  top: "🔥 Top Coins",
  watchlist: "📋 Watchlist",
  trending: "📰 Trending",
  alerts: "🔔 Alerts",
};

/* ------------------------------------------------------------------ */
/*  QuickToolsPanel                                                    */
/* ------------------------------------------------------------------ */
export default function QuickToolsPanel(props: QuickToolsPanelProps) {
  const {
    topCoins, topCoinsLoading, topCoinsError,
    watchlist, watchlistCoins, watchlistLoading,
    watchlistSymbol, setWatchlistSymbol, watchlistError, setWatchlistError,
    addToWatchlistHandler, removeFromWatchlist,
    trendingCoins, trendingLoading, trendingError,
    isPro, fmt, fmtCompact, fmtPrice,
    alerts, alertSymbol, setAlertSymbol, alertPrice, setAlertPrice,
    alertDirection, setAlertDirection, alertError, setAlertError,
    createAlertHandler, deleteAlertHandler,
  } = props;

  /* -- persisted state ---------------------------------------------- */
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem("qt_open") === "true"; } catch { return false; }
  });
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    try { return (localStorage.getItem("qt_tab") as TabKey) || "top"; } catch { return "top"; }
  });
  const [activeCoinId, setActiveCoinId] = useState<string | null>(null);

  /* -- drag state --------------------------------------------------- */
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const initialized = useRef(false);

  // Set default position on mount (top-right offset from trigger)
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const isMobile = window.innerWidth < 640;
      setPosition({
        x: isMobile ? Math.max(0, (window.innerWidth - window.innerWidth * 0.95) / 2) : Math.max(0, window.innerWidth - 498),
        y: 80,
      });
    }
  }, []);

  // Persist open/closed
  useEffect(() => {
    try { localStorage.setItem("qt_open", String(open)); } catch { /* noop */ }
  }, [open]);

  // Persist active tab
  useEffect(() => {
    try { localStorage.setItem("qt_tab", activeTab); } catch { /* noop */ }
  }, [activeTab]);

  /* -- drag handlers ------------------------------------------------ */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const panelWidth = Math.min(window.innerWidth * 0.95, 460);
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - panelWidth, dragRef.current.startPosX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startPosY + dy)),
      });
    };
    const handleMouseUp = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  /* -- helpers ------------------------------------------------------ */
  const toggleOpen = () => setOpen((o) => !o);
  const closePanel = () => setOpen(false);

  // Total interesting items for badge
  const totalItems = topCoins.length + (isPro ? watchlist.length + trendingCoins.length : 0);

  /* -- render ------------------------------------------------------- */
  return (
    <>
      {/* Trigger button (always visible unless panel is open and not closed) */}
      {!open && (
        <button
          onClick={toggleOpen}
          aria-label="Open Quick Tools"
          className="fixed right-4 top-20 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700 sm:right-6 sm:top-6"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {totalItems > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {totalItems > 99 ? "99+" : totalItems}
            </span>
          )}
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div
          ref={panelRef}
          className="fixed z-50 w-[95vw] max-w-[460px] rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-800"
          style={{ left: position.x, top: position.y }}
        >
          {/* Drag handle + title + controls */}
          <div
            className={`flex items-center justify-between rounded-t-xl bg-slate-50 px-4 py-2 dark:bg-slate-700 ${
              dragging ? "cursor-grabbing select-none" : "cursor-grab"
            }`}
            onMouseDown={handleMouseDown}
          >
            <span className="select-none text-xs font-medium text-slate-500 dark:text-slate-400">
              ⚡ Quick Tools
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleOpen}
                aria-label="Minimize panel"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-600 dark:hover:text-slate-300"
              >
                −
              </button>
              <button
                onClick={closePanel}
                aria-label="Close panel"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              >
                ×
              </button>
            </div>
          </div>

          {/* Tab buttons */}
          <div className="flex border-b border-slate-100 dark:border-slate-700">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => {
              // Watchlist and Alerts tabs only for Pro
              if ((tab === "watchlist" || tab === "alerts") && !isPro) return null;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    activeTab === tab
                      ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {TAB_LABELS[tab]}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="max-h-[480px] overflow-y-auto">
            {activeCoinId ? (
              <div className="flex flex-col" style={{ height: "480px" }}>
                <button
                  onClick={() => setActiveCoinId(null)}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  ← Back to Quick Tools
                </button>
                <iframe
                  src={`/coin/${activeCoinId}`}
                  className="flex-1 w-full border-0"
                  title="Coin detail"
                />
              </div>
            ) : (
              <>
            {/* ---- Top Coins Tab ---- */}
            {activeTab === "top" && (
              <div>
                {topCoinsError && topCoins.length === 0 && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Unable to load top coins. Retrying...
                    </p>
                  </div>
                )}
                {topCoinsLoading && topCoins.length === 0 && (
                  <div className="flex gap-4 overflow-x-auto px-2 py-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="flex min-w-[140px] flex-1 animate-pulse flex-col gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-700"
                      >
                        <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-600" />
                        <div className="h-5 w-24 rounded bg-slate-200 dark:bg-slate-600" />
                        <div className="h-3 w-14 rounded bg-slate-200 dark:bg-slate-600" />
                        <div className="mt-1 h-8 w-full rounded bg-slate-200 dark:bg-slate-600" />
                      </div>
                    ))}
                  </div>
                )}
                {topCoins.length > 0 && (
                  <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-700">
                    {topCoins.map((coin) => {
                      const positive = coin.price_change_percentage_24h >= 0;
                      const sparklinePrices = coin.sparkline_in_7d?.price ?? [];
                      const sparklineUp =
                        sparklinePrices.length >= 2 &&
                        sparklinePrices[sparklinePrices.length - 1] >= sparklinePrices[0];

                      return (
                        <div
                          key={coin.id}
                          onClick={() => setActiveCoinId(coin.id)}
                          className="flex flex-col bg-white p-3 transition-colors hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <img
                              src={coin.image}
                              alt={coin.name}
                              className="h-5 w-5 rounded-full"
                              loading="lazy"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                                {coin.name}
                              </p>
                              <p className="text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                                {coin.symbol}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {fmtPrice(coin.current_price)}
                          </p>
                          <p
                            className={`mt-0.5 text-[11px] font-medium ${
                              positive ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {positive ? "▲" : "▼"}{" "}
                            {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
                          </p>
                          <div className="mt-1">
                            {sparklinePrices.length >= 2 ? (
                              <Sparkline
                                prices={sparklinePrices}
                                width={100}
                                height={28}
                                positive={sparklineUp}
                              />
                            ) : (
                              <div className="flex h-7 items-center">
                                <span className="text-[10px] text-slate-300 dark:text-slate-600">
                                  No chart data
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ---- Watchlist Tab ---- */}
            {activeTab === "watchlist" && (
              <div>
                {!isPro ? (
                  <div className="flex flex-col items-center justify-center px-4 py-8">
                    <span className="mb-2 text-3xl">🔒</span>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Pro Feature
                    </p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Upgrade to CoinSight Pro to use the Watchlist.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Add coin form */}
                    <div className="px-3 py-2">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={watchlistSymbol}
                            onChange={(e) => {
                              setWatchlistSymbol(e.target.value);
                              setWatchlistError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addToWatchlistHandler();
                            }}
                            placeholder="e.g. BTC"
                            className="h-9 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                          />
                        </div>
                        <button
                          onClick={addToWatchlistHandler}
                          disabled={!watchlistSymbol.trim() || watchlist.length >= 10}
                          className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-medium text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                      {watchlistError && (
                        <p className="mt-1 text-[11px] text-red-500 dark:text-red-400">{watchlistError}</p>
                      )}
                      {watchlist.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                          {watchlist.length}/10 slots used
                        </p>
                      )}
                    </div>

                    {/* Watchlist grid */}
                    <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-700">
                      {watchlistCoins.map((coin) => {
                        const positive = coin.price_change_percentage_24h >= 0;
                        const sparklinePrices = coin.sparkline_in_7d?.price ?? [];
                        const sparklineUp =
                          sparklinePrices.length >= 2 &&
                          sparklinePrices[sparklinePrices.length - 1] >= sparklinePrices[0];
                        const entry = watchlist.find((w) => w.coin_id === coin.id);

                        return (
                          <div
                            key={coin.id}
                            onClick={() => setActiveCoinId(coin.id)}
                            className="relative flex flex-col bg-white p-3 transition-colors hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            {entry && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeFromWatchlist(entry.id);
                                }}
                                aria-label={`Remove ${coin.symbol}`}
                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                              >
                                ✕
                              </button>
                            )}

                            <div className="mb-1 flex items-center gap-2">
                              <img
                                src={coin.image}
                                alt={coin.name}
                                className="h-5 w-5 rounded-full"
                                loading="lazy"
                              />
                              <div className="min-w-0 flex-1 pr-4">
                                <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                                  {coin.name}
                                </p>
                                <p className="text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                                  {coin.symbol}
                                </p>
                              </div>
                            </div>

                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {fmtPrice(coin.current_price)}
                            </p>

                            <p
                              className={`mt-0.5 text-[11px] font-medium ${
                                positive ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {positive ? "▲" : "▼"}{" "}
                              {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
                            </p>

                            <div className="mt-1">
                              {sparklinePrices.length >= 2 ? (
                                <Sparkline
                                  prices={sparklinePrices}
                                  width={100}
                                  height={28}
                                  positive={sparklineUp}
                                />
                              ) : (
                                <div className="flex h-7 items-center">
                                  <span className="text-[10px] text-slate-300 dark:text-slate-600">
                                    No chart data
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Loading state */}
                      {watchlistLoading && watchlistCoins.length === 0 && watchlist.length > 0 &&
                        watchlist.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex animate-pulse flex-col gap-2 bg-white p-3 dark:bg-slate-800"
                          >
                            <div className="flex items-center gap-2">
                              <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-600" />
                              <div>
                                <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-600" />
                                <div className="mt-1 h-2 w-8 rounded bg-slate-200 dark:bg-slate-600" />
                              </div>
                            </div>
                            <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-600" />
                            <div className="h-3 w-12 rounded bg-slate-200 dark:bg-slate-600" />
                            <div className="mt-1 h-7 w-full rounded bg-slate-200 dark:bg-slate-600" />
                          </div>
                        ))}

                      {/* Empty slots */}
                      {Array.from({
                        length: Math.max(0, 10 - watchlistCoins.length -
                          (watchlistLoading && watchlistCoins.length === 0 ? watchlist.length : 0))
                      }).map((_, i) => (
                        <div
                          key={`empty-${i}`}
                          className="flex flex-col items-center justify-center bg-white p-3 dark:bg-slate-800"
                        >
                          <div className="flex h-full min-h-[100px] flex-col items-center justify-center gap-1">
                            <span className="text-2xl text-slate-300 dark:text-slate-600">+</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              Add Coin
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Empty state */}
                    {watchlist.length === 0 && !watchlistLoading && (
                      <div className="px-4 py-3">
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          Add coins you want to track closely. Up to 10 slots available.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ---- Trending Tab ---- */}
            {activeTab === "trending" && (
              <div>
                {!isPro ? (
                  <div className="flex flex-col items-center justify-center px-4 py-8">
                    <span className="mb-2 text-3xl">🔒</span>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Pro Feature
                    </p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Upgrade to CoinSight Pro to see trending coins.
                    </p>
                  </div>
                ) : (
                  <>
                    {trendingLoading && (
                      <div className="space-y-2 px-3 py-2">
                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                          <div key={i} className="flex animate-pulse items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-600" />
                            <div className="flex-1">
                              <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-600" />
                              <div className="mt-1 h-2 w-12 rounded bg-slate-200 dark:bg-slate-600" />
                            </div>
                            <div className="h-4 w-14 rounded bg-slate-200 dark:bg-slate-600" />
                          </div>
                        ))}
                      </div>
                    )}

                    {!trendingLoading && trendingError && (
                      <div className="px-4 py-3">
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          Unable to load trending data
                        </p>
                      </div>
                    )}

                    {!trendingLoading && !trendingError && trendingCoins.length > 0 && (
                      <div>
                        {trendingCoins.map((coin, idx) => {
                          const positive = (coin.price_change_percentage_24h_usd ?? 0) >= 0;
                          return (
                            <div
                              key={coin.id}
                              onClick={() => setActiveCoinId(coin.id)}
                              className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50 cursor-pointer"
                            >
                              <span className="w-5 text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                                {idx + 1}
                              </span>
                              <img
                                src={coin.thumb}
                                alt={coin.name}
                                className="h-6 w-6 rounded-full"
                                loading="lazy"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                                  {coin.name}
                                </p>
                                <p className="text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                                  {coin.symbol}
                                </p>
                              </div>
                              {coin.market_cap_rank != null && (
                                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                                  #{coin.market_cap_rank}
                                </span>
                              )}
                              {coin.price_change_percentage_24h_usd != null && (
                                <span
                                  className={`text-[11px] font-medium ${
                                    positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                  }`}
                                >
                                  {positive ? "▲" : "▼"}{" "}
                                  {Math.abs(coin.price_change_percentage_24h_usd).toFixed(2)}%
                                </span>
                              )}
                              <span className="text-slate-300 dark:text-slate-600">→</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!trendingLoading && !trendingError && trendingCoins.length === 0 && (
                      <div className="px-4 py-3">
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          No trending data available right now.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ---- Alerts Tab ---- */}
            {activeTab === "alerts" && (
              <div>
                {!isPro ? (
                  <div className="flex flex-col items-center justify-center px-4 py-8">
                    <span className="mb-2 text-3xl">🔒</span>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Pro Feature
                    </p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Upgrade to CoinSight Pro to set price alerts.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Create alert form */}
                    <div className="px-3 py-2">
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            Coin
                          </label>
                          <input
                            type="text"
                            value={alertSymbol}
                            onChange={(e) => {
                              setAlertSymbol(e.target.value);
                              setAlertError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") createAlertHandler();
                            }}
                            placeholder="e.g. BTC"
                            className="h-9 w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-xs placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            Target (USD)
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={alertPrice}
                            onChange={(e) => {
                              setAlertPrice(e.target.value);
                              setAlertError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") createAlertHandler();
                            }}
                            placeholder="0.00"
                            className="h-9 w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-xs placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            When
                          </label>
                          <select
                            value={alertDirection}
                            onChange={(e) => setAlertDirection(e.target.value)}
                            className="h-9 rounded-lg border border-slate-300 px-2 py-1.5 text-xs transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                          >
                            <option value="above">Above</option>
                            <option value="below">Below</option>
                          </select>
                        </div>
                        <button
                          onClick={createAlertHandler}
                          disabled={!alertSymbol.trim() || !alertPrice}
                          className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-medium text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Set Alert
                        </button>
                      </div>
                      {alertError && (
                        <p className="mt-1 text-[11px] text-red-500 dark:text-red-400">{alertError}</p>
                      )}
                    </div>

                    {/* Active alerts list */}
                    {alerts.length > 0 && (
                      <>
                        <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-700">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Active Alerts
                          </p>
                        </div>
                        {alerts.map((alert) => (
                          <div
                            key={alert.id}
                            className="flex items-center justify-between border-t border-slate-100 px-3 py-2 dark:border-slate-700"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                                {alert.symbol}
                              </span>
                              <span className="text-xs text-slate-600 dark:text-slate-400">
                                {alert.direction === "above" ? "above" : "below"}{" "}
                                <span className="font-semibold text-slate-900 dark:text-slate-100">
                                  {fmtPrice(alert.target_price)}
                                </span>
                              </span>
                            </div>
                            <button
                              onClick={() => deleteAlertHandler(alert.id)}
                              aria-label={`Delete alert for ${alert.symbol}`}
                              className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Empty state */}
                    {alerts.length === 0 && (
                      <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-700">
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          No active alerts. Set one above to get notified when a coin hits your target.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
