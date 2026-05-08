import { useMemo } from "react";
import type { JSX } from "react";

type Props = {
  prices: number[];
  height: number;
};

export function Sparkline({ prices, height }: Props): JSX.Element | null {
  const width = 100;
  const shape = useMemo(() => {
    if (prices.length < 2) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const points = prices.map((price, index) => {
      const x = (index / (prices.length - 1)) * width;
      const y = height - ((price - min) / (max - min || 1)) * height * 0.8 + height * 0.1;
      return `${x},${y}`;
    });
    const polyline = points.join(" ");
    const polygon = [`0,${height}`, ...points, `${width},${height}`].join(" ");
    const isUp = prices[prices.length - 1]! >= prices[0]!;
    const color = isUp ? "var(--accent-green)" : "var(--accent-red)";
    return { polyline, polygon, color };
  }, [prices, height]);

  if (!shape) return null;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ overflow: "hidden", pointerEvents: "none", display: "block" }}
    >
      <polygon points={shape.polygon} fill={shape.color} opacity={0.08} />
      <polyline points={shape.polyline} fill="none" stroke={shape.color} strokeWidth={1.5} />
    </svg>
  );
}
