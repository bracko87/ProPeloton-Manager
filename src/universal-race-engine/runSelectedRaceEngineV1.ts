import {
  runRaceEngine as runBaselineRaceEngine,
  type UniversalRaceEngineInput,
  type UniversalRaceEngineResult,
} from './runRaceEngine.ts'
import {
  runRaceEngine as runExperimentalMountainCoreV1,
} from './runMountainExperimentalEngineV1.ts'
import { selectMountainEngineLaneV1 } from './mountainEngineLaneV1.ts'

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
  if (selectMountainEngineLaneV1(input.stage) === 'experimental_mountain_v1') {
    return runExperimentalMountainCoreV1(input)
  }
  return runBaselineRaceEngine(input)
}
