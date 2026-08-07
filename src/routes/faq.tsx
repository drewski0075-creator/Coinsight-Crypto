import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { trackPageViewFn } from "~/server-fns";

export const Route = createFileRoute("/faq")({
  component: Faq,
});

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Why do I need this?",
    a: (
      <>
        Most crypto investors have coins spread across exchanges, wallets, and DeFi platforms. CoinSight
        brings everything into one dashboard so you actually know your total wealth, cost basis, and
        realized gains. Without it, you&apos;re piecing together balances manually — logging into five
        different exchanges, copying numbers into a spreadsheet, and hoping it adds up. And when tax
        season comes, that scattered history becomes a nightmare. CoinSight gives you a single, live view
        of what you own, where it sits, what it cost you, and what you&apos;ve gained or lost — plus
        tax-ready reports when it counts.
      </>
    ),
  },
  {
    q: "How can I be assured that my money is safe?",
    a: (
      <>
        CoinSight is read-only. We never hold your funds, never ask for private keys, and never have the
        ability to move your crypto. Exchange holdings are manually entered or imported via transaction history file (CSV). Wallet
        balances use public blockchain data — we look up what&apos;s on-chain using your public address,
        which anyone can do. Your data lives in an encrypted SQLite database. At every step, you remain in
        full control of your assets: CoinSight only ever watches, it can never touch what you own.
      </>
    ),
  },
  {
    q: "Do I need to give you my private keys or seed phrase?",
    a: (
      <>
        No, never. We only use public wallet addresses to look up on-chain balances. <strong>Private keys and seed
        phrases should never be shared with anyone — including us.</strong> If any service ever asks you for your
        private keys or recovery phrase, that is a major red flag. CoinSight will never ask, because we
        simply don&apos;t need them to do our job.
      </>
    ),
  },
  {
    q: "What's the difference between Free, Pro, and Max?",
    a: (
      <>
        Free tracks up to 10 coins with 60-second price refresh. Pro ($7.99/mo or $80/yr) adds unlimited coins &amp; transactions,
        coins, exchange history import (CSV), transaction ledger, price alerts, multi-wallet support, 30-second refresh, and
        ad-free. Max ($9.99/mo or $100/yr) adds FIFO lot tracking, realized P&L, per-lot cost basis, and
        tax-ready reports. All tiers include real-time CoinGecko pricing. Start free and upgrade whenever
        you need more — you can change plans from inside the app at any time.
      </>
    ),
  },
  {
    q: "Can I cancel anytime?",
    a: (
      <>
        Yes. Subscriptions are month-to-month or annual, and you can cancel from the Stripe Customer Portal
        anytime — no emails, no phone calls, no hoops. You keep Pro or Max access until the end of your
        current billing period, then you downgrade to Free automatically. There are no cancellation fees,
        and you never lose your tracked data.
      </>
    ),
  },
  {
    q: "What exchanges can I import history from?",
    a: (
      <>
        Coinbase, Binance, Kraken, and Robinhood transaction history files are auto-detected — just drag and drop and
        we figure out the format for you. Every import is deduplicated so the same transaction can&apos;t
        be counted twice. If you have years of history spread across many files, the Historical Cleanup
        add-on ($39.99 one-time) processes up to 20 files at once with cross-file deduplication.
      </>
    ),
  },
  {
    q: "What is a CSV file?",
    a: (
      <>
        CSV stands for Comma-Separated Values. It is a standard spreadsheet file that exchanges let you download — it contains your full trade history. You do not need any technical knowledge or to know anything about the format. Just download your history from Coinbase, Binance, Kraken, or Robinhood, then drag and drop the file into CoinSight.
      </>
    ),
  },
  {
    q: "How does the Historical Cleanup work?",
    a: (
      <>
        It&apos;s a one-time purchase ($39.99) for anyone with years of scattered trade history. You upload
        up to 20 transaction history files (CSV) at once, CoinSight auto-detects each file&apos;s format, deduplicates across all
        of them so nothing is double-counted, and rebuilds your FIFO lots from the merged history. The
        result: one clean, reconciled ledger — perfect for importing a decade of exchange exports in a
        single pass instead of file by file.
      </>
    ),
  },
  {
    q: "Is my data shared or sold?",
    a: (
      <>
        No. We don&apos;t sell your data, share it with third parties, or use it for advertising beyond the
        Coinzilla ad slot on the Free tier. Your portfolio, holdings, and transaction history are private
        to you. That&apos;s the deal — your financial picture is yours alone.
      </>
    ),
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  useEffect(() => {
    trackPageViewFn({ data: { path: "/faq" } }).catch(() => {});
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
              to="/faq"
              className="rounded-lg px-2 py-2 sm:px-4 text-sm font-medium text-blue-600 dark:text-blue-400"
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

      {/* FAQ Section */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Frequently Asked Questions
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Everything you need to know about CoinSight, security, and plans.
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => {
              const isOpen = open === i;
              return (
                <div
                  key={faq.q}
                  className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-colors dark:bg-slate-800 ${
                    isOpen
                      ? "border-blue-300 dark:border-blue-700"
                      : "border-slate-200 dark:border-slate-600"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
                  >
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{faq.q}</span>
                    <span
                      className={`shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 px-6 py-4 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-400">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-10 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-slate-100">
              Still have questions?
            </h2>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
              Start free in under a minute — or explore the full pricing breakdown on the landing page.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/signup"
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)]"
              >
                Get Started Free
              </Link>
              <Link
                to="/"
                className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900 px-6 py-8 dark:border-slate-700 dark:bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-slate-400 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} CoinSight. All rights reserved.</p>
          <Link to="/faq" className="transition-colors hover:text-slate-200">
            FAQ
          </Link>
        </div>
      </footer>
    </div>
  );
}
