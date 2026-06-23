import { runWorkflow, type Step } from "../lib/workflow"
import { SshSession, shellQuote, type SshCredential } from "../lib/ssh"
import { generateToolKeyPair } from "../lib/keys"
import { DockerEngineService } from "../modules/docker-engine/service"
import { registryService } from "../modules/registry/service"
import { serversService } from "../modules/servers/service"
import { eventBus } from "../lib/event-bus"

/**
 * Provisionne un serveur en ONE-SHOT SSH puis le fait rejoindre le Swarm.
 *
 * SÉCURITÉ :
 *  - La `credential` PERSO (clé/password) vit en MÉMOIRE le temps du workflow,
 *    n'est jamais persistée ni loggée, et la session SSH est fermée à la fin.
 *  - L'app génère SA paire de clés (clé-outil), dépose la publique sur le serveur
 *    (maintenance future), garde la privée chiffrée. C'est ce qui est persisté.
 *  - Toute valeur dynamique injectée dans une commande SSH est shellQuote-ée
 *    (anti-injection — rappel : SshSession.exec passe par un shell distant).
 */

export interface ProvisionInput {
  serverId: string
  host: string
  port: number
  user: string
  role: "manager" | "worker"
  credential: SshCredential // PERSO — mémoire seule
}

type ProvShared = {
  session?: SshSession
  hostKeyFp?: string
  toolPublicKey?: string
  toolPrivateKeyEnc?: string
  swarmNodeId?: string
}

const localDocker = new DockerEngineService()

function log(serverId: string, message: string) {
  // Feedback live vers le front (room server:<id>). Jamais de secret ici.
  void eventBus.emit("provision.step", { serverId, message })
}

const connectStep: Step<ProvisionInput> = {
  name: "connect",
  run: async (input, ctx) => {
    const s = ctx.shared as ProvShared
    log(input.serverId, "Connexion SSH…")
    s.session = await SshSession.connect({
      host: input.host,
      port: input.port,
      user: input.user,
      credential: input.credential,
      onHostKey: (fp) => (s.hostKeyFp = fp),
    })
    log(input.serverId, "Connecté.")
  },
  compensate: async (_input, ctx) => {
    ;(ctx.shared as ProvShared).session?.dispose()
  },
}

const installDockerStep: Step<ProvisionInput> = {
  name: "install-docker",
  run: async (input, ctx) => {
    const s = ctx.shared as ProvShared
    log(input.serverId, "Vérification / installation de Docker…")
    const check = await s.session!.exec("command -v docker >/dev/null 2>&1 && echo OK || echo NO")
    if (check.stdout.includes("NO")) {
      log(input.serverId, "Installation de Docker (get.docker.com)…")
      const res = await s.session!.exec("curl -fsSL https://get.docker.com | sh")
      if (res.code !== 0) throw new Error(`install docker: ${res.stderr || res.stdout}`)
    }
    log(input.serverId, "Docker présent.")
  },
}

const swarmJoinStep: Step<ProvisionInput> = {
  name: "swarm-join",
  run: async (input, ctx) => {
    const s = ctx.shared as ProvShared
    // Un Swarm local existe-t-il déjà ? Détermine init (1er manager) vs join.
    const swarmExists = await localDocker.isSwarmActive().catch(() => false)

    if (input.role === "manager" && !swarmExists) {
      // 1er manager : initialise le cluster.
      log(input.serverId, "Initialisation du Swarm (manager)…")
      const res = await s.session!.exec(
        `docker swarm init --advertise-addr ${shellQuote(input.host)} || true`
      )
      if (res.code !== 0 && !res.stderr.includes("already part of a swarm")) {
        throw new Error(`swarm init: ${res.stderr}`)
      }
    } else {
      // Worker, OU manager additionnel (HA quorum) : on JOINT le cluster existant
      // avec le token correspondant au rôle demandé.
      const joinRole = input.role === "manager" ? "manager" : "worker"
      log(input.serverId, `Récupération du token de cluster (${joinRole})…`)
      const { token, managerAddr } = await localDocker.getSwarmJoinInfo(joinRole)
      log(input.serverId, `Jonction au Swarm (${joinRole})…`)
      const res = await s.session!.exec(
        `docker swarm join --token ${shellQuote(token)} ${shellQuote(managerAddr)}`
      )
      if (res.code !== 0 && !res.stderr.includes("already part of a swarm")) {
        throw new Error(`swarm join: ${res.stderr}`)
      }
    }
    log(input.serverId, "Nœud dans le cluster.")
  },
  compensate: async (input, ctx) => {
    // Rollback : faire quitter le nœud pour ne pas laisser de nœud fantôme.
    const s = ctx.shared as ProvShared
    await s.session?.exec("docker swarm leave --force").catch(() => {})
  },
}

const registryLoginStep: Step<ProvisionInput> = {
  name: "registry-login",
  run: async (input, ctx) => {
    const s = ctx.shared as ProvShared
    // Login pour TOUS les registres configurés (Docker Hub, GHCR, custom…).
    const registries = await registryService.listForLogin()
    if (registries.length === 0) {
      log(input.serverId, "Pas de credentials registre — étape ignorée.")
      return
    }
    for (const creds of registries) {
      // docker.io → host de login canonique.
      const target = creds.registry === "docker.io" ? "docker.io" : creds.registry
      log(input.serverId, `Connexion au registre (${creds.registry})…`)
      // token via stdin (--password-stdin) : jamais en argument visible.
      const res = await s.session!.exec(
        `echo ${shellQuote(creds.token)} | docker login ${shellQuote(target)} -u ${shellQuote(creds.username)} --password-stdin`
      )
      if (res.code !== 0) throw new Error(`docker login ${creds.registry}: ${res.stderr}`)
    }
    log(input.serverId, "Registres connectés.")
  },
}

const installToolKeyStep: Step<ProvisionInput> = {
  name: "install-tool-key",
  run: async (input, ctx) => {
    const s = ctx.shared as ProvShared
    log(input.serverId, "Installation de la clé de maintenance…")
    const pair = generateToolKeyPair()
    await s.session!.appendAuthorizedKey(pair.publicKey)
    s.toolPublicKey = pair.publicKey
    s.toolPrivateKeyEnc = pair.privateKeyEnc
  },
}

const persistStep: Step<ProvisionInput> = {
  name: "persist",
  run: async (input, ctx) => {
    const s = ctx.shared as ProvShared
    // Récupère l'ID du nœud Swarm correspondant (par hostname/adresse).
    let swarmNodeId: string | undefined
    try {
      const nodes = await localDocker.listNodes()
      const match = nodes.find(
        (n) =>
          (n as { Status?: { Addr?: string } }).Status?.Addr === input.host ||
          (n as { Description?: { Hostname?: string } }).Description?.Hostname === input.host
      )
      swarmNodeId = (match as { ID?: string } | undefined)?.ID
    } catch {
      // best effort
    }
    await serversService.update(input.serverId, {
      status: "ready",
      role: input.role,
      swarmNodeId: swarmNodeId ?? null,
      privateKeyEnc: s.toolPrivateKeyEnc ?? null,
      publicKey: s.toolPublicKey ?? null,
      hostKeyFp: s.hostKeyFp ?? null,
      lastError: null,
    })
    log(input.serverId, "Serveur enregistré et prêt.")
  },
}

export async function provisionServerWorkflow(input: ProvisionInput): Promise<void> {
  const shared: ProvShared = {}
  try {
    const result = await runWorkflow<ProvisionInput>(
      "provision-server",
      [
        connectStep,
        installDockerStep,
        swarmJoinStep,
        registryLoginStep,
        installToolKeyStep,
        persistStep,
      ],
      input,
      {},
      shared as unknown as Record<string, unknown>
    )
    if (!result.ok) {
      await serversService.update(input.serverId, {
        status: "error",
        lastError: result.error ?? "échec provisioning",
      })
      await eventBus.emit("provision.step", {
        serverId: input.serverId,
        message: `Échec : ${result.error}`,
      })
      throw new Error(result.error || "provisioning échoué")
    }
    await eventBus.emit("server.provisioned", {
      serverId: input.serverId,
      role: input.role,
    })
  } finally {
    // Ferme la session ET garantit qu'aucune trace de la credential perso ne
    // subsiste (elle n'a jamais quitté `input.credential` en mémoire locale).
    ;(shared as ProvShared).session?.dispose()
  }
}
