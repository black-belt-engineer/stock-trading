import type { JSX } from "react";
import { Link } from "react-router";

export function NotFoundPage(): JSX.Element {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="font-mono text-[36px] font-semibold">404</h1>
      <p className="text-secondary">This page does not exist.</p>
      <Link
        to="/"
        className={
          "rounded-md border border-default bg-elevated px-3.5 py-1.5 text-primary transition-colors duration-150 hover:border-strong " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        }
      >
        Back to quotes
      </Link>
    </section>
  );
}
