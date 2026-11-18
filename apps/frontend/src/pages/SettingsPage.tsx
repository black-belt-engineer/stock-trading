import type { JSX } from "react";
import { useAuth } from "../auth/AuthProvider";
import { SettingsSection } from "./settings/fields";

/**
 * `/settings`. Keycloak owns the account now: until the buttons for its profile,
 * password and delete-account actions arrive (K5, next commit), the page only shows
 * who is signed in. A Preferences section comes with its first setting (D3's default
 * view, D4's theme), not before (owner decision).
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
      </div>
    </>
  );
}
