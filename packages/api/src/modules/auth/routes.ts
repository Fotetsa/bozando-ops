import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import { authService } from "./service"
import { prisma } from "../../lib/prisma"
import { requireRole, currentUser } from "./rbac"
import { eventBus } from "../../lib/event-bus"

/**
 * Routes d'auth + hook de protection des routes /api/*.
 *
 * Sécurité (cf. plan) : tout /api/* exige un JWT valide, SAUF les routes d'auth
 * (login, mfa/verify) et la création du 1er owner (bootstrap). MFA imposée.
 */

const PUBLIC_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/mfa/verify",
  "/api/auth/bootstrap",
  // Indique seulement si un 1er compte doit être créé (aucune info sensible) :
  // l'écran de login doit pouvoir le savoir AVANT d'être authentifié.
  "/api/auth/needs-bootstrap",
])

export function registerAuthGuard(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return
    if (PUBLIC_PATHS.has(req.url.split("?")[0] ?? "")) return
    const header = req.headers.authorization
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined
    if (!token) return reply.code(401).send({ error: "non authentifié" })
    try {
      const decoded = authService.verifyToken(token)
      ;(req as FastifyRequest & { user?: unknown }).user = decoded
    } catch {
      return reply.code(401).send({ error: "token invalide" })
    }
  })
}

export async function registerAuthRoutes(app: FastifyInstance) {
  // Bootstrap : crée le compte owner si aucun n'existe.
  const credBody = z.object({ email: z.string().email(), password: z.string().min(8) })
  app.post("/api/auth/bootstrap", async (req, reply) => {
    const parsed = credBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })
    try {
      const user = await authService.createOwner(parsed.data.email, parsed.data.password)
      return { ok: true, id: user.id }
    } catch (err) {
      return reply.code(409).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // Onboarding : l'écran de login interroge ceci pour basculer en mode "créer le
  // 1er compte" quand l'installation est neuve.
  app.get("/api/auth/needs-bootstrap", async () => {
    return { needsBootstrap: (await authService.countUsers()) === 0 }
  })

  app.post("/api/auth/login", async (req, reply) => {
    const parsed = credBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })
    try {
      return await authService.login(parsed.data.email, parsed.data.password)
    } catch (err) {
      return reply.code(401).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.post("/api/auth/mfa/verify", async (req, reply) => {
    const body = z.object({ pendingToken: z.string(), code: z.string() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    try {
      return await authService.verifyMfa(body.data.pendingToken, body.data.code)
    } catch (err) {
      return reply.code(401).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // Enrôlement MFA (authentifié).
  app.post("/api/auth/mfa/enroll", async (req) => {
    const user = (req as FastifyRequest & { user: { sub: string } }).user
    return authService.startMfaEnrollment(user.sub)
  })

  app.post("/api/auth/mfa/confirm", async (req, reply) => {
    const user = (req as FastifyRequest & { user: { sub: string } }).user
    const body = z.object({ code: z.string() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() })
    try {
      return await authService.confirmMfaEnrollment(user.sub, body.data.code)
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.get("/api/auth/me", async (req) => {
    const user = (req as FastifyRequest & { user: { sub: string } }).user
    const u = await prisma.user.findUnique({ where: { id: user.sub } })
    return { id: u?.id, email: u?.email, role: u?.role, mfaEnabled: u?.mfaEnabled }
  })

  // Changement de mot de passe (authentifié) : exige le mot de passe actuel.
  const changePwBody = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "8 caractères minimum"),
  })
  app.post("/api/auth/password", async (req, reply) => {
    const user = (req as FastifyRequest & { user: { sub: string } }).user
    const parsed = changePwBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "invalide" })
    }
    try {
      return await authService.changePassword(
        user.sub,
        parsed.data.currentPassword,
        parsed.data.newPassword
      )
    } catch (err) {
      // Mot de passe actuel incorrect = erreur attendue → 400 message clair.
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // ── Gestion des utilisateurs (owner uniquement) ──
  // Permet de DÉLÉGUER l'usage de la console à un employé (operator/viewer) — c'est
  // la raison d'être de l'outil. Toutes ces opérations sont auditées.
  const owner = { preHandler: requireRole("owner") }

  app.get("/api/users", owner, async () => authService.listUsers())

  const createUserBody = z.object({
    email: z.string().email(),
    password: z.string().min(8, "8 caractères minimum"),
    role: z.enum(["operator", "viewer"]),
  })
  app.post("/api/users", owner, async (req, reply) => {
    const parsed = createUserBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })
    try {
      const u = await authService.createUser(parsed.data.email, parsed.data.password, parsed.data.role)
      await eventBus.emit("user.created", {
        userId: currentUser(req)?.sub,
        targetUserId: u.id,
        email: u.email,
        role: u.role,
      })
      return u
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  const setRoleBody = z.object({ role: z.enum(["owner", "operator", "viewer"]) })
  app.post("/api/users/:id/role", owner, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = setRoleBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })
    try {
      const u = await authService.setRole(id, parsed.data.role)
      await eventBus.emit("user.role.changed", {
        userId: currentUser(req)?.sub,
        targetUserId: id,
        role: u.role,
      })
      return u
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.delete("/api/users/:id", owner, async (req, reply) => {
    const { id } = req.params as { id: string }
    const acting = currentUser(req)?.sub
    if (!acting) return reply.code(401).send({ error: "non authentifié" })
    try {
      const r = await authService.deleteUser(id, acting)
      await eventBus.emit("user.deleted", { userId: acting, targetUserId: id })
      return r
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // ── Journal d'audit (operator+) ──
  // La table AuditLog est écrite par le subscriber on-deploy-finished ; ici on la
  // rend LISIBLE. Indispensable pour tracer "qui a déployé/détruit/créé quoi" quand
  // on délègue à un employé. Pagination simple par offset.
  app.get("/api/audit", { preHandler: requireRole("operator") }, async (req) => {
    const q = req.query as { limit?: string; offset?: string; action?: string }
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
    const offset = Math.max(Number(q.offset) || 0, 0)
    const where = q.action ? { action: q.action } : {}
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: { user: { select: { email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ])
    return {
      total,
      limit,
      offset,
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        userEmail: r.user?.email ?? null,
        projectId: r.projectId,
        serverId: r.serverId,
        nodeId: r.nodeId,
        ip: r.ip,
        payload: r.payload,
        createdAt: r.createdAt,
      })),
    }
  })
}
