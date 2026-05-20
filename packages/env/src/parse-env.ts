import { type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export function parseEnv<T extends TSchema>(schema: T): Static<T> {
  const converted = Value.Convert(schema, process.env);
  if (!Value.Check(schema, converted)) {
    const errors = [...Value.Errors(schema, converted)];
    const message = errors
      .map((error) => `${error.path}: ${error.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }
  return Value.Decode(schema, converted) as Static<T>;
}
