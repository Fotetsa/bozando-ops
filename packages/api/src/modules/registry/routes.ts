import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { registryService } from "./service"
import { requireRole, currentUser } from "../auth/rbac"
import { eventBus } from "../../lib/event-bus"

// Gestion des credentials registre = OWNER uniquement (secret sensible).
const owner = { preHandler: requireRole("owner") }

export async function registerRegistryRoutes(app: FastifyInstance) {
  app.get("/api/registry", owner, async () => registryService.list())

  const setBody = z.object({
    registry: z.string().default("ghcr.io"),
    username: z.string().min(1),
    token: z.string().min(1),
  })
  app.post("/api/registry", owner, async (req, reply) => {
    const parsed = setBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })
    const cred = await registryService.set(
      parsed.data.registry,
      parsed.data.username,
      parsed.data.token
    )
    await eventBus.emit("registry.set", {
      userId: currentUser(req)?.sub,
      registry: parsed.data.registry,
    })
    return { id: cred.id, registry: cred.registry, username: cred.username }
  })

  app.delete("/api/registry/:id", owner, async (req) => {
    const { id } = req.params as { id: string }
    await registryService.remove(id)
    return { ok: true }
  })
}
