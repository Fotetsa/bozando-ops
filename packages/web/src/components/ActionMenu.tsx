import type { ReactNode } from "react"
import { EllipsisHorizontal } from "@medusajs/icons"
import { DropdownMenu, IconButton, clx } from "@medusajs/ui"
import { Link } from "react-router-dom"

/**
 * Menu d'action "…" par ligne/élément — porté (simplifié) du composant ActionMenu
 * d'admin-panel. Chaque action est soit un lien (`to`) soit un handler (`onClick`).
 * Les groupes sont séparés par un trait (ex. mettre "Supprimer" dans son groupe).
 */

export type Action = {
  icon: ReactNode
  label: string
  disabled?: boolean
  /** Variante visuelle (danger = rouge, pour les suppressions). */
  variant?: "default" | "danger"
} & ({ to: string; onClick?: never } | { onClick: () => void; to?: never })

export type ActionGroup = { actions: Action[] }

export function ActionMenu({ groups }: { groups: ActionGroup[] }) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <IconButton size="small" variant="transparent">
          <EllipsisHorizontal />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {groups.map((group, gi) => {
          if (!group.actions.length) return null
          const isLast = gi === groups.length - 1
          return (
            <DropdownMenu.Group key={gi}>
              {group.actions.map((action, ai) => {
                const className = clx(
                  "flex items-center gap-x-2 [&_svg]:text-ui-fg-subtle",
                  action.variant === "danger" && "text-ui-fg-error [&_svg]:text-ui-fg-error",
                  action.disabled && "[&_svg]:text-ui-fg-disabled"
                )
                if (action.onClick) {
                  return (
                    <DropdownMenu.Item
                      key={ai}
                      disabled={action.disabled}
                      className={className}
                      onClick={(e) => {
                        e.stopPropagation()
                        action.onClick()
                      }}
                    >
                      {action.icon}
                      <span>{action.label}</span>
                    </DropdownMenu.Item>
                  )
                }
                return (
                  <DropdownMenu.Item key={ai} disabled={action.disabled} className={className} asChild>
                    <Link to={action.to} onClick={(e) => e.stopPropagation()}>
                      {action.icon}
                      <span>{action.label}</span>
                    </Link>
                  </DropdownMenu.Item>
                )
              })}
              {!isLast && <DropdownMenu.Separator />}
            </DropdownMenu.Group>
          )
        })}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
