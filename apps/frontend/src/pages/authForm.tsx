import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { buttonClass, inputClass } from "../components/pageStyles";
import type { AuthResult } from "../auth/authApi";

/** A labelled field; `hint` is read with the field. */
export function Field(props: {
  id: string;
  label: string;
  type: "email" | "password" | "text";
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
  hint?: string;
}): JSX.Element {
  const { id, label, hint, ...input } = props;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] text-primary">
        {label}
      </label>
      <input id={id} name={id} required aria-describedby={hint ? `${id}-hint` : undefined} className={inputClass} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] text-secondary">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Submits once at a time and shows the server's answer. On success there is
 * nothing to do here: the auth state changes and the route guard navigates away.
 */
export function useAuthForm(submit: (form: FormData) => Promise<AuthResult>): {
  busy: boolean;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    void submit(form).then((result) => {
      setBusy(false);
      if (!result.ok) setError(result.message);
    });
  };
  return { busy, error, onSubmit };
}

export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }): JSX.Element {
  return (
    <button type="submit" disabled={busy} className={`${buttonClass} h-10 w-full justify-center border-brand! bg-brand-dim! text-brand!`}>
      {busy ? busyLabel : label}
    </button>
  );
}

/** Announced when it appears; empty takes no space. */
export function FormError({ message }: { message: string | null }): JSX.Element {
  return (
    <p role="alert" className="text-[13px] text-negative empty:hidden">
      {message}
    </p>
  );
}
