import { prisma } from "../lib/prisma"
import { projectsService } from "../modules/projects/service"
import { reconcilerService } from "../modules/reconciler/service"
import { eventBus } from "../lib/event-bus"

/**
 * Job de détection de drift (LECTURE SEULE, V1 : signale, ne corrige PAS).
 *
 * Pour chaque projet déployé, calcule le plan (désiré vs réel). Si des actions
 * create/recreate/remove existent, c'est qu'il y a un écart → émet un event
 * "drift.detected" (relayé au canvas). Le self-healing auto = V2 opt-in.
 *
 * Lancé périodiquement via setInterval depuis le serveur (intervalle configurable).
 */
export async function runDriftCheck(): Promise<void> {
  const projects = await prisma.project.findMany({ where: { status: "deployed" } })
  for (const p of projects) {
    const graph = await projectsService.getProjectGraph(p.id)
    if (!graph) continue
    try {
      const plan = await reconcilerService.plan(graph)
      const drift = plan.actions.filter((a) => a.kind !== "noop")
      if (drift.length > 0) {
        await eventBus.emit("drift.detected", {
          projectId: p.id,
          count: drift.length,
          actions: drift.map((a) => a.kind),
        })
      }
    } catch {
      // un projet en erreur ne bloque pas les autres
    }
  }
}

const DRIFT_INTERVAL_MS = Number(process.env.DRIFT_INTERVAL_MS || 60_000)

/** Démarre la boucle périodique de détection de drift. */
export function startDriftJob(): NodeJS.Timeout {
  return setInterval(() => {
    void runDriftCheck()
  }, DRIFT_INTERVAL_MS)
}
