import Stripe from "stripe";
import { getUserByEmail, setUserPro, setUserMax, setUserCleanup } from "~/db.server";
import { sendEmail, buildPurchaseConfirmationEmail } from "~/lib/email.server";
import { STRIPE_PRICE_IDS, type StripeTier } from "~/lib/stripe-prices";

/**
 * Stripe webhook handler for CoinSight subscriptions.
 *
 * Events handled:
 *   - checkout.session.completed  → activate Pro / Max / Cleanup
 *   - customer.subscription.updated → sync tier on upgrade/downgrade
 *     (proration is handled automatically by Stripe)
 *   - customer.subscription.deleted → downgrade to Free
 *
 * Price IDs (owner's Stripe account) are mapped to tiers via
 * `STRIPE_PRICE_IDS`. Legacy price IDs from the previous payment-links
 * account are still recognized for backward compatibility.
 */

/* Legacy platform-account price IDs (one-time payment links era). */
const LEGACY_MAX_PRICE_IDS = new Set<string>([
  "price_1U0LSgD0dIs7UPrF72blI9cS", // Max Monthly ($9.99)
  "price_1U0LT3D0dIs7UPrFVIv29G2J", // Max Annual ($100)
]);
const LEGACY_CLEANUP_PRICE_ID = "price_1U0NqYD0dIs7UPrFypcszsgi";

/** Map a price ID to a tier (null = unknown price, ignore). */
export function priceIdToTier(priceId: string | null): StripeTier | null {
  if (!priceId) return null;
  if (STRIPE_PRICE_IDS[priceId]) return STRIPE_PRICE_IDS[priceId];
  if (LEGACY_MAX_PRICE_IDS.has(priceId)) return "max";
  if (priceId === LEGACY_CLEANUP_PRICE_ID) return "cleanup";
  if (priceId === "pro") return "pro"; // fallback sentinel from amount-based detection
  return null;
}

/* ------------------------------------------------------------------ */
/*  User resolution                                                     */
/* ------------------------------------------------------------------ */

function getUserByEmailOrNull(email: string | null | undefined) {
  if (!email) return undefined;
  return getUserByEmail(email.toLowerCase().trim());
}

/** Resolve a CoinSight user from a subscription via its metadata or the Stripe customer. */
async function resolveUserFromSubscription(subscription: Stripe.Subscription) {
  // Fast path: we stamped the email onto subscription metadata at checkout.
  const fromMeta = getUserByEmailOrNull(subscription.metadata?.userEmail);
  if (fromMeta) return fromMeta;

  // Slow path: retrieve the Stripe customer to get the email.
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || typeof subscription.customer !== "string") return undefined;
  try {
    const stripe = new Stripe(secretKey);
    const customer = await stripe.customers.retrieve(subscription.customer);
    if (!customer.deleted) {
      const user = getUserByEmailOrNull(customer.email);
      if (user) return user;
    }
  } catch (err: any) {
    console.error("[stripe-webhook] Failed to retrieve customer:", err?.message);
  }
  return undefined;
}

function activateTier(userId: number, tier: StripeTier): void {
  if (tier === "cleanup") {
    setUserCleanup(userId, true);
    console.log(`[stripe-webhook] Activated cleanup for user ${userId}`);
  } else if (tier === "max") {
    setUserMax(userId, true); // Max always implies Pro
    console.log(`[stripe-webhook] Activated Max for user ${userId}`);
  } else if (tier === "pro") {
    setUserPro(userId, true);
    setUserMax(userId, false);
    console.log(`[stripe-webhook] Activated Pro for user ${userId}`);
  }
}

function sendPurchaseConfirmation(userEmail: string): void {
  const confirm = buildPurchaseConfirmationEmail();
  sendEmail({ to: userEmail, subject: confirm.subject, html: confirm.html }).catch((err) => {
    console.error("[stripe-webhook] Failed to send purchase confirmation:", err);
  });
}

/* ------------------------------------------------------------------ */
/*  Event handlers                                                      */
/* ------------------------------------------------------------------ */

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerEmail =
    session.customer_details?.email ||
    session.customer_email ||
    (session.metadata?.userEmail as string | undefined) ||
    null;

  if (!customerEmail) {
    console.error("[stripe-webhook] No email found in checkout session");
    return { status: 400, body: { error: "No email in session" } };
  }

  const user = getUserByEmailOrNull(customerEmail);
  if (!user) {
    console.warn(`[stripe-webhook] No user found with email: ${customerEmail}`);
    return { status: 404, body: { error: "User not found" } };
  }

  // Detect tier from the price ID — prefer metadata (we stamp it at checkout),
  // then the line items (for sessions created outside this app), then the
  // amount-based fallback (unverified webhook mode).
  let priceId: string | null =
    (session.metadata?.priceId as string | undefined) || null;
  let tier = priceIdToTier(priceId);

  if (!tier) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      try {
        const stripe = new Stripe(secretKey);
        const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        priceId = items.data[0]?.price?.id ?? null;
        tier = priceIdToTier(priceId);
      } catch (err: any) {
        console.error("[stripe-webhook] Failed to fetch line items:", err?.message);
      }
    }
  }

  if (!tier) {
    // Fallback: detect tier from amount_total (cents).
    const amountTotal = session.amount_total;
    if (amountTotal === 3999) tier = "cleanup";
    else if (amountTotal === 999 || amountTotal === 10000) tier = "max";
    else if (amountTotal === 799 || amountTotal === 8000) tier = "pro";
  }

  console.log(`[stripe-webhook] checkout.session.completed for email: ${customerEmail} (tier: ${tier ?? "unknown"})`);
  if (!tier) {
    return { status: 200, body: { received: true, ignored: true, reason: "unknown price" } };
  }

  activateTier(user.id, tier);
  sendPurchaseConfirmation(user.email);
  return { status: 200, body: { received: true, tier } };
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const tier = priceIdToTier(priceId);

  // Only sync tiers for active/trialing subscriptions. Cancellations are
  // handled by customer.subscription.deleted; scheduled cancellations
  // (cancel_at_period_end) keep access until the period ends.
  const active = subscription.status === "active" || subscription.status === "trialing";
  if (!active || !tier || tier === "cleanup") {
    console.log(
      `[stripe-webhook] subscription.updated ignored (status: ${subscription.status}, tier: ${tier ?? "unknown"})`,
    );
    return { status: 200, body: { received: true, ignored: true } };
  }

  const user = await resolveUserFromSubscription(subscription);
  if (!user) {
    console.warn(`[stripe-webhook] subscription.updated: no user found for ${subscription.id}`);
    return { status: 200, body: { received: true, ignored: true } };
  }

  console.log(`[stripe-webhook] subscription.updated for user ${user.id} → tier ${tier}`);
  activateTier(user.id, tier);
  return { status: 200, body: { received: true, tier } };
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const user = await resolveUserFromSubscription(subscription);
  if (!user) {
    console.warn(`[stripe-webhook] subscription.deleted: no user found for ${subscription.id}`);
    return { status: 200, body: { received: true, ignored: true } };
  }

  console.log(`[stripe-webhook] subscription.deleted — downgrading user ${user.id} to Free`);
  setUserPro(user.id, false);
  setUserMax(user.id, false);
  // Historical Cleanup is a one-time purchase — it stays.
  return { status: 200, body: { received: true, downgraded: true } };
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Process a Stripe webhook event.
 *
 * When STRIPE_WEBHOOK_SECRET is set, verifies the signature with the
 * owner's webhook secret. When not set, falls back to parsing the JSON
 * body directly (less secure, but workable until the webhook secret is
 * configured in the Stripe dashboard + environment).
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<{ status: number; body: object }> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  if (webhookSecret) {
    if (!signature) {
      return { status: 400, body: { error: "Missing stripe-signature header" } };
    }
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error("[stripe-webhook] Signature verification failed:", err.message);
      return { status: 400, body: { error: "Invalid signature" } };
    }
  } else {
    // Fallback: parse JSON directly (no signature verification)
    console.warn(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — accepting unverified webhook. " +
        "Set whsec in your environment to enable signature verification.",
    );
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { status: 400, body: { error: "Invalid JSON body" } };
    }
  }

  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    default:
      console.log(`[stripe-webhook] Ignoring event type: ${event.type}`);
      return { status: 200, body: { received: true, ignored: true } };
  }
}
