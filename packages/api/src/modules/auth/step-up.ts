import type { FastifyReply, FastifyRequest } from "fastify"
import { authService } from "./service"

export async function requireStepUp(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers["x-step-up-token"]
  const token = Array.isArray(header) ? header[0] : header
  if (!token) return reply.code(403).send({ error: "step-up requis", code: "STEP_UP_REQUIRED" })
  try {
    await authService.verifyStepUpToken(token)
  } catch {
    return reply.code(403).send({ error: "step-up invalide ou expiré", code: "STEP_UP_REQUIRED" })
  }
}
