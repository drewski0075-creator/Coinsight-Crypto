import { createFileRoute } from "@tanstack/react-router";
import { createCheckoutSession } from "~/stripe-checkout.server";

/**
 * POST /api/create-checkout-session
 * Body: { priceId: string, customerEmail: string, successUrl?: string, cancelUrl?: string }
 * Returns: { url: string } — redirect the user to this Stripe Checkout URL.
 *
 * Pro/Max prices create subscription checkouts (Stripe prorates when the
 * customer already has an active subscription); the Cleanup price creates
 * a one-time payment checkout.
 */
export const Route = createFileRoute("/api/create-checkout-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const siteUrl = process.env.SITE_URL ?? "https://www.coinsight-crypto.com";
        try {
          const body = (await request.json().catch(() => null)) as {
            priceId?: unknown;
            customerEmail?: unknown;
            successUrl?: unknown;
            cancelUrl?: unknown;
          } | null;

          if (!body || typeof body.priceId !== "string" || typeof body.customerEmail !== "string") {
            return new Response(
              JSON.stringify({ error: "priceId and customerEmail are required" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const successUrl =
            typeof body.successUrl === "string" && body.successUrl.length > 0
              ? body.successUrl
              : `${siteUrl}/app?checkout=success`;
          const cancelUrl =
            typeof body.cancelUrl === "string" && body.cancelUrl.length > 0
              ? body.cancelUrl
              : `${siteUrl}/app?checkout=cancelled`;

          const result = await createCheckoutSession({
            priceId: body.priceId,
            customerEmail: body.customerEmail.trim().toLowerCase(),
            successUrl,
            cancelUrl,
          });

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Internal server error";
          console.error("[create-checkout-session] Failed:", message);
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
