import React, { useMemo } from "react";

type Holding = {
  id: number;
  symbol: string;
  coin_id: string;
  coin_name: string;
  amount: number;
  source: string;
};

type PriceData = Record<string, number | null>;

const COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
  "#84cc16", "#6366f1",
];

const PortfolioAllocationChart = React.memo(function PortfolioAllocationChart({
  holdings,
  prices,
  fmtCompact,
}: {
  holdings: Holding[];
  prices: PriceData;
  fmtCompact: (n: number) => string;
}) {
  const allocationData = useMemo(() => {
    if (holdings.length === 0) return [];

    const items = holdings
      .map((h) => {
        const sym = h.symbol.toUpperCase();
        const price = prices[sym];
        const value = price != null ? price * h.amount : 0;
        return { symbol: sym, value };
      })
      .filter((item) => item.value > 0);

    if (items.length === 0) return [];

    const totalValue = items.reduce((sum, item) => sum + item.value, 0);

    return items.map((item, i) => ({
      ...item,
      percentage: (item.value / totalValue) * 100,
      color: COLORS[i % COLORS.length],
    }));
  }, [holdings, prices]);

  const totalValue = useMemo(
    () => allocationData.reduce((sum, d) => sum + d.value, 0),
    [allocationData],
  );

  if (allocationData.length === 0) return null;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeWidth = 22;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <div className="px-5 py-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          🍩 Portfolio Allocation
        </p>
      </div>
      <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-700">
        <div className="flex flex-col items-center md:flex-row md:items-start md:gap-8">
          {/* Donut chart */}
          <div className="mb-5 flex shrink-0 justify-center md:mb-0">
            <svg
              viewBox="0 0 200 200"
              className="h-[180px] w-[180px] sm:h-[200px] sm:w-[200px]"
            >
              {allocationData.length === 1 ? (
                <circle
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  stroke={allocationData[0].color}
                  strokeWidth={strokeWidth}
                />
              ) : (
                allocationData.map((item, i) => {
                  const cumulativePrev = allocationData
                    .slice(0, i)
                    .reduce(
                      (sum, d) =>
                        sum + (d.percentage / 100) * circumference,
                      0,
                    );
                  const dashLength =
                    (item.percentage / 100) * circumference;
                  return (
                    <circle
                      key={item.symbol}
                      cx="100"
                      cy="100"
                      r={radius}
                      fill="none"
                      stroke={item.color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={`${dashLength} ${circumference}`}
                      strokeDashoffset={cumulativePrev}
                      transform="rotate(-90 100 100)"
                    />
                  );
                })
              )}
              {/* Center text */}
              <text
                x="100"
                y="94"
                textAnchor="middle"
                className="fill-slate-900 dark:fill-slate-100"
                fontSize="13"
                fontWeight="bold"
                fontFamily="system-ui, sans-serif"
              >
                {fmtCompact(totalValue)}
              </text>
              <text
                x="100"
                y="112"
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400"
                fontSize="10"
                fontFamily="system-ui, sans-serif"
              >
                {allocationData.length} coin
                {allocationData.length !== 1 ? "s" : ""}
              </text>
            </svg>
          </div>

          {/* Legend */}
          <div className="flex-1">
            <div className="flex flex-wrap gap-x-5 gap-y-2.5">
              {allocationData.map((item) => (
                <div
                  key={item.symbol}
                  className="flex items-center gap-2"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {item.symbol}
                  </span>
                  <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {item.percentage.toFixed(1)}%
                  </span>
                  <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
                    {fmtCompact(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default PortfolioAllocationChart;
