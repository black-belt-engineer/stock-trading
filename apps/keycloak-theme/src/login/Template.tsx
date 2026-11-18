import { useEffect } from "react";
import type { JSX } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { useSetClassName } from "keycloakify/tools/useSetClassName";
import { useInitialize } from "keycloakify/login/Template.useInitialize";
import type { TemplateProps } from "keycloakify/login/TemplateProps";
import type { KcContext } from "./KcContext";
import type { I18n } from "./i18n";
import "./theme.css";

/**
 * The shared layout (owner decision, phase 10): a centred card on the page
 * background with the app name above it and the note about password reset
 * below. Every page Keycloak can show sits in it, ejected or not.
 *
 * Patternfly is never loaded (`doUseDefaultCss` is false), so only the classes in
 * `theme.css` style the pages. The scripts Keycloak needs (session polling, the
 * language menu) still come from `useInitialize`.
 */
export default function Template(props: TemplateProps<KcContext, I18n>): JSX.Element | null {
  const {
    displayInfo = false,
    displayMessage = true,
    displayRequiredFields = false,
    headerNode,
    socialProvidersNode = null,
    infoNode = null,
    documentTitle,
    bodyClassName,
    kcContext,
    i18n,
    doUseDefaultCss,
    children
  } = props;

  const { msg, msgStr } = i18n;
  const { realm, auth, url, message, isAppInitiatedAction } = kcContext;

  // Set once, as in Keycloak's own template.
  useEffect(() => {
    document.title = documentTitle ?? msgStr("loginTitle", realm.displayName || realm.name);
  }, []);

  useSetClassName({ qualifiedName: "html", className: "st-html" });
  useSetClassName({ qualifiedName: "body", className: bodyClassName ?? "st-body" });

  const { isReadyToRender } = useInitialize({ kcContext, doUseDefaultCss });
  if (!isReadyToRender) return null;

  const showMessage = displayMessage && message !== undefined && (message.type !== "warning" || !isAppInitiatedAction);
  // After a failed login the username is shown with a link to start again.
  const showAttemptedUsername = auth !== undefined && auth.showUsername && !auth.showResetCredentials;

  return (
    <main className="st-page">
      <div className="st-brand">{msg("loginTitleHtml", realm.displayNameHtml || realm.name)}</div>
      <section className="st-card" aria-labelledby="kc-page-title">
        <header>
          {showAttemptedUsername ? (
            <div id="kc-username" className="st-attempted">
              <span id="kc-attempted-username">{auth.attemptedUsername}</span>
              <a id="reset-login" href={url.loginRestartFlowUrl} aria-label={msgStr("restartLoginTooltip")}>
                {msg("restartLoginTooltip")}
              </a>
            </div>
          ) : (
            <h1 id="kc-page-title" className="st-title">
              {headerNode}
            </h1>
          )}
          {displayRequiredFields && (
            <p className="st-required">
              <span aria-hidden="true">*</span> {msg("requiredFields")}
            </p>
          )}
        </header>
        <div id="kc-content">
          {showMessage && (
            // `alert` is announced as it appears; `status` is polite, for info and success.
            <div className={`st-message st-message-${message.type}`} role={message.type === "error" ? "alert" : "status"}>
              <span dangerouslySetInnerHTML={{ __html: kcSanitize(message.summary) }} />
            </div>
          )}
          {children}
          {auth !== undefined && auth.showTryAnotherWayLink && (
            <form id="kc-select-try-another-way-form" action={url.loginAction} method="post">
              <input type="hidden" name="tryAnotherWay" value="on" />
              <button type="submit" id="try-another-way" className="st-link-button">
                {msg("doTryAnotherWay")}
              </button>
            </form>
          )}
          {socialProvidersNode}
          {displayInfo && (
            <div id="kc-info" className="st-info">
              {infoNode}
            </div>
          )}
        </div>
      </section>
      <p className="st-note">{msg("noPasswordResetNote")}</p>
    </main>
  );
}
