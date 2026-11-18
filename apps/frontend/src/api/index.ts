import { createApiClient } from "./client";

export { LoggedOutError } from "./client";

const endedListeners = new Set<() => void>();

/** Called when the BFF answers `401` to an API call. Returns the unsubscribe function. */
export function onSessionEnded(listener: () => void): () => void {
  endedListeners.add(listener);
  return () => {
    endedListeners.delete(listener);
  };
}

export const apiFetch = createApiClient(() => {
  for (const listener of [...endedListeners]) listener();
});
