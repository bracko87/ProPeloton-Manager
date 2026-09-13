import type { UniversalRaceEngineInput } from './runRaceEngine.ts'

export const FLAT_SCENARIO_CATALOG_VERSION = 'flat_catalog_v1' as const
export const FLAT_SCENARIO_TYPE = 'flat' as const

export type Score01 = number
export type NumericRange = readonly [number, number]
export type FlatScenarioFamily =
  | 'controlled_sprint'
  | 'breakaway'
  | 'dynamic_attack'
  | 'fragmentation'
  | 'crosswind'

export type FlatScenarioFinale =
  | 'large_bunch_sprint'
  | 'chaotic_bunch_sprint'
  | 'reduced_sprint'
  | 'breakaway_finish'
  | 'solo_finish'
  | 'open'

export interface FlatScenarioHistoryEntryV1 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly templateId: string
  readonly family: FlatScenarioFamily
  readonly status?: string | null
}

export interface FlatScenarioBreakawayDirectiveV1 {
  readonly generation: 1 | 2 | 3
  readonly formationWindowPct: NumericRange
  readonly preferredSize: NumericRange
  readonly targetPeakGapSec: NumericRange
  readonly peakWindowPct: NumericRange
  readonly chaseStartWindowPct?: NumericRange
  readonly catchWindowPct?: NumericRange
  readonly catchKmRemaining?: NumericRange
  readonly survivalTargetSec?: NumericRange
}

export interface FlatScenarioPhaseDirectiveV1 {
  readonly breakawayRiders: NumericRange
  readonly attackRiders: NumericRange
  readonly controlTeams: NumericRange
  readonly chaseTeams: NumericRange
  readonly lateAttackers: NumericRange
  readonly pressure: 'low' | 'medium' | 'high'
}

type ContextMetric =
  | 'sprintControlStrength'
  | 'chaseStrength'
  | 'attackDensity'
  | 'bridgeIntent'
  | 'leadoutStrength'
  | 'protectLeaderStrength'
  | 'conserveIntent'
  | 'sprintDepth'
  | 'breakawayQuality'
  | 'fieldStrength'
  | 'crosswindRisk'
  | 'rainRisk'
  | 'heatStress'
  | 'averageFatigue'
  | 'fragmentationRisk'
  | 'gcPressure'
  | 'responsibilityConcentration'

export interface FlatScenarioTemplateV1 {
  readonly id: string
  readonly label: string
  readonly version: 1
  readonly family: FlatScenarioFamily
  readonly similarityGroup: string
  readonly requiresCrosswind?: boolean
  readonly targets: Readonly<Partial<Record<ContextMetric, number>>>
  readonly phases: {
    readonly phase1: FlatScenarioPhaseDirectiveV1
    readonly phase2: FlatScenarioPhaseDirectiveV1
    readonly phase3: FlatScenarioPhaseDirectiveV1
    readonly phase4: FlatScenarioPhaseDirectiveV1
  }
  readonly breakaways: readonly FlatScenarioBreakawayDirectiveV1[]
  readonly fragmentation: {
    readonly pressure: NumericRange
    readonly targetFrontGroup?: NumericRange
    readonly secondaryGapSec?: NumericRange
    readonly allowRegroup: boolean
  }
  readonly finale: {
    readonly type: FlatScenarioFinale
    readonly expectedFrontGroup?: NumericRange
  }
  readonly deviation: {
    readonly mayConvertToBreakWin: boolean
    readonly mayConvertToCatch: boolean
    readonly commandOverrideAllowed: true
  }
}

export interface FlatScenarioContextV1 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly profile: {
    readonly flatScore: Score01
    readonly distanceKm: number
    readonly elevationGainM: number
    readonly flatPct: number
    readonly hillyPct: number
    readonly mountainPct: number
    readonly cobbledPct: number
    readonly profileType: string | null
    readonly finishType: string | null
  }
  readonly weather: {
    readonly windStrength: Score01
    readonly crosswindRisk: Score01
    readonly rainRisk: Score01
    readonly heatStress: Score01
  }
  readonly field: {
    readonly starterCount: number
    readonly sprintDepth: Score01
    readonly eliteSprinterCount: number
    readonly breakawayQuality: Score01
    readonly fieldStrength: Score01
  }
  readonly tactics: {
    readonly sprintControlStrength: Score01
    readonly chaseStrength: Score01
    readonly attackDensity: Score01
    readonly bridgeIntent: Score01
    readonly leadoutStrength: Score01
    readonly protectLeaderStrength: Score01
    readonly conserveIntent: Score01
    readonly aggressiveTeamCount: number
    readonly sprintControlTeamCount: number
  }
  readonly condition: {
    readonly averageFatigue: Score01
    readonly fatigueSpread: Score01
    readonly fragmentationRisk: Score01
  }
  readonly raceSituation: {
    readonly gcPressure: Score01
    readonly responsibilityConcentration: Score01
  }
  readonly history: {
    readonly templatesUsedThisRace: readonly string[]
    readonly familiesUsedThisRace: readonly FlatScenarioFamily[]
    readonly templatesUsedToday: readonly string[]
    readonly familiesUsedToday: readonly FlatScenarioFamily[]
  }
}

export interface FlatScenarioCandidateScoreV1 {
  readonly templateId: string
  readonly family: FlatScenarioFamily
  readonly rawScore: number
  readonly repetitionPenalty: number
  readonly finalScore: number
  readonly excluded: boolean
  readonly exclusionReason: string | null
}

export interface FlatScenarioAuditV1 {
  readonly contract: 'flat_scenario_selection_v1'
  readonly scenarioType: typeof FLAT_SCENARIO_TYPE
  readonly catalogVersion: typeof FLAT_SCENARIO_CATALOG_VERSION
  readonly templateId: string
  readonly templateVersion: 1
  readonly templateLabel: string
  readonly templateFamily: FlatScenarioFamily
  readonly similarityGroup: string
  readonly selectionSeed: string
  readonly compatibilityScore: number
  readonly gameDate: string
  readonly contextSnapshot: FlatScenarioContextV1
  readonly candidateScores: readonly FlatScenarioCandidateScoreV1[]
  readonly repetitionPenalties: {
    readonly exactTemplateSameRace: number
    readonly sameFamilyPreviousComparableStage: number
    readonly exactTemplateSameDay: number
    readonly sameFamilySameDayPerUse: number
    readonly sameFamilySameDayCap: number
  }
  readonly repeatAllowedRace: boolean
  readonly repeatAllowedDay: boolean
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

export interface ApplyFlatScenarioOptionsV1 {
  readonly gameDate?: string | null
  readonly phaseCommandRows?: readonly Record<string, unknown>[]
  readonly history?: readonly FlatScenarioHistoryEntryV1[]
}

export interface ApplyFlatScenarioResultV1 {
  readonly input: UniversalRaceEngineInput
  readonly audit: FlatScenarioAuditV1 | null
}

type PhaseNumber = 1 | 2 | 3 | 4
type RiderPlan = UniversalRaceEngineInput['stagePlans'][number]['riders'][number]
type RiderCommands = RiderPlan['commands']
type PhaseCommand = RiderCommands['phase1']

type FlatSelectionProfile = Readonly<Partial<Record<ContextMetric, number>>>

const PENALTIES = {
  sameRaceReuse: -45,
  previousFamily: -20,
  sameDayExact: -30,
  sameDayFamilyPerUse: -5,
  sameDayFamilyCap: -15,
} as const

function r(min: number, max: number): NumericRange {
  return [min, max]
}

function p(
  breakawayRiders: NumericRange,
  attackRiders: NumericRange,
  controlTeams: NumericRange,
  chaseTeams: NumericRange,
  lateAttackers: NumericRange,
  pressure: FlatScenarioPhaseDirectiveV1['pressure'],
): FlatScenarioPhaseDirectiveV1 {
  return { breakawayRiders, attackRiders, controlTeams, chaseTeams, lateAttackers, pressure }
}

function b(
  generation: 1 | 2 | 3,
  formationWindowPct: NumericRange,
  preferredSize: NumericRange,
  targetPeakGapSec: NumericRange,
  peakWindowPct: NumericRange,
  chaseStartWindowPct?: NumericRange,
  catchKmRemaining?: NumericRange,
  survivalTargetSec?: NumericRange,
): FlatScenarioBreakawayDirectiveV1 {
  return {
    generation,
    formationWindowPct,
    preferredSize,
    targetPeakGapSec,
    peakWindowPct,
    chaseStartWindowPct,
    catchKmRemaining,
    survivalTargetSec,
  }
}

function t(config: Omit<FlatScenarioTemplateV1, 'version' | 'deviation'>): FlatScenarioTemplateV1 {
  return {
    ...config,
    version: 1,
    deviation: {
      mayConvertToBreakWin: true,
      mayConvertToCatch: true,
      commandOverrideAllowed: true,
    },
  }
}

export const FLAT_SCENARIO_TEMPLATES_V1: readonly FlatScenarioTemplateV1[] = [
  t({ id: 'flat_01_controlled_double_break', label: 'Controlled Double Break', family: 'controlled_sprint', similarityGroup: 'controlled_multi_break', targets: { sprintControlStrength: .82, attackDensity: .55, chaseStrength: .72, sprintDepth: .75 }, phases: { phase1: p(r(3,7),r(0,1),r(1,3),r(0,1),r(0,0),'medium'), phase2: p(r(0,0),r(0,1),r(1,3),r(1,2),r(0,0),'medium'), phase3: p(r(2,6),r(0,2),r(1,3),r(2,4),r(0,1),'high'), phase4: p(r(0,0),r(0,1),r(1,2),r(2,4),r(0,1),'high') }, breakaways: [b(1,r(.03,.14),r(3,7),r(120,270),r(.20,.38),r(.34,.50),r(3,15)), b(2,r(.52,.72),r(2,6),r(45,165),r(.62,.80),r(.70,.88),r(3,15))], fragmentation: { pressure:r(.10,.28), targetFrontGroup:r(65,110), allowRegroup:true }, finale:{ type:'large_bunch_sprint', expectedFrontGroup:r(65,110) } }),
  t({ id: 'flat_02_classic_late_catch', label: 'Classic Late Catch', family: 'controlled_sprint', similarityGroup: 'classic_sprint', targets: { sprintControlStrength:.85, chaseStrength:.78, attackDensity:.35, sprintDepth:.78 }, phases:{ phase1:p(r(3,6),r(0,1),r(1,3),r(0,1),r(0,0),'low'), phase2:p(r(0,0),r(0,0),r(1,3),r(1,2),r(0,0),'medium'), phase3:p(r(0,0),r(0,1),r(2,4),r(2,5),r(0,1),'high'), phase4:p(r(0,0),r(0,0),r(1,3),r(2,4),r(0,0),'high') }, breakaways:[b(1,r(.03,.16),r(3,6),r(240,450),r(.25,.48),r(.48,.68),r(5,15))], fragmentation:{ pressure:r(.08,.24), targetFrontGroup:r(70,120), allowRegroup:true }, finale:{type:'large_bunch_sprint',expectedFrontGroup:r(70,120)} }),
  t({ id:'flat_03_last_kilometres_catch', label:'Last-Kilometres Catch', family:'controlled_sprint', similarityGroup:'late_catch', targets:{ sprintControlStrength:.72, chaseStrength:.62, attackDensity:.42, sprintDepth:.82 }, phases:{ phase1:p(r(3,8),r(0,1),r(1,2),r(0,0),r(0,0),'low'), phase2:p(r(0,0),r(0,0),r(1,2),r(0,1),r(0,0),'low'), phase3:p(r(0,0),r(0,1),r(1,3),r(1,3),r(0,0),'medium'), phase4:p(r(0,0),r(0,1),r(1,3),r(3,5),r(0,1),'high') }, breakaways:[b(1,r(.03,.18),r(3,8),r(270,510),r(.30,.52),r(.60,.75),r(1,5))], fragmentation:{pressure:r(.18,.38),targetFrontGroup:r(55,100),allowRegroup:true}, finale:{type:'chaotic_bunch_sprint',expectedFrontGroup:r(55,100)} }),
  t({ id:'flat_04_breakaway_victory', label:'Breakaway Victory', family:'breakaway', similarityGroup:'break_survival', targets:{ sprintControlStrength:.32, chaseStrength:.35, breakawayQuality:.78, attackDensity:.62, responsibilityConcentration:.28 }, phases:{ phase1:p(r(4,9),r(1,2),r(0,1),r(0,0),r(0,0),'medium'), phase2:p(r(0,0),r(0,1),r(0,1),r(0,1),r(0,0),'low'), phase3:p(r(0,0),r(1,2),r(0,1),r(0,2),r(0,1),'medium'), phase4:p(r(0,0),r(0,1),r(0,1),r(0,2),r(1,2),'medium') }, breakaways:[b(1,r(.02,.16),r(4,9),r(300,600),r(.30,.56),r(.60,.78),undefined,r(10,90))], fragmentation:{pressure:r(.15,.35),targetFrontGroup:r(2,6),allowRegroup:false}, finale:{type:'breakaway_finish',expectedFrontGroup:r(2,6)} }),
  t({ id:'flat_05_solo_survivor', label:'Solo Survivor', family:'breakaway', similarityGroup:'solo_survival', targets:{ breakawayQuality:.86, sprintControlStrength:.48, attackDensity:.62, fieldStrength:.72 }, phases:{ phase1:p(r(4,8),r(1,2),r(0,1),r(0,1),r(0,0),'medium'), phase2:p(r(0,0),r(0,1),r(0,1),r(0,1),r(0,0),'low'), phase3:p(r(0,0),r(1,2),r(0,1),r(1,2),r(1,2),'medium'), phase4:p(r(0,0),r(0,1),r(0,1),r(1,3),r(1,2),'high') }, breakaways:[b(1,r(.03,.17),r(4,8),r(180,390),r(.28,.50),r(.55,.75),undefined,r(2,45))], fragmentation:{pressure:r(.22,.45),targetFrontGroup:r(1,1),allowRegroup:false}, finale:{type:'solo_finish',expectedFrontGroup:r(1,1)} }),
  t({ id:'flat_06_break_caught_late_solo', label:'Break Caught / Late Solo', family:'dynamic_attack', similarityGroup:'late_attack', targets:{ attackDensity:.70, sprintControlStrength:.62, chaseStrength:.72, breakawayQuality:.55 }, phases:{ phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'medium'), phase2:p(r(0,0),r(0,1),r(1,2),r(1,3),r(0,0),'medium'), phase3:p(r(0,0),r(1,2),r(1,2),r(2,4),r(1,2),'high'), phase4:p(r(0,0),r(1,2),r(0,1),r(1,3),r(1,3),'high') }, breakaways:[b(1,r(.03,.15),r(3,6),r(120,300),r(.20,.42),r(.45,.62),r(18,40))], fragmentation:{pressure:r(.25,.48),targetFrontGroup:r(1,20),allowRegroup:true}, finale:{type:'solo_finish'} }),
  t({ id:'flat_07_repeated_failed_attacks', label:'Repeated Failed Attacks', family:'dynamic_attack', similarityGroup:'attack_waves', targets:{ attackDensity:.90, chaseStrength:.80, sprintControlStrength:.68, fragmentationRisk:.48 }, phases:{ phase1:p(r(2,6),r(2,5),r(1,2),r(1,3),r(0,0),'high'), phase2:p(r(0,3),r(2,6),r(1,2),r(2,4),r(0,0),'high'), phase3:p(r(0,3),r(1,4),r(1,3),r(2,4),r(1,2),'high'), phase4:p(r(0,0),r(0,2),r(1,3),r(1,3),r(0,1),'medium') }, breakaways:[b(1,r(.02,.18),r(2,6),r(15,75),r(.10,.28),r(.18,.38),r(45,80)),b(2,r(.28,.55),r(2,6),r(15,75),r(.35,.58),r(.45,.65),r(25,50)),b(3,r(.55,.78),r(2,6),r(15,75),r(.60,.80),r(.70,.86),r(8,25))], fragmentation:{pressure:r(.25,.48),targetFrontGroup:r(60,115),allowRegroup:true}, finale:{type:'chaotic_bunch_sprint',expectedFrontGroup:r(60,115)} }),
  t({ id:'flat_08_three_generation_break', label:'Three-Generation Break', family:'dynamic_attack', similarityGroup:'multi_break', targets:{ attackDensity:.95, chaseStrength:.62, sprintControlStrength:.58, bridgeIntent:.72 }, phases:{ phase1:p(r(2,5),r(1,2),r(0,2),r(1,2),r(0,0),'high'), phase2:p(r(3,7),r(1,3),r(1,2),r(1,3),r(0,0),'high'), phase3:p(r(2,6),r(1,3),r(1,3),r(2,4),r(1,2),'high'), phase4:p(r(0,0),r(0,2),r(1,2),r(1,3),r(0,1),'medium') }, breakaways:[b(1,r(.02,.15),r(2,5),r(60,180),r(.12,.30),r(.22,.40),r(70,100)),b(2,r(.28,.48),r(3,7),r(90,270),r(.38,.58),r(.48,.68),r(35,65)),b(3,r(.55,.76),r(2,6),r(30,180),r(.66,.82),r(.72,.88),r(5,25))], fragmentation:{pressure:r(.22,.45),targetFrontGroup:r(55,110),allowRegroup:true}, finale:{type:'open',expectedFrontGroup:r(2,110)} }),
  t({ id:'flat_09_small_break_under_control', label:'Small Break Under Control', family:'controlled_sprint', similarityGroup:'classic_sprint', targets:{ sprintControlStrength:.95, chaseStrength:.86, attackDensity:.20, breakawayQuality:.30, sprintDepth:.82 }, phases:{ phase1:p(r(2,3),r(0,0),r(2,4),r(0,1),r(0,0),'low'), phase2:p(r(0,0),r(0,0),r(2,4),r(1,3),r(0,0),'medium'), phase3:p(r(0,0),r(0,0),r(2,4),r(3,5),r(0,0),'high'), phase4:p(r(0,0),r(0,0),r(2,4),r(2,4),r(0,0),'high') }, breakaways:[b(1,r(.04,.15),r(2,3),r(90,225),r(.22,.42),r(.45,.62),r(10,25))], fragmentation:{pressure:r(.05,.18),targetFrontGroup:r(80,130),allowRegroup:true}, finale:{type:'large_bunch_sprint',expectedFrontGroup:r(80,130)} }),
  t({ id:'flat_10_huge_breakaway', label:'Huge Breakaway', family:'breakaway', similarityGroup:'large_break', targets:{ attackDensity:.86, aggressiveTeamCount:.0 as never, breakawayQuality:.62, sprintControlStrength:.35, responsibilityConcentration:.25 }, phases:{ phase1:p(r(10,18),r(2,4),r(0,1),r(0,1),r(0,0),'high'), phase2:p(r(0,0),r(2,4),r(0,1),r(0,2),r(0,0),'medium'), phase3:p(r(0,0),r(3,6),r(0,2),r(1,3),r(1,3),'high'), phase4:p(r(0,0),r(2,5),r(0,1),r(1,3),r(1,3),'high') }, breakaways:[b(1,r(.01,.16),r(10,18),r(240,540),r(.28,.54),r(.58,.76),undefined,r(5,120))], fragmentation:{pressure:r(.45,.78),targetFrontGroup:r(2,12),secondaryGapSec:r(15,180),allowRegroup:false}, finale:{type:'breakaway_finish',expectedFrontGroup:r(2,12)} }),
  t({ id:'flat_11_dangerous_strong_break', label:'Dangerous Strong Break', family:'breakaway', similarityGroup:'strong_break', targets:{ breakawayQuality:.92, fieldStrength:.78, chaseStrength:.72, sprintControlStrength:.58 }, phases:{ phase1:p(r(4,7),r(1,2),r(1,2),r(0,1),r(0,0),'medium'), phase2:p(r(0,0),r(0,1),r(1,3),r(2,4),r(0,0),'high'), phase3:p(r(0,0),r(1,2),r(1,3),r(2,4),r(1,2),'high'), phase4:p(r(0,0),r(0,1),r(1,2),r(1,3),r(1,2),'high') }, breakaways:[b(1,r(.02,.14),r(4,7),r(180,360),r(.25,.46),r(.45,.62),r(3,18),r(0,45))], fragmentation:{pressure:r(.28,.52),targetFrontGroup:r(1,90),allowRegroup:true}, finale:{type:'open'} }),
  t({ id:'flat_12_bridge_changes_race', label:'Bridge Changes Race', family:'dynamic_attack', similarityGroup:'bridge', targets:{ bridgeIntent:.92, attackDensity:.78, breakawayQuality:.68, sprintControlStrength:.56 }, phases:{ phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'medium'), phase2:p(r(0,2),r(1,4),r(1,2),r(1,2),r(0,0),'high'), phase3:p(r(0,2),r(1,4),r(1,2),r(1,3),r(1,2),'high'), phase4:p(r(0,0),r(0,2),r(1,2),r(1,3),r(1,2),'high') }, breakaways:[b(1,r(.03,.16),r(3,6),r(150,330),r(.24,.44),r(.52,.70),r(4,18)),b(2,r(.42,.70),r(1,4),r(30,150),r(.55,.74),r(.68,.82),r(2,12))], fragmentation:{pressure:r(.30,.55),targetFrontGroup:r(1,95),allowRegroup:true}, finale:{type:'open'} }),
  t({ id:'flat_13_split_chase', label:'Split Chase', family:'fragmentation', similarityGroup:'chase_split', targets:{ chaseStrength:.92, fragmentationRisk:.72, sprintControlStrength:.72, fieldStrength:.72 }, phases:{ phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'medium'), phase2:p(r(0,0),r(0,1),r(2,4),r(3,6),r(0,0),'high'), phase3:p(r(0,0),r(1,2),r(2,4),r(4,7),r(1,2),'high'), phase4:p(r(0,0),r(0,1),r(1,3),r(2,5),r(0,1),'high') }, breakaways:[b(1,r(.03,.16),r(3,6),r(120,300),r(.20,.42),r(.45,.62),r(8,20))], fragmentation:{pressure:r(.58,.82),targetFrontGroup:r(40,80),secondaryGapSec:r(20,120),allowRegroup:false}, finale:{type:'reduced_sprint',expectedFrontGroup:r(40,80)} }),
  t({ id:'flat_14_attritional_flat', label:'Attritional Flat', family:'fragmentation', similarityGroup:'attrition', targets:{ averageFatigue:.78, fragmentationRisk:.78, chaseStrength:.72, fieldStrength:.68 }, phases:{ phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'medium'), phase2:p(r(0,0),r(1,2),r(2,4),r(2,4),r(0,0),'high'), phase3:p(r(0,0),r(1,3),r(2,5),r(3,6),r(1,2),'high'), phase4:p(r(0,0),r(0,2),r(1,3),r(2,5),r(1,2),'high') }, breakaways:[b(1,r(.03,.16),r(3,6),r(120,300),r(.22,.42),r(.42,.58),r(8,22))], fragmentation:{pressure:r(.62,.88),targetFrontGroup:r(40,80),secondaryGapSec:r(15,150),allowRegroup:false}, finale:{type:'reduced_sprint',expectedFrontGroup:r(40,80)} }),
  t({ id:'flat_15_crosswind_echelons', label:'Crosswind Echelons', family:'crosswind', similarityGroup:'crosswind_split', requiresCrosswind:true, targets:{ crosswindRisk:.92, fragmentationRisk:.88, chaseStrength:.78, fieldStrength:.72 }, phases:{ phase1:p(r(2,6),r(0,1),r(2,5),r(1,2),r(0,0),'high'), phase2:p(r(0,0),r(1,3),r(3,7),r(3,7),r(0,0),'high'), phase3:p(r(0,0),r(1,3),r(3,7),r(3,7),r(1,3),'high'), phase4:p(r(0,0),r(0,2),r(2,5),r(2,6),r(1,2),'high') }, breakaways:[b(1,r(.02,.14),r(2,6),r(120,360),r(.18,.38),r(.35,.58),r(10,30))], fragmentation:{pressure:r(.78,.98),targetFrontGroup:r(20,60),secondaryGapSec:r(20,240),allowRegroup:false}, finale:{type:'reduced_sprint',expectedFrontGroup:r(20,60)} }),
  t({ id:'flat_16_crosswind_then_regroup', label:'Crosswind then Regroup', family:'crosswind', similarityGroup:'crosswind_regroup', requiresCrosswind:true, targets:{ crosswindRisk:.78, fragmentationRisk:.64, conserveIntent:.52, chaseStrength:.58 }, phases:{ phase1:p(r(2,6),r(0,1),r(2,5),r(1,2),r(0,0),'high'), phase2:p(r(0,0),r(1,2),r(2,5),r(2,5),r(0,0),'high'), phase3:p(r(0,0),r(0,1),r(1,3),r(1,3),r(0,1),'medium'), phase4:p(r(0,0),r(0,1),r(1,3),r(2,4),r(0,1),'high') }, breakaways:[b(1,r(.02,.15),r(2,6),r(120,360),r(.20,.42),r(.42,.58),r(8,22))], fragmentation:{pressure:r(.52,.78),targetFrontGroup:r(60,100),secondaryGapSec:r(10,90),allowRegroup:true}, finale:{type:'large_bunch_sprint',expectedFrontGroup:r(60,100)} }),
  t({ id:'flat_17_sprint_teams_miscalculate', label:'Sprint Teams Miscalculate', family:'controlled_sprint', similarityGroup:'miscalculation', targets:{ sprintDepth:.82, sprintControlStrength:.62, chaseStrength:.38, responsibilityConcentration:.38, breakawayQuality:.62 }, phases:{ phase1:p(r(3,7),r(0,1),r(1,2),r(0,0),r(0,0),'low'), phase2:p(r(0,0),r(0,0),r(0,2),r(0,1),r(0,0),'low'), phase3:p(r(0,0),r(0,1),r(1,3),r(1,3),r(0,1),'medium'), phase4:p(r(0,0),r(0,1),r(1,3),r(2,5),r(0,1),'high') }, breakaways:[b(1,r(.03,.16),r(3,7),r(300,540),r(.34,.56),r(.68,.82),undefined,r(2,45))], fragmentation:{pressure:r(.18,.38),targetFrontGroup:r(2,100),allowRegroup:true}, finale:{type:'open'} }),
  t({ id:'flat_18_chase_war', label:'Chase War', family:'dynamic_attack', similarityGroup:'chase_war', targets:{ sprintControlStrength:.88, chaseStrength:.90, attackDensity:.72, leadoutStrength:.72 }, phases:{ phase1:p(r(3,6),r(0,1),r(2,4),r(1,2),r(0,0),'medium'), phase2:p(r(0,0),r(0,2),r(3,6),r(4,8),r(0,0),'high'), phase3:p(r(0,3),r(2,5),r(2,5),r(3,7),r(1,3),'high'), phase4:p(r(0,0),r(1,3),r(1,4),r(2,5),r(1,2),'high') }, breakaways:[b(1,r(.02,.14),r(3,6),r(60,240),r(.16,.34),r(.30,.48),r(35,70)),b(2,r(.45,.75),r(2,6),r(30,150),r(.55,.76),r(.64,.82),r(8,25))], fragmentation:{pressure:r(.42,.68),targetFrontGroup:r(45,95),allowRegroup:true}, finale:{type:'chaotic_bunch_sprint',expectedFrontGroup:r(45,95)} }),
  t({ id:'flat_19_late_reduced_sprint', label:'Late Reduced Sprint', family:'fragmentation', similarityGroup:'late_split', targets:{ fragmentationRisk:.88, sprintDepth:.62, chaseStrength:.72, attackDensity:.58 }, phases:{ phase1:p(r(3,6),r(0,1),r(1,3),r(0,1),r(0,0),'medium'), phase2:p(r(0,0),r(0,1),r(1,3),r(1,3),r(0,0),'medium'), phase3:p(r(0,0),r(1,2),r(2,4),r(3,6),r(1,2),'high'), phase4:p(r(0,0),r(1,3),r(2,5),r(2,5),r(1,3),'high') }, breakaways:[b(1,r(.03,.16),r(3,6),r(120,300),r(.22,.42),r(.55,.72),r(12,28))], fragmentation:{pressure:r(.72,.94),targetFrontGroup:r(20,50),secondaryGapSec:r(15,120),allowRegroup:false}, finale:{type:'reduced_sprint',expectedFrontGroup:r(20,50)} }),
  t({ id:'flat_20_tactical_standoff', label:'Tactical Standoff', family:'breakaway', similarityGroup:'standoff', targets:{ responsibilityConcentration:.15, chaseStrength:.25, sprintControlStrength:.38, conserveIntent:.70, breakawayQuality:.55 }, phases:{ phase1:p(r(3,7),r(0,1),r(0,1),r(0,0),r(0,0),'low'), phase2:p(r(0,0),r(0,1),r(0,1),r(0,0),r(0,0),'low'), phase3:p(r(0,0),r(0,1),r(0,2),r(0,2),r(0,1),'low'), phase4:p(r(0,0),r(0,1),r(1,3),r(2,5),r(0,1),'high') }, breakaways:[b(1,r(.03,.17),r(3,7),r(360,600),r(.42,.66),r(.70,.85),r(0,8),r(0,45))], fragmentation:{pressure:r(.12,.34),targetFrontGroup:r(2,110),allowRegroup:true}, finale:{type:'open'} }),
] as const

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function unit(seed: string, key: string): number {
  return stableHash(`${seed}:${key}`) / 0xffffffff
}

function between(seed: string, key: string, range: NumericRange): number {
  return range[0] + (range[1] - range[0]) * unit(seed, key)
}

function integerBetween(seed: string, key: string, range: NumericRange): number {
  const minimum = Math.ceil(range[0])
  const maximum = Math.floor(range[1])
  if (maximum <= minimum) return minimum
  return minimum + (stableHash(`${seed}:${key}`) % (maximum - minimum + 1))
}

function average(values: readonly number[], fallback = 0): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback
}

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
  const raw = text(value)
  if (!raw) return 'unknown'
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? raw
}

function commandRowsExplicitSet(rows: readonly Record<string, unknown>[]): ReadonlySet<string> {
  const set = new Set<string>()
  rows.forEach((row) => {
    const riderId = text(row.rider_id)
    if (!riderId) return
    ;([1,2,3,4] as const).forEach((phase) => {
      if (text(row[`phase_${phase}_command`])) set.add(`${riderId}:${phase}`)
    })
  })
  return set
}

function scoreCommand(command: unknown, positive: readonly string[]): number {
  return positive.includes(String(command ?? '').trim().toLowerCase()) ? 1 : 0
}

function riderMetric(rider: UniversalRaceEngineInput['riders'][number], key: string): number {
  return clamp(finite((rider as unknown as Record<string, unknown>)[key], 50) / 100)
}

function teamPlanMetrics(input: UniversalRaceEngineInput) {
  const plans = input.stagePlans
  const allRiders = plans.flatMap((plan) => plan.riders)
  const commands = allRiders.flatMap((rider) => [rider.commands.phase1,rider.commands.phase2,rider.commands.phase3,rider.commands.phase4])
  const commandCount = Math.max(1, commands.length)
  const attackDensity = commands.reduce((sum, command) => sum + scoreCommand(command,['attack','join_breakaway']),0) / commandCount
  const chaseStrength = commands.reduce((sum, command) => sum + scoreCommand(command,['chase','chase_breakaway','control_race','control_tempo']),0) / commandCount
  const bridgeIntent = commands.reduce((sum, command) => sum + scoreCommand(command,['attack']),0) / commandCount
  const leadoutStrength = commands.reduce((sum, command) => sum + scoreCommand(command,['lead_out','lead_out_rider','sprint_train_rider','final_sprint']),0) / commandCount
  const conserveIntent = commands.reduce((sum, command) => sum + scoreCommand(command,['avoid_risks','conserve','recover']),0) / commandCount
  const protectLeaderStrength = commands.reduce((sum, command) => sum + scoreCommand(command,['protect_leader','protect_gc','stay_near_front']),0) / commandCount
  const sprintControlTeamCount = plans.filter((plan) => plan.teamTactic === 'sprint_control').length
  const aggressiveTeamCount = plans.filter((plan) => ['aggressive','breakaway'].includes(plan.teamTactic)).length
  const tacticControl = plans.length > 0 ? sprintControlTeamCount / plans.length : 0
  return {
    sprintControlStrength: clamp(tacticControl * .65 + chaseStrength * .35),
    chaseStrength: clamp(chaseStrength * 1.8),
    attackDensity: clamp(attackDensity * 2.5 + (plans.length ? aggressiveTeamCount / plans.length : 0) * .35),
    bridgeIntent: clamp(bridgeIntent * 2.4),
    leadoutStrength: clamp(leadoutStrength * 2.2),
    protectLeaderStrength: clamp(protectLeaderStrength * 2.2),
    conserveIntent: clamp(conserveIntent * 2.2),
    aggressiveTeamCount,
    sprintControlTeamCount,
  }
}

export function buildFlatScenarioContextV1(
  input: UniversalRaceEngineInput,
  options: ApplyFlatScenarioOptionsV1 = {},
): FlatScenarioContextV1 {
  const gameDate = normalizeGameDate(options.gameDate)
  const history = options.history ?? []
  const raceHistory = history.filter((entry) => entry.raceId === input.race.raceId && entry.stageId !== input.stage.stageId)
  const dayHistory = gameDate === 'unknown' ? [] : history.filter((entry) => entry.gameDate === gameDate && entry.stageId !== input.stage.stageId)
  const percentages = input.stage.terrainPercentages
  const flatPct = finite(percentages.flat, input.stage.terrainType === 'flat' ? 100 : 0)
  const elevationPenalty = clamp(finite(input.stage.elevationGainM) / Math.max(1, finite(input.stage.distanceKm)) / 28)
  const flatScore = clamp(flatPct / 100 * .8 + (1 - elevationPenalty) * .2)
  const windStrength = clamp(finite(input.weather?.windKmh, 0) / 45)
  const crosswindRisk = clamp(normalizedRisk(input.weather?.crosswindRisk) * .72 + windStrength * .28)
  const rainRisk = input.weather?.rainProbabilityPct == null
    ? normalizedRisk(input.weather?.condition)
    : clamp(finite(input.weather.rainProbabilityPct) / 100)
  const temperature = finite(input.weather?.temperatureC, 20)
  const heatStress = clamp((temperature - 24) / 16)
  const sprintScores = input.riders.map((rider) => riderMetric(rider,'sprint')).sort((a,b) => b-a)
  const breakScores = input.riders.map((rider) => average([
    riderMetric(rider,'flat'), riderMetric(rider,'endurance'), riderMetric(rider,'resistance'), riderMetric(rider,'raceIQ'), riderMetric(rider,'overall'),
  ])).sort((a,b) => b-a)
  const fieldScores = input.riders.map((rider) => riderMetric(rider,'overall'))
  const fatigueScores = input.riders.map((rider) => clamp(finite((rider as unknown as Record<string,unknown>).fatigueBeforeStage,0) / 100))
  const tacticMetrics = teamPlanMetrics(input)
  const eliteSprinterCount = sprintScores.filter((value) => value >= .78).length
  const sprintDepth = clamp(average(sprintScores.slice(0,Math.max(3,Math.ceil(sprintScores.length*.12))),0))
  const breakawayQuality = clamp(average(breakScores.slice(0,Math.max(5,Math.ceil(breakScores.length*.15))),0))
  const fieldStrength = clamp(average(fieldScores,50)/100)
  const averageFatigue = clamp(average(fatigueScores,0))
  const fatigueSpread = fatigueScores.length > 1 ? clamp(Math.max(...fatigueScores)-Math.min(...fatigueScores)) : 0
  const fragmentationRisk = clamp(averageFatigue*.35 + fatigueSpread*.25 + crosswindRisk*.30 + Math.min(1,finite(input.stage.elevationGainM)/2200)*.10)
  const general = (input.preStageStandings ?? []).filter((row) => row.classificationType === 'general')
  const gcGaps = general.map((row) => finite(row.gapSeconds,0)).filter((gap) => gap >= 0)
  const closeGcRiders = gcGaps.filter((gap) => gap <= 120).length
  const gcPressure = general.length > 0 ? clamp(closeGcRiders / Math.min(12,general.length)) : .25
  const controlTeams = Math.max(1,tacticMetrics.sprintControlTeamCount)
  const responsibilityConcentration = clamp(1 - Math.min(1,controlTeams / Math.max(2,input.stagePlans.length*.35)))
  return {
    raceId: input.race.raceId,
    stageId: input.stage.stageId,
    gameDate,
    profile:{ flatScore,distanceKm:finite(input.stage.distanceKm),elevationGainM:finite(input.stage.elevationGainM),flatPct,hillyPct:finite(percentages.hilly),mountainPct:finite(percentages.mountain),cobbledPct:finite(percentages.cobbled),profileType:input.stage.profileType ?? null,finishType:input.stage.finishType ?? null },
    weather:{ windStrength,crosswindRisk,rainRisk,heatStress },
    field:{ starterCount:input.riders.length,sprintDepth,eliteSprinterCount,breakawayQuality,fieldStrength },
    tactics:tacticMetrics,
    condition:{ averageFatigue,fatigueSpread,fragmentationRisk },
    raceSituation:{ gcPressure,responsibilityConcentration },
    history:{ templatesUsedThisRace:raceHistory.map((entry)=>entry.templateId),familiesUsedThisRace:raceHistory.map((entry)=>entry.family),templatesUsedToday:dayHistory.map((entry)=>entry.templateId),familiesUsedToday:dayHistory.map((entry)=>entry.family) },
  }
}

function contextMetric(context: FlatScenarioContextV1, metric: ContextMetric): number {
  switch (metric) {
    case 'sprintControlStrength': return context.tactics.sprintControlStrength
    case 'chaseStrength': return context.tactics.chaseStrength
    case 'attackDensity': return context.tactics.attackDensity
    case 'bridgeIntent': return context.tactics.bridgeIntent
    case 'leadoutStrength': return context.tactics.leadoutStrength
    case 'protectLeaderStrength': return context.tactics.protectLeaderStrength
    case 'conserveIntent': return context.tactics.conserveIntent
    case 'sprintDepth': return context.field.sprintDepth
    case 'breakawayQuality': return context.field.breakawayQuality
    case 'fieldStrength': return context.field.fieldStrength
    case 'crosswindRisk': return context.weather.crosswindRisk
    case 'rainRisk': return context.weather.rainRisk
    case 'heatStress': return context.weather.heatStress
    case 'averageFatigue': return context.condition.averageFatigue
    case 'fragmentationRisk': return context.condition.fragmentationRisk
    case 'gcPressure': return context.raceSituation.gcPressure
    case 'responsibilityConcentration': return context.raceSituation.responsibilityConcentration
  }
}

function affinity(targets: FlatSelectionProfile, context: FlatScenarioContextV1, metrics: readonly ContextMetric[]): number {
  const targeted = metrics.filter((metric) => targets[metric] !== undefined)
  if (targeted.length === 0) return .72
  return average(targeted.map((metric) => 1 - Math.abs(contextMetric(context,metric) - finite(targets[metric],.5))),.72)
}

function rawTemplateScore(template: FlatScenarioTemplateV1, context: FlatScenarioContextV1): number {
  if (template.requiresCrosswind && context.weather.crosswindRisk < .55) return -1
  const profile = context.profile.flatScore * 20
  const tactics = affinity(template.targets,context,['sprintControlStrength','chaseStrength','attackDensity','bridgeIntent','leadoutStrength','protectLeaderStrength','conserveIntent']) * 25
  const field = affinity(template.targets,context,['sprintDepth','breakawayQuality','fieldStrength']) * 15
  const sprintBreak = average([
    1-Math.abs(context.tactics.sprintControlStrength-finite(template.targets.sprintControlStrength,.55)),
    1-Math.abs(context.field.breakawayQuality-finite(template.targets.breakawayQuality,.55)),
  ]) * 15
  const weather = affinity(template.targets,context,['crosswindRisk','rainRisk','heatStress']) * 10
  const raceSituation = affinity(template.targets,context,['gcPressure','responsibilityConcentration']) * 5
  const fatigue = affinity(template.targets,context,['averageFatigue','fragmentationRisk']) * 5
  const preparationNeutral = 3.75
  return Number((profile+tactics+field+sprintBreak+weather+raceSituation+fatigue+preparationNeutral).toFixed(4))
}

export function scoreFlatScenarioTemplatesV1(context: FlatScenarioContextV1): readonly FlatScenarioCandidateScoreV1[] {
  const raw = FLAT_SCENARIO_TEMPLATES_V1.map((template) => ({ template, rawScore:rawTemplateScore(template,context) }))
  const compatible = raw.filter((entry) => entry.rawScore >= 42)
  const usedRace = new Set(context.history.templatesUsedThisRace)
  const unusedCompatible = compatible.some((entry) => !usedRace.has(entry.template.id))
  const previousFamily = context.history.familiesUsedThisRace.at(-1) ?? null
  return raw.map(({template,rawScore}) => {
    if (rawScore < 0) return { templateId:template.id,family:template.family,rawScore,repetitionPenalty:0,finalScore:-1,excluded:true,exclusionReason:'hard_requirement_not_met' }
    if (rawScore < 42) return { templateId:template.id,family:template.family,rawScore,repetitionPenalty:0,finalScore:rawScore,excluded:true,exclusionReason:'compatibility_below_floor' }
    if (unusedCompatible && usedRace.has(template.id)) return { templateId:template.id,family:template.family,rawScore,repetitionPenalty:PENALTIES.sameRaceReuse,finalScore:rawScore+PENALTIES.sameRaceReuse,excluded:true,exclusionReason:'same_race_unused_compatible_alternative_exists' }
    let repetitionPenalty = 0
    if (!unusedCompatible && usedRace.has(template.id)) repetitionPenalty += PENALTIES.sameRaceReuse
    if (previousFamily === template.family) repetitionPenalty += PENALTIES.previousFamily
    if (context.history.templatesUsedToday.includes(template.id)) repetitionPenalty += PENALTIES.sameDayExact
    const sameDayFamilyUses = context.history.familiesUsedToday.filter((family) => family === template.family).length
    repetitionPenalty += Math.max(PENALTIES.sameDayFamilyCap, sameDayFamilyUses * PENALTIES.sameDayFamilyPerUse)
    return { templateId:template.id,family:template.family,rawScore,repetitionPenalty,finalScore:Number((rawScore+repetitionPenalty).toFixed(4)),excluded:false,exclusionReason:null }
  }).sort((left,right) => Number(left.excluded)-Number(right.excluded) || right.finalScore-left.finalScore || left.templateId.localeCompare(right.templateId))
}

function selectTemplate(context: FlatScenarioContextV1, selectionSeed: string) {
  const scores = scoreFlatScenarioTemplatesV1(context)
  const candidates = scores.filter((score) => !score.excluded).slice(0,3)
  const fallback = scores.filter((score) => score.rawScore >= 0).slice(0,3)
  const pool = candidates.length > 0 ? candidates : fallback
  if (pool.length === 0) return null
  const draw = unit(selectionSeed,'top3_weighted_draw')
  const index = pool.length === 1 ? 0 : pool.length === 2 ? (draw < .625 ? 0 : 1) : (draw < .5 ? 0 : draw < .8 ? 1 : 2)
  const selectedScore = pool[Math.min(index,pool.length-1)]
  const template = FLAT_SCENARIO_TEMPLATES_V1.find((row)=>row.id===selectedScore.templateId)!
  const compatibleIds = scores.filter((score)=>score.rawScore>=42).map((score)=>score.templateId)
  const raceUsed = new Set(context.history.templatesUsedThisRace)
  const dayUsed = new Set(context.history.templatesUsedToday)
  return {
    template,
    selectedScore,
    scores,
    repeatAllowedRace: compatibleIds.length>0 && compatibleIds.every((id)=>raceUsed.has(id)),
    repeatAllowedDay: compatibleIds.length>0 && compatibleIds.every((id)=>dayUsed.has(id)),
  }
}

function instantiateTemplate(template: FlatScenarioTemplateV1, seed: string) {
  return {
    breakaways:template.breakaways.map((directive,index)=>({
      generation:directive.generation,
      preferredSize:integerBetween(seed,`break:${index}:size`,directive.preferredSize),
      targetPeakGapSec:Math.round(between(seed,`break:${index}:gap`,directive.targetPeakGapSec)),
      formationPct:Number(between(seed,`break:${index}:formation`,directive.formationWindowPct).toFixed(4)),
      peakPct:Number(between(seed,`break:${index}:peak`,directive.peakWindowPct).toFixed(4)),
      chaseStartPct:directive.chaseStartWindowPct ? Number(between(seed,`break:${index}:chase`,directive.chaseStartWindowPct).toFixed(4)) : null,
      catchKmRemaining:directive.catchKmRemaining ? Number(between(seed,`break:${index}:catch_km`,directive.catchKmRemaining).toFixed(2)) : null,
      survivalTargetSec:directive.survivalTargetSec ? Math.round(between(seed,`break:${index}:survival`,directive.survivalTargetSec)) : null,
    })),
    fragmentationPressure:Number(between(seed,'fragmentation:pressure',template.fragmentation.pressure).toFixed(4)),
    targetFrontGroup:template.fragmentation.targetFrontGroup ? integerBetween(seed,'fragmentation:front_group',template.fragmentation.targetFrontGroup) : null,
    secondaryGapSec:template.fragmentation.secondaryGapSec ? Math.round(between(seed,'fragmentation:secondary_gap',template.fragmentation.secondaryGapSec)) : null,
  }
}

function riderScore(input: UniversalRaceEngineInput, riderId: string, mode: 'break'|'attack'|'sprint'|'leadout'|'work'): number {
  const rider = input.riders.find((row)=>row.riderId===riderId)
  if (!rider) return -1
  const flat=riderMetric(rider,'flat'), endurance=riderMetric(rider,'endurance'), resistance=riderMetric(rider,'resistance'), iq=riderMetric(rider,'raceIQ'), overall=riderMetric(rider,'overall'), sprint=riderMetric(rider,'sprint'), teamwork=riderMetric(rider,'teamwork')
  if (mode==='sprint') return sprint*.62+flat*.15+overall*.13+iq*.10
  if (mode==='leadout') return sprint*.30+flat*.18+endurance*.16+teamwork*.26+iq*.10
  if (mode==='work') return teamwork*.30+endurance*.25+flat*.20+resistance*.15+overall*.10
  if (mode==='attack') return flat*.20+endurance*.24+resistance*.18+iq*.20+overall*.18
  return flat*.18+endurance*.26+resistance*.20+iq*.18+overall*.18
}

function rankedRiders(input: UniversalRaceEngineInput, mode: Parameters<typeof riderScore>[2], seed: string): RiderPlan[] {
  const plans = input.stagePlans.flatMap((plan)=>plan.riders)
  return [...plans].sort((a,b)=> {
    const scoreDelta=riderScore(input,b.riderId,mode)-riderScore(input,a.riderId,mode)
    if (Math.abs(scoreDelta)>.000001) return scoreDelta
    return stableHash(`${seed}:${mode}:${a.riderId}`)-stableHash(`${seed}:${mode}:${b.riderId}`)
  })
}

function sprintTeamRanking(input: UniversalRaceEngineInput, seed: string): string[] {
  return input.stagePlans.map((plan)=>({ teamId:plan.teamId, score:Math.max(...plan.riders.map((rider)=>riderScore(input,rider.riderId,'sprint')),0) }))
    .sort((a,b)=>b.score-a.score || stableHash(`${seed}:team:${a.teamId}`)-stableHash(`${seed}:team:${b.teamId}`)).map((entry)=>entry.teamId)
}

function riderTeam(input: UniversalRaceEngineInput, riderId: string): string {
  return input.stagePlans.find((plan)=>plan.riders.some((rider)=>rider.riderId===riderId))?.teamId ?? ''
}

function commandForPhase(commands: RiderCommands, phase: PhaseNumber): PhaseCommand {
  if (phase===1) return commands.phase1
  if (phase===2) return commands.phase2
  if (phase===3) return commands.phase3
  return commands.phase4 as PhaseCommand
}

function setCommandForPhase(commands: RiderCommands, phase: PhaseNumber, command: PhaseCommand): RiderCommands {
  if (phase===1) return {...commands,phase1:command}
  if (phase===2) return {...commands,phase2:command}
  if (phase===3) return {...commands,phase3:command}
  return {...commands,phase4:command as RiderCommands['phase4']}
}

function applyDirector(
  input: UniversalRaceEngineInput,
  template: FlatScenarioTemplateV1,
  seed: string,
  explicit: ReadonlySet<string>,
): { input: UniversalRaceEngineInput; assignments: FlatScenarioAuditV1['appliedDirectives']['commandAssignments']; syntheticTeamTactics:number } {
  const assignments: { riderId:string;teamId:string;phase:PhaseNumber;command:string;reason:string }[]=[]
  let plans=input.stagePlans.map((plan)=>({...plan,riders:plan.riders.map((rider)=>({...rider,commands:{...rider.commands}}))}))
  const planByRider=()=>new Map(plans.flatMap((plan)=>plan.riders.map((rider)=>[rider.riderId,{plan,rider}] as const)))
  const teamRanking=sprintTeamRanking(input,seed)
  const breakRank=rankedRiders(input,'break',seed)
  const attackRank=rankedRiders(input,'attack',seed)
  const workRank=rankedRiders(input,'work',seed)
  const sprintRank=rankedRiders(input,'sprint',seed)
  const leadoutRank=rankedRiders(input,'leadout',seed)
  const touchedTeamTactic=new Map<string,string>()

  const assign=(riderId:string,phase:PhaseNumber,command:PhaseCommand,reason:string):boolean=>{
    if (explicit.has(`${riderId}:${phase}`)) return false
    const map=planByRider(); const row=map.get(riderId); if(!row) return false
    const current=commandForPhase(row.rider.commands,phase)
    if (current!=='follow_team_plan') return false
    plans=plans.map((plan)=>plan.teamId!==row.plan.teamId?plan:{...plan,riders:plan.riders.map((rider)=>rider.riderId!==riderId?rider:{...rider,commands:setCommandForPhase(rider.commands,phase,command)})})
    assignments.push({riderId,teamId:row.plan.teamId,phase,command:String(command),reason})
    return true
  }

  const spreadRiders=(ranked:readonly RiderPlan[],count:number,phase:PhaseNumber,command:PhaseCommand,reason:string)=>{
    const chosenTeams=new Set<string>(); let applied=0
    for(const rider of ranked){
      if(applied>=count) break
      const teamId=riderTeam(input,rider.riderId)
      if(chosenTeams.has(teamId) && chosenTeams.size<Math.min(count,input.stagePlans.length)) continue
      if(assign(rider.riderId,phase,command,reason)){ chosenTeams.add(teamId); applied+=1 }
    }
    if(applied<count){ for(const rider of ranked){ if(applied>=count) break; if(assign(rider.riderId,phase,command,reason)) applied+=1 } }
  }

  ;([1,2,3,4] as const).forEach((phase)=>{
    const directive=template.phases[`phase${phase}` as const]
    const breakCount=integerBetween(seed,`phase:${phase}:break_count`,directive.breakawayRiders)
    const attackCount=integerBetween(seed,`phase:${phase}:attack_count`,directive.attackRiders)+integerBetween(seed,`phase:${phase}:late_attack_count`,directive.lateAttackers)
    const controlCount=Math.min(teamRanking.length,integerBetween(seed,`phase:${phase}:control_teams`,directive.controlTeams))
    const chaseCount=Math.min(teamRanking.length,integerBetween(seed,`phase:${phase}:chase_teams`,directive.chaseTeams))
    spreadRiders(breakRank,breakCount,phase,'join_breakaway' as PhaseCommand,`${template.id}:breakaway_generation`)
    spreadRiders(attackRank,attackCount,phase,'attack' as PhaseCommand,`${template.id}:attack_pressure`)
    teamRanking.slice(0,controlCount).forEach((teamId)=>{
      const rider=workRank.find((row)=>riderTeam(input,row.riderId)===teamId)
      if(rider) assign(rider.riderId,phase,'control_race' as PhaseCommand,`${template.id}:control`)
      touchedTeamTactic.set(teamId,'sprint_control')
    })
    teamRanking.slice(0,chaseCount).forEach((teamId)=>{
      const rider=workRank.find((row)=>riderTeam(input,row.riderId)===teamId)
      if(rider) assign(rider.riderId,phase,'chase' as PhaseCommand,`${template.id}:chase`)
      touchedTeamTactic.set(teamId,'sprint_control')
    })
  })

  const breakTeams=new Set(assignments.filter((row)=>row.command==='join_breakaway').map((row)=>row.teamId))
  const attackTeams=new Set(assignments.filter((row)=>row.command==='attack').map((row)=>row.teamId))
  breakTeams.forEach((teamId)=>{ if(!touchedTeamTactic.has(teamId)) touchedTeamTactic.set(teamId,'breakaway') })
  attackTeams.forEach((teamId)=>{ if(!touchedTeamTactic.has(teamId)) touchedTeamTactic.set(teamId,'aggressive') })

  const finaleSprintTeams=teamRanking.slice(0,Math.min(4,Math.max(1,Math.ceil(input.stagePlans.length*.18))))
  if(['large_bunch_sprint','chaotic_bunch_sprint','reduced_sprint'].includes(template.finale.type)){
    finaleSprintTeams.forEach((teamId)=>{
      const sprinter=sprintRank.find((row)=>riderTeam(input,row.riderId)===teamId)
      const leadout=leadoutRank.find((row)=>riderTeam(input,row.riderId)===teamId && row.riderId!==sprinter?.riderId)
      if(sprinter) assign(sprinter.riderId,4,'final_sprint' as PhaseCommand,`${template.id}:final_sprint`)
      if(leadout) assign(leadout.riderId,4,'lead_out_rider' as PhaseCommand,`${template.id}:leadout`)
      touchedTeamTactic.set(teamId,'sprint_control')
    })
  }

  let syntheticTeamTactics=0
  plans=plans.map((plan)=>{
    const desired=touchedTeamTactic.get(plan.teamId)
    if(!desired || !plan.defaulted || plan.teamTactic===desired) return plan
    syntheticTeamTactics+=1
    return {...plan,teamTactic:desired}
  })
  return {input:{...input,stagePlans:plans},assignments,syntheticTeamTactics}
}

export function applyFlatScenarioV1(
  input: UniversalRaceEngineInput,
  options: ApplyFlatScenarioOptionsV1 = {},
): ApplyFlatScenarioResultV1 {
  if (input.stage.stageFormat !== 'road_race' || input.stage.terrainType !== 'flat') return {input,audit:null}
  const context=buildFlatScenarioContextV1(input,options)
  if(context.profile.flatScore<.58) return {input,audit:null}
  const selectionSeed=`${input.engine.deterministicSeed}:${input.stage.stageId}:${FLAT_SCENARIO_CATALOG_VERSION}`
  const selected=selectTemplate(context,selectionSeed)
  if(!selected) return {input,audit:null}
  const parameters=instantiateTemplate(selected.template,selectionSeed)
  const explicit=commandRowsExplicitSet(options.phaseCommandRows ?? [])
  const directed=applyDirector(input,selected.template,selectionSeed,explicit)
  const baseAudit: Omit<FlatScenarioAuditV1,'appliedDirectives'>={
    contract:'flat_scenario_selection_v1',scenarioType:FLAT_SCENARIO_TYPE,catalogVersion:FLAT_SCENARIO_CATALOG_VERSION,
    templateId:selected.template.id,templateVersion:1,templateLabel:selected.template.label,templateFamily:selected.template.family,similarityGroup:selected.template.similarityGroup,
    selectionSeed,compatibilityScore:selected.selectedScore.rawScore,gameDate:context.gameDate,contextSnapshot:context,candidateScores:selected.scores,
    repetitionPenalties:{exactTemplateSameRace:PENALTIES.sameRaceReuse,sameFamilyPreviousComparableStage:PENALTIES.previousFamily,exactTemplateSameDay:PENALTIES.sameDayExact,sameFamilySameDayPerUse:PENALTIES.sameDayFamilyPerUse,sameFamilySameDayCap:PENALTIES.sameDayFamilyCap},
    repeatAllowedRace:selected.repeatAllowedRace,repeatAllowedDay:selected.repeatAllowedDay,generatedParameters:parameters,
  }
  const audit:FlatScenarioAuditV1={...baseAudit,appliedDirectives:{syntheticCommands:directed.assignments.length,syntheticTeamTactics:directed.syntheticTeamTactics,commandAssignments:directed.assignments}}
  const stagePlans=directed.input.stagePlans.map((plan)=>({...plan,metadata:{...plan.metadata,flatScenarioV1:audit as unknown as Record<string,unknown>}}))
  return {input:{...directed.input,stagePlans},audit}
}

export function getFlatScenarioAuditV1(input: UniversalRaceEngineInput): FlatScenarioAuditV1 | null {
  const metadata=input.stagePlans[0]?.metadata as unknown as Record<string,unknown> | undefined
  const audit=metadata?.flatScenarioV1
  if(!audit || typeof audit!=='object' || Array.isArray(audit)) return null
  return audit as unknown as FlatScenarioAuditV1
}
