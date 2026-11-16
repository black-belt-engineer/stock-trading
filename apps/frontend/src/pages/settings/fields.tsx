import type { JSX, ReactNode } from "react";
import { buttonClass, inputClass } from "../../components/pageStyles";

/** A section of the settings page: a card with its heading. */
export function SettingsSection(props: { id: string; title: string; children: ReactNode; tone?: "danger" }): JSX.Element {
  const border = props.tone === "danger" ? "border-negative/40" : "border-default";
  return (
    <section aria-labelledby={props.id} className={`grid gap-4 rounded-[10px] border ${border} bg-surface p-5`}>
      <h2 id={props.id} className="text-[15px] font-semibold text-primary">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

/**
 * A labelled, controlled text field. Its error is shown under it, read with it
 * (`aria-describedby`) and marks it invalid; the hint stays read as well.
 */
export function SettingsField(props: {
  id: string;
  label: string;
  type: "email" | "password" | "text";
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  hint?: string;
}): JSX.Element {
  const { id, label, type, autoComplete, value, onChange, error, hint } = props;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter((part) => part !== null).join(" ");
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] text-primary">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        className={`${inputClass} ${error ? "border-negative!" : ""}`}
      />
      {error && (
        <p id={errorId} className="text-[12px] text-negative">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-[12px] text-secondary">
          {hint}
        </p>
      )}
    </div>
  );
}

/** The section's submit button: brand-coloured like the login page's, at its content's width. */
export function SaveButton(props: { busy: boolean; disabled: boolean; label: string; busyLabel: string }): JSX.Element {
  return (
    <button
      type="submit"
      disabled={props.busy || props.disabled}
      className={`${buttonClass} h-10 justify-self-start border-brand! bg-brand-dim! text-brand!`}
    >
      {props.busy ? props.busyLabel : props.label}
    </button>
  );
}

/**
 * The section's outcome: an error is an alert, a success a polite status. Both
 * stay in the DOM while empty, so screen readers announce a later message.
 */
export function SectionMessage({ message }: { message: { tone: "error" | "success"; text: string } | null }): JSX.Element {
  return (
    <>
      <p role="alert" className="text-[13px] text-negative empty:hidden">
        {message?.tone === "error" ? message.text : null}
      </p>
      <p role="status" className="text-[13px] text-positive empty:hidden">
        {message?.tone === "success" ? message.text : null}
      </p>
    </>
  );
}

export type SectionMessageValue = { tone: "error" | "success"; text: string } | null;

export const UNAVAILABLE_MESSAGE = "Service unavailable, try again";
