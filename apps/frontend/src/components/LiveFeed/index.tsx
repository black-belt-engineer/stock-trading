import type { FeedEvent } from "../../types";
import type { JSX } from "react";
import { formatPrice } from "../../utils/format";

type Props = {
  feed: FeedEvent[];
};

export function LiveFeed({ feed }: Props): JSX.Element {
  return (
    <aside className="w-[300px] border-l border-subtle bg-sidebar px-3.5 pt-3.5 pb-2.5">
      <div className="mb-3 text-[12px] tracking-widest text-secondary uppercase">Live Feed</div>
      <div className="max-h-[calc(100vh-80px)] overflow-y-auto">
        {feed.length === 0 && <div className="py-2 text-secondary">Waiting for trades…</div>}
        {feed.map((item) => (
          <div key={item.id} className="animate-feed-in border-b border-subtle py-2 motion-reduce:animate-none">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center">
                <span className="rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-[11px]">{item.symbol}</span>
                <span className="ml-2 font-mono">{formatPrice(item.price)}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Same colours as the cards: positive for buy, negative for sell. */}
                <span
                  className={
                    "inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-inverse " +
                    (item.side === "buy" ? "bg-positive" : "bg-negative")
                  }
                >
                  {item.side === "buy" ? "B" : "S"}
                </span>
                <span className="text-[10px] text-muted">{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
