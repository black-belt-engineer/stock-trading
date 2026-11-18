import { useEffect } from "react";
import type { JSX } from "react";
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router";
import { Splash } from "../components/Splash";
import { StreamProvider } from "../stream/StreamProvider";
import { useAuth } from "./AuthProvider";
import { bffLoginUrl, NEXT_PARAM, safeRedirectTarget } from "./redirect";

/**
 * Leaves the SPA for the BFF's login, which redirects to Keycloak. A full navigation, not a
 * router one: `/bff/login` is a server route. `replace`, so Back does not return to a
 * page that would send the user straight out again.
 */
function LoginRedirect({ returnTo, register = false }: { returnTo: string; register?: boolean }): JSX.Element {
  useEffect(() => {
    window.location.replace(bffLoginUrl(returnTo, { register }));
  }, [returnTo, register]);
  return <Splash />;
}

/**
 * Every route but `/login` and `/register`. Without a session it sends the user to the
 * BFF's login with the requested URL kept.
 *
 * The stream provider lives here, inside the guard: nothing fetches or streams
 * without a session, a session that ends unmounts it (which closes the stream), and
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
  if (state.status === "anonymous") return <LoginRedirect returnTo={pathname + search + hash} />;
  return <Splash unavailable={state.status === "unavailable"} onRetry={retry} />;
}

/**
 * `/login` and `/register` only redirect, so old links and bookmarks still work: to the
 * BFF's login (or registration), keeping the old `?next=` target. With a session, go on
 * to that target instead.
 */
export function AuthEntry({ register = false }: { register?: boolean }): JSX.Element {
  const { state, retry } = useAuth();
  const [params] = useSearchParams();
  const target = safeRedirectTarget(params.get(NEXT_PARAM), window.location.origin);

  if (state.status === "authenticated") return <Navigate to={target} replace />;
  if (state.status === "anonymous") return <LoginRedirect returnTo={target} register={register} />;
  return <Splash unavailable={state.status === "unavailable"} onRetry={retry} />;
}
