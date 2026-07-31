import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { resetPasswordFn } from "~/server-fns";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
});

function ResetPassword() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await resetPasswordFn({ data: { token, password } });
      if (result.success) {
        setDone(true);
      } else {
        setError(result.error ?? "Failed to reset password.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // No token in URL
  if (!token) {
    return (
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Link to="/" className="inline-flex items-center gap-2">
              <img src="/logo-icon.png" alt="CoinSight" className="h-8 w-8" />
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">CoinSight</span>
            </Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-600 dark:bg-slate-800">
            <div className="rounded-t-xl border-t-4 border-t-blue-600" />
            <div className="p-6">
              <h1 className="mb-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                Invalid Link
              </h1>
              <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
                This reset link is missing or invalid. Please request a new one.
              </p>
              <Link
                to="/forgot-password"
                className="block h-10 w-full rounded-lg bg-blue-600 px-4 text-center text-sm font-medium text-white leading-10 transition-colors duration-150 hover:bg-blue-700"
              >
                Request New Link
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              Reset Password
            </h1>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              {done
                ? "Your password has been reset successfully."
                : "Choose a new password for your account."}
            </p>

            {done ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800/50 dark:bg-green-900/20">
                  <p className="text-sm text-green-700 dark:text-green-400">
                    You can now log in with your new password.
                  </p>
                </div>
                <Link
                  to="/login"
                  className="block h-10 w-full rounded-lg bg-blue-600 px-4 text-center text-sm font-medium text-white leading-10 transition-colors duration-150 hover:bg-blue-700"
                >
                  Go to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    New Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="At least 6 characters"
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm"
                    className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setError(null);
                    }}
                    placeholder="Re-enter your password"
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-colors duration-150 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-700"
                    required
                    minLength={6}
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
                  {loading ? "Resetting..." : "Reset Password"}
                </button>
              </form>
            )}

            <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              <Link
                to="/login"
                className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Back to Login
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
