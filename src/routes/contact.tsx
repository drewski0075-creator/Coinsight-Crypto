import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { sendContactFn, trackPageViewFn } from "~/server-fns";

export const Route = createFileRoute("/contact")({
  component: Contact,
});

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
                  teammate that handles most of the engineering. When you send a message through the
                  form below, it lands directly in my personal inbox.
                </p>
                <p>
                  I read every message myself, and I&apos;ll be the one who replies — but please be
                  patient, as it may take me a few days to get back to you. There are no support-ticket
                  queues and no bots pretending to be people on the other end. Just a real person doing
                  their best to help.
                </p>
              </div>
            </div>

            <ContactForm />

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

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError("");

    try {
      const res = await sendContactFn({ data: { name, email, message, website } });
      if (res.success) {
        setStatus("sent");
        setName("");
        setEmail("");
        setMessage("");
      } else {
        setStatus("error");
        setError(res.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setError("Something went wrong sending your message. Please try again.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center shadow-sm dark:border-green-800 dark:bg-green-900/20">
        <h2 className="mb-2 text-xl font-bold text-green-800 dark:text-green-300">Message sent! 🎉</h2>
        <p className="mb-6 text-sm leading-relaxed text-green-700 dark:text-green-400">
          Thanks for reaching out. I&apos;ll read it personally and reply as soon as I can — usually
          within a few days.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="rounded-lg border border-green-600 px-5 py-2 text-sm font-medium text-green-700 transition-colors duration-150 hover:bg-green-100 dark:border-green-500 dark:text-green-300 dark:hover:bg-green-900/30"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-600 dark:bg-slate-800"
    >
      <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">Send a message</h2>

      {/* Honeypot field — hidden from real users, catches bots */}
      <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Your name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            placeholder="Jane Doe"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Your email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="message" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            required
            maxLength={5000}
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            placeholder="Tell me what's on your mind…"
          />
        </div>

        {status === "error" && error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Send Message"}
        </button>
      </div>
    </form>
  );
}
