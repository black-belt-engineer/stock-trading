import type { JSX } from "react";
import { useAuth } from "../auth/AuthProvider";
import { bffActionUrl } from "../auth/redirect";
import type { AccountAction } from "../auth/redirect";
import { buttonClass } from "../components/pageStyles";
import { SettingsSection } from "./settings/fields";

const SETTINGS_PATH = "/settings";

/**
 * A button that leaves for one of Keycloak's account pages. It is a link, not a router
 * link: the browser goes to the BFF, which sends it on to Keycloak and back.
 */
function ActionLink(props: { action: AccountAction; returnTo: string; label: string; tone?: "danger" }): JSX.Element {
  const tone = props.tone === "danger" ? "border-negative/60! text-negative!" : "border-brand! bg-brand-dim! text-brand!";
  return (
    <a href={bffActionUrl(props.action, props.returnTo)} className={`${buttonClass} h-10 justify-self-start no-underline ${tone}`}>
      {props.label}
    </a>
  );
}

/**
 * `/settings`. Keycloak owns the account: each section describes what it does and
 * has a button that opens Keycloak's page for it, then comes back here with the
 * session's name and email refreshed. A Preferences section comes with its first
 * setting (D3's default view, D4's theme), not before (owner decision).
 */
export function SettingsPage(): JSX.Element | null {
  const { state } = useAuth();
  // The route guard only renders this page with a session.
  if (state.status !== "authenticated") return null;
  const { user } = state;
  return (
    <>
      <h1 className="text-[18px] font-semibold text-primary">Settings</h1>
      <div className="grid w-full max-w-[560px] gap-5">
        <SettingsSection id="settings-account" title="Account">
          <dl className="grid gap-1 text-secondary">
            <dt className="text-[13px]">Name</dt>
            <dd className="text-primary">{user.name}</dd>
            <dt className="mt-2 text-[13px]">Email</dt>
            <dd className="font-mono wrap-anywhere text-primary">{user.email}</dd>
          </dl>
        </SettingsSection>
        <SettingsSection id="settings-profile" title="Profile">
          <p className="text-secondary">Change the name and email on your account.</p>
          <ActionLink action="UPDATE_PROFILE" returnTo={SETTINGS_PATH} label="Edit profile" />
        </SettingsSection>
        <SettingsSection id="settings-password" title="Password">
          <p className="text-secondary">
            Choose a new password. There is no password reset yet, so keep it somewhere safe.
          </p>
          <ActionLink action="UPDATE_PASSWORD" returnTo={SETTINGS_PATH} label="Change password" />
        </SettingsSection>
        <SettingsSection id="settings-danger" title="Danger zone" tone="danger">
          <p className="text-secondary">
            Deleting your account removes it for good and cannot be undone. Keycloak asks for your password first.
          </p>
          <ActionLink action="delete_account" returnTo={SETTINGS_PATH} label="Delete account" tone="danger" />
        </SettingsSection>
      </div>
    </>
  );
}
