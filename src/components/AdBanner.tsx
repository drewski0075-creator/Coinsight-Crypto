/**
 * AdBanner — Coinzilla ad integration for CoinSight.
 *
 * ## Setup instructions for the owner:
 * 1. Sign up as a publisher at https://coinzilla.com/publishers
 * 2. Create an ad zone in the Coinzilla dashboard
 * 3. Copy the zone ID (a string like "abc123def456")
 * 4. Set it in the COINZILLA_ZONE_ID constant in src/routes/app.tsx
 *
 * For flexibility, you can also use the environment variable COINZILLA_ZONE_ID.
 * When both are empty the component renders nothing.
 *
 * ## How it works:
 * - On mount, dynamically injects the Coinzilla display script
 * - The script looks for a div with id "coinzilla-banner-{zoneId}" and fills it with the ad
 * - On unmount, the script is removed from the DOM to prevent leaks
 * - The container is a centered, padded wrapper with dark mode support
 */

import { useEffect, useRef } from "react";

interface AdBannerProps {
  zoneId: string;
}

export default function AdBanner({ zoneId }: AdBannerProps) {
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    // Don't inject if zone ID is empty
    if (!zoneId) return;

    // Check if this script is already on the page (prevents double injection)
    const existing = document.querySelector(
      `script[src="https://coinzilla.com/display/${zoneId}.js"]`,
    );
    if (existing) return;

    const script = document.createElement("script");
    script.src = `https://coinzilla.com/display/${zoneId}.js`;
    script.async = true;
    document.head.appendChild(script);
    scriptRef.current = script;

    return () => {
      // Cleanup: remove the script on unmount
      if (scriptRef.current && scriptRef.current.parentNode) {
        scriptRef.current.parentNode.removeChild(scriptRef.current);
      }
      scriptRef.current = null;
    };
  }, [zoneId]);

  return (
    <div className="mb-6 flex justify-center rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <div
        id={`coinzilla-banner-${zoneId}`}
        className="flex min-h-[90px] w-full max-w-[728px] items-center justify-center"
      >
        {/* Coinzilla script renders ad content here */}
      </div>
    </div>
  );
}
