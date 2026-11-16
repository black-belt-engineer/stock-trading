import type { JSX } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { NEXT_PARAM } from "../auth/redirect";
import { AuthCard } from "../components/AuthCard";
import { linkClass } from "../components/pageStyles";
import { Field, FormError, SubmitButton, formText, useAuthForm } from "./authForm";

export function LoginPage(): JSX.Element {
  const { logIn } = useAuth();
  const [params] = useSearchParams();
  const { busy, error, onSubmit } = useAuthForm((form) => logIn(formText(form, "email"), formText(form, "password")));
  // The register link keeps the page to return to; the guard validates it on the way out.
  const next = params.get(NEXT_PARAM);
  const registerHref = next === null ? "/register" : `/register?${NEXT_PARAM}=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          No account yet?{" "}
          <Link to={registerHref} className={linkClass}>
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field id="email" label="Email" type="email" autoComplete="username" />
        <Field id="password" label="Password" type="password" autoComplete="current-password" />
        <FormError message={error} />
        <SubmitButton busy={busy} label="Log in" busyLabel="Logging in…" />
      </form>
    </AuthCard>
  );
}
