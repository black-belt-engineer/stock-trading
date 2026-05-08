import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createLogger, type Logger } from "@stock-platform/logger";

const log: Logger = createLogger("consumer");

export function loadLocalEnv(): void {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
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

export { log };
