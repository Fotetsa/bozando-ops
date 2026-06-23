import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"

/**
 * Chiffrement AES-256-GCM des secrets MFA TOTP (calque backend/.../verification/crypto.ts).
 * Clé = MFA_ENCRYPTION_KEY (hex 64 = 32 octets) ; repli dérivé SHA-256 de JWT_SECRET en dev.
 * RÈGLE PROD : MFA_ENCRYPTION_KEY stable, posée AVANT tout enrôlement (sinon secrets indéchiffrables).
 * Format stocké : iv:tag:ciphertext (hex).
 */
function getKey(): Buffer {
  const hex = process.env.MFA_ENCRYPTION_KEY
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, "hex")
  }
  const fallback = process.env.JWT_SECRET || "dev-insecure-key"
  return createHash("sha256").update(fallback).digest()
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":")
  if (!ivHex || !tagHex || !dataHex) throw new Error("format secret invalide")
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8")
}
