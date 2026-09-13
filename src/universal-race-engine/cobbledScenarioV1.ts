import type { UniversalRaceEngineInput } from './runRaceEngine.ts'

export const COBBLED_SCENARIO_CATALOG_VERSION = 'cobbled_catalog_v1' as const
export const COBBLED_SCENARIO_TYPE = 'cobbled' as const

export type CobbledNumericRange = readonly [number, number]
export type CobbledScenarioFamily =
  | 'controlled_sprint'
  | 'attritional'
  | 'sector_split'
  | 'dynamic_attack'
  | 'classics_group'
  | 'breakaway'
  | 'crosswind'
  | 'wet_cobbles'

export type CobbledScenarioFinale =
  | 'reduced_sprint'
  | 'small_group_sprint'
  | 'solo_finish'
  | 'breakaway_finish'
  | 'multi_group'
  | 'open'

export interface CobbledScenarioHistoryEntryV1 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly templateId: string
  readonly family: string
  readonly status?: string | null
}

export interface CobbledBreakawayDirectiveV1 {
  readonly generation: 1 | 2 | 3
  readonly formationWindowPct: CobbledNumericRange
  readonly preferredSize: CobbledNumericRange
  readonly targetPeakGapSec: CobbledNumericRange
  readonly peakWindowPct: CobbledNumericRange
  readonly chaseStartWindowPct?: CobbledNumericRange
  readonly catchKmRemaining?: CobbledNumericRange
  readonly survivalTargetSec?: CobbledNumericRange
}

export interface CobbledPhaseDirectiveV1 {
  readonly breakawayRiders: CobbledNumericRange
  readonly attackRiders: CobbledNumericRange
  readonly controlTeams: CobbledNumericRange
  readonly chaseTeams: CobbledNumericRange
  readonly lateAttackers: CobbledNumericRange
  readonly selectionPressure: 'low' | 'medium' | 'high' | 'very_high'
}

type CobbledContextMetric =
  | 'sprintControlStrength'
  | 'chaseStrength'
  | 'attackDensity'
  | 'bridgeIntent'
  | 'protectLeaderStrength'
  | 'cobbleDepth'
  | 'sprintDepth'
  | 'breakawayQuality'
  | 'fieldStrength'
  | 'crosswindRisk'
  | 'rainRisk'
  | 'surfaceRisk'
  | 'averageFatigue'
  | 'fragmentationRisk'
  | 'responsibilityConcentration'

export interface CobbledScenarioTemplateV1 {
  readonly id: string
  readonly label: string
  readonly version: 1
  readonly family: CobbledScenarioFamily
  readonly similarityGroup: string
  readonly requiresCrosswind?: boolean
  readonly requiresWetRisk?: boolean
  readonly targets: Readonly<Partial<Record<CobbledContextMetric, number>>>
  readonly phases: {
    readonly phase1: CobbledPhaseDirectiveV1
    readonly phase2: CobbledPhaseDirectiveV1
    readonly phase3: CobbledPhaseDirectiveV1
    readonly phase4: CobbledPhaseDirectiveV1
  }
  readonly breakaways: readonly CobbledBreakawayDirectiveV1[]
  readonly fragmentation: {
    readonly pressure: CobbledNumericRange
    readonly targetFrontGroup?: CobbledNumericRange
    readonly secondaryGapSec?: CobbledNumericRange
    readonly allowRegroup: boolean
  }
  readonly finale: {
    readonly type: CobbledScenarioFinale
    readonly expectedFrontGroup?: CobbledNumericRange
  }
  readonly deviation: {
    readonly mayConvertToBreakWin: boolean
    readonly mayConvertToCatch: boolean
    readonly commandOverrideAllowed: true
  }
}

export interface CobbledScenarioContextV1 {
  readonly raceId: string
  readonly stageId: string
  readonly gameDate: string
  readonly profile: {
    readonly cobbledScore: number
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
    readonly crosswindRisk: number
    readonly rainRisk: number
    readonly surfaceRisk: number
  }
  readonly field: {
    readonly starterCount: number
    readonly cobbleDepth: number
    readonly sprintDepth: number
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
    readonly responsibilityConcentration: number
  }
  readonly history: {
    readonly templatesUsedThisRace: readonly string[]
    readonly familiesUsedThisRace: readonly string[]
    readonly templatesUsedToday: readonly string[]
    readonly familiesUsedToday: readonly string[]
  }
}

export interface CobbledScenarioCandidateScoreV1 {
  readonly templateId: string
  readonly family: CobbledScenarioFamily
  readonly rawScore: number
  readonly repetitionPenalty: number
  readonly finalScore: number
  readonly excluded: boolean
  readonly exclusionReason: string | null
}

export interface CobbledScenarioAuditV1 {
  readonly contract: 'cobbled_scenario_selection_v1'
  readonly scenarioType: typeof COBBLED_SCENARIO_TYPE
  readonly catalogVersion: typeof COBBLED_SCENARIO_CATALOG_VERSION
  readonly templateId: string
  readonly templateVersion: 1
  readonly templateLabel: string
  readonly templateFamily: CobbledScenarioFamily
  readonly similarityGroup: string
  readonly selectionSeed: string
  readonly compatibilityScore: number
  readonly gameDate: string
  readonly contextSnapshot: CobbledScenarioContextV1
  readonly candidateScores: readonly CobbledScenarioCandidateScoreV1[]
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

export interface ApplyCobbledScenarioOptionsV1 {
  readonly gameDate?: string | null
  readonly phaseCommandRows?: readonly Record<string, unknown>[]
  readonly history?: readonly CobbledScenarioHistoryEntryV1[]
}

export interface ApplyCobbledScenarioResultV1 {
  readonly input: UniversalRaceEngineInput
  readonly audit: CobbledScenarioAuditV1 | null
}

type PhaseNumber = 1 | 2 | 3 | 4
type RiderPlan = UniversalRaceEngineInput['stagePlans'][number]['riders'][number]
type RiderCommands = RiderPlan['commands']
type PhaseCommand = RiderCommands['phase1']
type CobbledSelectionProfile = Readonly<Partial<Record<CobbledContextMetric, number>>>

const PENALTIES = {
  sameRaceReuse: -45,
  previousFamily: -20,
  sameDayExact: -30,
  sameDayFamilyPerUse: -5,
  sameDayFamilyCap: -15,
} as const

function r(min: number, max: number): CobbledNumericRange { return [min, max] }
function p(
  breakawayRiders: CobbledNumericRange,
  attackRiders: CobbledNumericRange,
  controlTeams: CobbledNumericRange,
  chaseTeams: CobbledNumericRange,
  lateAttackers: CobbledNumericRange,
  selectionPressure: CobbledPhaseDirectiveV1['selectionPressure'],
): CobbledPhaseDirectiveV1 {
  return { breakawayRiders, attackRiders, controlTeams, chaseTeams, lateAttackers, selectionPressure }
}
function b(
  generation: 1 | 2 | 3,
  formationWindowPct: CobbledNumericRange,
  preferredSize: CobbledNumericRange,
  targetPeakGapSec: CobbledNumericRange,
  peakWindowPct: CobbledNumericRange,
  chaseStartWindowPct?: CobbledNumericRange,
  catchKmRemaining?: CobbledNumericRange,
  survivalTargetSec?: CobbledNumericRange,
): CobbledBreakawayDirectiveV1 {
  return { generation, formationWindowPct, preferredSize, targetPeakGapSec, peakWindowPct, chaseStartWindowPct, catchKmRemaining, survivalTargetSec }
}
function t(config: Omit<CobbledScenarioTemplateV1, 'version' | 'deviation'>): CobbledScenarioTemplateV1 {
  return {
    ...config,
    version: 1,
    deviation: { mayConvertToBreakWin: true, mayConvertToCatch: true, commandOverrideAllowed: true },
  }
}

export const COBBLED_SCENARIO_TEMPLATES_V1: readonly CobbledScenarioTemplateV1[] = [
  t({ id:'cobbled_01_controlled_break_reduced_sprint', label:'Controlled Break / Cobbled Reduced Sprint', family:'controlled_sprint', similarityGroup:'controlled_classic', targets:{sprintControlStrength:.78,chaseStrength:.76,cobbleDepth:.82,sprintDepth:.70,fragmentationRisk:.62}, phases:{phase1:p(r(3,7),r(0,1),r(1,3),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(0,1),r(1,3),r(1,2),r(0,0),'high'),phase3:p(r(0,0),r(1,2),r(1,3),r(2,4),r(0,1),'very_high'),phase4:p(r(0,0),r(2,4),r(1,2),r(2,4),r(1,2),'very_high')}, breakaways:[b(1,r(.03,.15),r(3,7),r(150,330),r(.24,.44),r(.46,.62),r(12,28))], fragmentation:{pressure:r(.56,.74),targetFrontGroup:r(35,75),secondaryGapSec:r(12,65),allowRegroup:false}, finale:{type:'reduced_sprint',expectedFrontGroup:r(35,75)} }),
  t({ id:'cobbled_02_attritional_classic', label:'Cobbled Attrition', family:'attritional', similarityGroup:'steady_attrition', targets:{cobbleDepth:.84,averageFatigue:.68,fragmentationRisk:.82,fieldStrength:.74}, phases:{phase1:p(r(3,7),r(0,1),r(1,2),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(1,2),r(1,3),r(0,1),'high'),phase3:p(r(0,0),r(1,3),r(1,2),r(2,4),r(1,2),'very_high'),phase4:p(r(0,0),r(2,4),r(0,2),r(2,4),r(1,3),'very_high')}, breakaways:[b(1,r(.03,.15),r(3,7),r(120,300),r(.22,.42),r(.42,.58),r(16,32))], fragmentation:{pressure:r(.74,.90),targetFrontGroup:r(20,55),secondaryGapSec:r(20,110),allowRegroup:false}, finale:{type:'reduced_sprint',expectedFrontGroup:r(20,55)} }),
  t({ id:'cobbled_03_early_sector_split_holds', label:'Early Sector Split Holds', family:'sector_split', similarityGroup:'early_split', targets:{attackDensity:.68,cobbleDepth:.88,fragmentationRisk:.86,chaseStrength:.60}, phases:{phase1:p(r(3,6),r(1,2),r(1,2),r(0,1),r(0,0),'high'),phase2:p(r(0,0),r(2,4),r(1,2),r(1,3),r(1,2),'very_high'),phase3:p(r(0,0),r(2,4),r(0,2),r(1,3),r(1,3),'very_high'),phase4:p(r(0,0),r(2,5),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.13),r(3,6),r(90,240),r(.18,.34),r(.34,.48),r(28,45))], fragmentation:{pressure:r(.80,.94),targetFrontGroup:r(15,40),secondaryGapSec:r(25,140),allowRegroup:false}, finale:{type:'multi_group',expectedFrontGroup:r(15,40)} }),
  t({ id:'cobbled_04_split_then_regroup', label:'Sector Split / Late Regroup', family:'sector_split', similarityGroup:'split_regroup', targets:{cobbleDepth:.78,fragmentationRisk:.64,chaseStrength:.74,sprintDepth:.72}, phases:{phase1:p(r(3,6),r(1,2),r(1,2),r(0,1),r(0,0),'high'),phase2:p(r(0,0),r(2,4),r(1,3),r(1,3),r(0,1),'very_high'),phase3:p(r(0,0),r(1,2),r(1,3),r(2,4),r(0,1),'medium'),phase4:p(r(0,0),r(1,3),r(1,3),r(2,4),r(1,2),'high')}, breakaways:[b(1,r(.03,.14),r(3,6),r(120,270),r(.20,.40),r(.40,.56),r(20,36))], fragmentation:{pressure:r(.48,.66),targetFrontGroup:r(55,95),secondaryGapSec:r(8,45),allowRegroup:true}, finale:{type:'reduced_sprint',expectedFrontGroup:r(55,95)} }),
  t({ id:'cobbled_05_repeated_sector_attacks', label:'Repeated Sector Attacks', family:'dynamic_attack', similarityGroup:'sector_attack_waves', targets:{attackDensity:.95,bridgeIntent:.88,cobbleDepth:.86,chaseStrength:.66}, phases:{phase1:p(r(2,5),r(1,3),r(1,2),r(1,2),r(0,0),'high'),phase2:p(r(2,6),r(2,5),r(1,2),r(1,3),r(1,2),'very_high'),phase3:p(r(1,5),r(3,6),r(0,2),r(1,3),r(2,4),'very_high'),phase4:p(r(0,0),r(3,6),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.13),r(2,5),r(45,150),r(.14,.28),r(.24,.38),r(60,85)),b(2,r(.30,.50),r(2,6),r(60,210),r(.40,.56),r(.48,.64),r(28,50)),b(3,r(.58,.76),r(1,5),r(30,150),r(.66,.80),r(.72,.86),r(5,20))], fragmentation:{pressure:r(.78,.94),targetFrontGroup:r(8,30),secondaryGapSec:r(18,120),allowRegroup:false}, finale:{type:'open',expectedFrontGroup:r(2,30)} }),
  t({ id:'cobbled_06_elite_classics_group', label:'Elite Classics Group', family:'classics_group', similarityGroup:'elite_group', targets:{cobbleDepth:.94,attackDensity:.78,fragmentationRisk:.90,fieldStrength:.84}, phases:{phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,3),r(1,2),r(1,3),r(1,2),'high'),phase3:p(r(0,0),r(3,6),r(0,2),r(1,3),r(2,4),'very_high'),phase4:p(r(0,0),r(3,6),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.03,.14),r(3,6),r(120,270),r(.20,.40),r(.40,.56),r(18,32))], fragmentation:{pressure:r(.86,.96),targetFrontGroup:r(4,12),secondaryGapSec:r(20,130),allowRegroup:false}, finale:{type:'small_group_sprint',expectedFrontGroup:r(4,12)} }),
  t({ id:'cobbled_07_final_sector_solo', label:'Final Sector Solo Attack', family:'classics_group', similarityGroup:'final_sector_solo', targets:{cobbleDepth:.94,attackDensity:.86,fragmentationRisk:.92,fieldStrength:.82}, phases:{phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'medium'),phase2:p(r(0,0),r(1,2),r(1,2),r(1,3),r(0,1),'high'),phase3:p(r(0,0),r(2,4),r(0,2),r(1,3),r(1,3),'very_high'),phase4:p(r(0,0),r(4,7),r(0,1),r(1,3),r(3,5),'very_high')}, breakaways:[b(1,r(.03,.14),r(3,6),r(120,270),r(.20,.40),r(.40,.56),r(16,30))], fragmentation:{pressure:r(.90,.98),targetFrontGroup:r(1,1),secondaryGapSec:r(15,100),allowRegroup:false}, finale:{type:'solo_finish',expectedFrontGroup:r(1,1)} }),
  t({ id:'cobbled_08_breakaway_victory', label:'Cobbled Breakaway Victory', family:'breakaway', similarityGroup:'break_survival', targets:{breakawayQuality:.86,attackDensity:.72,chaseStrength:.32,responsibilityConcentration:.30,cobbleDepth:.82}, phases:{phase1:p(r(4,9),r(1,2),r(0,1),r(0,0),r(0,0),'high'),phase2:p(r(0,0),r(1,2),r(0,1),r(0,1),r(0,0),'medium'),phase3:p(r(0,0),r(2,4),r(0,1),r(0,2),r(1,2),'high'),phase4:p(r(0,0),r(2,4),r(0,1),r(0,2),r(1,3),'very_high')}, breakaways:[b(1,r(.02,.15),r(4,9),r(300,600),r(.30,.56),r(.62,.80),undefined,r(10,120))], fragmentation:{pressure:r(.74,.92),targetFrontGroup:r(2,6),secondaryGapSec:r(20,120),allowRegroup:false}, finale:{type:'breakaway_finish',expectedFrontGroup:r(2,6)} }),
  t({ id:'cobbled_09_crosswind_echelons', label:'Crosswind + Cobbles Echelons', family:'crosswind', similarityGroup:'crosswind_cobbles', requiresCrosswind:true, targets:{crosswindRisk:.84,cobbleDepth:.84,fragmentationRisk:.90,protectLeaderStrength:.74}, phases:{phase1:p(r(3,6),r(0,1),r(1,2),r(0,1),r(0,0),'high'),phase2:p(r(0,0),r(2,4),r(1,2),r(1,3),r(1,2),'very_high'),phase3:p(r(0,0),r(2,5),r(0,2),r(1,3),r(1,3),'very_high'),phase4:p(r(0,0),r(2,5),r(0,1),r(1,3),r(2,4),'very_high')}, breakaways:[b(1,r(.02,.14),r(3,6),r(120,300),r(.20,.40),r(.40,.56),r(20,36))], fragmentation:{pressure:r(.86,.97),targetFrontGroup:r(15,45),secondaryGapSec:r(30,180),allowRegroup:false}, finale:{type:'multi_group',expectedFrontGroup:r(15,45)} }),
  t({ id:'cobbled_10_wet_cobbles_chaos', label:'Wet Cobbles Chaos', family:'wet_cobbles', similarityGroup:'wet_chaos', requiresWetRisk:true, targets:{rainRisk:.82,surfaceRisk:.88,cobbleDepth:.86,fragmentationRisk:.94,attackDensity:.78}, phases:{phase1:p(r(3,7),r(1,2),r(1,2),r(0,1),r(0,0),'high'),phase2:p(r(0,3),r(2,4),r(1,2),r(1,3),r(1,2),'very_high'),phase3:p(r(0,3),r(3,6),r(0,2),r(1,3),r(2,4),'very_high'),phase4:p(r(0,0),r(3,7),r(0,1),r(1,3),r(2,5),'very_high')}, breakaways:[b(1,r(.02,.14),r(3,7),r(120,300),r(.20,.40),r(.40,.56),r(20,34)),b(2,r(.50,.70),r(2,5),r(45,180),r(.60,.76),r(.68,.82),r(6,18))], fragmentation:{pressure:r(.92,.995),targetFrontGroup:r(3,18),secondaryGapSec:r(35,220),allowRegroup:false}, finale:{type:'open',expectedFrontGroup:r(2,18)} }),
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
function between(seed: string, key: string, range: CobbledNumericRange): number { return range[0] + (range[1] - range[0]) * unit(seed, key) }
function integerBetween(seed: string, key: string, range: CobbledNumericRange): number {
  const min = Math.ceil(range[0]), max = Math.floor(range[1])
  return max <= min ? min : min + stableHash(`${seed}:${key}`) % (max - min + 1)
}
function average(values: readonly number[], fallback = 0): number { return values.length ? values.reduce((a,b)=>a+b,0) / values.length : fallback }
function normalizedRisk(value: unknown): number {
  const raw = String(value ?? '').trim().toLowerCase()
  if (['extreme','very_high','very high'].includes(raw)) return .95
  if (['high','strong','wet','poor'].includes(raw)) return .78
  if (['medium','moderate','damp'].includes(raw)) return .52
  if (['low','light','dry','good'].includes(raw)) return .25
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
  const controlTeams=plans.filter((plan)=>['sprint_control','gc_protection','balanced'].includes(plan.teamTactic)).length
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

export function buildCobbledScenarioContextV1(input: UniversalRaceEngineInput, options: ApplyCobbledScenarioOptionsV1 = {}): CobbledScenarioContextV1 {
  const gameDate=normalizeGameDate(options.gameDate)
  const history=options.history ?? []
  const raceHistory=history.filter((h)=>h.raceId===input.race.raceId&&h.stageId!==input.stage.stageId)
  const dayHistory=gameDate==='unknown'?[]:history.filter((h)=>h.gameDate===gameDate&&h.stageId!==input.stage.stageId)
  const tp=input.stage.terrainPercentages
  const cobbledPct=finite(tp.cobbled,input.stage.terrainType==='cobbled'?100:0)
  const finishBonus=input.stage.finishType==='cobbled_finish'?1:.25
  const cobbledScore=clamp(cobbledPct/100*.72+finite(tp.hilly)/100*.06+finite(tp.flat)/100*.06+finishBonus*.16)
  const windStrength=clamp(finite(input.weather?.windKmh,0)/45)
  const crosswindRisk=clamp(normalizedRisk(input.weather?.crosswindRisk)*.72+windStrength*.28)
  const rainRisk=input.weather?.rainProbabilityPct==null?normalizedRisk(input.weather?.condition):clamp(finite(input.weather.rainProbabilityPct)/100)
  const surfaceRisk=clamp(normalizedRisk(input.weather?.surfaceRisk)*.72+rainRisk*.28)
  const cobble=input.riders.map((r)=>average([riderMetric(r,'flat')*.24,riderMetric(r,'resistance')*.24,riderMetric(r,'endurance')*.18,riderMetric(r,'raceIQ')*.14,riderMetric(r,'overall')*.10,riderMetric(r,'sprint')*.10])).sort((a,b)=>b-a)
  const sprint=input.riders.map((r)=>average([riderMetric(r,'sprint')*.52,riderMetric(r,'flat')*.18,riderMetric(r,'resistance')*.12,riderMetric(r,'raceIQ')*.10,riderMetric(r,'overall')*.08])).sort((a,b)=>b-a)
  const breaks=input.riders.map((r)=>average([riderMetric(r,'flat')*.22,riderMetric(r,'resistance')*.24,riderMetric(r,'endurance')*.22,riderMetric(r,'raceIQ')*.16,riderMetric(r,'overall')*.10,riderMetric(r,'sprint')*.06])).sort((a,b)=>b-a)
  const field=input.riders.map((r)=>riderMetric(r,'overall'))
  const fatigue=input.riders.map((r)=>clamp(finite((r as unknown as Record<string,unknown>).fatigueBeforeStage)/100))
  const metrics=planMetrics(input)
  const cobbleDepth=average(cobble.slice(0,Math.max(5,Math.ceil(cobble.length*.18))),.5)
  const sprintDepth=average(sprint.slice(0,Math.max(4,Math.ceil(sprint.length*.14))),.5)
  const breakawayQuality=average(breaks.slice(0,Math.max(5,Math.ceil(breaks.length*.16))),.5)
  const fieldStrength=average(field,.5)
  const averageFatigue=average(fatigue,0)
  const fatigueSpread=fatigue.length>1?Math.max(...fatigue)-Math.min(...fatigue):0
  const fragmentationRisk=clamp(cobbledScore*.30+cobbleDepth*.18+averageFatigue*.16+fatigueSpread*.12+crosswindRisk*.12+surfaceRisk*.12)
  const responsibilityConcentration=clamp(1-Math.min(1,Math.max(1,metrics.controlTeamCount)/Math.max(2,input.stagePlans.length*.35)))
  return {
    raceId:input.race.raceId,stageId:input.stage.stageId,gameDate,
    profile:{cobbledScore,distanceKm:finite(input.stage.distanceKm),elevationGainM:finite(input.stage.elevationGainM),flatPct:finite(tp.flat),hillyPct:finite(tp.hilly),mountainPct:finite(tp.mountain),cobbledPct,profileType:input.stage.profileType??null,finishType:input.stage.finishType??null},
    weather:{crosswindRisk,rainRisk,surfaceRisk},
    field:{starterCount:input.riders.length,cobbleDepth,sprintDepth,breakawayQuality,fieldStrength},
    tactics:metrics,
    condition:{averageFatigue,fatigueSpread,fragmentationRisk},
    raceSituation:{responsibilityConcentration},
    history:{templatesUsedThisRace:raceHistory.map((h)=>h.templateId),familiesUsedThisRace:raceHistory.map((h)=>h.family),templatesUsedToday:dayHistory.map((h)=>h.templateId),familiesUsedToday:dayHistory.map((h)=>h.family)},
  }
}

function metric(context:CobbledScenarioContextV1,key:CobbledContextMetric):number {
  switch(key){
    case 'sprintControlStrength':return context.tactics.sprintControlStrength
    case 'chaseStrength':return context.tactics.chaseStrength
    case 'attackDensity':return context.tactics.attackDensity
    case 'bridgeIntent':return context.tactics.bridgeIntent
    case 'protectLeaderStrength':return context.tactics.protectLeaderStrength
    case 'cobbleDepth':return context.field.cobbleDepth
    case 'sprintDepth':return context.field.sprintDepth
    case 'breakawayQuality':return context.field.breakawayQuality
    case 'fieldStrength':return context.field.fieldStrength
    case 'crosswindRisk':return context.weather.crosswindRisk
    case 'rainRisk':return context.weather.rainRisk
    case 'surfaceRisk':return context.weather.surfaceRisk
    case 'averageFatigue':return context.condition.averageFatigue
    case 'fragmentationRisk':return context.condition.fragmentationRisk
    case 'responsibilityConcentration':return context.raceSituation.responsibilityConcentration
  }
}
function affinity(targets:CobbledSelectionProfile,context:CobbledScenarioContextV1,keys:readonly CobbledContextMetric[]):number {
  const selected=keys.filter((k)=>targets[k]!==undefined)
  return selected.length?average(selected.map((k)=>1-Math.abs(metric(context,k)-finite(targets[k],.5))),.72):.72
}
function rawScore(template:CobbledScenarioTemplateV1,context:CobbledScenarioContextV1):number {
  if(template.requiresCrosswind&&context.weather.crosswindRisk<.55)return -1
  if(template.requiresWetRisk&&Math.max(context.weather.rainRisk,context.weather.surfaceRisk)<.55)return -1
  const profile=context.profile.cobbledScore*20
  const tactics=affinity(template.targets,context,['sprintControlStrength','chaseStrength','attackDensity','bridgeIntent','protectLeaderStrength'])*25
  const field=affinity(template.targets,context,['cobbleDepth','sprintDepth','breakawayQuality','fieldStrength'])*20
  const weather=affinity(template.targets,context,['crosswindRisk','rainRisk','surfaceRisk'])*15
  const condition=affinity(template.targets,context,['averageFatigue','fragmentationRisk'])*10
  const race=affinity(template.targets,context,['responsibilityConcentration'])*10
  return Number((profile+tactics+field+weather+condition+race).toFixed(4))
}
export function scoreCobbledScenarioTemplatesV1(context:CobbledScenarioContextV1):readonly CobbledScenarioCandidateScoreV1[]{
  const raw=COBBLED_SCENARIO_TEMPLATES_V1.map((template)=>({template,rawScore:rawScore(template,context)}))
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
function selectTemplate(context:CobbledScenarioContextV1,seed:string){
  const scores=scoreCobbledScenarioTemplatesV1(context)
  const pool=scores.filter((s)=>!s.excluded).slice(0,3)
  const fallback=scores.filter((s)=>s.rawScore>=0).slice(0,3)
  const candidates=pool.length?pool:fallback
  if(!candidates.length)return null
  const draw=unit(seed,'top3_weighted_draw')
  const index=candidates.length===1?0:candidates.length===2?(draw<.625?0:1):(draw<.5?0:draw<.8?1:2)
  const selected=candidates[index]
  const template=COBBLED_SCENARIO_TEMPLATES_V1.find((t)=>t.id===selected.templateId)!
  return{template,selected,scores}
}
function instantiate(template:CobbledScenarioTemplateV1,seed:string){
  return{
    breakaways:template.breakaways.map((d,i)=>({generation:d.generation,preferredSize:integerBetween(seed,`break:${i}:size`,d.preferredSize),targetPeakGapSec:Math.round(between(seed,`break:${i}:gap`,d.targetPeakGapSec)),formationPct:Number(between(seed,`break:${i}:formation`,d.formationWindowPct).toFixed(4)),peakPct:Number(between(seed,`break:${i}:peak`,d.peakWindowPct).toFixed(4)),chaseStartPct:d.chaseStartWindowPct?Number(between(seed,`break:${i}:chase`,d.chaseStartWindowPct).toFixed(4)):null,catchKmRemaining:d.catchKmRemaining?Number(between(seed,`break:${i}:catch`,d.catchKmRemaining).toFixed(2)):null,survivalTargetSec:d.survivalTargetSec?Math.round(between(seed,`break:${i}:survival`,d.survivalTargetSec)):null})),
    fragmentationPressure:Number(between(seed,'fragmentation:pressure',template.fragmentation.pressure).toFixed(4)),
    targetFrontGroup:template.fragmentation.targetFrontGroup?integerBetween(seed,'fragmentation:front',template.fragmentation.targetFrontGroup):null,
    secondaryGapSec:template.fragmentation.secondaryGapSec?Math.round(between(seed,'fragmentation:gap',template.fragmentation.secondaryGapSec)):null,
  }
}

function riderScore(input:UniversalRaceEngineInput,riderId:string,mode:'break'|'attack'|'work'|'finish'):number{
  const rider=input.riders.find((r)=>r.riderId===riderId); if(!rider)return-1
  const flat=riderMetric(rider,'flat'),endurance=riderMetric(rider,'endurance'),resistance=riderMetric(rider,'resistance'),iq=riderMetric(rider,'raceIQ'),overall=riderMetric(rider,'overall'),teamwork=riderMetric(rider,'teamwork'),sprint=riderMetric(rider,'sprint')
  if(mode==='finish')return flat*.22+resistance*.24+endurance*.14+iq*.12+sprint*.20+overall*.08
  if(mode==='work')return teamwork*.28+endurance*.24+flat*.18+resistance*.16+iq*.08+overall*.06
  if(mode==='attack')return resistance*.24+flat*.20+endurance*.18+iq*.18+overall*.10+sprint*.10
  return resistance*.24+endurance*.24+flat*.20+iq*.16+overall*.10+sprint*.06
}
function ranked(input:UniversalRaceEngineInput,mode:'break'|'attack'|'work'|'finish',seed:string):RiderPlan[]{
  return [...input.stagePlans.flatMap((p)=>p.riders)].sort((a,b)=>riderScore(input,b.riderId,mode)-riderScore(input,a.riderId,mode)||stableHash(`${seed}:${a.riderId}`)-stableHash(`${seed}:${b.riderId}`))
}
function riderTeam(input:UniversalRaceEngineInput,riderId:string):string{return input.stagePlans.find((p)=>p.riders.some((r)=>r.riderId===riderId))?.teamId??''}
function commandFor(commands:RiderCommands,phase:PhaseNumber):PhaseCommand{return phase===1?commands.phase1:phase===2?commands.phase2:phase===3?commands.phase3:commands.phase4 as PhaseCommand}
function setCommand(commands:RiderCommands,phase:PhaseNumber,command:PhaseCommand):RiderCommands{
  if(phase===1)return{...commands,phase1:command};if(phase===2)return{...commands,phase2:command};if(phase===3)return{...commands,phase3:command};return{...commands,phase4:command as RiderCommands['phase4']}
}
function applyDirector(input:UniversalRaceEngineInput,template:CobbledScenarioTemplateV1,seed:string,explicit:ReadonlySet<string>,aiTeams:ReadonlySet<string>){
  const assignments:CobbledScenarioAuditV1['appliedDirectives']['commandAssignments'][number][]=[]
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
    teamRanking.slice(0,control).forEach((teamId)=>{const rider=workRank.find((r)=>riderTeam(input,r.riderId)===teamId);if(rider)assign(rider.riderId,phase,'control_race' as PhaseCommand,`${template.id}:control`);touched.set(teamId,template.family==='controlled_sprint'?'sprint_control':'balanced')})
    teamRanking.slice(0,chase).forEach((teamId)=>{const rider=workRank.find((r)=>riderTeam(input,r.riderId)===teamId);if(rider)assign(rider.riderId,phase,'chase' as PhaseCommand,`${template.id}:chase`)})
  })
  const breakTeams=new Set(assignments.filter((a)=>a.command==='join_breakaway').map((a)=>a.teamId));breakTeams.forEach((team)=>{if(!touched.has(team))touched.set(team,'breakaway')})
  const attackTeams=new Set(assignments.filter((a)=>a.command==='attack').map((a)=>a.teamId));attackTeams.forEach((team)=>{if(!touched.has(team))touched.set(team,'aggressive')})
  if(['reduced_sprint','small_group_sprint'].includes(template.finale.type)){
    teamRanking.slice(0,Math.min(4,Math.max(1,Math.ceil(input.stagePlans.length*.20)))).forEach((teamId)=>{const rider=finishRank.find((r)=>riderTeam(input,r.riderId)===teamId);if(rider)assign(rider.riderId,4,'final_sprint' as PhaseCommand,`${template.id}:classics_finish`)})
  }
  let syntheticTeamTactics=0
  plans=plans.map((plan)=>{const desired=touched.get(plan.teamId);if(!desired||(!plan.defaulted&&!aiTeams.has(plan.teamId))||plan.teamTactic===desired)return plan;syntheticTeamTactics++;return{...plan,teamTactic:desired}})
  return{input:{...input,stagePlans:plans},assignments,syntheticTeamTactics}
}

export function applyCobbledScenarioV1(input:UniversalRaceEngineInput,options:ApplyCobbledScenarioOptionsV1={}):ApplyCobbledScenarioResultV1{
  if(input.stage.stageFormat!=='road_race'||input.stage.terrainType!=='cobbled')return{input,audit:null}
  const context=buildCobbledScenarioContextV1(input,options)
  if(context.profile.cobbledScore<.46)return{input,audit:null}
  const seed=`cobbled-scenario:${input.race.raceId}:${input.stage.stageId}:${COBBLED_SCENARIO_CATALOG_VERSION}`
  const persisted=(options.history??[]).find((h)=>h.stageId===input.stage.stageId)?.templateId??null
  let selected=selectTemplate(context,seed)
  if(persisted){const template=COBBLED_SCENARIO_TEMPLATES_V1.find((t)=>t.id===persisted);if(template){const scores=scoreCobbledScenarioTemplatesV1(context);selected={template,selected:scores.find((s)=>s.templateId===template.id)??{templateId:template.id,family:template.family,rawScore:rawScore(template,context),repetitionPenalty:0,finalScore:rawScore(template,context),excluded:false,exclusionReason:null},scores}}}
  if(!selected)return{input,audit:null}
  const parameters=instantiate(selected.template,seed)
  const aiTeams=scenarioAiControlledTeamIds(input)
  const explicit=explicitHumanCommands(options.phaseCommandRows??[],aiTeams)
  const directed=applyDirector(input,selected.template,seed,explicit,aiTeams)
  const audit:CobbledScenarioAuditV1={contract:'cobbled_scenario_selection_v1',scenarioType:COBBLED_SCENARIO_TYPE,catalogVersion:COBBLED_SCENARIO_CATALOG_VERSION,templateId:selected.template.id,templateVersion:1,templateLabel:selected.template.label,templateFamily:selected.template.family,similarityGroup:selected.template.similarityGroup,selectionSeed:seed,compatibilityScore:selected.selected.rawScore,gameDate:context.gameDate,contextSnapshot:context,candidateScores:selected.scores,generatedParameters:parameters,appliedDirectives:{syntheticCommands:directed.assignments.length,syntheticTeamTactics:directed.syntheticTeamTactics,commandAssignments:directed.assignments}}
  const stagePlans=directed.input.stagePlans.map((plan,index)=>index===0?({...plan,metadata:{...plan.metadata,cobbledScenarioV1:audit as unknown as Record<string,unknown>}}):plan)
  return{input:{...directed.input,stagePlans},audit}
}

export function getCobbledScenarioAuditV1(input:UniversalRaceEngineInput):CobbledScenarioAuditV1|null{
  const metadata=input.stagePlans[0]?.metadata as unknown as Record<string,unknown>|undefined
  const audit=metadata?.cobbledScenarioV1
  return audit&&typeof audit==='object'&&!Array.isArray(audit)?audit as unknown as CobbledScenarioAuditV1:null
}
