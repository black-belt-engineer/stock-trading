import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { JSX, KeyboardEvent, PointerEvent } from "react";
import type { Candle, CandleInterval } from "../../hooks/useCandles";
import { formatPrice, formatVolume } from "../../utils/format";
import { focusRing } from "../pageStyles";

type Props = {
  symbol: string;
  interval: CandleInterval;
  /** Oldest first. */
  bars: Candle[];
};

/** Space on the right for the price axis and below for the time axis, in px. */
const PRICE_AXIS_W = 68;
const TIME_AXIS_H = 22;
/** The volume strip's share of the plot height, and the gap above it. */
const VOLUME_SHARE = 0.18;
const VOLUME_GAP = 10;
/** Few bars are drawn at the width this many would have, right-aligned, instead of as huge blocks. */
const MIN_SLOTS = 30;
/** Time labels are at least this far apart. */
const LABEL_MIN_PX = 72;
/** Wanted gap between price gridlines. */
const PRICE_TICK_PX = 48;
const MAX_BODY_W = 14;

const INTERVAL_LABEL: Record<CandleInterval, string> = {
  "1m": "1-minute",
  "5m": "5-minute",
  "1h": "1-hour",
  "1d": "daily",
};

const hourMinute = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayMonth = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
/** Daily bars are UTC sessions, so their date is the UTC date, not the local one. */
const sessionDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const sessionDateLong = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const barTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** When the bar's bucket starts, for the readout. */
export function formatBarTime(bar: Candle, interval: CandleInterval): string {
  return interval === "1d" ? `${sessionDateLong.format(bar.timestamp)} (UTC session)` : barTime.format(bar.timestamp);
}

/** "Open $1.00, high …" for screen readers and the readout's title. */
function describeBar(bar: Candle, interval: CandleInterval): string {
  return (
    `${formatBarTime(bar, interval)}${bar.complete ? "" : ", in progress"}: ` +
    `open ${formatPrice(bar.open)}, high ${formatPrice(bar.high)}, low ${formatPrice(bar.low)}, ` +
    `close ${formatPrice(bar.close)}, volume ${formatVolume(bar.volume)}`
  );
}

/** Round gridline prices between `lo` and `hi`, about `count` of them. */
function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo;
  if (!(span > 0) || count < 1) return [];
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= raw) ?? 10) * magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(v);
  return ticks;
}

/** The OHLC values above the chart: the selected bar, or the latest. */
function Readout({ bar, interval }: { bar: Candle; interval: CandleInterval }): JSX.Element {
  const up = bar.close >= bar.open;
  const valueClass = up ? "text-positive" : "text-negative";
  const items: [string, string][] = [
    ["O", formatPrice(bar.open)],
    ["H", formatPrice(bar.high)],
    ["L", formatPrice(bar.low)],
    ["C", formatPrice(bar.close)],
    ["V", formatVolume(bar.volume)],
  ];
  return (
    <div
      aria-hidden="true"
      className="flex min-h-5 flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[12px] tabular-nums"
    >
      <span className="text-secondary">
        {formatBarTime(bar, interval)}
        {!bar.complete && <span className="ml-1.5 text-brand">live</span>}
      </span>
      {items.map(([label, value]) => (
        <span key={label}>
          <span className="text-secondary">{label} </span>
          <span className={label === "V" ? "text-primary" : valueClass}>{value}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Hand-written SVG candlestick chart (README Q5): candles, a volume strip,
 * a price axis, a time axis, and a crosshair with an OHLC readout. Shows the
 * bars it is given (a fixed window); no pan or zoom yet.
 *
 * Keyboard: the chart is one tab stop; Left/Right move between bars,
 * Home/End go to the first/last, Escape returns to following the latest.
 */
export function CandleChart({ symbol, interval, bars }: Props): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  /** The selected bar by its start, so it stays put when the window slides; `null` follows the latest. */
  const [selectedTs, setSelectedTs] = useState<number | null>(null);
  /** Pointer height inside the price area, for the horizontal crosshair line. */
  const [pointerY, setPointerY] = useState<number | null>(null);
  /** Text for screen readers after a keyboard move. */
  const [announcement, setAnnouncement] = useState("");

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const plotW = Math.max(0, size.width - PRICE_AXIS_W);
  const plotH = Math.max(0, size.height - TIME_AXIS_H);
  const volumeH = Math.round(plotH * VOLUME_SHARE);
  const priceH = Math.max(0, plotH - volumeH - VOLUME_GAP);
  const volumeTop = priceH + VOLUME_GAP;

  const slots = Math.max(bars.length, MIN_SLOTS);
  const slotW = plotW / slots;
  const offset = slots - bars.length;
  const xOf = (i: number): number => (offset + i + 0.5) * slotW;
  const bodyW = Math.max(1, Math.min(MAX_BODY_W, Math.floor(slotW * 0.7)));

  const scale = useMemo(() => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    let maxVolume = 0;
    for (const b of bars) {
      lo = Math.min(lo, b.low);
      hi = Math.max(hi, b.high);
      maxVolume = Math.max(maxVolume, b.volume);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    // All bars at one price (a new symbol, or only flat bars): give the axis a
    // small range around it instead of dividing by zero.
    const pad = hi > lo ? (hi - lo) * 0.06 : Math.max(Math.abs(hi) * 0.005, 0.01);
    return { lo: lo - pad, hi: hi + pad, maxVolume };
  }, [bars]);

  const yOf = (price: number): number => ((scale.hi - price) / (scale.hi - scale.lo)) * priceH;
  const priceOf = (y: number): number => scale.hi - (y / priceH) * (scale.hi - scale.lo);
  const ticks = niceTicks(scale.lo, scale.hi, Math.max(2, Math.floor(priceH / PRICE_TICK_PX)));

  const selectedIndex = selectedTs === null ? -1 : bars.findIndex((b) => b.timestamp === selectedTs);
  const shownIndex = selectedIndex >= 0 ? selectedIndex : bars.length - 1;
  const shown = bars[shownIndex];
  const last = bars.at(-1);

  // Time labels on bucket starts that are a multiple of `every` buckets since
  // the epoch, so they stay on the same bars while the window slides.
  const every = Math.max(1, Math.ceil(LABEL_MIN_PX / Math.max(slotW, 1)));
  const timeLabels: { x: number; text: string }[] = [];
  let previousDay = "";
  bars.forEach((b, i) => {
    const width = b.end - b.timestamp;
    if (Math.round(b.timestamp / width) % every !== 0) return;
    const day = interval === "1d" ? "" : dayMonth.format(b.timestamp);
    const text =
      interval === "1d" ? sessionDate.format(b.timestamp) : day !== previousDay && previousDay !== "" ? day : hourMinute.format(b.timestamp);
    previousDay = day;
    const x = xOf(i);
    if (x > 18 && x < plotW - 18) timeLabels.push({ x, text });
  });
  // A short series can miss every multiple of the stride: label the latest bar then.
  if (timeLabels.length === 0 && last) {
    const text = interval === "1d" ? sessionDate.format(last.timestamp) : hourMinute.format(last.timestamp);
    timeLabels.push({ x: Math.min(xOf(bars.length - 1), plotW - 24), text });
  }

  const select = (index: number, announce: boolean): void => {
    const bar = bars[index];
    if (!bar) return;
    // The latest bar is "follow the latest", so a new bar moves the selection with it.
    setSelectedTs(index === bars.length - 1 ? null : bar.timestamp);
    if (announce) setAnnouncement(describeBar(bar, interval));
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || x > plotW || bars.length === 0) return;
    const index = Math.min(bars.length - 1, Math.max(0, Math.floor(x / slotW) - offset));
    select(index, false);
    setPointerY(y >= 0 && y <= priceH ? y : null);
  };

  const onPointerLeave = (): void => {
    setSelectedTs(null);
    setPointerY(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (bars.length === 0) return;
    const keys: Record<string, number> = {
      ArrowLeft: Math.max(0, shownIndex - 1),
      ArrowRight: Math.min(bars.length - 1, shownIndex + 1),
      Home: 0,
      End: bars.length - 1,
    };
    const target = keys[event.key];
    if (target !== undefined) {
      event.preventDefault();
      setPointerY(null);
      select(target, true);
    } else if (event.key === "Escape" && selectedTs !== null) {
      event.preventDefault();
      setSelectedTs(null);
      if (last) setAnnouncement(describeBar(last, interval));
    }
  };

  const crosshairX = selectedIndex >= 0 || pointerY !== null ? xOf(shownIndex) : null;
  const lastUp = last ? last.close >= last.open : true;

  return (
    <div className="grid gap-2">
      {shown && <Readout bar={shown} interval={interval} />}
      <div
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`${symbol} ${INTERVAL_LABEL[interval]} candles, ${bars.length} bars. Left and right arrow keys move between bars.`}
        onKeyDown={onKeyDown}
        className={`rounded-md ${focusRing}`}
      >
        <div ref={boxRef} className="h-[300px] w-full touch-pan-y select-none md:h-[420px]">
          {size.width > 0 && (
            <svg
              aria-hidden="true"
              focusable="false"
              width={size.width}
              height={size.height}
              onPointerMove={onPointerMove}
              onPointerDown={onPointerMove}
              onPointerLeave={onPointerLeave}
              className="block font-mono text-[11px]"
            >
              {/* Price gridlines and labels */}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={0} x2={plotW} y1={yOf(t)} y2={yOf(t)} stroke="var(--border-subtle)" />
                  <text x={plotW + 8} y={yOf(t)} dy="0.35em" fill="var(--text-secondary)">
                    {t.toFixed(2)}
                  </text>
                </g>
              ))}
              <line x1={0} x2={plotW} y1={volumeTop - VOLUME_GAP / 2} y2={volumeTop - VOLUME_GAP / 2} stroke="var(--border-default)" />

              {/* Volume strip */}
              {scale.maxVolume > 0 &&
                bars.map((b, i) => {
                  const h = (b.volume / scale.maxVolume) * volumeH;
                  if (h <= 0) return null;
                  return (
                    <rect
                      key={`v${b.timestamp}`}
                      x={xOf(i) - bodyW / 2}
                      y={volumeTop + volumeH - h}
                      width={bodyW}
                      height={h}
                      fill={b.close >= b.open ? "var(--positive)" : "var(--negative)"}
                      opacity={0.45}
                    />
                  );
                })}

              {/* Candles: a wick from low to high and a body from open to close */}
              {bars.map((b, i) => {
                const x = xOf(i);
                const color = b.close >= b.open ? "var(--positive)" : "var(--negative)";
                const top = yOf(Math.max(b.open, b.close));
                const bottom = yOf(Math.min(b.open, b.close));
                return (
                  <g key={b.timestamp}>
                    <line x1={x} x2={x} y1={yOf(b.high)} y2={yOf(b.low)} stroke={color} strokeWidth={1} />
                    {bottom - top < 1 ? (
                      // A flat bar (open = close) is a line, not an invisible zero-height rectangle.
                      <line x1={x - bodyW / 2} x2={x + bodyW / 2} y1={top} y2={top} stroke={color} strokeWidth={1.5} />
                    ) : (
                      <rect x={x - bodyW / 2} y={top} width={bodyW} height={bottom - top} fill={color} />
                    )}
                  </g>
                );
              })}

              {/* Last price line and tag */}
              {last && (
                <g>
                  <line
                    x1={0}
                    x2={plotW}
                    y1={yOf(last.close)}
                    y2={yOf(last.close)}
                    stroke={lastUp ? "var(--positive)" : "var(--negative)"}
                    strokeDasharray="2 3"
                    opacity={0.7}
                  />
                  <rect
                    x={plotW + 2}
                    y={yOf(last.close) - 9}
                    width={PRICE_AXIS_W - 4}
                    height={18}
                    rx={3}
                    fill={lastUp ? "var(--positive)" : "var(--negative)"}
                  />
                  <text x={plotW + 8} y={yOf(last.close)} dy="0.35em" fill="var(--text-inverse)" fontWeight={600}>
                    {last.close.toFixed(2)}
                  </text>
                </g>
              )}

              {/* Crosshair */}
              {crosshairX !== null && (
                <line x1={crosshairX} x2={crosshairX} y1={0} y2={plotH} stroke="var(--text-secondary)" strokeDasharray="3 3" />
              )}
              {pointerY !== null && (
                <g>
                  <line x1={0} x2={plotW} y1={pointerY} y2={pointerY} stroke="var(--text-secondary)" strokeDasharray="3 3" />
                  <rect x={plotW + 2} y={pointerY - 9} width={PRICE_AXIS_W - 4} height={18} rx={3} fill="var(--bg-input)" />
                  <text x={plotW + 8} y={pointerY} dy="0.35em" fill="var(--text-primary)">
                    {priceOf(pointerY).toFixed(2)}
                  </text>
                </g>
              )}

              {/* Time axis */}
              <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke="var(--border-default)" />
              {timeLabels.map((l) => (
                <text key={l.x} x={l.x} y={plotH + 15} textAnchor="middle" fill="var(--text-secondary)">
                  {l.text}
                </text>
              ))}
            </svg>
          )}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
