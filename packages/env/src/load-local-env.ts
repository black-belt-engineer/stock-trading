import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Logger } from "@stock-platform/logger";

export type LoadLocalEnvOptions = {
  /** Typically `import.meta.url` from the module that defines env loading (e.g. `utils.ts`). */
  importMetaUrl: string;
  log: Logger;
};

/**
 * Loads the first existing `.env.local` from common monorepo locations (cwd + paths relative to the caller file).
 */
export function loadLocalEnv(options: LoadLocalEnvOptions): void {
  const { importMetaUrl, log } = options;
  const moduleDir = dirname(fileURLToPath(importMetaUrl));
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "../../.env.local"),
    resolve(moduleDir, "../../.env.local"),
    resolve(moduleDir, "../../../.env.local"),
  ];

  for (const path of candidates) {
    const result = dotenv.config({ path, override: false });
    if (!result.error) {
      log.info({ path }, "Loaded environment file");
      return;
    }
  }
}
