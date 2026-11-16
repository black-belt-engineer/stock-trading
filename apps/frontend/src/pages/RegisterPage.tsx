import type { JSX } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { NEXT_PARAM } from "../auth/redirect";
import { AuthCard } from "../components/AuthCard";
import { linkClass } from "../components/pageStyles";
import { Field, FormError, SubmitButton, formText, useAuthForm } from "./authForm";

/** Limits from `createUserBodySchema` in apps/user. */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MAX = 100;
const EMAIL_MAX = 254;

export function RegisterPage(): JSX.Element {
  const { register } = useAuth();
  const [params] = useSearchParams();
  const { busy, error, onSubmit } = useAuthForm((form) =>
    register(formText(form, "email"), formText(form, "name").trim(), formText(form, "password")),
  );
  const next = params.get(NEXT_PARAM);
  const loginHref = next === null ? "/login" : `/login?${NEXT_PARAM}=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      title="Create an account"
      footer={
        <>
          Already have an account?{" "}
          <Link to={loginHref} className={linkClass}>
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field id="email" label="Email" type="email" autoComplete="username" maxLength={EMAIL_MAX} />
        <Field id="name" label="Name" type="text" autoComplete="name" maxLength={NAME_MAX} />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          hint="At least 8 characters"
        />
        <FormError message={error} />
        <SubmitButton busy={busy} label="Create account" busyLabel="Creating account…" />
      </form>
    </AuthCard>
  );
}
