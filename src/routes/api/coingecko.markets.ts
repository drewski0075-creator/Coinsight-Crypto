import { createFileRoute } from "@tanstack/react-router";
import { getCached, setCache } from "~/lib/coingecko-cache";

const API_KEY = process.env.COINGECKO_API_KEY ?? "";
const BASE = "https://api.coingecko.com/api/v3";
const CACHE_TTL = 30_000; // 30 seconds

export const Route = createFileRoute("/api/coingecko/markets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ids = url.searchParams.get("ids");
        const perPage = url.searchParams.get("per_page") || "10";
        const sparkline = url.searchParams.get("sparkline") || "false";
        const priceChangePct = url.searchParams.get("price_change_percentage") || "24h";

        const cacheKey = `markets:${ids || "top"}:${perPage}:${sparkline}:${priceChangePct}`;
        const cached = getCached<unknown>(cacheKey);
        if (cached) {
          return new Response(JSON.stringify(cached), {
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          let cgUrl = `${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=${sparkline}&price_change_percentage=${priceChangePct}`;
          if (ids) {
            cgUrl += `&ids=${encodeURIComponent(ids)}`;
          }

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
