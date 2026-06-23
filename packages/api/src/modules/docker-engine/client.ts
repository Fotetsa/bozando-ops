import Docker from "dockerode"

/**
 * Connexion à l'API Docker Engine.
 *
 * SÉCURITÉ (cf. plan, risque n°1) : le socket Docker donne un contrôle root
 * effectif sur le VPS. En PROD on ne monte PAS le socket dans l'api : on passe
 * par un docker-socket-proxy (Tecnativa) qui filtre l'API Docker (autorise
 * SERVICES/NETWORKS/VOLUMES/TASKS/NODES/EVENTS/IMAGES, bloque EXEC + écritures
 * conteneur). On configure alors DOCKER_HOST=tcp://socket-proxy:2375.
 *
 * Deux modes :
 *  - DOCKER_HOST=tcp://host:port  → connexion TCP au proxy (PROD recommandé).
 *  - sinon                        → socket Unix local (DEV, ou si proxy absent).
 */

const DOCKER_SOCKET_PATH =
  process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock"
const DOCKER_HOST = process.env.DOCKER_HOST

let singleton: Docker | null = null

/** Parse DOCKER_HOST (tcp://host:port) en options dockerode {host, port}. */
function parseDockerHost(value: string): { host: string; port: number } | null {
  try {
    const url = new URL(value)
    if (url.protocol !== "tcp:" && url.protocol !== "http:") return null
    return { host: url.hostname, port: Number(url.port || 2375) }
  } catch {
    return null
  }
}

export function getDocker(): Docker {
  if (!singleton) {
    const tcp = DOCKER_HOST ? parseDockerHost(DOCKER_HOST) : null
    singleton = tcp ? new Docker(tcp) : new Docker({ socketPath: DOCKER_SOCKET_PATH })
  }
  return singleton
}

export interface DockerPingResult {
  ok: boolean
  version?: string
  apiVersion?: string
  containers?: number
  /** Mode Swarm actif sur le démon (prérequis aux services). */
  swarmActive?: boolean
  error?: string
}

/**
 * Vérifie l'accès au daemon Docker. Utilisé au démarrage de l'api et exposé via
 * une route de santé. Ne lève jamais : renvoie un résultat structuré.
 */
export async function pingDocker(): Promise<DockerPingResult> {
  const docker = getDocker()
  try {
    const info = await docker.version()
    const system = (await docker.info()) as {
      Containers?: number
      Swarm?: { LocalNodeState?: string }
    }
    return {
      ok: true,
      version: info.Version,
      apiVersion: info.ApiVersion,
      containers: system.Containers,
      swarmActive: system.Swarm?.LocalNodeState === "active",
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
