# Audit securite bozando-ops - 2026-06-25

Perimetre: `bozando-ops/` uniquement. Analyse statique du code, manifests Docker, CI, installateur, configuration, secrets locaux sans exposition des valeurs, et verification TypeScript.

Limites: pas de scan reseau actif contre une instance deployee, pas de fuzzing, pas de verification CVE complete car `npm audit --json` echoue cote registry meme apres autorisation reseau.

## Synthese executive

`bozando-ops` possede deja de bons garde-fous: JWT avec audience separee, RBAC cote backend, redaction Fastify, Docker Secrets, chiffrement AES-GCM des credentials, docker-socket-proxy en production, et protection `bozando.system=true`.

Les risques residuels les plus importants sont:

- MFA annoncee comme obligatoire mais contournable en pratique tant que `mfaEnabled=false`.
- Endpoints d'observabilite/logs pouvant exposer des ressources Docker arbitraires a un utilisateur authentifie.
- Supply chain non pinnee (`curl | sh`, `latest`, images sans digest, actions non pinnees SHA).
- Secrets applicatifs possibles dans `env`, puis copies dans labels Docker `bozando.spec`.
- Absence de reauth/MFA step-up pour actions destructrices ou tres sensibles.

## Critique

### C-01 - MFA non imposee apres bootstrap

- Preuve: `packages/api/src/modules/auth/service.ts:52` delivre un token de session direct si `user.mfaEnabled` est faux; `packages/api/src/modules/auth/routes.ts:80` laisse l'enrolement MFA optionnel.
- Impact: compromission d'un seul mot de passe = acces complet selon role. Pour un owner, cela donne provisioning SSH, registry tokens, creation de serveurs, gestion Swarm.
- Scenario: installation exposee avant activation MFA, ou compte delegue cree sans MFA, puis bruteforce/phishing du mot de passe.
- Correction prioritaire: bloquer toute route sensible tant que `mfaEnabled=false`, sauf `/api/auth/me`, `/api/auth/mfa/enroll`, `/api/auth/mfa/confirm`, `/api/auth/password`; rendre MFA obligatoire pour owner/operator avant toute action infra.

### C-02 - Logs/metrics consultables par identifiant Docker arbitraire

- Preuve: `packages/api/src/loaders/websocket.ts:53` accepte un `containerId`/serviceId fourni par le client et appelle `streamLogs`; `packages/api/src/modules/observability/routes.ts:21` expose `/api/services/:id/metrics` a `viewer`; `packages/api/src/modules/docker-engine/service.ts:717` lit les logs du service sans verifier labels/projet/role.
- Impact: fuite de logs applicatifs, erreurs, URLs internes, tokens accidentellement journalises, details d'infra. Selon la portee du socket proxy, un viewer peut sonder des IDs de services non geres.
- Correction prioritaire: verifier que le service a `bozando.managed=true`, `bozando.system!=true`, et retourner logs/metrics seulement via `nodeId`/`projectId` connus en base. Restreindre logs a `operator` ou ajouter une permission dediee.

## Eleve

### H-01 - Secrets possibles dans `env`, puis persistants dans Docker labels

- Preuve: `packages/shared/src/node-config.ts:103` accepte `env` libre; `packages/shared/src/labels.ts:143` encode toute la config dans `bozando.spec`; `packages/api/src/modules/docker-engine/service.ts:468` injecte `env` dans la spec Docker.
- Impact: un utilisateur peut mettre `DATABASE_URL`, `API_KEY`, `TOKEN`, etc. dans `env`; ces valeurs deviennent visibles via Docker inspect, labels, rebuild, backup Docker, et potentiellement UI/API.
- Correction: refuser en backend les clefs env ressemblant a des secrets (`SECRET`, `TOKEN`, `PASSWORD`, `KEY`, `DATABASE_URL`) ou imposer Docker Secrets pour ces noms; ajouter une validation bloquante et une migration UI.

### H-02 - Supply chain non reproductible et sensible au tag mutable

- Preuve: `install.sh:5` recommande `curl | bash`; `install.sh:20` et `docker-compose.prod.yml:65` utilisent `latest`; `docker-compose.prod.yml:39` utilise `tecnativa/docker-socket-proxy:latest`; workflows GitHub utilisent des actions par tags (`actions/checkout@v4`, etc.).
- Impact: build/install non deterministe, rollback difficile, compromission upstream ou tag repousse = execution de code avec acces Docker/root.
- Correction: publier et installer par release tag immuable, verifier SHA256 du compose/Caddyfile, pinner images par digest, remplacer `latest` par tags semver/SHA, pinner GitHub Actions par commit SHA.

### H-03 - Actions destructrices sans reauth ni MFA step-up

- Preuve: destruction projet `packages/api/src/modules/reconciler/routes.ts:60`, prune apply `packages/api/src/modules/reconciler/routes.ts:84`, suppression serveur `packages/api/src/modules/servers/routes.ts:65`, changement role `packages/api/src/modules/servers/routes.ts:83` utilisent seulement JWT courant.
- Impact: un token vole en localStorage ou via poste compromis reste suffisant pendant 12h pour des actions irreversibles.
- Correction: exiger reauth mot de passe + TOTP recent pour destroy/prune/server role/server delete/registry set/user role; introduire un `auth_time` ou `mfa_verified_at` court.

### H-04 - Tokens de session longs et non revocables

- Preuve: `packages/api/src/modules/auth/service.ts:17` fixe `TOKEN_TTL = "12h"`; aucun `jti`, session store, `tokenVersion`, logout serveur ou invalidation apres changement de mot de passe/role.
- Impact: token vole utilisable jusqu'a expiration meme apres changement de mot de passe ou retrogradation de role.
- Correction: stocker sessions/JTI en DB ou Redis, ajouter `tokenVersion` utilisateur, invalider sur changement de mot de passe, changement de role, suppression compte, activation/desactivation MFA.

### H-05 - Caddy admin ecoute sur toutes interfaces du conteneur

- Preuve: `Caddyfile:11` definit `admin 0.0.0.0:2019`.
- Impact: compose ne publie pas le port, mais tout conteneur sur le reseau interne capable de joindre `caddy:2019` peut modifier la config Caddy si compromis.
- Correction: isoler l'API admin dans un reseau Docker dedie `api<->caddy`, ajouter filtrage reseau, ou utiliser une socket/endpoint local non accessible aux workloads applicatifs.

## Moyen

### M-01 - `JWT_SECRET` accepte une valeur absente/faible au runtime

- Preuve: `packages/api/src/modules/auth/service.ts:62` et `:200` castent `process.env.JWT_SECRET as string`; pas de validation de longueur/format au boot.
- Impact: hors compose prod, une config dev/staging peut signer avec `undefined` ou secret faible.
- Correction: valider au demarrage `JWT_SECRET` >= 32 bytes aleatoires et `MFA_ENCRYPTION_KEY` hex 64 en prod; echouer fast si invalide.

### M-02 - Fallback de chiffrement dangereux hors prod

- Preuve: `packages/api/src/modules/auth/crypto.ts:10` accepte absence de `MFA_ENCRYPTION_KEY`, derive depuis `JWT_SECRET`, puis fallback `"dev-insecure-key"`.
- Impact: secrets MFA/registry/SSH decryptables si config oubliee; confusion dev/prod.
- Correction: interdire le fallback quand `NODE_ENV=production`; documenter explicitement le mode dev.

### M-03 - Absence de rate limiting et protection brute force

- Preuve: routes login/MFA dans `packages/api/src/modules/auth/routes.ts:60` et `:70` sans throttling par IP/email.
- Impact: bruteforce password/TOTP plus viable, DoS applicatif par scryptSync.
- Correction: rate limit Fastify par IP/email, backoff progressif, verrouillage temporaire, audit des echecs.

### M-04 - Hash de mot de passe scrypt sans parametres explicites

- Preuve: `packages/api/src/modules/auth/service.ts:24` utilise `scryptSync(password, salt, 64)` avec defaults Node.
- Impact: cout non versionne, migration difficile, pas de politique de complexite au-dela de 8 caracteres.
- Correction: stocker algo/params avec le hash, augmenter exigences mot de passe, envisager Argon2id ou scrypt parametre explicitement.

### M-05 - CORS base sur variable sans validation stricte

- Preuve: `packages/api/src/server.ts:50` et `packages/api/src/loaders/websocket.ts:20` utilisent `WEB_ORIGIN.split(",")`.
- Impact: mauvaise config avec origin trop large ou schema HTTP en prod facilite vol de token via environnement compromis.
- Correction: refuser `*`, exiger HTTPS hors local, normaliser origins, echouer au boot si invalide.

### M-06 - Secrets Docker globaux non scopes par projet

- Preuve: `packages/api/src/modules/secrets/routes.ts:29` liste les secrets geres et `:35` cree/remplace par nom global; pas de `projectId`.
- Impact: un operator peut remplacer/supprimer un secret utilise par un autre projet.
- Correction: scoper les secrets par projet ou par namespace, tracer dependances avant suppression/remplacement, exiger owner pour secrets globaux.

### M-07 - Installation Docker via script distant

- Preuve: `install.sh:43` execute `curl -fsSL https://get.docker.com | sh`; `packages/api/src/workflows/provision-server.ts:72` fait pareil sur les serveurs provisionnes.
- Impact: execution distante non verifiee comme root sur le manager et les workers.
- Correction: utiliser packages officiels pinnees, checksums, ou un script versionne avec verification.

### M-08 - Pas d'archivage/immutabilite de l'audit

- Preuve: `AuditLog` est en DB applicative standard; aucune retention, export, append-only ou signature.
- Impact: un owner compromis peut effacer/alterer la base hors application; forensic faible.
- Correction: exporter les audits vers stockage append-only externe, signer les entrees ou au minimum shipper vers syslog/SIEM.

## Faible

### L-01 - Build artefacts `dist/` presents dans l'arborescence

- Preuve: `packages/api/dist` et `packages/web/dist` existent localement, mais ne sont pas trackes d'apres `git ls-files`.
- Impact: confusion d'audit si le code compile diverge de `src`.
- Correction: nettoyer avant revue/release ou verifier CI depuis source uniquement.

### L-02 - `node_modules/` present dans le workspace

- Preuve: repertoire local volumineux present, ignore par Git.
- Impact: bruit d'audit et risque de lecture accidentelle de code tiers local modifie.
- Correction: ne pas inclure `node_modules` dans artefacts, scanner via lockfile/registry.

## Gaps metier

- Separation des devoirs: `operator` peut deploy/destroy et gerer Docker Secrets. Pour une infra sensible, distinguer `deployer`, `secret-manager`, `infra-admin`, `auditor`.
- Double controle: aucune approbation a deux personnes pour prune, destroy, suppression serveur, promotion manager, registry credential.
- Environnements: pas de notion prod/staging ni guardrail empechant un operator de deployer une image/tag non approuve sur prod.
- Change management: pas de fenetre de maintenance, freeze, ticket/reference obligatoire, commentaire de changement ou justification avant action.
- Sauvegarde/restauration: `.env` est critique, mais pas de procedure automatisee de backup/restore testee pour Postgres, volumes Caddy, et cles maitresses.
- Rotation: pas de workflow de rotation JWT/MFA key/registry token/SSH tool key ni impact analysis.
- Tenant/projet: les roles semblent globaux; pas de RBAC par projet ou serveur.
- Break-glass: pas de procedure d'urgence auditee avec token court et justification.

## Verifications effectuees

- `npm run typecheck`: OK.
- Recherche de secrets committes courants: aucun match evident dans `bozando-ops/` hors `node_modules` et `.git`.
- `.env` local: present mais non tracke; seules les cles ont ete inspectees, pas les valeurs.
- `npm audit --json`: echec registry (`registry.npmjs.org`), donc statut CVE inconnu.

## Priorites de correction recommandees

1. Imposer MFA avant toute action sensible et ajouter step-up MFA pour destructive/admin.
2. Verrouiller logs/metrics aux ressources gerees et roles autorises.
3. Interdire secrets dans `env` et forcer Docker Secrets pour noms sensibles.
4. Pinner supply chain: images digest, release tags, actions SHA, checksums install.
5. Ajouter validation stricte de config au boot et rate limiting login/MFA.
6. Introduire sessions revocables et invalidation sur changement de role/password.
7. Scoper secrets/projets et renforcer audit append-only.
