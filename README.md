# bozando-ops

Ops-panel "GNS3-like" pour piloter le déploiement Docker de Bozando.

Canvas visuel (type GNS3) où l'on dessine une infrastructure — conteneurs, réseaux,
passerelles internet, volumes — et où le dessin **pilote Docker réellement** via l'API
Docker Engine (dockerode). Conçu pour un VPS unique, avec pour but de transformer des
opérations d'infra risquées en actions visuelles sûres et délégables.

## Architecture

Monorepo à 3 packages :

- `packages/shared` — contrat de types (Zod) : `Project` / `Node` / `Edge`, config par type
  de nœud, et helpers d'encodage/décodage des labels Docker `bozando.*`. Source de vérité
  partagée par `api` et `web`.
- `packages/api` — back Node long-running (Fastify) : modules / workflows / subscribers /
  jobs / event-bus, dockerode (moteur), socket.io (temps réel), Prisma + PostgreSQL.
- `packages/web` — front React + Vite, coquille `@medusajs/ui` + canvas React Flow.

Bootstrap (hors-canvas, pour résoudre le paradoxe œuf-poule) : `docker-compose.yml`
(postgres + redis + caddy + api + web).

## Principes clés

- **Mapping 1-pour-1** : 1 nœud = 1 conteneur, 1 lien = un réseau Docker partagé,
  1 passerelle = une route Caddy, 1 volume = un volume nommé.
- **Labels Docker = source de vérité redondante** : le maximum d'informations est stocké
  dans les labels `bozando.*` pour pouvoir reconstruire le canvas depuis Docker seul
  (`rebuildFromDocker()`). PostgreSQL n'est qu'un cache de confort.
- **Réconciliation desired-vs-actual** : déploiement idempotent (diff create/recreate/remove),
  déclenché manuellement ; observation continue de l'état réel via les events Docker.

## Fonctionnalités

- **Cluster Docker Swarm multi-serveurs** : services répliqués, rolling update
  zero-downtime (start-first), routing mesh, self-healing natif.
- **Provisioning SSH one-shot** : ajout d'un serveur (clé/mot de passe utilisés une
  seule fois, jamais stockés) → install Docker + join Swarm + login registre. L'outil
  installe ensuite sa propre clé de maintenance chiffrée.
- **HA multi-managers** : promotion/rétrogradation de nœuds, indicateur de quorum Raft.
- **Observabilité** : santé du cluster (nœuds + métriques CPU/mém par service),
  détection de drift, prune des ressources orphelines (jamais le système).
- **Auto-scaling** (ce que Swarm ne fait pas) : ajuste les replicas selon le CPU,
  entre min/max, avec cooldown anti-flapping.
- **Registres & secrets** : credentials de registre chiffrés ; Docker Secrets pour les
  valeurs sensibles (hors labels/env).
- **Sécurité** : MFA TOTP, docker-socket-proxy (API Docker filtrée, EXEC bloqué),
  garde œuf-poule, secrets chiffrés AES-256-GCM, rédaction des logs, bind loopback + Caddy.

## Console (web)

L'interface est pensée pour être utilisée — et **déléguée à un employé** — sans connaissance Docker :

- **Onboarding** : à la première ouverture (aucun compte), un écran crée le compte
  propriétaire (owner) directement depuis l'UI — plus besoin de `curl`.
- **Rôles (RBAC) effectifs** : `owner > operator > viewer`. Le menu et les actions
  s'adaptent au rôle (un viewer ne voit pas Serveurs/Registres/Utilisateurs et ne peut
  pas déployer) — au lieu d'un refus opaque. Gestion des comptes : créer un operator/viewer,
  changer un rôle, retirer un accès (garde-fous : pas d'auto-suppression, jamais le dernier owner).
- **Journal d'audit** : qui a déployé/détruit/créé quoi et quand (filtrable, paginé).
- **Déploiement sûr (canvas)** : un écran « Revoir et déployer » montre le diff
  (créer/mettre à jour/supprimer) **et** des vérifications de cohérence (conteneur sans
  réseau, passerelle sans cible, ports en conflit…) avant d'appliquer ; la destruction
  est confirmée et récapitulée. Chaque nœud affiche un badge « à déployer » quand le
  désiré diverge du réel, et un indicateur temps-réel signale si le canvas est « live ».
- **Observabilité** : clic sur un service → détail (placement par task, CPU/mémoire,
  erreurs).
- **Accessibilité** : palette utilisable au clavier (pas seulement en glisser-déposer),
  labels ARIA, fermeture `Esc` des panneaux, suppression au clavier (`Suppr`), états
  communiqués par texte en plus de la couleur, lien d'évitement, focus visible.

## Installation (serveur frais)

```bash
curl -fsSL https://raw.githubusercontent.com/bright77777/bozando-ops/master/install.sh | bash
```

L'installeur (idempotent) installe Docker, initialise le Swarm, crée l'overlay
système, génère les secrets (`.env`), récupère `docker-compose.prod.yml` (images
GHCR publiques) et démarre l'ops-panel. Variables : `GHCR_OWNER`, `IMAGE_TAG`,
`PUBLIC_HOST` (active HTTPS auto). Ouvre ensuite l'URL affichée : l'écran d'amorçage
te demande de créer le compte propriétaire (owner), puis active la MFA dans Paramètres.

Sécurité : voir [SECURITY.md](./SECURITY.md). Licence : [MIT](./LICENSE).

Voir le plan d'implémentation détaillé dans le dépôt parent.
