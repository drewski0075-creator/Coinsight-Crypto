import { createFileRoute, Link } from "@tanstack/react-router";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
type CoinDetail = {
  id: string;
  name: string;
  symbol: string;
  image: { large: string };
  description: { en: string };
  market_data: {
    current_price: { usd: number };
    market_cap: { usd: number };
    total_volume: { usd: number };
    price_change_percentage_24h: number | null;
    price_change_percentage_7d: number | null;
    price_change_percentage_30d: number | null;
    high_24h: { usd: number };
    low_24h: { usd: number };
    circulating_supply: number | null;
    total_supply: number | null;
  };
};

type LoaderData = { coin: CoinDetail | null; error: string | null };

/* ------------------------------------------------------------------ */
/*  In-memory cache for CoinGecko coin detail (60s TTL)                 */
/* ------------------------------------------------------------------ */
const coinCache = new Map<string, { data: CoinDetail; ts: number }>();
const CACHE_TTL = 60_000;

/* ------------------------------------------------------------------ */
/*  Route                                                               */
/* ------------------------------------------------------------------ */
export const Route = createFileRoute("/coin/$coinId")({
  loader: async ({ params }): Promise<LoaderData> => {
    const { coinId } = params;

    // Check cache first
    const cached = coinCache.get(coinId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return { coin: cached.data, error: null };
    }

    const url = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;

    const fetchWithRetry = async (retries: number): Promise<Response> => {
      const res = await fetch(url);
      if (res.status === 429 && retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return fetchWithRetry(retries - 1);
      }
      return res;
    };

    try {
      const res = await fetchWithRetry(1); // retry once on 429

      if (res.status === 404) {
        return { coin: null, error: "Coin not found. Check the URL or try a different coin." };
      }

      if (!res.ok) {
        return { coin: null, error: `API error (${res.status}). Please try again.` };
      }

      const data = (await res.json()) as CoinDetail;
      coinCache.set(coinId, { data, ts: Date.now() });
      return { coin: data, error: null };
    } catch (err) {
      return {
        coin: null,
        error: err instanceof Error ? err.message : "Failed to load coin data",
      };
    }
  },

  staleTime: 60_000,
  pendingComponent: () => <LoadingSkeleton />,
  component: CoinDetailPage,
});

/* ------------------------------------------------------------------ */
/*  Formatters                                                          */
/* ------------------------------------------------------------------ */
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtCompact(n: number) {
  if (n >= 1_000_000_000_000) return "$" + (n / 1_000_000_000_000).toFixed(2) + "T";
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return fmt(n);
}

function fmtPrice(n: number) {
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
}

function fmtSupply(n: number) {
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + "T";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("en-US");
}

function pctClass(n: number | null): string {
  if (n == null) return "text-slate-400 dark:text-slate-500";
  return n >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}
function pctText(n: number | null): string {
  if (n == null) return "\u2014";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}
function pctArrow(n: number | null): string {
  if (n == null) return "";
  return n >= 0 ? "\u25B2" : "\u25BC";
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                    */
/* ------------------------------------------------------------------ */
function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 animate-pulse">
      {/* Back link skeleton */}
      <div className="mb-6 h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />

      {/* Hero section skeleton */}
      <div className="mb-8 flex items-center gap-5">
        <div className="h-20 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-10 w-36 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>

      {/* Stats grid skeleton */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
            <div className="mb-2 h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-6 w-32 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        ))}
      </div>

      {/* Price changes skeleton */}
      <div className="mb-8 flex gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-28 rounded-lg bg-slate-200 dark:bg-slate-700" />
        ))}
      </div>

      {/* About skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-600 dark:bg-slate-800">
        <div className="mb-3 h-5 w-24 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-5/6 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-4/6 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error state                                                         */
/* ------------------------------------------------------------------ */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        to="/"
        className="mb-6 inline-flex min-h-11 items-center gap-1 text-sm" font-medium text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
      >
        {"\u2190"} Back to Home
      </Link>
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800/50 dark:bg-red-900/20">
        <div className="mb-3 text-4xl">{"\uD83D\uDE15"}</div>
        <p className="mb-1 text-lg font-semibold text-red-700 dark:text-red-400">
          Coin not found
        </p>
        <p className="mb-4 text-sm text-red-600 dark:text-red-400/80">
          {message}
        </p>
        <button
          onClick={onRetry}
          className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */
function CoinDetailPage() {
  const { coin, error } = Route.useLoaderData();

  /* -- Loading (handled by SSR, but belt-and-suspenders for client nav) -- */
  if (!coin && !error) return <LoadingSkeleton />;

  /* -- Error -- */
  if (error || !coin) {
    return (
      <ErrorState
        message={error ?? "Unknown error"}
        onRetry={() => window.location.reload()}
      />
    );
  }

  /* -- Description excerpt (first ~500 chars, ends at sentence boundary) -- */
  const rawDesc = coin.description?.en ?? "";
  let descriptionExcerpt = rawDesc.slice(0, 500);
  if (rawDesc.length > 500) {
    const lastPeriod = descriptionExcerpt.lastIndexOf(".");
    if (lastPeriod > 300) {
      descriptionExcerpt = descriptionExcerpt.slice(0, lastPeriod + 1);
    } else {
      descriptionExcerpt = descriptionExcerpt.slice(0, descriptionExcerpt.lastIndexOf(" ")) + "...";
    }
  }

  const arePriceChangesSameDay =
    coin.market_data.price_change_percentage_24h === coin.market_data.price_change_percentage_7d &&
    coin.market_data.price_change_percentage_24h === coin.market_data.price_change_percentage_30d;

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900">
      {/* Simple header bar */}
      <header className="sticky top-0 z-50 h-16 bg-white shadow-sm dark:bg-slate-800 dark:shadow-slate-900/50">
        <div className="mx-auto flex h-full max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
            >
              <img src="/logo-icon.png" alt="CoinSight" className="h-7 w-7" />
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">CoinSight</span>
            </Link>
          </div>
          <nav className="flex items-center gap-6">
            <Link
              to="/app"
              preload="intent"
              className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Dashboard
            </Link>
            <Link
              to="/"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <a
          href="/app"
          onClick={(e) => {
            e.preventDefault();
            if (typeof window !== "undefined" && window.top !== window.self) {
              window.top!.location.href = "/app";
            } else {
              window.location.href = "/app";
            }
          }}
          className="mb-6 inline-flex min-h-11 items-center gap-1 text-sm" font-medium text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
        >
          {"←"} Back
        </a>

        {/* Hero section */}
        <div className="mb-8 flex flex-wrap items-center gap-5">
          <img
            src={coin.image.large}
            alt={coin.name}
            className="h-20 w-20 rounded-full shadow-md"
          />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {coin.name}
            </h1>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {coin.symbol}
            </p>
            <p className="mt-1 font-mono text-3xl font-bold text-slate-900 dark:text-slate-100">
              {fmtPrice(coin.market_data.current_price.usd)}
            </p>
            {coin.market_data.price_change_percentage_24h != null && (
              <p
                className={`mt-0.5 text-sm font-semibold ${
                  pctClass(coin.market_data.price_change_percentage_24h)
                }`}
              >
                {pctArrow(coin.market_data.price_change_percentage_24h)}{" "}
                {pctText(coin.market_data.price_change_percentage_24h)} (24h)
              </p>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Market Cap */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Market Cap
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {coin.market_data.market_cap?.usd
                ? fmtCompact(coin.market_data.market_cap.usd)
                : "\u2014"}
            </p>
          </div>

          {/* 24h Volume */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              24h Volume
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {coin.market_data.total_volume?.usd
                ? fmtCompact(coin.market_data.total_volume.usd)
                : "\u2014"}
            </p>
          </div>

          {/* 24h High / Low */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              24h High / Low
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {fmtPrice(coin.market_data.high_24h.usd)}{" "}
              <span className="text-sm font-normal text-slate-400 dark:text-slate-500">/</span>{" "}
              {fmtPrice(coin.market_data.low_24h.usd)}
            </p>
          </div>

          {/* Circulating Supply */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Circulating Supply
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {coin.market_data.circulating_supply != null
                ? fmtSupply(coin.market_data.circulating_supply)
                : "\u2014"}
              {coin.market_data.total_supply != null && (
                <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                  {" "}/ {fmtSupply(coin.market_data.total_supply)} max
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Price changes row */}
        <div className="mb-8 flex flex-wrap gap-3">
          {/* 24h */}
          <div
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
              coin.market_data.price_change_percentage_24h != null && coin.market_data.price_change_percentage_24h >= 0
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">24h</span>
            {pctArrow(coin.market_data.price_change_percentage_24h)}{" "}
            {pctText(coin.market_data.price_change_percentage_24h)}
          </div>

          {/* 7d */}
          <div
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
              coin.market_data.price_change_percentage_7d != null && coin.market_data.price_change_percentage_7d >= 0
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">7d</span>
            {pctArrow(coin.market_data.price_change_percentage_7d)}{" "}
            {pctText(coin.market_data.price_change_percentage_7d)}
          </div>

          {/* 30d */}
          <div
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
              coin.market_data.price_change_percentage_30d != null && coin.market_data.price_change_percentage_30d >= 0
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            <span className="text-xs font-medium uppercase tracking-wide opacity-70">30d</span>
            {pctArrow(coin.market_data.price_change_percentage_30d)}{" "}
            {pctText(coin.market_data.price_change_percentage_30d)}
          </div>
        </div>

        {/* About section */}
        {descriptionExcerpt && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              {"\u2139\uFE0F"} About {coin.name}
            </h2>
            <div
              className="text-sm leading-relaxed text-slate-600 dark:text-slate-400"
              dangerouslySetInnerHTML={{ __html: descriptionExcerpt }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
