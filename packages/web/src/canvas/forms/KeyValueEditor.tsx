import { Button, Input, Label, Text } from "@medusajs/ui"
import { Plus, Trash } from "@medusajs/icons"

/** Éditeur clé/valeur générique (labels Docker, driver_opts, ...). */
export function KeyValueEditor({
  label,
  values,
  onChange,
  keyPlaceholder = "clé",
  valuePlaceholder = "valeur",
  emptyText = "Aucune entrée",
}: {
  label: string
  values: Record<string, string>
  onChange: (next: Record<string, string>) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  emptyText?: string
}) {
  const entries = Object.entries(values)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label size="small">{label}</Label>
        <Button variant="transparent" size="small" onClick={() => onChange({ ...values, "": "" })}>
          <Plus /> Ajouter
        </Button>
      </div>
      {entries.length === 0 && (
        <Text size="small" className="text-ui-fg-muted">
          {emptyText}
        </Text>
      )}
      {entries.map(([k, v], i) => (
        <div key={i} className="mb-1 flex items-center gap-2">
          <Input
            placeholder={keyPlaceholder}
            value={k}
            onChange={(e) => {
              const next = { ...values }
              delete next[k]
              next[e.target.value] = v
              onChange(next)
            }}
          />
          <span className="text-ui-fg-muted">=</span>
          <Input
            placeholder={valuePlaceholder}
            value={v}
            onChange={(e) => onChange({ ...values, [k]: e.target.value })}
          />
          <Button
            variant="transparent"
            size="small"
            onClick={() => {
              const next = { ...values }
              delete next[k]
              onChange(next)
            }}
          >
            <Trash />
          </Button>
        </div>
      ))}
    </div>
  )
}
