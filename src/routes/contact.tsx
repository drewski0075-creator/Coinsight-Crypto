import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { trackPageViewFn } from "~/server-fns";

export const Route = createFileRoute("/contact")({
  component: Contact,
});

const CONTACT_EMAIL = "coinsightdashcrypto@gmail.com";

function Contact() {
  useEffect(() => {
    trackPageViewFn({ data: { path: "/contact" } }).catch(() => {});
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
              className="rounded-lg px-2 py-2 sm:px-4 text-sm font-medium text-slate-600 transition-colors duration-150 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              FAQ
            </Link>
            <Link
              to="/compare/cointracker"
              className="rounded-lg px-2 py-2 sm:px-4 text-sm font-medium text-slate-600 transition-colors duration-150 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Compare
            </Link>
            <Link
              to="/contact"
              className="rounded-lg px-2 py-2 sm:px-4 text-sm font-medium text-blue-600 dark:text-blue-400"
            >
              Contact
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

      {/* Contact Section */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Contact Us
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Questions, feature ideas, or a bug to report — I&apos;d love to hear from you.
            </p>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">
                A note on who&apos;s answering
              </h2>
              <div className="space-y-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                <p>
                  CoinSight is currently a one-person operation — just me, working alongside an AI
                  teammate that handles most of the engineering. When you email the address below, it
                  lands directly in my personal inbox.
                </p>
                <p>
                  I read every message myself, and I&apos;ll be the one who replies — but please be
                  patient, as it may take me a few days to get back to you. There are no support-ticket
                  queues and no bots pretending to be people on the other end. Just a real person doing
                  their best to help.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-8 text-center shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
              <p className="mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">Email me directly at</p>
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("CoinSight — question")}`}
                className="break-all text-lg font-semibold text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
              >
                {CONTACT_EMAIL}
              </a>
              <div className="mt-6">
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("CoinSight — question")}`}
                  className="inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)]"
                >
                  Email Me
                </a>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <h2 className="mb-3 text-xl font-bold text-slate-900 dark:text-slate-100">
                What to include
              </h2>
              <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                <li>Bug reports — what you were doing and what went wrong</li>
                <li>Feature requests — what you&apos;d like CoinSight to do</li>
                <li>Billing questions — which plan you&apos;re on and the email you signed up with</li>
                <li>Anything else on your mind</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900 px-6 py-8 dark:border-slate-700 dark:bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-slate-400 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} CoinSight. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/faq" className="transition-colors hover:text-slate-200">
              FAQ
            </Link>
            <Link to="/contact" className="text-slate-300 transition-colors hover:text-slate-100">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
