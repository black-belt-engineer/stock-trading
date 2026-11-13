import { useMemo } from "react";
import type { JSX } from "react";

type Props = {
  prices: number[];
  height: number;
};

export function Sparkline({ prices, height }: Props): JSX.Element | null {
  const width = 100;
  const shape = useMemo(() => {
    const first = prices[0];
    const last = prices[prices.length - 1];
    if (prices.length < 2 || first === undefined || last === undefined) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const points = prices.map((price, index) => {
      const x = (index / (prices.length - 1)) * width;
      const y = height - ((price - min) / (max - min || 1)) * height * 0.8 + height * 0.1;
      return `${x},${y}`;
    });
    const polyline = points.join(" ");
    const polygon = [`0,${height}`, ...points, `${width},${height}`].join(" ");
    const isUp = last >= first;
    const color = isUp ? "var(--positive)" : "var(--negative)";
    return { polyline, polygon, color };
  }, [prices, height]);

  if (!shape) return null;

  return (
    // Decorative: the card and dialog state the price and change in text.
    <svg
      aria-hidden="true"
      focusable="false"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="pointer-events-none block overflow-hidden"
    >
      <polygon points={shape.polygon} fill={shape.color} opacity={0.08} />
      <polyline points={shape.polyline} fill="none" stroke={shape.color} strokeWidth={1.5} />
    </svg>
  );
}
