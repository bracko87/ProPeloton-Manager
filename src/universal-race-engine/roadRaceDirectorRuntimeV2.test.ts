import { describe, expect, it } from 'vitest'

import {
  applyRoadScenarioFinishFragmentationV1,
  applyRoadScenarioGapGuidanceV1,
  getRoadScenarioPhysicalAuditV1,
} from './roadScenarioPhysicalDirectorV1.ts'

function directorInput(withUserChase = false) {
  const commands = withUserChase
    ? { phase1: 'chase', phase2: 'chase_breakaway', phase3: 'control_race', phase4: 'control_tempo' }
    : { phase1: 'hold_position', phase2: 'conserve', phase3: 'protect_leader', phase4: 'sprint' }
  return {
    stage: { distanceKm: 180, terrainType: 'flat' },
    stagePlans: [
      {
        metadata: {
          flatScenarioV1: {
            scenarioType: 'flat',
            templateId: 'flat_test_controlled_story',
            templateFamily: 'controlled_sprint',
            selectionSeed: 'runtime-v2-seed',
            generatedParameters: {
              breakaways: [
                {
                  generation: 1,
                  preferredSize: 7,
                  preferredSizeRange: [5, 9],
                  formationPct: 0.05,
                  formationWindowPct: [0.03, 0.09],
                  peakPct: 0.25,
                  peakWindowPct: [0.20, 0.30],
                  targetPeakGapSec: 300,
                  targetPeakGapRangeSec: [240, 360],
                  chaseStartPct: 0.65,
                  chaseStartWindowPct: [0.60, 0.70],
                  catchKmRemaining: 25,
                  catchKmRemainingRange: [20, 35],
                  survivalTargetSec: null,
                  survivalTargetRangeSec: null,
                },
              ],
              phaseBehavior: [
                { phase: 1, pressure: 'low', controlTeams: 0.5, chaseTeams: 0.2 },
                { phase: 2, pressure: 'medium', controlTeams: 1.5, chaseTeams: 1.0 },
                { phase: 3, pressure: 'high', controlTeams: 2.5, chaseTeams: 2.5 },
                { phase: 4, pressure: 'high', controlTeams: 3.0, chaseTeams: 3.5 },
              ],
              fragmentationPressure: 0.68,
              secondaryGapSec: 18,
              allowRegroup: false,
              finaleType: 'large_bunch_sprint',
              directorV2: {
                storyStrength: 0.82,
                centerPullStrength: 0.27,
                variationFactor: 1,
              },
            },
            runtimeApplicationProof: {
              contract: 'road_race_director_v2_runtime',
              finalEngineSawTemplate: false,
              gapGuidanceCalls: 0,
              gapAdjustments: 0,
              fragmentationCalls: 0,
              fragmentationAdjustments: 0,
            },
          },
        },
        riders: Array.from({ length: 8 }, () => ({ commands })),
      },
    ],
  }
}

describe('Race Director V2 runtime story guidance', () => {
  it('protects an underdeveloped early break without creating a fixed gap', () => {
    const input = directorInput(false)
    const adjusted = applyRoadScenarioGapGuidanceV1(input, 55, 38, 1)

    expect(adjusted).toBeGreaterThan(55)
    expect(adjusted).toBeLessThan(100)
  })

  it('real chase commands remain able to override template protection', () => {
    const freeInput = directorInput(false)
    const chaseInput = directorInput(true)
    const freelyAdjusted = applyRoadScenarioGapGuidanceV1(freeInput, 55, 38, 1)
    const chasedAdjusted = applyRoadScenarioGapGuidanceV1(chaseInput, 55, 38, 1)

    expect(chasedAdjusted).toBeLessThan(freelyAdjusted)
  })

  it('increases closure pressure when an oversized gap conflicts with the selected story', () => {
    const input = directorInput(false)
    const adjusted = applyRoadScenarioGapGuidanceV1(input, 520, 132, 1)

    expect(adjusted).toBeLessThan(520)
  })

  it('makes a late catch progressively likely but never snaps a live break directly to zero', () => {
    const input = directorInput(false)
    const adjusted = applyRoadScenarioGapGuidanceV1(input, 48, 150, 1)

    expect(adjusted).toBeLessThan(48)
    expect(adjusted).toBeGreaterThan(0.5)
  })

  it('never resurrects a break that the physical engine has already caught', () => {
    const input = directorInput(false)

    expect(applyRoadScenarioGapGuidanceV1(input, 0.3, 80, 1)).toBe(0.3)
    expect(applyRoadScenarioGapGuidanceV1(input, 0, 80, 1)).toBe(0)
  })

  it('records proof that the final engine actually consumed the selected template', () => {
    const input = directorInput(false)
    applyRoadScenarioGapGuidanceV1(input, 520, 132, 1)
    const audit = getRoadScenarioPhysicalAuditV1(input)
    const proof = audit?.runtimeApplicationProof as Record<string, unknown>

    expect(proof.contract).toBe('road_race_director_v2_runtime')
    expect(proof.finalEngineSawTemplate).toBe(true)
    expect(Number(proof.gapGuidanceCalls)).toBeGreaterThan(0)
    expect(Number(proof.gapAdjustments)).toBeGreaterThan(0)
  })

  it('uses finish energy for broad fragmentation pressure instead of forcing a fixed survivor count', () => {
    const input = directorInput(false)
    const states = Array.from({ length: 20 }, (_, index) => ({
      riderId: `r${index + 1}`,
      finalGapSeconds: 0,
      finalGroupCode: 'winning_group',
      energyAtFinish: 100 - index * 2,
    }))
    const adjusted = applyRoadScenarioFinishFragmentationV1(input, states)
    const front = adjusted.filter((state) => state.finalGapSeconds <= 0.5)

    expect(front.length).toBeGreaterThan(2)
    expect(front.length).toBeLessThan(20)
    expect(front.some((state) => state.riderId === 'r1')).toBe(true)
    expect(adjusted.some((state) => state.finalGapSeconds > 0.5)).toBe(true)
  })
})
