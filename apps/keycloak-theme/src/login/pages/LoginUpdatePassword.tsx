import type { JSX } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

type Props = PageProps<Extract<KcContext, { pageId: "login-update-password.ftl" }>, I18n>;

const HINT_ID = "password-new-hint";

/**
 * The UPDATE_PASSWORD action page: new password, confirmation, an optional
 * "log out other sessions" box, and a cancel button when the app started the action.
 */
export default function LoginUpdatePassword(props: Props): JSX.Element {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { url, messagesPerField, isAppInitiatedAction } = kcContext;
  const { msg, msgStr } = i18n;

  const passwordError = messagesPerField.existsError("password");
  const confirmError = messagesPerField.existsError("password-confirm");

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={doUseDefaultCss}
      classes={classes}
      displayMessage={!messagesPerField.existsError("password", "password-confirm")}
      headerNode={msg("updatePasswordTitle")}
    >
      <form id="kc-passwd-update-form" className="st-form" action={url.loginAction} method="post">
        <div className="st-field">
          <label htmlFor="password-new" className="st-label">
            {msg("passwordNew")}
          </label>
          <input
            type="password"
            id="password-new"
            name="password-new"
            className="st-input"
            autoFocus
            autoComplete="new-password"
            aria-invalid={passwordError}
            aria-describedby={passwordError ? "input-error-password" : HINT_ID}
          />
          {passwordError ? (
            <span
              id="input-error-password"
              className="st-error"
              aria-live="polite"
              dangerouslySetInnerHTML={{ __html: kcSanitize(messagesPerField.get("password")) }}
            />
          ) : (
            <p id={HINT_ID} className="st-hint">
              {msg("passwordHint")}
            </p>
          )}
        </div>
        <div className="st-field">
          <label htmlFor="password-confirm" className="st-label">
            {msg("passwordConfirm")}
          </label>
          <input
            type="password"
            id="password-confirm"
            name="password-confirm"
            className="st-input"
            autoComplete="new-password"
            aria-invalid={confirmError}
            aria-describedby={confirmError ? "input-error-password-confirm" : undefined}
          />
          {confirmError && (
            <span
              id="input-error-password-confirm"
              className="st-error"
              aria-live="polite"
              dangerouslySetInnerHTML={{ __html: kcSanitize(messagesPerField.get("password-confirm")) }}
            />
          )}
        </div>
        <label className="st-check">
          <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" />
          {msg("logoutOtherSessions")}
        </label>
        <button type="submit" className="st-button">
          {msgStr("doSubmit")}
        </button>
        {isAppInitiatedAction && (
          <button type="submit" className="st-button st-button-secondary" name="cancel-aia" value="true" formNoValidate>
            {msgStr("doCancel")}
          </button>
        )}
      </form>
    </Template>
  );
}
