import type { JSX } from "react";
import { useAuth } from "../auth/AuthProvider";
import { DangerZone } from "./settings/DangerZone";
import { PasswordSection } from "./settings/PasswordSection";
import { ProfileSection } from "./settings/ProfileSection";

/**
 * `/settings` (A4): profile, password and account deletion. A Preferences section
 * comes with its first setting (D3's default view, D4's theme), not before
 * (owner decision).
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
        <ProfileSection user={user} />
        <PasswordSection user={user} />
        <DangerZone user={user} />
      </div>
    </>
  );
}
