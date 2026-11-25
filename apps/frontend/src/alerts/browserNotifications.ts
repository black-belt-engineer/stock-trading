import type { PriceAlert } from "./alertsApi";
import { alertCondition, firedAtText } from "./alertText";

/**
 * Optional browser notifications for alerts (P2 step 4, owner's choice). Off until the user
 * turns them on from the alert form or the Alerts page; permission is asked only then. A denial
 * is final: the browser keeps it, and the app never asks again (the toast is the fallback).
 *
 * The choice is per browser (`localStorage`), like the theme.
 */

const KEY = "streamtick.alerts.notify";

export type NotifyState = "unsupported" | "off" | "on" | "denied";

function api(): typeof Notification | null {
  return typeof window !== "undefined" && "Notification" in window ? window.Notification : null;
}

function readPref(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function writePref(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEY, "on");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

let sessionPref: boolean | null = null;

export function notifyState(): NotifyState {
  const N = api();
  if (N === null) return "unsupported";
  if (N.permission === "denied") return "denied";
  const on = sessionPref ?? readPref();
  return on && N.permission === "granted" ? "on" : "off";
}

/** Turns notifications on, asking for permission if the browser has not been asked yet. */
export async function enableNotifications(): Promise<NotifyState> {
  const N = api();
  if (N === null) return "unsupported";
  let permission = N.permission;
  if (permission === "default") {
    try {
      permission = await N.requestPermission();
    } catch {
      permission = "denied";
    }
  }
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  sessionPref = true;
  writePref(true);
  return "on";
}

export function disableNotifications(): NotifyState {
  sessionPref = false;
  writePref(false);
  return notifyState();
}

/**
 * Shows a browser notification for an alert this tab was first to trigger, only while the tab is
 * hidden: a visible tab has the toast. A click brings the tab forward.
 */
export function notifyInBackground(alert: PriceAlert): void {
  const N = api();
  if (N === null || notifyState() !== "on" || document.visibilityState === "visible") return;
  try {
    const notification = new N(`${alert.symbol} ${alertCondition(alert)}`, {
      body: firedAtText(alert),
      tag: `streamtick-alert-${alert.id}`,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the toast still shows.
  }
}
