import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button, Container, Heading, Input, Label, Text, Badge } from "@medusajs/ui"
import { Plus, Trash, CircleStack } from "@medusajs/icons"
import { api } from "../lib/api"
import { useMutationToast } from "../lib/useMutationToast"
import { useConfirmDelete } from "../lib/useConfirmDelete"
import { PageHeader, PageContainer } from "../components/PageHeader"
import { ListContainer, ListRow } from "../components/ListContainer"
import { ActionMenu } from "../components/ActionMenu"
import { EmptyState } from "../components/EmptyState"

/**
 * Gestion des registres de conteneurs (Docker Hub, GHCR, registres privés).
 * Les credentials servent à `docker login` sur chaque nœud + pull des images privées.
 * Le token n'est jamais réaffiché (write-only).
 */
export function IntegrationsPage() {
  const { data: regs } = useQuery({ queryKey: ["registry"], queryFn: api.listRegistry })

  const [registry, setRegistry] = useState("ghcr.io")
  const [username, setUsername] = useState("")
  const [token, setToken] = useState("")

  const save = useMutationToast({
    mutationFn: () => api.setRegistry({ registry, username, token }),
    success: "Registre enregistré",
    invalidate: [["registry"]],
    onSuccess: () => {
      setUsername("")
      setToken("")
    },
  })

  const removeRegistry = useConfirmDelete<{ id: string; registry: string }>({
    mutationFn: (r) => api.deleteRegistry(r.id),
    success: "Registre retiré",
    invalidate: [["registry"]],
    confirm: (r) => ({
      title: "Retirer ce registre ?",
      description: `Les identifiants pour « ${r.registry} » seront supprimés. Les images privées de ce registre ne pourront plus être tirées au déploiement.`,
    }),
  })

  return (
    <PageContainer size="2xl">
      <PageHeader title="Registres de conteneurs" />

      {/* Liste */}
      <div className="mb-6">
        <ListContainer
          title="Registres"
          subtitle={regs ? `${regs.length} registre(s)` : undefined}
          isEmpty={regs?.length === 0}
          empty={
            <EmptyState
              icon={CircleStack}
              title="Aucun registre"
              description="Ajoute Docker Hub, GHCR ou un registre privé pour déployer des images privées."
            />
          }
        >
          {regs?.map((r) => (
            <ListRow key={r.id}>
              <div className="flex items-center gap-2">
                <CircleStack className="text-ui-fg-muted" />
                <Heading level="h3">{r.registry}</Heading>
                <Badge size="2xsmall">{r.username}</Badge>
              </div>
              <ActionMenu
                groups={[
                  {
                    actions: [
                      {
                        label: "Supprimer",
                        icon: <Trash />,
                        variant: "danger",
                        onClick: () => removeRegistry({ id: r.id, registry: r.registry }),
                      },
                    ],
                  },
                ]}
              />
            </ListRow>
          ))}
        </ListContainer>
      </div>

      {/* Ajout */}
      <Container className="p-6">
        <Heading level="h3" className="mb-3">
          Ajouter / mettre à jour un registre
        </Heading>
        <div className="flex flex-col gap-3">
          <div>
            <Label size="small">Registre</Label>
            <Input
              value={registry}
              onChange={(e) => setRegistry(e.target.value)}
              placeholder="ghcr.io / docker.io / registry.exemple.com"
            />
            <Text size="xsmall" className="mt-1 text-ui-fg-muted">
              Docker Hub = docker.io · GitHub = ghcr.io · ou l'hôte de ton registre privé.
            </Text>
          </div>
          <div>
            <Label size="small">Utilisateur</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Entrez l'identifiant utilisateur..."
            />
          </div>
          <div>
            
          </div>
          <div>
            <Label size="small">Token / mot de passe</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="(jamais réaffiché)"
            />
          </div>
          <Button
            onClick={() => save.mutate()}
            isLoading={save.isPending}
            disabled={!registry || !username || !token}
          >
            <Plus /> Enregistrer
          </Button>
        </div>
      </Container>
    </PageContainer>
  )
}
