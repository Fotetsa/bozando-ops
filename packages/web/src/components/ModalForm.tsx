import type { ReactNode } from "react"

/**
 * Corps de formulaire centré pour `FocusModal` (plein écran chez Medusa UI).
 * Sans contrainte, `FocusModal.Body` étire les champs sur toute la largeur de
 * l'écran — illisible. Ce wrapper recrée la sensation d'une boîte de dialogue :
 * colonne centrée à largeur max, défilement vertical si besoin.
 *
 * À placer DANS `<FocusModal.Body>` (qui garde le scroll/overflow).
 */
export function ModalForm({
  children,
  onSubmit,
  size = "md",
}: {
  children: ReactNode
  /** Optionnel : permet la soumission à la touche Entrée. */
  onSubmit?: () => void
  /** Largeur max de la colonne : "md" (formulaire simple) ou "lg" (multi-colonnes). */
  size?: "md" | "lg"
}) {
  const maxW = size === "lg" ? "max-w-xl" : "max-w-md"
  return (
    <div className="flex w-full justify-center px-4 py-8">
      <form
        className={`flex w-full ${maxW} flex-col gap-4`}
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit?.()
        }}
      >
        {children}
      </form>
    </div>
  )
}
