import type { FastifyReply, FastifyRequest } from "fastify"

type Bucket = { count: number; resetAt: number; blockedUntil?: number }

const buckets = new Map<string, Bucket>()
const WINDOW_MS = 60_000
const BLOCK_MS = 15 * 60_000

function key(req: FastifyRequest): string {
  const body = req.body as { email?: unknown } | undefined
  const email = typeof body?.email === "string" ? body.email.toLowerCase() : "unknown"
  return `${req.ip}:${email}:${req.url.split("?")[0]}`
}

export function rateLimit(max = 5) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const now = Date.now()
    const k = key(req)
    const bucket = buckets.get(k) ?? { count: 0, resetAt: now + WINDOW_MS }
    if (bucket.blockedUntil && bucket.blockedUntil > now) {
      return reply.code(429).send({ error: "trop de tentatives, réessaie plus tard" })
    }
    if (bucket.resetAt <= now) {
      bucket.count = 0
      bucket.resetAt = now + WINDOW_MS
      bucket.blockedUntil = undefined
    }
    bucket.count += 1
    if (bucket.count > max) {
      bucket.blockedUntil = now + BLOCK_MS
      buckets.set(k, bucket)
      return reply.code(429).send({ error: "trop de tentatives, réessaie plus tard" })
    }
    buckets.set(k, bucket)
  }
}
