/**
 * CoinSight email utility — server-side only.
 *
 * Sends transactional emails via the platform inbox.
 * Falls back to writing emails to a local mail queue when no transport is available.
 */

const FROM_ADDRESS = "coinsight-crypto-748798b6@ctomail.io";
const MAIL_QUEUE_DIR = new URL("../../data/emails/", import.meta.url).pathname;

// Ensure queue directory exists
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
try {
  mkdirSync(MAIL_QUEUE_DIR, { recursive: true });
} catch { /* already exists */ }

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email. Attempts platform transport first, falls back to local queue.
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; method: string }> {
  const { to, subject, html } = options;

  // Try platform HTTP transport first
  try {
    const res = await fetch("http://localhost:2500/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      return { success: true, method: "http" };
    }
  } catch {
    // Platform transport not available — fall through to queue
  }

  // Fallback: write to local mail queue
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `email-${timestamp}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(MAIL_QUEUE_DIR, filename);

  writeFileSync(
    filepath,
    JSON.stringify({ from: FROM_ADDRESS, to, subject, html, sent_at: new Date().toISOString() }, null, 2),
  );

  return { success: true, method: "queue" };
}

/* ------------------------------------------------------------------ */
/*  Email templates                                                     */
/* ------------------------------------------------------------------ */

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:24px 32px;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">🪙 CoinSight</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                &copy; ${new Date().getFullYear()} CoinSight. All rights reserved.<br>
                Your crypto balance sheet.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildWelcomeEmail(): { subject: string; html: string } {
  const subject = "Welcome to CoinSight!";
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Welcome to CoinSight! 🎉</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;">
      Thanks for creating your CoinSight account — your personal crypto balance sheet is ready.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;">
      <strong>Free tier:</strong> Track up to 10 coins with real-time prices, portfolio dashboard, and sparkline charts.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;">
      <strong>CoinSight Pro ($7.99 one-time):</strong> Unlimited coins, price alerts, CSV import, wallet tracking, exchange holdings, and more.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">
      Ready to start tracking? Head to your dashboard and add your first holding.
    </p>
    <a href="https://b7b7222827a9407fadc1f53cb3561c0d.ctonew.app/app" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Go to Dashboard</a>
  `;
  return { subject, html: baseTemplate(subject, body) };
}

export function buildResetEmail(resetLink: string): { subject: string; html: string } {
  const subject = "Reset your CoinSight password";
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Reset Your Password</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;">
      You requested a password reset for your CoinSight account. Click the button below to set a new password.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;">
      <strong>This link expires in 1 hour.</strong> If you didn't request this, you can safely ignore this email.
    </p>
    <a href="${resetLink}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Reset Password</a>
    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <span style="color:#2563eb;word-break:break-all;">${resetLink}</span>
    </p>
  `;
  return { subject, html: baseTemplate(subject, body) };
}

export function buildAlertEmail(
  symbol: string,
  targetPrice: number,
  currentPrice: number,
  direction: string,
): { subject: string; html: string } {
  const dirLabel = direction === "above" ? "rose above" : "fell below";
  const subject = `CoinSight Alert: ${symbol} ${dirLabel} $${targetPrice.toLocaleString()}`;
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">🚨 Price Alert Triggered</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#475569;">
      Your alert for <strong>${symbol}</strong> has been triggered.
    </p>
    <table cellpadding="8" cellspacing="0" style="background-color:#f1f5f9;border-radius:8px;margin:16px 0;width:100%;">
      <tr>
        <td style="font-size:13px;color:#64748b;">Target Price</td>
        <td style="font-size:15px;font-weight:700;color:#0f172a;">$${targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#64748b;">Current Price</td>
        <td style="font-size:15px;font-weight:700;color:#0f172a;">$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#64748b;">Direction</td>
        <td style="font-size:15px;font-weight:700;color:#0f172a;">${direction === "above" ? "Price Above Target" : "Price Below Target"}</td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">
      This alert has been marked as triggered and will no longer be active. You can create new alerts from your dashboard.
    </p>
    <a href="https://b7b7222827a9407fadc1f53cb3561c0d.ctonew.app/app" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">View Dashboard</a>
  `;
  return { subject, html: baseTemplate(subject, body) };
}

export function buildPurchaseConfirmationEmail(): { subject: string; html: string } {
  const subject = "You're a CoinSight Pro!";
  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">You're a CoinSight Pro! 🚀</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;">
      Your upgrade to CoinSight Pro has been confirmed. You now have access to all premium features:
    </p>
    <table cellpadding="6" cellspacing="0" style="margin:16px 0;width:100%;">
      <tr><td style="font-size:14px;color:#475569;padding:4px 0;">✅ Unlimited coin tracking</td></tr>
      <tr><td style="font-size:14px;color:#475569;padding:4px 0;">✅ Faster 30-second price refresh</td></tr>
      <tr><td style="font-size:14px;color:#475569;padding:4px 0;">✅ CSV import &amp; export</td></tr>
      <tr><td style="font-size:14px;color:#475569;padding:4px 0;">✅ Price alerts with notifications</td></tr>
      <tr><td style="font-size:14px;color:#475569;padding:4px 0;">✅ Multi-wallet address book &amp; on-chain balance lookup</td></tr>
      <tr><td style="font-size:14px;color:#475569;padding:4px 0;">✅ Historical P&amp;L tracking with charts</td></tr>
      <tr><td style="font-size:14px;color:#475569;padding:4px 0;">✅ Ad-free experience</td></tr>
    </table>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">
      Thank you for supporting CoinSight! Head to your dashboard to explore all Pro features.
    </p>
    <a href="https://b7b7222827a9407fadc1f53cb3561c0d.ctonew.app/app" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Go to Dashboard</a>
  `;
  return { subject, html: baseTemplate(subject, body) };
}
