export const SENSITIVE_ENV_KEY_PATTERN =
  /(SECRET|TOKEN|PASSWORD|PASS|KEY|PRIVATE|DATABASE_URL|DSN|CREDENTIAL)/i

export function sensitiveEnvKeys(env: Record<string, unknown> | undefined): string[] {
  if (!env) return []
  return Object.keys(env).filter((key) => SENSITIVE_ENV_KEY_PATTERN.test(key))
}
