import crypto from "crypto";

const ALGO = "aes-256-gcm"; // modern AES encryption
const ENC_KEY = crypto.scryptSync(process.env.ENCRYPTION_SECRET || "fallbackSecret", "salt", 32);
const IV_LENGTH = 16; // random initialization vector

export function encrypt(text: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, ENC_KEY, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  return {
    content: encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex")
  };
}

export function decrypt(hash: { content: string; iv: string; tag: string }) {
  const decipher = crypto.createDecipheriv(ALGO, ENC_KEY, Buffer.from(hash.iv, "hex"));
  decipher.setAuthTag(Buffer.from(hash.tag, "hex"));

  let decrypted = decipher.update(hash.content, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
