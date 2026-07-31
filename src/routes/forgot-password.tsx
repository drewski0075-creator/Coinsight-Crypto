import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { forgotPasswordFn } from "~/server-fns";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await forgotPasswordFn({ data: { email } });
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <img src="/logo-icon.png" alt="CoinSight" className="h-8 w-8" />
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">CoinSight</span>
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-600 dark:bg-slate-800">
          <div className="rounded-t-xl border-t-4 border-t-blue-600" />
          <div className="p-6">
            <h1 className="mb-1 text-lg font-bold text-slate-900 dark:text-slate-100">
              Forgot Password
            </h1>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              {sent
                ? "If an account with that email exists, we've sent a reset link."
                : "Enter your email and we'll send you a reset link."}
            </p>

            {sent ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800/50 dark:bg-green-900/20">
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Check your inbox for the reset link. It expires in 1 hour.
                  </p>
                </div>
                <Link
                  to="/login"
                  className="block h-10 w-full rounded-lg bg-blue-600 px-4 text-center text-sm font-medium text-white leading-10 transition-colors duration-150 hover:bg-blue-700"
                >
                  Back to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="you@example.com"
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                    required
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800/50 dark:bg-red-900/20">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="h-10 w-full rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            )}

            <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              Remember your password?{" "}
              <Link
                to="/login"
                className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Log in
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          &copy; {new Date().getFullYear()} CoinSight. All rights reserved.
        </p>
      </div>
    </div>
  );
}
