import type { JSX } from "react";
import { useAuth } from "../auth/AuthProvider";
import { bffActionUrl } from "../auth/redirect";
import type { AccountAction } from "../auth/redirect";
import { useState } from "react";
import { buttonClass } from "../components/pageStyles";
import { PillGroup } from "../components/PillGroup";
import { useTheme } from "../theme/ThemeProvider";
import { isThemeChoice, THEME_CHOICES } from "../theme/theme";
import { isQuoteViewPreference, readViewPreference, storeViewPreference } from "../hooks/useQuoteView";
import type { QuoteViewPreference } from "../hooks/useQuoteView";
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

const VIEW_CHOICES: readonly { id: QuoteViewPreference; label: string }[] = [
  { id: "auto", label: "Automatic" },
  { id: "cards", label: "Cards" },
  { id: "table", label: "Table" },
];

const THEME_PILLS = THEME_CHOICES.map(({ value, label }) => ({ id: value, label }));

/** One choice in Preferences: a caption (the pills carry the same name), the pills, and a line on what it does. */
function Preference(props: { title: string; hint: string; children: JSX.Element }): JSX.Element {
  return (
    <div className="grid gap-2">
      <p aria-hidden="true" className="text-[13px] text-primary">
        {props.title}
      </p>
      {props.children}
      <p className="text-[13px] text-secondary">{props.hint}</p>
    </div>
  );
}

/**
 * Display preferences of this browser, kept in `localStorage` like the toggles they
 * mirror: the theme (D4, also in the sidebar) and the quotes view (D3, also on the
 * quotes page). Keycloak is not the place for UI state.
 */
function PreferencesSection(): JSX.Element {
  const { choice, setChoice } = useTheme();
  // The quotes page reads the stored view when it mounts, so there is nothing live to follow here.
  const [view, setView] = useState<QuoteViewPreference>(readViewPreference);
  const changeView = (next: string): void => {
    if (!isQuoteViewPreference(next)) return;
    setView(next);
    storeViewPreference(next);
  };

  return (
    <SettingsSection id="settings-preferences" title="Preferences">
      <Preference title="Theme" hint="System follows your device's light or dark setting.">
        <PillGroup
          pills={THEME_PILLS}
          value={choice}
          onChange={(v) => isThemeChoice(v) && setChoice(v)}
          label="Theme"
        />
      </Preference>
      <Preference title="Quotes view" hint="Automatic shows the table on phones and cards on wider screens.">
        <PillGroup pills={VIEW_CHOICES} value={view} onChange={changeView} label="Quotes view" />
      </Preference>
    </SettingsSection>
  );
}

/**
 * `/settings`. Keycloak owns the account: each section describes what it does and
 * has a button that opens Keycloak's page for it, then comes back here with the
 * session's name and email refreshed. Preferences are this browser's display settings.
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
        <PreferencesSection />
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
