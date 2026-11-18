import type { JSX } from "react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

type Props = PageProps<Extract<KcContext, { pageId: "login-idp-link-confirm.ftl" }>, I18n>;

/** A Google sign-in whose email already has an account: review the profile or link. */
export default function LoginIdpLinkConfirm(props: Props): JSX.Element {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { url, idpAlias } = kcContext;
  const { msg } = i18n;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={doUseDefaultCss}
      classes={classes}
      headerNode={msg("confirmLinkIdpTitle")}
    >
      <form id="kc-register-form" className="st-form" action={url.loginAction} method="post">
        <button type="submit" className="st-button" name="submitAction" id="linkAccount" value="linkAccount">
          {msg("confirmLinkIdpContinue", idpAlias)}
        </button>
        <button type="submit" className="st-button st-button-secondary" name="submitAction" id="updateProfile" value="updateProfile">
          {msg("confirmLinkIdpReviewProfile")}
        </button>
      </form>
    </Template>
  );
}
