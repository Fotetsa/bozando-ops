import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button, Container, Heading, Text } from "@medusajs/ui"

/**
 * Garde-fou global : une exception de rendu (donnée inattendue, bug) afficherait
 * sinon une page blanche totale. Ici on montre un écran d'erreur propre avec un
 * bouton recharger. C'est un outil de PROD : il ne doit jamais "disparaître".
 */
type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Trace console (un envoi vers un collecteur pourra être branché en V2).
    console.error("Erreur non gérée dans l'UI:", error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-ui-bg-subtle p-4">
          <Container className="w-[460px] p-6">
            <Heading level="h2" className="mb-2">
              Une erreur est survenue
            </Heading>
            <Text className="mb-4 text-ui-fg-subtle">
              L'interface a rencontré un problème inattendu. Recharge la page ; si le
              problème persiste, vérifie l'état de l'API.
            </Text>
            <pre className="mb-4 max-h-40 overflow-auto rounded-lg bg-ui-bg-base-pressed p-2 font-mono text-ui-fg-subtle txt-compact-xsmall">
              {this.state.error.message}
            </pre>
            <Button onClick={() => window.location.reload()}>Recharger</Button>
          </Container>
        </div>
      )
    }
    return this.props.children
  }
}
