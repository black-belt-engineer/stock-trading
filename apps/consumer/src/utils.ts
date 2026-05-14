import { loadLocalEnv as applyLocalEnvFiles } from "@stock-platform/env";
import { createLogger, type Logger } from "@stock-platform/logger";

const log: Logger = createLogger("consumer");

export function loadLocalEnv(): void {
  applyLocalEnvFiles({ importMetaUrl: import.meta.url, log });
}

export { log };
