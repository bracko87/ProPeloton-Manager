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
            selectionSeed: 'runtime-v21-seed',
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
              targetFrontGroup: 8,
              targetFrontGroupRange: [6, 10],
              allowRegroup: false,
              finaleType: 'large_bunch_sprint',
              directorV2: {
                storyStrength: 0.82,
                centerPullStrength: 0.27,
                variationFactor: 1,
              },
            },
            runtimeApplicationProof: {
              contract: 'road_race_director_v2_3_runtime',
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

function multiTeamDirectorInput(chasingTeams: number) {
  const input = directorInput(false)
  const basePlan = input.stagePlans[0]
  return {
    ...input,
    stagePlans: Array.from({ length: 8 }, (_, teamIndex) => ({
      ...basePlan,
      metadata: teamIndex === 0 ? basePlan.metadata : {},
      riders: Array.from({ length: 6 }, () => ({
        commands: teamIndex < chasingTeams
          ? { phase1: 'chase_breakaway', phase2: 'chase_breakaway', phase3: 'control_race', phase4: 'control_tempo' }
          : { phase1: 'hold_position', phase2: 'conserve', phase3: 'protect_leader', phase4: 'sprint' },
      })),
    })),
  }
}

describe('Race Director V2.1 runtime story guidance', () => {
  it('protects a real opening move even when it forms just before the preferred template window', () => {
    const input = directorInput(false)
    const adjusted = applyRoadScenarioGapGuidanceV1(input, 6, 4, 1)

    expect(adjusted).toBeGreaterThan(6)
    const proof = getRoadScenarioPhysicalAuditV1(input)?.runtimeApplicationProof as Record<string, unknown>
    const states = proof.generationStates as Record<string, Record<string, unknown>>
    expect(states['1'].state).toBe('forming')
    expect(states['1'].firstSeenKm).toBe(4)
  })

  it('prevents a low-pressure early formation step from collapsing below catch tolerance', () => {
    const input = directorInput(false)
    const adjusted = applyRoadScenarioGapGuidanceV1(input, 0.3, 8, 1)

    expect(adjusted).toBeGreaterThan(0.75)
    const proof = getRoadScenarioPhysicalAuditV1(input)?.runtimeApplicationProof as Record<string, unknown>
    const states = proof.generationStates as Record<string, Record<string, unknown>>
    expect(states['1'].state).toBe('forming')
    expect(states['1'].prematureCatch).not.toBe(true)
  })

  it('protects an underdeveloped established break without creating a fixed gap', () => {
    const input = directorInput(false)
    const adjusted = applyRoadScenarioGapGuidanceV1(input, 55, 38, 1)

    expect(adjusted).toBeGreaterThan(55)
    expect(adjusted).toBeLessThan(100)
  })

  it('a single chasing team weakens protection less than a coordinated multi-team chase', () => {
    const oneTeam = multiTeamDirectorInput(1)
    const fourTeams = multiTeamDirectorInput(4)
    const oneTeamAdjusted = applyRoadScenarioGapGuidanceV1(oneTeam, 55, 38, 1)
    const fourTeamAdjusted = applyRoadScenarioGapGuidanceV1(fourTeams, 55, 38, 1)

    expect(fourTeamAdjusted).toBeLessThan(oneTeamAdjusted)
    expect(oneTeamAdjusted).toBeGreaterThan(55)
  })

  it('real chase commands remain able to override template protection', () => {
    const freeInput = directorInput(false)
    const chaseInput = directorInput(true)
    const freelyAdjusted = applyRoadScenarioGapGuidanceV1(freeInput, 55, 38, 1)
    const chasedAdjusted = applyRoadScenarioGapGuidanceV1(chaseInput, 55, 38, 1)

    expect(chasedAdjusted).toBeLessThan(freelyAdjusted)
  })

  it('never manufactures closure when an oversized gap conflicts with the selected story', () => {
    const input = directorInput(false)
    const adjusted = applyRoadScenarioGapGuidanceV1(input, 520, 132, 1)

    expect(adjusted).toBe(520)
  })

  it('leaves late catch pressure to the physical speed integrator', () => {
    const input = directorInput(false)
    const adjusted = applyRoadScenarioGapGuidanceV1(input, 48, 150, 1)

    expect(adjusted).toBe(48)
  })

  it('accepts a weak physical catch after formation and never reuses the closed generation', () => {
    const input = directorInput(false)
    applyRoadScenarioGapGuidanceV1(input, 12, 6, 1)
    expect(applyRoadScenarioGapGuidanceV1(input, 0.3, 12, 1)).toBe(0.3)

    const proof = getRoadScenarioPhysicalAuditV1(input)?.runtimeApplicationProof as Record<string, unknown>
    const states = proof.generationStates as Record<string, Record<string, unknown>>
    expect(states['1'].state).toBe('caught')
    expect(states['1'].prematureCatch).toBe(true)

    expect(applyRoadScenarioGapGuidanceV1(input, 15, 14, 1)).toBe(15)
    const updatedProof = getRoadScenarioPhysicalAuditV1(input)?.runtimeApplicationProof as Record<string, unknown>
    const updatedStates = updatedProof.generationStates as Record<string, Record<string, unknown>>
    expect(updatedStates['1'].state).toBe('caught')
  })

  it('prevents a credible established break from disappearing in one step far before a late catch window', () => {
    const input = directorInput(false)
    applyRoadScenarioGapGuidanceV1(input, 180, 45, 1)

    const adjusted = applyRoadScenarioGapGuidanceV1(input, 0.3, 90, 1)
    expect(adjusted).toBeGreaterThan(0.5)
    expect(adjusted).toBeLessThanOrEqual(8)

    const proof = getRoadScenarioPhysicalAuditV1(input)?.runtimeApplicationProof as Record<string, unknown>
    const states = proof.generationStates as Record<string, Record<string, unknown>>
    expect(states['1'].state).not.toBe('caught')
    expect(proof.lastGapAdjustmentReason).toBe('prevent_one_step_premature_catch')
  })

  it('lets a coordinated real chase override premature-catch protection', () => {
    const input = multiTeamDirectorInput(8)
    applyRoadScenarioGapGuidanceV1(input, 180, 45, 1)

    expect(applyRoadScenarioGapGuidanceV1(input, 0.3, 90, 1)).toBe(0.3)
    const proof = getRoadScenarioPhysicalAuditV1(input)?.runtimeApplicationProof as Record<string, unknown>
    const states = proof.generationStates as Record<string, Record<string, unknown>>
    expect(states['1'].state).toBe('caught')
  })

  it('never resurrects a break that the physical engine has already caught', () => {
    const input = directorInput(false)

    expect(applyRoadScenarioGapGuidanceV1(input, 0.3, 80, 1)).toBe(0.3)
    expect(applyRoadScenarioGapGuidanceV1(input, 0, 80, 1)).toBe(0)
  })

  it('records proof that the final engine consumed the selected V2.3 template', () => {
    const input = directorInput(false)
    applyRoadScenarioGapGuidanceV1(input, 520, 132, 1)
    const audit = getRoadScenarioPhysicalAuditV1(input)
    const proof = audit?.runtimeApplicationProof as Record<string, unknown>

    expect(proof.contract).toBe('road_race_director_v2_3_runtime')
    expect(proof.finalEngineSawTemplate).toBe(true)
    expect(Number(proof.gapGuidanceCalls)).toBeGreaterThan(0)
    expect(Number(proof.gapAdjustments)).toBe(0)
    expect(proof.lastGapAdjustmentReason).toBeUndefined()
  })

  it('never manufactures finish fragmentation on a flat road stage', () => {
    const input = directorInput(false)
    const states = Array.from({ length: 20 }, (_, index) => ({
      riderId: `r${index + 1}`,
      finalGapSeconds: 0,
      finalGroupCode: 'winning_group',
      energyAtFinish: 100 - index * 2,
    }))
    const adjusted = applyRoadScenarioFinishFragmentationV1(input, states)

    expect(adjusted.every((state) => state.finalGapSeconds === 0)).toBe(true)
  })

  it('keeps front-group targets as audit expectations instead of forcing hilly survivor counts', () => {
    const input = directorInput(false)
    input.stage.terrainType = 'hilly'
    const states = Array.from({ length: 20 }, (_, index) => ({
      riderId: `h${index + 1}`,
      finalGapSeconds: 0,
      finalGroupCode: 'winning_group',
      energyAtFinish: 100 - index * 2,
    }))
    const adjusted = applyRoadScenarioFinishFragmentationV1(input, states)
    const front = adjusted.filter((state) => state.finalGapSeconds <= 0.5)

    expect(front.length).toBeGreaterThan(10)
    expect(front.length).toBeLessThan(20)
    expect(front.some((state) => state.riderId === 'h1')).toBe(true)

    const proof = getRoadScenarioPhysicalAuditV1(input)?.runtimeApplicationProof as Record<string, unknown>
    const topology = proof.fragmentationTopology as Record<string, unknown>
    expect(Number(topology.frontGroupAfter)).toBe(front.length)
    expect(topology.targetFrontGroupRange).toEqual([6, 10])
  })

  it('produces a per-generation adherence audit at finale time', () => {
    const input = directorInput(false)
    applyRoadScenarioGapGuidanceV1(input, 18, 6, 1)
    applyRoadScenarioGapGuidanceV1(input, 290, 45, 1)
    applyRoadScenarioGapGuidanceV1(input, 0.3, 158, 1)

    const states = Array.from({ length: 20 }, (_, index) => ({
      riderId: `a${index + 1}`,
      finalGapSeconds: 0,
      finalGroupCode: 'winning_group',
      energyAtFinish: 100 - index,
    }))
    applyRoadScenarioFinishFragmentationV1(input, states)

    const proof = getRoadScenarioPhysicalAuditV1(input)?.runtimeApplicationProof as Record<string, unknown>
    const adherence = proof.generationAdherence as Array<Record<string, unknown>>
    expect(adherence).toHaveLength(1)
    expect(adherence[0].generation).toBe(1)
    expect(adherence[0].firstSeenKm).toBe(6)
    expect(adherence[0].peakStatus).not.toBe('not_observed')
    expect(Number(proof.generationDeviationCount)).toBeGreaterThanOrEqual(0)
  })
})
