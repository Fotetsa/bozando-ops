const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

function isProd(): boolean {
  return process.env.NODE_ENV === "production"
}

function bytesFromSecret(value: string | undefined): number {
  if (!value) return 0
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) return value.length / 2
  return Buffer.byteLength(value, "utf8")
}

function validateOrigins(value: string): string[] {
  const origins = value.split(",").map((v) => v.trim()).filter(Boolean)
  if (origins.length === 0) throw new Error("WEB_ORIGIN doit contenir au moins une origine")
  if (origins.includes("*")) throw new Error("WEB_ORIGIN=* est interdit")
  for (const origin of origins) {
    const url = new URL(origin)
    if (isProd() && url.protocol !== "https:" && !LOCAL_HOSTS.has(url.hostname)) {
      throw new Error(`WEB_ORIGIN doit être HTTPS en production: ${origin}`)
    }
  }
  return origins
}

function ttl(value: string | undefined, fallback: string): string {
  const v = value || fallback
  if (!/^\d+[smhd]$/.test(v)) throw new Error(`TTL invalide: ${v}`)
  return v
}

export const securityConfig = {
  isProd: isProd(),
  sessionTtl: ttl(process.env.SESSION_TTL, "2h"),
  stepUpTtl: ttl(process.env.STEP_UP_TTL, "5m"),
  webOrigins: validateOrigins(process.env.WEB_ORIGIN || "http://localhost:5273"),
  allowLatest: process.env.ALLOW_LATEST === "true",
}

export function validateSecurityConfig(): void {
  if (bytesFromSecret(process.env.JWT_SECRET) < 32) {
    throw new Error("JWT_SECRET doit faire au moins 32 octets aléatoires")
  }
  const mfaKey = process.env.MFA_ENCRYPTION_KEY
  if (securityConfig.isProd && !/^[0-9a-fA-F]{64}$/.test(mfaKey || "")) {
    throw new Error("MFA_ENCRYPTION_KEY doit être hexadécimal 64 caractères en production")
  }
  if (securityConfig.isProd && process.env.IMAGE_TAG === "latest" && !securityConfig.allowLatest) {
    throw new Error("IMAGE_TAG=latest interdit en production sans ALLOW_LATEST=true")
  }
  if (process.env.CADDY_ADMIN_URL) new URL(process.env.CADDY_ADMIN_URL)
  if (process.env.DOCKER_HOST && !/^tcp:\/\/|^http:\/\//.test(process.env.DOCKER_HOST)) {
    throw new Error("DOCKER_HOST doit être tcp://host:port ou http://host:port")
  }
}
