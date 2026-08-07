import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { trackPageViewFn } from "~/server-fns";

export const Route = createFileRoute("/")({
  component: Home,
});

type Cell = true | false | string;

const compareRows: { feature: string; free: Cell; pro: Cell; max: Cell }[] = [
  { feature: "Transactions"
    , free: "No limit", pro: "No limit", max: "No limit" },
  { feature: "Coins tracked", free: "Up to 10", pro: "Unlimited", max: "Unlimited" },
  { feature: "Price refresh", free: "60 seconds", pro: "30 seconds", max: "30 seconds" },
  { feature: "Real-time CoinGecko prices", free: true, pro: true, max: true },
  { feature: "Dashboard with Top 5 sparkline charts", free: true, pro: true, max: true },
  { feature: "Browser wallet detection", free: true, pro: true, max: true },
  { feature: "Price alerts (email notifications)", free: false, pro: true, max: true },
  { feature: "Import exchange history (CSV) — Coinbase, Binance, Kraken, Robinhood", free: false, pro: true, max: true },
  { feature: "Transaction ledger with buy/sell/net summaries", free: false, pro: true, max: true },
  { feature: "Export portfolio data (CSV)", free: false, pro: true, max: true },
  { feature: "Tax reports — spreadsheet & PDF", free: false, pro: true, max: true },
  { feature: "Exchange holdings tracking", free: false, pro: true, max: true },
  { feature: "Source breakdown (on-chain vs exchange vs manual)", free: false, pro: true, max: true },
  { feature: "Multi-wallet address book (5 wallets)", free: false, pro: true, max: true },
  { feature: "Historical P&L chart (7-day)", free: false, pro: true, max: true },
  { feature: "Share links", free: false, pro: true, max: true },
  { feature: "Data health card", free: false, pro: true, max: true },
  { feature: "Position history", free: false, pro: true, max: true },
  { feature: "Premium badge", free: false, pro: true, max: true },
  { feature: "Ad-free experience", free: false, pro: true, max: true },
  { feature: "FIFO lot tracking with purchase dates", free: false, pro: false, max: true },
  { feature: "Realized P&L matched to specific lots", free: false, pro: false, max: true },
  { feature: "Cost basis column in holdings table", free: false, pro: false, max: true },
  { feature: "Unrealized & realized P&L labels", free: false, pro: false, max: true },
  { feature: "FIFO-based tax reports", free: false, pro: false, max: true },
];

function CompareCell({ value, tier }: { value: Cell; tier?: "pro" | "max" }) {
  const checkColor = tier === "max" ? "text-purple-500" : "text-green-500";
  const cellBg =
    tier === "pro"
      ? "bg-blue-50/40 dark:bg-blue-900/10"
      : tier === "max"
        ? "bg-gradient-to-b from-purple-50/30 to-amber-50/30 dark:from-purple-900/10 dark:to-amber-900/10"
        : "";
  return (
    <td className={`px-5 py-3 text-center ${cellBg}`}>
      {value === true ? (
        <span className={`font-bold ${checkColor}`}>✓</span>
      ) : value === false ? (
        <span className="text-slate-300 dark:text-slate-600">—</span>
      ) : (
        <span className="text-xs text-slate-600 dark:text-slate-300">{value}</span>
      )}
    </td>
  );
}

function Home() {
  useEffect(() => {
    trackPageViewFn({ data: { path: "/" } }).catch(() => {});
  }, []);
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900">
      {/* Nav Bar */}
      <nav className="sticky top-0 z-50 h-16 bg-white shadow-sm dark:bg-slate-800 dark:shadow-slate-900/50">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="CoinSight" className="h-8 w-8" />
            <span className="hidden text-xl font-bold text-slate-900 dark:text-slate-100 sm:inline">CoinSight</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/faq"
              className="rounded-lg px-2 py-2 sm:px-4 text-sm font-medium text-slate-600 transition-colors duration-150 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              FAQ
            </Link>
            <Link
              to="/login"
              className="rounded-lg px-2 py-2 sm:px-4 text-sm font-medium text-slate-600 transition-colors duration-150 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="rounded-lg border border-blue-600 px-2 py-2 sm:px-4 text-sm font-medium text-blue-600 transition-colors duration-150 hover:bg-blue-50 dark:hover:bg-blue-900/30"
            >
              Sign Up
            </Link>
            <Link
              to="/app"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)]"
            >
              Launch App
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-slate-50 px-6 py-24 dark:from-slate-800 dark:to-slate-900">
        <img
          src="/logo-icon.png"
          alt="CoinSight"
          className="mx-auto mb-6 h-16 w-16"
        />
        <h1 className="mx-auto mb-4 max-w-2xl text-center text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Your Crypto Balance Sheet
        </h1>
        <p className="mx-auto mb-8 max-w-xl text-center text-lg leading-relaxed text-slate-600 dark:text-slate-400">
          Track on-chain wallets, connect exchange holdings, import your exchange transaction history (CSV) — finally know exactly what you own. The cleanest crypto portfolio tracker, now with full transaction reconciliation.
        </p>
        <Link
          to="/signup"
          className="mx-auto block w-fit rounded-lg bg-blue-600 px-8 py-3 text-lg font-medium text-white transition-colors duration-150 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)]"
        >
          Get Started Free
        </Link>
      </section>

      {/* Features Section */}
      <section className="bg-white px-6 py-20 dark:bg-slate-800">
        <h2 className="mb-4 text-center text-3xl font-bold text-slate-900 dark:text-slate-100">
          Everything You Need to Track Your Crypto
        </h2>
        <p className="mx-auto mb-12 max-w-lg text-center text-slate-500 dark:text-slate-400">
          Free to start. Pro features unlock the full financial toolkit.
        </p>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Multi-Source Tracking */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 transition-shadow hover:shadow-md dark:border-slate-600 dark:bg-slate-700">
            <div className="mb-4 text-4xl">🔗</div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Multi-Source Tracking</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Link on-chain wallets (ETH, SOL, BTC), track exchange balances, and add manual entries. Everything in one dashboard.
            </p>
          </div>

          {/* 2. CSV Import */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 transition-shadow hover:shadow-md dark:border-slate-600 dark:bg-slate-700">
            <div className="mb-4 text-4xl">📥</div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Exchange History Import (CSV) <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Pro</span>
            </h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Drag-and-drop your Coinbase, Binance, Kraken, or Robinhood history. Auto-detects format and deduplicates — your scattered history becomes one clean ledger.
            </p>
          </div>

          {/* 3. Transaction Ledger */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 transition-shadow hover:shadow-md dark:border-slate-600 dark:bg-slate-700">
            <div className="mb-4 text-4xl">📒</div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Transaction Ledger <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Pro</span>
            </h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              A checkbook register for crypto. Filterable, searchable, with buy/sell summaries and realized P&amp;L. Finally reconcile what you actually own.
            </p>
          </div>

          {/* 4. Live Prices */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 transition-shadow hover:shadow-md dark:border-slate-600 dark:bg-slate-700">
            <div className="mb-4 text-4xl">📈</div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Real-Time Prices</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Live price data from CoinGecko with sparkline charts, 24h changes, and portfolio allocation breakdowns.
            </p>
          </div>

          {/* 5. Price Alerts */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 transition-shadow hover:shadow-md dark:border-slate-600 dark:bg-slate-700">
            <div className="mb-4 text-4xl">🔔</div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Price Alerts <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Pro</span>
            </h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Set above/below targets and get notified when coins hit your price. Never miss a market move.
            </p>
          </div>

          {/* 6. Total Wealth Dashboard */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 transition-shadow hover:shadow-md dark:border-slate-600 dark:bg-slate-700">
            <div className="mb-4 text-4xl">💰</div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Total Wealth View</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              See your entire net worth across all sources in one number — with source breakdowns so you know exactly where your money sits.
            </p>
          </div>
        </div>
      </section>

      {/* Pro Section */}
      <section className="bg-gradient-to-b from-slate-50 to-white px-6 py-20 dark:from-slate-900 dark:to-slate-800">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mb-4 inline-block rounded-full bg-blue-100 px-4 py-1 text-sm font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            CoinSight Pro
          </span>
          <h2 className="mb-4 text-3xl font-bold text-slate-900 dark:text-slate-100">
            Unlock the Full Toolkit
          </h2>
          <div className="mx-auto mb-4 grid max-w-sm grid-cols-2 gap-3 text-left">
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Monthly</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">$7.99<span className="text-xs font-normal text-slate-500">/mo</span></p>
            </div>
            <div className="rounded-lg border-2 border-blue-500 bg-blue-50 p-3 text-left dark:bg-blue-900/20">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Annual · Best Value</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">$80<span className="text-xs font-normal text-slate-500">/yr</span></p>
            </div>
          </div>
          <p className="mb-8 text-lg text-slate-600 dark:text-slate-400">
            Choose monthly flexibility or save 17% with an annual plan. Cancel monthly anytime.
          </p>
          <ul className="mx-auto mb-8 max-w-md space-y-3 text-left">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Unlimited coins &amp; transactions</strong> — no caps, no hidden limits</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Exchange History Import</strong> — drag-and-drop Coinbase, Binance, Kraken &amp; Robinhood history with auto-detection and deduplication</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Transaction Ledger</strong> — filterable, searchable checkbook register with buy/sell/net summaries and delete-per-row</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Price Alerts</strong> — above/below targets with email notifications</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Multi-Wallet Address Book</strong> — MetaMask, Phantom, Trust Wallet, Coinbase Wallet &amp; Rainbow with on-chain balance lookup (ETH, SOL, BTC)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Exchange Holdings</strong> — track Coinbase, Robinhood, Webull &amp; more alongside your wallets</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Source Breakdown</strong> — see exactly what sits on-chain vs exchange vs manual</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Historical P&amp;L</strong> — 7-day portfolio value chart with 24h &amp; 7d change metrics</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Tax Reports</strong> — Total Wealth &amp; Portfolio P&amp;L summary cards with spreadsheet and PDF exports</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Spreadsheet Export</strong> — download your portfolio anytime</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Share Links</strong> — share a read-only snapshot of your dashboard</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Data Health Card</strong> — see how complete and up-to-date your tracked data is</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Position History</strong> — each coin&apos;s performance tracked over time</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Premium badge</strong> + completely ad-free experience</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Faster refresh</strong> — 30-second price updates</span>
            </li>
          </ul>
          <Link
            to="/signup"
            className="inline-block rounded-lg bg-blue-600 px-8 py-3 text-lg font-medium text-white transition-colors duration-150 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)]"
          >
            Get Started Free
          </Link>
          <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
            Upgrade to Pro from inside the app
          </p>
        </div>
      </section>

      {/* Pricing Comparison Table */}
      <section className="bg-white px-6 py-20 dark:bg-slate-800">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-3xl font-bold text-slate-900 dark:text-slate-100">
            Compare All Plans
          </h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-slate-500 dark:text-slate-400">
            Start free. Upgrade when you need more — Pro for the full toolkit, Max for tax-ready precision.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900/40">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700">
                  <th className="px-5 py-4 font-medium text-slate-500 dark:text-slate-400">Feature</th>
                  <th className="px-5 py-4 text-center">
                    <p className="font-bold text-slate-900 dark:text-slate-100">Free</p>
                    <p className="text-xs font-normal text-slate-500 dark:text-slate-400">$0 forever</p>
                  </th>
                  <th className="bg-blue-50/60 px-5 py-4 text-center dark:bg-blue-900/20">
                    <p className="font-bold text-blue-700 dark:text-blue-300">Pro</p>
                    <p className="text-xs font-normal text-slate-500 dark:text-slate-400">$7.99/mo · $80/yr</p>
                  </th>
                  <th className="bg-gradient-to-b from-purple-50/60 to-amber-50/60 px-5 py-4 text-center dark:from-purple-900/20 dark:to-amber-900/20">
                    <p className="font-bold text-purple-700 dark:text-purple-300">Max</p>
                    <p className="text-xs font-normal text-slate-500 dark:text-slate-400">$9.99/mo · $100/yr</p>
                  </th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-t border-slate-100 dark:border-slate-700"
                  >
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{row.feature}</td>
                    <CompareCell value={row.free} />
                    <CompareCell value={row.pro} tier="pro" />
                    <CompareCell value={row.max} tier="max" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-center text-sm text-slate-400 dark:text-slate-500">
            Need to import years of scattered trade history? Check out{" "}
            <Link to="/faq" className="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
              Historical Cleanup
            </Link>{" "}
            below.
          </p>
        </div>
      </section>

      {/* Max Section */}
      <section className="bg-gradient-to-b from-white to-slate-50 px-6 py-20 dark:from-slate-800 dark:to-slate-900">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mb-4 inline-block rounded-full bg-gradient-to-r from-amber-100 to-purple-100 px-4 py-1 text-sm font-medium text-purple-700 dark:from-amber-900/40 dark:to-purple-900/40 dark:text-purple-300">
            CoinSight Max
          </span>
          <h2 className="mb-4 text-3xl font-bold text-slate-900 dark:text-slate-100">
            Tax-Ready Precision for Serious Investors
          </h2>
          <div className="mx-auto mb-4 grid max-w-sm grid-cols-2 gap-3 text-left">
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Monthly</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">$9.99<span className="text-xs font-normal text-slate-500">/mo</span></p>
            </div>
            <div className="rounded-lg border-2 border-purple-500 bg-gradient-to-br from-purple-50 to-amber-50 p-3 text-left dark:from-purple-900/20 dark:to-amber-900/20">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Annual · Best Value</p>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">$100<span className="text-xs font-normal text-slate-500">/yr</span></p>
            </div>
          </div>
          <p className="mb-8 text-lg text-slate-600 dark:text-slate-400">
            Everything in Pro, plus exact cost basis and realized gains — built for tax season.
          </p>
          <ul className="mx-auto mb-8 max-w-md space-y-3 text-left">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Everything in Pro</strong> — unlimited coins &amp; transactions, exchange history import, ledger, alerts, multi-wallet &amp; more</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>FIFO lot tracking</strong> — every buy becomes a lot with its purchase date, matched first-in-first-out</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Realized P&amp;L</strong> — actual gains and losses on every sell, matched against specific purchase lots</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Cost basis column</strong> — see per-coin cost basis right in your holdings table</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Clear P&amp;L labels</strong> — "Unrealized P&amp;L" and "Realized P&amp;L" explicitly separated at a glance</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Per-lot cost basis</strong> — see remaining amounts and basis for each acquisition</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>FIFO tax reports</strong> — tax exports use exact FIFO lots instead of average cost, ready for your accountant</span>
            </li>
          </ul>
          <Link
            to="/signup"
            className="inline-block rounded-lg bg-gradient-to-r from-amber-500 to-purple-600 px-8 py-3 text-lg font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            Get Started Free
          </Link>
          <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
            Upgrade to Max from inside the app
          </p>
        </div>
      </section>

      {/* Historical Cleanup Callout */}
      <section className="bg-white px-6 py-14 dark:bg-slate-800">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 shadow-sm dark:border-slate-600 dark:from-slate-700 dark:to-slate-800">
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-2xl shadow-[0_4px_12px_rgba(37,99,235,0.3)]">
              🧹
            </div>
            <div className="flex-1">
              <div className="mb-1 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  Historical Cleanup
                </h3>
                <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  $39.99 one-time
                </span>
              </div>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Import years of scattered trade history in one shot. Upload up to 20 exchange history files (CSV) at once,
                auto-detect their format, deduplicate across every file, and rebuild your FIFO lots — a single
                pass from mess to reconciled ledger.
              </p>
              <ul className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-2">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-green-500">✓</span> Up to 20 exchange history files (CSV) at once
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-green-500">✓</span> Auto-detect format
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-green-500">✓</span> Cross-file deduplication
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-green-500">✓</span> FIFO lot reconciliation
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900 px-6 py-8 dark:border-slate-700 dark:bg-slate-950">
        <p className="text-center text-sm text-slate-400">
          &copy; {new Date().getFullYear()} CoinSight. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
