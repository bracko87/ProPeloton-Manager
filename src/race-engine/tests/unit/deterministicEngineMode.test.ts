/**
 * deterministicEngineMode.test.ts
 *
 * Unit coverage for the deterministic race-engine mode contract.
 *
 * No environment access, database access, runner execution, persistence,
 * API route, or scheduler is used.
 */

import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  canDeterministicOutputBecomeAuthoritative,
  canPersistShadowOutput,
  canRunReadOnlyShadow,
  DETERMINISTIC_RACE_ENGINE_MODES,
  getDeterministicEngineCapabilities,
  isDeterministicEngineEnabled,
  parseDeterministicRaceEngineMode,
  resolveDeterministicEngineCapabilities,
  type DeterministicRaceEngineMode,
} from '../../integration/deterministicEngineMode'

describe(
  'deterministicEngineMode',
  () => {
    it(
      'exposes the four supported modes in stable order',
      () => {
        expect(
          DETERMINISTIC_RACE_ENGINE_MODES,
        ).toEqual([
          'disabled',
          'shadow_read_only',
          'shadow_persist_non_authoritative',
          'authoritative',
        ])
      },
    )

    it.each([
      'disabled',
      'shadow_read_only',
      'shadow_persist_non_authoritative',
      'authoritative',
    ] as const)(
      'parses the supported mode %s',
      (mode) => {
        expect(
          parseDeterministicRaceEngineMode(
            mode,
          ),
        ).toBe(mode)
      },
    )

    it(
      'normalizes surrounding whitespace and casing',
      () => {
        expect(
          parseDeterministicRaceEngineMode(
            '  SHADOW_READ_ONLY  ',
          ),
        ).toBe(
          'shadow_read_only',
        )

        expect(
          parseDeterministicRaceEngineMode(
            'Authoritative',
          ),
        ).toBe(
          'authoritative',
        )
      },
    )

    it.each([
      undefined,
      null,
      true,
      false,
      0,
      1,
      {},
      [],
      '',
      'unknown',
      'shadow',
      'enabled',
      'production',
    ])(
      'defaults invalid value %p to disabled',
      (value) => {
        expect(
          parseDeterministicRaceEngineMode(
            value,
          ),
        ).toBe('disabled')
      },
    )

    it.each([
      {
        mode:
          'disabled',
        canRun:
          false,
        canPersist:
          false,
        canBecomeAuthoritative:
          false,
      },
      {
        mode:
          'shadow_read_only',
        canRun:
          true,
        canPersist:
          false,
        canBecomeAuthoritative:
          false,
      },
      {
        mode:
          'shadow_persist_non_authoritative',
        canRun:
          true,
        canPersist:
          true,
        canBecomeAuthoritative:
          false,
      },
      {
        mode:
          'authoritative',
        canRun:
          true,
        canPersist:
          true,
        canBecomeAuthoritative:
          true,
      },
    ] as const)(
      'resolves capabilities for $mode',
      ({
        mode,
        canRun,
        canPersist,
        canBecomeAuthoritative,
      }) => {
        const typedMode:
          DeterministicRaceEngineMode =
            mode

        expect(
          isDeterministicEngineEnabled(
            typedMode,
          ),
        ).toBe(canRun)

        expect(
          canRunReadOnlyShadow(
            typedMode,
          ),
        ).toBe(canRun)

        expect(
          canPersistShadowOutput(
            typedMode,
          ),
        ).toBe(canPersist)

        expect(
          canDeterministicOutputBecomeAuthoritative(
            typedMode,
          ),
        ).toBe(
          canBecomeAuthoritative,
        )

        expect(
          getDeterministicEngineCapabilities(
            typedMode,
          ),
        ).toEqual({
          mode,
          canRun,
          canPersist,
          canBecomeAuthoritative,
        })
      },
    )

    it(
      'resolves invalid runtime configuration to fully disabled capabilities',
      () => {
        expect(
          resolveDeterministicEngineCapabilities(
            'unsupported-mode',
          ),
        ).toEqual({
          mode:
            'disabled',
          canRun:
            false,
          canPersist:
            false,
          canBecomeAuthoritative:
            false,
        })
      },
    )

    it(
      'does not grant authority to the non-authoritative persistence mode',
      () => {
        const capabilities =
          resolveDeterministicEngineCapabilities(
            'shadow_persist_non_authoritative',
          )

        expect(
          capabilities.canRun,
        ).toBe(true)

        expect(
          capabilities.canPersist,
        ).toBe(true)

        expect(
          capabilities
            .canBecomeAuthoritative,
        ).toBe(false)
      },
    )
  },
)
