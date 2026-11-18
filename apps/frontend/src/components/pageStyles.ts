/** Classes shared by the data pages (History, Chart). */

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export const buttonClass =
  "inline-flex h-8 cursor-pointer items-center rounded-md border border-default bg-elevated px-3.5 text-primary transition-colors duration-150 " +
  `hover:border-strong disabled:cursor-default disabled:opacity-60 ${focusRing}`;

/** A centred message in place of the page's content: empty, not found, error. */
export const panelClass = "rounded-[10px] border border-default bg-surface px-4 py-8 text-center text-secondary";
