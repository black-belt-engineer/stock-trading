import type { JSX } from "react";
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router";
import { Splash } from "../components/Splash";
import { StreamProvider } from "../stream/StreamProvider";
import { useAuth } from "./AuthProvider";
import { NEXT_PARAM, safeRedirectTarget, withNext } from "./redirect";

/**
 * Every route but login and register (A3 step 7). Without a session it sends the
 * user to login with the requested URL kept, except after a chosen logout.
 *
 * The stream provider lives here, inside the guard: nothing fetches or streams
 * without a session, logging out unmounts it (which closes the stream), and
 * moving between the shell's pages keeps the one connection open.
 */
export function RequireAuth(): JSX.Element {
  const { state, retry } = useAuth();
  const { pathname, search, hash } = useLocation();

  if (state.status === "authenticated") {
    return (
      <StreamProvider>
        <Outlet />
      </StreamProvider>
    );
  }
  if (state.status === "anonymous") {
    const target = state.reason === "logout" ? "/" : pathname + search + hash;
    return <Navigate to={withNext("/login", target)} replace />;
  }
  return <Splash unavailable={state.status === "unavailable"} onRetry={retry} />;
}

/** Login and register: with a session, go on to the validated requested page, or `/`. */
export function PublicOnly(): JSX.Element {
  const { state, retry } = useAuth();
  const [params] = useSearchParams();

  if (state.status === "authenticated") {
    return <Navigate to={safeRedirectTarget(params.get(NEXT_PARAM), window.location.origin)} replace />;
  }
  if (state.status === "anonymous") return <Outlet />;
  return <Splash unavailable={state.status === "unavailable"} onRetry={retry} />;
}
