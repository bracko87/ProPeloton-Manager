import * as acceptedCore from './runRaceEngine.ts'
import * as mountainCore from './runMountainExperimentalEngineV1.ts'
import * as breakawayCore from './runBreakawayExperimentalEngineV1.ts'
import { selectBreakawayOpportunityStageV1 } from './breakawayOpportunityEngineV1.ts'
import {
  runRaceEngine as runBaselineRaceEngine,
  type UniversalRaceEngineInput,
  type UniversalRaceEngineResult,
} from './runRaceEngine.ts'
import {
  runRaceEngine as runExperimentalMountainCoreV1,
} from './runMountainExperimentalEngineV1.ts'
import { dispatchSelectedRaceEngineV1, selectMountainEngineLaneV1 } from './mountainEngineLaneV1.ts'

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
  if (selectBreakawayOpportunityStageV1(input.stage)) {
    if (selectMountainEngineLaneV1(input.stage) === 'experimental_mountain_v1') {
      throw new Error('A race stage cannot select both Mountain V1 and Breakaway V1')
    }
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
  if (selectMountainEngineLaneV1(stage) === 'experimental_mountain_v1') {
    if (selectBreakawayOpportunityStageV1(stage)) {
      throw new Error('A stage cannot use both experimental solver lanes')
    }
    return mountainCore
  }
  return selectBreakawayOpportunityStageV1(stage) ? breakawayCore : acceptedCore
}
