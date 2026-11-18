import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { JSX, ReactNode } from "react";
import { onSessionEnded } from "../api";
import { fetchMe, logOutOnServer } from "./bffApi";
import { listenForLogout, postLogout } from "./logoutChannel";
import type { AuthUser } from "./user";

export type AuthState =
  /** `GET /bff/me` has not answered yet. */
  | { status: "checking" }
  /** `GET /bff/me` could not tell: the BFF, Redis or Keycloak is down. Whether there is a session is unknown. */
  | { status: "unavailable" }
  | { status: "authenticated"; user: AuthUser }
  /** No session: there never was one, or it ended. The route guard sends the user to the BFF's login. */
  | { status: "anonymous" };

type AuthValue = {
  state: AuthState;
  /** Ends the session in the BFF, then goes to Keycloak's end-session URL. The other tabs follow. */
  logOut: () => Promise<void>;
  /** Repeats the startup check after it found the BFF unavailable. */
  retry: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

/**
 * The auth context. It holds no token and no cookie: the browser has only the BFF's
 * `httpOnly` session cookie, so the only way to know who is signed in is to ask
 * `GET /bff/me`. Until that answers the state is `checking`, so the login redirect
 * never flashes on a reload.
 *
 * A `401` on any later API call (the session ended, or Keycloak refused a renewal)
 * turns the state to `anonymous`.
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "checking" });
    void fetchMe(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.kind === "ok") setState({ status: "authenticated", user: result.user });
      else setState(result.kind === "anonymous" ? { status: "anonymous" } : { status: "unavailable" });
    });
    return () => controller.abort();
  }, [attempt]);

  useEffect(
    () =>
      onSessionEnded(() => {
        setState((prev) => (prev.status === "authenticated" ? { status: "anonymous" } : prev));
      }),
    [],
  );

  // This tab does not set the state when it logs out: it leaves the page, and a state change
  // would send it to the login redirect before the end-session URL.
  useEffect(() => listenForLogout((endSessionUrl) => window.location.assign(endSessionUrl ?? "/")), []);

  const logOut = useCallback(async (): Promise<void> => {
    let endSessionUrl: string | null = null;
    try {
      endSessionUrl = await logOutOnServer();
    } catch {
      // The BFF could not end the session. Reloading shows where things stand: still signed in,
      // or the "service unavailable" splash.
      window.location.assign("/");
      return;
    }
    postLogout(endSessionUrl);
    window.location.assign(endSessionUrl ?? "/");
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(() => ({ state, logOut, retry }), [state, logOut, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
