import Stripe from "stripe";
import { getUserByEmail, setUserPro, setUserMax } from "~/db.server";
import { sendEmail, buildPurchaseConfirmationEmail } from "~/lib/email.server";

/**
 * Stripe price IDs for CoinSight Max (created by the owner).
 * When a checkout completes against one of these, the user is granted
 * Max (which always implies Pro).
 */
export const MAX_PRICE_IDS = new Set<string>([
  "price_1U0LSgD0dIs7UPrF72blI9cS", // Max Monthly ($9.99)
  "price_1U0LT3D0dIs7UPrFVIv29G2J", // Max Annual ($100)
]);

/**
 * Process a Stripe webhook event.
 *
 * When STRIPE_WEBHOOK_SECRET is set, uses Stripe's signature verification.
 * When not set, falls back to parsing the JSON body directly (less secure,
 * but workable until the webhook secret is configured).
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<{ status: number; body: object }> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let eventType: string;
  let customerEmail: string | null = null;
  let priceId: string | null = null;

  if (webhookSecret) {
    // Full signature verification
    if (!signature) {
      return { status: 400, body: { error: "Missing stripe-signature header" } };
    }
    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error("[stripe-webhook] Signature verification failed:", err.message);
      return { status: 400, body: { error: "Invalid signature" } };
    }
    eventType = event.type;
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      customerEmail = session.customer_details?.email || session.customer_email || null;
      // Price IDs aren't on the session object — fetch line items if we have
      // a secret key so we can distinguish Pro vs Max purchases.
      const secretKey = process.env.STRIPE_SECRET_KEY;
      if (secretKey) {
        try {
          const stripe = new Stripe(secretKey);
          const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
          priceId = items.data[0]?.price?.id ?? null;
        } catch (err: any) {
          console.error("[stripe-webhook] Failed to fetch line items:", err?.message);
        }
      }
    }
  } else {
    // Fallback: parse JSON directly (no signature verification)
    console.warn(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — accepting unverified webhook. " +
        "Set whsec in your environment to enable signature verification.",
    );
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { status: 400, body: { error: "Invalid JSON body" } };
    }
    eventType = payload.type;
    if (eventType === "checkout.session.completed") {
      const session = payload.data?.object;
      customerEmail = session?.customer_details?.email || session?.customer_email || null;
      // Best-effort price detection in fallback mode (line_items are usually
      // not included unless expanded; metadata may be present on custom links).
      const linePrice = session?.line_items?.data?.[0]?.price?.id;
      const metaPrice = session?.metadata?.price_id;
      const metaMax = session?.metadata?.tier === "max";
      priceId = linePrice || metaPrice || (metaMax ? "max" : null);
    }
  }

  if (eventType !== "checkout.session.completed") {
    console.log(`[stripe-webhook] Ignoring event type: ${eventType}`);
    return { status: 200, body: { received: true, ignored: true } };
  }

  if (!customerEmail) {
    console.error("[stripe-webhook] No email found in checkout session");
    return { status: 400, body: { error: "No email in session" } };
  }

  console.log(`[stripe-webhook] checkout.session.completed for email: ${customerEmail}`);

  const user = getUserByEmail(customerEmail.toLowerCase().trim());
  if (!user) {
    console.warn(`[stripe-webhook] No user found with email: ${customerEmail}`);
    return { status: 404, body: { error: "User not found" } };
  }

  const isMax = priceId != null && MAX_PRICE_IDS.has(priceId);
  if (isMax) {
    setUserMax(user.id, true);
    console.log(`[stripe-webhook] Activated Max for user ${user.id} (${user.email})`);
  } else {
    setUserPro(user.id, true);
    console.log(`[stripe-webhook] Activated Pro for user ${user.id} (${user.email})`);
  }

  // Send purchase confirmation email (fire-and-forget)
  const confirm = buildPurchaseConfirmationEmail();
  sendEmail({ to: user.email, subject: confirm.subject, html: confirm.html }).catch((err) => {
    console.error("[stripe-webhook] Failed to send purchase confirmation:", err);
  });

  return { status: 200, body: { received: true } };
}
