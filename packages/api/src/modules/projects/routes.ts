import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { NodeType, EdgeKind } from "@bozando-ops/shared"
import { projectsService } from "./service"
import { requireRole } from "../auth/rbac"

// Routes mutantes = operator minimum ; les GET restent ouverts (viewer inclus).
const operator = { preHandler: requireRole("operator") }

/**
 * Routes REST du module projects (CRUD du désiré). Validation des payloads via Zod.
 * Le déploiement (deploy-project) sera une route séparée du module reconciler.
 */
export async function registerProjectRoutes(app: FastifyInstance) {
  // ── Projects ──
  app.get("/api/projects", async () => projectsService.listProjects())

  app.get("/api/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string }
    const graph = await projectsService.getProjectGraph(id)
    if (!graph) return reply.code(404).send({ error: "project not found" })
    return graph
  })

  const createProjectBody = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  })
  app.post("/api/projects", operator, async (req, reply) => {
    const parsed = createProjectBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })
    return projectsService.createProject(parsed.data)
  })

  const updateProjectBody = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  app.patch("/api/projects/:id", operator, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateProjectBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "invalide" })
    }
    try {
      return await projectsService.updateProject(id, parsed.data)
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.delete("/api/projects/:id", operator, async (req) => {
    const { id } = req.params as { id: string }
    await projectsService.deleteProject(id)
    return { ok: true }
  })

  // ── Nodes ──
  const createNodeBody = z.object({
    type: NodeType,
    name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
    posX: z.number(),
    posY: z.number(),
    config: z.record(z.string(), z.unknown()),
  })
  app.post("/api/projects/:id/nodes", operator, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = createNodeBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })
    try {
      return await projectsService.createNode({ projectId: id, ...parsed.data })
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  const updateNodeBody = z.object({
    name: z.string().optional(),
    posX: z.number().optional(),
    posY: z.number().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  app.post("/api/nodes/:nodeId", operator, async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string }
    const parsed = updateNodeBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })
    try {
      return await projectsService.updateNode(nodeId, parsed.data)
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.delete("/api/nodes/:nodeId", operator, async (req) => {
    const { nodeId } = req.params as { nodeId: string }
    await projectsService.deleteNode(nodeId)
    return { ok: true }
  })

  // ── Edges ──
  const createEdgeBody = z.object({
    sourceNodeId: z.string(),
    targetNodeId: z.string(),
    kind: EdgeKind.optional(),
    config: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  app.post("/api/projects/:id/edges", operator, async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = createEdgeBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })
    try {
      return await projectsService.createEdge({
        projectId: id,
        sourceNodeId: parsed.data.sourceNodeId,
        targetNodeId: parsed.data.targetNodeId,
        kind: parsed.data.kind,
        config: parsed.data.config ?? null,
      })
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  const updateEdgeBody = z.object({
    config: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  app.post("/api/edges/:edgeId", operator, async (req, reply) => {
    const { edgeId } = req.params as { edgeId: string }
    const parsed = updateEdgeBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })
    try {
      return await projectsService.updateEdge(edgeId, parsed.data)
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.delete("/api/edges/:edgeId", operator, async (req) => {
    const { edgeId } = req.params as { edgeId: string }
    await projectsService.deleteEdge(edgeId)
    return { ok: true }
  })
}
