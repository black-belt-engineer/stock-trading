import { useState } from "react";
import type { JSX } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import SocialProviders, { getSocialProviders } from "../SocialProviders";

/**
 * The login page: email, password, "Log in", and a link to register. No
 * remember-me, no password reset and no passkeys (the realm has none of them).
 * A failed login gives one error for both fields, so it never says which was wrong.
 */
export default function Login(props: PageProps<Extract<KcContext, { pageId: "login.ftl" }>, I18n>): JSX.Element {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { realm, url, usernameHidden, login, messagesPerField, registrationDisabled } = kcContext;
  const { msg, msgStr } = i18n;

  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasError = messagesPerField.existsError("username", "password");
  const errorId = "login-error";

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={doUseDefaultCss}
      classes={classes}
      // A field error is shown in the form, so the banner stays away.
      displayMessage={!hasError}
      headerNode={msg("loginAccountTitle")}
      displayInfo={realm.password && realm.registrationAllowed && !registrationDisabled}
      infoNode={
        <span id="kc-registration">
          {msg("noAccount")} <a href={url.registrationUrl}>{msg("createOneLink")}</a>
        </span>
      }
    >
      <SocialProviders providers={getSocialProviders(kcContext)} i18n={i18n} />
      {realm.password && (
        <form
          id="kc-form-login"
          className="st-form"
          action={url.loginAction}
          method="post"
          onSubmit={() => {
            setIsSubmitting(true);
            return true;
          }}
        >
          {!usernameHidden && (
            <div className="st-field">
              <label htmlFor="username" className="st-label">
                {!realm.loginWithEmailAllowed ? msg("username") : !realm.registrationEmailAsUsername ? msg("usernameOrEmail") : msg("email")}
              </label>
              <input
                id="username"
                className="st-input"
                name="username"
                type="text"
                defaultValue={login.username ?? ""}
                autoFocus
                autoComplete="username"
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
              />
            </div>
          )}
          <div className="st-field">
            <label htmlFor="password" className="st-label">
              {msg("password")}
            </label>
            <input
              id="password"
              className="st-input"
              name="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
            />
          </div>
          {hasError && (
            // Announced when the page loads with the error.
            <p id={errorId} className="st-error" role="alert" dangerouslySetInnerHTML={{ __html: kcSanitize(messagesPerField.getFirstError("username", "password")) }} />
          )}
          <button type="submit" id="kc-login" name="login" className="st-button" disabled={isSubmitting}>
            {msgStr("doLogIn")}
          </button>
        </form>
      )}
    </Template>
  );
}
