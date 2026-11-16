import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { updateAccount, type AccountChanges } from "../../api/account";
import { useAuth } from "../../auth/AuthProvider";
import type { AuthUser } from "../../auth/session";
import { SaveButton, SectionMessage, SettingsField, SettingsSection, UNAVAILABLE_MESSAGE, type SectionMessageValue } from "./fields";
import { checkCurrentPassword, checkEmail, checkName } from "./validation";

type Errors = { name: string | null; email: string | null; currentPassword: string | null };
const NO_ERRORS: Errors = { name: null, email: null, currentPassword: null };

/**
 * Name and email (A4 step 2). A name change alone keeps the session and shows the
 * new name in every tab. An email change needs the current password, ends every
 * session of the account (phase 09), and is followed by a login with the new email
 * so this browser stays signed in; the login reaches the other tabs too.
 */
export function ProfileSection({ user }: { user: AuthUser }): JSX.Element {
  const { logIn, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [message, setMessage] = useState<SectionMessageValue>(null);
  const [busy, setBusy] = useState(false);

  // When the account changes underneath (another tab, or this form's own save), a
  // field the user has not edited follows it; an edited one is kept.
  const [shown, setShown] = useState(user);
  if (shown !== user) {
    if (name === shown.name) setName(user.name);
    if (email === shown.email) setEmail(user.email);
    setShown(user);
  }

  const nextName = name.trim();
  const nextEmail = email.trim();
  const nameChanged = nextName !== user.name;
  const emailChanged = nextEmail !== user.email;

  const edit = (field: keyof Errors, set: (value: string) => void) => (value: string) => {
    set(value);
    setMessage(null);
    if (errors[field] !== null) setErrors({ ...errors, [field]: null });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy || (!nameChanged && !emailChanged)) return;
    const found: Errors = {
      name: nameChanged ? checkName(name) : null,
      email: emailChanged ? checkEmail(email) : null,
      currentPassword: emailChanged ? checkCurrentPassword(currentPassword) : null,
    };
    setErrors(found);
    setMessage(null);
    if (found.name || found.email || found.currentPassword) return;

    const changes: AccountChanges = {};
    if (nameChanged) changes.name = nextName;
    if (emailChanged) {
      changes.email = nextEmail;
      changes.currentPassword = currentPassword;
    }
    setBusy(true);
    void save(changes).finally(() => setBusy(false));
  };

  const save = async (changes: AccountChanges): Promise<void> => {
    const result = await updateAccount(user.id, changes);
    if (result.ok) {
      setCurrentPassword("");
      if (changes.email === undefined) {
        updateUser(result.user);
        setMessage({ tone: "success", text: "Profile saved" });
        return;
      }
      // Every session ended with the change; this login starts a new one for this browser.
      const login = await logIn(result.user.email, currentPassword);
      setMessage(
        login.ok
          ? { tone: "success", text: "Profile saved. Other devices have been logged out." }
          : { tone: "error", text: `Your email was changed, but logging in again failed: ${login.message}. Log in with your new email.` },
      );
      return;
    }

    const { error } = result;
    if (error.kind === "wrong-password") {
      setErrors({ ...NO_ERRORS, currentPassword: "The current password is incorrect" });
    } else if (error.kind === "email-taken") {
      setErrors({ ...NO_ERRORS, email: error.message });
      // The server checks for a taken email before it ends any session, but a race with
      // another registration can still give a 409 after the revoke. Logging in again with
      // the unchanged email keeps this browser signed in either way.
      await logIn(user.email, currentPassword);
    } else if (error.kind === "invalid") {
      setMessage({ tone: "error", text: error.message });
    } else {
      setMessage({ tone: "error", text: UNAVAILABLE_MESSAGE });
    }
  };

  return (
    <SettingsSection id="settings-profile" title="Profile">
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <SettingsField id="profile-name" label="Name" type="text" autoComplete="name" value={name} onChange={edit("name", setName)} error={errors.name} />
        <SettingsField
          id="profile-email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={edit("email", setEmail)}
          error={errors.email}
          hint={emailChanged ? "Changing your email logs you out on every other device." : undefined}
        />
        {emailChanged && (
          <SettingsField
            id="profile-current-password"
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={edit("currentPassword", setCurrentPassword)}
            error={errors.currentPassword}
            hint="Needed to change your email."
          />
        )}
        <SectionMessage message={message} />
        <SaveButton busy={busy} disabled={!nameChanged && !emailChanged} label="Save profile" busyLabel="Saving…" />
      </form>
    </SettingsSection>
  );
}
