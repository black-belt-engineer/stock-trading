import { useState } from "react";
import type { JSX } from "react";
import { focusRing } from "../components/pageStyles";
import { disableNotifications, enableNotifications, notifyState } from "./browserNotifications";
import type { NotifyState } from "./browserNotifications";

/**
 * "Also show a browser notification" (P2 step 4). The browser is asked for permission only when
 * the box is ticked. After a denial the box is disabled and says why; the app never asks again.
 * The choice is per browser and applies to every alert.
 */
export function NotifyToggle(): JSX.Element | null {
  const [state, setState] = useState<NotifyState>(() => notifyState());
  const [asking, setAsking] = useState(false);
  if (state === "unsupported") return null;

  const onChange = async (checked: boolean): Promise<void> => {
    if (!checked) {
      setState(disableNotifications());
      return;
    }
    setAsking(true);
    setState(await enableNotifications());
    setAsking(false);
  };

  return (
    <div className="grid gap-1 text-[13px]">
      <label className="flex cursor-pointer items-center gap-2 text-primary has-disabled:cursor-default has-disabled:text-secondary">
        <input
          type="checkbox"
          checked={state === "on"}
          disabled={state === "denied" || asking}
          onChange={(event) => void onChange(event.target.checked)}
          className={`size-4 cursor-pointer accent-(--accent-brand) disabled:cursor-default ${focusRing}`}
        />
        Also show a browser notification when Streamtick is in the background
      </label>
      {state === "denied" && (
        <p className="text-secondary">
          Notifications are blocked for this site in your browser, so alerts show here only.
        </p>
      )}
    </div>
  );
}
