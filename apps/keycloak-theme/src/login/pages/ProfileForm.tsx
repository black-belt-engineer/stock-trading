import { useState } from "react";
import type { JSX } from "react";
import type { LazyOrNot } from "keycloakify/tools/LazyOrNot";
import type { UserProfileFormFieldsProps } from "keycloakify/login/UserProfileFormFieldsProps";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";

type ProfileFormProps = PageProps<
  Extract<KcContext, { pageId: "login-update-profile.ftl" | "idp-review-user-profile.ftl" }>,
  I18n
> & {
  UserProfileFormFields: LazyOrNot<(props: UserProfileFormFieldsProps) => React.ReactElement<any, any>>;
  doMakeUserConfirmPassword: boolean;
  titleKey: "loginProfileTitle" | "loginIdpReviewProfileTitle";
  formId: string;
};

/**
 * The shared body of `login-update-profile.ftl` (the UPDATE_PROFILE action) and
 * `idp-review-user-profile.ftl` (a Google user checking their details): the realm's
 * user profile fields, a submit button and, for an app-initiated action, a cancel button.
 */
export default function ProfileForm(props: ProfileFormProps): JSX.Element {
  const { kcContext, i18n, doUseDefaultCss, Template, classes, UserProfileFormFields, doMakeUserConfirmPassword, titleKey, formId } = props;
  const { messagesPerField, url } = kcContext;
  const isAppInitiatedAction = "isAppInitiatedAction" in kcContext && kcContext.isAppInitiatedAction === true;
  const { msg, msgStr } = i18n;
  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });

  const [isFormSubmittable, setIsFormSubmittable] = useState(false);

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={doUseDefaultCss}
      classes={classes}
      displayRequiredFields
      headerNode={msg(titleKey)}
      displayMessage={messagesPerField.exists("global")}
    >
      <form id={formId} className="st-form" action={url.loginAction} method="post">
        <UserProfileFormFields
          kcContext={kcContext}
          i18n={i18n}
          kcClsx={kcClsx}
          onIsFormSubmittableValueChange={setIsFormSubmittable}
          doMakeUserConfirmPassword={doMakeUserConfirmPassword}
        />
        <button type="submit" className="st-button" disabled={!isFormSubmittable}>
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
