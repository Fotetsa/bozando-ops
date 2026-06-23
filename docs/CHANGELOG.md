# Changelog

## Refonte UX / accessibilité / cycle de vie — 2026-06-23

Audit DevOps de bout en bout de la console web (voir `docs/AUDIT-UX-2026-06-23.md`)
puis correction des gouffres logiques et d'accessibilité, en 8 lots. Cible : niveau
d'un outil de production (références Azure Portal / Railway / GNS3).

### LOT 1 — Onboarding
- Route publique `GET /api/auth/needs-bootstrap` + écran d'amorçage web : une
  installation neuve crée son compte owner depuis l'UI (plus de `curl` obligatoire).
- L'aiguillage non-authentifié bascule automatiquement entre bootstrap et login.

### LOT 2 — RBAC effectif + gestion des utilisateurs
- Backend : `GET/POST /api/users`, `POST /api/users/:id/role`, `DELETE /api/users/:id`
  (owner only), avec garde-fous (pas d'auto-suppression, jamais le dernier owner) et
  audit (`user.created/role.changed/deleted`).
- Web : contexte `useMe` (`can(minRole)` aligné sur le backend), menu et actions
  filtrés/désactivés selon le rôle, page Utilisateurs, rôle courant affiché.

### LOT 3 — Canvas : plan, diff, garde-fous
- Câblage de `GET /api/projects/:id/plan` : modal « Revoir et déployer » montrant le
  diff (créer/mettre à jour/supprimer) avant d'appliquer.
- Validation de cohérence du graphe (`canvas/validate.ts`) : conteneur sans réseau,
  passerelle sans cible/domaine, volume orphelin, ports hôte en conflit.
- Destruction confirmée et récapitulée. Badge « à déployer » (désiré-vs-réel) par nœud.
- Panneau d'activité (log de déploiement) `aria-live` au lieu d'un toast tronqué.
- Suppression au clavier (`Suppr`/`Backspace`) du nœud/lien sélectionné.

### LOT 4 — Accessibilité
- Palette utilisable au clic/clavier (Enter/Espace), pas seulement en glisser-déposer.
- `aria-label` sur les boutons icône, `role="dialog"` + fermeture `Esc` sur les
  panneaux et le menu mobile, lien d'évitement, `:focus-visible` global.
- États communiqués par texte (libellé d'état) en plus de la couleur ; `aria-live` sur
  les flux de logs (conteneur, provisioning).
- Indicateur temps-réel « Live / Reconnexion… » ; hook socket stabilisé (refs).

### LOT 5 — Robustesse
- `QueryClient` borné (`retry: 1`, `staleTime`, pas de refetch au focus).
- `ErrorBoundary` global (plus d'écran blanc). États chargement/erreur du canvas.

### LOT 6 — Journal d'audit
- `GET /api/audit` (operator+, paginé, filtrable) rendant lisible la table `AuditLog`
  jusque-là seulement écrite. Page Journal côté web.

### LOT 7 — Observabilité
- `GET /api/services/:id/metrics` câblé : clic sur un service → tiroir détail
  (placement par task, CPU/mémoire, erreurs).

### LOT 8 — Cohérence visuelle & densité
- Pages de liste homogénéisées (`ListContainer`/`ListRow`), composant `EmptyState`.
- Densité des nœuds du canvas réduite (plus compacts, façon GNS3).
- Titre d'onglet par page, état vide guidé sur le canvas.

### Vérification
- `npm run typecheck` (shared/api/web) : exit 0.
- `npm run build` api + web : exit 0 (CSS 82 KB, pas de warning tailwind content).
- Parcours manuel à valider : voir `docs/AUDIT-UX-2026-06-23.md` (section vérification).
