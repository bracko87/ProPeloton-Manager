import * as acceptedCore from './runRaceEngine.ts'
import * as mountainCore from './runMountainExperimentalEngineV1.ts'
import * as breakawayCore from './runBreakawayExperimentalEngineV1.ts'
import { isBreakawayOfficialPilotStageV1 } from './breakawayOfficialPilotV1.ts'
import {
  runRaceEngine as runBaselineRaceEngine,
  type UniversalRaceEngineInput,
  type UniversalRaceEngineResult,
} from './runRaceEngine.ts'
import {
  runRaceEngine as runExperimentalMountainCoreV1,
} from './runMountainExperimentalEngineV1.ts'
import { dispatchSelectedRaceEngineV1, selectMountainEngineLaneV1 } from './mountainEngineLaneV1.ts'

export type SelectedCompleteRaceEngineLaneV1 =
  | 'baseline_universal'
  | 'experimental_mountain_v1'
  | 'experimental_breakaway_v1'

/** Single source of truth for both one-shot and checkpointed execution. */
export function selectCompleteRaceEngineLaneV1(
  stage: UniversalRaceEngineInput['stage'],
): SelectedCompleteRaceEngineLaneV1 {
  const mountain = selectMountainEngineLaneV1(stage) === 'experimental_mountain_v1'
  const breakaway = isBreakawayOfficialPilotStageV1(stage)
  if (mountain && breakaway) {
    throw new Error('Stage cannot be eligible for two experimental solvers')
  }
  return mountain ? 'experimental_mountain_v1' :
    breakaway ? 'experimental_breakaway_v1' : 'baseline_universal'
}

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
  if (selectCompleteRaceEngineLaneV1(input.stage) === 'experimental_breakaway_v1') {
    return breakawayCore.runRaceEngine(input)
  }
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
  const lane=selectCompleteRaceEngineLaneV1(stage)
  return lane === 'experimental_mountain_v1' ? mountainCore :
    lane === 'experimental_breakaway_v1' ? breakawayCore : acceptedCore
}
