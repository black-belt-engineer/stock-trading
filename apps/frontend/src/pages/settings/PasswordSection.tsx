import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { updateAccount } from "../../api/account";
import { useAuth } from "../../auth/AuthProvider";
import type { AuthUser } from "../../auth/session";
import { SaveButton, SectionMessage, SettingsField, SettingsSection, UNAVAILABLE_MESSAGE, type SectionMessageValue } from "./fields";
import { checkConfirmation, checkCurrentPassword, checkNewPassword, PASSWORD_MIN } from "./validation";

type Errors = { current: string | null; next: string | null; confirm: string | null };
const NO_ERRORS: Errors = { current: null, next: null, confirm: null };

/**
 * Password change (A4 step 2). The server ends every session of the account with
 * it (phase 09); a login with the new password then starts a new one for this
 * browser, and the other tabs follow that login.
 */
export function PasswordSection({ user }: { user: AuthUser }): JSX.Element {
  const { logIn } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [message, setMessage] = useState<SectionMessageValue>(null);
  const [busy, setBusy] = useState(false);

  const edit = (field: keyof Errors, set: (value: string) => void) => (value: string) => {
    set(value);
    setMessage(null);
    if (errors[field] !== null) setErrors({ ...errors, [field]: null });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const found: Errors = {
      current: checkCurrentPassword(current),
      next: checkNewPassword(next),
      confirm: checkConfirmation(next, confirm),
    };
    setErrors(found);
    setMessage(null);
    if (found.current || found.next || found.confirm) return;
    setBusy(true);
    void save().finally(() => setBusy(false));
  };

  const save = async (): Promise<void> => {
    const result = await updateAccount(user.id, { password: next, currentPassword: current });
    if (result.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      const login = await logIn(result.user.email, next);
      setMessage(
        login.ok
          ? { tone: "success", text: "Password changed. Other devices have been logged out." }
          : { tone: "error", text: `Your password was changed, but logging in again failed: ${login.message}. Log in with your new password.` },
      );
      return;
    }
    const { error } = result;
    if (error.kind === "wrong-password") setErrors({ ...NO_ERRORS, current: "The current password is incorrect" });
    else if (error.kind === "invalid") setMessage({ tone: "error", text: error.message });
    else setMessage({ tone: "error", text: UNAVAILABLE_MESSAGE });
  };

  return (
    <SettingsSection id="settings-password" title="Password">
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        {/* Tells password managers which account the new password belongs to. */}
        <input type="text" name="username" autoComplete="username" value={user.email} readOnly hidden />
        <SettingsField
          id="password-current"
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={edit("current", setCurrent)}
          error={errors.current}
        />
        <SettingsField
          id="password-new"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={edit("next", setNext)}
          error={errors.next}
          hint={`At least ${PASSWORD_MIN} characters. Changing it logs you out on every other device.`}
        />
        <SettingsField
          id="password-confirm"
          label="Repeat new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={edit("confirm", setConfirm)}
          error={errors.confirm}
        />
        <SectionMessage message={message} />
        <SaveButton busy={busy} disabled={current === "" && next === "" && confirm === ""} label="Change password" busyLabel="Changing…" />
      </form>
    </SettingsSection>
  );
}
