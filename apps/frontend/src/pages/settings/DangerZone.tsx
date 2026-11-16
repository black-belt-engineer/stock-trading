import { useState } from "react";
import type { FormEvent, JSX } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { deleteAccount } from "../../api/account";
import { useAuth } from "../../auth/AuthProvider";
import type { AuthUser } from "../../auth/session";
import { buttonClass, inputClass } from "../../components/pageStyles";
import { SectionMessage, SettingsSection, UNAVAILABLE_MESSAGE, type SectionMessageValue } from "./fields";

const dangerButton = `${buttonClass} h-10 border-negative! text-negative! hover:bg-negative/10`;

/** Typing the email confirms; case and surrounding spaces do not matter, as for logging in. */
function confirms(typed: string, email: string): boolean {
  return typed.trim().toLowerCase() === email.toLowerCase();
}

/**
 * Account deletion (A4 step 3): a dialog that asks for the email, then
 * `DELETE /users/:id`, then the logout, which clears the cookie and logs out the
 * other tabs. The server has already ended every session by then.
 */
export function DangerZone({ user }: { user: AuthUser }): JSX.Element {
  const { logOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<SectionMessageValue>(null);
  const confirmed = confirms(typed, user.email);

  const onOpenChange = (next: boolean): void => {
    // Not while the request runs: the result needs the dialog to show.
    if (busy) return;
    setOpen(next);
    if (!next) {
      setTyped("");
      setMessage(null);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy || !confirmed) return;
    setBusy(true);
    setMessage(null);
    void remove();
  };

  const remove = async (): Promise<void> => {
    const result = await deleteAccount(user.id);
    if (result.ok) {
      // No reset of `busy`: the logout unmounts this page.
      await logOut();
      return;
    }
    setBusy(false);
    setMessage({ tone: "error", text: result.error.kind === "unavailable" ? UNAVAILABLE_MESSAGE : "The account could not be deleted, try again" });
  };

  return (
    <SettingsSection id="settings-danger" title="Danger zone" tone="danger">
      <p className="text-secondary">
        Deleting your account removes it at once and logs you out on every device. There is no grace period and no export of your data
        first.
      </p>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Trigger className={`${dangerButton} justify-self-start`}>Delete account</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-overlay backdrop-blur-[6px]" />
          <Dialog.Content
            className={
              "fixed top-1/2 left-1/2 grid max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 " +
              "overflow-y-auto rounded-[14px] border border-default bg-surface p-5 shadow-dialog"
            }
          >
            <Dialog.Title className="text-[16px] font-semibold text-primary">Delete your account?</Dialog.Title>
            <Dialog.Description className="text-secondary">
              This cannot be undone. Your account goes at once and every device is logged out.
            </Dialog.Description>
            <form noValidate onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="delete-confirm-email" className="text-[13px] text-primary">
                  Type <span className="font-mono wrap-anywhere">{user.email}</span> to confirm
                </label>
                <input
                  id="delete-confirm-email"
                  name="confirm-email"
                  type="email"
                  autoComplete="off"
                  spellCheck={false}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  className={inputClass}
                />
              </div>
              <SectionMessage message={message} />
              <div className="flex flex-wrap justify-end gap-2.5">
                <Dialog.Close disabled={busy} className={`${buttonClass} h-10`}>
                  Cancel
                </Dialog.Close>
                <button type="submit" disabled={busy || !confirmed} className={dangerButton}>
                  {busy ? "Deleting…" : "Delete account"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </SettingsSection>
  );
}
