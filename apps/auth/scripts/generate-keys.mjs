// Prints a JWT_PRIVATE_KEY line (ES256, PKCS8 PEM with escaped newlines) for .env.local.
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim();
console.log(`JWT_PRIVATE_KEY="${pem.replaceAll("\n", "\\n")}"`);
