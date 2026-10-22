import {
  isMountainEnginePilotStageV1,
  type MountainEnginePilotStageV1,
} from './mountainEnginePilotV1.ts'

export type SelectedRaceEngineLaneV1 =
  | 'baseline_universal'
  | 'experimental_mountain_v1'

/** Engine selection is a per-stage decision, never a terrain-wide default. */
export function selectMountainEngineLaneV1(
  stage: MountainEnginePilotStageV1,
): SelectedRaceEngineLaneV1 {
  return isMountainEnginePilotStageV1(stage)
    ? 'experimental_mountain_v1'
    : 'baseline_universal'
}

/**
 * Pure, injectible dispatch contract. This is also a safe way of testing that
 * nonpilot races never call experimental code or perform a second calculation.
 */
export function dispatchSelectedRaceEngineV1<Input extends { readonly stage: MountainEnginePilotStageV1 }, Output>(
  input: Input,
  engines: {
    readonly baseline: (input: Input) => Output
    readonly experimentalMountain: (input: Input) => Output
  },
): Output {
  if (selectMountainEngineLaneV1(input.stage) === 'experimental_mountain_v1') {
    return engines.experimentalMountain(input)
  }
  return engines.baseline(input)
}
