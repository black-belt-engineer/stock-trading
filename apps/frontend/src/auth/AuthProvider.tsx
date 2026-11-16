import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";
import { session } from "../api";
import { logIn, logOutOnServer, register, type AuthResult } from "./authApi";
import type { AuthUser } from "./session";

export type AuthState =
  /** The startup refresh has not answered yet. */
  | { status: "checking" }
  /** The startup refresh could not reach the auth service: whether there is a session is unknown. */
  | { status: "unavailable" }
  | { status: "authenticated"; user: AuthUser }
  /**
   * No session. `logout` when the user (in this tab or another) chose to log out;
   * `ended` when there never was one or it ran out, so the requested page is kept.
   */
  | { status: "anonymous"; reason: "logout" | "ended" };

type AuthValue = {
  state: AuthState;
  logIn: (email: string, password: string) => Promise<AuthResult>;
  register: (email: string, name: string, password: string) => Promise<AuthResult>;
  logOut: () => Promise<void>;
  /** Repeats the startup refresh after it found the auth service unavailable. */
  retry: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

/**
 * The auth context (A3 step 2). It holds no token itself: the session in
 * `api/index.ts` keeps the access token in memory, and this provider mirrors its
 * user and its logouts into React state.
 *
 * On start it refreshes once, through the cookie: success means logged in, a
 * refusal means logged out. Until that answers, the state is `checking`, so the
 * login page never flashes on a reload.
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>(() => {
    const user = session.getUser();
    return user ? { status: "authenticated", user } : { status: "checking" };
  });
  const [attempt, setAttempt] = useState(0);
  // Set just before this tab's own logout, so that one is told apart from an expired session.
  const loggingOut = useRef(false);

  useEffect(() => {
    const offCredentials = session.onCredentials(({ user }) => setState({ status: "authenticated", user }));
    const offLoggedOut = session.onLoggedOut((origin) => {
      const chosen = origin === "remote" || loggingOut.current;
      loggingOut.current = false;
      setState({ status: "anonymous", reason: chosen ? "logout" : "ended" });
    });
    return () => {
      offCredentials();
      offLoggedOut();
    };
  }, []);

  useEffect(() => {
    if (session.getUser()) return;
    let cancelled = false;
    setState({ status: "checking" });
    void session.renew(null).then((result) => {
      if (cancelled) return;
      // "ok" and "logged-out" have already reached the listeners above.
      if (result === "unavailable") setState({ status: "unavailable" });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const doLogIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const result = await logIn(email, password);
    if (result.ok) session.setCredentials(result.credentials);
    return result;
  }, []);

  const doRegister = useCallback(async (email: string, name: string, password: string): Promise<AuthResult> => {
    const result = await register(email, name, password);
    if (result.ok) session.setCredentials(result.credentials);
    return result;
  }, []);

  const doLogOut = useCallback(async (): Promise<void> => {
    await logOutOnServer();
    loggingOut.current = true;
    // Clears the token, aborts the stream (usePriceStream listens) and tells the other tabs.
    session.logOut();
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(
    () => ({ state, logIn: doLogIn, register: doRegister, logOut: doLogOut, retry }),
    [state, doLogIn, doRegister, doLogOut, retry],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
