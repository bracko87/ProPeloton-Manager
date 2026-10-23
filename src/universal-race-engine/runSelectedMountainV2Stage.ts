/**
 * A callable, read-only stage-selective Mountain V2 execution entrypoint.
 * Never invokes the baseline simulation or changes its authoritative result.
 * Checkpointed production workers are not using this experimental entrypoint.
 */
import type { UniversalRaceEngineInput } from './runMountainExperimentalEngineV1.ts'
import { buildMountainV2ShadowAudit, type MountainV2ShadowAudit } from './mountainV2ExperimentalAdapter.ts'
import { selectMountainV2Stage, type MountainV2Selection } from './mountainV2StageRegistry.ts'

export type MountainV2SelectedPreview =
  | { readonly selection: Exclude<MountainV2Selection, {readonly mode:'sandbox_shadow_only'}>; readonly preview: null }
  | { readonly selection: Extract<MountainV2Selection, {readonly mode:'sandbox_shadow_only'}>; readonly preview: MountainV2ShadowAudit }

/** Only explicitly enumerated stages are allowed to execute V2 physics. */
export function evaluateSelectedMountainV2Stage(
  input: UniversalRaceEngineInput,
): MountainV2SelectedPreview {
  const selection = selectMountainV2Stage(input.stage)
  if (selection.mode === 'baseline_universal') return { selection, preview: null }
  return { selection, preview: buildMountainV2ShadowAudit(input) }
}
