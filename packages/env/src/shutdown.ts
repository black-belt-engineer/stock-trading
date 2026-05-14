export type RegisterShutdownHandlersOptions = {
  /** Defaults to `SIGTERM` and `SIGINT`. */
  signals?: readonly NodeJS.Signals[];
  /**
   * Called at most once (first signal wins). Should perform teardown; may return a Promise.
   * Uncaught rejections are written to stderr and the process exits with code 1.
   */
  onShutdown: (signal: NodeJS.Signals) => void | Promise<void>;
};

/**
 * Registers process signal listeners that run `onShutdown` once, then rely on the handler
 * to exit the process when ready (e.g. `process.exit(0)` after cleanup).
 */
export function registerShutdownHandlers(options: RegisterShutdownHandlersOptions): void {
  const signals = options.signals ?? (["SIGTERM", "SIGINT"] as const);
  let handled = false;
  for (const sig of signals) {
    process.on(sig, () => {
      if (handled) {
        return;
      }
      handled = true;
      Promise.resolve(options.onShutdown(sig)).catch((err: unknown) => {
        console.error("Shutdown handler failed", err);
        process.exit(1);
      });
    });
  }
}
