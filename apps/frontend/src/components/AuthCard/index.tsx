import type { JSX, ReactNode } from "react";
import { panelClass } from "../pageStyles";

/**
 * The login and register layout (owner decision): a centred card on the page
 * background with the app name above it, and the note about password reset below.
 */
export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }): JSX.Element {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-base px-4 py-8">
      <div className="font-bold tracking-[0.08em] text-brand">
        STREAMTICK
      </div>
      <section aria-labelledby="auth-title" className={`${panelClass} w-full max-w-sm px-5 py-6 text-left shadow-card`}>
        <h1 id="auth-title" className="mb-5 text-[18px] font-semibold text-primary">
          {title}
        </h1>
        {children}
        <div className="mt-5 text-[13px] text-secondary">{footer}</div>
      </section>
      <p className="max-w-sm text-center text-[13px] text-secondary">
        There is no password reset yet. Keep your password somewhere safe.
      </p>
    </main>
  );
}
