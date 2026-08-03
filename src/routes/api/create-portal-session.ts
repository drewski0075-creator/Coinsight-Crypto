import { createFileRoute } from "@tanstack/react-router";
import { createPortalSession } from "~/stripe-checkout.server";

/**
 * POST /api/create-portal-session
 * Body: { customerEmail: string, returnUrl?: string }
 * Returns: { url: string } — the Stripe Customer Portal URL where the user
 * can manage their subscription (switch plans, cancel, update card).
 */
export const Route = createFileRoute("/api/create-portal-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const siteUrl = process.env.SITE_URL ?? "https://www.coinsight-crypto.com";
        try {
          const body = (await request.json().catch(() => null)) as {
            customerEmail?: unknown;
            returnUrl?: unknown;
          } | null;

          if (!body || typeof body.customerEmail !== "string") {
            return new Response(
              JSON.stringify({ error: "customerEmail is required" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const returnUrl =
            typeof body.returnUrl === "string" && body.returnUrl.length > 0
              ? body.returnUrl
              : `${siteUrl}/app`;

          const result = await createPortalSession(
            body.customerEmail.trim().toLowerCase(),
            returnUrl,
          );

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Internal server error";
          console.error("[create-portal-session] Failed:", message);
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
