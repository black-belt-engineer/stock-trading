import { useEffect, useState } from "react";
import type { JSX } from "react";
import { useStreamStatus } from "../../stream/StreamProvider";

type Props = {
  /** Tighter spacing for use inside the detail dialog. */
  compact?: boolean;
};

/**
 * Shown while the stream has been down for a few seconds. Not a live region:
 * the connection status in the sidebar announces changes, and a ticking
 * countdown inside a live region would be read out every second.
 */
export function StaleBanner({ compact = false }: Props): JSX.Element | null {
  const { stale, nextRetryAt, retry } = useStreamStatus();
  const secondsLeft = useSecondsUntil(stale ? nextRetryAt : null);

  if (!stale) return null;

  return (
    <div
      className={
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-[10px] border border-warning/40 bg-warning/10 text-warning " +
        (compact ? "mx-5 mb-4 px-3 py-2 text-[12px]" : "px-4 py-2.5")
      }
    >
      <span>
        Connection lost — prices may be out of date.{" "}
        {/* Primary, not secondary: secondary drops below AA on the amber tint over the dialog surface. */}
        <span className="text-primary">
          {secondsLeft === null ? "Reconnecting…" : `Retrying in ${secondsLeft}s`}
        </span>
      </span>
      <button
        type="button"
        onClick={retry}
        className={
          "cursor-pointer rounded-md border border-warning/50 px-2.5 py-1 font-medium transition-colors duration-150 hover:bg-warning/15 " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        }
      >
        Retry now
      </button>
    </div>
  );
}

/** Whole seconds until `target`, re-evaluated every second; null when there is no target. */
function useSecondsUntil(target: number | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (target === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  if (target === null) return null;
  return Math.max(0, Math.ceil((target - now) / 1000));
}
