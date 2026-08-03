/* ------------------------------------------------------------------ */
/*  Stripe price IDs — CoinSight subscriptions & one-time purchases    */
/*  Created on the owner's Stripe account (acct_1TxfjtQtkCWYLwEd).     */
/*  Client-safe: pure string constants — safe to import from the UI.   */
/* ------------------------------------------------------------------ */

export const PRO_MONTHLY_PRICE_ID = "price_1U0OU3QtkCWYLwEd44ma13uR"; // $7.99/mo
export const PRO_ANNUAL_PRICE_ID = "price_1U0OU4QtkCWYLwEdqNJACs0Q"; // $80/yr (save 17%)
export const MAX_MONTHLY_PRICE_ID = "price_1U0OU4QtkCWYLwEdAtx2BhqH"; // $9.99/mo
export const MAX_ANNUAL_PRICE_ID = "price_1U0OU4QtkCWYLwEd4YBn6VOF"; // $100/yr (save 17%)
export const CLEANUP_PRICE_ID = "price_1U0OU4QtkCWYLwEdp3L66xEN"; // $39.99 one-time

export type StripeTier = "pro" | "max" | "cleanup";

/** Current-account price IDs → tier. Used by checkout + webhook. */
export const STRIPE_PRICE_IDS: Record<string, StripeTier> = {
  [PRO_MONTHLY_PRICE_ID]: "pro",
  [PRO_ANNUAL_PRICE_ID]: "pro",
  [MAX_MONTHLY_PRICE_ID]: "max",
  [MAX_ANNUAL_PRICE_ID]: "max",
  [CLEANUP_PRICE_ID]: "cleanup",
};
