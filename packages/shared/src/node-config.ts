import { z } from "zod"

/**
 * Configuration par type de nœud du canvas.
 *
 * Ces schémas sont LA source de vérité partagée : le front les utilise pour
 * valider les formulaires d'options des nœuds, le back (reconciler) pour
 * traduire en appels dockerode, et rebuildFromDocker pour décoder bozando.spec.
 *
 * Régle de sécurité (cf. plan) : pas de montage de "/" ni de --privileged.
 * Les secrets ne doivent PAS finir en clair dans les labels Docker — l'env
 * reste géré ici mais sera traité à part côté secrets (V2).
 */

// ── Conteneur ────────────────────────────────────────────────────────────────

export const PortMappingSchema = z.object({
  /** Port exposé dans le conteneur. */
  container: z.number().int().min(1).max(65535),
  /** Port publié sur l'hôte (optionnel : sinon non publié, accessible via réseau Docker). */
  host: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
})
export type PortMapping = z.infer<typeof PortMappingSchema>

export const RestartPolicySchema = z.enum([
  "no",
  "on-failure",
  "always",
  "unless-stopped",
])
export type RestartPolicy = z.infer<typeof RestartPolicySchema>

export const ResourcesSchema = z.object({
  /** Limite mémoire en Mo. */
  memMb: z.number().int().positive().optional(),
  /** Limite CPU (ex: 0.5 = un demi-cœur). */
  cpus: z.number().positive().optional(),
})
export type Resources = z.infer<typeof ResourcesSchema>

export const HealthcheckSchema = z.object({
  /** Commande de test (forme exec : ["CMD", "curl", ...]). */
  test: z.array(z.string()).min(1),
  intervalSec: z.number().int().positive().default(30),
  timeoutSec: z.number().int().positive().default(10),
  retries: z.number().int().positive().default(3),
  startPeriodSec: z.number().int().nonnegative().default(0),
})
export type Healthcheck = z.infer<typeof HealthcheckSchema>

/**
 * Politique d'auto-scaling d'un service. L'auto-scaler lit le CPU moyen des tasks
 * et ajuste les replicas dans [min, max] : >= scaleUpCpuPct → +1, <= scaleDownCpuPct → -1.
 */
export const AutoscaleSchema = z
  .object({
    enabled: z.boolean().default(false),
    minReplicas: z.number().int().min(1).default(1),
    maxReplicas: z.number().int().min(1).default(3),
    /** Seuil CPU moyen (%) au-dessus duquel on scale up. */
    scaleUpCpuPct: z.number().min(1).max(100).default(75),
    /** Seuil CPU moyen (%) en-dessous duquel on scale down. */
    scaleDownCpuPct: z.number().min(0).max(100).default(25),
  })
  .refine((a) => a.maxReplicas >= a.minReplicas, {
    message: "maxReplicas doit être >= minReplicas",
  })
  .refine((a) => a.scaleUpCpuPct > a.scaleDownCpuPct, {
    message: "scaleUpCpuPct doit être > scaleDownCpuPct",
  })
export type Autoscale = z.infer<typeof AutoscaleSchema>

/**
 * Référence à un Docker Secret monté dans le conteneur. La valeur n'est jamais
 * stockée dans la config (donc jamais dans le label bozando.spec) : seulement le
 * nom du secret et le chemin de montage (défaut /run/secrets/<secretName>).
 */
export const SecretRefSchema = z.object({
  /** Nom du Docker Secret (référence). */
  secretName: z.string().min(1),
  /** Chemin de montage dans le conteneur. Défaut : /run/secrets/<secretName>. */
  target: z.string().optional(),
})
export type SecretRef = z.infer<typeof SecretRefSchema>

/**
 * Politique de récupération d'image, calquée sur Kubernetes `imagePullPolicy` :
 *  - Always       : tire toujours le registre (compare le digest). Protège le CI/CD
 *                   (jamais servir un `latest` local périmé). Échoue si le pull échoue.
 *  - IfNotPresent : tire seulement si l'image est absente localement.
 *  - Never        : ne tire jamais ; exige la présence locale (dev / image non poussée).
 * Si non spécifiée, le défaut est DÉRIVÉ du tag (cf. effectivePullPolicy).
 */
export const PullPolicySchema = z.enum(["Always", "IfNotPresent", "Never"])
export type PullPolicy = z.infer<typeof PullPolicySchema>

export const ContainerConfigSchema = z.object({
  image: z.string().min(1),
  tag: z.string().min(1).default("latest"),
  /** Politique de pull de l'image (défaut dérivé du tag si absent). */
  pullPolicy: PullPolicySchema.optional(),
  /** Variables d'environnement NON sensibles. Les secrets passent par `secrets`. */
  env: z.record(z.string(), z.string()).default({}),
  /**
   * Secrets référencés par le service (Docker Secrets, JAMAIS en clair dans les
   * labels ni l'env). Chaque entrée = nom logique -> nom du Docker Secret réel.
   * La VALEUR n'est pas ici : elle est posée via l'API (createSecret) et montée en
   * fichier dans /run/secrets/<name>. On ne stocke que la référence.
   */
  secrets: z.array(SecretRefSchema).default([]),
  /** Commande de surcharge (forme exec). */
  cmd: z.array(z.string()).optional(),
  ports: z.array(PortMappingSchema).default([]),
  restartPolicy: RestartPolicySchema.default("unless-stopped"),
  resources: ResourcesSchema.optional(),
  healthcheck: HealthcheckSchema.optional(),
  // ── Swarm : chaque conteneur est un SERVICE répliqué ──
  /** Nombre de replicas (load balancing natif via routing mesh). */
  replicas: z.number().int().min(0).default(1),
  /** Rolling update : nombre de tasks mises à jour en parallèle. */
  updateParallelism: z.number().int().min(1).default(1),
  /** Rolling update : délai (s) entre deux lots de tasks. */
  updateDelaySec: z.number().int().min(0).default(5),
  /**
   * Auto-scaling (Swarm ne le fait PAS nativement — c'est l'auto-scaler de l'outil
   * qui ajuste `replicas` entre min/max selon la charge CPU observée). Désactivé par
   * défaut : le service garde son nombre de replicas fixe.
   */
  autoscale: AutoscaleSchema.optional(),
})
export type ContainerConfig = z.infer<typeof ContainerConfigSchema>

/**
 * Politique de pull EFFECTIVE d'un conteneur : explicite si fournie, sinon dérivée
 * du tag à la manière de Kubernetes — `latest` (mutable) ⇒ `Always` (anti-CI/CD-cassé),
 * tag fixe ⇒ `IfNotPresent`. Partagée back (deploy) + front (affichage du défaut déduit).
 */
export function effectivePullPolicy(config: Pick<ContainerConfig, "tag" | "pullPolicy">): PullPolicy {
  if (config.pullPolicy) return config.pullPolicy
  return config.tag === "latest" ? "Always" : "IfNotPresent"
}

// ── Réseau ───────────────────────────────────────────────────────────────────

export const NetworkConfigSchema = z.object({
  // Swarm : overlay attachable par défaut (requis pour relier des services).
  driver: z.enum(["overlay", "bridge"]).default("overlay"),
  /** Réseau interne (pas d'accès sortant). */
  internal: z.boolean().default(false),
  /** Permet à des conteneurs hors stack de s'y rattacher (docker network connect). */
  attachable: z.boolean().default(true),
  /** Labels Docker additionnels (fusionnés AVEC, jamais à la place des labels bozando.* gérés). */
  labels: z.record(z.string(), z.string()).default({}),
  /** IPAM custom. Laisser vide = Docker choisit automatiquement. */
  ipam: z
    .object({
      subnet: z.string().optional(),
      gateway: z.string().optional(),
    })
    .optional(),
})
export type NetworkConfig = z.infer<typeof NetworkConfigSchema>

// ── Volume ───────────────────────────────────────────────────────────────────

export const VolumeConfigSchema = z
  .object({
    driver: z.string().default("local"),
    /** Options spécifiques au driver (ex: NFS — type=nfs, o=addr=...,rw, device=:/path). */
    driverOpts: z.record(z.string(), z.string()).default({}),
    labels: z.record(z.string(), z.string()).default({}),
    /**
     * Volume EXTERNE : référence un volume Docker préexistant par son nom EXACT
     * (pas préfixé boz_<slug>_) au lieu d'en créer/gérer un. Le déploiement saute
     * la création et utilise ce nom directement dans les mounts.
     */
    external: z.boolean().default(false),
    /** Nom du volume externe (requis si external=true). */
    externalName: z.string().optional(),
  })
  .refine((v) => !v.external || (v.externalName && v.externalName.length > 0), {
    message: "externalName requis quand external=true",
    path: ["externalName"],
  })
export type VolumeConfig = z.infer<typeof VolumeConfigSchema>

// ── Passerelle internet (exposition publique via Caddy) ──────────────────────

export const GatewayConfigSchema = z.object({
  /** Domaine public (ex: app.bozando.com). Caddy gère HTTPS automatiquement. */
  domain: z.string().min(1),
  /** Port du conteneur cible vers lequel router. */
  targetPort: z.number().int().min(1).max(65535),
  tls: z.boolean().default(true),
})
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>

// ── Union discriminée par type de nœud ───────────────────────────────────────

export const NodeType = z.enum(["container", "network", "volume", "gateway"])
export type NodeType = z.infer<typeof NodeType>

// ── Matrice de compatibilité des connexions (GNS3-like) ──────────────────────

type EdgeKindLiteral = "network" | "volume" | "gateway"

/**
 * Paires de nœuds qu'il est sémantiquement possible de relier, et la nature
 * (kind) du lien résultant. Tout ce qui n'est pas listé ici est INTERDIT —
 * ex: volume<->gateway, network<->network, container<->container.
 *
 * Source unique partagée front (isValidConnection au drag) + back (createEdge,
 * défense en profondeur) : zéro risque de dérive entre les deux validations.
 */
const CONNECTION_RULES: { a: NodeType; b: NodeType; kind: EdgeKindLiteral }[] = [
  { a: "container", b: "network", kind: "network" },
  { a: "container", b: "volume", kind: "volume" },
  { a: "container", b: "gateway", kind: "gateway" },
]

const RULE_BY_PAIR = new Map<string, EdgeKindLiteral>(
  CONNECTION_RULES.flatMap((r) => [
    [`${r.a}|${r.b}`, r.kind] as const,
    [`${r.b}|${r.a}`, r.kind] as const,
  ])
)

/** Nature du lien entre deux types de nœuds, ou `null` si la paire est interdite. */
export function edgeKindForPair(a: NodeType, b: NodeType): EdgeKindLiteral | null {
  return RULE_BY_PAIR.get(`${a}|${b}`) ?? null
}

/** Vrai si les deux types de nœuds peuvent être reliés directement. */
export function isConnectionAllowed(a: NodeType, b: NodeType): boolean {
  return RULE_BY_PAIR.has(`${a}|${b}`)
}

/**
 * Map type → schéma de config. Utilisé pour valider dynamiquement la config
 * d'un nœud selon son type.
 */
export const NodeConfigSchemas = {
  container: ContainerConfigSchema,
  network: NetworkConfigSchema,
  volume: VolumeConfigSchema,
  gateway: GatewayConfigSchema,
} as const

export type NodeConfigByType = {
  container: ContainerConfig
  network: NetworkConfig
  volume: VolumeConfig
  gateway: GatewayConfig
}

/** Valide la config d'un nœud selon son type. Lève si invalide. */
export function parseNodeConfig<T extends NodeType>(
  type: T,
  config: unknown
): NodeConfigByType[T] {
  return NodeConfigSchemas[type].parse(config) as NodeConfigByType[T]
}
