import pino from "pino";
import type { Logger } from "pino";

export type CreateLoggerOptions = {
  level?: string;
  environment?: string;
};

export function createLogger(name: string, options: CreateLoggerOptions = {}): Logger {
  return pino({
    name,
    level: options.level ?? "info",
    ...(options.environment ? { base: { env: options.environment } } : {}),
  });
}

export type { Logger };
