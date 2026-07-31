import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhook } from "~/stripe-webhook.server";

/**
 * Stripe webhook endpoint: POST /api/stripe-webhook
 *
 * Receives Stripe webhook events, verifies the signature, and on
 * checkout.session.completed, activates Pro for the matching user.
 *
 * Env vars needed:
 *   STRIPE_WEBHOOK_SECRET — webhook signing secret from Stripe Dashboard
 */
export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let rawBody: string;
        try {
          rawBody = await request.text();
        } catch {
          return new Response(JSON.stringify({ error: "Failed to read body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const signature = request.headers.get("stripe-signature");
        const result = await handleStripeWebhook(rawBody, signature);

        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
