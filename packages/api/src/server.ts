import Fastify from "fastify"
import cors from "@fastify/cors"
import { pingDocker } from "./modules/docker-engine/client"
import { registerProjectRoutes } from "./modules/projects/routes"
import { registerReconcilerRoutes } from "./modules/reconciler/routes"
import { registerAuthRoutes, registerAuthGuard } from "./modules/auth/routes"
import { registerRegistryRoutes } from "./modules/registry/routes"
import { registerServersRoutes } from "./modules/servers/routes"
import { registerObservabilityRoutes } from "./modules/observability/routes"
import { registerSecretsRoutes } from "./modules/secrets/routes"
import { attachWebSocket } from "./loaders/websocket"
import { startObserver } from "./modules/observer/service"
import { registerObservabilitySubscribers } from "./modules/observability/service"
import { registerDeploySubscribers } from "./subscribers/on-deploy-finished"
import { startDriftJob } from "./jobs/reconcile-drift"
import { startAutoScaler } from "./jobs/auto-scaler"

/**
 * Serveur Fastify long-running de l'ops-panel (1 process : HTTP + socket.io).
 *
 * SÉCURITÉ : bind loopback par défaut ; exposition publique via Caddy uniquement.
 * Auth JWT + MFA imposées sur /api/* (sauf login/bootstrap). docker.sock = root.
 */

const HOST = process.env.API_HOST || "127.0.0.1"
const PORT = Number(process.env.API_PORT || 4000)

async function main() {
  const app = Fastify({
    logger: {
      // Rédaction des champs sensibles dans les logs (Fastify logge req au niveau
      // info). Empêche credentials SSH/registry/secrets de fuiter dans les journaux.
      redact: {
        paths: [
          "req.body.value",
          "req.body.token",
          "req.body.password",
          "req.body.currentPassword",
          "req.body.newPassword",
          "req.body.credential",
          "req.body.privateKey",
          "req.headers.authorization",
          "req.headers.cookie",
        ],
        censor: "[redacted]",
      },
    },
  })

  await app.register(cors, {
    origin: (process.env.WEB_ORIGIN || "http://localhost:5273").split(","),
    credentials: true,
  })

  // Garde d'auth sur /api/* (avant l'enregistrement des routes).
  registerAuthGuard(app)

  // Santé (publiques, hors /api).
  app.get("/health", async () => ({ ok: true, service: "bozando-ops-api" }))
  app.get("/health/docker", async (_req, reply) => {
    const result = await pingDocker()
    return reply.code(result.ok ? 200 : 503).send(result)
  })

  // Routes métier.
  await registerAuthRoutes(app)
  await registerProjectRoutes(app)
  await registerReconcilerRoutes(app)
  await registerRegistryRoutes(app)
  await registerServersRoutes(app)
  await registerObservabilityRoutes(app)
  await registerSecretsRoutes(app)

  await app.listen({ host: HOST, port: PORT })

  // socket.io attaché au serveur HTTP de Fastify (calque chat-websocket.ts).
  attachWebSocket(app.server)

  // Observer Docker (Réel -> canvas live), lecture seule.
  startObserver()

  // Subscribers métier (audit + suivi drift) + jobs périodiques.
  registerDeploySubscribers()
  registerObservabilitySubscribers()
  startDriftJob()
  startAutoScaler()

  const docker = await pingDocker()
  if (!docker.ok) {
    app.log.warn(`[docker] socket inaccessible: ${docker.error}`)
  } else {
    app.log.info(
      `[docker] connecté — v${docker.version} (api ${docker.apiVersion}), ${docker.containers} conteneurs`
    )
    if (!docker.swarmActive) {
      app.log.warn(
        "[swarm] MODE SWARM INACTIF — les déploiements échoueront. " +
          "Lance `docker swarm init` sur ce serveur."
      )
    } else {
      app.log.info("[swarm] mode actif — déploiements en services Swarm")
    }
  }
  app.log.info(`bozando-ops api on http://${HOST}:${PORT} (ws path /ws)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
