import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { JSX } from "react";
import { useNavigate } from "react-router";
import { BellIcon } from "../components/icons";
import { focusRing } from "../components/pageStyles";
import { alertCondition, CHECKED_WHILE_OPEN, firedAtText } from "./alertText";
import { useAlerts } from "./AlertsProvider";

/** How many recent triggers the menu lists. */
const RECENT = 5;

const itemClass =
  "flex cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-[13px] text-secondary outline-none select-none " +
  "data-highlighted:bg-elevated data-highlighted:text-primary";

const allClass =
  "flex h-9 cursor-pointer items-center rounded-md px-2.5 text-[13px] text-brand outline-none select-none data-highlighted:bg-elevated";

/**
 * The sidebar's bell (P2 step 4): recent triggers, with a count of the ones not seen yet (any tab
 * or device), and a link to the Alerts page. Opening it marks them seen. Same shape as the theme
 * menu: icon only in the header row and on the rail, "Alerts" beside it on the wide sidebar;
 * not modal and not portalled, for the same reasons.
 */
export function AlertsBell(): JSX.Element {
  const { history, unseen, markSeen } = useAlerts();
  const navigate = useNavigate();
  const recent = history.slice(0, RECENT);
  const name = unseen > 0 ? `Alerts, ${unseen} new` : "Alerts";

  return (
    <DropdownMenu.Root modal={false} onOpenChange={(open) => open && markSeen()}>
      <DropdownMenu.Trigger
        aria-label={name}
        title={name}
        className={
          "relative flex h-8 w-8 cursor-pointer items-center justify-center gap-2.5 rounded-md border border-default text-[13px] text-secondary transition-colors duration-150 " +
          "hover:text-primary data-[state=open]:text-primary " +
          "md:h-10 md:w-full md:rounded-lg md:border-transparent md:px-3 md:text-[14px] md:hover:bg-elevated md:max-xl:px-0 xl:justify-start " +
          focusRing
        }
      >
        <BellIcon />
        <span aria-hidden="true" className="hidden xl:inline">
          Alerts
        </span>
        {unseen > 0 && (
          <span
            aria-hidden="true"
            className={
              "absolute -top-1 -right-1 min-w-4 rounded-full bg-brand px-1 text-center font-mono text-[10px] leading-4 font-semibold text-inverse " +
              "md:max-xl:top-0.5 md:max-xl:right-2.5 xl:static xl:ml-auto"
            }
          >
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        className="z-50 w-[min(300px,calc(100vw-16px))] rounded-lg border border-default bg-surface p-1 shadow-dialog"
      >
        <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[11px] tracking-widest text-secondary uppercase">
          Recent alerts
        </DropdownMenu.Label>
        {recent.length === 0 ? (
          <p className="px-2.5 py-2 text-[13px] text-secondary">No alert has fired yet.</p>
        ) : (
          recent.map((alert) => (
            <DropdownMenu.Item
              key={alert.id}
              className={itemClass}
              onSelect={() => navigate(`/?symbol=${encodeURIComponent(alert.symbol)}`)}
            >
              <span className="text-primary">
                <span className="font-mono font-semibold">{alert.symbol}</span> {alertCondition(alert)}
              </span>
              <span>{firedAtText(alert)}</span>
            </DropdownMenu.Item>
          ))
        )}
        <DropdownMenu.Separator className="my-1 border-t border-subtle" />
        <DropdownMenu.Item className={allClass} onSelect={() => navigate("/alerts")}>
          All alerts
        </DropdownMenu.Item>
        <p className="px-2.5 pt-1 pb-1.5 text-[12px] text-secondary">{CHECKED_WHILE_OPEN}</p>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
