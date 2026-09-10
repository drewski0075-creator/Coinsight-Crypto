import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { trackPageViewFn } from "~/server-fns";

export const Route = createFileRoute("/compare/cointracker")({
  component: CompareCoinTracker,
});

const DISCLAIMER_DATE = "August 10, 2026";

type Cell = true | false | string;

/** Pricing comparison — the main event. CoinTracker figures are as published on cointracker.io/plans. */
const pricingRows: { tier: string; coinsight: string[]; cointracker: string[] }[] = [
  {
    tier: "Free",
    coinsight: ["Free", "Up to 10 coins", "Unlimited transactions", "60-second price refresh"],
    cointracker: ["Free", "3 wallets", "100-transaction cap"],
  },
  {
    tier: "Paid",
    coinsight: [
      "CoinSight Pro — $7.99/mo",
      "Unlimited coins & transactions",
      "30-second price refresh",
      "CSV import (Coinbase, Binance, Kraken, Robinhood)",
      "Tax reports & price alerts",
    ],
    cointracker: ["CoinTracker Base — $59.99/yr", "100 transactions", "3 exchange connections"],
  },
  {
    tier: "Top",
    coinsight: [
      "CoinSight Max — $9.99/mo",
      "Everything in Pro plus:",
      "FIFO lot tracking & realized P&L",
      "Per-lot cost basis",
      "Tax-ready exports",
    ],
    cointracker: ["CoinTracker Prime — $199/yr"],
  },
];

/** Feature comparison grid. True = included, false = not included on that plan, string = note. */
const featureRows: { feature: string; coinsightFree: Cell; coinsightPaid: Cell; cointracker: Cell }[] = [
  { feature: "Unlimited transactions", coinsightFree: true, coinsightPaid: true, cointracker: false },
  { feature: "Multi-exchange tracking", coinsightFree: "Manual + wallet", coinsightPaid: true, cointracker: true },
  { feature: "CSV import", coinsightFree: false, coinsightPaid: true, cointracker: true },
  { feature: "Tax reports export", coinsightFree: false, coinsightPaid: true, cointracker: true },
  { feature: "Price alerts", coinsightFree: false, coinsightPaid: true, cointracker: true },
  { feature: "FIFO lot tracking", coinsightFree: false, coinsightPaid: true, cointracker: true },
  { feature: "Cost basis tracking", coinsightFree: false, coinsightPaid: true, cointracker: true },
  { feature: "Realized P&L", coinsightFree: false, coinsightPaid: true, cointracker: true },
  { feature: "Mobile responsive", coinsightFree: true, coinsightPaid: true, cointracker: true },
  { feature: "No API keys needed", coinsightFree: true, coinsightPaid: true, cointracker: false },
  { feature: "Dark mode", coinsightFree: true, coinsightPaid: true, cointracker: true },
  { feature: "Free tier available", coinsightFree: true, coinsightPaid: true, cointracker: true },
];

function Check({ value }: { value: Cell }) {
  if (value === true)
    return <span className="font-bold text-green-500">✓</span>;
  if (value === false)
    return <span className="text-slate-300 dark:text-slate-600">—</span>;
  return <span className="text-xs text-slate-600 dark:text-slate-300">{value}</span>;
}

function CompareCoinTracker() {
  useEffect(() => {
    trackPageViewFn({ data: { path: "/compare/cointracker" } }).catch(() => {});
  }, []);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900">
      {/* Nav Bar */}
      <nav className="sticky top-0 z-50 h-16 bg-white shadow-sm dark:bg-slate-800 dark:shadow-slate-900/50">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="CoinSight" className="h-8 w-8" />
            <span className="hidden text-xl font-bold text-slate-900 dark:text-slate-100 sm:inline">CoinSight</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/compare/cointracker"
              className="rounded-lg px-2 py-2 sm:px-4 text-sm font-medium text-blue-600 dark:text-blue-400"
            >
              Compare
            </Link>
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

      {/* Hero */}
      <section className="bg-gradient-to-b from-white to-slate-50 px-6 py-16 dark:from-slate-800 dark:to-slate-900">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mb-4 inline-block rounded-full bg-blue-100 px-4 py-1 text-sm font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            CoinSight vs CoinTracker
          </span>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl">
            Which crypto tracker fits you?
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            See how CoinSight's unlimited transactions and lower pricing compare to CoinTracker.
          </p>
        </div>
      </section>

      {/* Pricing comparison table */}
      <section className="bg-white px-6 py-14 dark:bg-slate-800">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-3xl font-bold text-slate-900 dark:text-slate-100">
            Pricing at a glance
          </h2>
          <p className="mx-auto mb-10 max-w-lg text-center text-slate-500 dark:text-slate-400">
            CoinSight charges a flat monthly rate with no per-transaction limits at any tier. CoinTracker sells
            annual plans with transaction and connection caps.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm dark:border-slate-600">
            <table className="w-full min-w-[640px] border-collapse bg-white text-left dark:bg-slate-800">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-600">
                  <th className="px-5 py-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Tier
                  </th>
                  <th className="border-l border-slate-200 px-5 py-4 text-sm font-bold text-blue-700 dark:border-slate-600 dark:text-blue-400">
                    CoinSight
                  </th>
                  <th className="border-l border-slate-200 px-5 py-4 text-sm font-bold text-slate-700 dark:border-slate-600 dark:text-slate-300">
                    CoinTracker
                  </th>
                </tr>
              </thead>
              <tbody>
                {pricingRows.map((row) => (
                  <tr
                    key={row.tier}
                    className="border-b border-slate-100 align-top last:border-b-0 dark:border-slate-700"
                  >
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100">{row.tier}</td>
                    <td className="border-l border-slate-100 bg-blue-50/40 px-5 py-4 dark:border-slate-700 dark:bg-blue-900/10">
                      <ul className="space-y-1.5">
                        {row.coinsight.map((line) => (
                          <li key={line} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <span className="mt-0.5 text-green-500">✓</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="border-l border-slate-100 px-5 py-4 dark:border-slate-700">
                      <ul className="space-y-1.5">
                        {row.cointracker.map((line) => (
                          <li key={line} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <span className="mt-0.5 text-slate-400">•</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            CoinTracker plans, prices, and caps as published on their public plans page; CoinSight plans as of{" "}
            {DISCLAIMER_DATE}. Annual CoinSight plans: Pro $80/yr, Max $100/yr.
          </p>
        </div>
      </section>

      {/* Feature comparison grid */}
      <section className="bg-slate-50 px-6 py-14 dark:bg-slate-900">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-center text-3xl font-bold text-slate-900 dark:text-slate-100">
            Feature comparison
          </h2>
          <p className="mx-auto mb-10 max-w-lg text-center text-slate-500 dark:text-slate-400">
            What's included, side by side. CoinSight's paid tiers start where CoinTracker's transaction caps begin.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-600">
                  <th className="px-5 py-4 text-left text-sm font-semibold text-slate-500 dark:text-slate-400">
                    Feature
                  </th>
                  <th className="px-5 py-4 text-center text-sm font-bold text-slate-700 dark:text-slate-300">
                    CoinSight Free
                  </th>
                  <th className="bg-blue-50/40 px-5 py-4 text-center text-sm font-bold text-blue-700 dark:bg-blue-900/10 dark:text-blue-400">
                    CoinSight Pro/Max
                  </th>
                  <th className="px-5 py-4 text-center text-sm font-bold text-slate-700 dark:text-slate-300">
                    CoinTracker
                  </th>
                </tr>
              </thead>
              <tbody>
                {featureRows.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-slate-100 last:border-b-0 dark:border-slate-700 ${
                      i % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/60" : ""
                    }`}
                  >
                    <td className="px-5 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{row.feature}</td>
                    <td className="px-5 py-3 text-center">
                      <Check value={row.coinsightFree} />
                    </td>
                    <td className="bg-blue-50/40 px-5 py-3 text-center dark:bg-blue-900/10">
                      <Check value={row.coinsightPaid} />
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Check value={row.cointracker} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            "CoinTracker" column reflects the plan required to get each feature on cointracker.io. Checkmarks for
            CoinTracker indicate the feature is available on a paid plan; a dash means it is not part of the published
            plans. CoinSight Pro and Max are available monthly or annually.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-b from-white to-slate-50 px-6 py-16 dark:from-slate-800 dark:to-slate-900">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-3 text-3xl font-bold text-slate-900 dark:text-slate-100">
            Start tracking free — no transaction limits, no credit card
          </h2>
          <p className="mb-8 text-lg text-slate-600 dark:text-slate-400">
            Your first 10 coins are free forever, with unlimited transactions at every tier.
          </p>
          <Link
            to="/signup"
            className="inline-block rounded-lg bg-blue-600 px-8 py-3 text-lg font-medium text-white transition-colors duration-150 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)]"
          >
            Sign Up Free
          </Link>
        </div>
      </section>

      {/* Disclaimer footer */}
      <footer className="border-t border-slate-800 bg-slate-900 px-6 py-8 dark:border-slate-700 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl">
          <p className="text-center text-xs leading-relaxed text-slate-400">
            All comparisons based on publicly available information as of {DISCLAIMER_DATE}. CoinTracker® is a
            registered trademark of CoinTracker Inc. All trademarks belong to their respective owners. Verify details
            on CoinTracker's website.
          </p>
          <p className="mt-4 text-center text-sm text-slate-400">
            &copy; {new Date().getFullYear()} CoinSight. All rights reserved.{" "}
            <Link to="/contact" className="underline-offset-2 hover:underline">
              Contact
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
