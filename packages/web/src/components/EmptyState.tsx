import type { ComponentType, ReactNode } from "react"
import { Text } from "@medusajs/ui"

/**
 * État vide homogène : icône optionnelle, titre, sous-texte, action optionnelle.
 * Mutualise les "Aucun X. Crées-en un." disséminés et inégaux entre les pages.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon && (
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-ui-bg-base-pressed text-ui-fg-muted">
          <Icon />
        </div>
      )}
      <Text weight="plus">{title}</Text>
      {description && (
        <Text size="small" className="max-w-md text-ui-fg-subtle">
          {description}
        </Text>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
