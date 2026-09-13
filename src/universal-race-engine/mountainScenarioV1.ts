import type { UniversalRaceEngineInput } from './runRaceEngine.ts'

export const MOUNTAIN_SCENARIO_CATALOG_VERSION = 'mountain_catalog_v1' as const
export const MOUNTAIN_SCENARIO_TYPE = 'mountain' as const

export type MountainNumericRange = readonly [number, number]
export type MountainScenarioFamily =
  | 'mountain_train'
  | 'summit'
  | 'breakaway'
  | 'gc_attack'
  | 'attritional'
  | 'descent'
  | 'dynamic_attack'

export type MountainScenarioFinale =
  | 'gc_group_sprint'
  | 'summit_small_group'
  | 'breakaway_finish'
  | 'solo_finish'
  | 'multi_group_gc'
  | 'open'

export interface MountainScenarioHistoryEntryV1 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly templateId: string
  readonly family: string
  readonly status?: string | null
}

export interface MountainBreakawayDirectiveV1 {
  readonly generation: 1 | 2 | 3
  readonly formationWindowPct: MountainNumericRange
  readonly preferredSize: MountainNumericRange
  readonly targetPeakGapSec: MountainNumericRange
  readonly peakWindowPct: MountainNumericRange
  readonly chaseStartWindowPct?: MountainNumericRange
  readonly catchKmRemaining?: MountainNumericRange
  readonly survivalTargetSec?: MountainNumericRange
}

export interface MountainPhaseDirectiveV1 {
  readonly breakawayRiders: MountainNumericRange
  readonly attackRiders: MountainNumericRange
  readonly controlTeams: MountainNumericRange
  readonly chaseTeams: MountainNumericRange
  readonly lateAttackers: MountainNumericRange
  readonly selectionPressure: 'low' | 'medium' | 'high' | 'very_high'
}

type MountainContextMetric =
  | 'chaseStrength'
  | 'attackDensity'
  | 'bridgeIntent'
  | 'protectLeaderStrength'
  | 'climberDepth'
  | 'gcDepth'
  | 'breakawayQuality'
  | 'fieldStrength'
  | 'averageFatigue'
  | 'fragmentationRisk'
  | 'gcPressure'
  | 'responsibilityConcentration'
  | 'summitFinishSuitability'
  | 'descentRisk'
  | 'rainRisk'

export interface MountainScenarioTemplateV1 {
  readonly id: string
  readonly label: string
  readonly version: 1
  readonly family: MountainScenarioFamily
  readonly similarityGroup: string
  readonly requiresDescentRisk?: boolean
  readonly targets: Readonly<Partial<Record<MountainContextMetric, number>>>
  readonly phases: {
    readonly phase1: MountainPhaseDirectiveV1
    readonly phase2: MountainPhaseDirectiveV1
    readonly phase3: MountainPhaseDirectiveV1
    readonly phase4: MountainPhaseDirectiveV1
  }
  readonly breakaways: readonly MountainBreakawayDirectiveV1[]
  readonly fragmentation: {
    readonly pressure: MountainNumericRange
    readonly targetFrontGroup?: MountainNumericRange
    readonly secondaryGapSec?: MountainNumericRange
    readonly allowRegroup: boolean
  }
  readonly finale: {
    readonly type: MountainScenarioFinale
    readonly expectedFrontGroup?: MountainNumericRange
  }
  readonly deviation: {
    readonly mayConvertToBreakWin: boolean
    readonly mayConvertToCatch: boolean
    readonly commandOverrideAllowed: true
  }
}

export interface MountainScenarioContextV1 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly profile: {
    readonly mountainScore: number
    readonly distanceKm: number
    readonly elevationGainM: number
    readonly flatPct: number
    readonly hillyPct: number
    readonly mountainPct: number
    readonly cobbledPct: number
    readonly profileType: string | null
    readonly finishType: string | null
    readonly summitFinishSuitability: number
  }
  readonly weather: {
    readonly rainRisk: number
    readonly descentRisk: number
  }
  readonly field: {
    readonly starterCount: number
    readonly climberDepth: number
    readonly gcDepth: number
    readonly breakawayQuality: number
    readonly fieldStrength: number
  }
  readonly tactics: {
    readonly chaseStrength: number
    readonly attackDensity: number
    readonly bridgeIntent: number
    readonly protectLeaderStrength: number
    readonly aggressiveTeamCount: number
    readonly controlTeamCount: number
  }
  readonly condition: {
    readonly averageFatigue: number
    readonly fatigueSpread: number
    readonly fragmentationRisk: number
  }
  readonly raceSituation: {
    readonly gcPressure: number
    readonly responsibilityConcentration: number
  }
  readonly history: {
    readonly templatesUsedThisRace: readonly string[]
    readonly familiesUsedThisRace: readonly string[]
    readonly templatesUsedToday: readonly string[]
    readonly familiesUsedToday: readonly string[]
  }
}

export interface MountainScenarioCandidateScoreV1 {
  readonly templateId: string
  readonly family: MountainScenarioFamily
  readonly rawScore: number
  readonly repetitionPenalty: number
  readonly finalScore: number
  readonly excluded: boolean
  readonly exclusionReason: string | null
}

export interface MountainScenarioAuditV1 {
  readonly contract: 'mountain_scenario_selection_v1'
  readonly scenarioType: typeof MOUNTAIN_SCENARIO_TYPE
  readonly catalogVersion: typeof MOUNTAIN_SCENARIO_CATALOG_VERSION
  readonly templateId: string
  readonly templateVersion: 1
  readonly templateLabel: string
  readonly templateFamily: MountainScenarioFamily
  readonly similarityGroup: string
  readonly selectionSeed: string
  readonly compatibilityScore: number
  readonly gameDate: string
  readonly contextSnapshot: MountainScenarioContextV1
  readonly candidateScores: readonly MountainScenarioCandidateScoreV1[]
  readonly generatedParameters: {
    readonly breakaways: readonly {
      readonly generation: number
      readonly preferredSize: number
      readonly targetPeakGapSec: number
      readonly formationPct: number
      readonly peakPct: number
      readonly chaseStartPct: number | null
      readonly catchKmRemaining: number | null
      readonly survivalTargetSec: number | null
    }[]
    readonly fragmentationPressure: number
    readonly targetFrontGroup: number | null
    readonly secondaryGapSec: number | null
  }
  readonly appliedDirectives: {
    readonly syntheticCommands: number
    readonly syntheticTeamTactics: number
    readonly commandAssignments: readonly {
      readonly riderId: string
      readonly teamId: string
      readonly phase: 1 | 2 | 3 | 4
      readonly command: string
      readonly reason: string
    }[]
  }
}

export interface ApplyMountainScenarioOptionsV1 {
  readonly gameDate?: string | null
  readonly phaseCommandRows?: readonly Record<string, unknown>[]
  readonly history?: readonly MountainScenarioHistoryEntryV1[]
}

export interface ApplyMountainScenarioResultV1 {
  readonly input: UniversalRaceEngineInput
  readonly audit: MountainScenarioAuditV1 | null
}

type PhaseNumber = 1 | 2 | 3 | 4
type RiderPlan = UniversalRaceEngineInput['stagePlans'][number]['riders'][number]
type RiderCommands = RiderPlan['commands']
type PhaseCommand = RiderCommands['phase1']
type MountainSelectionProfile = Readonly<Partial<Record<MountainContextMetric, number>>>

const PENALTIES = {
  sameRaceReuse: -45,
  previousFamily: -20,
  sameDayExact: -30,
  sameDayFamilyPerUse: -5,
  sameDayFamilyCap: -15,
} as const

function r(min: number, max: number): MountainNumericRange { return [min, max] }
function p(
  breakawayRiders: MountainNumericRange,
  attackRiders: MountainNumericRange,
  controlTeams: MountainNumericRange,
  chaseTeams: MountainNumericRange,
  lateAttackers: MountainNumericRange,
  selectionPressure: MountainPhaseDirectiveV1['selectionPressure'],
): MountainPhaseDirectiveV1 {
  return { breakawayRiders, attackRiders, controlTeams, chaseTeams, lateAttackers, selectionPressure }
}
function b(
  generation: 1 | 2 | 3,
  formationWindowPct: MountainNumericRange,
  preferredSize: MountainNumericRange,
  targetPeakGapSec: MountainNumericRange,
  peakWindowPct: MountainNumericRange,
  chaseStartWindowPct?: MountainNumericRange,
  catchKmRemaining?: MountainNumericRange,
  survivalTargetSec?: MountainNumericRange,
): MountainBreakawayDirectiveV1 {
  return { generation, formationWindowPct, preferredSize, targetPeakGapSec, peakWindowPct, chaseStartWindowPct, catchKmRemaining, survivalTargetSec }
}
function t(config: Omit<MountainScenarioTemplateV1, 'version' | 'deviation'>): MountainScenarioTemplateV1 {
  return {
    ...config,
    version: 1,
    deviation: { mayConvertToBreakWin: true, mayConvertToCatch: true, commandOverrideAllowed: true },
  }
}

export const MOUNTAIN_SCENARIO_TEMPLATES_V1: readonly MountainScenarioTemplateV1[] = [
  t({ id:'mountain_01_controlled_train_summit', label:'Controlled Mountain Train / Summit Battle', family:'mountain_train', similarityGroup:'controlled_train', targets:{chaseStrength:.82,protectLeaderStrength:.86,climberDepth:.84,gcPressure:.72,summitFinishSuitability:.82}, phases:{phase1:p(r(4,8),r(0,1),r(2,4),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(2,4),r(1,3),r(0,0),'high'),phase3:p(r(0,0),r(1,2),r(2,4),r(2,4),r(0,1),'very_high'),phase4:p(r(0,0),r(2,4),r(1,3),r(2,4),r(1,3),'very_high')}, breakaways:[b(1,r(.02,.14),r(4,8),r(180,420),r(.24,.46),r(.44,.60),r(12,30))], fragmentation:{pressure:r(.72,.90),targetFrontGroup:r(8,24),secondaryGapSec:r(25,120),allowRegroup:false}, finale:{type:'gc_group_sprint',expectedFrontGroup:r(8,24)} }),
  t({ id:'mountain_02_classic_summit_gc_battle', label:'Classic Summit GC Battle', family:'summit', similarityGroup:'summit_gc', targets:{climberDepth:.90,gcDepth:.88,gcPressure:.86,summitFinishSuitability:.95,fragmentationRisk:.80}, phases:{phase1:p(r(4,9),r(0,1),r(1,3),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(2,4),r(1,3),r(0,0),'high'),phase3:p(r(0,0),r(2,4),r(1,3),r(2,4),r(1,2),'very_high'),phase4:p(r(0,0),r(4,7),r(0,2),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.15),r(4,9),r(210,480),r(.26,.50),r(.50,.66),r(8,24))], fragmentation:{pressure:r(.80,.95),targetFrontGroup:r(5,18),secondaryGapSec:r(30,150),allowRegroup:false}, finale:{type:'summit_small_group',expectedFrontGroup:r(5,18)} }),
  t({ id:'mountain_03_breakaway_victory', label:'Mountain Breakaway Victory', family:'breakaway', similarityGroup:'mountain_break_survival', targets:{breakawayQuality:.88,attackDensity:.75,chaseStrength:.30,responsibilityConcentration:.30,gcPressure:.38}, phases:{phase1:p(r(5,12),r(1,3),r(0,1),r(0,0),r(0,0),'high'),phase2:p(r(0,0),r(1,2),r(0,1),r(0,1),r(0,0),'medium'),phase3:p(r(0,0),r(2,4),r(0,1),r(0,2),r(1,2),'high'),phase4:p(r(0,0),r(2,5),r(0,1),r(0,2),r(1,3),'very_high')}, breakaways:[b(1,r(.02,.15),r(5,12),r(360,780),r(.30,.58),r(.62,.80),undefined,r(30,240))], fragmentation:{pressure:r(.70,.90),targetFrontGroup:r(2,7),secondaryGapSec:r(30,160),allowRegroup:false}, finale:{type:'breakaway_finish',expectedFrontGroup:r(2,7)} }),
  t({ id:'mountain_04_strong_climber_break', label:'Strong Climber Break', family:'breakaway', similarityGroup:'quality_break', targets:{breakawayQuality:.94,climberDepth:.90,chaseStrength:.52,attackDensity:.68}, phases:{phase1:p(r(4,8),r(1,2),r(0,2),r(0,1),r(0,0),'high'),phase2:p(r(0,0),r(1,2),r(0,2),r(1,2),r(0,0),'medium'),phase3:p(r(0,0),r(2,4),r(0,2),r(1,3),r(1,2),'very_high'),phase4:p(r(0,0),r(2,5),r(0,1),r(1,3),r(1,3),'very_high')}, breakaways:[b(1,r(.02,.15),r(4,8),r(270,600),r(.28,.54),r(.56,.72),undefined,r(15,150))], fragmentation:{pressure:r(.74,.92),targetFrontGroup:r(1,5),secondaryGapSec:r(25,140),allowRegroup:false}, finale:{type:'breakaway_finish',expectedFrontGroup:r(1,5)} }),
  t({ id:'mountain_05_satellite_rider_bridge', label:'Satellite Rider / Leader Bridge', family:'gc_attack', similarityGroup:'satellite_tactic', targets:{bridgeIntent:.92,attackDensity:.82,gcPressure:.82,protectLeaderStrength:.74,climberDepth:.90}, phases:{phase1:p(r(4,8),r(1,2),r(1,3),r(0,1),r(0,0),'high'),phase2:p(r(0,0),r(1,2),r(1,3),r(1,2),r(0,1),'high'),phase3:p(r(0,0),r(3,5),r(1,2),r(1,3),r(2,3),'very_high'),phase4:p(r(0,0),r(3,6),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.14),r(4,8),r(180,420),r(.22,.44),r(.44,.60),r(20,40))], fragmentation:{pressure:r(.80,.95),targetFrontGroup:r(2,10),secondaryGapSec:r(25,140),allowRegroup:false}, finale:{type:'multi_group_gc',expectedFrontGroup:r(2,10)} }),
  t({ id:'mountain_06_long_range_gc_attack', label:'Long-Range GC Attack', family:'gc_attack', similarityGroup:'long_range_gc', targets:{attackDensity:.90,gcPressure:.92,climberDepth:.94,gcDepth:.92,fragmentationRisk:.84}, phases:{phase1:p(r(4,8),r(0,1),r(1,3),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(1,3),r(1,2),r(0,1),'high'),phase3:p(r(0,0),r(4,7),r(0,2),r(1,3),r(2,4),'very_high'),phase4:p(r(0,0),r(3,6),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.15),r(4,8),r(150,360),r(.22,.42),r(.40,.56),r(30,55))], fragmentation:{pressure:r(.84,.97),targetFrontGroup:r(1,8),secondaryGapSec:r(40,220),allowRegroup:false}, finale:{type:'multi_group_gc',expectedFrontGroup:r(1,8)} }),
  t({ id:'mountain_07_final_climb_solo', label:'Final Climb Solo Attack', family:'summit', similarityGroup:'summit_solo', targets:{climberDepth:.94,gcDepth:.90,summitFinishSuitability:.96,attackDensity:.78,fragmentationRisk:.88}, phases:{phase1:p(r(3,7),r(0,1),r(1,3),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(2,4),r(1,3),r(0,0),'high'),phase3:p(r(0,0),r(1,3),r(2,4),r(2,4),r(1,2),'very_high'),phase4:p(r(0,0),r(4,7),r(0,1),r(1,3),r(3,5),'very_high')}, breakaways:[b(1,r(.02,.14),r(3,7),r(150,360),r(.22,.44),r(.44,.60),r(12,28))], fragmentation:{pressure:r(.88,.98),targetFrontGroup:r(1,1),secondaryGapSec:r(20,130),allowRegroup:false}, finale:{type:'solo_finish',expectedFrontGroup:r(1,1)} }),
  t({ id:'mountain_08_final_climb_small_group', label:'Final Climb Small Group', family:'summit', similarityGroup:'summit_group', targets:{climberDepth:.92,gcDepth:.88,summitFinishSuitability:.92,fragmentationRisk:.82}, phases:{phase1:p(r(3,7),r(0,1),r(1,3),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(2,4),r(1,3),r(0,0),'high'),phase3:p(r(0,0),r(2,4),r(1,3),r(2,4),r(1,2),'very_high'),phase4:p(r(0,0),r(4,7),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.14),r(3,7),r(150,360),r(.22,.44),r(.44,.60),r(10,26))], fragmentation:{pressure:r(.82,.95),targetFrontGroup:r(2,8),secondaryGapSec:r(20,120),allowRegroup:false}, finale:{type:'summit_small_group',expectedFrontGroup:r(2,8)} }),
  t({ id:'mountain_09_gc_group_sprint', label:'Mountain GC Group Sprint', family:'mountain_train', similarityGroup:'gc_group_sprint', targets:{protectLeaderStrength:.88,chaseStrength:.78,gcPressure:.68,climberDepth:.86,attackDensity:.42}, phases:{phase1:p(r(4,8),r(0,1),r(2,4),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(2,4),r(1,3),r(0,0),'high'),phase3:p(r(0,0),r(1,2),r(2,4),r(2,4),r(0,1),'very_high'),phase4:p(r(0,0),r(2,4),r(1,2),r(2,4),r(1,2),'very_high')}, breakaways:[b(1,r(.02,.15),r(4,8),r(180,420),r(.24,.46),r(.44,.60),r(14,30))], fragmentation:{pressure:r(.72,.86),targetFrontGroup:r(8,20),secondaryGapSec:r(20,95),allowRegroup:false}, finale:{type:'gc_group_sprint',expectedFrontGroup:r(8,20)} }),
  t({ id:'mountain_10_train_attrition', label:'Mountain Train Attrition', family:'attritional', similarityGroup:'steady_attrition', targets:{protectLeaderStrength:.82,chaseStrength:.76,averageFatigue:.66,fragmentationRisk:.90,gcDepth:.88}, phases:{phase1:p(r(4,8),r(0,1),r(2,4),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(2,4),r(1,3),r(0,0),'very_high'),phase3:p(r(0,0),r(1,2),r(2,4),r(2,4),r(0,1),'very_high'),phase4:p(r(0,0),r(2,4),r(1,3),r(2,4),r(1,2),'very_high')}, breakaways:[b(1,r(.02,.15),r(4,8),r(150,390),r(.24,.46),r(.44,.60),r(16,32))], fragmentation:{pressure:r(.84,.96),targetFrontGroup:r(10,30),secondaryGapSec:r(35,180),allowRegroup:false}, finale:{type:'multi_group_gc',expectedFrontGroup:r(10,30)} }),
  t({ id:'mountain_11_early_selection_valley_regroup', label:'Early Selection / Valley Regroup', family:'attritional', similarityGroup:'selection_regroup', targets:{fragmentationRisk:.76,attackDensity:.58,chaseStrength:.62,climberDepth:.84}, phases:{phase1:p(r(4,8),r(1,2),r(1,3),r(0,1),r(0,0),'high'),phase2:p(r(0,0),r(2,4),r(1,3),r(1,3),r(0,1),'very_high'),phase3:p(r(0,0),r(1,2),r(1,3),r(1,3),r(0,1),'medium'),phase4:p(r(0,0),r(2,4),r(1,3),r(2,4),r(1,2),'high')}, breakaways:[b(1,r(.02,.14),r(4,8),r(120,330),r(.20,.40),r(.38,.54),r(25,45))], fragmentation:{pressure:r(.58,.76),targetFrontGroup:r(28,60),secondaryGapSec:r(15,70),allowRegroup:true}, finale:{type:'gc_group_sprint',expectedFrontGroup:r(28,60)} }),
  t({ id:'mountain_12_repeated_climb_attacks', label:'Repeated Mountain Attacks', family:'dynamic_attack', similarityGroup:'attack_waves', targets:{attackDensity:.98,bridgeIntent:.92,climberDepth:.90,chaseStrength:.66,gcPressure:.74}, phases:{phase1:p(r(3,7),r(1,3),r(1,2),r(0,1),r(0,0),'high'),phase2:p(r(2,6),r(2,5),r(1,2),r(1,3),r(1,2),'very_high'),phase3:p(r(1,5),r(3,6),r(0,2),r(1,3),r(2,4),'very_high'),phase4:p(r(0,0),r(4,7),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.14),r(3,7),r(90,240),r(.16,.32),r(.28,.42),r(60,90)),b(2,r(.34,.55),r(2,6),r(90,270),r(.44,.62),r(.52,.68),r(28,50)),b(3,r(.60,.78),r(1,5),r(45,180),r(.70,.84),r(.76,.90),r(5,20))], fragmentation:{pressure:r(.84,.97),targetFrontGroup:r(2,12),secondaryGapSec:r(35,210),allowRegroup:false}, finale:{type:'open',expectedFrontGroup:r(2,12)} }),
  t({ id:'mountain_13_two_generation_break', label:'Two-Generation Mountain Break', family:'dynamic_attack', similarityGroup:'multi_break', targets:{attackDensity:.88,bridgeIntent:.80,chaseStrength:.58,climberDepth:.84}, phases:{phase1:p(r(4,8),r(1,2),r(1,2),r(1,2),r(0,0),'high'),phase2:p(r(0,0),r(1,3),r(1,2),r(1,3),r(0,1),'high'),phase3:p(r(3,7),r(2,4),r(0,2),r(1,3),r(1,3),'very_high'),phase4:p(r(0,0),r(2,5),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.14),r(4,8),r(150,360),r(.20,.40),r(.38,.54),r(55,80)),b(2,r(.50,.70),r(3,7),r(90,270),r(.60,.76),r(.68,.82),r(6,22))], fragmentation:{pressure:r(.78,.94),targetFrontGroup:r(3,14),secondaryGapSec:r(30,180),allowRegroup:false}, finale:{type:'open',expectedFrontGroup:r(2,14)} }),
  t({ id:'mountain_14_huge_breakaway', label:'Huge Mountain Breakaway', family:'breakaway', similarityGroup:'large_break', targets:{attackDensity:.86,breakawayQuality:.78,responsibilityConcentration:.40,chaseStrength:.42}, phases:{phase1:p(r(10,18),r(1,3),r(0,1),r(0,0),r(0,0),'high'),phase2:p(r(0,0),r(1,3),r(0,1),r(0,1),r(0,1),'medium'),phase3:p(r(0,0),r(3,6),r(0,1),r(0,2),r(2,4),'very_high'),phase4:p(r(0,0),r(3,6),r(0,1),r(0,2),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.16),r(10,18),r(300,720),r(.30,.58),r(.60,.78),undefined,r(20,210))], fragmentation:{pressure:r(.78,.95),targetFrontGroup:r(2,8),secondaryGapSec:r(30,170),allowRegroup:false}, finale:{type:'breakaway_finish',expectedFrontGroup:r(2,8)} }),
  t({ id:'mountain_15_gc_standoff_break_wins', label:'GC Standoff / Break Wins', family:'breakaway', similarityGroup:'gc_standoff_break', targets:{responsibilityConcentration:.94,chaseStrength:.28,gcPressure:.72,breakawayQuality:.76}, phases:{phase1:p(r(5,10),r(1,2),r(0,1),r(0,0),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(0,1),r(0,1),r(0,0),'low'),phase3:p(r(0,0),r(1,3),r(0,1),r(0,2),r(1,2),'medium'),phase4:p(r(0,0),r(2,4),r(0,1),r(1,2),r(1,3),'high')}, breakaways:[b(1,r(.02,.15),r(5,10),r(360,720),r(.32,.60),r(.70,.84),undefined,r(25,180))], fragmentation:{pressure:r(.70,.90),targetFrontGroup:r(2,6),secondaryGapSec:r(25,130),allowRegroup:false}, finale:{type:'breakaway_finish',expectedFrontGroup:r(2,6)} }),
  t({ id:'mountain_16_gc_standoff_late_attack', label:'GC Standoff / Late Attack', family:'gc_attack', similarityGroup:'gc_standoff_attack', targets:{responsibilityConcentration:.86,chaseStrength:.44,gcPressure:.82,attackDensity:.72}, phases:{phase1:p(r(4,8),r(0,1),r(0,2),r(0,1),r(0,0),'low'),phase2:p(r(0,0),r(0,1),r(0,2),r(1,2),r(0,0),'medium'),phase3:p(r(0,0),r(1,2),r(0,2),r(1,3),r(1,2),'high'),phase4:p(r(0,0),r(4,7),r(0,1),r(1,3),r(3,5),'very_high')}, breakaways:[b(1,r(.02,.15),r(4,8),r(180,420),r(.26,.48),r(.50,.66),r(10,24))], fragmentation:{pressure:r(.82,.95),targetFrontGroup:r(1,8),secondaryGapSec:r(25,140),allowRegroup:false}, finale:{type:'open',expectedFrontGroup:r(1,8)} }),
  t({ id:'mountain_17_penultimate_climb_descent_hold', label:'Penultimate Climb / Descent Hold', family:'descent', similarityGroup:'descent_attack', requiresDescentRisk:true, targets:{descentRisk:.78,attackDensity:.76,gcPressure:.74,climberDepth:.86,fragmentationRisk:.76}, phases:{phase1:p(r(4,8),r(0,1),r(1,3),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(1,3),r(1,3),r(0,1),'high'),phase3:p(r(0,0),r(3,5),r(1,2),r(1,3),r(2,3),'very_high'),phase4:p(r(0,0),r(2,5),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.14),r(4,8),r(150,360),r(.22,.42),r(.42,.58),r(18,34))], fragmentation:{pressure:r(.78,.94),targetFrontGroup:r(2,10),secondaryGapSec:r(20,130),allowRegroup:false}, finale:{type:'open',expectedFrontGroup:r(2,10)} }),
  t({ id:'mountain_18_queen_stage_multi_group', label:'Queen Stage Multi-Group', family:'attritional', similarityGroup:'queen_stage', targets:{fragmentationRisk:.98,averageFatigue:.72,gcPressure:.90,climberDepth:.92,gcDepth:.90}, phases:{phase1:p(r(5,10),r(1,2),r(1,3),r(0,1),r(0,0),'high'),phase2:p(r(0,0),r(1,3),r(1,3),r(1,3),r(1,2),'very_high'),phase3:p(r(0,0),r(3,6),r(1,2),r(2,4),r(2,4),'very_high'),phase4:p(r(0,0),r(4,8),r(0,1),r(1,3),r(3,5),'very_high')}, breakaways:[b(1,r(.02,.15),r(5,10),r(240,540),r(.26,.50),r(.48,.64),r(14,28))], fragmentation:{pressure:r(.92,.99),targetFrontGroup:r(2,8),secondaryGapSec:r(60,360),allowRegroup:false}, finale:{type:'multi_group_gc',expectedFrontGroup:r(2,8)} }),
  t({ id:'mountain_19_extreme_attrition', label:'Extreme Mountain Attrition', family:'attritional', similarityGroup:'extreme_attrition', targets:{averageFatigue:.86,fragmentationRisk:.98,fieldStrength:.78,climberDepth:.88}, phases:{phase1:p(r(4,8),r(0,1),r(1,3),r(0,1),r(0,0),'high'),phase2:p(r(0,0),r(1,2),r(1,3),r(1,3),r(0,1),'very_high'),phase3:p(r(0,0),r(2,4),r(1,2),r(2,4),r(1,3),'very_high'),phase4:p(r(0,0),r(3,6),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.14),r(4,8),r(180,420),r(.24,.46),r(.44,.60),r(16,30))], fragmentation:{pressure:r(.94,.995),targetFrontGroup:r(3,12),secondaryGapSec:r(70,420),allowRegroup:false}, finale:{type:'multi_group_gc',expectedFrontGroup:r(3,12)} }),
  t({ id:'mountain_20_team_isolation_crack', label:'Team Isolation / Major GC Gaps', family:'gc_attack', similarityGroup:'isolation_crack', targets:{gcPressure:.96,attackDensity:.88,protectLeaderStrength:.58,fragmentationRisk:.96,gcDepth:.88}, phases:{phase1:p(r(4,8),r(0,1),r(1,3),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(1,3),r(1,3),r(1,2),'high'),phase3:p(r(0,0),r(3,6),r(1,2),r(2,4),r(2,4),'very_high'),phase4:p(r(0,0),r(4,8),r(0,1),r(1,3),r(3,5),'very_high')}, breakaways:[b(1,r(.02,.14),r(4,8),r(150,360),r(.22,.42),r(.42,.58),r(18,32))], fragmentation:{pressure:r(.90,.99),targetFrontGroup:r(2,10),secondaryGapSec:r(50,300),allowRegroup:false}, finale:{type:'multi_group_gc',expectedFrontGroup:r(2,10)} }),
]

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
function unit(seed: string, key: string): number { return stableHash(`${seed}:${key}`) / 4294967296 }
function clamp(value: number, min = 0, max = 1): number { return Math.min(max, Math.max(min, value)) }
function finite(value: unknown, fallback = 0): number { const n = Number(value); return Number.isFinite(n) ? n : fallback }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function between(seed: string, key: string, range: MountainNumericRange): number { return range[0] + (range[1] - range[0]) * unit(seed, key) }
function integerBetween(seed: string, key: string, range: MountainNumericRange): number {
  const min = Math.ceil(range[0]), max = Math.floor(range[1])
  return max <= min ? min : min + stableHash(`${seed}:${key}`) % (max - min + 1)
}
function average(values: readonly number[], fallback = 0): number { return values.length ? values.reduce((a,b)=>a+b,0) / values.length : fallback }
function normalizedRisk(value: unknown): number {
  const raw = String(value ?? '').trim().toLowerCase()
  if (['extreme','very_high','very high'].includes(raw)) return .95
  if (['high','strong'].includes(raw)) return .78
  if (['medium','moderate'].includes(raw)) return .52
  if (['low','light'].includes(raw)) return .25
  if (['none','minimal'].includes(raw)) return .05
  return .35
}
function normalizeGameDate(value: string | null | undefined): string {
  const raw = text(value); if (!raw) return 'unknown'; return raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? raw
}
function riderMetric(rider: UniversalRaceEngineInput['riders'][number], key: string): number {
  return clamp(finite((rider as unknown as Record<string, unknown>)[key], 50) / 100)
}
function scoreCommand(command: unknown, positives: readonly string[]): number {
  return positives.includes(String(command ?? '').trim().toLowerCase()) ? 1 : 0
}
function scenarioAiControlledTeamIds(input: UniversalRaceEngineInput): ReadonlySet<string> {
  return new Set(input.teams.filter((team)=>team.snapshot.metadata?.scenarioAiControlled === true).map((team)=>team.teamId))
}
function explicitHumanCommands(rows: readonly Record<string, unknown>[], aiTeams: ReadonlySet<string>): ReadonlySet<string> {
  const result = new Set<string>()
  rows.forEach((row)=>{
    const riderId=text(row.rider_id), teamId=text(row.team_id)
    if (!riderId || (teamId && aiTeams.has(teamId))) return
    ;([1,2,3,4] as const).forEach((phase)=>{
      const command=text(row[`phase_${phase}_command`])
      if (command && command !== 'follow_team_plan') result.add(`${riderId}:${phase}`)
    })
  })
  return result
}

function planMetrics(input: UniversalRaceEngineInput) {
  const plans=input.stagePlans
  const commands=plans.flatMap((plan)=>plan.riders.flatMap((rider)=>[rider.commands.phase1,rider.commands.phase2,rider.commands.phase3,rider.commands.phase4]))
  const count=Math.max(1,commands.length)
  const attacks=commands.reduce((sum,c)=>sum+scoreCommand(c,['attack','join_breakaway']),0)/count
  const chase=commands.reduce((sum,c)=>sum+scoreCommand(c,['chase','chase_breakaway','control_race','control_tempo']),0)/count
  const protect=commands.reduce((sum,c)=>sum+scoreCommand(c,['protect_leader','protect_gc','stay_near_front']),0)/count
  const controlTeams=plans.filter((plan)=>['gc_protection','climber_support','balanced','sprint_control'].includes(plan.teamTactic)).length
  const aggressive=plans.filter((plan)=>['aggressive','breakaway'].includes(plan.teamTactic)).length
  return {
    chaseStrength:clamp(chase*1.8),
    attackDensity:clamp(attacks*2.4+(plans.length?aggressive/plans.length:0)*.35),
    bridgeIntent:clamp(attacks*2.2),
    protectLeaderStrength:clamp(protect*2.0),
    aggressiveTeamCount:aggressive,
    controlTeamCount:controlTeams,
  }
}

export function buildMountainScenarioContextV1(input: UniversalRaceEngineInput, options: ApplyMountainScenarioOptionsV1 = {}): MountainScenarioContextV1 {
  const gameDate=normalizeGameDate(options.gameDate)
  const history=options.history ?? []
  const raceHistory=history.filter((h)=>h.raceId===input.race.raceId&&h.stageId!==input.stage.stageId)
  const dayHistory=gameDate==='unknown'?[]:history.filter((h)=>h.gameDate===gameDate&&h.stageId!==input.stage.stageId)
  const tp=input.stage.terrainPercentages
  const mountainPct=finite(tp.mountain,input.stage.terrainType==='mountain'?100:0)
  const hillyPct=finite(tp.hilly,0)
  const distance=Math.max(1,finite(input.stage.distanceKm,1))
  const elevationGain=Math.max(0,finite(input.stage.elevationGainM,0))
  const elevationPerKm=elevationGain/distance
  const climbingDensity=clamp((elevationPerKm-8)/24)
  const summitFinishSuitability=clamp((input.stage.summitFinish||input.stage.finishType==='summit_finish'?1:.28)*.72+climbingDensity*.28)
  const mountainScore=clamp(mountainPct/100*.55+hillyPct/100*.10+climbingDensity*.25+summitFinishSuitability*.10)
  const rainRisk=input.weather?.rainProbabilityPct==null?normalizedRisk(input.weather?.condition):clamp(finite(input.weather.rainProbabilityPct)/100)
  const descentRisk=clamp(normalizedRisk(input.weather?.descentRisk)*.72+rainRisk*.28)
  const climbers=input.riders.map((r)=>average([riderMetric(r,'climbing')*.52,riderMetric(r,'endurance')*.16,riderMetric(r,'resistance')*.14,riderMetric(r,'raceIQ')*.10,riderMetric(r,'overall')*.08])).sort((a,b)=>b-a)
  const gc=input.riders.map((r)=>average([riderMetric(r,'climbing')*.38,riderMetric(r,'endurance')*.17,riderMetric(r,'recovery')*.15,riderMetric(r,'resistance')*.12,riderMetric(r,'raceIQ')*.10,riderMetric(r,'overall')*.08])).sort((a,b)=>b-a)
  const breaks=input.riders.map((r)=>average([riderMetric(r,'climbing')*.34,riderMetric(r,'endurance')*.22,riderMetric(r,'resistance')*.18,riderMetric(r,'raceIQ')*.14,riderMetric(r,'overall')*.08,riderMetric(r,'flat')*.04])).sort((a,b)=>b-a)
  const field=input.riders.map((r)=>riderMetric(r,'overall'))
  const fatigue=input.riders.map((r)=>clamp(finite((r as unknown as Record<string,unknown>).fatigueBeforeStage)/100))
  const metrics=planMetrics(input)
  const climberDepth=average(climbers.slice(0,Math.max(5,Math.ceil(climbers.length*.16))),.5)
  const gcDepth=average(gc.slice(0,Math.max(5,Math.ceil(gc.length*.14))),.5)
  const breakawayQuality=average(breaks.slice(0,Math.max(5,Math.ceil(breaks.length*.16))),.5)
  const fieldStrength=average(field,.5)
  const averageFatigue=average(fatigue,0)
  const fatigueSpread=fatigue.length>1?Math.max(...fatigue)-Math.min(...fatigue):0
  const fragmentationRisk=clamp(climbingDensity*.36+climberDepth*.20+averageFatigue*.18+fatigueSpread*.12+summitFinishSuitability*.14)
  const general=(input.preStageStandings??[]).filter((row)=>row.classificationType==='general')
  const close=general.filter((row)=>finite(row.gapSeconds,99999)<=180).length
  const gcPressure=general.length?clamp(close/Math.min(12,general.length)):.35
  const responsibilityConcentration=clamp(1-Math.min(1,Math.max(1,metrics.controlTeamCount)/Math.max(2,input.stagePlans.length*.35)))
  return {
    raceId:input.race.raceId,stageId:input.stage.stageId,gameDate,
    profile:{mountainScore,distanceKm:distance,elevationGainM:elevationGain,flatPct:finite(tp.flat),hillyPct,mountainPct,cobbledPct:finite(tp.cobbled),profileType:input.stage.profileType??null,finishType:input.stage.finishType??null,summitFinishSuitability},
    weather:{rainRisk,descentRisk},
    field:{starterCount:input.riders.length,climberDepth,gcDepth,breakawayQuality,fieldStrength},
    tactics:metrics,
    condition:{averageFatigue,fatigueSpread,fragmentationRisk},
    raceSituation:{gcPressure,responsibilityConcentration},
    history:{templatesUsedThisRace:raceHistory.map((h)=>h.templateId),familiesUsedThisRace:raceHistory.map((h)=>h.family),templatesUsedToday:dayHistory.map((h)=>h.templateId),familiesUsedToday:dayHistory.map((h)=>h.family)},
  }
}

function metric(context:MountainScenarioContextV1,key:MountainContextMetric):number {
  switch(key){
    case 'chaseStrength':return context.tactics.chaseStrength
    case 'attackDensity':return context.tactics.attackDensity
    case 'bridgeIntent':return context.tactics.bridgeIntent
    case 'protectLeaderStrength':return context.tactics.protectLeaderStrength
    case 'climberDepth':return context.field.climberDepth
    case 'gcDepth':return context.field.gcDepth
    case 'breakawayQuality':return context.field.breakawayQuality
    case 'fieldStrength':return context.field.fieldStrength
    case 'averageFatigue':return context.condition.averageFatigue
    case 'fragmentationRisk':return context.condition.fragmentationRisk
    case 'gcPressure':return context.raceSituation.gcPressure
    case 'responsibilityConcentration':return context.raceSituation.responsibilityConcentration
    case 'summitFinishSuitability':return context.profile.summitFinishSuitability
    case 'descentRisk':return context.weather.descentRisk
    case 'rainRisk':return context.weather.rainRisk
  }
}
function affinity(targets:MountainSelectionProfile,context:MountainScenarioContextV1,keys:readonly MountainContextMetric[]):number {
  const selected=keys.filter((k)=>targets[k]!==undefined)
  return selected.length?average(selected.map((k)=>1-Math.abs(metric(context,k)-finite(targets[k],.5))),.72):.72
}
function rawScore(template:MountainScenarioTemplateV1,context:MountainScenarioContextV1):number {
  if(template.requiresDescentRisk&&context.weather.descentRisk<.50)return -1
  const profile=context.profile.mountainScore*20
  const tactics=affinity(template.targets,context,['chaseStrength','attackDensity','bridgeIntent','protectLeaderStrength'])*25
  const field=affinity(template.targets,context,['climberDepth','gcDepth','breakawayQuality','fieldStrength'])*20
  const race=affinity(template.targets,context,['gcPressure','responsibilityConcentration','summitFinishSuitability'])*15
  const condition=affinity(template.targets,context,['averageFatigue','fragmentationRisk'])*10
  const weather=affinity(template.targets,context,['descentRisk','rainRisk'])*10
  return Number((profile+tactics+field+race+condition+weather).toFixed(4))
}
export function scoreMountainScenarioTemplatesV1(context:MountainScenarioContextV1):readonly MountainScenarioCandidateScoreV1[]{
  const raw=MOUNTAIN_SCENARIO_TEMPLATES_V1.map((template)=>({template,rawScore:rawScore(template,context)}))
  const compatible=raw.filter((e)=>e.rawScore>=42)
  const usedRace=new Set(context.history.templatesUsedThisRace)
  const unused=compatible.some((e)=>!usedRace.has(e.template.id))
  const previousFamily=context.history.familiesUsedThisRace.at(-1)??null
  return raw.map(({template,rawScore})=>{
    if(rawScore<0)return{templateId:template.id,family:template.family,rawScore,repetitionPenalty:0,finalScore:-1,excluded:true,exclusionReason:'hard_requirement_not_met'}
    if(rawScore<42)return{templateId:template.id,family:template.family,rawScore,repetitionPenalty:0,finalScore:rawScore,excluded:true,exclusionReason:'compatibility_below_floor'}
    if(unused&&usedRace.has(template.id))return{templateId:template.id,family:template.family,rawScore,repetitionPenalty:PENALTIES.sameRaceReuse,finalScore:rawScore+PENALTIES.sameRaceReuse,excluded:true,exclusionReason:'same_race_unused_compatible_alternative_exists'}
    let penalty=0
    if(!unused&&usedRace.has(template.id))penalty+=PENALTIES.sameRaceReuse
    if(previousFamily===template.family)penalty+=PENALTIES.previousFamily
    if(context.history.templatesUsedToday.includes(template.id))penalty+=PENALTIES.sameDayExact
    const familyUses=context.history.familiesUsedToday.filter((f)=>f===template.family).length
    penalty+=Math.max(PENALTIES.sameDayFamilyCap,familyUses*PENALTIES.sameDayFamilyPerUse)
    return{templateId:template.id,family:template.family,rawScore,repetitionPenalty:penalty,finalScore:Number((rawScore+penalty).toFixed(4)),excluded:false,exclusionReason:null}
  }).sort((a,b)=>Number(a.excluded)-Number(b.excluded)||b.finalScore-a.finalScore||a.templateId.localeCompare(b.templateId))
}
function selectTemplate(context:MountainScenarioContextV1,seed:string){
  const scores=scoreMountainScenarioTemplatesV1(context)
  const pool=scores.filter((s)=>!s.excluded).slice(0,3)
  const fallback=scores.filter((s)=>s.rawScore>=0).slice(0,3)
  const candidates=pool.length?pool:fallback
  if(!candidates.length)return null
  const draw=unit(seed,'top3_weighted_draw')
  const index=candidates.length===1?0:candidates.length===2?(draw<.625?0:1):(draw<.5?0:draw<.8?1:2)
  const selected=candidates[index]
  const template=MOUNTAIN_SCENARIO_TEMPLATES_V1.find((t)=>t.id===selected.templateId)!
  return{template,selected,scores}
}
function instantiate(template:MountainScenarioTemplateV1,seed:string){
  return{
    breakaways:template.breakaways.map((d,i)=>({generation:d.generation,preferredSize:integerBetween(seed,`break:${i}:size`,d.preferredSize),targetPeakGapSec:Math.round(between(seed,`break:${i}:gap`,d.targetPeakGapSec)),formationPct:Number(between(seed,`break:${i}:formation`,d.formationWindowPct).toFixed(4)),peakPct:Number(between(seed,`break:${i}:peak`,d.peakWindowPct).toFixed(4)),chaseStartPct:d.chaseStartWindowPct?Number(between(seed,`break:${i}:chase`,d.chaseStartWindowPct).toFixed(4)):null,catchKmRemaining:d.catchKmRemaining?Number(between(seed,`break:${i}:catch`,d.catchKmRemaining).toFixed(2)):null,survivalTargetSec:d.survivalTargetSec?Math.round(between(seed,`break:${i}:survival`,d.survivalTargetSec)):null})),
    fragmentationPressure:Number(between(seed,'fragmentation:pressure',template.fragmentation.pressure).toFixed(4)),
    targetFrontGroup:template.fragmentation.targetFrontGroup?integerBetween(seed,'fragmentation:front',template.fragmentation.targetFrontGroup):null,
    secondaryGapSec:template.fragmentation.secondaryGapSec?Math.round(between(seed,'fragmentation:gap',template.fragmentation.secondaryGapSec)):null,
  }
}

function riderScore(input:UniversalRaceEngineInput,riderId:string,mode:'break'|'attack'|'work'|'finish'):number{
  const rider=input.riders.find((r)=>r.riderId===riderId); if(!rider)return-1
  const climb=riderMetric(rider,'climbing'),endurance=riderMetric(rider,'endurance'),recovery=riderMetric(rider,'recovery'),resistance=riderMetric(rider,'resistance'),iq=riderMetric(rider,'raceIQ'),overall=riderMetric(rider,'overall'),teamwork=riderMetric(rider,'teamwork'),sprint=riderMetric(rider,'sprint')
  if(mode==='finish')return climb*.42+resistance*.16+endurance*.14+iq*.12+sprint*.08+overall*.08
  if(mode==='work')return teamwork*.28+endurance*.24+climb*.20+resistance*.14+iq*.08+overall*.06
  if(mode==='attack')return climb*.34+resistance*.20+iq*.18+endurance*.14+recovery*.06+overall*.08
  return climb*.30+endurance*.24+resistance*.18+iq*.14+recovery*.06+overall*.08
}
function ranked(input:UniversalRaceEngineInput,mode:'break'|'attack'|'work'|'finish',seed:string):RiderPlan[]{
  return [...input.stagePlans.flatMap((p)=>p.riders)].sort((a,b)=>riderScore(input,b.riderId,mode)-riderScore(input,a.riderId,mode)||stableHash(`${seed}:${a.riderId}`)-stableHash(`${seed}:${b.riderId}`))
}
function riderTeam(input:UniversalRaceEngineInput,riderId:string):string{return input.stagePlans.find((p)=>p.riders.some((r)=>r.riderId===riderId))?.teamId??''}
function commandFor(commands:RiderCommands,phase:PhaseNumber):PhaseCommand{return phase===1?commands.phase1:phase===2?commands.phase2:phase===3?commands.phase3:commands.phase4 as PhaseCommand}
function setCommand(commands:RiderCommands,phase:PhaseNumber,command:PhaseCommand):RiderCommands{
  if(phase===1)return{...commands,phase1:command};if(phase===2)return{...commands,phase2:command};if(phase===3)return{...commands,phase3:command};return{...commands,phase4:command as RiderCommands['phase4']}
}
function applyDirector(input:UniversalRaceEngineInput,template:MountainScenarioTemplateV1,seed:string,explicit:ReadonlySet<string>,aiTeams:ReadonlySet<string>){
  const assignments:MountainScenarioAuditV1['appliedDirectives']['commandAssignments'][number][]=[]
  let plans=input.stagePlans.map((p)=>({...p,riders:p.riders.map((r)=>({...r,commands:{...r.commands}}))}))
  const breakRank=ranked(input,'break',seed),attackRank=ranked(input,'attack',seed),workRank=ranked(input,'work',seed),finishRank=ranked(input,'finish',seed)
  const teamRanking=[...input.stagePlans].map((p)=>({teamId:p.teamId,score:Math.max(...p.riders.map((r)=>riderScore(input,r.riderId,'finish')),0)})).sort((a,b)=>b.score-a.score).map((x)=>x.teamId)
  const touched=new Map<string,string>()
  const assign=(riderId:string,phase:PhaseNumber,command:PhaseCommand,reason:string)=>{
    if(explicit.has(`${riderId}:${phase}`))return false
    const plan=plans.find((p)=>p.riders.some((r)=>r.riderId===riderId));if(!plan)return false
    const rider=plan.riders.find((r)=>r.riderId===riderId)!;const ai=aiTeams.has(plan.teamId);const current=commandFor(rider.commands,phase)
    if(!ai&&current!=='follow_team_plan')return false
    plans=plans.map((p)=>p.teamId!==plan.teamId?p:{...p,riders:p.riders.map((r)=>r.riderId!==riderId?r:{...r,commands:setCommand(r.commands,phase,command)})})
    assignments.push({riderId,teamId:plan.teamId,phase,command:String(command),reason});return true
  }
  const spread=(rows:readonly RiderPlan[],count:number,phase:PhaseNumber,command:PhaseCommand,reason:string)=>{let n=0;const teams=new Set<string>();for(const rider of rows){if(n>=count)break;const team=riderTeam(input,rider.riderId);if(teams.has(team)&&teams.size<Math.min(count,input.stagePlans.length))continue;if(assign(rider.riderId,phase,command,reason)){teams.add(team);n++}}}
  ;([1,2,3,4] as const).forEach((phase)=>{
    const d=template.phases[`phase${phase}` as const]
    spread(breakRank,integerBetween(seed,`p${phase}:break`,d.breakawayRiders),phase,'join_breakaway' as PhaseCommand,`${template.id}:breakaway`)
    spread(attackRank,integerBetween(seed,`p${phase}:attack`,d.attackRiders)+integerBetween(seed,`p${phase}:late`,d.lateAttackers),phase,'attack' as PhaseCommand,`${template.id}:attack`)
    const control=Math.min(teamRanking.length,integerBetween(seed,`p${phase}:control`,d.controlTeams)),chase=Math.min(teamRanking.length,integerBetween(seed,`p${phase}:chase`,d.chaseTeams))
    teamRanking.slice(0,control).forEach((teamId)=>{const rider=workRank.find((r)=>riderTeam(input,r.riderId)===teamId);if(rider)assign(rider.riderId,phase,'control_race' as PhaseCommand,`${template.id}:control`);touched.set(teamId,'gc_protection')})
    teamRanking.slice(0,chase).forEach((teamId)=>{const rider=workRank.find((r)=>riderTeam(input,r.riderId)===teamId);if(rider)assign(rider.riderId,phase,'chase' as PhaseCommand,`${template.id}:chase`)})
  })
  const breakTeams=new Set(assignments.filter((a)=>a.command==='join_breakaway').map((a)=>a.teamId));breakTeams.forEach((team)=>{if(!touched.has(team))touched.set(team,'breakaway')})
  const attackTeams=new Set(assignments.filter((a)=>a.command==='attack').map((a)=>a.teamId));attackTeams.forEach((team)=>{if(!touched.has(team))touched.set(team,'aggressive')})
  if(['gc_group_sprint','summit_small_group'].includes(template.finale.type)){
    teamRanking.slice(0,Math.min(4,Math.max(1,Math.ceil(input.stagePlans.length*.20)))).forEach((teamId)=>{const rider=finishRank.find((r)=>riderTeam(input,r.riderId)===teamId);if(rider)assign(rider.riderId,4,'final_sprint' as PhaseCommand,`${template.id}:mountain_finish`)})
  }
  let syntheticTeamTactics=0
  plans=plans.map((plan)=>{const desired=touched.get(plan.teamId);if(!desired||(!plan.defaulted&&!aiTeams.has(plan.teamId))||plan.teamTactic===desired)return plan;syntheticTeamTactics++;return{...plan,teamTactic:desired}})
  return{input:{...input,stagePlans:plans},assignments,syntheticTeamTactics}
}

export function applyMountainScenarioV1(input:UniversalRaceEngineInput,options:ApplyMountainScenarioOptionsV1={}):ApplyMountainScenarioResultV1{
  if(input.stage.stageFormat!=='road_race'||input.stage.terrainType!=='mountain')return{input,audit:null}
  const context=buildMountainScenarioContextV1(input,options)
  if(context.profile.mountainScore<.46)return{input,audit:null}
  const seed=`mountain-scenario:${input.race.raceId}:${input.stage.stageId}:${MOUNTAIN_SCENARIO_CATALOG_VERSION}`
  const persisted=(options.history??[]).find((h)=>h.stageId===input.stage.stageId)?.templateId??null
  let selected=selectTemplate(context,seed)
  if(persisted){const template=MOUNTAIN_SCENARIO_TEMPLATES_V1.find((t)=>t.id===persisted);if(template){const scores=scoreMountainScenarioTemplatesV1(context);selected={template,selected:scores.find((s)=>s.templateId===template.id)??{templateId:template.id,family:template.family,rawScore:rawScore(template,context),repetitionPenalty:0,finalScore:rawScore(template,context),excluded:false,exclusionReason:null},scores}}}
  if(!selected)return{input,audit:null}
  const parameters=instantiate(selected.template,seed)
  const aiTeams=scenarioAiControlledTeamIds(input)
  const explicit=explicitHumanCommands(options.phaseCommandRows??[],aiTeams)
  const directed=applyDirector(input,selected.template,seed,explicit,aiTeams)
  const audit:MountainScenarioAuditV1={contract:'mountain_scenario_selection_v1',scenarioType:MOUNTAIN_SCENARIO_TYPE,catalogVersion:MOUNTAIN_SCENARIO_CATALOG_VERSION,templateId:selected.template.id,templateVersion:1,templateLabel:selected.template.label,templateFamily:selected.template.family,similarityGroup:selected.template.similarityGroup,selectionSeed:seed,compatibilityScore:selected.selected.rawScore,gameDate:context.gameDate,contextSnapshot:context,candidateScores:selected.scores,generatedParameters:parameters,appliedDirectives:{syntheticCommands:directed.assignments.length,syntheticTeamTactics:directed.syntheticTeamTactics,commandAssignments:directed.assignments}}
  const stagePlans=directed.input.stagePlans.map((plan,index)=>index===0?({...plan,metadata:{...plan.metadata,mountainScenarioV1:audit as unknown as Record<string,unknown>}}):plan)
  return{input:{...directed.input,stagePlans},audit}
}

export function getMountainScenarioAuditV1(input:UniversalRaceEngineInput):MountainScenarioAuditV1|null{
  const metadata=input.stagePlans[0]?.metadata as unknown as Record<string,unknown>|undefined
  const audit=metadata?.mountainScenarioV1
  return audit&&typeof audit==='object'&&!Array.isArray(audit)?audit as unknown as MountainScenarioAuditV1:null
}
