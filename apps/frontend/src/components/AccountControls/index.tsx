import { useState } from "react";
import type { JSX } from "react";
import { LogoutIcon } from "../icons";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

type Props = { name: string; onLogOut: () => Promise<void> };

/**
 * The signed-in user's name and "Log out", at the foot of the sidebar (owner
 * decision; the shell has no top bar). Narrow: a text button in the header row,
 * the name read out only. Medium (icon rail): an icon button, the name in its
 * tooltip. Wide: the name above a labelled button.
 */
export function AccountControls({ name, onLogOut }: Props): JSX.Element {
  const [busy, setBusy] = useState(false);
  const logOut = (): void => {
    setBusy(true);
    // No reset of `busy`: on success this unmounts with the shell.
    void onLogOut().catch(() => setBusy(false));
  };

  return (
    <div className="flex min-w-0 items-center md:grid md:gap-1.5">
      <p className="sr-only truncate px-1.5 text-[13px] text-secondary xl:not-sr-only" title={name}>
        <span className="sr-only">Signed in as </span>
        {name}
      </p>
      <button
        type="button"
        onClick={logOut}
        disabled={busy}
        title={`Log out ${name}`}
        className={
          "flex h-8 cursor-pointer items-center gap-2.5 rounded-md border border-default px-3 text-[13px] text-secondary transition-colors duration-150 " +
          "hover:text-primary disabled:cursor-default disabled:opacity-60 " +
          "md:h-10 md:w-full md:rounded-lg md:border-transparent md:text-[14px] md:hover:bg-elevated md:max-xl:justify-center md:max-xl:px-0 " +
          focusRing
        }
      >
        <span className="hidden md:contents">
          <LogoutIcon />
        </span>
        <span className="md:max-xl:sr-only">Log out</span>
      </button>
    </div>
  );
}
