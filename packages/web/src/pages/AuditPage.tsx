import { useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { Badge, Button, Select, Table, Text } from "@medusajs/ui"
import { ArrowPath, DocumentText } from "@medusajs/icons"
import { api, type AuditEntry } from "../lib/api"
import { PageHeader, PageContainer } from "../components/PageHeader"
import { ListContainer } from "../components/ListContainer"
import { EmptyState } from "../components/EmptyState"

const PAGE_SIZE = 50

// Actions connues (alimente le filtre). Liste alignée sur la table AUDITED du
// subscriber on-deploy-finished côté backend.
const ACTIONS = [
  "deploy.success",
  "deploy.failed",
  "destroy",
  "rebuild",
  "server.provisioned",
  "server.removed",
  "server.role.changed",
  "registry.set",
  "secret.set",
  "secret.removed",
  "user.created",
  "user.role.changed",
  "user.deleted",
  "mfa.enabled",
  "autoscale.applied",
  "prune.finished",
]

/** Couleur du badge d'action : rouge pour les échecs/destructions, sinon neutre/vert. */
function actionColor(action: string): "red" | "orange" | "green" | "grey" {
  if (action.includes("failed") || action === "destroy" || action.includes("removed") || action === "user.deleted") {
    return "red"
  }
  if (action.includes("success") || action === "server.provisioned" || action === "user.created") {
    return "green"
  }
  if (action.includes("role.changed") || action === "autoscale.applied") return "orange"
  return "grey"
}

/**
 * Journal d'audit : rend lisible la table AuditLog (qui a fait quoi, quand).
 * Indispensable pour tracer les actions d'un employé délégué. operator+.
 */
export function AuditPage() {
  const [action, setAction] = useState<string>("__all")
  const [offset, setOffset] = useState(0)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["audit", action, offset],
    queryFn: () =>
      api.audit({
        limit: PAGE_SIZE,
        offset,
        action: action === "__all" ? undefined : action,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  })

  const entries = data?.entries ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <PageContainer size="5xl">
      <PageHeader
        title="Journal d'audit"
        subtitle="Trace des actions sensibles (déploiements, destructions, comptes, serveurs)."
        actions={
          <div className="flex items-center gap-2">
            <div className="w-56">
              <Select
                value={action}
                onValueChange={(v) => {
                  setAction(v)
                  setOffset(0)
                }}
              >
                <Select.Trigger>
                  <Select.Value placeholder="Toutes les actions" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="__all">Toutes les actions</Select.Item>
                  {ACTIONS.map((a) => (
                    <Select.Item key={a} value={a}>
                      {a}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <Button variant="secondary" size="small" onClick={() => refetch()} aria-label="Rafraîchir">
              <ArrowPath /> Rafraîchir
            </Button>
          </div>
        }
      />

      <ListContainer
        title="Évènements"
        subtitle={total ? `${total} évènement(s)` : undefined}
        isEmpty={!isLoading && entries.length === 0}
        empty={
          <EmptyState
            icon={DocumentText}
            title="Aucun évènement"
            description="Les actions sensibles apparaîtront ici dès qu'elles seront effectuées."
          />
        }
      >
        <div className="overflow-x-auto px-2 pb-2" aria-busy={isFetching}>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Date</Table.HeaderCell>
                <Table.HeaderCell>Action</Table.HeaderCell>
                <Table.HeaderCell>Utilisateur</Table.HeaderCell>
                <Table.HeaderCell>Cible</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {entries.map((e) => (
                <AuditRow key={e.id} e={e} />
              ))}
            </Table.Body>
          </Table>
        </div>
        <div className="flex items-center justify-between px-6 py-3">
          <Text size="small" className="text-ui-fg-subtle">
            Page {page} / {pages}
          </Text>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="small"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Précédent
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Suivant
            </Button>
          </div>
        </div>
      </ListContainer>
    </PageContainer>
  )
}

function AuditRow({ e }: { e: AuditEntry }) {
  const target =
    e.projectId
      ? `projet ${e.projectId.slice(0, 8)}`
      : e.serverId
        ? `serveur ${e.serverId.slice(0, 8)}`
        : (e.payload as { email?: string; role?: string } | null)?.email ?? "—"
  return (
    <Table.Row>
      <Table.Cell>
        <Text size="small" className="whitespace-nowrap text-ui-fg-subtle">
          {new Date(e.createdAt).toLocaleString()}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Badge size="2xsmall" color={actionColor(e.action)}>
          {e.action}
        </Badge>
      </Table.Cell>
      <Table.Cell>{e.userEmail ?? <span className="text-ui-fg-muted">système</span>}</Table.Cell>
      <Table.Cell>
        <Text size="small" className="text-ui-fg-subtle">
          {target}
        </Text>
      </Table.Cell>
    </Table.Row>
  )
}
