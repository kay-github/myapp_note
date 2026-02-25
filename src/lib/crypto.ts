import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TEXT_PREFIX = "enc:v1:";
const BYTES_PREFIX = Buffer.from("ENC1");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function resolveSecret(): string {
  return process.env.DATA_ENCRYPTION_KEY || process.env.SESSION_SECRET || "dev-only-encryption-secret";
}

function encryptRaw(data: Buffer): Buffer {
  const key = keyFromSecret(resolveSecret());
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decryptRaw(data: Buffer): Buffer {
  const key = keyFromSecret(resolveSecret());
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const payload = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

export function encryptText(text: string): string {
  const payload = encryptRaw(Buffer.from(text, "utf8")).toString("base64");
  return `${TEXT_PREFIX}${payload}`;
}

export function decryptText(text: string): string {
  if (!text.startsWith(TEXT_PREFIX)) {
    return text;
  }
  const base64 = text.slice(TEXT_PREFIX.length);
  if (!base64) {
    return "";
  }

  try {
    const decrypted = decryptRaw(Buffer.from(base64, "base64"));
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

export function encryptBytes(data: Uint8Array): Buffer {
  const payload = encryptRaw(Buffer.from(data));
  return Buffer.concat([BYTES_PREFIX, payload]);
}

export function decryptBytes(data: Uint8Array): Buffer {
  const raw = Buffer.from(data);
  const hasPrefix = raw.subarray(0, BYTES_PREFIX.length).equals(BYTES_PREFIX);
  if (!hasPrefix) {
    return raw;
  }

  try {
    return decryptRaw(raw.subarray(BYTES_PREFIX.length));
  } catch {
    return Buffer.alloc(0);
  }
}
