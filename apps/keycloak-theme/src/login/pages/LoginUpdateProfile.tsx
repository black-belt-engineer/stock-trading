import type { JSX } from "react";
import type { LazyOrNot } from "keycloakify/tools/LazyOrNot";
import type { UserProfileFormFieldsProps } from "keycloakify/login/UserProfileFormFieldsProps";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import ProfileForm from "./ProfileForm";

type Props = PageProps<Extract<KcContext, { pageId: "login-update-profile.ftl" }>, I18n> & {
  UserProfileFormFields: LazyOrNot<(props: UserProfileFormFieldsProps) => React.ReactElement<any, any>>;
  doMakeUserConfirmPassword: boolean;
};

export default function LoginUpdateProfile(props: Props): JSX.Element {
  return <ProfileForm {...props} titleKey="loginProfileTitle" formId="kc-update-profile-form" />;
}
