/**
 * Mini-orchestrateur de workflow façon Medusa (createWorkflow + steps + compensation).
 *
 * Un workflow = une séquence de steps. Chaque step peut fournir une fonction de
 * compensation (rollback). Si un step échoue, les compensations des steps déjà
 * exécutés sont rejouées en ordre inverse — crucial pour deploy-project (ne pas
 * laisser de conteneurs/réseaux orphelins si le 3e échoue).
 *
 * Volontairement minimal (pas de moteur Redis comme Medusa) : suffisant pour un
 * ops-panel mono-process. L'idempotence reste gérée au niveau du reconciler.
 */

export interface StepContext {
  /** Données partagées entre steps (résultats accumulés). */
  shared: Record<string, unknown>
}

export interface Step<TInput> {
  name: string
  run: (input: TInput, ctx: StepContext) => Promise<void>
  /** Rollback optionnel, appelé si un step ULTÉRIEUR échoue. */
  compensate?: (input: TInput, ctx: StepContext) => Promise<void>
}

export interface WorkflowResult {
  ok: boolean
  error?: string
  /** Erreur d'origine telle que levée par le step (préserve le type, ex. DeployError). */
  errorCause?: unknown
  failedStep?: string
  shared: Record<string, unknown>
}

export interface RunWorkflowOptions {
  /** Appelé après chaque step réussi (pour logs/events de progression). */
  onStepDone?: (stepName: string, index: number, total: number) => void | Promise<void>
}

/**
 * Exécute les steps en séquence. En cas d'échec, rejoue les compensations des
 * steps déjà exécutés (ordre inverse), puis renvoie un résultat d'erreur.
 */
export async function runWorkflow<TInput>(
  workflowName: string,
  steps: Step<TInput>[],
  input: TInput,
  options: RunWorkflowOptions = {},
  initialShared: Record<string, unknown> = {}
): Promise<WorkflowResult> {
  const ctx: StepContext = { shared: initialShared }
  const executed: Step<TInput>[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    try {
      await step.run(input, ctx)
      executed.push(step)
      await options.onStepDone?.(step.name, i + 1, steps.length)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Rollback : compensations en ordre inverse.
      for (const done of [...executed].reverse()) {
        if (done.compensate) {
          try {
            await done.compensate(input, ctx)
          } catch {
            // une compensation qui échoue ne doit pas masquer l'erreur d'origine
          }
        }
      }
      return {
        ok: false,
        error: `[${workflowName}] échec à "${step.name}": ${message}`,
        errorCause: err,
        failedStep: step.name,
        shared: ctx.shared,
      }
    }
  }

  return { ok: true, shared: ctx.shared }
}
