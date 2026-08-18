/**
 * runDeterministicShadow.test.ts
 *
 * Unit coverage for the pure deterministic shadow-execution gate.
 *
 * No database access, persistence, API route, scheduler, environment
 * access, or authoritative promotion is used.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  createStageInputFromSourceRows,
  type CreateStageInputFromSourceRowsParams,
} from '../../integration/createStageInputFromSourceRows'
import {
  runDeterministicShadow,
} from '../../integration/runDeterministicShadow'
import {
  createCanonicalHashedValue,
} from '../../simulation/canonicalSerialization'
import {
  rioStage1SourceRows,
} from '../fixtures/rioStage1SourceRows'

function createRioStageInput() {
  const sourceRows:
    CreateStageInputFromSourceRowsParams =
      rioStage1SourceRows

  return createStageInputFromSourceRows(
    sourceRows,
  )
}

describe(
  'runDeterministicShadow',
  () => {
    it(
      'skips execution when mode is disabled',
      () => {
        const stageInput =
          createRioStageInput()

        const result =
          runDeterministicShadow(
            'disabled',
            stageInput,
          )

        expect(result).toEqual({
          status: 'skipped',
          mode: 'disabled',
          reason:
            'deterministic_engine_disabled',
          output: null,
        })
      },
    )

    it.each([
      'shadow_read_only',
      'shadow_persist_non_authoritative',
      'authoritative',
    ] as const)(
      'permits execution in %s mode',
      (mode) => {
        const stageInput =
          createRioStageInput()

        const result =
          runDeterministicShadow(
            mode,
            stageInput,
          )

        expect(
          result.status,
        ).toBe('completed')

        if (
          result.status !==
          'completed'
        ) {
          throw new Error(
            `Expected completed result for ${mode}.`,
          )
        }

        expect(
          result.mode,
        ).toBe(mode)

        expect(
          result.reason,
        ).toBeNull()

        expect(
          result.output
            .finalRiderStates,
        ).toHaveLength(96)

        expect(
          result.output.snapshots,
        ).toHaveLength(395)

        expect(
          result.output.events,
        ).toHaveLength(98)

        expect(
          createCanonicalHashedValue(
            result.output,
          ).hash,
        ).toBe(
          '229fef0b88e36b02',
        )
      },
    )

    it(
      'returns identical output for repeated permitted runs',
      () => {
        const stageInput =
          createRioStageInput()

        const first =
          runDeterministicShadow(
            'shadow_read_only',
            stageInput,
          )

        const second =
          runDeterministicShadow(
            'shadow_read_only',
            stageInput,
          )

        expect(first.status).toBe(
          'completed',
        )

        expect(second.status).toBe(
          'completed',
        )

        if (
          first.status !==
            'completed' ||
          second.status !==
            'completed'
        ) {
          throw new Error(
            'Expected both shadow runs to complete.',
          )
        }

        expect(
          createCanonicalHashedValue(
            first.output,
          ).hash,
        ).toBe(
          createCanonicalHashedValue(
            second.output,
          ).hash,
        )
      },
    )
  },
)