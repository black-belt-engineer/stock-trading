import { isRecord } from "../utils/guards";

const CHANNEL_NAME = "auth";

/**
 * Tells the other tabs of this browser that the user logged out, so they leave at once
 * instead of at their next request. The message carries Keycloak's end-session URL:
 * each tab goes there too, so none of them can log back in silently through the single
 * sign-on session that this tab is still ending.
 */
export function postLogout(endSessionUrl: string | null): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type: "logout", endSessionUrl });
  channel.close();
}

/** Calls `listener` with the end-session URL (or `null`) when another tab logs out. Returns the unsubscribe function. */
export function listenForLogout(listener: (endSessionUrl: string | null) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!isRecord(data) || data.type !== "logout") return;
    listener(typeof data.endSessionUrl === "string" ? data.endSessionUrl : null);
  });
  return () => channel.close();
}
