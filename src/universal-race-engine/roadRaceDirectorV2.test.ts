import { describe, expect, it } from 'vitest'

import type {
  UniversalRaceEngineInput,
  UniversalRaceEngineResult,
} from './runRaceEngine.ts'
import {
  applyRoadScenarioFromPrecalculationV2,
  summarizeRoadPrecalculationV2,
} from './roadScenarioPrecalculationV2.ts'

function inputFixture(stageId = 'stage-director-v2'): UniversalRaceEngineInput {
  return {
    race: { raceId: 'race-director-v2' },
    stage: {
      stageId,
      stageFormat: 'road_race',
      terrainType: 'flat',
      distanceKm: 180,
    },
    riders: Array.from({ length: 100 }, (_, index) => ({ riderId: `r${index + 1}` })),
    teams: [],
    stagePlans: [
      {
        teamId: 'team-user',
        metadata: { existing: 'keep-me' },
        riders: [
          {
            riderId: 'r1',
            commands: {
              phase1: 'attack',
              phase2: 'hold_position',
              phase3: 'conserve',
              phase4: 'sprint',
            },
          },
          {
            riderId: 'r2',
            commands: {
              phase1: 'stay_in_peloton',
              phase2: 'control_race',
              phase3: 'protect_leader',
              phase4: 'leadout',
            },
          },
        ],
      },
    ],
  } as unknown as UniversalRaceEngineInput
}

function resultFixture(): UniversalRaceEngineResult {
  const classification = Array.from({ length: 100 }, (_, index) => ({
    riderId: `r${index + 1}`,
    gapSeconds: index < 72 ? 0 : 7,
  }))
  return {
    roadRaceResolution: {
      phase1Opening: {
        breakawayRiderIds: ['r11', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17'],
        openingBreakawaySize: 7,
        firstWaveAttemptKm: 11,
      },
      phase2Development: {
        maximumBreakawayGapSeconds: 315,
        breakawayCatchKm: 151,
        breakawayRiderIdsAtEnd: [],
      },
      phase3Decisive: {
        physicalCatchKm: 151,
        physicalEscapeRiderIdsAtEnd: [],
      },
    },
    calibrationSummary: {
      openingBreakawaySize: 7,
      openingAttackKm: 11,
      maximumBreakawayGapSeconds: 315,
      catchKm: 151,
    },
    finishResolution: { classification },
  } as unknown as UniversalRaceEngineResult
}

describe('Race Director V2 pre-calculation matcher', () => {
  it('turns the natural first pass into simple race-story questions', () => {
    const summary = summarizeRoadPrecalculationV2(inputFixture(), resultFixture())

    expect(summary.breakawayPresent).toBe(true)
    expect(summary.breakSizeBand).toBe('medium')
    expect(summary.formationBand).toBe('early')
    expect(summary.gapBand).toBe('medium')
    expect(summary.caught).toBe(true)
    expect(summary.catchBand).toBe('late')
    expect(summary.durationBand).toBe('long')
    expect(summary.fragmentationBand).toBe('low')
    expect(summary.finishBand).toBe('bunch')
  })

  it('scores templates question by question and selects from a plausible close-match pool', () => {
    const selection = applyRoadScenarioFromPrecalculationV2(
      inputFixture(),
      resultFixture(),
      '2026-09-15',
      [],
    )
    const audit = selection.audit as Record<string, unknown>
    const candidates = audit.candidateScores as Array<Record<string, unknown>>

    expect(audit.directorVersion).toBe('road_race_director_v2')
    expect(typeof audit.templateId).toBe('string')
    expect(Number(audit.weightedSelectionPoolSize)).toBeGreaterThanOrEqual(1)
    expect(candidates.length).toBeGreaterThan(1)
    expect(candidates.some((candidate) => candidate.plausible === true)).toBe(true)
    expect(candidates.every((candidate) => {
      const scores = candidate.questionScores as Record<string, unknown>
      return typeof scores.breakPresence === 'number' &&
        typeof scores.catchOutcome === 'number' &&
        typeof scores.finishStyle === 'number'
    })).toBe(true)
  })

  it('preserves every original rider command and injects zero synthetic tactics', () => {
    const input = inputFixture()
    const commandsBefore = JSON.stringify(input.stagePlans.map((plan) => plan.riders))
    const selection = applyRoadScenarioFromPrecalculationV2(
      input,
      resultFixture(),
      '2026-09-15',
      [],
    )
    const commandsAfter = JSON.stringify(selection.input.stagePlans.map((plan) => plan.riders))
    const audit = selection.audit as Record<string, unknown>
    const directives = audit.appliedDirectives as Record<string, unknown>

    expect(commandsAfter).toBe(commandsBefore)
    expect(directives.syntheticCommands).toBe(0)
    expect(directives.syntheticTeamTactics).toBe(0)
  })

  it('does not reuse the same exact template on the same race/day when alternatives exist', () => {
    const input = inputFixture()
    const first = applyRoadScenarioFromPrecalculationV2(
      input,
      resultFixture(),
      '2026-09-15',
      [],
    )
    const firstAudit = first.audit as Record<string, unknown>
    const firstTemplateId = String(firstAudit.templateId)
    const firstFamily = String(firstAudit.templateFamily)

    const second = applyRoadScenarioFromPrecalculationV2(
      inputFixture('stage-director-v2-b'),
      resultFixture(),
      '2026-09-15',
      [{
        raceId: 'race-director-v2',
        stageId: 'stage-director-v2',
        gameDate: '2026-09-15',
        templateId: firstTemplateId,
        family: firstFamily,
      }],
    )
    const secondAudit = second.audit as Record<string, unknown>

    expect(String(secondAudit.templateId)).not.toBe(firstTemplateId)
  })

  it('is deterministic for the same race/stage while still allowing weighted variation between stages', () => {
    const first = applyRoadScenarioFromPrecalculationV2(
      inputFixture('stable-stage'),
      resultFixture(),
      '2026-09-15',
      [],
    )
    const second = applyRoadScenarioFromPrecalculationV2(
      inputFixture('stable-stage'),
      resultFixture(),
      '2026-09-15',
      [],
    )

    expect((first.audit as Record<string, unknown>).templateId)
      .toBe((second.audit as Record<string, unknown>).templateId)
  })
})
