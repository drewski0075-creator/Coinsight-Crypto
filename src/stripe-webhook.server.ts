import Stripe from "stripe";
import { getUserByEmail, setUserPro } from "~/db.server";
import { sendEmail, buildPurchaseConfirmationEmail } from "~/lib/email.server";

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

  setUserPro(user.id, true);
  console.log(`[stripe-webhook] Activated Pro for user ${user.id} (${user.email})`);

  // Send purchase confirmation email (fire-and-forget)
  const confirm = buildPurchaseConfirmationEmail();
  sendEmail({ to: user.email, subject: confirm.subject, html: confirm.html }).catch((err) => {
    console.error("[stripe-webhook] Failed to send purchase confirmation:", err);
  });

  return { status: 200, body: { received: true } };
}
