import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { LazyOrNot } from "keycloakify/tools/LazyOrNot";
import type { UserProfileFormFieldsProps } from "keycloakify/login/UserProfileFormFieldsProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

type RegisterProps = PageProps<Extract<KcContext, { pageId: "register.ftl" }>, I18n> & {
  UserProfileFormFields: LazyOrNot<(props: UserProfileFormFieldsProps) => React.ReactElement<any, any>>;
  doMakeUserConfirmPassword: boolean;
};

const PASSWORD_HINT_ID = "password-hint";

/**
 * The register page: email, name, password and confirm password, from the realm's
 * user profile (the fields and their errors come from `UserProfileFormFields`,
 * styled through the `classes` map in `KcPage`). The only hint is the password length.
 * The realm has no terms and no reCAPTCHA, so neither is rendered.
 */
export default function Register(props: RegisterProps): JSX.Element {
  const { kcContext, i18n, doUseDefaultCss, Template, classes, UserProfileFormFields, doMakeUserConfirmPassword } = props;
  const { url, messagesPerField, messageHeader } = kcContext;
  const { msg, msgStr, advancedMsg } = i18n;
  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });

  const [isFormSubmittable, setIsFormSubmittable] = useState(false);

  // The field component has no hook for it, so tie the hint to the input after it renders.
  useEffect(() => {
    document.getElementById("password")?.setAttribute("aria-describedby", PASSWORD_HINT_ID);
  }, []);

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={doUseDefaultCss}
      classes={classes}
      headerNode={messageHeader !== undefined ? advancedMsg(messageHeader) : msg("registerTitle")}
      displayMessage={messagesPerField.exists("global")}
      displayRequiredFields
      displayInfo
      infoNode={
        <span id="kc-login-link">
          {msg("haveAccountText")} <a href={url.loginUrl}>{msg("doLogIn")}</a>
        </span>
      }
    >
      <form id="kc-register-form" className="st-form" action={url.registrationAction} method="post">
        <UserProfileFormFields
          kcContext={kcContext}
          i18n={i18n}
          kcClsx={kcClsx}
          onIsFormSubmittableValueChange={setIsFormSubmittable}
          doMakeUserConfirmPassword={doMakeUserConfirmPassword}
          AfterField={({ attribute }) =>
            attribute.name === "password" ? (
              <p id={PASSWORD_HINT_ID} className="st-hint">
                {msg("passwordHint")}
              </p>
            ) : null
          }
        />
        <button type="submit" className="st-button" disabled={!isFormSubmittable}>
          {msgStr("doRegister")}
        </button>
      </form>
    </Template>
  );
}
