import * as acceptedCore from './runRaceEngine.ts'
import * as mountainCore from './runMountainExperimentalEngineV1.ts'
import {
  runRaceEngine as runBaselineRaceEngine,
  type UniversalRaceEngineInput,
  type UniversalRaceEngineResult,
} from './runRaceEngine.ts'
import {
  runRaceEngine as runExperimentalMountainCoreV1,
} from './runMountainExperimentalEngineV1.ts'
import { dispatchSelectedRaceEngineV1, selectMountainEngineLaneV1 } from './mountainEngineLaneV1.ts'
import { evaluateSelectedMountainV2Stage, type MountainV2SelectedPreview } from './runSelectedMountainV2Stage.ts'
import { selectMountainV2Stage } from './mountainV2StageRegistry.ts'

/**
 * Stage-scoped executable boundary for the experimental mountain solver.
 *
 * The mountain module is a source-level fork of the accepted race physics at
 * the start of the pilot. Changes to experimental climbing physics may now be
 * made in runMountainExperimentalEngineV1.ts without modifying normal races.
 *
 * No hidden fallback: callers must explicitly handle calculation failures,
 * preserve the usual persistence contracts and verify the selected source.
 */
export function runSelectedRaceEngineV1(
  input: UniversalRaceEngineInput,
): UniversalRaceEngineResult {
  return dispatchSelectedRaceEngineV1(input, {
    baseline: runBaselineRaceEngine,
    experimentalMountain: runExperimentalMountainCoreV1,
  })
}

/**
 * Checkpointed safe-resume workers cannot use runRaceEngine() as a single call:
 * they invoke its exported deterministic phases over multiple Edge requests.
 * This selector provides exactly the same per-stage solver fork as the
 * single-shot dispatcher, so phase1..phase10 and replay cannot mix lanes.
 *
 * The worker must pin every imported source to the same reviewed Git commit
 * and preserve the accepted fallback path independently.
 */
export function getSelectedRaceEngineModuleV1(
  stage: UniversalRaceEngineInput['stage'],
): typeof acceptedCore {
  return selectMountainEngineLaneV1(stage) === 'experimental_mountain_v1'
    ? mountainCore
    : acceptedCore
}

/**
 * Side-effect-free V2 shadow orchestration boundary for future production use.
 *
 * The selected official solver runs ONCE and is never recalculated or changed
 * to accommodate V2. The shadow may fail without rejecting the race. This
 * function does not persist, pay out, dispatch, or update any worker pin.
 *
 * Production checkpointed workers still use their existing source-pinned
 * phase orchestration. Do not deploy this wrapper in place of those workers.
 */
export function runSelectedRaceEngineWithMountainV2Shadow(
  input: UniversalRaceEngineInput,
): {
  readonly official: UniversalRaceEngineResult
  readonly v2: MountainV2SelectedPreview | null
  readonly v2ShadowFailed: boolean
} {
  const official = runSelectedRaceEngineV1(input)
  if (selectMountainV2Stage(input.stage).mode === 'baseline_universal') {
    return { official, v2: null, v2ShadowFailed: false }
  }
  try {
    return { official, v2: evaluateSelectedMountainV2Stage(input), v2ShadowFailed: false }
  } catch {
    // Fail open for THE SHADOW ONLY; never mask or alter the official result.
    // Omit sensitive thrown details from game-visible output.
    return { official, v2: null, v2ShadowFailed: true }
  }
}
