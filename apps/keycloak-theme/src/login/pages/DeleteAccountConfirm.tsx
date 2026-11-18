import type { JSX } from "react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

type Props = PageProps<Extract<KcContext, { pageId: "delete-account-confirm.ftl" }>, I18n>;

/** The delete_account action: what deleting means, a danger button, and cancel. */
export default function DeleteAccountConfirm(props: Props): JSX.Element {
  const { kcContext, i18n, doUseDefaultCss, Template, classes } = props;
  const { url, triggered_from_aia } = kcContext;
  const { msg, msgStr } = i18n;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={doUseDefaultCss}
      classes={classes}
      headerNode={msg("deleteAccountConfirm")}
    >
      <form action={url.loginAction} className="st-form" method="post">
        <p className="st-message st-message-warning" role="alert">
          {msg("irreversibleAction")}
        </p>
        <div>
          <p className="st-text">{msg("deletingImplies")}</p>
          <ul className="st-list">
            <li>{msg("loggingOutImmediately")}</li>
            <li>{msg("errasingData")}</li>
          </ul>
        </div>
        <p className="st-text">{msg("finalDeletionConfirmation")}</p>
        <button type="submit" className="st-button st-button-danger">
          {msgStr("doConfirmDelete")}
        </button>
        {triggered_from_aia && (
          <button type="submit" className="st-button st-button-secondary" name="cancel-aia" value="true" formNoValidate>
            {msgStr("doCancel")}
          </button>
        )}
      </form>
    </Template>
  );
}
