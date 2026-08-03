import Stripe from "stripe";
import { STRIPE_PRICE_IDS } from "~/lib/stripe-prices";

/**
 * Server-side Stripe helpers: Checkout sessions (subscriptions + one-time)
 * and the Customer Portal (plan management / cancellation).
 *
 * Uses STRIPE_SECRET_KEY from the environment. Never imported by client code.
 */

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

export type CheckoutSessionInput = {
  priceId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
};

/**
 * Create a Stripe Checkout Session.
 *
 * - Pro/Max prices → `mode: "subscription"`. When the customer already has
 *   an active subscription, Stripe's Checkout presents a prorated plan
 *   switch (upgrade/downgrade handled automatically).
 * - Historical Cleanup → `mode: "payment"` (one-time purchase, NOT a
 *   subscription).
 *
 * The customer email is passed on the session and the subscription metadata
 * so the webhook can resolve the CoinSight user without extra API calls.
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput,
): Promise<{ url: string }> {
  const { priceId, customerEmail, successUrl, cancelUrl } = input;
  const tier = STRIPE_PRICE_IDS[priceId];
  if (!tier) throw new Error(`Unknown price ID: ${priceId}`);
  const mode: Stripe.Checkout.SessionCreateParams.Mode =
    tier === "cleanup" ? "payment" : "subscription";

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: customerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    // The owner's account has Stripe "Managed Payments" enabled by default,
    // which requires per-product tax codes. CoinSight doesn't collect tax, so
    // disable managed payments on the session (standard for subscription SaaS).
    managed_payments: { enabled: false },
    metadata: { userEmail: customerEmail, priceId, appTier: tier },
    subscription_data:
      mode === "subscription"
        ? { metadata: { userEmail: customerEmail, priceId } }
        : undefined,
  });

  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return { url: session.url };
}

/**
 * Create a Stripe Customer Portal session so the user can manage their
 * subscription (switch plans with proration, cancel, update payment method).
 */
export async function createPortalSession(
  customerEmail: string,
  returnUrl: string,
): Promise<{ url: string }> {
  const stripe = getStripe();

  // Reuse the existing Stripe customer if there is one for this email.
  const customers = await stripe.customers.list({
    email: customerEmail,
    limit: 1,
  });
  let customerId = customers.data[0]?.id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: customerEmail,
      metadata: { source: "coinsight-portal" },
    });
    customerId = customer.id;
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}
