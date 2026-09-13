import type { UniversalRaceEngineInput } from './runRaceEngine.ts'

export const HILLY_SCENARIO_CATALOG_VERSION = 'hilly_catalog_v1' as const
export const HILLY_SCENARIO_TYPE = 'hilly' as const

export type HillyNumericRange = readonly [number, number]
export type HillyScenarioFamily =
  | 'reduced_sprint'
  | 'puncheur'
  | 'breakaway'
  | 'gc_attack'
  | 'attritional'
  | 'descent'
  | 'dynamic_attack'

export type HillyScenarioFinale =
  | 'large_reduced_sprint'
  | 'small_reduced_sprint'
  | 'puncheur_group'
  | 'breakaway_finish'
  | 'solo_finish'
  | 'gc_group'
  | 'open'

export interface HillyScenarioHistoryEntryV1 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly templateId: string
  readonly family: string
  readonly status?: string | null
}

export interface HillyBreakawayDirectiveV1 {
  readonly generation: 1 | 2 | 3
  readonly formationWindowPct: HillyNumericRange
  readonly preferredSize: HillyNumericRange
  readonly targetPeakGapSec: HillyNumericRange
  readonly peakWindowPct: HillyNumericRange
  readonly chaseStartWindowPct?: HillyNumericRange
  readonly catchKmRemaining?: HillyNumericRange
  readonly survivalTargetSec?: HillyNumericRange
}

export interface HillyPhaseDirectiveV1 {
  readonly breakawayRiders: HillyNumericRange
  readonly attackRiders: HillyNumericRange
  readonly controlTeams: HillyNumericRange
  readonly chaseTeams: HillyNumericRange
  readonly lateAttackers: HillyNumericRange
  readonly selectionPressure: 'low' | 'medium' | 'high' | 'very_high'
}

type HillyContextMetric =
  | 'sprintControlStrength'
  | 'chaseStrength'
  | 'attackDensity'
  | 'bridgeIntent'
  | 'protectLeaderStrength'
  | 'puncheurDepth'
  | 'climberDepth'
  | 'sprintDepth'
  | 'breakawayQuality'
  | 'fieldStrength'
  | 'averageFatigue'
  | 'fragmentationRisk'
  | 'gcPressure'
  | 'responsibilityConcentration'
  | 'uphillFinishSuitability'
  | 'descentRisk'
  | 'rainRisk'

export interface HillyScenarioTemplateV1 {
  readonly id: string
  readonly label: string
  readonly version: 1
  readonly family: HillyScenarioFamily
  readonly similarityGroup: string
  readonly requiresDescentRisk?: boolean
  readonly targets: Readonly<Partial<Record<HillyContextMetric, number>>>
  readonly phases: {
    readonly phase1: HillyPhaseDirectiveV1
    readonly phase2: HillyPhaseDirectiveV1
    readonly phase3: HillyPhaseDirectiveV1
    readonly phase4: HillyPhaseDirectiveV1
  }
  readonly breakaways: readonly HillyBreakawayDirectiveV1[]
  readonly fragmentation: {
    readonly pressure: HillyNumericRange
    readonly targetFrontGroup?: HillyNumericRange
    readonly secondaryGapSec?: HillyNumericRange
    readonly allowRegroup: boolean
  }
  readonly finale: {
    readonly type: HillyScenarioFinale
    readonly expectedFrontGroup?: HillyNumericRange
  }
  readonly deviation: {
    readonly mayConvertToBreakWin: boolean
    readonly mayConvertToCatch: boolean
    readonly commandOverrideAllowed: true
  }
}

export interface HillyScenarioContextV1 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly profile: {
    readonly hillyScore: number
    readonly distanceKm: number
    readonly elevationGainM: number
    readonly flatPct: number
    readonly hillyPct: number
    readonly mountainPct: number
    readonly cobbledPct: number
    readonly profileType: string | null
    readonly finishType: string | null
    readonly uphillFinishSuitability: number
  }
  readonly weather: {
    readonly rainRisk: number
    readonly descentRisk: number
  }
  readonly field: {
    readonly starterCount: number
    readonly sprintDepth: number
    readonly puncheurDepth: number
    readonly climberDepth: number
    readonly breakawayQuality: number
    readonly fieldStrength: number
  }
  readonly tactics: {
    readonly sprintControlStrength: number
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

export interface HillyScenarioCandidateScoreV1 {
  readonly templateId: string
  readonly family: HillyScenarioFamily
  readonly rawScore: number
  readonly repetitionPenalty: number
  readonly finalScore: number
  readonly excluded: boolean
  readonly exclusionReason: string | null
}

export interface HillyScenarioAuditV1 {
  readonly contract: 'hilly_scenario_selection_v1'
  readonly scenarioType: typeof HILLY_SCENARIO_TYPE
  readonly catalogVersion: typeof HILLY_SCENARIO_CATALOG_VERSION
  readonly templateId: string
  readonly templateVersion: 1
  readonly templateLabel: string
  readonly templateFamily: HillyScenarioFamily
  readonly similarityGroup: string
  readonly selectionSeed: string
  readonly compatibilityScore: number
  readonly gameDate: string
  readonly contextSnapshot: HillyScenarioContextV1
  readonly candidateScores: readonly HillyScenarioCandidateScoreV1[]
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

export interface ApplyHillyScenarioOptionsV1 {
  readonly gameDate?: string | null
  readonly phaseCommandRows?: readonly Record<string, unknown>[]
  readonly history?: readonly HillyScenarioHistoryEntryV1[]
}

export interface ApplyHillyScenarioResultV1 {
  readonly input: UniversalRaceEngineInput
  readonly audit: HillyScenarioAuditV1 | null
}

type PhaseNumber = 1 | 2 | 3 | 4
type RiderPlan = UniversalRaceEngineInput['stagePlans'][number]['riders'][number]
type RiderCommands = RiderPlan['commands']
type PhaseCommand = RiderCommands['phase1']

type HillySelectionProfile = Readonly<Partial<Record<HillyContextMetric, number>>>

const PENALTIES = {
  sameRaceReuse: -45,
  previousFamily: -20,
  sameDayExact: -30,
  sameDayFamilyPerUse: -5,
  sameDayFamilyCap: -15,
} as const

function r(min: number, max: number): HillyNumericRange { return [min, max] }
function p(
  breakawayRiders: HillyNumericRange,
  attackRiders: HillyNumericRange,
  controlTeams: HillyNumericRange,
  chaseTeams: HillyNumericRange,
  lateAttackers: HillyNumericRange,
  selectionPressure: HillyPhaseDirectiveV1['selectionPressure'],
): HillyPhaseDirectiveV1 {
  return { breakawayRiders, attackRiders, controlTeams, chaseTeams, lateAttackers, selectionPressure }
}
function b(
  generation: 1 | 2 | 3,
  formationWindowPct: HillyNumericRange,
  preferredSize: HillyNumericRange,
  targetPeakGapSec: HillyNumericRange,
  peakWindowPct: HillyNumericRange,
  chaseStartWindowPct?: HillyNumericRange,
  catchKmRemaining?: HillyNumericRange,
  survivalTargetSec?: HillyNumericRange,
): HillyBreakawayDirectiveV1 {
  return { generation, formationWindowPct, preferredSize, targetPeakGapSec, peakWindowPct, chaseStartWindowPct, catchKmRemaining, survivalTargetSec }
}
function t(config: Omit<HillyScenarioTemplateV1, 'version' | 'deviation'>): HillyScenarioTemplateV1 {
  return {
    ...config,
    version: 1,
    deviation: { mayConvertToBreakWin: true, mayConvertToCatch: true, commandOverrideAllowed: true },
  }
}

export const HILLY_SCENARIO_TEMPLATES_V1: readonly HillyScenarioTemplateV1[] = [
  t({ id:'hilly_01_controlled_break_reduced_sprint', label:'Controlled Break / Reduced Sprint', family:'reduced_sprint', similarityGroup:'controlled_reduced', targets:{sprintControlStrength:.75,chaseStrength:.72,puncheurDepth:.72,fragmentationRisk:.48}, phases:{phase1:p(r(3,7),r(0,1),r(1,3),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(1,3),r(1,2),r(0,0),'medium'),phase3:p(r(0,0),r(1,2),r(1,3),r(2,4),r(0,1),'high'),phase4:p(r(0,0),r(1,3),r(1,3),r(2,4),r(1,2),'high')}, breakaways:[b(1,r(.03,.16),r(3,7),r(150,330),r(.24,.46),r(.48,.68),r(8,22))], fragmentation:{pressure:r(.38,.58),targetFrontGroup:r(45,85),secondaryGapSec:r(10,55),allowRegroup:true}, finale:{type:'large_reduced_sprint',expectedFrontGroup:r(45,85)} }),
  t({ id:'hilly_02_long_break_uphill_sprint', label:'Long Break / Uphill Sprint', family:'reduced_sprint', similarityGroup:'late_catch_uphill', targets:{sprintControlStrength:.68,chaseStrength:.62,puncheurDepth:.82,uphillFinishSuitability:.85}, phases:{phase1:p(r(4,8),r(0,1),r(1,2),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(1,2),r(0,2),r(0,0),'low'),phase3:p(r(0,0),r(1,2),r(1,3),r(2,4),r(0,1),'high'),phase4:p(r(0,0),r(2,4),r(1,2),r(2,4),r(1,3),'very_high')}, breakaways:[b(1,r(.02,.15),r(4,8),r(240,480),r(.28,.52),r(.58,.74),r(3,12))], fragmentation:{pressure:r(.48,.68),targetFrontGroup:r(25,60),secondaryGapSec:r(15,80),allowRegroup:false}, finale:{type:'small_reduced_sprint',expectedFrontGroup:r(25,60)} }),
  t({ id:'hilly_03_breakaway_victory', label:'Hilly Breakaway Victory', family:'breakaway', similarityGroup:'break_survival', targets:{breakawayQuality:.82,attackDensity:.72,sprintControlStrength:.32,chaseStrength:.34,responsibilityConcentration:.25}, phases:{phase1:p(r(5,10),r(1,2),r(0,1),r(0,0),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(0,1),r(0,1),r(0,0),'medium'),phase3:p(r(0,0),r(2,4),r(0,1),r(0,2),r(1,2),'high'),phase4:p(r(0,0),r(1,3),r(0,1),r(0,2),r(1,3),'high')}, breakaways:[b(1,r(.02,.16),r(5,10),r(300,660),r(.30,.58),r(.62,.80),undefined,r(20,150))], fragmentation:{pressure:r(.42,.66),targetFrontGroup:r(2,7),secondaryGapSec:r(25,120),allowRegroup:false}, finale:{type:'breakaway_finish',expectedFrontGroup:r(2,7)} }),
  t({ id:'hilly_04_strong_break_gc_chase', label:'Strong Break / GC Chase', family:'breakaway', similarityGroup:'strong_break_gc', targets:{breakawayQuality:.88,gcPressure:.72,chaseStrength:.72,protectLeaderStrength:.68}, phases:{phase1:p(r(5,9),r(1,2),r(0,2),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(1,2),r(1,3),r(0,0),'medium'),phase3:p(r(0,0),r(2,4),r(1,3),r(2,4),r(1,2),'high'),phase4:p(r(0,0),r(2,4),r(1,3),r(3,5),r(1,3),'very_high')}, breakaways:[b(1,r(.03,.17),r(5,9),r(210,450),r(.28,.50),r(.48,.64),r(4,18))], fragmentation:{pressure:r(.52,.72),targetFrontGroup:r(15,45),secondaryGapSec:r(20,95),allowRegroup:false}, finale:{type:'gc_group',expectedFrontGroup:r(15,45)} }),
  t({ id:'hilly_05_early_break_late_puncheur', label:'Early Break / Late Puncheur Attack', family:'puncheur', similarityGroup:'late_puncheur', targets:{puncheurDepth:.88,attackDensity:.68,chaseStrength:.65,uphillFinishSuitability:.72}, phases:{phase1:p(r(3,7),r(0,1),r(1,2),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(1,2),r(1,2),r(0,0),'medium'),phase3:p(r(0,0),r(1,2),r(1,2),r(2,3),r(1,2),'high'),phase4:p(r(0,0),r(3,6),r(0,2),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.03,.15),r(3,7),r(150,330),r(.25,.45),r(.45,.62),r(12,28))], fragmentation:{pressure:r(.50,.72),targetFrontGroup:r(6,25),secondaryGapSec:r(12,70),allowRegroup:false}, finale:{type:'puncheur_group',expectedFrontGroup:r(6,25)} }),
  t({ id:'hilly_06_final_hill_solo', label:'Final Hill Solo Attack', family:'puncheur', similarityGroup:'final_hill_solo', targets:{puncheurDepth:.92,attackDensity:.75,fragmentationRisk:.65,uphillFinishSuitability:.82}, phases:{phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'low'),phase2:p(r(0,0),r(0,1),r(1,2),r(1,2),r(0,0),'medium'),phase3:p(r(0,0),r(1,2),r(1,2),r(2,3),r(0,1),'high'),phase4:p(r(0,0),r(3,5),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.03,.14),r(3,6),r(120,300),r(.22,.43),r(.42,.60),r(15,30))], fragmentation:{pressure:r(.62,.82),targetFrontGroup:r(1,1),secondaryGapSec:r(8,55),allowRegroup:false}, finale:{type:'solo_finish',expectedFrontGroup:r(1,1)} }),
  t({ id:'hilly_07_final_hill_small_group', label:'Final Hill Small Group', family:'puncheur', similarityGroup:'final_hill_group', targets:{puncheurDepth:.90,climberDepth:.70,fragmentationRisk:.72,gcPressure:.55}, phases:{phase1:p(r(3,7),r(0,1),r(1,2),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(1,2),r(1,2),r(0,0),'medium'),phase3:p(r(0,0),r(1,3),r(1,2),r(2,3),r(1,2),'high'),phase4:p(r(0,0),r(4,7),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.15),r(3,7),r(150,330),r(.25,.46),r(.46,.62),r(10,25))], fragmentation:{pressure:r(.68,.86),targetFrontGroup:r(4,12),secondaryGapSec:r(12,85),allowRegroup:false}, finale:{type:'puncheur_group',expectedFrontGroup:r(4,12)} }),
  t({ id:'hilly_08_over_the_top_attack', label:'Attack Over the Top', family:'puncheur', similarityGroup:'crest_attack', targets:{attackDensity:.78,puncheurDepth:.82,fragmentationRisk:.64,descentRisk:.45}, phases:{phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(1,2),r(1,2),r(0,0),'medium'),phase3:p(r(0,0),r(2,4),r(1,2),r(2,3),r(1,2),'high'),phase4:p(r(0,0),r(3,6),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.03,.16),r(3,6),r(120,300),r(.22,.44),r(.44,.61),r(18,35))], fragmentation:{pressure:r(.58,.78),targetFrontGroup:r(3,18),secondaryGapSec:r(10,70),allowRegroup:false}, finale:{type:'puncheur_group',expectedFrontGroup:r(3,18)} }),
  t({ id:'hilly_09_descent_attack', label:'Descent Attack', family:'descent', similarityGroup:'descent_decisive', requiresDescentRisk:true, targets:{descentRisk:.78,puncheurDepth:.72,attackDensity:.68,fragmentationRisk:.58}, phases:{phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(1,2),r(1,2),r(0,0),'medium'),phase3:p(r(0,0),r(1,3),r(1,2),r(2,3),r(1,2),'high'),phase4:p(r(0,0),r(2,5),r(0,1),r(1,2),r(2,4),'very_high')}, breakaways:[b(1,r(.03,.16),r(3,6),r(120,300),r(.24,.46),r(.46,.62),r(12,28))], fragmentation:{pressure:r(.52,.74),targetFrontGroup:r(2,14),secondaryGapSec:r(10,80),allowRegroup:false}, finale:{type:'open',expectedFrontGroup:r(2,14)} }),
  t({ id:'hilly_10_repeated_rolling_attacks', label:'Repeated Rolling Attacks', family:'dynamic_attack', similarityGroup:'attack_waves', targets:{attackDensity:.95,bridgeIntent:.85,puncheurDepth:.78,chaseStrength:.68}, phases:{phase1:p(r(2,5),r(2,4),r(1,2),r(1,2),r(0,0),'high'),phase2:p(r(2,6),r(2,5),r(1,2),r(1,3),r(1,2),'high'),phase3:p(r(1,5),r(3,6),r(0,2),r(1,3),r(1,3),'very_high'),phase4:p(r(0,0),r(3,6),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.16),r(2,5),r(45,150),r(.14,.30),r(.24,.38),r(55,85)),b(2,r(.30,.52),r(2,6),r(60,210),r(.40,.58),r(.48,.66),r(25,50)),b(3,r(.58,.78),r(1,5),r(30,150),r(.68,.82),r(.74,.88),r(5,22))], fragmentation:{pressure:r(.58,.82),targetFrontGroup:r(15,55),secondaryGapSec:r(10,95),allowRegroup:false}, finale:{type:'open',expectedFrontGroup:r(2,55)} }),
  t({ id:'hilly_11_three_generation_break', label:'Three-Generation Hilly Break', family:'dynamic_attack', similarityGroup:'multi_break', targets:{attackDensity:.92,bridgeIntent:.82,chaseStrength:.60,puncheurDepth:.72}, phases:{phase1:p(r(3,6),r(1,2),r(1,2),r(1,2),r(0,0),'high'),phase2:p(r(3,7),r(1,3),r(1,2),r(1,3),r(0,1),'high'),phase3:p(r(2,6),r(2,4),r(0,2),r(1,3),r(1,2),'very_high'),phase4:p(r(0,0),r(2,5),r(0,1),r(1,3),r(1,3),'very_high')}, breakaways:[b(1,r(.02,.14),r(3,6),r(75,210),r(.14,.30),r(.25,.40),r(60,90)),b(2,r(.28,.50),r(3,7),r(90,270),r(.40,.58),r(.48,.66),r(30,55)),b(3,r(.56,.76),r(2,6),r(45,180),r(.66,.82),r(.74,.88),r(5,20))], fragmentation:{pressure:r(.56,.80),targetFrontGroup:r(10,45),secondaryGapSec:r(12,100),allowRegroup:false}, finale:{type:'open',expectedFrontGroup:r(2,45)} }),
  t({ id:'hilly_12_gc_team_controlled', label:'GC Team Controlled Hilly Stage', family:'gc_attack', similarityGroup:'gc_control', targets:{gcPressure:.82,protectLeaderStrength:.88,chaseStrength:.78,attackDensity:.35}, phases:{phase1:p(r(3,6),r(0,1),r(2,4),r(0,1),r(0,0),'low'),phase2:p(r(0,0),r(0,1),r(2,4),r(1,3),r(0,0),'medium'),phase3:p(r(0,0),r(1,2),r(2,4),r(2,4),r(0,1),'high'),phase4:p(r(0,0),r(2,4),r(1,3),r(2,4),r(1,3),'very_high')}, breakaways:[b(1,r(.03,.15),r(3,6),r(150,360),r(.24,.47),r(.45,.62),r(12,28))], fragmentation:{pressure:r(.50,.70),targetFrontGroup:r(18,45),secondaryGapSec:r(12,65),allowRegroup:false}, finale:{type:'gc_group',expectedFrontGroup:r(18,45)} }),
  t({ id:'hilly_13_gc_skirmish_regroup', label:'GC Skirmish / Regroup', family:'gc_attack', similarityGroup:'gc_regroup', targets:{gcPressure:.78,attackDensity:.68,protectLeaderStrength:.72,fragmentationRisk:.55}, phases:{phase1:p(r(3,6),r(0,1),r(1,3),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(1,3),r(1,3),r(0,1),'medium'),phase3:p(r(0,0),r(3,5),r(1,2),r(2,4),r(1,2),'very_high'),phase4:p(r(0,0),r(2,4),r(1,2),r(2,4),r(1,2),'high')}, breakaways:[b(1,r(.03,.15),r(3,6),r(120,300),r(.22,.44),r(.44,.60),r(15,32))], fragmentation:{pressure:r(.52,.70),targetFrontGroup:r(35,75),secondaryGapSec:r(8,45),allowRegroup:true}, finale:{type:'large_reduced_sprint',expectedFrontGroup:r(35,75)} }),
  t({ id:'hilly_14_gc_split_holds', label:'GC Split Holds', family:'gc_attack', similarityGroup:'gc_split', targets:{gcPressure:.92,attackDensity:.75,fragmentationRisk:.78,climberDepth:.75}, phases:{phase1:p(r(3,6),r(0,1),r(1,3),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(1,3),r(1,3),r(0,1),'high'),phase3:p(r(0,0),r(3,6),r(1,2),r(2,4),r(1,3),'very_high'),phase4:p(r(0,0),r(3,6),r(0,1),r(2,4),r(2,4),'very_high')}, breakaways:[b(1,r(.03,.15),r(3,6),r(120,300),r(.22,.43),r(.43,.58),r(18,35))], fragmentation:{pressure:r(.72,.90),targetFrontGroup:r(8,25),secondaryGapSec:r(20,120),allowRegroup:false}, finale:{type:'gc_group',expectedFrontGroup:r(8,25)} }),
  t({ id:'hilly_15_attritional_hilly', label:'Attritional Hilly Race', family:'attritional', similarityGroup:'steady_attrition', targets:{averageFatigue:.72,fragmentationRisk:.82,fieldStrength:.72,chaseStrength:.58}, phases:{phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(1,3),r(1,3),r(0,0),'high'),phase3:p(r(0,0),r(1,2),r(1,3),r(2,4),r(0,1),'very_high'),phase4:p(r(0,0),r(2,4),r(1,2),r(2,4),r(1,2),'very_high')}, breakaways:[b(1,r(.03,.15),r(3,6),r(120,330),r(.22,.44),r(.44,.61),r(15,30))], fragmentation:{pressure:r(.74,.92),targetFrontGroup:r(20,55),secondaryGapSec:r(20,150),allowRegroup:false}, finale:{type:'small_reduced_sprint',expectedFrontGroup:r(20,55)} }),
  t({ id:'hilly_16_early_selection_regroup', label:'Early Selection / Late Regroup', family:'attritional', similarityGroup:'selection_regroup', targets:{fragmentationRisk:.68,attackDensity:.58,chaseStrength:.62,puncheurDepth:.68}, phases:{phase1:p(r(3,6),r(1,2),r(1,2),r(0,1),r(0,0),'high'),phase2:p(r(0,0),r(2,4),r(1,2),r(1,3),r(0,1),'very_high'),phase3:p(r(0,0),r(1,2),r(1,3),r(1,3),r(0,1),'medium'),phase4:p(r(0,0),r(1,3),r(1,3),r(2,4),r(1,2),'high')}, breakaways:[b(1,r(.02,.14),r(3,6),r(90,270),r(.18,.38),r(.38,.54),r(22,40))], fragmentation:{pressure:r(.52,.70),targetFrontGroup:r(50,95),secondaryGapSec:r(8,45),allowRegroup:true}, finale:{type:'large_reduced_sprint',expectedFrontGroup:r(50,95)} }),
  t({ id:'hilly_17_late_reduced_sprint', label:'Late Reduced Sprint', family:'reduced_sprint', similarityGroup:'late_selection_sprint', targets:{sprintDepth:.72,puncheurDepth:.78,sprintControlStrength:.65,fragmentationRisk:.66}, phases:{phase1:p(r(3,6),r(0,1),r(1,3),r(0,1),r(0,0),'low'),phase2:p(r(0,0),r(0,1),r(1,3),r(1,2),r(0,0),'medium'),phase3:p(r(0,0),r(1,2),r(1,3),r(2,4),r(0,1),'high'),phase4:p(r(0,0),r(2,5),r(1,2),r(2,4),r(1,3),'very_high')}, breakaways:[b(1,r(.03,.15),r(3,6),r(120,300),r(.24,.44),r(.44,.60),r(12,28))], fragmentation:{pressure:r(.62,.80),targetFrontGroup:r(20,50),secondaryGapSec:r(12,75),allowRegroup:false}, finale:{type:'small_reduced_sprint',expectedFrontGroup:r(20,50)} }),
  t({ id:'hilly_18_tactical_standoff', label:'Tactical Standoff', family:'breakaway', similarityGroup:'standoff_break', targets:{responsibilityConcentration:.90,sprintControlStrength:.30,chaseStrength:.32,breakawayQuality:.72}, phases:{phase1:p(r(4,8),r(1,2),r(0,1),r(0,0),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(0,1),r(0,1),r(0,0),'low'),phase3:p(r(0,0),r(1,3),r(0,1),r(1,2),r(1,2),'medium'),phase4:p(r(0,0),r(1,3),r(0,1),r(2,4),r(1,3),'high')}, breakaways:[b(1,r(.02,.15),r(4,8),r(300,600),r(.32,.58),r(.68,.84),undefined,r(5,90))], fragmentation:{pressure:r(.46,.70),targetFrontGroup:r(2,8),secondaryGapSec:r(15,95),allowRegroup:false}, finale:{type:'breakaway_finish',expectedFrontGroup:r(2,8)} }),
  t({ id:'hilly_19_sprint_control_puncheur_counter', label:'Sprint Control / Puncheur Counter', family:'puncheur', similarityGroup:'counter_after_control', targets:{sprintControlStrength:.82,chaseStrength:.80,puncheurDepth:.85,attackDensity:.65}, phases:{phase1:p(r(3,6),r(0,1),r(2,4),r(0,1),r(0,0),'low'),phase2:p(r(0,0),r(0,1),r(2,4),r(1,3),r(0,0),'medium'),phase3:p(r(0,0),r(1,2),r(2,4),r(2,4),r(0,1),'high'),phase4:p(r(0,0),r(4,7),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.03,.14),r(3,6),r(120,270),r(.20,.40),r(.40,.56),r(18,32))], fragmentation:{pressure:r(.58,.78),targetFrontGroup:r(5,25),secondaryGapSec:r(10,75),allowRegroup:false}, finale:{type:'puncheur_group',expectedFrontGroup:r(5,25)} }),
  t({ id:'hilly_20_chaotic_multi_group_finale', label:'Chaotic Multi-Group Finale', family:'dynamic_attack', similarityGroup:'chaotic_finale', targets:{attackDensity:.92,bridgeIntent:.88,fragmentationRisk:.88,gcPressure:.62,puncheurDepth:.80}, phases:{phase1:p(r(3,7),r(1,3),r(1,2),r(0,1),r(0,0),'high'),phase2:p(r(0,3),r(2,4),r(1,2),r(1,3),r(1,2),'high'),phase3:p(r(0,3),r(3,6),r(0,2),r(1,3),r(2,4),'very_high'),phase4:p(r(0,0),r(4,8),r(0,1),r(1,3),r(3,5),'very_high')}, breakaways:[b(1,r(.02,.15),r(3,7),r(120,300),r(.22,.42),r(.42,.58),r(20,36)),b(2,r(.48,.68),r(2,6),r(45,180),r(.58,.74),r(.64,.78),r(8,22))], fragmentation:{pressure:r(.78,.95),targetFrontGroup:r(3,18),secondaryGapSec:r(20,150),allowRegroup:false}, finale:{type:'open',expectedFrontGroup:r(2,18)} }),
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
function between(seed: string, key: string, range: HillyNumericRange): number { return range[0] + (range[1] - range[0]) * unit(seed, key) }
function integerBetween(seed: string, key: string, range: HillyNumericRange): number {
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
  const sprintTeams=plans.filter((plan)=>plan.teamTactic==='sprint_control').length
  const controlTeams=plans.filter((plan)=>['sprint_control','gc_protection','climber_support'].includes(plan.teamTactic)).length
  const aggressive=plans.filter((plan)=>['aggressive','breakaway'].includes(plan.teamTactic)).length
  return {
    sprintControlStrength:clamp((plans.length?sprintTeams/plans.length:0)*.60+chase*.40),
    chaseStrength:clamp(chase*1.8),
    attackDensity:clamp(attacks*2.4+(plans.length?aggressive/plans.length:0)*.35),
    bridgeIntent:clamp(attacks*2.2),
    protectLeaderStrength:clamp(protect*2.0),
    aggressiveTeamCount:aggressive,
    controlTeamCount:controlTeams,
  }
}

export function buildHillyScenarioContextV1(input: UniversalRaceEngineInput, options: ApplyHillyScenarioOptionsV1 = {}): HillyScenarioContextV1 {
  const gameDate=normalizeGameDate(options.gameDate)
  const history=options.history ?? []
  const raceHistory=history.filter((h)=>h.raceId===input.race.raceId&&h.stageId!==input.stage.stageId)
  const dayHistory=gameDate==='unknown'?[]:history.filter((h)=>h.gameDate===gameDate&&h.stageId!==input.stage.stageId)
  const tp=input.stage.terrainPercentages
  const hillyPct=finite(tp.hilly,input.stage.terrainType==='hilly'?100:0)
  const mountainPct=finite(tp.mountain,0)
  const elevationPerKm=finite(input.stage.elevationGainM)/Math.max(1,finite(input.stage.distanceKm))
  const elevationSuitability=clamp((elevationPerKm-4)/18)
  const hillyScore=clamp(hillyPct/100*.58+finite(tp.flat)/100*.10+(1-mountainPct/100)*.12+elevationSuitability*.20)
  const finish=(input.stage.finishType ?? '').toLowerCase()
  const uphillFinishSuitability=clamp((/uphill|summit|climb|hill/.test(finish)?1:.35)*.70+elevationSuitability*.30)
  const rainRisk=input.weather?.rainProbabilityPct==null?normalizedRisk(input.weather?.condition):clamp(finite(input.weather.rainProbabilityPct)/100)
  const descentRisk=clamp(normalizedRisk(input.weather?.descentRisk)*.72+rainRisk*.28)
  const sprint=input.riders.map((r)=>riderMetric(r,'sprint')).sort((a,b)=>b-a)
  const punch=input.riders.map((r)=>average([riderMetric(r,'climbing')*.30,riderMetric(r,'flat')*.18,riderMetric(r,'resistance')*.18,riderMetric(r,'raceIQ')*.14,riderMetric(r,'sprint')*.12,riderMetric(r,'endurance')*.08])).sort((a,b)=>b-a)
  const climbers=input.riders.map((r)=>average([riderMetric(r,'climbing')*.48,riderMetric(r,'endurance')*.18,riderMetric(r,'resistance')*.16,riderMetric(r,'raceIQ')*.10,riderMetric(r,'overall')*.08])).sort((a,b)=>b-a)
  const breaks=input.riders.map((r)=>average([riderMetric(r,'climbing')*.24,riderMetric(r,'flat')*.12,riderMetric(r,'endurance')*.24,riderMetric(r,'resistance')*.18,riderMetric(r,'raceIQ')*.14,riderMetric(r,'overall')*.08])).sort((a,b)=>b-a)
  const field=input.riders.map((r)=>riderMetric(r,'overall'))
  const fatigue=input.riders.map((r)=>clamp(finite((r as unknown as Record<string,unknown>).fatigueBeforeStage)/100))
  const metrics=planMetrics(input)
  const sprintDepth=average(sprint.slice(0,Math.max(3,Math.ceil(sprint.length*.12))),.5)
  const puncheurDepth=average(punch.slice(0,Math.max(5,Math.ceil(punch.length*.16))),.5)
  const climberDepth=average(climbers.slice(0,Math.max(5,Math.ceil(climbers.length*.14))),.5)
  const breakawayQuality=average(breaks.slice(0,Math.max(5,Math.ceil(breaks.length*.16))),.5)
  const fieldStrength=average(field,.5)
  const averageFatigue=average(fatigue,0)
  const fatigueSpread=fatigue.length>1?Math.max(...fatigue)-Math.min(...fatigue):0
  const fragmentationRisk=clamp(elevationSuitability*.35+puncheurDepth*.18+averageFatigue*.20+fatigueSpread*.12+descentRisk*.15)
  const general=(input.preStageStandings??[]).filter((row)=>row.classificationType==='general')
  const close=general.filter((row)=>finite(row.gapSeconds,99999)<=120).length
  const gcPressure=general.length?clamp(close/Math.min(12,general.length)):.25
  const responsibilityConcentration=clamp(1-Math.min(1,Math.max(1,metrics.controlTeamCount)/Math.max(2,input.stagePlans.length*.35)))
  return {
    raceId:input.race.raceId,stageId:input.stage.stageId,gameDate,
    profile:{hillyScore,distanceKm:finite(input.stage.distanceKm),elevationGainM:finite(input.stage.elevationGainM),flatPct:finite(tp.flat),hillyPct,mountainPct,cobbledPct:finite(tp.cobbled),profileType:input.stage.profileType??null,finishType:input.stage.finishType??null,uphillFinishSuitability},
    weather:{rainRisk,descentRisk},
    field:{starterCount:input.riders.length,sprintDepth,puncheurDepth,climberDepth,breakawayQuality,fieldStrength},
    tactics:metrics,
    condition:{averageFatigue,fatigueSpread,fragmentationRisk},
    raceSituation:{gcPressure,responsibilityConcentration},
    history:{templatesUsedThisRace:raceHistory.map((h)=>h.templateId),familiesUsedThisRace:raceHistory.map((h)=>h.family),templatesUsedToday:dayHistory.map((h)=>h.templateId),familiesUsedToday:dayHistory.map((h)=>h.family)},
  }
}

function metric(context:HillyScenarioContextV1,key:HillyContextMetric):number {
  switch(key){
    case 'sprintControlStrength':return context.tactics.sprintControlStrength
    case 'chaseStrength':return context.tactics.chaseStrength
    case 'attackDensity':return context.tactics.attackDensity
    case 'bridgeIntent':return context.tactics.bridgeIntent
    case 'protectLeaderStrength':return context.tactics.protectLeaderStrength
    case 'puncheurDepth':return context.field.puncheurDepth
    case 'climberDepth':return context.field.climberDepth
    case 'sprintDepth':return context.field.sprintDepth
    case 'breakawayQuality':return context.field.breakawayQuality
    case 'fieldStrength':return context.field.fieldStrength
    case 'averageFatigue':return context.condition.averageFatigue
    case 'fragmentationRisk':return context.condition.fragmentationRisk
    case 'gcPressure':return context.raceSituation.gcPressure
    case 'responsibilityConcentration':return context.raceSituation.responsibilityConcentration
    case 'uphillFinishSuitability':return context.profile.uphillFinishSuitability
    case 'descentRisk':return context.weather.descentRisk
    case 'rainRisk':return context.weather.rainRisk
  }
}
function affinity(targets:HillySelectionProfile,context:HillyScenarioContextV1,keys:readonly HillyContextMetric[]):number {
  const selected=keys.filter((k)=>targets[k]!==undefined)
  return selected.length?average(selected.map((k)=>1-Math.abs(metric(context,k)-finite(targets[k],.5))),.72):.72
}
function rawScore(template:HillyScenarioTemplateV1,context:HillyScenarioContextV1):number {
  if(template.requiresDescentRisk&&context.weather.descentRisk<.50)return -1
  const profile=context.profile.hillyScore*20
  const tactics=affinity(template.targets,context,['sprintControlStrength','chaseStrength','attackDensity','bridgeIntent','protectLeaderStrength'])*25
  const field=affinity(template.targets,context,['puncheurDepth','climberDepth','sprintDepth','breakawayQuality','fieldStrength'])*20
  const race=affinity(template.targets,context,['gcPressure','responsibilityConcentration','uphillFinishSuitability'])*15
  const condition=affinity(template.targets,context,['averageFatigue','fragmentationRisk'])*10
  const weather=affinity(template.targets,context,['descentRisk','rainRisk'])*10
  return Number((profile+tactics+field+race+condition+weather).toFixed(4))
}
export function scoreHillyScenarioTemplatesV1(context:HillyScenarioContextV1):readonly HillyScenarioCandidateScoreV1[]{
  const raw=HILLY_SCENARIO_TEMPLATES_V1.map((template)=>({template,rawScore:rawScore(template,context)}))
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
function selectTemplate(context:HillyScenarioContextV1,seed:string){
  const scores=scoreHillyScenarioTemplatesV1(context)
  const pool=scores.filter((s)=>!s.excluded).slice(0,3)
  const fallback=scores.filter((s)=>s.rawScore>=0).slice(0,3)
  const candidates=pool.length?pool:fallback
  if(!candidates.length)return null
  const draw=unit(seed,'top3_weighted_draw')
  const index=candidates.length===1?0:candidates.length===2?(draw<.625?0:1):(draw<.5?0:draw<.8?1:2)
  const selected=candidates[index]
  const template=HILLY_SCENARIO_TEMPLATES_V1.find((t)=>t.id===selected.templateId)!
  return{template,selected,scores}
}
function instantiate(template:HillyScenarioTemplateV1,seed:string){
  return{
    breakaways:template.breakaways.map((d,i)=>({generation:d.generation,preferredSize:integerBetween(seed,`break:${i}:size`,d.preferredSize),targetPeakGapSec:Math.round(between(seed,`break:${i}:gap`,d.targetPeakGapSec)),formationPct:Number(between(seed,`break:${i}:formation`,d.formationWindowPct).toFixed(4)),peakPct:Number(between(seed,`break:${i}:peak`,d.peakWindowPct).toFixed(4)),chaseStartPct:d.chaseStartWindowPct?Number(between(seed,`break:${i}:chase`,d.chaseStartWindowPct).toFixed(4)):null,catchKmRemaining:d.catchKmRemaining?Number(between(seed,`break:${i}:catch`,d.catchKmRemaining).toFixed(2)):null,survivalTargetSec:d.survivalTargetSec?Math.round(between(seed,`break:${i}:survival`,d.survivalTargetSec)):null})),
    fragmentationPressure:Number(between(seed,'fragmentation:pressure',template.fragmentation.pressure).toFixed(4)),
    targetFrontGroup:template.fragmentation.targetFrontGroup?integerBetween(seed,'fragmentation:front',template.fragmentation.targetFrontGroup):null,
    secondaryGapSec:template.fragmentation.secondaryGapSec?Math.round(between(seed,'fragmentation:gap',template.fragmentation.secondaryGapSec)):null,
  }
}

function riderScore(input:UniversalRaceEngineInput,riderId:string,mode:'break'|'attack'|'work'|'sprint'):number{
  const rider=input.riders.find((r)=>r.riderId===riderId); if(!rider)return-1
  const climb=riderMetric(rider,'climbing'),flat=riderMetric(rider,'flat'),endurance=riderMetric(rider,'endurance'),resistance=riderMetric(rider,'resistance'),iq=riderMetric(rider,'raceIQ'),overall=riderMetric(rider,'overall'),sprint=riderMetric(rider,'sprint'),teamwork=riderMetric(rider,'teamwork')
  if(mode==='sprint')return sprint*.35+climb*.22+resistance*.16+flat*.10+iq*.10+overall*.07
  if(mode==='work')return teamwork*.28+endurance*.24+climb*.16+flat*.12+resistance*.12+iq*.08
  if(mode==='attack')return climb*.28+resistance*.20+iq*.18+endurance*.16+overall*.10+flat*.08
  return climb*.23+endurance*.24+resistance*.20+iq*.16+flat*.09+overall*.08
}
function ranked(input:UniversalRaceEngineInput,mode:'break'|'attack'|'work'|'sprint',seed:string):RiderPlan[]{
  return [...input.stagePlans.flatMap((p)=>p.riders)].sort((a,b)=>riderScore(input,b.riderId,mode)-riderScore(input,a.riderId,mode)||stableHash(`${seed}:${a.riderId}`)-stableHash(`${seed}:${b.riderId}`))
}
function riderTeam(input:UniversalRaceEngineInput,riderId:string):string{return input.stagePlans.find((p)=>p.riders.some((r)=>r.riderId===riderId))?.teamId??''}
function commandFor(commands:RiderCommands,phase:PhaseNumber):PhaseCommand{return phase===1?commands.phase1:phase===2?commands.phase2:phase===3?commands.phase3:commands.phase4 as PhaseCommand}
function setCommand(commands:RiderCommands,phase:PhaseNumber,command:PhaseCommand):RiderCommands{
  if(phase===1)return{...commands,phase1:command};if(phase===2)return{...commands,phase2:command};if(phase===3)return{...commands,phase3:command};return{...commands,phase4:command as RiderCommands['phase4']}
}
function applyDirector(input:UniversalRaceEngineInput,template:HillyScenarioTemplateV1,seed:string,explicit:ReadonlySet<string>,aiTeams:ReadonlySet<string>){
  const assignments:HillyScenarioAuditV1['appliedDirectives']['commandAssignments'][number][]=[]
  let plans=input.stagePlans.map((p)=>({...p,riders:p.riders.map((r)=>({...r,commands:{...r.commands}}))}))
  const breakRank=ranked(input,'break',seed),attackRank=ranked(input,'attack',seed),workRank=ranked(input,'work',seed),sprintRank=ranked(input,'sprint',seed)
  const teamRanking=[...input.stagePlans].map((p)=>({teamId:p.teamId,score:Math.max(...p.riders.map((r)=>riderScore(input,r.riderId,'sprint')),0)})).sort((a,b)=>b.score-a.score).map((x)=>x.teamId)
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
    teamRanking.slice(0,control).forEach((teamId)=>{const rider=workRank.find((r)=>riderTeam(input,r.riderId)===teamId);if(rider)assign(rider.riderId,phase,'control_race' as PhaseCommand,`${template.id}:control`);touched.set(teamId,template.family==='gc_attack'?'gc_protection':'balanced')})
    teamRanking.slice(0,chase).forEach((teamId)=>{const rider=workRank.find((r)=>riderTeam(input,r.riderId)===teamId);if(rider)assign(rider.riderId,phase,'chase' as PhaseCommand,`${template.id}:chase`)})
  })
  if(['large_reduced_sprint','small_reduced_sprint','puncheur_group'].includes(template.finale.type)){
    teamRanking.slice(0,Math.min(4,Math.max(1,Math.ceil(input.stagePlans.length*.20)))).forEach((teamId)=>{const rider=sprintRank.find((r)=>riderTeam(input,r.riderId)===teamId);if(rider)assign(rider.riderId,4,'final_sprint' as PhaseCommand,`${template.id}:finale`)})
  }
  let syntheticTeamTactics=0
  plans=plans.map((plan)=>{const desired=touched.get(plan.teamId);if(!desired||(!plan.defaulted&&!aiTeams.has(plan.teamId))||plan.teamTactic===desired)return plan;syntheticTeamTactics++;return{...plan,teamTactic:desired}})
  return{input:{...input,stagePlans:plans},assignments,syntheticTeamTactics}
}

export function applyHillyScenarioV1(input:UniversalRaceEngineInput,options:ApplyHillyScenarioOptionsV1={}):ApplyHillyScenarioResultV1{
  if(input.stage.stageFormat!=='road_race'||input.stage.terrainType!=='hilly')return{input,audit:null}
  const context=buildHillyScenarioContextV1(input,options)
  if(context.profile.hillyScore<.48)return{input,audit:null}
  const seed=`hilly-scenario:${input.race.raceId}:${input.stage.stageId}:${HILLY_SCENARIO_CATALOG_VERSION}`
  const persisted=(options.history??[]).find((h)=>h.stageId===input.stage.stageId)?.templateId??null
  let selected=selectTemplate(context,seed)
  if(persisted){const template=HILLY_SCENARIO_TEMPLATES_V1.find((t)=>t.id===persisted);if(template){const scores=scoreHillyScenarioTemplatesV1(context);selected={template,selected:scores.find((s)=>s.templateId===template.id)??{templateId:template.id,family:template.family,rawScore:rawScore(template,context),repetitionPenalty:0,finalScore:rawScore(template,context),excluded:false,exclusionReason:null},scores}}}
  if(!selected)return{input,audit:null}
  const parameters=instantiate(selected.template,seed)
  const aiTeams=scenarioAiControlledTeamIds(input)
  const explicit=explicitHumanCommands(options.phaseCommandRows??[],aiTeams)
  const directed=applyDirector(input,selected.template,seed,explicit,aiTeams)
  const audit:HillyScenarioAuditV1={contract:'hilly_scenario_selection_v1',scenarioType:HILLY_SCENARIO_TYPE,catalogVersion:HILLY_SCENARIO_CATALOG_VERSION,templateId:selected.template.id,templateVersion:1,templateLabel:selected.template.label,templateFamily:selected.template.family,similarityGroup:selected.template.similarityGroup,selectionSeed:seed,compatibilityScore:selected.selected.rawScore,gameDate:context.gameDate,contextSnapshot:context,candidateScores:selected.scores,generatedParameters:parameters,appliedDirectives:{syntheticCommands:directed.assignments.length,syntheticTeamTactics:directed.syntheticTeamTactics,commandAssignments:directed.assignments}}
  const stagePlans=directed.input.stagePlans.map((plan,index)=>index===0?({...plan,metadata:{...plan.metadata,hillyScenarioV1:audit as unknown as Record<string,unknown>}}):plan)
  return{input:{...directed.input,stagePlans},audit}
}

export function getHillyScenarioAuditV1(input:UniversalRaceEngineInput):HillyScenarioAuditV1|null{
  const metadata=input.stagePlans[0]?.metadata as unknown as Record<string,unknown>|undefined
  const audit=metadata?.hillyScenarioV1
  return audit&&typeof audit==='object'&&!Array.isArray(audit)?audit as unknown as HillyScenarioAuditV1:null
}
