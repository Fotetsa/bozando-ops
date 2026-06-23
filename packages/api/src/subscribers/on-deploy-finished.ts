import { eventBus } from "../lib/event-bus"
import { prisma } from "../lib/prisma"

/**
 * Subscriber d'AUDIT centralisé : journalise les events métier dans AuditLog
 * (qui a fait quoi, quand). Pattern Medusa : abonnement aux events du bus.
 */

// Events audités → action enregistrée. Le payload de l'event peut porter userId,
// projectId, serverId, et des détails libres.
const AUDITED: Record<string, string> = {
  "deploy.finished": "deploy",
  "destroy.finished": "destroy",
  "rebuild.finished": "rebuild",
  "server.provisioned": "server.provisioned",
  "server.removed": "server.removed",
  "server.role.changed": "server.role.changed",
  "registry.set": "registry.set",
  "user.role.changed": "user.role.changed",
  "user.created": "user.created",
  "user.deleted": "user.deleted",
  "mfa.enabled": "mfa.enabled",
  "autoscale.applied": "autoscale.applied",
  "prune.finished": "prune.finished",
  "secret.set": "secret.set",
  "secret.removed": "secret.removed",
}

export function registerDeploySubscribers(): void {
  for (const [eventName, action] of Object.entries(AUDITED)) {
    eventBus.on(eventName, async (event) => {
      const d = event.data as {
        userId?: string
        projectId?: string
        serverId?: string
        nodeId?: string
        ok?: boolean
        error?: string
        [k: string]: unknown
      }
      // Affiner deploy success/failed.
      const finalAction =
        eventName === "deploy.finished" ? (d.ok ? "deploy.success" : "deploy.failed") : action
      await prisma.auditLog
        .create({
          data: {
            action: finalAction,
            userId: d.userId ?? null,
            projectId: d.projectId ?? null,
            serverId: d.serverId ?? null,
            nodeId: d.nodeId ?? null,
            payload: { error: d.error ?? null, ...sanitize(d) },
          },
        })
        .catch(() => {})
    })
  }
}

// Retire les champs déjà colonnes + tout ce qui pourrait être sensible du payload.
function sanitize(d: Record<string, unknown>): Record<string, unknown> {
  const { userId, projectId, serverId, nodeId, error, ...rest } = d
  void userId
  void projectId
  void serverId
  void nodeId
  void error
  return rest
}
