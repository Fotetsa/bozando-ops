import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Badge,
  Button,
  FocusModal,
  Heading,
  Input,
  Label,
  Select,
  Text,
} from "@medusajs/ui"
import { Plus, Trash, Users, ShieldCheck } from "@medusajs/icons"
import { api, type UserAccount } from "../lib/api"
import { useMe } from "../lib/useMe"
import { useMutationToast } from "../lib/useMutationToast"
import { useConfirmDelete } from "../lib/useConfirmDelete"
import { PageHeader, PageContainer } from "../components/PageHeader"
import { ListContainer, ListRow } from "../components/ListContainer"
import { ActionMenu } from "../components/ActionMenu"
import { EmptyState } from "../components/EmptyState"
import { ModalForm } from "../components/ModalForm"

const ROLE_COLOR: Record<string, "purple" | "blue" | "grey"> = {
  owner: "purple",
  operator: "blue",
  viewer: "grey",
}

/**
 * Gestion des comptes (owner uniquement) — c'est ce qui rend concrète la
 * délégation à un employé : créer un operator/viewer, changer son rôle, le
 * retirer. Le backend garde les invariants (dernier owner, auto-suppression).
 */
export function UsersPage() {
  const { me } = useMe()
  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: api.listUsers })

  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"operator" | "viewer">("viewer")

  const createMut = useMutationToast({
    mutationFn: () => api.createUser({ email, password, role }),
    success: "Compte créé",
    invalidate: [["users"]],
    onSuccess: () => {
      setOpen(false)
      setEmail("")
      setPassword("")
      setRole("viewer")
    },
  })

  const roleMut = useMutationToast({
    mutationFn: ({ id, role }: { id: string; role: "owner" | "operator" | "viewer" }) =>
      api.setUserRole(id, role),
    success: (r) => `Rôle changé : ${r.role}`,
    invalidate: [["users"]],
  })

  const removeUser = useConfirmDelete<UserAccount>({
    mutationFn: (u) => api.deleteUser(u.id),
    success: "Compte supprimé",
    invalidate: [["users"]],
    confirm: (u) => ({
      title: "Supprimer ce compte ?",
      description: `« ${u.email} » perdra immédiatement l'accès à la console.`,
    }),
  })

  const canSubmit = email.includes("@") && password.length >= 8

  return (
    <PageContainer>
      <PageHeader
        title="Utilisateurs"
        subtitle="Délègue un accès limité (operator/viewer) à un employé."
        actions={
          <Button size="small" onClick={() => setOpen(true)}>
            <Plus /> Nouvel utilisateur
          </Button>
        }
      />

      <ListContainer
        title="Comptes"
        subtitle={users ? `${users.length} compte(s)` : undefined}
        isEmpty={!isLoading && users?.length === 0}
        empty={
          <EmptyState
            icon={Users}
            title="Aucun autre compte"
            description="Crée un operator (peut déployer) ou un viewer (lecture seule) pour déléguer."
          />
        }
      >
        {isLoading ? (
          <div className="px-6 py-8">
            <Text className="text-ui-fg-subtle">Chargement…</Text>
          </div>
        ) : (
          users?.map((u) => {
            const isSelf = u.id === me?.id
            return (
              <ListRow key={u.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <Users className="shrink-0 text-ui-fg-muted" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Text weight="plus" className="truncate">
                        {u.email}
                      </Text>
                      {isSelf && (
                        <Badge size="2xsmall" color="green">
                          vous
                        </Badge>
                      )}
                      {u.mfaEnabled && (
                        <span title="MFA activée">
                          <ShieldCheck className="text-ui-tag-green-icon" />
                        </span>
                      )}
                    </div>
                    <Badge size="2xsmall" color={ROLE_COLOR[u.role] ?? "grey"} className="mt-0.5 capitalize">
                      {u.role}
                    </Badge>
                  </div>
                </div>
                <ActionMenu
                  groups={[
                    {
                      actions: (["owner", "operator", "viewer"] as const)
                        .filter((r) => r !== u.role)
                        .map((r) => ({
                          label: `Définir ${r}`,
                          icon: <ShieldCheck />,
                          onClick: () => roleMut.mutate({ id: u.id, role: r }),
                        })),
                    },
                    {
                      actions: [
                        {
                          label: "Supprimer",
                          icon: <Trash />,
                          variant: "danger" as const,
                          disabled: isSelf,
                          onClick: () => removeUser(u),
                        },
                      ],
                    },
                  ]}
                />
              </ListRow>
            )
          })
        )}
      </ListContainer>

      <FocusModal open={open} onOpenChange={setOpen}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Heading>Nouvel utilisateur</Heading>
          </FocusModal.Header>
          <FocusModal.Body className="overflow-y-auto">
            <ModalForm onSubmit={() => canSubmit && createMut.mutate()}>
              <div>
                <Label size="small">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="employe@bozando.com"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div>
                <Label size="small">Mot de passe initial</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 caractères minimum"
                  autoComplete="new-password"
                />
                <Text size="xsmall" className="mt-1 text-ui-fg-muted">
                  L'utilisateur pourra le changer dans Paramètres et activer la MFA.
                </Text>
              </div>
              <div>
                <Label size="small">Rôle</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "operator" | "viewer")}>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="viewer">viewer — lecture seule</Select.Item>
                    <Select.Item value="operator">operator — peut déployer/détruire</Select.Item>
                  </Select.Content>
                </Select>
                <Text size="xsmall" className="mt-1 text-ui-fg-muted">
                  La promotion en owner se fait après coup, explicitement, depuis la liste.
                </Text>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" isLoading={createMut.isPending} disabled={!canSubmit}>
                  Créer le compte
                </Button>
              </div>
            </ModalForm>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>
    </PageContainer>
  )
}
