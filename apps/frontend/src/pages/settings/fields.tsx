import type { JSX, ReactNode } from "react";

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
