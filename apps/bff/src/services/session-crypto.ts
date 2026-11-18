import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * AES-256-GCM for the session value in Redis. The stored text is base64url of
 * `iv | auth tag | ciphertext`. The key of the Redis entry goes in as additional authenticated
 * data, so a value copied to another key does not decrypt.
 */
export class SessionCrypto {
  private readonly key: Buffer;

  constructor(base64urlKey: string) {
    this.key = Buffer.from(base64urlKey, "base64url");
    if (this.key.length !== KEY_BYTES) {
      throw new Error(`SESSION_ENCRYPTION_KEY must be ${KEY_BYTES} bytes, base64url encoded`);
    }
  }

  encrypt(plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
  }

  /** Returns `undefined` for a wrong key, a changed value or a value stored under another key. */
  decrypt(encoded: string, context: string): string | undefined {
    const raw = Buffer.from(encoded, "base64url");
    if (raw.length < IV_BYTES + TAG_BYTES) {
      return undefined;
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, IV_BYTES));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const body = raw.subarray(IV_BYTES + TAG_BYTES);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    } catch {
      return undefined;
    }
  }
}
