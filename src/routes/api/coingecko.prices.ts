import { createFileRoute } from "@tanstack/react-router";
import { getCached, setCache } from "~/lib/coingecko-cache";

const API_KEY = process.env.COINGECKO_API_KEY ?? "";
const BASE = "https://api.coingecko.com/api/v3";
const CACHE_TTL = 15_000; // 15 seconds

export const Route = createFileRoute("/api/coingecko/prices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ids = url.searchParams.get("ids");
        if (!ids) {
          return new Response(
            JSON.stringify({ error: "Missing 'ids' query parameter" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const cacheKey = `prices:${ids}`;
        const cached = getCached<unknown>(cacheKey);
        if (cached) {
          return new Response(JSON.stringify(cached), {
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const cgUrl = `${BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
          const cgRes = await fetch(cgUrl, {
            headers: { "x-cg-demo-api-key": API_KEY },
          });
          if (!cgRes.ok) {
            const errText = await cgRes.text().catch(() => "Unknown error");
            return new Response(
              JSON.stringify({ error: `CoinGecko error: ${cgRes.status}`, detail: errText }),
              { status: cgRes.status, headers: { "Content-Type": "application/json" } },
            );
          }
          const data = await cgRes.json();
          setCache(cacheKey, data, CACHE_TTL);
          return new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Internal server error";
          return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
