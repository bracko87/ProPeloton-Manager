/**
 * Breakaway V1 pilot adapter — a strictly non-authoritative comparison
 * boundary. NEVER an alternative official stage solver or worker dispatch.
 *
 * Production stage workers do NOT import this file. The existing accepted
 * solver is invoked exactly once and retains sole official classification.
 * The breakaway-only calculation cannot alter its result or block the finish.
 */
import {
  runSelectedBreakawayPreviewV1,
  selectBreakawayOpportunityStageV1,
  type BreakawayOpportunityInputV1,
  type BreakawayShadowV1,
  type BreakawayStageV1,
} from './breakawayOpportunityEngineV1.ts'

export type BreakawayShadowComparisonV1<Output> = {
  readonly officialResult: Output
  readonly shadowResult: BreakawayShadowV1 | null
  readonly shadowStatus: 'not_selected' | 'evaluated' | 'failed'
  readonly officialResultAuthoritative: true
}

/**
 * The caller must provide a validated mapping from the *actual stage's
 * locked plans and roster* into the experimental input. The adapter never
 * fabricates team tactics or decides official results.
 *
 * No SQL, HTTP, worker invocation, persistence, reward or race-time side effects.
 */
export function runOfficialWithBreakawayShadowV1<
  Input extends { readonly stage: BreakawayStageV1 },
  Output,
>(
  input: Input,
  officialSolver: (input: Input) => Output,
  buildExperimentalInput: (input: Input) => BreakawayOpportunityInputV1,
): BreakawayShadowComparisonV1<Output> {
  const officialResult = officialSolver(input)
  if (!selectBreakawayOpportunityStageV1(input.stage)) {
    return {
      officialResult, shadowResult: null, shadowStatus: 'not_selected',
      officialResultAuthoritative: true,
    }
  }
  try {
    const previewInput = buildExperimentalInput(input)
    if (previewInput.stage.stageId !== input.stage.stageId ||
        previewInput.stage.stageFormat !== input.stage.stageFormat ||
        previewInput.stage.terrainType !== input.stage.terrainType ||
        previewInput.stage.distanceKm !== input.stage.distanceKm) {
      throw new Error('Experimental preview stage does not match official stage')
    }
    const shadowResult = runSelectedBreakawayPreviewV1(previewInput)
    if (shadowResult.status === 'not_selected') {
      throw new Error('Stage unexpectedly not selected for breakaway preview')
    }
    return {
      officialResult, shadowResult, shadowStatus: 'evaluated',
      officialResultAuthoritative: true,
    }
  } catch {
    // A failed read-only preview must never mask or invalidate the accepted
    // official calculation, including an existing replay or prize result.
    return {
      officialResult, shadowResult: null, shadowStatus: 'failed',
      officialResultAuthoritative: true,
    }
  }
}
