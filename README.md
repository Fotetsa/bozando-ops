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

Voir le plan d'implémentation détaillé dans le dépôt parent.
