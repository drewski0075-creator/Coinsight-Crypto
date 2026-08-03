import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900">
      {/* Nav Bar */}
      <nav className="sticky top-0 z-50 h-16 bg-white shadow-sm dark:bg-slate-800 dark:shadow-slate-900/50">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="CoinSight" className="h-8 w-8" />
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">CoinSight</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors duration-150 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 transition-colors duration-150 hover:bg-blue-50 dark:hover:bg-blue-900/30"
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
          Track on-chain wallets, connect exchange holdings, import your CSV history — finally know exactly what you own. The cleanest crypto portfolio tracker, now with full transaction reconciliation.
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
              CSV Import <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Pro</span>
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
              <span className="text-slate-700 dark:text-slate-300"><strong>Unlimited coins</strong> — track as many as you want</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>CSV Import</strong> — reconcile history from Coinbase, Binance, Kraken &amp; Robinhood</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Transaction Ledger</strong> — checkbook register with P&amp;L tracking</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Price Alerts</strong> — get notified when coins hit your targets</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Multi-Wallet</strong> — link on-chain wallets + exchange holdings</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Ad-free</strong> — clean, focused experience</span>
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
              <span className="text-slate-700 dark:text-slate-300"><strong>Everything in Pro</strong> — unlimited coins, CSV import, ledger, alerts, multi-wallet &amp; more</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>FIFO lot tracking</strong> — every buy becomes a lot, matched first-in-first-out</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Realized P&amp;L</strong> — exact gains and losses on every sell, per symbol</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Per-lot cost basis</strong> — see remaining amounts and basis for each acquisition</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-purple-500">✓</span>
              <span className="text-slate-700 dark:text-slate-300"><strong>Tax-ready exports</strong> — FIFO-matched CSV &amp; PDF reports you can hand to your accountant</span>
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

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900 px-6 py-8 dark:border-slate-700 dark:bg-slate-950">
        <p className="text-center text-sm text-slate-400">
          &copy; {new Date().getFullYear()} CoinSight. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
