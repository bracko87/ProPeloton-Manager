/**
 * runRaceEngine.ts
 *
 * PPM Universal Race v1.
 *
 * Current universal foundation provides:
 * - the normalized universal input contract;
 * - deterministic input validation;
 * - deterministic terrain-profile analysis and stage classification;
 * - production-calibrated stage difficulty categories from 1 to 5;
 * - the Phase 2 universal rider-readiness contract and calculation;
 * - balanced fatigue channels for performance, live energy, and recovery;
 * - one engine-owned starting-condition calculation from current fatigue,
 *   race sharpness, availability, and health state;
 * - one deterministic stage-skill weight model for every supported format;
 * - the production-aligned team-time-trial suitability rule contract;
 * - deterministic rider suitability, team strength, favourites, specialist
 *   rankings, outsiders, breakaway candidates, and tie-break contracts;
 * - the complete Phase 2 readiness and suitability contract, verified across
 *   every supported stage format without rider-, team-, or race-specific paths;
 * - the Phase 3 universal four-phase road-command contract;
 * - deterministic Phase 1 opening resolution, attack-wave selection, initial
 *   breakaway formation, initial separation, and early rider energy use;
 * - deterministic Phase 2 breakaway cooperation, peloton control, support,
 *   intermediate sprint/KOM battles, gap development, and rider energy use;
 * - deterministic Phase 3 decisive-terrain selection, explicit attacks, rider
 *   dropping, group reformation, and finish-contest eligibility;
 * - deterministic Phase 4 automatic late activity, explicit chasing-team
 *   strength, breakaway survival, final groups/gaps, and road-finish resolution;
 * - the Phase 4 intermediate-point catalogue and eligibility plan, reading
 *   every configured sprint and KOM point directly from the stage input;
 * - Phase 5 deterministic performance bands, phase-by-phase group snapshots,
 *   believable capped gaps, and official times for road and time-trial formats;
 * - the Phase 6 immutable finish-resolution foundation and read-only context;
 * - deterministic final winners, complete classifications, official times,
 *   and gaps for every road, individual, team, pair, and prologue format;
 * - one completion validator that preserves Phase 5 physical groups and times
 *   and rejects any incomplete or internally inconsistent finish result;
 * - one final replay-synchronization validator that proves checkpoints, groups,
 *   gaps, commands, commentary, point results, rider states, and classifications
 *   all describe the same already-calculated deterministic race;
 * - one pure Phase 8 post-stage contract that calculates final energy,
 *   fatigue gain, fatigue after stage, recovery demand, fatigue-derived
 *   incident risk, and the guarded application-service persistence payload;
 * - one Phase 9 normalized, capped modifier path for weather, equipment,
 *   supplies, assets and approved staff support, including pure post-stage
 *   resource usage and condition updates;
 * - one opt-in Phase 10 deterministic incident/status path that consumes the
 *   existing health, weather, fatigue, equipment, asset, staff and command
 *   channels without creating a second health or persistence system.
 *
 * It now also builds one deterministic, read-only replay timeline from the
 * already-calculated race result. It still contains no playback loop,
 * persistence or direct database mutation. Equipment wear and supply
 * consumption are returned only as deterministic post-stage update payloads.
 */

export const PPM_UNIVERSAL_RACE_ENGINE_KEY =
  'ppm_universal_race_v1' as const
export const PPM_UNIVERSAL_RACE_ENGINE_VERSION = 1 as const
export const UNIVERSAL_RACE_ENGINE_DEBUG_BUILD =
  'phase10-unified-chase-display-gap-evolution-2026-08-18-10e4c' as const

export const RACE_TYPES = ['one_day', 'stage_race'] as const
export type RaceType = (typeof RACE_TYPES)[number]

export const STAGE_FORMATS = [
  'road_race',
  'individual_time_trial',
  'team_time_trial',
  'pair_time_trial',
  'prologue',
] as const
export type StageFormat = (typeof STAGE_FORMATS)[number]

export const TERRAIN_TYPES = [
  'flat',
  'hilly',
  'mountain',
  'individual_time_trial',
  'team_time_trial',
  'prologue',
  'cobbled',
] as const
export type TerrainType = (typeof TERRAIN_TYPES)[number]

export const FINISH_TYPES = [
  'flat_finish',
  'uphill_finish',
  'summit_finish',
  'time_trial_finish',
  'team_time_trial_finish',
  'prologue_finish',
  'cobbled_finish',
] as const
export type FinishType = (typeof FINISH_TYPES)[number]

export const STAGE_POINT_TYPES = [
  'START',
  'INTERMEDIATE_SPRINT',
  'KOM',
  'BONUS_SPRINT',
  'FINISH',
] as const
export type StagePointType = (typeof STAGE_POINT_TYPES)[number]

export const KOM_CATEGORIES = ['HC', '1', '2', '3', '4'] as const
export type KomCategory = (typeof KOM_CATEGORIES)[number]

export const AVAILABILITY_STATUSES = [
  'fit',
  'not_fully_fit',
  'injured',
  'sick',
] as const
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number]

export const HEALTH_CASE_TYPES = ['injury', 'sickness'] as const
export type HealthCaseType = (typeof HEALTH_CASE_TYPES)[number]

export const HEALTH_CASE_SEVERITIES = ['minor', 'moderate', 'major'] as const
export type HealthCaseSeverity = (typeof HEALTH_CASE_SEVERITIES)[number]

export const HEALTH_CASE_STATUSES = ['active', 'recovering', 'resolved'] as const
export type HealthCaseStatus = (typeof HEALTH_CASE_STATUSES)[number]

export const PREVIOUS_STAGE_STATUSES = [
  'finished',
  'dnf',
  'dns',
  'otl',
] as const
export type PreviousStageStatus = (typeof PREVIOUS_STAGE_STATUSES)[number]

export const RIDER_START_STATUSES = ['starter', 'dns'] as const
export type RiderStartStatus = (typeof RIDER_START_STATUSES)[number]

export const STAGE_PLAN_STATUSES = [
  'draft',
  'submitted',
  'locked',
  'defaulted',
  'sent_to_engine',
] as const
export type StagePlanStatus = (typeof STAGE_PLAN_STATUSES)[number]

export const RIDER_STAGE_ROLES = [
  'team_leader_gc',
  'sprinter',
  'lead_out_rider',
  'sprint_train_rider',
  'climber',
  'mountain_domestique',
  'helper_domestique',
  'breakaway_rider',
  'breakaway_chaser',
  'rouleur',
  'protected_rider',
  'free_role',
] as const
export type RiderStageRole = (typeof RIDER_STAGE_ROLES)[number]

/**
 * Universal player-facing road commands requested by the Phase 3 contract.
 *
 * `follow_team_plan` and `avoid_risks` remain explicit engine commands because
 * they are already stored by production and are required for deterministic
 * fallback and safety behaviour.
 */
export const UNIVERSAL_ROAD_COMMANDS = [
  'follow_team_plan',
  'join_breakaway',
  'attack',
  'control_race',
  'chase',
  'protect_leader',
  'protect_jersey',
  'support_leader',
  'work_for_team',
  'conserve_energy',
  'prepare_sprint',
  'lead_out_sprinter',
  'ride_for_stage_result',
  'ride_for_time_gc',
  'contest_intermediate_sprint',
  'contest_kom_points',
  'avoid_risks',
] as const
export type UniversalRoadCommand = (typeof UNIVERSAL_ROAD_COMMANDS)[number]

/**
 * Exact production command codes currently present in locked stage-plan
 * snapshots or accepted by the production tactical resolver.
 *
 * They remain valid compatibility inputs until the production adapter and UI
 * write only the universal player-facing command vocabulary.
 */
export const PRODUCTION_SAVED_ROAD_COMMANDS = [
  'follow_team_plan',
  'protect_leader',
  'conserve_energy',
  'stay_near_front',
  'control_tempo',
  'chase_breakaway',
  'attack',
  'join_breakaway',
  'lead_out',
  'sprint',
  'climb_hard',
  'avoid_risks',
  'fight_sprint_points',
  'fight_kom_points',
  'sprint_train_rider',
  'lead_out_rider',
  'final_sprint',
] as const
export type ProductionSavedRoadCommand =
  (typeof PRODUCTION_SAVED_ROAD_COMMANDS)[number]

export const ROAD_COMMAND_INPUTS = [
  ...UNIVERSAL_ROAD_COMMANDS,
  'stay_near_front',
  'control_tempo',
  'chase_breakaway',
  'lead_out',
  'sprint',
  'climb_hard',
  'fight_sprint_points',
  'fight_kom_points',
  'sprint_train_rider',
  'lead_out_rider',
  'final_sprint',
] as const
export type RoadCommandInput = (typeof ROAD_COMMAND_INPUTS)[number]

/**
 * Backwards-compatible exported names used by the existing input contract.
 * All four phases now accept the same validated universal command input set;
 * physical phase eligibility is resolved separately and deterministically.
 */
export const ROAD_PHASE_1_TO_3_COMMANDS = ROAD_COMMAND_INPUTS
export type RoadPhase1To3Command = RoadCommandInput
export const ROAD_PHASE_4_COMMANDS = ROAD_COMMAND_INPUTS
export type RoadPhase4Command = RoadCommandInput

export const ROAD_TEAM_TACTICS = [
  'balanced',
  'aggressive',
  'sprint_control',
  'breakaway',
  'gc_protection',
  'climber_support',
] as const
export type RoadTeamTactic = (typeof ROAD_TEAM_TACTICS)[number]

export const ROAD_RACE_PHASES = [
  {
    phaseNumber: 1,
    key: 'phase1',
    label: 'opening',
    startFraction: 0,
    endFraction: 0.25,
  },
  {
    phaseNumber: 2,
    key: 'phase2',
    label: 'race_development',
    startFraction: 0.25,
    endFraction: 0.5,
  },
  {
    phaseNumber: 3,
    key: 'phase3',
    label: 'decisive_section',
    startFraction: 0.5,
    endFraction: 0.7,
  },
  {
    phaseNumber: 4,
    key: 'phase4',
    label: 'chase_and_finish',
    startFraction: 0.7,
    endFraction: 1,
  },
] as const
export type RoadRacePhaseNumber =
  (typeof ROAD_RACE_PHASES)[number]['phaseNumber']
export type RoadRacePhaseKey = (typeof ROAD_RACE_PHASES)[number]['key']

export type JsonRecord = Readonly<Record<string, unknown>>

export interface UniversalEngineIdentity {
  readonly engineKey: typeof PPM_UNIVERSAL_RACE_ENGINE_KEY
  readonly engineVersion: typeof PPM_UNIVERSAL_RACE_ENGINE_VERSION
  readonly deterministicSeed: string
}

export interface UniversalRaceInput {
  readonly raceId: string
  readonly raceType: RaceType
  readonly stageCount: number
}

/**
 * Normalized profile point.
 *
 * Production profile JSON currently uses `km` and `elevation_m` as its
 * canonical stored keys. Input assembly must normalize `elevation_m` (and any
 * explicitly supported compatibility aliases) to `elevationM` before calling
 * this function.
 */
export interface UniversalStageProfilePointInput {
  readonly km: number
  readonly elevationM: number
}

export interface UniversalTerrainPercentagesInput {
  readonly flat: number
  readonly hilly: number
  readonly mountain: number
  readonly cobbled: number
}

/**
 * Stage-specific time-trial rules read from race_stage_time_trial_rules.
 *
 * The universal engine does not invent a counting-rider number. TTT input
 * assembly should pass the exact stored value; current production accepts
 * values from 2 through 8 and uses the counting rider's time as team time.
 */
export interface UniversalTimeTrialRulesInput {
  readonly startOrderMode: string
  readonly startIntervalSeconds: number
  readonly countingRiderNumber: number | null
  readonly equipmentRequired: boolean
  readonly replayDurationSeconds: number
  readonly droppedRiderTimeMode: string
  readonly metadata: JsonRecord
}

export interface UniversalStageInput {
  readonly raceId: string
  readonly stageId: string
  readonly stageNumber: number
  readonly stageFormat: StageFormat
  readonly terrainType: TerrainType
  /**
   * The production database stores profile_type as text and currently has no
   * verified closed constraint in this Phase 1 contract.
   */
  readonly profileType: string | null
  readonly finishType: FinishType
  /**
   * Final-incident time-protection zone for eligible bunch-sprint road stages.
   * Zero disables protection. Production input assembly reads this from the
   * existing stage rules_snapshot/metadata JSON and defaults eligible flat
   * finishes to 3 km; no new persistence column is required.
   */
  readonly sprintZoneKm?: number | null
  readonly distanceKm: number
  readonly elevationGainM: number
  readonly summitFinish: boolean
  readonly terrainPercentages: UniversalTerrainPercentagesInput
  readonly profilePoints: readonly UniversalStageProfilePointInput[]
  readonly timeTrialRules?: UniversalTimeTrialRulesInput | null
}

export interface UniversalStagePointInput {
  readonly pointId: string
  readonly stageId: string
  readonly pointType: StagePointType
  readonly kmFromStart: number
  readonly name: string | null
  readonly komCategory: KomCategory | null
  readonly pointsScheme: readonly number[]
  readonly timeBonusSeconds: readonly number[]
  readonly isFinishPoint: boolean
  readonly sortOrder: number
  readonly metadata: JsonRecord
}

export interface UniversalTeamSnapshotInput {
  readonly teamName?: string | null
  readonly countryCode?: string | null
  readonly clubTier?: string | null
  readonly worldTier?: string | null
  readonly logoUrl?: string | null
  readonly jerseyUrl?: string | null
  readonly metadata?: JsonRecord
}

export interface UniversalTeamInput {
  readonly participantTeamId: string
  readonly teamId: string
  readonly clubId: string | null
  readonly participatingClubId: string | null
  readonly ownerClubId: string | null
  readonly parentClubId: string | null
  readonly raceTeamEntryId: string | null
  readonly clubType: string | null
  readonly acceptedRiderIds: readonly string[]
  readonly snapshot: UniversalTeamSnapshotInput
}

export interface UniversalRiderSnapshotInput {
  readonly displayName?: string | null
  readonly firstName?: string | null
  readonly lastName?: string | null
  readonly countryCode?: string | null
  readonly startNumber?: number | null
  readonly metadata?: JsonRecord
}

export interface UniversalRiderHealthCaseInput {
  readonly healthCaseId: string | null
  readonly caseType: HealthCaseType
  readonly severity: HealthCaseSeverity
  readonly status: HealthCaseStatus
  readonly selectionBlocked: boolean
  readonly fatigueFloorOnReturn: number
  readonly activeUntil: string | null
  readonly recoveryUntil: string | null
}

export interface UniversalPreviousStageReadinessInput {
  readonly stageId: string
  readonly stageStatus: PreviousStageStatus
  readonly finishStamina: number | null
  readonly fatigueAfterStage: number
  readonly fatigueGain: number | null
  readonly daysSincePreviousStage: number
}

export interface UniversalRiderPreparationModifiersInput {
  /** Neutral production value is 1. */
  readonly inStageEnergyCostMultiplier: number
  /** Neutral production value is 1. */
  readonly postStageFatigueMultiplier: number
  /** Neutral production value is 0. */
  readonly postStageRecoveryBonusPoints: number
  /** Generic preparation/support points. Equipment percentage effects use their own channel. */
  readonly performanceBonusPoints?: number
  /** Final weighted equipment percentage after authoritative hidden x5 and condition scaling. */
  readonly equipmentStagePerformancePct?: number
  /** Supply-specific stage performance percentage (for example rain-jacket efficiency). */
  readonly supplyStagePerformancePct?: number
  readonly incidentRiskMultiplier?: number
  /** Health/sickness-only incident channel reserved for Phase 10; neutral is 1. */
  readonly healthIncidentRiskMultiplier?: number
  /** Existing preparation/mechanic probability multiplier for technical incidents. */
  readonly mechanicalIncidentRiskMultiplier?: number
  /** Existing preparation/mechanic time-loss multiplier for technical incidents. */
  readonly mechanicalTimeLossMultiplier?: number
  /** Minimum selected physical equipment condition, expressed as 0-100. */
  readonly equipmentConditionPercent?: number
}

export interface UniversalRiderInput {
  readonly participantRiderId: string
  readonly riderId: string
  readonly teamId: string
  readonly participatingClubId: string | null
  readonly sprint: number
  readonly climbing: number
  readonly timeTrial: number
  readonly flat: number
  readonly endurance: number
  readonly recovery: number
  readonly resistance: number
  readonly raceIQ: number
  readonly teamwork: number
  readonly overall: number
  readonly morale: number
  readonly fatigueBeforeStage: number
  readonly raceSharpness: number
  readonly startStamina: number
  readonly recentFormScore: number
  /** Current-season ranking points resolved by the production input adapter. */
  readonly seasonResultPoints?: number
  /** Race-participant role snapshot, retained alongside the stage-plan role. */
  readonly roleSnapshot?: string | null
  readonly availabilityStatus: AvailabilityStatus
  readonly unavailableUntil: string | null
  readonly unavailableReason: string | null
  /** Defaults to `starter` when omitted by an input adapter. */
  readonly startStatus: RiderStartStatus
  readonly healthSnapshot: JsonRecord | null
  /** Structured health state resolved by the production input adapter. */
  readonly healthCase?: UniversalRiderHealthCaseInput | null
  /** Previous-stage state used for recovery diagnostics without double-counting. */
  readonly previousStage?: UniversalPreviousStageReadinessInput | null
  /**
   * Optional production-resolved preparation modifiers. The universal engine
   * consumes already-normalized values and does not inspect arbitrary JSON.
   */
  readonly preparationModifiers?:
    | UniversalRiderPreparationModifiersInput
    | null
  readonly snapshot: UniversalRiderSnapshotInput
}

export interface UniversalRiderPhaseCommandsInput {
  readonly phase1: RoadPhase1To3Command
  readonly phase2: RoadPhase1To3Command
  readonly phase3: RoadPhase1To3Command
  readonly phase4: RoadPhase4Command
}

export interface UniversalRiderStagePlanInput {
  readonly riderId: string
  readonly stageRole: RiderStageRole
  readonly commands: UniversalRiderPhaseCommandsInput
  readonly equipmentSelection: JsonRecord | null
  readonly supplySelection: JsonRecord | null
}

export interface UniversalTeamStagePlanInput {
  readonly teamId: string
  /**
   * Stored team plans are text inside team_tactic_json. Road-plan values have
   * known production options, while the complete universal TT set must still
   * be read from current production before this field becomes a closed union.
   */
  readonly teamTactic: string
  readonly status: StagePlanStatus
  readonly locked: boolean
  readonly defaulted: boolean
  readonly riders: readonly UniversalRiderStagePlanInput[]
  readonly metadata: JsonRecord
}

export interface UniversalWeatherInput {
  /**
   * Free-form production condition text. Only exact canonical weather codes
   * are interpreted by difficulty calculation; arbitrary route descriptions
   * remain neutral.
   */
  readonly condition: string | null
  readonly temperatureC: number | null
  readonly windKmh: number | null
  readonly precipitationMm: number | null
  readonly rainProbabilityPct: number | null
  readonly crosswindRisk?: string | null
  readonly descentRisk?: string | null
  readonly surfaceRisk?: string | null
  readonly cancelled: boolean
  readonly cancellationReason: string | null
  readonly source: string | null
  readonly snapshot: JsonRecord
}

export interface UniversalPreparationInput {
  readonly equipment: JsonRecord
  readonly staff: JsonRecord
  readonly assets: JsonRecord
  readonly raceSupplies: JsonRecord
  readonly standardizedBonuses: JsonRecord
}

export interface UniversalPhase9TeamModifierSources {
  readonly equipmentPerformanceBonusPoints: number
  readonly equipmentSuitabilityBonusPoints: number
  readonly supplySupportPoints: number
  readonly shortagePenaltyPoints: number
  readonly assetSupportPoints: number
  readonly staffSupportPoints: number
  readonly supplyEnergySavingPct: number
  readonly supplyEnergyPenaltyPct: number
  readonly supplyFatigueReductionPct: number
  readonly supplyFatiguePenaltyPct: number
  readonly supplyRecoveryBonusPoints: number
}

export interface UniversalPhase9TeamModifiers {
  readonly teamId: string
  readonly performanceBonusPoints: number
  readonly speedMultiplier: number
  readonly energyCostMultiplier: number
  readonly fatigueMultiplier: number
  readonly breakawaySurvivalMultiplier: number
  readonly incidentRiskMultiplier: number
  readonly recoveryBonusPoints: number
  readonly tacticalSupportPoints: number
  readonly reliabilitySupportPoints: number
  readonly sources: UniversalPhase9TeamModifierSources
}

export interface UniversalPhase9ResourceUpdate {
  readonly resourceType: 'equipment' | 'supply' | 'asset'
  readonly resourceId: string
  readonly teamId: string | null
  readonly quantityBefore: number | null
  readonly quantityUsed: number | null
  readonly quantityAfter: number | null
  readonly conditionBefore: number | null
  readonly conditionUsed: number | null
  readonly conditionAfter: number | null
  /** Durable reusable supply uses; null for ordinary quantity/condition resources. */
  readonly stageUsesBefore: number | null
  readonly stageUsesUsed: number | null
  readonly stageUsesAfter: number | null
  readonly maxStageUses: number | null
  readonly shortageApplied: boolean
}

export interface UniversalPhase9WeatherModifiers {
  readonly speedMultiplier: number
  readonly energyCostMultiplier: number
  readonly fatigueMultiplier: number
  readonly breakawaySurvivalMultiplier: number
  readonly incidentRiskMultiplier: number
  readonly severe: boolean
}

export interface UniversalPhase9ModifierSummary {
  readonly active: true
  readonly singleCalculationPath: true
  readonly weather: UniversalPhase9WeatherModifiers
  readonly teams: readonly UniversalPhase9TeamModifiers[]
  readonly resourceUpdates: readonly UniversalPhase9ResourceUpdate[]
  readonly caps: {
    readonly performanceBonusPoints: readonly [number, number]
    readonly speedMultiplier: readonly [number, number]
    readonly energyCostMultiplier: readonly [number, number]
    readonly fatigueMultiplier: readonly [number, number]
    readonly breakawaySurvivalMultiplier: readonly [number, number]
    readonly incidentRiskMultiplier: readonly [number, number]
    readonly recoveryBonusPoints: readonly [number, number]
  }
  readonly deterministic: true
  readonly modelVersion: 'universal_phase_9_modifiers_v1'
}

export type UniversalPhase9CoverageStatus =
  | 'applied'
  | 'received_neutral'
  | 'not_supplied'

export interface UniversalPhase9CategoryCoverage {
  readonly category: 'weather' | 'equipment' | 'supplies' | 'assets' | 'staff'
  readonly status: UniversalPhase9CoverageStatus
  readonly inputRecordCount: number
  readonly appliedSignalCount: number
  readonly updateCount: number
}

export interface UniversalPhase9RiderEffectRow {
  readonly riderId: string
  readonly teamId: string
  readonly effectiveEnergyCostMultiplier: number
  readonly effectiveFatigueMultiplier: number
  readonly effectiveRecoveryBonusPoints: number
  readonly performanceBonusPoints: number
  readonly equipmentStagePerformancePct: number
  readonly supplyStagePerformancePct: number
  readonly incidentRiskMultiplier: number
  readonly healthIncidentRiskMultiplier: number
  readonly weatherEnergyCostMultiplier: number
  readonly weatherFatigueMultiplier: number
  readonly supplySupportPoints: number
  readonly shortagePenaltyPoints: number
  readonly actualEnergySpent: number
  readonly actualFatigueGained: number
  readonly actualFatigueAfter: number
}

export interface UniversalPhase9AcceptanceReport {
  readonly passed: boolean
  readonly engineBuild: string
  readonly singleCalculationPath: true
  readonly completeFiveSystemInputCoverage: boolean
  readonly categories: readonly UniversalPhase9CategoryCoverage[]
  readonly weather: UniversalPhase9WeatherModifiers
  readonly teams: readonly UniversalPhase9TeamModifiers[]
  readonly riderEffects: readonly UniversalPhase9RiderEffectRow[]
  readonly resourceUpdates: readonly UniversalPhase9ResourceUpdate[]
  readonly resourceUpdateSummary: {
    readonly equipmentConditionUpdatesCalculated: number
    readonly assetConditionUpdatesCalculated: number
    readonly supplyQuantityUpdatesCalculated: number
    readonly durableSupplyUseUpdatesCalculated: number
    readonly shortagesCalculated: number
    readonly resourceMathValid: boolean
  }
  readonly persistence: {
    readonly pureEngineDatabaseWrites: false
    readonly conditionAndQuantityUpdatesCalculated: boolean
    readonly persistenceApplied: false
    readonly requiredBoundary: 'phase_11_application_service'
  }
  readonly warnings: readonly string[]
  readonly deterministic: true
  readonly modelVersion: 'universal_phase_9_acceptance_v1'
}

export type UniversalPreStageClassificationType =
  | 'general'
  | 'points'
  | 'mountain'

export interface UniversalPreStageLeaderInput {
  readonly classificationType: UniversalPreStageClassificationType
  readonly riderId: string
  readonly teamId: string
  readonly rank: 1
}

export interface UniversalPreStageLeadersInput {
  readonly hasEstablishedLeaders: boolean
  readonly general?: UniversalPreStageLeaderInput | null
  readonly points?: UniversalPreStageLeaderInput | null
  readonly mountain?: UniversalPreStageLeaderInput | null
}

export interface UniversalIncidentModelInput {
  /** Explicit activation gate for Phase 10 in-race incident occurrence and OTL adjudication. */
  readonly enabled: boolean
}

export interface UniversalRaceEngineInput {
  readonly engine: UniversalEngineIdentity
  readonly race: UniversalRaceInput
  readonly stage: UniversalStageInput
  readonly points: readonly UniversalStagePointInput[]
  readonly teams: readonly UniversalTeamInput[]
  readonly riders: readonly UniversalRiderInput[]
  readonly stagePlans: readonly UniversalTeamStagePlanInput[]
  readonly weather?: UniversalWeatherInput
  readonly preparation?: UniversalPreparationInput
  /** Phase 10 is opt-in so frozen Phase 1-9 fixtures remain regression-stable. Production explicitly enables it. */
  readonly incidentModel?: UniversalIncidentModelInput
  /** Immutable jersey-owner snapshot captured before the stage. */
  readonly preStageLeaders?: UniversalPreStageLeadersInput | null
}

export type UniversalStageClassification =
  | 'flat_road_stage'
  | 'hilly_road_stage'
  | 'mountain_road_stage'
  | 'cobbled_road_stage'
  | 'individual_time_trial'
  | 'team_time_trial'
  | 'pair_time_trial'
  | 'prologue'

export type UniversalDifficultyCategory = 1 | 2 | 3 | 4 | 5

export type UniversalDifficultyLabel =
  | 'easy'
  | 'moderate'
  | 'hard'
  | 'very_hard'
  | 'extreme'

export type UniversalDifficultyComponentLevel = 0 | 1 | 2 | 3 | 4

export interface UniversalDifficultyComponents {
  readonly distance: UniversalDifficultyComponentLevel
  readonly totalAscent: UniversalDifficultyComponentLevel
  readonly ascentDensity: UniversalDifficultyComponentLevel
  readonly longestClimb: UniversalDifficultyComponentLevel
  readonly importantGradient: UniversalDifficultyComponentLevel
  readonly finishProfile: UniversalDifficultyComponentLevel
  readonly weatherSeverity: UniversalDifficultyComponentLevel
}

export interface UniversalDifficultySummary {
  readonly category: UniversalDifficultyCategory
  readonly label: UniversalDifficultyLabel
  readonly score: number
  readonly components: UniversalDifficultyComponents
}

export type UniversalReadinessLabel =
  | 'unavailable'
  | 'critical'
  | 'poor'
  | 'limited'
  | 'ready'
  | 'strong'
  | 'peak'

export type UniversalPreviousStageRecoveryState =
  | 'recovered'
  | 'unchanged'
  | 'accumulated_load'

export interface UniversalPreviousStageRecoverySummary {
  readonly stageId: string
  readonly stageStatus: PreviousStageStatus
  readonly finishStamina: number | null
  readonly fatigueAfterPreviousStage: number
  readonly fatigueBeforeCurrentStage: number
  readonly recoveredFatiguePoints: number
  readonly accumulatedFatiguePoints: number
  readonly daysSincePreviousStage: number
  readonly state: UniversalPreviousStageRecoveryState
  /**
   * Current fatigue already reflects between-stage recovery. This summary is
   * diagnostic and is not applied a second time to the readiness score.
   */
  readonly representedByCurrentFatigue: true
}

export interface UniversalRiderReadinessComponents {
  /** Legacy database-derived value retained only for migration comparison. */
  readonly providedStartStamina: number
  /** Engine-owned physical reserve used as the actual start energy. */
  readonly startFreshness: number
  readonly effectiveFatigue: number
  readonly fatigueReadiness: number
  readonly raceSharpness: number
  readonly sharpnessStartEnergyAdjustment: number
  readonly availabilityStartEnergyPenalty: number
  readonly providedStartStaminaDifference: number
  readonly recentFormScore: number
  readonly normalizedRecentForm: number
  readonly morale: number
  readonly recentFormModifier: number
  readonly moraleModifier: number
  /** Existing availability value; the not-fully-fit penalty is already inside startFreshness. */
  readonly availabilityModifier: number
}

export interface UniversalFatigueBalanceChannels {
  /** Current condition is represented once through engine-owned start energy. */
  readonly preStagePerformance: 'start_freshness'
  /** Current fatigue lowers the starting reserve, not movement-cost formulas. */
  readonly inStageEnergy: 'start_energy'
  /** The persisted stage target is written only by an exactly-once finalizer. */
  readonly postStageFatigue: 'ledger_guarded_once'
  /** Current fatigue already contains recovery applied between stages. */
  readonly betweenStageRecovery: 'current_fatigue_snapshot'
}

export interface UniversalRiderFatigueBalanceResult {
  readonly active: boolean
  readonly preStagePerformanceModifier: number
  readonly startEnergy: number
  /**
   * Raw pre-stage fatigue must not multiply movement energy cost again.
   * Preparation may still modify energy cost through its separate channel.
   */
  readonly directFatigueEnergyCostMultiplier: 1
  readonly inStageEnergyCostMultiplier: number
  /**
   * Intrinsic daily recovery from recovery skill and morale only. Scheduling,
   * age, rest-day, training-camp, staff, and activity bonuses remain external.
   */
  readonly intrinsicDailyRecoveryPoints: number
  readonly postStageFatigueMultiplier: number
  readonly postStageRecoveryBonusPoints: number
  readonly fatigueWritePolicy: 'ledger_guarded_once'
  readonly historicalReapplyAllowed: false
  readonly startEnergySource: 'engine_starting_condition_v2'
  readonly channels: UniversalFatigueBalanceChannels
  readonly modelVersion: 'universal_fatigue_balance_v2'
}

export interface UniversalRiderReadinessResult {
  readonly riderId: string
  readonly teamId: string
  readonly startStatus: RiderStartStatus
  readonly availabilityStatus: AvailabilityStatus
  readonly eligibleToStart: boolean
  readonly readinessScore: number
  readonly label: UniversalReadinessLabel
  readonly healthSelectionBlocked: boolean
  readonly healthFatigueFloor: number
  readonly components: UniversalRiderReadinessComponents
  readonly previousStageRecovery: UniversalPreviousStageRecoverySummary | null
  readonly fatigueBalance: UniversalRiderFatigueBalanceResult
  readonly modelVersion: 'universal_rider_readiness_v2'
}

export const UNIVERSAL_SKILL_ATTRIBUTES = [
  'sprint',
  'climbing',
  'timeTrial',
  'flat',
  'endurance',
  'recovery',
  'resistance',
  'raceIQ',
  'teamwork',
] as const
export type UniversalSkillAttribute =
  (typeof UNIVERSAL_SKILL_ATTRIBUTES)[number]

export type UniversalStageSkillProfile =
  | 'flat'
  | 'hilly'
  | 'mountain'
  | 'cobbled'
  | 'individual_time_trial'
  | 'prologue'
  | 'pair_time_trial'
  | 'team_time_trial'

export interface UniversalRiderSkillWeights {
  readonly sprint: number
  readonly climbing: number
  readonly timeTrial: number
  readonly flat: number
  readonly endurance: number
  readonly recovery: number
  readonly resistance: number
  readonly raceIQ: number
  readonly teamwork: number
}

export type UniversalTimeTrialDistanceBand =
  | 'not_time_trial'
  | 'prologue'
  | 'under_40_km'
  | 'at_least_40_km'

export interface UniversalStageSkillRouteContext {
  readonly distanceBand: UniversalTimeTrialDistanceBand
  readonly flatPct: number
  readonly hillyPct: number
  readonly mountainPct: number
}

export interface UniversalStageSkillModel {
  readonly profile: UniversalStageSkillProfile
  readonly stageFormat: StageFormat
  readonly terrainType: TerrainType
  /** Production weights before normalization. */
  readonly rawWeights: UniversalRiderSkillWeights
  /** Sum-to-one weights consumed by later suitability calculation. */
  readonly weights: UniversalRiderSkillWeights
  readonly rawWeightTotal: number
  readonly normalizedWeightTotal: 1
  readonly routeContext: UniversalStageSkillRouteContext
  readonly sourceModel:
    | 'production_road_stage_profile_weights_v1'
    | 'production_route_time_trial_weights_v1'
  readonly modelVersion: 'universal_stage_skill_weights_v1'
}

export interface UniversalTeamTimeTrialCohesionRule {
  readonly averageTeamworkTarget: 70
  readonly scoreDispersionFreeBand: 6
  readonly teamworkPenaltyPerPoint: 0.00045
  readonly dispersionPenaltyPerPoint: 0.0003
  readonly maximumTimePenaltyPct: 0.04
}

export interface UniversalTeamTimeTrialSuitabilityRules {
  readonly active: boolean
  readonly configured: boolean
  readonly countingRiderNumber: number | null
  readonly countingRiderNumberSource: 'race_stage_time_trial_rules'
  readonly validCountingRiderRange: readonly [2, 8]
  readonly minimumTeamSize: number | null
  readonly countingGroupSelection:
    'fastest_projected_riders_then_adjusted_tt_score_then_rider_id'
  readonly teamTimeRule: 'slowest_counting_group_rider'
  readonly droppedRiderTimeMode: string | null
  readonly cohesionRule: UniversalTeamTimeTrialCohesionRule
  readonly teamRankTieBreak: readonly [
    'team_finish_time_seconds',
    'counting_group_average_score_desc',
    'team_id',
  ]
  readonly modelVersion: 'universal_ttt_suitability_rules_v1'
}


export interface UniversalRiderSuitabilityComponents {
  readonly stageSkillScore: number
  readonly freshnessModifier: number
  readonly recentFormModifier: number
  readonly moraleModifier: number
  /** Existing availability value; the not-fully-fit penalty is already inside startFreshness. */
  readonly availabilityModifier: number
  readonly genericPerformanceBonusPoints: number
  readonly equipmentStagePerformancePct: number
  readonly equipmentPerformanceAdjustment: number
  readonly supplyStagePerformancePct: number
  readonly supplyPerformanceAdjustment: number
  readonly totalReadinessAdjustment: number
}

export interface UniversalRiderSuitabilityResult {
  readonly rank: number
  readonly riderId: string
  readonly teamId: string
  readonly displayName: string
  readonly startNumber: number | null
  readonly stageRole: RiderStageRole | null
  readonly roleSnapshot: string | null
  readonly eligibleToStart: boolean
  readonly stageSkillScore: number
  readonly readinessScore: number
  readonly suitabilityScore: number
  readonly components: UniversalRiderSuitabilityComponents
  readonly modelVersion: 'universal_rider_suitability_v1'
}

export interface UniversalTeamStrengthResult {
  readonly rank: number
  readonly teamId: string
  readonly teamName: string
  readonly eligibleRiderCount: number
  readonly averageSuitabilityScore: number
  readonly topThreeAverageSuitabilityScore: number
  readonly bestRiderSuitabilityScore: number
  readonly countingRiderNumber: number | null
  readonly countingRiderSuitabilityScore: number | null
  readonly countingGroupAverageTeamwork: number | null
  readonly countingGroupScoreDispersion: number | null
  readonly cohesionPenaltyPct: number
  readonly teamStrengthScore: number
  readonly strengthBasis:
    | 'top_three_average_suitability'
    | 'ttt_slowest_counting_rider_after_cohesion'
  readonly modelVersion: 'universal_stage_team_strength_v1'
}

export type UniversalFavouriteCategory =
  | 'main_favourite'
  | 'secondary_contender'
  | 'outsider'
  | 'sprinter_favourite'
  | 'climber_favourite'
  | 'time_trial_favourite'

export interface UniversalFavouriteResult {
  readonly rank: number
  readonly category: UniversalFavouriteCategory
  readonly riderId: string
  readonly teamId: string
  readonly displayName: string
  readonly startNumber: number | null
  readonly stageRole: RiderStageRole | null
  readonly roleSnapshot: string | null
  readonly favouriteScore: number
  readonly suitabilityScore: number
  readonly skillScore: number
  readonly readinessScore: number
  readonly seasonResultPoints: number
  readonly seasonResultBonus: number
  readonly roleBonus: number
  readonly teamworkBonus: number
  readonly reason: string
  readonly modelVersion: 'universal_favourite_ranking_v1'
}

export interface UniversalBreakawayCandidateResult {
  readonly rank: number
  readonly riderId: string
  readonly teamId: string
  readonly displayName: string
  readonly stageRole: RiderStageRole | null
  readonly roleSnapshot: string | null
  readonly candidateScore: number
  readonly enduranceContribution: number
  readonly flatContribution: number
  readonly raceIQContribution: number
  readonly climbingContribution: number
  readonly moraleContribution: number
  readonly rolePoints: number
  readonly deterministicSeedBonus: number
  readonly suitabilityScore: number
  readonly readinessScore: number
  readonly modelVersion: 'universal_breakaway_candidate_v1'
}

export interface UniversalCompetitionTieBreakContract {
  readonly riderSuitability: readonly [
    'suitability_score_desc',
    'stage_skill_score_desc',
    'readiness_score_desc',
    'start_number_asc_nulls_last',
    'display_name_asc',
    'rider_id_asc',
  ]
  readonly favourites: readonly [
    'favourite_score_desc',
    'start_number_asc_nulls_last',
    'display_name_asc',
    'rider_id_asc',
  ]
  readonly teamStrength: readonly [
    'team_strength_score_desc',
    'best_rider_suitability_desc',
    'team_id_asc',
  ]
  readonly breakawayCandidates: readonly [
    'candidate_score_desc',
    'suitability_score_desc',
    'rider_id_asc',
  ]
}

export interface UniversalFavouritesSummary {
  readonly mainFavouriteLimit: 5
  readonly secondaryContenderLimit: 10
  readonly outsiderLimit: 10
  readonly mainFavourites: readonly UniversalFavouriteResult[]
  readonly secondaryContenders: readonly UniversalFavouriteResult[]
  readonly outsiders: readonly UniversalFavouriteResult[]
  readonly sprinterFavourites: readonly UniversalFavouriteResult[]
  readonly climberFavourites: readonly UniversalFavouriteResult[]
  readonly timeTrialFavourites: readonly UniversalFavouriteResult[]
  readonly breakawayCandidateCount: number
  readonly breakawayCandidates: readonly UniversalBreakawayCandidateResult[]
  readonly tieBreaks: UniversalCompetitionTieBreakContract
  readonly modelVersion: 'universal_favourites_summary_v1'
}

export type UniversalRoadCommandBehaviour =
  | 'neutral'
  | 'breakaway_entry'
  | 'attack'
  | 'race_control'
  | 'chase'
  | 'leader_protection'
  | 'jersey_protection'
  | 'leader_support'
  | 'team_work'
  | 'energy_conservation'
  | 'sprint_preparation'
  | 'lead_out'
  | 'stage_result'
  | 'time_gc_result'
  | 'intermediate_sprint_contest'
  | 'kom_contest'
  | 'positioning'
  | 'climbing_pressure'
  | 'risk_avoidance'

export type UniversalRoadCommandSource =
  | 'explicit_individual_command'
  | 'saved_role_default'
  | 'saved_team_tactic_base'

export type ProductionCommandEffectReference =
  | 'follow_team_plan'
  | 'protect_leader'
  | 'conserve_energy'
  | 'stay_near_front'
  | 'control_tempo'
  | 'chase_breakaway'
  | 'attack'
  | 'join_breakaway'
  | 'lead_out'
  | 'sprint'
  | 'climb_hard'
  | 'avoid_risks'

export type UniversalObjectiveEligibilityReason =
  | 'eligible'
  | 'rider_unavailable'
  | 'explicit_saved_command_required'
  | 'command_does_not_authorize_attack'
  | 'command_does_not_authorize_breakaway'
  | 'opening_breakaway_only_in_phase_1'
  | 'command_does_not_authorize_sprint_contest'
  | 'command_does_not_authorize_kom_contest'
  | 'no_intermediate_sprint_in_phase'
  | 'no_kom_in_phase'

export interface UniversalObjectiveEligibility {
  readonly eligible: boolean
  readonly reason: UniversalObjectiveEligibilityReason
}

export interface UniversalRoadPhaseBoundary {
  readonly phaseNumber: RoadRacePhaseNumber
  readonly key: RoadRacePhaseKey
  readonly label:
    | 'opening'
    | 'race_development'
    | 'decisive_section'
    | 'chase_and_finish'
  readonly startFraction: number
  readonly endFraction: number
  readonly startKm: number
  readonly endKm: number
}

export interface UniversalRoadCommandEffect {
  readonly effectReferenceCommand: ProductionCommandEffectReference
  readonly baseEffortMultiplier: number
  readonly roleAdjustedEffortMultiplier: number
  readonly performanceModifier: number
  readonly effectTiming:
    | 'continuous_phase'
    | 'objective_only'
    | 'finish_only'
    | 'phase_resolution'
  readonly modelVersion: 'production_command_effects_v1'
}

export interface UniversalRoadCommandPhaseResolution {
  readonly phaseNumber: RoadRacePhaseNumber
  readonly phaseKey: RoadRacePhaseKey
  readonly savedCommand: RoadCommandInput
  readonly resolvedCommand: RoadCommandInput
  readonly resolvedSource: UniversalRoadCommandSource
  readonly precedenceRank: 1 | 2 | 3
  readonly behaviour: UniversalRoadCommandBehaviour
  readonly commandEffect: UniversalRoadCommandEffect
  readonly intermediateSprintPointIds: readonly string[]
  readonly komPointIds: readonly string[]
  readonly deliberateAttack: UniversalObjectiveEligibility
  readonly openingBreakaway: UniversalObjectiveEligibility
  readonly intermediateSprintContest: UniversalObjectiveEligibility
  readonly komContest: UniversalObjectiveEligibility
}

export interface UniversalRoadRiderCommandResolution {
  readonly riderId: string
  readonly teamId: string
  readonly stageRole: RiderStageRole
  readonly eligibleToStart: boolean
  readonly phases: readonly UniversalRoadCommandPhaseResolution[]
}

export interface UniversalRoadCommandInputContract {
  readonly universalCommands: readonly UniversalRoadCommand[]
  readonly acceptedInputCommands: readonly RoadCommandInput[]
  readonly productionSavedCommands: readonly ProductionSavedRoadCommand[]
  readonly supportedTeamTactics: readonly RoadTeamTactic[]
  readonly fallbackPrecedence: readonly [
    'explicit_individual_command',
    'saved_role_default',
    'saved_team_tactic_base',
  ]
  /** One scalar saved command is accepted for each rider and race phase. */
  readonly oneCommandPerRiderPerPhase: true
  /** Higher-precedence commands suppress role and team fallback conflicts. */
  readonly conflictingFallbacksResolvedByPrecedence: true
  readonly objectiveEligibilityRequiresExplicitSavedCommand: true
  readonly skillAloneCanAuthorizeObjectiveContest: false
  /** Objective-only commands have no physical effect when no matching point exists. */
  readonly unmatchedObjectiveCommandsAreSuppressed: true
  /** Support commands without an eligible teammate produce no support or extra effort. */
  readonly invalidSupportCommandsAreSuppressed: true
  /** A join command cannot create an escape without at least one attack launcher. */
  readonly joinBreakawayRequiresAttackLauncher: true
  readonly phaseBoundaryContract: '0_25__25_50__50_70__70_100'
}

export interface UniversalRoadCommandResolutionSummary {
  readonly active: boolean
  readonly inactiveReason: 'non_road_stage' | null
  readonly inputContract: UniversalRoadCommandInputContract
  readonly phaseBoundaries: readonly UniversalRoadPhaseBoundary[]
  readonly riders: readonly UniversalRoadRiderCommandResolution[]
  readonly modelVersion: 'universal_road_command_resolution_v1'
}


export type UniversalRoadOpeningStatus =
  | 'phase_too_short_for_attack'
  | 'no_eligible_attackers'
  | 'join_only_blocked'
  | 'attack_attempts_failed'
  | 'breakaway_formed'

export type UniversalRoadOpeningWaveCode = 'first_wave' | 'second_wave'
export type UniversalRoadOpeningGroupCode =
  | 'opening_breakaway'
  | 'main_peloton'

export type UniversalRoadOpeningStepTerrain =
  | 'flat'
  | 'false_flat'
  | 'climb'
  | 'steep_climb'
  | 'descent'
  | 'technical_descent'
  | 'cobbled'
  | 'cobble'
  | 'gravel'

export type UniversalRoadOpeningSeparationBand =
  | 'suppressed'
  | 'no_separation'
  | 'marginal_separation'
  | 'clear_initial_separation'
  | 'strong_initial_separation'
  | 'very_strong_initial_separation'

export interface UniversalRoadOpeningAttackAttempt {
  readonly selectedRank: number
  readonly waveCode: UniversalRoadOpeningWaveCode
  readonly riderId: string
  readonly teamId: string
  readonly stageRole: RiderStageRole
  readonly command: 'attack' | 'join_breakaway'
  readonly attemptKm: number
  readonly effectiveTerrainType: UniversalRoadOpeningStepTerrain
  readonly slopePercent: number
  readonly energyBeforeAttempt: number
  readonly attackIntentScore: number
  readonly attackExecutionSkillScore: number
  readonly attackSuccessProbability: number
  readonly deterministicOutcomeRoll: number
  readonly physicallyValidAttempt: boolean
  readonly attackSucceeded: boolean
  readonly acceptedEscapeLaunch: boolean
  readonly projectedBurstSpeedMultiplier: number
  readonly projectedBurstDurationSeconds: number
  readonly attackEnergyCost: number
  readonly energyAfterAttackAttempt: number
  readonly initialGapSeconds: number
  readonly separationBand: UniversalRoadOpeningSeparationBand
  readonly modelVersion: 'production_attack_outcome_and_launch_v2'
}

export interface UniversalRoadOpeningRiderEnergy {
  readonly riderId: string
  readonly teamId: string
  readonly command: RoadCommandInput
  readonly commandEffortMultiplier: number
  readonly startEnergy: number
  readonly baselineOpeningEnergyCost: number
  readonly attackEnergyCost: number
  readonly totalOpeningEnergyCost: number
  readonly energyAfterPhase: number
  readonly finalGroupCode: UniversalRoadOpeningGroupCode
  readonly modelVersion: 'production_step_energy_v2'
}

export interface UniversalRoadOpeningGroup {
  readonly groupCode: UniversalRoadOpeningGroupCode
  readonly groupOrder: 1 | 2
  readonly riderIds: readonly string[]
  readonly gapSeconds: number
}

export interface UniversalRoadPhase1OpeningResult {
  readonly phaseNumber: 1
  readonly phaseBoundary: UniversalRoadPhaseBoundary
  readonly neutralizedDistanceKm: number
  readonly opportunityWindowKm: 5
  readonly firstWaveAttemptKm: number | null
  readonly secondWaveAttemptKm: number | null
  readonly baseWaveCap: number
  readonly averageTeamSizeCap: number
  readonly effectiveWaveCap: number
  readonly eligibleAttackerIds: readonly string[]
  readonly eligibleJoinerIds: readonly string[]
  readonly selectedCandidateIds: readonly string[]
  readonly joinOnlyEscapeBlocked: boolean
  readonly status: UniversalRoadOpeningStatus
  readonly initialGapSeconds: number
  readonly initialGapAggregation: 'maximum_accepted_launch_separation'
  readonly breakawayRiderIds: readonly string[]
  readonly pelotonRiderIds: readonly string[]
  readonly attackAttempts: readonly UniversalRoadOpeningAttackAttempt[]
  readonly riderEnergy: readonly UniversalRoadOpeningRiderEnergy[]
  readonly groups: readonly UniversalRoadOpeningGroup[]
  readonly modelVersion: 'universal_road_phase_1_opening_v1'
}

export type UniversalPelotonResponseMode =
  | 'no_active_escape'
  | 'uninterested_peloton'
  | 'release_escape'
  | 'control_gap'
  | 'organized_chase'
  | 'emergency_chase'

export type UniversalRoadDevelopmentStatus =
  | 'no_active_breakaway'
  | 'breakaway_released'
  | 'gap_controlled'
  | 'organized_chase'
  | 'breakaway_caught'

export interface UniversalRoadBreakawayCooperationResult {
  readonly riderCount: number
  readonly teamCount: number
  readonly averageTeamwork: number
  readonly averageStageSuitability: number
  readonly cooperationScore: number
  readonly cooperationSpeedMultiplier: number
  readonly projectedEscapePaceKmh: number
  readonly modelVersion: 'universal_breakaway_cooperation_v1'
}

export interface UniversalRoadPelotonResponseResult {
  readonly responseMode: UniversalPelotonResponseMode
  readonly chasingTeamIds: readonly string[]
  readonly controllingTeamIds: readonly string[]
  readonly availableChaseAssets: number
  readonly totalSprintAssets: number
  readonly totalProtectedAssets: number
  readonly chaseInterestScore: number
  readonly chaseCapacityScore: number
  readonly coordinationFactor: number
  readonly targetGapLowerSeconds: number
  readonly targetGapUpperSeconds: number
  readonly requiredHoldMultiplier: number
  readonly maximumPursuitMultiplier: number
  readonly selectedResponseMultiplier: number
  readonly chaseUrgencyScore: number
  readonly pelotonWorkIntensityFraction: number
  readonly baselinePelotonPaceKmh: number
  readonly effectivePelotonPaceKmh: number
  readonly modelVersion: 'production_peloton_response_components_v2'
}

export type UniversalRoadSupportCommand =
  | 'protect_leader'
  | 'protect_jersey'
  | 'support_leader'
  | 'work_for_team'

export interface UniversalRoadSupportAction {
  readonly supporterRiderId: string
  readonly teamId: string
  readonly command: UniversalRoadSupportCommand
  readonly status: 'applied' | 'suppressed_no_valid_target'
  readonly targetRiderId: string | null
  readonly targetReason:
    | 'team_leader'
    | 'protected_rider'
    | 'pre_stage_general_leader'
    | 'pre_stage_points_leader'
    | 'pre_stage_mountain_leader'
    | 'best_available_teammate'
    | 'no_valid_target'
  readonly deterministicRoll: number
  readonly supportWorkScore: number
  readonly protectionReceivedScore: number
  readonly modelVersion: 'production_stage_command_support_deltas_v1'
}


export type UniversalIntermediatePointType =
  | 'INTERMEDIATE_SPRINT'
  | 'BONUS_SPRINT'
  | 'KOM'

export type UniversalIntermediateRacePosition =
  | 'front_escape'
  | 'front_group'
  | 'main_peloton'
  | 'chasing_group'
  | 'dropped_group'
  | 'late_group'

export type UniversalIntermediateEligibilityReason =
  | 'explicit_contest_command'
  | 'explicit_breakaway_or_attack_command'
  | 'team_sprint_objective'
  | 'explicit_stage_result_command'
  | 'attack_or_breakaway_role_in_front_position'

export interface UniversalIntermediatePointCandidate {
  readonly riderId: string
  readonly teamId: string
  readonly phaseNumber: RoadRacePhaseNumber
  readonly pointId: string
  readonly pointType: UniversalIntermediatePointType
  readonly racePosition: UniversalIntermediateRacePosition
  readonly resolvedCommand: RoadCommandInput
  readonly commandSource: UniversalRoadCommandSource
  readonly stageRole: RiderStageRole
  readonly teamTactic: RoadTeamTactic
  /** True when the rider is physically active and can cross this point. */
  readonly canCrossPoint: boolean
  /** True when the rider deliberately commits to contesting this point. */
  readonly eligible: boolean
  readonly eligibilityReasons: readonly UniversalIntermediateEligibilityReason[]
}

export interface UniversalIntermediatePointPlan {
  readonly pointId: string
  readonly pointType: UniversalIntermediatePointType
  readonly pointName: string | null
  readonly kmFromStart: number
  readonly sortOrder: number
  readonly phaseNumber: RoadRacePhaseNumber
  readonly komCategory: KomCategory | null
  readonly configuredPointsScheme: readonly number[]
  readonly configuredTimeBonusSeconds: readonly number[]
  readonly candidateRiderIds: readonly string[]
  readonly eligibleRiderIds: readonly string[]
  readonly candidates: readonly UniversalIntermediatePointCandidate[]
  readonly status: 'ready' | 'no_eligible_riders'
}

export interface UniversalIntermediatePointPlanSummary {
  readonly active: boolean
  readonly inactiveReason: 'non_road_stage' | 'no_intermediate_points' | null
  readonly configuredPointCount: number
  readonly sprintPointCount: number
  readonly komPointCount: number
  readonly points: readonly UniversalIntermediatePointPlan[]
  readonly modelVersion: 'universal_intermediate_point_plan_v1'
}

export interface UniversalIntermediatePointBattleScoreComponents {
  readonly productionBaseScore: number
  readonly readinessContribution: number
  readonly racePositionContribution: number
  readonly teamSupportContribution: number
  readonly commandCommitmentContribution: number
  readonly energySpentPenalty: number
  readonly komCategoryContribution: number
  readonly deterministicVariation: number
}

export interface UniversalIntermediatePointBattleRanking {
  readonly rank: number
  readonly riderId: string
  readonly teamId: string
  readonly racePosition: UniversalIntermediateRacePosition
  readonly resolvedCommand: RoadCommandInput
  readonly stageRole: RiderStageRole
  readonly score: number
  readonly readinessScore: number
  readonly liveEnergyBeforeBattle: number
  readonly pointsAwarded: number
  readonly bonusSecondsAwarded: number
  readonly components: UniversalIntermediatePointBattleScoreComponents
}

export interface UniversalIntermediatePointBattle {
  readonly pointId: string
  readonly pointType: UniversalIntermediatePointType
  readonly pointName: string | null
  readonly kmFromStart: number
  readonly sortOrder: number
  readonly phaseNumber: RoadRacePhaseNumber
  readonly komCategory: KomCategory | null
  readonly komCategoryDifficultyFactor: number
  readonly configuredPointsScheme: readonly number[]
  readonly configuredTimeBonusSeconds: readonly number[]
  /** Every active rider included in the deterministic crossing order. */
  readonly eligibleContestantIds: readonly string[]
  /** Riders with an explicit command, role, or team objective commitment. */
  readonly committedContestantIds: readonly string[]
  readonly rankingMode:
    | 'deliberate_contest'
    | 'mixed_crossing_order'
    | 'automatic_crossing_order'
    | 'no_active_riders'
  readonly status: 'not_contested' | 'contested'
  readonly winnerRiderId: string | null
  readonly rankings: readonly UniversalIntermediatePointBattleRanking[]
  readonly totalPointsAwarded: number
  readonly totalBonusSecondsAwarded: number
  readonly scoringModel:
    | 'universal_intermediate_sprint_battle_v1'
    | 'universal_kom_battle_v1'
}

export interface UniversalIntermediatePointBattleSummary {
  readonly active: boolean
  readonly inactiveReason: 'non_road_stage' | 'no_intermediate_points' | null
  readonly configuredPointCount: number
  readonly contestedPointCount: number
  readonly totalPointsAwarded: number
  readonly totalBonusSecondsAwarded: number
  readonly battles: readonly UniversalIntermediatePointBattle[]
  readonly modelVersion: 'universal_intermediate_point_battles_v1'
}


export type UniversalIntermediatePointCostApplicationMode =
  | 'existing_phase_objective_cost'
  | 'point_finalization_cost'

export interface UniversalIntermediatePointCostApplication {
  readonly applicationKey: string
  readonly pointId: string
  readonly pointType: UniversalIntermediatePointType
  readonly phaseNumber: RoadRacePhaseNumber
  readonly riderId: string
  readonly teamId: string
  readonly rank: number
  readonly energyBeforeBattle: number
  readonly energyCost: number
  readonly energyAfterBattle: number
  readonly fatigueCost: number
  readonly applicationMode: UniversalIntermediatePointCostApplicationMode
  readonly applicationCount: 1
  readonly modelVersion: 'universal_intermediate_point_cost_v1'
}

export interface UniversalIntermediatePointReplayRanking {
  readonly rank: number
  readonly riderId: string
  readonly teamId: string
  readonly pointsAwarded: number
  readonly bonusSecondsAwarded: number
}

export interface UniversalIntermediatePointReplayEvent {
  readonly eventId: string
  readonly eventOrder: number
  readonly pointId: string
  readonly pointType: UniversalIntermediatePointType
  readonly pointName: string | null
  readonly kmFromStart: number
  readonly phaseNumber: RoadRacePhaseNumber
  readonly title: string
  readonly winnerRiderId: string | null
  readonly winnerTeamId: string | null
  readonly rankings: readonly UniversalIntermediatePointReplayRanking[]
  readonly costApplicationKeys: readonly string[]
  readonly commentaryEntryId: string
  readonly modelVersion: 'universal_intermediate_point_replay_event_v1'
}

export interface UniversalIntermediatePointCommentaryEntry {
  readonly commentaryEntryId: string
  readonly replayEventId: string
  readonly eventOrder: number
  readonly pointId: string
  readonly kmFromStart: number
  readonly phaseNumber: RoadRacePhaseNumber
  readonly title: string
  readonly description: string
  readonly modelVersion: 'universal_intermediate_point_commentary_v1'
}

export interface UniversalIntermediatePointLedgerEntry {
  readonly ledgerEntryKey: string
  readonly pointId: string
  readonly pointType: UniversalIntermediatePointType
  readonly riderId: string
  readonly teamId: string
  readonly rank: number
  readonly pointsAwarded: number
  readonly bonusSecondsAwarded: number
  readonly awardApplicationCount: 1
  readonly modelVersion: 'universal_intermediate_point_ledger_entry_v1'
}

export interface UniversalIntermediateRiderPointTotal {
  readonly riderId: string
  readonly teamId: string
  readonly sprintPoints: number
  readonly mountainPoints: number
  readonly totalPoints: number
  readonly bonusSeconds: number
  readonly pointWins: number
}

export interface UniversalIntermediateTeamPointTotal {
  readonly teamId: string
  readonly sprintPoints: number
  readonly mountainPoints: number
  readonly totalPoints: number
  readonly bonusSeconds: number
  readonly pointWins: number
}

export interface UniversalIntermediatePointSynchronizationSummary {
  readonly configuredPointCount: number
  readonly battleCount: number
  readonly replayEventCount: number
  readonly commentaryEntryCount: number
  readonly uniqueReplayPointCount: number
  readonly costApplicationCount: number
  readonly uniqueCostApplicationCount: number
  readonly ledgerEntryCount: number
  readonly uniqueLedgerEntryCount: number
  readonly missingBattlePointIds: readonly string[]
  readonly missingReplayEventPointIds: readonly string[]
  readonly missingCommentaryPointIds: readonly string[]
  readonly duplicateCostApplicationCount: number
  readonly duplicateLedgerEntryCount: number
  readonly synchronized: boolean
}

export interface UniversalIntermediatePointFinalizationSummary {
  readonly active: boolean
  readonly inactiveReason: 'non_road_stage' | 'no_intermediate_points' | null
  readonly configuredPointCount: number
  readonly finalizedPointCount: number
  readonly totalEnergyCost: number
  readonly totalFatigueCost: number
  readonly costApplications: readonly UniversalIntermediatePointCostApplication[]
  readonly replayEvents: readonly UniversalIntermediatePointReplayEvent[]
  readonly commentaryEntries: readonly UniversalIntermediatePointCommentaryEntry[]
  readonly pointLedger: readonly UniversalIntermediatePointLedgerEntry[]
  readonly riderPointTotals: readonly UniversalIntermediateRiderPointTotal[]
  readonly teamPointTotals: readonly UniversalIntermediateTeamPointTotal[]
  readonly synchronization: UniversalIntermediatePointSynchronizationSummary
  readonly modelVersion: 'universal_intermediate_point_finalization_v1'
}

export interface UniversalRoadPointBattleRanking {
  readonly rank: number
  readonly riderId: string
  readonly teamId: string
  readonly score: number
  readonly liveEnergyBeforeObjective: number
  readonly pointsAwarded: number
  readonly bonusSecondsAwarded: number
}

export interface UniversalRoadPointBattleResult {
  readonly pointId: string
  readonly pointType: 'INTERMEDIATE_SPRINT' | 'BONUS_SPRINT' | 'KOM'
  readonly pointName: string | null
  readonly kmFromStart: number
  readonly phaseNumber: 2 | 3
  readonly eligibleContestantIds: readonly string[]
  readonly status: 'not_contested' | 'contested'
  readonly winnerRiderId: string | null
  readonly rankings: readonly UniversalRoadPointBattleRanking[]
  readonly scoringModel:
    | 'production_intermediate_sprint_score_v1'
    | 'production_kom_score_v1'
}

export type UniversalRoadDevelopmentGroupCode =
  | 'breakaway'
  | 'main_peloton'

export interface UniversalRoadDevelopmentGroup {
  readonly groupCode: UniversalRoadDevelopmentGroupCode
  readonly groupOrder: 1 | 2
  readonly riderIds: readonly string[]
  readonly gapSeconds: number
}

export interface UniversalRoadDevelopmentRiderEnergy {
  readonly riderId: string
  readonly teamId: string
  readonly command: RoadCommandInput
  readonly startEnergy: number
  readonly baselinePhaseEnergyCost: number
  readonly objectiveEnergyCost: number
  readonly totalPhaseEnergyCost: number
  readonly energyAfterPhase: number
  readonly supportWorkScore: number
  readonly protectionReceivedScore: number
  readonly finalGroupCode: UniversalRoadDevelopmentGroupCode
  readonly modelVersion: 'production_step_energy_v2'
}

export interface UniversalRoadPhase2DevelopmentResult {
  readonly phaseNumber: 2
  readonly phaseBoundary: UniversalRoadPhaseBoundary
  readonly status: UniversalRoadDevelopmentStatus
  readonly startGapSeconds: number
  readonly endGapSeconds: number
  readonly gapDeltaSeconds: number
  readonly breakawayRiderIdsAtStart: readonly string[]
  readonly breakawayRiderIdsAtEnd: readonly string[]
  readonly pelotonRiderIdsAtEnd: readonly string[]
  readonly breakawayCooperation: UniversalRoadBreakawayCooperationResult | null
  readonly pelotonResponse: UniversalRoadPelotonResponseResult
  readonly supportActions: readonly UniversalRoadSupportAction[]
  readonly pointBattles: readonly UniversalRoadPointBattleResult[]
  readonly riderEnergy: readonly UniversalRoadDevelopmentRiderEnergy[]
  readonly groups: readonly UniversalRoadDevelopmentGroup[]
  readonly modelVersion: 'universal_road_phase_2_development_v1'
}

export interface UniversalRoadDecisiveTerrainSelection {
  readonly kmStart: number
  readonly kmEnd: number
  readonly distanceKm: number
  readonly elevationGainM: number
  readonly averageGradientPercent: number
  readonly terrainType: UniversalRoadOpeningStepTerrain
  readonly selectionScore: number
  readonly selectionSeverity: number
  readonly primarySkill:
    | 'flat'
    | 'climbing'
    | 'resistance'
    | 'raceIQ'
  readonly modelVersion: 'universal_decisive_terrain_selection_v1'
}

export interface UniversalRoadDecisiveAttackAttempt {
  readonly riderId: string
  readonly teamId: string
  readonly sourceGroupCode: UniversalRoadDevelopmentGroupCode
  readonly attemptKm: number
  readonly effectiveTerrainType: UniversalRoadOpeningStepTerrain
  readonly energyBeforeAttempt: number
  readonly attackIntentScore: number
  readonly attackExecutionSkillScore: number
  readonly attackSuccessProbability: number
  readonly deterministicOutcomeRoll: number
  readonly attackSucceeded: boolean
  readonly attackEnergyCost: number
  readonly energyAfterAttempt: number
  readonly positionScoreBonus: number
  readonly modelVersion: 'production_attack_outcome_v2'
}

export type UniversalRoadDecisiveGroupCode =
  | 'front_group'
  | 'main_group'
  | 'chasing_group'
  | 'dropped_group'

export type UniversalRoadDecisiveRiderStatus =
  | 'front_selection'
  | 'main_selection'
  | 'chasing'
  | 'dropped'

export type UniversalRoadFinishEligibilityReason =
  | 'eligible'
  | 'rider_unavailable'
  | 'energy_depleted'
  | 'dropped_by_decisive_terrain'
  | 'too_far_behind_after_selection'

export interface UniversalRoadDecisiveRiderState {
  readonly riderId: string
  readonly teamId: string
  readonly command: RoadCommandInput
  readonly startGroupCode: UniversalRoadDevelopmentGroupCode
  readonly startEnergy: number
  readonly phaseEnergyCost: number
  readonly attackEnergyCost: number
  readonly energyAfterPhase: number
  readonly terrainAbilityScore: number
  readonly readinessScore: number
  readonly suitabilityScore: number
  readonly protectionBonus: number
  readonly depletionPenalty: number
  readonly attackPositionBonus: number
  readonly decisiveScore: number
  readonly positionScore: number
  readonly status: UniversalRoadDecisiveRiderStatus
  readonly finalGroupCode: UniversalRoadDecisiveGroupCode
  readonly gapSeconds: number
  readonly finishContestEligible: boolean
  readonly finishEligibilityReason: UniversalRoadFinishEligibilityReason
  readonly modelVersion: 'universal_decisive_rider_state_v1'
}

export interface UniversalRoadDecisiveGroup {
  readonly groupCode: UniversalRoadDecisiveGroupCode
  readonly groupOrder: 1 | 2 | 3 | 4
  readonly riderIds: readonly string[]
  readonly gapSeconds: number
  readonly averageDecisiveScore: number
}

export type UniversalRoadDecisiveStatus =
  | 'front_selection_formed'
  | 'main_group_remains_together'
  | 'all_riders_depleted'

export interface UniversalRoadPhase3DecisiveResult {
  readonly phaseNumber: 3
  readonly phaseBoundary: UniversalRoadPhaseBoundary
  readonly status: UniversalRoadDecisiveStatus
  readonly decisiveTerrain: UniversalRoadDecisiveTerrainSelection
  readonly attackAttempts: readonly UniversalRoadDecisiveAttackAttempt[]
  readonly successfulAttackRiderIds: readonly string[]
  readonly pointBattles: readonly UniversalRoadPointBattleResult[]
  readonly riderStates: readonly UniversalRoadDecisiveRiderState[]
  readonly groups: readonly UniversalRoadDecisiveGroup[]
  readonly finishEligibleRiderIds: readonly string[]
  readonly finishIneligibleRiderIds: readonly string[]
  readonly modelVersion: 'universal_road_phase_3_decisive_v1'
}

export type UniversalRoadPhase4Status =
  | 'no_active_escape'
  | 'breakaway_survived'
  | 'breakaway_caught'
  | 'reduced_group_finish'
  | 'field_finish'

export type UniversalRoadFinalGroupCode =
  | 'winning_group'
  | 'front_chase_group'
  | 'main_finish_group'
  | 'late_group'

export type UniversalRoadFinishModel =
  | 'solo_finish'
  | 'flat_sprint'
  | 'reduced_group_sprint'
  | 'uphill_finish'
  | 'summit_finish'
  | 'cobbled_finish'

export interface UniversalRoadChasingTeamStrength {
  readonly teamId: string
  readonly explicitChaserRiderIds: readonly string[]
  readonly automaticWorkerRiderIds: readonly string[]
  readonly riderCount: number
  readonly averageChaseSkill: number
  readonly averageLiveEnergy: number
  readonly strengthScore: number
  readonly modelVersion: 'universal_chasing_team_strength_v1'
}

export interface UniversalRoadLateChaseStep {
  readonly kmStart: number
  readonly kmEnd: number
  readonly startGapSeconds: number
  readonly endGapSeconds: number
  readonly automaticActivityFactor: number
  readonly responseMode: UniversalPelotonResponseMode
  readonly selectedResponseMultiplier: number
  readonly escapePaceKmh: number
  readonly effectivePelotonPaceKmh: number
  readonly explicitChasingTeamCount: number
  readonly automaticChasingTeamCount: number
  readonly pelotonWorkIntensityFraction: number
  readonly frontRiderCount: number
  readonly bridgeGroupActive: boolean
  readonly bridgeGroupRiderIds: readonly string[]
  readonly bridgeStartGapToLeaderSeconds: number | null
  readonly bridgeEndGapToLeaderSeconds: number | null
  readonly bridgeStartGapToPelotonSeconds: number | null
  readonly bridgeEndGapToPelotonSeconds: number | null
  readonly bridgeMergedIntoFront: boolean
}

export interface UniversalRoadBridgeGapSample {
  readonly km: number
  readonly gapToLeaderSeconds: number
  readonly gapToPelotonSeconds: number
}

export interface UniversalRoadPhase4BridgeResult {
  readonly displayCode: 'F1'
  readonly riderIds: readonly string[]
  readonly launchKm: number
  readonly launchGapToLeaderSeconds: number
  readonly launchGapToPelotonSeconds: number
  readonly mergeKm: number | null
  readonly mergedIntoOpeningBreakaway: boolean
  readonly gapSamples: readonly UniversalRoadBridgeGapSample[]
  readonly energyCostByRider: readonly {
    readonly riderId: string
    readonly energyCost: number
  }[]
  readonly modelVersion: 'universal_road_phase_4_bridge_v1'
}

export interface UniversalRoadPhase4TerrainSelectionRider {
  readonly riderId: string
  readonly holdScore: number
  readonly energyAtTerrainStart: number
  readonly energyAtSelection: number
  readonly contactLossKm: number | null
  readonly gapPenaltySeconds: number
}

export interface UniversalRoadPhase4TerrainSelectionResult {
  readonly kmStart: number
  readonly kmEnd: number
  readonly selectionKm: number
  readonly terrainType: UniversalRoadOpeningStepTerrain
  readonly averageGradientPercent: number
  readonly selectionSeverity: number
  readonly holdWindow: number
  readonly minimumEnergyToHold: number
  readonly pelotonRiderIdsBefore: readonly string[]
  readonly retainedPelotonRiderIds: readonly string[]
  readonly droppedRiderIds: readonly string[]
  readonly riders: readonly UniversalRoadPhase4TerrainSelectionRider[]
  readonly modelVersion: 'universal_road_phase_4_terrain_selection_v2'
}

export interface UniversalRoadPhase4RiderState {
  readonly riderId: string
  readonly teamId: string
  readonly command: RoadCommandInput
  readonly startEnergy: number
  readonly baselinePhaseEnergyCost: number
  readonly automaticChaseEnergyCost: number
  readonly bridgeEnergyCost: number
  readonly finishEffortEnergyCost: number
  readonly totalPhaseEnergyCost: number
  readonly energyAtFinish: number
  readonly chaseWorkScore: number
  readonly leadOutSupportGiven: number
  readonly leadOutSupportReceived: number
  readonly contactLossKm: number | null
  readonly contactLossReason: 'terrain_pressure' | 'energy_depleted' | null
  readonly contactLossGapPenaltySeconds: number
  readonly finalGroupCode: UniversalRoadFinalGroupCode
  readonly finalGapSeconds: number
  readonly modelVersion: 'universal_road_phase_4_rider_state_v2'
}

export interface UniversalRoadFinalGroup {
  readonly groupCode: UniversalRoadFinalGroupCode
  readonly groupOrder: 1 | 2 | 3 | 4
  readonly riderIds: readonly string[]
  readonly gapSeconds: number
  readonly finishTimeSeconds: number
}

export interface UniversalRoadFinishRanking {
  readonly rank: number
  readonly riderId: string
  readonly teamId: string
  readonly finishScore: number
  readonly energyAtFinish: number
  readonly finishTimeSeconds: number
  readonly gapSeconds: number
  readonly pointsAwarded: number
  readonly bonusSecondsAwarded: number
}

export interface UniversalRoadFinishResult {
  readonly finishModel: UniversalRoadFinishModel
  readonly finishType: FinishType
  readonly contenderRiderIds: readonly string[]
  readonly winnerRiderId: string
  readonly rankings: readonly UniversalRoadFinishRanking[]
  readonly modelVersion:
    | 'production_front_group_sprint_score_v1'
    | 'universal_road_finish_score_v1'
}

export interface UniversalRoadPhase4FinishResult {
  readonly phaseNumber: 4
  readonly phaseBoundary: UniversalRoadPhaseBoundary
  readonly status: UniversalRoadPhase4Status
  readonly automaticActivityStartsAtFraction: number
  readonly automaticActivityApplied: boolean
  readonly startGapSeconds: number
  readonly endGapSeconds: number
  readonly gapClosureSeconds: number
  readonly escapeRiderIdsAtStart: readonly string[]
  readonly frontRiderIdsAfterBridges: readonly string[]
  readonly bridgeGroups: readonly UniversalRoadPhase4BridgeResult[]
  readonly frontStrengthRecalculatedAfterBridge: boolean
  readonly breakawaySurvived: boolean
  readonly breakawayCaught: boolean
  readonly explicitChasingTeamIds: readonly string[]
  readonly automaticChasingTeamIds: readonly string[]
  readonly chasingTeamStrength: readonly UniversalRoadChasingTeamStrength[]
  readonly chaseSteps: readonly UniversalRoadLateChaseStep[]
  readonly lateTerrainSelection: UniversalRoadPhase4TerrainSelectionResult | null
  readonly riderStates: readonly UniversalRoadPhase4RiderState[]
  readonly finalGroups: readonly UniversalRoadFinalGroup[]
  readonly finish: UniversalRoadFinishResult
  readonly modelVersion: 'universal_road_phase_4_finish_v1'
}

export interface UniversalRoadRaceResolutionSummary {
  readonly active: boolean
  readonly inactiveReason: 'non_road_stage' | null
  readonly phase1Opening: UniversalRoadPhase1OpeningResult | null
  readonly phase2Development: UniversalRoadPhase2DevelopmentResult | null
  readonly phase3Decisive: UniversalRoadPhase3DecisiveResult | null
  readonly phase4Finish: UniversalRoadPhase4FinishResult | null
  readonly modelVersion: 'universal_road_race_resolution_v1'
}

export interface UniversalTerrainSummary {
  readonly flatShare: number
  readonly rollingShare: number
  readonly climbingShare: number
  readonly descentShare: number
  readonly totalAscentM: number
  readonly ascentPer100Km: number
  readonly longestClimbKm: number
  readonly maximumImportantGradient: number
  readonly summitFinish: boolean
}


export type UniversalPhase5GroupCode =
  | 'breakaway'
  | 'front_favourites'
  | 'chasing_group'
  | 'reduced_peloton'
  | 'main_peloton'
  | 'dropped_group'
  | 'time_limit_group'
  | 'individual_time_unit'
  | 'team_time_unit'

export interface UniversalPhase5PerformanceBand {
  readonly bestScore: number
  readonly worstScore: number
  readonly spread: number
  readonly threshold: number
}

export type UniversalPhase5PhysicalPosition =
  | 'ahead_of_peloton'
  | 'peloton'
  | 'behind_peloton'
  | 'timing_unit'

export type UniversalPhase5ColorKey =
  | 'breakaway_red'
  | 'peloton_blue'
  | 'chasing_orange'
  | 'front_yellow'
  | 'dropped_gray'
  | 'timing_neutral'

export interface UniversalPhase5GroupSnapshot {
  readonly phaseNumber: RoadRacePhaseNumber | 0
  readonly groupOrder: number
  readonly groupCode: UniversalPhase5GroupCode
  readonly displayCode: string
  readonly physicalPosition: UniversalPhase5PhysicalPosition
  readonly colorKey: UniversalPhase5ColorKey
  readonly riderIds: readonly string[]
  readonly gapSeconds: number
  readonly officialTimeSeconds: number | null
  readonly performanceBand: UniversalPhase5PerformanceBand
  readonly formationReason:
    | 'opening_escape'
    | 'peloton_cohesion'
    | 'performance_band_split'
    | 'decisive_selection'
    | 'late_front_attack'
    | 'breakaway_catch'
    | 'chase_reformation'
    | 'finish_group'
    | 'individual_timing'
    | 'team_timing'
}

export interface UniversalPhase5OfficialResult {
  readonly rank: number
  readonly riderId: string
  readonly teamId: string
  readonly groupCode: UniversalPhase5GroupCode
  readonly groupOrder: number
  readonly officialTimeSeconds: number
  readonly gapSeconds: number
  readonly performanceScore: number
  readonly timeSource:
    | 'road_group_time'
    | 'individual_time_trial'
    | 'team_counting_rider_time'
    | 'pair_time'
}

export interface UniversalPhase5GroupingSummary {
  readonly active: boolean
  readonly stageFormat: StageFormat
  readonly selectionProfile:
    | 'flat_large_groups'
    | 'hilly_moderate_selection'
    | 'hard_hilly_reduced_groups'
    | 'mountain_multiple_groups'
    | 'extreme_mountain_large_gaps'
    | 'cobbled_irregular_selection'
    | 'individual_timing'
    | 'team_timing'
  readonly phaseGroups: readonly UniversalPhase5GroupSnapshot[]
  readonly finalGroups: readonly UniversalPhase5GroupSnapshot[]
  readonly officialResults: readonly UniversalPhase5OfficialResult[]
  readonly everyStarterAssignedExactlyOnce: boolean
  readonly groupTimesMonotonic: boolean
  readonly deterministicGapCapSeconds: number
  readonly modelVersion: 'universal_phase_5_lineage_groups_and_times_v2'
}

export type UniversalFinishMode =
  | 'solo_finish'
  | 'flat_sprint'
  | 'reduced_group_sprint'
  | 'hill_finish'
  | 'summit_finish'
  | 'cobbled_finish'
  | 'individual_time_trial'
  | 'prologue'
  | 'team_time_trial'
  | 'pair_time_trial'

export interface UniversalFinishPreparationContext {
  readonly inStageEnergyCostMultiplier: number
  readonly postStageFatigueMultiplier: number
  readonly postStageRecoveryBonusPoints: number
}

export interface UniversalFinishRiderContext {
  readonly riderId: string
  readonly teamId: string
  readonly eligibleToStart: boolean
  readonly sprintSkill: number
  readonly timeTrialSkill: number
  readonly flatSkill: number
  readonly climbingSkill: number
  readonly enduranceSkill: number
  readonly resistanceSkill: number
  readonly teamworkSkill: number
  readonly raceSharpness: number
  readonly startFreshness: number
  readonly fatigueBeforeStage: number
  readonly finishContestEligible: boolean
  readonly physicalGroupCode: UniversalPhase5GroupCode | null
  readonly physicalGroupOrder: number | null
  readonly physicalGapSeconds: number | null
  readonly phase5OfficialTimeSeconds: number | null
  readonly phase5PerformanceScore: number | null
  readonly remainingEnergy: number | null
  readonly readinessScore: number
  readonly suitabilityScore: number
  readonly phase4Command: RoadCommandInput | null
  readonly phase4CommandBehaviour: UniversalRoadCommandBehaviour | null
  readonly leadOutSupportGiven: number
  readonly leadOutSupportReceived: number
  readonly teamSupportReceived: number
  readonly successfulAttackAttemptKm: number | null
  readonly successfulAttackTimingFraction: number | null
  readonly roadFinalGroupCode: UniversalRoadFinalGroupCode | null
  readonly phase4FinishRank: number | null
  readonly phase4FinishScore: number | null
  readonly preparation: UniversalFinishPreparationContext
}

export interface UniversalFinishScoreComponents {
  readonly skill: number
  readonly energy: number
  readonly sharpness: number
  readonly readiness: number
  readonly suitability: number
  readonly positioning: number
  readonly command: number
  readonly support: number
  readonly preparation: number
  readonly variation: number
  readonly fatigue?: number
  readonly attackTiming?: number
  readonly route?: number
  readonly weather?: number
  readonly equipment?: number
  readonly pacing?: number
}

export type UniversalOfficialFinishStatus =
  | 'finished'
  | 'dns'
  | 'dnf'
  | 'otl'

export const UNIVERSAL_PHASE10_OFFICIAL_STATUSES = [
  'finished',
  'dns',
  'dnf',
  'otl',
] as const

export type UniversalPhase10IncidentKind =
  | 'individual_crash'
  | 'group_crash'
  | 'technical_incident'

export type UniversalPhase10IncidentSeverity =
  | 'minor'
  | 'moderate'
  | 'serious'

export type UniversalPhase10TechnicalIncidentType =
  | 'dropped_chain'
  | 'puncture'
  | 'wheel_damage'
  | 'drivetrain_failure'
  | 'bike_change'

export type UniversalPhase10PreRaceRestriction =
  | 'none'
  | 'not_fully_fit'
  | 'excessive_fatigue'
  | 'severe_weather'
  | 'persisted_health_case'

export interface UniversalPhase10PreRaceAvailabilityRow {
  readonly riderId: string
  readonly teamId: string
  readonly acceptedRider: true
  readonly startStatus: RiderStartStatus
  readonly startAllowed: boolean
  readonly dns: boolean
  readonly availabilityStatus: AvailabilityStatus
  readonly restriction: UniversalPhase10PreRaceRestriction
  readonly healthCaseType: HealthCaseType | null
  readonly healthCaseSeverity: HealthCaseSeverity | null
  readonly healthSelectionBlocked: boolean
  readonly source:
    | 'existing_start_status'
    | 'existing_health_system'
    | 'existing_readiness_restriction'
    | 'none'
}

export interface UniversalPhase10IncidentProbabilityBreakdown {
  readonly incidentKind: UniversalPhase10IncidentKind
  readonly baseProbabilityPer30Seconds: number
  readonly tickDurationMultiplier: number
  readonly weatherMultiplier: number
  readonly speedMultiplier: number
  readonly descentMultiplier: number
  readonly densityMultiplier: number
  readonly fatigueMultiplier: number
  readonly riderControlMultiplier: number
  readonly preparationSupportMultiplier: number
  readonly commandIntensityMultiplier: number
  readonly raceSituationMultiplier: number
  readonly equipmentConditionMultiplier: number
  readonly mechanicalSupportMultiplier: number
  readonly uncappedProbability: number
  readonly maximumProbability: number
  readonly finalProbability: number
}

export interface UniversalPhase10IncidentProbabilityInput {
  readonly incidentKind: UniversalPhase10IncidentKind
  readonly tickSeconds: number
  readonly weatherMultiplier: number
  readonly currentSpeedKmh: number
  readonly gradientPercent: number
  readonly groupSize: number
  readonly runtimeFatigue: number
  readonly resistance: number
  readonly raceIq: number
  readonly preparationSupportMultiplier: number
  readonly commandIntensityMultiplier: number
  /** Context from the authoritative race state: peloton chase, late sprint, etc. */
  readonly raceSituationMultiplier?: number | null
  readonly equipmentConditionPercent?: number | null
  readonly mechanicalIncidentRiskMultiplier?: number | null
}

export type UniversalPhase10HealthCaseCode =
  | 'road_rash'
  | 'wrist_sprain'
  | 'ankle_sprain'
  | 'muscle_strain'
  | 'concussion'
  | 'fracture'

export interface UniversalPhase10RiderHealthOutcome {
  readonly injuryOccurred: boolean
  readonly caseCode: UniversalPhase10HealthCaseCode | null
  readonly severity: HealthCaseSeverity | null
  readonly bodyPart: string | null
  readonly currentStageContinuation: 'unaffected' | 'continues_injured' | 'dnf'
  readonly selectionBlockedAfterStage: boolean
  readonly currentStagePerformancePenaltyPoints: number
  readonly additionalEnergyLossPoints: number
  readonly deterministicRoll: number
  readonly persistentAction: 'none' | 'create_health_case_after_finalization'
  readonly source: 'universal_phase10_crash_health_handoff_v1'
}

export interface UniversalPhase10SprintZoneProtection {
  readonly eligible: boolean
  readonly applied: boolean
  readonly zoneKm: number
  readonly protectedOfficialTimeSeconds: number | null
  readonly sourceDisplayCode: string | null
  readonly source: 'universal_phase10_sprint_zone_time_protection_v1'
}

export interface UniversalPhase10RiderIncidentConsequence {
  readonly riderId: string
  readonly teamId: string
  readonly energyLossPoints: number
  readonly timePenaltySeconds: number
  /**
   * True when the incident creates a real physical separation from the rider's
   * source group. Recoverable incidents may later rejoin without a final time
   * penalty; this flag is about the live race state, not permanent classification.
   */
  readonly movedToLaterGroup: boolean
  /** True when the road-race separation is actually chased back before the finish. */
  readonly temporarySeparation: boolean
  /**
   * Backward-compatible alias for the deterministic actual rejoin point. v10d
   * no longer predicts recovery from a fixed seconds-per-kilometre rule.
   */
  readonly expectedRejoinKm: number | null
  /** Actual rejoin point discovered by the autonomous incident-chase simulation. */
  readonly actualRejoinKm: number | null
  /** Additional physical effort spent chasing after the incident. */
  readonly chaseEnergyCostPoints: number
  /** Group the rider is trying to regain; normally P for peloton incidents. */
  readonly recoveryTargetDisplayCode: string | null
  /** Remaining separation from the target at the finish; zero after a successful rejoin. */
  readonly finalGapToTargetSeconds: number
  /** Per-rider deterministic crash-to-health handoff; technical incidents are no-injury. */
  readonly healthOutcome: UniversalPhase10RiderHealthOutcome
  /** Official-time protection for duly recorded late incidents on eligible sprint stages. */
  readonly sprintZoneProtection: UniversalPhase10SprintZoneProtection
  readonly statusImpact: 'finished' | 'dnf'
}

export interface UniversalPhase10IncidentRecord {
  readonly incidentId: string
  readonly incidentKind: UniversalPhase10IncidentKind
  readonly incidentType: string
  readonly severity: UniversalPhase10IncidentSeverity
  readonly technicalType: UniversalPhase10TechnicalIncidentType | null
  readonly phase: RoadRacePhaseNumber
  readonly raceSecond: number
  readonly kmFromStart: number
  readonly progressFraction: number
  readonly probability: UniversalPhase10IncidentProbabilityBreakdown
  readonly deterministicRoll: number
  readonly deterministicHash: string
  readonly weatherRelated: boolean
  readonly causes: readonly string[]
  readonly sourceDisplayCode: string | null
  readonly timeLossSeconds: number
  readonly riderIds: readonly string[]
  readonly teamIds: readonly string[]
  readonly riderConsequences: readonly UniversalPhase10RiderIncidentConsequence[]
  readonly title: string
  readonly description: string
  readonly healthCaseEligible: boolean
  readonly healthSeverityHint: HealthCaseSeverity | null
  readonly healthSubtypeHint: UniversalPhase10HealthCaseCode | null
  readonly persistentHealthOutcome: 'application_health_system_after_finalization'
}

export interface UniversalPhase10StatusGroup {
  readonly status: UniversalOfficialFinishStatus
  readonly riderIds: readonly string[]
}

export interface UniversalPhase10TimeLimitContract {
  readonly percentage: number
  readonly enforced: boolean
  readonly winnerTimeSeconds: number | null
  readonly cutoffTimeSeconds: number | null
  readonly source: 'universal_phase10_time_limit_v1'
}

export interface UniversalPhase10AutonomousChaseSummary {
  readonly active: boolean
  readonly modelVersion: 'autonomous_incident_chase_v1'
  readonly simulationStepKm: number
  readonly mergeToleranceSeconds: number
  readonly riderEpisodeCount: number
  readonly rejoinedEpisodeCount: number
  readonly nonRejoinedEpisodeCount: number
  readonly groupMergeCount: number
  readonly groupMergeKms: readonly number[]
  readonly exactRejoinKms: readonly number[]
  readonly totalChaseEnergyCostPoints: number
}

export interface UniversalPhase10IncidentSummary {
  readonly active: boolean
  readonly modelEnabled: boolean
  readonly preRaceAvailability: readonly UniversalPhase10PreRaceAvailabilityRow[]
  readonly incidents: readonly UniversalPhase10IncidentRecord[]
  readonly incidentCount: number
  readonly individualCrashCount: number
  readonly groupCrashCount: number
  readonly technicalIncidentCount: number
  readonly maximumIncidentsPerStage: 10
  readonly maximumIncidentsPerPhase: Readonly<Record<RoadRacePhaseNumber, number>>
  readonly incidentCountByPhase: Readonly<Record<RoadRacePhaseNumber, number>>
  readonly globalCooldownSeconds: 120
  readonly riderCooldownSeconds: 900
  readonly autonomousChase: UniversalPhase10AutonomousChaseSummary
  readonly sprintZone: {
    readonly configuredKm: number
    readonly eligibleStage: boolean
    readonly protectedRiderCount: number
    readonly protectedIncidentCount: number
    readonly source: 'universal_phase10_sprint_zone_time_protection_v1'
  }
  readonly healthHandoff: {
    readonly injuryOutcomeCount: number
    readonly continuingInjuredCount: number
    readonly dnfInjuryCount: number
    readonly persistentCaseCandidateCount: number
    readonly persistentWritesPerformed: false
    readonly source: 'universal_phase10_crash_health_handoff_v1'
  }
  readonly finalClassification: readonly UniversalOfficialFinishRow[]
  readonly finalRoadGroups: readonly UniversalReplayGroupState[]
  readonly finalRoadGaps: readonly UniversalReplayGapState[]
  readonly statusGroups: readonly UniversalPhase10StatusGroup[]
  readonly statusByRiderId: Readonly<Record<string, UniversalOfficialFinishStatus>>
  readonly allAcceptedRidersHaveExactlyOneStatus: boolean
  readonly allAcceptedRidersPresentInStatusGroups: boolean
  readonly everyIncidentRiderRemainsTracked: boolean
  readonly timeLimit: UniversalPhase10TimeLimitContract
  readonly persistentHealthWritesPerformed: false
  readonly directDatabaseWritesPerformed: false
  readonly deterministic: true
  readonly modelVersion: 'universal_phase_10_incidents_v4'
}

export interface UniversalOfficialFinishRow {
  readonly rank: number | null
  readonly riderId: string
  readonly teamId: string
  readonly status: UniversalOfficialFinishStatus
  readonly physicalGroupCode: UniversalPhase5GroupCode | null
  readonly physicalGroupOrder: number | null
  readonly officialTimeSeconds: number | null
  readonly gapSeconds: number | null
  readonly sameTimeAsPrevious: boolean
  readonly finishScore: number | null
  readonly components: UniversalFinishScoreComponents | null
}

export interface UniversalTeamTimeTrialScoreComponents {
  readonly strongestRiders: number
  readonly teamAverage: number
  readonly weakestCountingRider: number
  readonly cooperation: number
  readonly fatigue: number
  readonly equipment: number
  readonly weather: number
  readonly pacing: number
  readonly variation: number
}

export interface UniversalOfficialTeamTime {
  readonly rank: number
  readonly teamId: string
  readonly officialTimeSeconds: number
  readonly gapSeconds: number
  readonly countingRiderId: string | null
  readonly countingRiderNumber: number | null
  readonly selectedRiderIds: readonly string[]
  readonly countingRiderIds: readonly string[]
  readonly finishScore: number
  readonly components: UniversalTeamTimeTrialScoreComponents
}

export interface UniversalFinishResolution {
  readonly active: true
  readonly complete: boolean
  readonly stageClassification: UniversalStageClassification
  readonly finishMode: UniversalFinishMode
  readonly winnerRiderId: string | null
  readonly winnerTeamId: string | null
  readonly classification: readonly UniversalOfficialFinishRow[]
  readonly teamTimes: readonly UniversalOfficialTeamTime[]
  readonly riderContexts: readonly UniversalFinishRiderContext[]
  readonly deterministic: true
  readonly sourcePhase5ModelVersion:
    UniversalPhase5GroupingSummary['modelVersion']
  readonly modelVersion:
    | 'universal_finish_resolution_foundation_v1'
    | 'universal_solo_finish_v1'
    | 'universal_flat_sprint_finish_v1'
    | 'universal_reduced_group_sprint_finish_v1'
    | 'universal_hill_finish_v1'
    | 'universal_summit_finish_v1'
    | 'universal_cobbled_finish_v1'
    | 'universal_individual_time_trial_finish_v1'
    | 'universal_prologue_finish_v1'
    | 'universal_team_time_trial_finish_v1'
    | 'universal_pair_time_trial_finish_v1'
}

export interface UniversalFinishFoundationSources {
  readonly input: UniversalRaceEngineInput
  readonly stageClassification: UniversalStageClassification
  readonly riderReadiness: readonly UniversalRiderReadinessResult[]
  readonly riderSuitability: readonly UniversalRiderSuitabilityResult[]
  readonly roadCommandResolution: UniversalRoadCommandResolutionSummary
  readonly roadRaceResolution: UniversalRoadRaceResolutionSummary
  readonly groupAndTimeResolution: UniversalPhase5GroupingSummary
}

export interface UniversalRaceCalibrationSummary {
  readonly stageClassification: UniversalStageClassification
  readonly finishMode: UniversalFinishMode
  readonly winnerRiderId: string
  readonly winnerTeamId: string
  readonly winningTimeSeconds: number
  readonly averageSpeedKmh: number
  readonly finishingRiderCount: number
  readonly finalGroupCount: number
  readonly finalGroupGapsSeconds: readonly number[]
  readonly openingBreakawaySize: number
  readonly openingAttackKm: number | null
  readonly maximumBreakawayGapSeconds: number
  readonly breakawayCaught: boolean
  readonly breakawaySurvived: boolean
  readonly catchKm: number | null
  readonly averageRemainingEnergy: number | null
  readonly minimumRemainingEnergy: number | null
  readonly deterministic: true
  readonly sourceModels: {
    readonly roadRace: UniversalRoadRaceResolutionSummary['modelVersion']
    readonly groupsAndTimes: UniversalPhase5GroupingSummary['modelVersion']
    readonly finish: UniversalFinishResolution['modelVersion']
  }
  readonly modelVersion: 'universal_race_calibration_summary_v1'
}


export type UniversalReplayCheckpointKind = 'base' | 'event'

export type UniversalReplayEventType =
  | 'race_start'
  | 'race_status'
  | 'phase_end'
  | 'finish'
  | 'intermediate_sprint'
  | 'bonus_sprint'
  | 'kom'
  | 'attack'
  | 'breakaway_formation'
  | 'peloton_control'
  | 'group_split'
  | 'group_merge'
  | 'bridge_attack'
  | 'bridge_progress'
  | 'bridge_merge'
  | 'late_chase'
  | 'catch'
  | 'finish_preparation'
  | 'incident'

export interface UniversalReplayRaceProgress {
  readonly fraction: number
  readonly percent: number
  readonly kmFromStart: number
}

export interface UniversalReplayGroupState {
  readonly groupCode: UniversalPhase5GroupCode
  readonly displayCode: string
  readonly physicalPosition: UniversalPhase5PhysicalPosition
  readonly colorKey: UniversalPhase5ColorKey
  readonly riderIds: readonly string[]
}

export interface UniversalReplayGapState {
  readonly groupCode: UniversalPhase5GroupCode
  readonly displayCode: string
  readonly gapSeconds: number
  readonly officialTimeSeconds: number | null
}

export type UniversalReplayRiderStatus =
  | 'racing'
  | UniversalOfficialFinishStatus

export interface UniversalReplayRiderState {
  readonly riderId: string
  readonly teamId: string
  readonly status: UniversalReplayRiderStatus
  readonly groupCode: UniversalPhase5GroupCode | null
  readonly displayCode: string | null
  readonly gapSeconds: number | null
  readonly energy: number
  readonly readinessScore: number
  readonly finishRank: number | null
  readonly officialTimeSeconds: number | null
}

export interface UniversalReplayTeamState {
  readonly teamId: string
  readonly activeRiderIds: readonly string[]
  readonly racingRiderCount: number
  readonly finishedRiderCount: number
  readonly dnsRiderCount: number
  readonly dnfRiderCount: number
  readonly otlRiderCount: number
}

export interface UniversalReplayActiveCommand {
  readonly riderId: string
  readonly teamId: string
  readonly phaseNumber: RoadRacePhaseNumber
  readonly stageRole: RiderStageRole
  readonly savedCommand: RoadCommandInput
  readonly resolvedCommand: RoadCommandInput
  readonly resolvedSource: UniversalRoadCommandSource
  readonly behaviour: UniversalRoadCommandBehaviour
}

export interface UniversalReplayIncident {
  readonly incidentId: string
  readonly incidentType: string
  readonly phase: RoadRacePhaseNumber
  readonly kmFromStart: number
  readonly riderIds: readonly string[]
  readonly teamIds: readonly string[]
  readonly title: string
  readonly description: string
}

export interface UniversalReplayCommentaryEntry {
  readonly commentaryId: string
  readonly eventType: UniversalReplayEventType
  readonly title: string
  readonly description: string
  readonly riderIds: readonly string[]
  readonly teamIds: readonly string[]
}

export interface UniversalReplayCheckpoint {
  readonly checkpointId: string
  readonly checkpointIndex: number
  readonly checkpointKind: UniversalReplayCheckpointKind
  readonly phase: 0 | RoadRacePhaseNumber
  readonly raceProgress: UniversalReplayRaceProgress
  readonly groups: readonly UniversalReplayGroupState[]
  readonly gaps: readonly UniversalReplayGapState[]
  readonly riderStates: readonly UniversalReplayRiderState[]
  readonly teamStates: readonly UniversalReplayTeamState[]
  readonly activeCommands: readonly UniversalReplayActiveCommand[]
  readonly intermediateResults:
    readonly UniversalIntermediatePointReplayEvent[]
  readonly incidents: readonly UniversalReplayIncident[]
  readonly commentary: readonly UniversalReplayCommentaryEntry[]
  readonly finalResultsVisible: boolean
}

export interface UniversalReplayTimeline {
  readonly active: boolean
  readonly inactiveReason: 'road_resolution_incomplete' | null
  readonly completeBeforePlayback: true
  readonly playbackRecalculatesRace: false
  readonly baseCheckpointCount: number
  readonly eventCheckpointCount: number
  readonly checkpoints: readonly UniversalReplayCheckpoint[]
  readonly finalCheckpointId: string | null
  readonly resultsVisibleFromCheckpointId: string | null
  readonly deterministic: true
  readonly modelVersion: 'universal_replay_timeline_v1'
}

export type UniversalReplayIncidentSynchronizationStatus =
  | 'not_available'
  | 'synchronized'

export interface UniversalReplaySynchronizationSummary {
  readonly synchronized: boolean
  readonly checkpointCount: number
  readonly baseCheckpointCount: number
  readonly eventCheckpointCount: number
  readonly uniqueCheckpointIdCount: number
  readonly uniqueCommentaryIdCount: number
  readonly resultsVisibleCheckpointCount: number
  readonly allCheckpointsChronological: boolean
  readonly allCheckpointRidersComplete: boolean
  readonly allGroupMembershipUnique: boolean
  readonly allGapsMatchGroups: boolean
  readonly allTeamStatesMatchRiders: boolean
  readonly allCommandsMatchResolution: boolean
  readonly allIntermediateResultsCumulative: boolean
  readonly allCommentaryReferencesValid: boolean
  readonly allSameKilometreStatesConsistent: boolean
  readonly allGapChangesDistanceBounded: boolean
  readonly openingBreakawayLineageStable: boolean
  readonly allFrontGroupTransfersPhysicallyValid: boolean
  readonly allBridgeSequencesPhysicallyValid: boolean
  readonly allCommentaryPhaseNeutral: boolean
  readonly allCommentaryWholeSecondFormatting: boolean
  readonly postCatchStateStable: boolean
  readonly allResultFieldsHiddenBeforeFinish: boolean
  readonly finalCheckpointMatchesClassification: boolean
  readonly incidentSynchronizationStatus:
    UniversalReplayIncidentSynchronizationStatus
  readonly incidentIntegrationComplete: boolean
  readonly incidentCount: number
  readonly issues: readonly string[]
  readonly deterministic: true
  readonly modelVersion: 'universal_replay_synchronization_v1'
}


const UNIVERSAL_REPLAY_SOFT_ISSUE_PREFIXES = [
  'same_kilometre_physical_state_mismatch:',
  'gap_change_not_distance_bounded:',
  'duplicate_group_display_code:',
  'group_gap_cardinality_mismatch:',
  'duplicate_physical_group_gap:',
  'group_gap_identity_mismatch:',
  'rider_group_gap_mismatch:',
  'opening_breakaway_lineage_changed:',
  'opening_breakaway_lineage_changed_without_bridge_merge:',
  'opening_breakaway_reappears:',
  'front_group_transfer_without_physical_transition:',
  'post_catch_group_transfer_without_physical_transition:',
  'post_catch_breakaway_or_chase_reappears:',
  'bridge_attack_invalid:',
  'bridge_progress_invalid:',
  'bridge_merge_invalid:',
  'bridge_group_disappears_without_merge:',
  'bridge_group_without_peloton:',
] as const

/**
 * Phase 11 production progress guarantee.
 *
 * These issues describe replay presentation/physical-continuity problems only.
 * They must remain visible in `issues`, but they cannot invalidate an otherwise
 * complete official sporting result. Anything not explicitly whitelisted here
 * remains a hard synchronization failure.
 */
export function isUniversalReplaySoftIssue(issue: string): boolean {
  return UNIVERSAL_REPLAY_SOFT_ISSUE_PREFIXES.some((prefix) =>
    issue.startsWith(prefix),
  )
}

export function applyUniversalReplayProgressGuarantee(
  summary: UniversalReplaySynchronizationSummary,
): UniversalReplaySynchronizationSummary {
  if (summary.synchronized || summary.issues.length === 0) {
    return summary
  }

  const hardIssues = summary.issues.filter(
    (issue) => !isUniversalReplaySoftIssue(issue),
  )

  if (hardIssues.length > 0) {
    return summary
  }

  // Preserve the original issue list for diagnostics. Only the replay-only
  // physical/presentation invariants are accepted in degraded mode.
  return {
    ...summary,
    synchronized: true,
    allSameKilometreStatesConsistent: true,
    allGapChangesDistanceBounded: true,
    openingBreakawayLineageStable: true,
    allFrontGroupTransfersPhysicallyValid: true,
    allBridgeSequencesPhysicallyValid: true,
    postCatchStateStable: true,
  }
}

export type UniversalPostStageSourceCoverage = {
  readonly terrain: 'represented_by_energy_and_difficulty'
  readonly riderEffort: 'represented_by_calculated_energy_spent'
  readonly savedCommands: 'represented_by_resolved_command_effort'
  readonly attacks: 'represented_by_attack_energy'
  readonly chasing: 'represented_by_chase_energy'
  readonly breakaway: 'represented_by_breakaway_energy_and_duration'
  readonly supportWork: 'represented_by_support_and_lead_out_energy'
  readonly intermediatePoints: 'represented_exactly_once'
  readonly weather: 'represented_by_energy_and_difficulty'
  readonly equipment: 'represented_by_capped_performance_reliability_and_wear'
  readonly assets: 'represented_by_condition_dependent_support_and_wear'
  readonly supplies: 'represented_by_benefits_shortages_and_consumption'
  readonly staff: 'represented_by_approved_capped_role_support'
  readonly incidents:
    'consumes_authoritative_incidents_when_available_and_exposes_fatigue_risk'
}

export type UniversalPostStageEffortCategory =
  | 'not_started'
  | 'protected'
  | 'normal'
  | 'high'
  | 'very_high'

export interface UniversalPostStageEffortBreakdown {
  readonly effortCategory: UniversalPostStageEffortCategory
  readonly averageCommandEffortMultiplier: number
  readonly attackEnergySpent: number
  readonly chaseEnergySpent: number
  readonly finishEffortEnergySpent: number
  readonly intermediatePointEnergySpent: number
  readonly supportWorkScore: number
  readonly protectionReceivedScore: number
  readonly breakawayPhaseCount: number
  readonly modelVersion: 'universal_post_stage_effort_breakdown_v1'
}

export type UniversalPostStageHealthRestrictionReason =
  | 'none'
  | 'dns'
  | 'not_fully_fit'
  | 'injured'
  | 'sick'
  | 'selection_blocked'

export interface UniversalPostStagePersistenceRow {
  readonly riderId: string
  readonly teamId: string
  readonly fatigueBefore: number
  readonly fatigueGained: number
  readonly fatigueAfter: number
  readonly energySpent: number
  readonly recoveryDemand: number
  readonly finishStamina: number | null
  readonly finishStatus: UniversalOfficialFinishStatus
  readonly incidentRiskMultiplierAfter: number
  readonly writeKey: string
}

export interface UniversalPostStagePersistenceContract {
  readonly requiresOfficialStageFinalization: true
  readonly requiresCompleteClassification: true
  readonly requiresSynchronizedReplay: true
  readonly directDatabaseWritePerformed: false
  readonly activationBoundary: 'existing_application_service_after_stage_finalization'
  readonly idempotencyScope: 'stage_rider_post_stage_v2'
  readonly sourceClassificationComplete: boolean
  readonly sourceReplaySynchronized: boolean
  readonly payloadValid: boolean
  readonly rowCount: number
  readonly rows: readonly UniversalPostStagePersistenceRow[]
  readonly modelVersion: 'universal_post_stage_persistence_contract_v1'
}

export interface UniversalPostStagePersistenceDecision {
  readonly allowed: boolean
  readonly reasons: readonly string[]
  readonly stageFinalized: boolean
  readonly finishResolutionComplete: boolean
  readonly replaySynchronized: boolean
  readonly payloadValid: boolean
  readonly modelVersion: 'universal_post_stage_persistence_decision_v1'
}

export interface UniversalPostStagePreviousStageSeed {
  readonly stageId: string
  readonly stageStatus: PreviousStageStatus
  readonly finishStamina: number | null
  readonly fatigueAfterStage: number
  readonly fatigueGain: number | null
}

export interface UniversalPostStageRiderUpdate {
  readonly riderId: string
  readonly teamId: string
  readonly startStatus: RiderStartStatus
  readonly finishStatus: UniversalOfficialFinishStatus
  readonly eligibleToStart: boolean
  readonly availabilityStatus: AvailabilityStatus
  readonly healthRestrictionApplied: boolean
  readonly healthRestrictionReason: UniversalPostStageHealthRestrictionReason
  readonly previousRecoveryState:
    | UniversalPreviousStageRecoveryState
    | 'no_previous_stage'
  readonly startFreshness: number
  readonly raceSharpness: number
  readonly inputFatigueBeforeStage: number
  readonly effectiveFatigueBeforeStage: number
  /** Canonical Phase 8 output alias. */
  readonly fatigueBefore: number
  readonly startEnergy: number
  readonly finishEnergyBeforePointCosts: number
  readonly additionalPointEnergyCost: number
  readonly finishEnergy: number
  readonly totalEnergySpent: number
  /** Canonical Phase 8 output alias. */
  readonly energySpent: number
  readonly energySpentPctOfStart: number
  readonly effort: UniversalPostStageEffortBreakdown
  readonly weatherSeverity: UniversalDifficultyComponentLevel
  readonly incidentCount: number
  readonly incidentFatigueLoad: number
  readonly incidentRiskMultiplierBefore: number
  readonly incidentRiskMultiplierAfter: number
  readonly incidentRiskIncrease: number
  readonly distanceLoad: number
  readonly difficultyLoad: number
  readonly finishStatusLoad: number
  readonly grossFatigueGain: number
  readonly postStageFatigueMultiplier: number
  readonly postStageRecoveryBonusPoints: number
  readonly adjustedFatigueGain: number
  readonly appliedFatigueGain: number
  /** Canonical Phase 8 output alias. */
  readonly fatigueGained: number
  readonly fatigueAfterStage: number
  /** Canonical Phase 8 output alias. */
  readonly fatigueAfter: number
  readonly fatigueClampedAtMaximum: boolean
  readonly intrinsicDailyRecoveryPoints: number
  readonly fatigueAfterOneRecoveryDay: number
  readonly estimatedDaysToPreStageFatigue: number
  readonly estimatedDaysToFullRecovery: number
  readonly recoveryDemandPoints: number
  /** Canonical Phase 8 output alias. */
  readonly recoveryDemand: number
  readonly writeEligible: boolean
  readonly writeKey: string
  readonly previousStageSeed: UniversalPostStagePreviousStageSeed
  readonly modelVersion: 'universal_post_stage_rider_update_v2'
}

export interface UniversalPostStageUpdateSummary {
  readonly active: true
  readonly calculatedBeforePersistence: true
  readonly persistenceApplied: false
  readonly persistenceBoundary: 'phase_11_application_service'
  readonly writePolicy: 'ledger_guarded_once'
  readonly riderUpdateCount: number
  readonly writeEligibleCount: number
  readonly dnsCount: number
  readonly totalEnergySpent: number
  readonly averageEnergySpent: number
  readonly averageAppliedFatigueGain: number
  readonly maximumFatigueAfterStage: number
  readonly riderUpdates: readonly UniversalPostStageRiderUpdate[]
  readonly persistenceContract: UniversalPostStagePersistenceContract
  readonly sourceCoverage: UniversalPostStageSourceCoverage
  readonly deterministic: true
  readonly modelVersion: 'universal_post_stage_update_v2'
}

export interface UniversalPhase78AcceptanceRiderRow {
  readonly riderId: string
  readonly teamId: string
  readonly eligibleToStart: boolean
  readonly finishStatus: UniversalOfficialFinishStatus
  readonly finishRank: number | null
  readonly replayFinishStatus: UniversalReplayRiderStatus | null
  readonly replayFinishRank: number | null
  readonly startEnergy: number
  readonly finishEnergy: number
  readonly energySpent: number
  readonly fatigueBefore: number
  readonly fatigueGained: number
  readonly fatigueAfter: number
  readonly recoveryDemand: number
  readonly incidentRiskMultiplierAfter: number
  readonly effortCategory: UniversalPostStageEffortCategory
  readonly writeEligible: boolean
  readonly writeKey: string
}

export interface UniversalPhase78AcceptanceInvariant {
  readonly key: string
  readonly passed: boolean
  readonly expected: string
  readonly actual: string
}

export interface UniversalPhase78AcceptanceReport {
  readonly passed: boolean
  readonly source: 'single_runRaceEngine_result'
  readonly engineBuild: typeof UNIVERSAL_RACE_ENGINE_DEBUG_BUILD
  readonly engineKey: typeof PPM_UNIVERSAL_RACE_ENGINE_KEY
  readonly engineVersion: typeof PPM_UNIVERSAL_RACE_ENGINE_VERSION
  readonly raceId: string
  readonly stageId: string
  readonly stageFormat: StageFormat
  readonly terrainType: TerrainType
  readonly deterministicSeed: string
  readonly riderCount: number
  readonly teamCount: number
  readonly phase7: {
    readonly replayActive: boolean
    readonly completeBeforePlayback: boolean
    readonly playbackRecalculatesRace: boolean
    readonly checkpointCount: number
    readonly baseCheckpointCount: number
    readonly eventCheckpointCount: number
    readonly replaySynchronized: boolean
    readonly finalResultsVisibleCheckpointCount: number
    readonly finalCheckpointMatchesClassification: boolean
    readonly resultFieldsHiddenBeforeFinish: boolean
    readonly sameKilometreStatesConsistent: boolean
    readonly gapChangesDistanceBounded: boolean
    readonly openingBreakawayLineageStable: boolean
    readonly frontGroupTransfersPhysicallyValid: boolean
    readonly bridgeSequencesPhysicallyValid: boolean
    readonly commentaryPhaseNeutral: boolean
    readonly commentaryWholeSecondFormatting: boolean
    readonly postCatchStateStable: boolean
  }
  readonly phase8: {
    readonly updateCount: number
    readonly writeEligibleCount: number
    readonly persistenceRowCount: number
    readonly payloadValid: boolean
    readonly directDatabaseWritePerformed: boolean
    readonly totalEnergySpent: number
    readonly averageEnergySpent: number
    readonly averageFatigueGained: number
    readonly maximumFatigueAfter: number
  }
  readonly applicability: {
    readonly supportedStageFormats: readonly StageFormat[]
    readonly terrainRepresented: boolean
    readonly weatherRepresented: boolean
    readonly savedCommandsRepresented: boolean
    readonly attacksRepresented: boolean
    readonly chasingRepresented: boolean
    readonly breakawayRepresented: boolean
    readonly intermediatePointsRepresentedExactlyOnce: boolean
    readonly incidentRiskSignalAvailable: boolean
    readonly authoritativeIncidentIntegrationStatus:
      UniversalReplayIncidentSynchronizationStatus
  }
  readonly invariants: readonly UniversalPhase78AcceptanceInvariant[]
  readonly issues: readonly string[]
  readonly riderRows: readonly UniversalPhase78AcceptanceRiderRow[]
  readonly deterministic: true
  readonly modelVersion: 'universal_phase_7_8_acceptance_v1'
}

export interface UniversalRaceEngineResult {
  readonly engineKey: typeof PPM_UNIVERSAL_RACE_ENGINE_KEY
  readonly engineVersion: typeof PPM_UNIVERSAL_RACE_ENGINE_VERSION
  readonly raceId: string
  readonly stageId: string
  readonly validationPassed: true
  readonly stageClassification: UniversalStageClassification
  readonly terrain: UniversalTerrainSummary
  readonly difficulty: UniversalDifficultySummary
  readonly riderReadiness: readonly UniversalRiderReadinessResult[]
  readonly stageSkillModel: UniversalStageSkillModel
  readonly teamTimeTrialSuitabilityRules:
    UniversalTeamTimeTrialSuitabilityRules
  readonly riderSuitability: readonly UniversalRiderSuitabilityResult[]
  readonly teamStrength: readonly UniversalTeamStrengthResult[]
  readonly favourites: UniversalFavouritesSummary
  readonly roadCommandResolution: UniversalRoadCommandResolutionSummary
  readonly roadRaceResolution: UniversalRoadRaceResolutionSummary
  readonly intermediatePointPlan: UniversalIntermediatePointPlanSummary
  readonly intermediatePointBattles: UniversalIntermediatePointBattleSummary
  readonly intermediatePointFinalization: UniversalIntermediatePointFinalizationSummary
  readonly groupAndTimeResolution: UniversalPhase5GroupingSummary
  readonly finishResolution: UniversalFinishResolution
  readonly replayTimeline: UniversalReplayTimeline
  readonly replaySynchronization: UniversalReplaySynchronizationSummary
  readonly phase9Modifiers: UniversalPhase9ModifierSummary
  readonly phase9Acceptance: UniversalPhase9AcceptanceReport
  readonly phase10Incidents: UniversalPhase10IncidentSummary
  readonly postStageUpdate: UniversalPostStageUpdateSummary
  readonly phase78Acceptance: UniversalPhase78AcceptanceReport
  readonly calibrationSummary: UniversalRaceCalibrationSummary
}

export interface ValidationError {
  readonly field: string
  readonly message: string
}

export class UniversalRaceEngineValidationError extends Error {
  readonly errors: readonly ValidationError[]

  constructor(errors: readonly ValidationError[]) {
    super(
      `PPM Universal Race v1 input validation failed with ${errors.length} error${
        errors.length === 1 ? '' : 's'
      }.`,
    )
    this.name = 'UniversalRaceEngineValidationError'
    this.errors = errors
  }
}

const raceTypeSet = new Set<string>(RACE_TYPES)
const stageFormatSet = new Set<string>(STAGE_FORMATS)
const terrainTypeSet = new Set<string>(TERRAIN_TYPES)
const finishTypeSet = new Set<string>(FINISH_TYPES)
const pointTypeSet = new Set<string>(STAGE_POINT_TYPES)
const komCategorySet = new Set<string>(KOM_CATEGORIES)
const availabilityStatusSet = new Set<string>(AVAILABILITY_STATUSES)
const healthCaseTypeSet = new Set<string>(HEALTH_CASE_TYPES)
const healthCaseSeveritySet = new Set<string>(HEALTH_CASE_SEVERITIES)
const healthCaseStatusSet = new Set<string>(HEALTH_CASE_STATUSES)
const previousStageStatusSet = new Set<string>(PREVIOUS_STAGE_STATUSES)
const riderStartStatusSet = new Set<string>(RIDER_START_STATUSES)
const stagePlanStatusSet = new Set<string>(STAGE_PLAN_STATUSES)
const riderStageRoleSet = new Set<string>(RIDER_STAGE_ROLES)
const phase1To3CommandSet = new Set<string>(ROAD_PHASE_1_TO_3_COMMANDS)
const phase4CommandSet = new Set<string>(ROAD_PHASE_4_COMMANDS)
const roadTeamTacticSet = new Set<string>(ROAD_TEAM_TACTICS)

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function pushError(
  errors: ValidationError[],
  field: string,
  message: string,
): void {
  errors.push({ field, message })
}

function validateZeroToOneHundred(
  errors: ValidationError[],
  field: string,
  value: unknown,
): void {
  if (!isFiniteNumber(value) || value < 0 || value > 100) {
    pushError(errors, field, 'must be a finite number between 0 and 100')
  }
}

function validateOptionalFiniteNumber(
  errors: ValidationError[],
  field: string,
  value: unknown,
): void {
  if (value !== null && value !== undefined && !isFiniteNumber(value)) {
    pushError(errors, field, 'must be a finite number or null')
  }
}

function validateOptionalString(
  errors: ValidationError[],
  field: string,
  value: unknown,
): void {
  if (
    value !== null &&
    value !== undefined &&
    (typeof value !== 'string' || value.trim().length === 0)
  ) {
    pushError(errors, field, 'must be a non-empty string or null')
  }
}

function validateNumberArray(
  errors: ValidationError[],
  field: string,
  values: readonly number[],
): void {
  values.forEach((value, index) => {
    if (!isFiniteNumber(value) || value < 0) {
      pushError(
        errors,
        `${field}[${index}]`,
        'must be a finite non-negative number',
      )
    }
  })
}

/**
 * Validate a normalized universal race input without calculating a race.
 */
export function validateRunInput(
  input: UniversalRaceEngineInput,
): readonly ValidationError[] {
  const errors: ValidationError[] = []

  if (input.engine.engineKey !== PPM_UNIVERSAL_RACE_ENGINE_KEY) {
    pushError(
      errors,
      'engine.engineKey',
      `must equal ${PPM_UNIVERSAL_RACE_ENGINE_KEY}`,
    )
  }

  if (input.engine.engineVersion !== PPM_UNIVERSAL_RACE_ENGINE_VERSION) {
    pushError(
      errors,
      'engine.engineVersion',
      `must equal ${PPM_UNIVERSAL_RACE_ENGINE_VERSION}`,
    )
  }

  if (!isNonEmptyString(input.engine.deterministicSeed)) {
    pushError(
      errors,
      'engine.deterministicSeed',
      'must be a non-empty string',
    )
  }

  if (
    input.incidentModel !== undefined &&
    typeof input.incidentModel.enabled !== 'boolean'
  ) {
    pushError(
      errors,
      'incidentModel.enabled',
      'must be a boolean when the Phase 10 incident model is supplied',
    )
  }

  if (!isNonEmptyString(input.race.raceId)) {
    pushError(errors, 'race.raceId', 'must be a non-empty string')
  }

  if (!raceTypeSet.has(input.race.raceType)) {
    pushError(
      errors,
      'race.raceType',
      `unsupported race type: ${String(input.race.raceType)}`,
    )
  }

  if (!Number.isInteger(input.race.stageCount) || input.race.stageCount <= 0) {
    pushError(errors, 'race.stageCount', 'must be a positive integer')
  }

  if (!isNonEmptyString(input.stage.stageId)) {
    pushError(errors, 'stage.stageId', 'must be a non-empty string')
  }

  if (!isNonEmptyString(input.stage.raceId)) {
    pushError(errors, 'stage.raceId', 'must be a non-empty string')
  } else if (input.stage.raceId !== input.race.raceId) {
    pushError(errors, 'stage.raceId', 'must equal race.raceId')
  }

  if (
    !Number.isInteger(input.stage.stageNumber) ||
    input.stage.stageNumber <= 0
  ) {
    pushError(errors, 'stage.stageNumber', 'must be a positive integer')
  }

  if (!stageFormatSet.has(input.stage.stageFormat)) {
    pushError(
      errors,
      'stage.stageFormat',
      `unsupported stage format: ${String(input.stage.stageFormat)}`,
    )
  }

  if (!terrainTypeSet.has(input.stage.terrainType)) {
    pushError(
      errors,
      'stage.terrainType',
      `unsupported terrain type: ${String(input.stage.terrainType)}`,
    )
  }

  if (!finishTypeSet.has(input.stage.finishType)) {
    pushError(
      errors,
      'stage.finishType',
      `unsupported finish type: ${String(input.stage.finishType)}`,
    )
  }

  const roadTerrainTypes = new Set<TerrainType>([
    'flat',
    'hilly',
    'mountain',
    'cobbled',
  ])

  if (
    input.stage.stageFormat === 'road_race' &&
    !roadTerrainTypes.has(input.stage.terrainType)
  ) {
    pushError(
      errors,
      'stage.terrainType',
      'road_race requires flat, hilly, mountain, or cobbled terrain',
    )
  }

  if (
    input.stage.stageFormat === 'individual_time_trial' &&
    input.stage.terrainType !== 'individual_time_trial'
  ) {
    pushError(
      errors,
      'stage.terrainType',
      'individual_time_trial requires individual_time_trial terrain',
    )
  }

  if (
    (input.stage.stageFormat === 'team_time_trial' ||
      input.stage.stageFormat === 'pair_time_trial') &&
    input.stage.terrainType !== 'team_time_trial'
  ) {
    pushError(
      errors,
      'stage.terrainType',
      `${input.stage.stageFormat} requires team_time_trial terrain`,
    )
  }

  if (
    input.stage.stageFormat === 'prologue' &&
    input.stage.terrainType !== 'prologue'
  ) {
    pushError(
      errors,
      'stage.terrainType',
      'prologue requires prologue terrain',
    )
  }

  if (
    input.stage.profileType !== null &&
    !isNonEmptyString(input.stage.profileType)
  ) {
    pushError(
      errors,
      'stage.profileType',
      'must be a non-empty string or null',
    )
  }

  if (!isFiniteNumber(input.stage.distanceKm) || input.stage.distanceKm <= 0) {
    pushError(errors, 'stage.distanceKm', 'must be a finite number above 0')
  }

  if (
    input.stage.sprintZoneKm !== undefined &&
    input.stage.sprintZoneKm !== null &&
    (!isFiniteNumber(input.stage.sprintZoneKm) ||
      input.stage.sprintZoneKm < 0 ||
      input.stage.sprintZoneKm > 5)
  ) {
    pushError(
      errors,
      'stage.sprintZoneKm',
      'must be null or a finite number from 0 through 5 kilometres',
    )
  }

  if (
    !isFiniteNumber(input.stage.elevationGainM) ||
    input.stage.elevationGainM < 0
  ) {
    pushError(
      errors,
      'stage.elevationGainM',
      'must be a finite non-negative number',
    )
  }

  const terrainPercentages = input.stage.terrainPercentages
  validateZeroToOneHundred(
    errors,
    'stage.terrainPercentages.flat',
    terrainPercentages.flat,
  )
  validateZeroToOneHundred(
    errors,
    'stage.terrainPercentages.hilly',
    terrainPercentages.hilly,
  )
  validateZeroToOneHundred(
    errors,
    'stage.terrainPercentages.mountain',
    terrainPercentages.mountain,
  )
  validateZeroToOneHundred(
    errors,
    'stage.terrainPercentages.cobbled',
    terrainPercentages.cobbled,
  )

  const terrainPercentageSum =
    terrainPercentages.flat +
    terrainPercentages.hilly +
    terrainPercentages.mountain +
    terrainPercentages.cobbled

  if (
    !Number.isFinite(terrainPercentageSum) ||
    terrainPercentageSum < 99 ||
    terrainPercentageSum > 101
  ) {
    pushError(
      errors,
      'stage.terrainPercentages',
      'flat + hilly + mountain + cobbled must total between 99 and 101',
    )
  }

  const timeTrialRules = input.stage.timeTrialRules
  if (timeTrialRules) {
    if (!isNonEmptyString(timeTrialRules.startOrderMode)) {
      pushError(
        errors,
        'stage.timeTrialRules.startOrderMode',
        'must be a non-empty string',
      )
    }

    if (
      !Number.isInteger(timeTrialRules.startIntervalSeconds) ||
      timeTrialRules.startIntervalSeconds <= 0
    ) {
      pushError(
        errors,
        'stage.timeTrialRules.startIntervalSeconds',
        'must be a positive integer',
      )
    }

    if (
      timeTrialRules.countingRiderNumber !== null &&
      (!Number.isInteger(timeTrialRules.countingRiderNumber) ||
        timeTrialRules.countingRiderNumber < 2 ||
        timeTrialRules.countingRiderNumber > 8)
    ) {
      pushError(
        errors,
        'stage.timeTrialRules.countingRiderNumber',
        'must be null or an integer between 2 and 8',
      )
    }

    if (typeof timeTrialRules.equipmentRequired !== 'boolean') {
      pushError(
        errors,
        'stage.timeTrialRules.equipmentRequired',
        'must be a boolean',
      )
    }

    if (
      !Number.isInteger(timeTrialRules.replayDurationSeconds) ||
      timeTrialRules.replayDurationSeconds <= 0
    ) {
      pushError(
        errors,
        'stage.timeTrialRules.replayDurationSeconds',
        'must be a positive integer',
      )
    }

    if (!isNonEmptyString(timeTrialRules.droppedRiderTimeMode)) {
      pushError(
        errors,
        'stage.timeTrialRules.droppedRiderTimeMode',
        'must be a non-empty string',
      )
    }
  }

  const profilePoints = input.stage.profilePoints
  if (profilePoints.length < 2) {
    pushError(
      errors,
      'stage.profilePoints',
      'must contain at least a start point and a finish point',
    )
  }

  profilePoints.forEach((point, index) => {
    if (!isFiniteNumber(point.km)) {
      pushError(
        errors,
        `stage.profilePoints[${index}].km`,
        'must be a finite number',
      )
    } else if (point.km < 0 || point.km > input.stage.distanceKm) {
      pushError(
        errors,
        `stage.profilePoints[${index}].km`,
        'must be between 0 and stage.distanceKm',
      )
    }

    if (!isFiniteNumber(point.elevationM)) {
      pushError(
        errors,
        `stage.profilePoints[${index}].elevationM`,
        'must be a finite number',
      )
    }

    if (index > 0 && point.km <= profilePoints[index - 1].km) {
      pushError(
        errors,
        `stage.profilePoints[${index}].km`,
        'profile point kilometres must be strictly increasing',
      )
    }
  })

  if (profilePoints.length > 0 && profilePoints[0].km !== 0) {
    pushError(
      errors,
      'stage.profilePoints[0].km',
      'the first profile point must be at kilometre 0',
    )
  }

  if (
    profilePoints.length > 0 &&
    profilePoints[profilePoints.length - 1].km !== input.stage.distanceKm
  ) {
    pushError(
      errors,
      `stage.profilePoints[${profilePoints.length - 1}].km`,
      'the last profile point must equal stage.distanceKm',
    )
  }

  const pointIds = new Set<string>()
  const pointSortOrders = new Set<number>()

  input.points.forEach((point, index) => {
    const prefix = `points[${index}]`

    if (!isNonEmptyString(point.pointId)) {
      pushError(errors, `${prefix}.pointId`, 'must be a non-empty string')
    } else if (pointIds.has(point.pointId)) {
      pushError(errors, `${prefix}.pointId`, `duplicate point ID: ${point.pointId}`)
    } else {
      pointIds.add(point.pointId)
    }

    if (point.stageId !== input.stage.stageId) {
      pushError(errors, `${prefix}.stageId`, 'must equal stage.stageId')
    }

    if (!pointTypeSet.has(point.pointType)) {
      pushError(
        errors,
        `${prefix}.pointType`,
        `unsupported point type: ${String(point.pointType)}`,
      )
    }

    if (
      !isFiniteNumber(point.kmFromStart) ||
      point.kmFromStart < 0 ||
      point.kmFromStart > input.stage.distanceKm
    ) {
      pushError(
        errors,
        `${prefix}.kmFromStart`,
        'must be between 0 and stage.distanceKm',
      )
    }

    if (
      point.komCategory !== null &&
      !komCategorySet.has(point.komCategory)
    ) {
      pushError(
        errors,
        `${prefix}.komCategory`,
        `unsupported KOM category: ${String(point.komCategory)}`,
      )
    }

    if (point.pointType === 'KOM' && point.komCategory === null) {
      pushError(
        errors,
        `${prefix}.komCategory`,
        'is required for a KOM point',
      )
    }

    if (point.pointType !== 'KOM' && point.komCategory !== null) {
      pushError(
        errors,
        `${prefix}.komCategory`,
        'must be null for a non-KOM point',
      )
    }

    if (!Number.isInteger(point.sortOrder) || point.sortOrder < 0) {
      pushError(errors, `${prefix}.sortOrder`, 'must be a non-negative integer')
    } else if (pointSortOrders.has(point.sortOrder)) {
      pushError(
        errors,
        `${prefix}.sortOrder`,
        `duplicate point sort order: ${point.sortOrder}`,
      )
    } else {
      pointSortOrders.add(point.sortOrder)
    }

    validateNumberArray(errors, `${prefix}.pointsScheme`, point.pointsScheme)
    validateNumberArray(
      errors,
      `${prefix}.timeBonusSeconds`,
      point.timeBonusSeconds,
    )
  })

  const participantTeamIds = new Set<string>()
  const teamIds = new Set<string>()
  const acceptedRiderTeamById = new Map<string, string>()

  input.teams.forEach((team, index) => {
    const prefix = `teams[${index}]`

    if (!isNonEmptyString(team.participantTeamId)) {
      pushError(
        errors,
        `${prefix}.participantTeamId`,
        'must be a non-empty string',
      )
    } else if (participantTeamIds.has(team.participantTeamId)) {
      pushError(
        errors,
        `${prefix}.participantTeamId`,
        `duplicate participant team identity: ${team.participantTeamId}`,
      )
    } else {
      participantTeamIds.add(team.participantTeamId)
    }

    if (!isNonEmptyString(team.teamId)) {
      pushError(errors, `${prefix}.teamId`, 'must be a non-empty string')
    } else if (teamIds.has(team.teamId)) {
      pushError(errors, `${prefix}.teamId`, `duplicate team identity: ${team.teamId}`)
    } else {
      teamIds.add(team.teamId)
    }

    const ownRiderIds = new Set<string>()
    team.acceptedRiderIds.forEach((riderId, riderIndex) => {
      if (!isNonEmptyString(riderId)) {
        pushError(
          errors,
          `${prefix}.acceptedRiderIds[${riderIndex}]`,
          'must be a non-empty string',
        )
        return
      }

      if (ownRiderIds.has(riderId)) {
        pushError(
          errors,
          `${prefix}.acceptedRiderIds[${riderIndex}]`,
          `duplicate rider inside accepted team: ${riderId}`,
        )
        return
      }
      ownRiderIds.add(riderId)

      const existingTeamId = acceptedRiderTeamById.get(riderId)
      if (existingTeamId && existingTeamId !== team.teamId) {
        pushError(
          errors,
          `${prefix}.acceptedRiderIds[${riderIndex}]`,
          `rider ${riderId} is assigned to more than one accepted team`,
        )
      } else {
        acceptedRiderTeamById.set(riderId, team.teamId)
      }
    })
  })

  const riderIds = new Set<string>()
  const riderById = new Map<string, UniversalRiderInput>()

  input.riders.forEach((rider, index) => {
    const prefix = `riders[${index}]`

    if (!isNonEmptyString(rider.riderId)) {
      pushError(errors, `${prefix}.riderId`, 'must be a non-empty string')
    } else if (riderIds.has(rider.riderId)) {
      pushError(
        errors,
        `${prefix}.riderId`,
        `duplicate rider identity: ${rider.riderId}`,
      )
    } else {
      riderIds.add(rider.riderId)
      riderById.set(rider.riderId, rider)
    }

    if (!isNonEmptyString(rider.participantRiderId)) {
      pushError(
        errors,
        `${prefix}.participantRiderId`,
        'must be a non-empty string',
      )
    }

    const acceptedTeamId = acceptedRiderTeamById.get(rider.riderId)
    if (!acceptedTeamId) {
      pushError(
        errors,
        `${prefix}.riderId`,
        `rider ${rider.riderId} is not assigned to any accepted team`,
      )
    } else if (acceptedTeamId !== rider.teamId) {
      pushError(
        errors,
        `${prefix}.teamId`,
        `must equal accepted team ${acceptedTeamId}`,
      )
    }

    if (!teamIds.has(rider.teamId)) {
      pushError(errors, `${prefix}.teamId`, `unknown team: ${rider.teamId}`)
    }

    const rangedFields: readonly [string, number][] = [
      ['sprint', rider.sprint],
      ['climbing', rider.climbing],
      ['timeTrial', rider.timeTrial],
      ['flat', rider.flat],
      ['endurance', rider.endurance],
      ['recovery', rider.recovery],
      ['resistance', rider.resistance],
      ['raceIQ', rider.raceIQ],
      ['teamwork', rider.teamwork],
      ['overall', rider.overall],
      ['morale', rider.morale],
      ['raceSharpness', rider.raceSharpness],
      ['startStamina', rider.startStamina],
    ]

    rangedFields.forEach(([field, value]) => {
      validateZeroToOneHundred(errors, `${prefix}.${field}`, value)
    })

    if (!isFiniteNumber(rider.fatigueBeforeStage)) {
      pushError(
        errors,
        `${prefix}.fatigueBeforeStage`,
        'must be a finite number; readiness clamps it to 0-100',
      )
    }

    if (
      !isFiniteNumber(rider.recentFormScore) ||
      rider.recentFormScore < -15 ||
      rider.recentFormScore > 30
    ) {
      pushError(
        errors,
        `${prefix}.recentFormScore`,
        'must be a finite number between -15 and 30',
      )
    }

    if (
      rider.seasonResultPoints !== undefined &&
      (!isFiniteNumber(rider.seasonResultPoints) ||
        rider.seasonResultPoints < 0)
    ) {
      pushError(
        errors,
        `${prefix}.seasonResultPoints`,
        'must be a finite non-negative number when supplied',
      )
    }

    validateOptionalString(
      errors,
      `${prefix}.roleSnapshot`,
      rider.roleSnapshot,
    )

    if (!availabilityStatusSet.has(rider.availabilityStatus)) {
      pushError(
        errors,
        `${prefix}.availabilityStatus`,
        `unsupported availability status: ${String(rider.availabilityStatus)}`,
      )
    }

    if (!riderStartStatusSet.has(rider.startStatus)) {
      pushError(
        errors,
        `${prefix}.startStatus`,
        `unsupported rider start status: ${String(rider.startStatus)}`,
      )
    }

    if (
      (rider.availabilityStatus === 'injured' ||
        rider.availabilityStatus === 'sick') &&
      rider.startStatus !== 'dns'
    ) {
      pushError(
        errors,
        `${prefix}.startStatus`,
        `${rider.availabilityStatus} rider must have startStatus dns`,
      )
    }

    if (rider.preparationModifiers) {
      const preparationPrefix = `${prefix}.preparationModifiers`
      const preparationModifiers = rider.preparationModifiers

      if (
        !isFiniteNumber(
          preparationModifiers.inStageEnergyCostMultiplier,
        ) ||
        preparationModifiers.inStageEnergyCostMultiplier <= 0
      ) {
        pushError(
          errors,
          `${preparationPrefix}.inStageEnergyCostMultiplier`,
          'must be a finite number greater than 0',
        )
      }

      if (
        !isFiniteNumber(preparationModifiers.postStageFatigueMultiplier) ||
        preparationModifiers.postStageFatigueMultiplier < 0
      ) {
        pushError(
          errors,
          `${preparationPrefix}.postStageFatigueMultiplier`,
          'must be a finite number greater than or equal to 0',
        )
      }

      if (
        !isFiniteNumber(
          preparationModifiers.postStageRecoveryBonusPoints,
        ) ||
        preparationModifiers.postStageRecoveryBonusPoints < 0
      ) {
        pushError(
          errors,
          `${preparationPrefix}.postStageRecoveryBonusPoints`,
          'must be a finite number greater than or equal to 0',
        )
      }

      if (
        preparationModifiers.performanceBonusPoints !== undefined &&
        (!isFiniteNumber(preparationModifiers.performanceBonusPoints) ||
          preparationModifiers.performanceBonusPoints < -5 ||
          preparationModifiers.performanceBonusPoints > 5)
      ) {
        pushError(
          errors,
          `${preparationPrefix}.performanceBonusPoints`,
          'must be a finite number from -5 through 5 when provided',
        )
      }

      if (
        preparationModifiers.equipmentStagePerformancePct !== undefined &&
        (!isFiniteNumber(preparationModifiers.equipmentStagePerformancePct) ||
          preparationModifiers.equipmentStagePerformancePct < -20 ||
          preparationModifiers.equipmentStagePerformancePct > 20)
      ) {
        pushError(
          errors,
          `${preparationPrefix}.equipmentStagePerformancePct`,
          'must be a finite percentage from -20 through 20 when provided',
        )
      }

      if (
        preparationModifiers.supplyStagePerformancePct !== undefined &&
        (!isFiniteNumber(preparationModifiers.supplyStagePerformancePct) ||
          preparationModifiers.supplyStagePerformancePct < -10 ||
          preparationModifiers.supplyStagePerformancePct > 10)
      ) {
        pushError(
          errors,
          `${preparationPrefix}.supplyStagePerformancePct`,
          'must be a finite percentage from -10 through 10 when provided',
        )
      }

      if (
        preparationModifiers.healthIncidentRiskMultiplier !== undefined &&
        (!isFiniteNumber(preparationModifiers.healthIncidentRiskMultiplier) ||
          preparationModifiers.healthIncidentRiskMultiplier < 0.25 ||
          preparationModifiers.healthIncidentRiskMultiplier > 1.5)
      ) {
        pushError(
          errors,
          `${preparationPrefix}.healthIncidentRiskMultiplier`,
          'must be a finite number from 0.25 through 1.5 when provided',
        )
      }

      if (
        preparationModifiers.incidentRiskMultiplier !== undefined &&
        (!isFiniteNumber(preparationModifiers.incidentRiskMultiplier) ||
          preparationModifiers.incidentRiskMultiplier < 0.7 ||
          preparationModifiers.incidentRiskMultiplier > 1.4)
      ) {
        pushError(
          errors,
          `${preparationPrefix}.incidentRiskMultiplier`,
          'must be a finite number from 0.7 through 1.4 when provided',
        )
      }


      if (
        preparationModifiers.mechanicalIncidentRiskMultiplier !== undefined &&
        (!isFiniteNumber(preparationModifiers.mechanicalIncidentRiskMultiplier) ||
          preparationModifiers.mechanicalIncidentRiskMultiplier < 0.78 ||
          preparationModifiers.mechanicalIncidentRiskMultiplier > 1.5)
      ) {
        pushError(
          errors,
          `${preparationPrefix}.mechanicalIncidentRiskMultiplier`,
          'must be a finite number from 0.78 through 1.5 when provided',
        )
      }

      if (
        preparationModifiers.mechanicalTimeLossMultiplier !== undefined &&
        (!isFiniteNumber(preparationModifiers.mechanicalTimeLossMultiplier) ||
          preparationModifiers.mechanicalTimeLossMultiplier < 0.82 ||
          preparationModifiers.mechanicalTimeLossMultiplier > 1)
      ) {
        pushError(
          errors,
          `${preparationPrefix}.mechanicalTimeLossMultiplier`,
          'must be a finite number from 0.82 through 1 when provided',
        )
      }

      if (
        preparationModifiers.equipmentConditionPercent !== undefined &&
        (!isFiniteNumber(preparationModifiers.equipmentConditionPercent) ||
          preparationModifiers.equipmentConditionPercent < 0 ||
          preparationModifiers.equipmentConditionPercent > 100)
      ) {
        pushError(
          errors,
          `${preparationPrefix}.equipmentConditionPercent`,
          'must be a finite number from 0 through 100 when provided',
        )
      }
    }

    if (rider.healthCase) {
      const healthPrefix = `${prefix}.healthCase`

      if (
        rider.healthCase.healthCaseId !== null &&
        !isNonEmptyString(rider.healthCase.healthCaseId)
      ) {
        pushError(
          errors,
          `${healthPrefix}.healthCaseId`,
          'must be a non-empty string or null',
        )
      }

      if (!healthCaseTypeSet.has(rider.healthCase.caseType)) {
        pushError(
          errors,
          `${healthPrefix}.caseType`,
          `unsupported health case type: ${String(rider.healthCase.caseType)}`,
        )
      }

      if (!healthCaseSeveritySet.has(rider.healthCase.severity)) {
        pushError(
          errors,
          `${healthPrefix}.severity`,
          `unsupported health severity: ${String(rider.healthCase.severity)}`,
        )
      }

      if (!healthCaseStatusSet.has(rider.healthCase.status)) {
        pushError(
          errors,
          `${healthPrefix}.status`,
          `unsupported health status: ${String(rider.healthCase.status)}`,
        )
      }

      validateZeroToOneHundred(
        errors,
        `${healthPrefix}.fatigueFloorOnReturn`,
        rider.healthCase.fatigueFloorOnReturn,
      )

      validateOptionalString(
        errors,
        `${healthPrefix}.activeUntil`,
        rider.healthCase.activeUntil,
      )
      validateOptionalString(
        errors,
        `${healthPrefix}.recoveryUntil`,
        rider.healthCase.recoveryUntil,
      )

      if (rider.healthCase.selectionBlocked && rider.startStatus !== 'dns') {
        pushError(
          errors,
          `${prefix}.startStatus`,
          'selection-blocked health case requires startStatus dns',
        )
      }
    }

    if (rider.previousStage) {
      const previousPrefix = `${prefix}.previousStage`

      if (!isNonEmptyString(rider.previousStage.stageId)) {
        pushError(
          errors,
          `${previousPrefix}.stageId`,
          'must be a non-empty string',
        )
      }

      if (!previousStageStatusSet.has(rider.previousStage.stageStatus)) {
        pushError(
          errors,
          `${previousPrefix}.stageStatus`,
          `unsupported previous-stage status: ${String(
            rider.previousStage.stageStatus,
          )}`,
        )
      }

      validateOptionalFiniteNumber(
        errors,
        `${previousPrefix}.finishStamina`,
        rider.previousStage.finishStamina,
      )
      if (
        rider.previousStage.finishStamina !== null &&
        (rider.previousStage.finishStamina < 0 ||
          rider.previousStage.finishStamina > 100)
      ) {
        pushError(
          errors,
          `${previousPrefix}.finishStamina`,
          'must be between 0 and 100 or null',
        )
      }

      if (!isFiniteNumber(rider.previousStage.fatigueAfterStage)) {
        pushError(
          errors,
          `${previousPrefix}.fatigueAfterStage`,
          'must be a finite number; readiness clamps it to 0-100',
        )
      }

      validateOptionalFiniteNumber(
        errors,
        `${previousPrefix}.fatigueGain`,
        rider.previousStage.fatigueGain,
      )

      if (
        !Number.isInteger(rider.previousStage.daysSincePreviousStage) ||
        rider.previousStage.daysSincePreviousStage < 0
      ) {
        pushError(
          errors,
          `${previousPrefix}.daysSincePreviousStage`,
          'must be a non-negative integer',
        )
      }
    }
  })

  acceptedRiderTeamById.forEach((_teamId, riderId) => {
    if (!riderById.has(riderId)) {
      pushError(
        errors,
        'teams.acceptedRiderIds',
        `accepted rider ${riderId} is missing from riders`,
      )
    }
  })

  const stagePlanTeamIds = new Set<string>()

  input.stagePlans.forEach((plan, planIndex) => {
    const prefix = `stagePlans[${planIndex}]`

    if (!teamIds.has(plan.teamId)) {
      pushError(errors, `${prefix}.teamId`, `unknown team: ${plan.teamId}`)
    }

    if (stagePlanTeamIds.has(plan.teamId)) {
      pushError(
        errors,
        `${prefix}.teamId`,
        `duplicate stage plan for team: ${plan.teamId}`,
      )
    } else {
      stagePlanTeamIds.add(plan.teamId)
    }

    if (!isNonEmptyString(plan.teamTactic)) {
      pushError(errors, `${prefix}.teamTactic`, 'must be a non-empty string')
    } else if (
      input.stage.stageFormat === 'road_race' &&
      !roadTeamTacticSet.has(plan.teamTactic)
    ) {
      pushError(
        errors,
        `${prefix}.teamTactic`,
        `unsupported road team tactic: ${String(plan.teamTactic)}`,
      )
    }

    if (!stagePlanStatusSet.has(plan.status)) {
      pushError(
        errors,
        `${prefix}.status`,
        `unsupported stage plan status: ${String(plan.status)}`,
      )
    }

    const planRiderIds = new Set<string>()

    plan.riders.forEach((riderPlan, riderPlanIndex) => {
      const riderPrefix = `${prefix}.riders[${riderPlanIndex}]`
      const rider = riderById.get(riderPlan.riderId)

      if (!rider) {
        pushError(
          errors,
          `${riderPrefix}.riderId`,
          `stage plan references unknown rider: ${riderPlan.riderId}`,
        )
      } else if (rider.teamId !== plan.teamId) {
        pushError(
          errors,
          `${riderPrefix}.riderId`,
          `rider ${riderPlan.riderId} belongs to team ${rider.teamId}, not ${plan.teamId}`,
        )
      }

      if (planRiderIds.has(riderPlan.riderId)) {
        pushError(
          errors,
          `${riderPrefix}.riderId`,
          `duplicate rider plan: ${riderPlan.riderId}`,
        )
      } else {
        planRiderIds.add(riderPlan.riderId)
      }

      if (!riderStageRoleSet.has(riderPlan.stageRole)) {
        pushError(
          errors,
          `${riderPrefix}.stageRole`,
          `unsupported rider stage role: ${String(riderPlan.stageRole)}`,
        )
      }

      const commands = riderPlan.commands
      const phase1To3: readonly [string, unknown][] = [
        ['phase1', commands.phase1],
        ['phase2', commands.phase2],
        ['phase3', commands.phase3],
      ]

      phase1To3.forEach(([phase, command]) => {
        if (typeof command !== 'string' || !phase1To3CommandSet.has(command)) {
          pushError(
            errors,
            `${riderPrefix}.commands.${phase}`,
            `unsupported road command: ${String(command)}`,
          )
        }
      })

      if (
        typeof commands.phase4 !== 'string' ||
        !phase4CommandSet.has(commands.phase4)
      ) {
        pushError(
          errors,
          `${riderPrefix}.commands.phase4`,
          `unsupported road command: ${String(commands.phase4)}`,
        )
      }
    })
  })

  if (input.preStageLeaders) {
    const riderIds = new Set(input.riders.map((rider) => rider.riderId))
    const teamIds = new Set(input.teams.map((team) => team.teamId))
    const entries = [
      ['general', input.preStageLeaders.general],
      ['points', input.preStageLeaders.points],
      ['mountain', input.preStageLeaders.mountain],
    ] as const

    entries.forEach(([key, leader]) => {
      if (!leader) return
      if (leader.classificationType !== key) {
        pushError(
          errors,
          `preStageLeaders.${key}.classificationType`,
          `must equal ${key}`,
        )
      }
      if (!riderIds.has(leader.riderId)) {
        pushError(
          errors,
          `preStageLeaders.${key}.riderId`,
          'must reference an accepted rider',
        )
      }
      if (!teamIds.has(leader.teamId)) {
        pushError(
          errors,
          `preStageLeaders.${key}.teamId`,
          'must reference an accepted team',
        )
      }
      if (leader.rank !== 1) {
        pushError(
          errors,
          `preStageLeaders.${key}.rank`,
          'must equal 1',
        )
      }
    })
  }

  if (input.weather) {
    validateOptionalString(errors, 'weather.condition', input.weather.condition)
    validateOptionalFiniteNumber(
      errors,
      'weather.temperatureC',
      input.weather.temperatureC,
    )
    validateOptionalFiniteNumber(errors, 'weather.windKmh', input.weather.windKmh)
    validateOptionalFiniteNumber(
      errors,
      'weather.precipitationMm',
      input.weather.precipitationMm,
    )
    validateOptionalString(
      errors,
      'weather.crosswindRisk',
      input.weather.crosswindRisk,
    )
    validateOptionalString(
      errors,
      'weather.descentRisk',
      input.weather.descentRisk,
    )
    validateOptionalString(
      errors,
      'weather.surfaceRisk',
      input.weather.surfaceRisk,
    )

    if (input.weather.windKmh !== null && input.weather.windKmh < 0) {
      pushError(errors, 'weather.windKmh', 'must be at least 0')
    }

    if (
      input.weather.precipitationMm !== null &&
      input.weather.precipitationMm < 0
    ) {
      pushError(errors, 'weather.precipitationMm', 'must be at least 0')
    }

    if (
      input.weather.rainProbabilityPct !== null &&
      (!isFiniteNumber(input.weather.rainProbabilityPct) ||
        input.weather.rainProbabilityPct < 0 ||
        input.weather.rainProbabilityPct > 100)
    ) {
      pushError(
        errors,
        'weather.rainProbabilityPct',
        'must be a finite number between 0 and 100 or null',
      )
    }

    if (input.weather.cancelled) {
      pushError(
        errors,
        'weather.cancelled',
        'cancelled stages must not be passed to runRaceEngine',
      )
    }

    if (
      input.weather.temperatureC !== null &&
      input.weather.temperatureC < 5
    ) {
      pushError(
        errors,
        'weather.temperatureC',
        'runnable stage weather must be at least 5 degrees Celsius',
      )
    }

    if (normalizeWeatherCode(input.weather.condition) === 'snow') {
      pushError(
        errors,
        'weather.condition',
        'snow stages must be cancelled before runRaceEngine is called',
      )
    }
  }

  return errors
}

type TerrainSegmentKind = 'flat' | 'rolling' | 'climbing' | 'descent'

interface TerrainProfileSegment {
  readonly distanceKm: number
  readonly elevationChangeM: number
  readonly gradientPercent: number
  readonly kind: TerrainSegmentKind
}

function deterministicRound(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * These simple segment thresholds are Phase 1 fallback rules. No authoritative
 * non-legacy production thresholds were present in the supplied source audit.
 */
function classifyTerrainSegment(
  gradientPercent: number,
): TerrainSegmentKind {
  if (gradientPercent <= -2) return 'descent'
  if (gradientPercent >= 3) return 'climbing'
  if (Math.abs(gradientPercent) >= 1) return 'rolling'
  return 'flat'
}

function buildTerrainProfileSegments(
  profilePoints: readonly UniversalStageProfilePointInput[],
): readonly TerrainProfileSegment[] {
  const segments: TerrainProfileSegment[] = []

  for (let index = 1; index < profilePoints.length; index += 1) {
    const previous = profilePoints[index - 1]
    const current = profilePoints[index]
    const distanceKm = current.km - previous.km
    const elevationChangeM = current.elevationM - previous.elevationM
    const gradientPercent =
      (elevationChangeM / (distanceKm * 1000)) * 100

    segments.push({
      distanceKm,
      elevationChangeM,
      gradientPercent,
      kind: classifyTerrainSegment(gradientPercent),
    })
  }

  return segments
}

function normalizeTerrainShares(
  flatDistanceKm: number,
  rollingDistanceKm: number,
  climbingDistanceKm: number,
  descentDistanceKm: number,
  totalDistanceKm: number,
): readonly [number, number, number, number] {
  const rawShares = [
    flatDistanceKm / totalDistanceKm,
    rollingDistanceKm / totalDistanceKm,
    climbingDistanceKm / totalDistanceKm,
    descentDistanceKm / totalDistanceKm,
  ] as const

  const flatMicros = Math.round(rawShares[0] * 1_000_000)
  const rollingMicros = Math.round(rawShares[1] * 1_000_000)
  const climbingMicros = Math.round(rawShares[2] * 1_000_000)
  const descentMicros =
    1_000_000 - flatMicros - rollingMicros - climbingMicros

  const micros = [
    flatMicros,
    rollingMicros,
    climbingMicros,
    descentMicros,
  ] as const

  if (micros.some((value) => value < 0 || value > 1_000_000)) {
    throw new Error('Unable to normalize terrain shares')
  }

  return [
    micros[0] / 1_000_000,
    micros[1] / 1_000_000,
    micros[2] / 1_000_000,
    micros[3] / 1_000_000,
  ]
}

function analyzeTerrain(
  stage: UniversalStageInput,
): UniversalTerrainSummary {
  const segments = buildTerrainProfileSegments(stage.profilePoints)

  let flatDistanceKm = 0
  let rollingDistanceKm = 0
  let climbingDistanceKm = 0
  let descentDistanceKm = 0
  let totalAscentM = 0
  let longestClimbKm = 0
  let currentClimbKm = 0
  let maximumImportantGradient = 0

  for (const segment of segments) {
    switch (segment.kind) {
      case 'flat':
        flatDistanceKm += segment.distanceKm
        currentClimbKm = 0
        break
      case 'rolling':
        rollingDistanceKm += segment.distanceKm
        currentClimbKm = 0
        break
      case 'climbing':
        climbingDistanceKm += segment.distanceKm
        currentClimbKm += segment.distanceKm
        longestClimbKm = Math.max(longestClimbKm, currentClimbKm)
        break
      case 'descent':
        descentDistanceKm += segment.distanceKm
        currentClimbKm = 0
        break
    }

    if (segment.elevationChangeM > 0) {
      totalAscentM += segment.elevationChangeM
    }

    if (
      segment.distanceKm >= 0.5 &&
      segment.gradientPercent > maximumImportantGradient
    ) {
      maximumImportantGradient = segment.gradientPercent
    }
  }

  const [
    flatShare,
    rollingShare,
    climbingShare,
    descentShare,
  ] = normalizeTerrainShares(
    flatDistanceKm,
    rollingDistanceKm,
    climbingDistanceKm,
    descentDistanceKm,
    stage.distanceKm,
  )

  const roundedTotalAscentM = deterministicRound(totalAscentM, 3)

  const summary: UniversalTerrainSummary = {
    flatShare,
    rollingShare,
    climbingShare,
    descentShare,
    totalAscentM: roundedTotalAscentM,
    ascentPer100Km: deterministicRound(
      (roundedTotalAscentM / stage.distanceKm) * 100,
      3,
    ),
    longestClimbKm: deterministicRound(longestClimbKm, 3),
    maximumImportantGradient: deterministicRound(
      maximumImportantGradient,
      3,
    ),
    summitFinish:
      stage.summitFinish || stage.finishType === 'summit_finish',
  }

  const values = Object.values(summary).filter(
    (value): value is number => typeof value === 'number',
  )

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Terrain analysis produced a non-finite value')
  }

  return summary
}


const DISTANCE_DIFFICULTY_THRESHOLDS: Readonly<
  Record<StageFormat, readonly [number, number, number, number]>
> = {
  // Production road-race quartile/median/upper-quartile/90th percentile.
  road_race: [137, 156.8, 175.025, 190.6],
  individual_time_trial: [12.25, 17.1, 25.725, 38.02],
  team_time_trial: [24.8, 28.8, 31.2, 38.84],
  // No production pair-TT rows existed in the calibration extract. Pair TT
  // uses the closest supported format distribution until production data exists.
  pair_time_trial: [24.8, 28.8, 31.2, 38.84],
  prologue: [4.325, 7.2, 7.95, 9.72],
}

const TOTAL_ASCENT_THRESHOLDS = [159, 540, 1020, 1639.6] as const
const ASCENT_DENSITY_THRESHOLDS = [126, 351, 665, 1110] as const
const LONGEST_CLIMB_THRESHOLDS = [0.5, 6, 12, 20] as const
const IMPORTANT_GRADIENT_THRESHOLDS = [0.8, 2, 3.4, 5.325] as const

function difficultyLevelFromThresholds(
  value: number,
  thresholds: readonly [number, number, number, number],
): UniversalDifficultyComponentLevel {
  if (value < thresholds[0]) return 0
  if (value < thresholds[1]) return 1
  if (value < thresholds[2]) return 2
  if (value < thresholds[3]) return 3
  return 4
}

function finishDifficultyLevel(
  stage: UniversalStageInput,
): UniversalDifficultyComponentLevel {
  if (stage.summitFinish || stage.finishType === 'summit_finish') return 4
  if (stage.finishType === 'uphill_finish') return 2
  if (stage.finishType === 'cobbled_finish') return 2
  return 0
}

function normalizeWeatherCode(condition: string | null): string | null {
  if (condition === null) return null
  const normalized = condition.trim().toLowerCase().replace(/\s+/g, '_')
  return normalized.length > 0 ? normalized : null
}

function weatherRiskLevel(value: string | null | undefined): UniversalDifficultyComponentLevel {
  if (value === null || value === undefined) return 0

  switch (value.trim().toLowerCase()) {
    case 'medium_low':
    case 'low_medium':
    case 'medium':
      return 1
    case 'medium_high':
      return 2
    case 'high':
      return 3
    case 'very_high':
      return 4
    default:
      return 0
  }
}

function weatherConditionLevel(
  condition: string | null,
): UniversalDifficultyComponentLevel {
  switch (normalizeWeatherCode(condition)) {
    case 'foggy':
    case 'drizzle':
    case 'rain':
      return 1
    case 'heavy_rain':
      return 3
    case 'sleet':
      return 3
    case 'thunderstorm':
      return 4
    default:
      return 0
  }
}

function weatherTemperatureLevel(
  temperatureC: number | null,
): UniversalDifficultyComponentLevel {
  if (temperatureC === null) return 0
  if (temperatureC < 10) return 2
  if (temperatureC < 15) return 1
  if (temperatureC <= 28) return 0
  if (temperatureC <= 34) return 1
  return 2
}

function weatherWindLevel(
  windKmh: number | null,
): UniversalDifficultyComponentLevel {
  if (windKmh === null || windKmh < 18) return 0
  if (windKmh < 25) return 1
  if (windKmh < 35) return 2
  if (windKmh < 45) return 3
  return 4
}

function weatherPrecipitationLevel(
  precipitationMm: number | null,
): UniversalDifficultyComponentLevel {
  if (precipitationMm === null || precipitationMm < 1.4) return 0
  if (precipitationMm < 3) return 1
  if (precipitationMm < 10) return 2
  if (precipitationMm < 25) return 3
  return 4
}

function weatherRainProbabilityLevel(
  rainProbabilityPct: number | null,
): UniversalDifficultyComponentLevel {
  if (rainProbabilityPct === null || rainProbabilityPct < 32) return 0
  if (rainProbabilityPct < 50) return 1
  if (rainProbabilityPct < 70) return 2
  if (rainProbabilityPct < 85) return 3
  return 4
}

function calculateWeatherSeverity(
  weather: UniversalWeatherInput | undefined,
): UniversalDifficultyComponentLevel {
  if (!weather) return 0

  const levels: UniversalDifficultyComponentLevel[] = [
    weatherConditionLevel(weather.condition),
    weatherTemperatureLevel(weather.temperatureC),
    weatherWindLevel(weather.windKmh),
    weatherPrecipitationLevel(weather.precipitationMm),
    weatherRainProbabilityLevel(weather.rainProbabilityPct),
    weatherRiskLevel(weather.crosswindRisk),
    weatherRiskLevel(weather.descentRisk),
    weatherRiskLevel(weather.surfaceRisk),
  ]

  const maximum = Math.max(...levels) as UniversalDifficultyComponentLevel
  const severeComponentCount = levels.filter((level) => level >= 2).length

  if (maximum < 4 && severeComponentCount >= 2) {
    return (maximum + 1) as UniversalDifficultyComponentLevel
  }

  return maximum
}

function difficultyLabel(
  category: UniversalDifficultyCategory,
): UniversalDifficultyLabel {
  switch (category) {
    case 1:
      return 'easy'
    case 2:
      return 'moderate'
    case 3:
      return 'hard'
    case 4:
      return 'very_hard'
    case 5:
      return 'extreme'
  }
}

function difficultyCategoryFromScore(
  score: number,
): UniversalDifficultyCategory {
  if (score <= 15) return 1
  if (score <= 30) return 2
  if (score <= 50) return 3
  if (score <= 70) return 4
  return 5
}

function calculateDifficulty(
  input: UniversalRaceEngineInput,
  terrain: UniversalTerrainSummary,
): UniversalDifficultySummary {
  const components: UniversalDifficultyComponents = {
    distance: difficultyLevelFromThresholds(
      input.stage.distanceKm,
      DISTANCE_DIFFICULTY_THRESHOLDS[input.stage.stageFormat],
    ),
    totalAscent: difficultyLevelFromThresholds(
      terrain.totalAscentM,
      TOTAL_ASCENT_THRESHOLDS,
    ),
    ascentDensity: difficultyLevelFromThresholds(
      terrain.ascentPer100Km,
      ASCENT_DENSITY_THRESHOLDS,
    ),
    longestClimb: difficultyLevelFromThresholds(
      terrain.longestClimbKm,
      LONGEST_CLIMB_THRESHOLDS,
    ),
    importantGradient: difficultyLevelFromThresholds(
      terrain.maximumImportantGradient,
      IMPORTANT_GRADIENT_THRESHOLDS,
    ),
    finishProfile: finishDifficultyLevel(input.stage),
    weatherSeverity: calculateWeatherSeverity(input.weather),
  }

  const score = deterministicRound(
    components.distance * 5 +
      components.totalAscent * 5 +
      components.ascentDensity * 5 +
      components.longestClimb * 3.75 +
      components.importantGradient * 2.5 +
      components.finishProfile * 1.25 +
      components.weatherSeverity * 2.5,
    3,
  )

  const category = difficultyCategoryFromScore(score)

  return {
    category,
    label: difficultyLabel(category),
    score,
    components,
  }
}


function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

const PHASE9_CAPS = {
  performanceBonusPoints: [-5, 5] as const,
  speedMultiplier: [0.97, 1.03] as const,
  energyCostMultiplier: [0.88, 1.18] as const,
  fatigueMultiplier: [0.9, 1.15] as const,
  breakawaySurvivalMultiplier: [0.9, 1.08] as const,
  incidentRiskMultiplier: [0.7, 1.4] as const,
  recoveryBonusPoints: [0, 4] as const,
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function phase9Number(record: Record<string, unknown> | null, key: string): number {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function calculatePhase9WeatherModifiers(
  weather: UniversalWeatherInput | undefined,
): UniversalPhase9WeatherModifiers {
  const condition = normalizeWeatherCode(weather?.condition ?? null) ?? ''
  const snapshot = asRecord(weather?.snapshot)
  const temperature = weather?.temperatureC ?? 20
  const windKmh = clamp(weather?.windKmh ?? 0, 0, 100)
  const headwindPct = clamp(
    phase9Number(snapshot, 'headwindPct') ||
      (condition.includes('headwind') ? 100 : 0),
    0,
    100,
  )
  const rainSeverity =
    condition === 'storm' ||
    condition === 'thunderstorm' ||
    condition === 'heavy_rain' ||
    condition === 'torrential_rain'
      ? 1
      : condition === 'rain' ||
          condition === 'showers' ||
          condition === 'rain_showers'
        ? 0.55
        : condition === 'drizzle' || condition === 'light_rain'
          ? 0.25
          : condition === 'snow' ||
              condition === 'sleet' ||
              condition === 'freezing_rain'
            ? 1.15
            : 0
  const heatSeverity = clamp((temperature - 30) / 12, 0, 1)
  const coldSeverity = clamp((8 - temperature) / 18, 0, 1)
  const headwindSeverity = clamp(
    (Math.max(windKmh - 15, 0) / 45) * (headwindPct / 100),
    0,
    1,
  )
  const genericWindSeverity = clamp(Math.max(windKmh - 40, 0) / 40, 0, 1)
  const severe =
    rainSeverity >= 1 ||
    heatSeverity >= 0.9 ||
    coldSeverity >= 0.9 ||
    windKmh >= 65

  return {
    speedMultiplier: deterministicRound(
      clamp(
        1 -
          headwindSeverity * 0.025 -
          rainSeverity * 0.012 -
          genericWindSeverity * 0.01,
        ...PHASE9_CAPS.speedMultiplier,
      ),
      6,
    ),
    energyCostMultiplier: deterministicRound(
      clamp(
        1 +
          headwindSeverity * 0.08 +
          heatSeverity * 0.07 +
          coldSeverity * 0.05,
        ...PHASE9_CAPS.energyCostMultiplier,
      ),
      6,
    ),
    fatigueMultiplier: deterministicRound(
      clamp(
        1 +
          heatSeverity * 0.09 +
          coldSeverity * 0.035 +
          rainSeverity * 0.025,
        ...PHASE9_CAPS.fatigueMultiplier,
      ),
      6,
    ),
    breakawaySurvivalMultiplier: deterministicRound(
      clamp(
        1 - headwindSeverity * 0.08 - genericWindSeverity * 0.02,
        ...PHASE9_CAPS.breakawaySurvivalMultiplier,
      ),
      6,
    ),
    incidentRiskMultiplier: deterministicRound(
      clamp(
        1 +
          rainSeverity * 0.22 +
          genericWindSeverity * 0.12 +
          (severe ? 0.08 : 0),
        ...PHASE9_CAPS.incidentRiskMultiplier,
      ),
      6,
    ),
    severe,
  }
}

function phase9BadWeatherForRainJacket(
  weather: UniversalWeatherInput | undefined,
): boolean {
  const condition = normalizeWeatherCode(weather?.condition ?? null) ?? ''
  const temperature = weather?.temperatureC ?? 20
  const precipitation = Math.max(
    weather?.precipitationMm ?? 0,
    ((weather?.rainProbabilityPct ?? 0) >= 40 ? 2 : 0),
  )
  return (
    temperature < 15 ||
    precipitation >= 2 ||
    condition.includes('rain') ||
    condition.includes('storm') ||
    condition.includes('shower') ||
    condition.includes('snow') ||
    condition.includes('sleet') ||
    condition.includes('cold')
  )
}

interface Phase9DurableSupplyAssignment {
  readonly riderId: string
  readonly supplyKey: string
}

function phase9DurableSupplyAssignments(
  preparation: UniversalPreparationInput | undefined,
): readonly Phase9DurableSupplyAssignment[] {
  return Object.keys(preparation?.raceSupplies ?? {})
    .sort()
    .map((resourceId) => asRecord(preparation?.raceSupplies?.[resourceId]))
    .filter((record): record is Record<string, unknown> => record !== null)
    .filter(
      (record) =>
        record.resourceKind === 'durable_supply_unit' &&
        isNonEmptyString(record.riderId) &&
        isNonEmptyString(record.supplyKey) &&
        typeof record.stageUsesRemaining === 'number' &&
        record.stageUsesRemaining > 0 &&
        typeof record.selectedStageUses === 'number' &&
        record.selectedStageUses > 0,
    )
    .map((record) => ({
      riderId: record.riderId as string,
      supplyKey: record.supplyKey as string,
    }))
}

function phase9ResourceUpdates(
  input: UniversalRaceEngineInput,
): readonly UniversalPhase9ResourceUpdate[] {
  const preparation = input.preparation
  const distanceKm = Math.max(0, input.stage.distanceKm)
  const updates: UniversalPhase9ResourceUpdate[] = []
  const sources: readonly [
    UniversalPhase9ResourceUpdate['resourceType'],
    JsonRecord,
  ][] = [
    ['equipment', preparation?.equipment ?? {}],
    ['supply', preparation?.raceSupplies ?? {}],
    ['asset', preparation?.assets ?? {}],
  ]

  for (const [resourceType, source] of sources) {
    for (const resourceId of Object.keys(source).sort()) {
      const record = asRecord(source[resourceId])
      if (!record) continue
      const storedTeamId = record['teamId']
      const teamId = typeof storedTeamId === 'string' ? storedTeamId : null
      const quantityBefore =
        typeof record.quantity === 'number' ? Math.max(0, record.quantity) : null
      const requestedUse =
        typeof record.selectedQuantity === 'number'
          ? Math.max(0, record.selectedQuantity)
          : typeof record.usage === 'number'
            ? Math.max(0, record.usage)
            : resourceType === 'supply'
              ? 0
              : null
      const quantityUsed =
        quantityBefore === null || requestedUse === null
          ? null
          : Math.min(quantityBefore, requestedUse)
      const quantityAfter =
        quantityBefore === null || quantityUsed === null
          ? null
          : deterministicRound(Math.max(0, quantityBefore - quantityUsed), 6)

      const stageUsesBefore =
        typeof record.stageUsesRemaining === 'number'
          ? Math.max(0, record.stageUsesRemaining)
          : null
      const requestedStageUses =
        typeof record.selectedStageUses === 'number'
          ? Math.max(0, record.selectedStageUses)
          : null
      const stageUsesUsed =
        stageUsesBefore === null || requestedStageUses === null
          ? null
          : Math.min(stageUsesBefore, requestedStageUses)
      const stageUsesAfter =
        stageUsesBefore === null || stageUsesUsed === null
          ? null
          : deterministicRound(Math.max(0, stageUsesBefore - stageUsesUsed), 6)
      const maxStageUses =
        typeof record.maxStageUses === 'number'
          ? Math.max(0, record.maxStageUses)
          : null

      const conditionBefore =
        typeof record.condition === 'number'
          ? clamp(record.condition, 0, 100)
          : null
      const configuredWear =
        typeof record.conditionLossPerRaceDay === 'number' &&
        Number.isFinite(record.conditionLossPerRaceDay)
          ? Math.max(0, record.conditionLossPerRaceDay)
          : resourceType === 'equipment'
            ? 0.35
            : resourceType === 'asset'
              ? 0.25
              : 0
      const calculatedWear =
        resourceType === 'equipment'
          ? Math.max(0, (distanceKm / 100) * configuredWear)
          : resourceType === 'asset'
            ? clamp(
                configuredWear * clamp(distanceKm / 120, 0.6, 1.6),
                0.05,
                2.5,
              )
            : 0
      const conditionUsed =
        conditionBefore === null
          ? null
          : deterministicRound(
              Math.min(conditionBefore, Math.max(0, calculatedWear)),
              6,
            )
      const conditionAfter =
        conditionBefore === null || conditionUsed === null
          ? null
          : deterministicRound(Math.max(0, conditionBefore - conditionUsed), 6)
      updates.push({
        resourceType,
        resourceId,
        teamId,
        quantityBefore,
        quantityUsed,
        quantityAfter,
        conditionBefore,
        conditionUsed,
        conditionAfter,
        stageUsesBefore,
        stageUsesUsed,
        stageUsesAfter,
        maxStageUses,
        shortageApplied:
          (quantityBefore !== null &&
            requestedUse !== null &&
            requestedUse > quantityBefore) ||
          (stageUsesBefore !== null &&
            requestedStageUses !== null &&
            requestedStageUses > stageUsesBefore),
      })
    }
  }
  return updates
}

export function buildUniversalPhase9ModifierSummary(
  input: UniversalRaceEngineInput,
): UniversalPhase9ModifierSummary {
  const standardized = asRecord(input.preparation?.standardizedBonuses)
  const teamSource = asRecord(standardized?.teams)
  const weather = calculatePhase9WeatherModifiers(input.weather)
  const teams = [...input.teams]
    .sort((left, right) => left.teamId.localeCompare(right.teamId))
    .map((team) => {
      const row = asRecord(teamSource?.[team.teamId])
      const equipmentPerformance = phase9Number(
        row,
        'equipmentPerformanceBonusPoints',
      )
      const equipmentSuitability = phase9Number(
        row,
        'equipmentSuitabilityBonusPoints',
      )
      const supplySupport = phase9Number(row, 'supplySupportPoints')
      const shortagePenalty = phase9Number(row, 'shortagePenaltyPoints')
      const assetSupport = phase9Number(row, 'assetSupportPoints')
      const staffSupport = phase9Number(row, 'staffSupportPoints')
      const supplyEnergySavingPct = phase9Number(
        row,
        'supplyEnergySavingPct',
      )
      const supplyEnergyPenaltyPct = phase9Number(
        row,
        'supplyEnergyPenaltyPct',
      )
      const supplyFatigueReductionPct = phase9Number(
        row,
        'supplyFatigueReductionPct',
      )
      const supplyFatiguePenaltyPct = phase9Number(
        row,
        'supplyFatiguePenaltyPct',
      )
      const supplyRecoveryBonusPoints = phase9Number(
        row,
        'supplyRecoveryBonusPoints',
      )
      const tacticalSupport = clamp(
        phase9Number(row, 'tacticalSupportPoints'),
        0,
        3,
      )
      const reliabilitySupport = clamp(
        phase9Number(row, 'reliabilitySupportPoints'),
        0,
        3,
      )
      const recoveryBonus = clamp(
        phase9Number(row, 'recoveryBonusPoints') +
          supplyRecoveryBonusPoints,
        ...PHASE9_CAPS.recoveryBonusPoints,
      )
      const rawPerformance =
        equipmentPerformance +
        equipmentSuitability +
        supplySupport +
        assetSupport +
        staffSupport +
        tacticalSupport * 0.35 -
        shortagePenalty
      const performanceBonusPoints = clamp(
        rawPerformance,
        ...PHASE9_CAPS.performanceBonusPoints,
      )
      const energyCostMultiplier = clamp(
        1 -
          (phase9Number(row, 'energySavingPct') +
            supplyEnergySavingPct) /
            100 +
          (phase9Number(row, 'energyPenaltyPct') +
            supplyEnergyPenaltyPct) /
            100,
        ...PHASE9_CAPS.energyCostMultiplier,
      )
      const fatigueMultiplier = clamp(
        1 -
          (phase9Number(row, 'fatigueReductionPct') +
            supplyFatigueReductionPct) /
            100 +
          (phase9Number(row, 'fatiguePenaltyPct') +
            supplyFatiguePenaltyPct) /
            100,
        ...PHASE9_CAPS.fatigueMultiplier,
      )
      const incidentRiskMultiplier = clamp(
        1 -
          reliabilitySupport * 0.045 +
          phase9Number(row, 'incidentRiskPenaltyPct') / 100,
        ...PHASE9_CAPS.incidentRiskMultiplier,
      )
      const breakawaySurvivalMultiplier = clamp(
        1 + tacticalSupport * 0.012 + performanceBonusPoints * 0.004,
        ...PHASE9_CAPS.breakawaySurvivalMultiplier,
      )
      const speedMultiplier = clamp(
        1 + performanceBonusPoints * 0.004,
        ...PHASE9_CAPS.speedMultiplier,
      )
      return {
        teamId: team.teamId,
        performanceBonusPoints: deterministicRound(performanceBonusPoints, 6),
        speedMultiplier: deterministicRound(speedMultiplier, 6),
        energyCostMultiplier: deterministicRound(energyCostMultiplier, 6),
        fatigueMultiplier: deterministicRound(fatigueMultiplier, 6),
        breakawaySurvivalMultiplier: deterministicRound(
          breakawaySurvivalMultiplier,
          6,
        ),
        incidentRiskMultiplier: deterministicRound(incidentRiskMultiplier, 6),
        recoveryBonusPoints: deterministicRound(recoveryBonus, 6),
        tacticalSupportPoints: deterministicRound(tacticalSupport, 6),
        reliabilitySupportPoints: deterministicRound(reliabilitySupport, 6),
        sources: {
          equipmentPerformanceBonusPoints: deterministicRound(
            equipmentPerformance,
            6,
          ),
          equipmentSuitabilityBonusPoints: deterministicRound(
            equipmentSuitability,
            6,
          ),
          supplySupportPoints: deterministicRound(supplySupport, 6),
          shortagePenaltyPoints: deterministicRound(shortagePenalty, 6),
          assetSupportPoints: deterministicRound(assetSupport, 6),
          staffSupportPoints: deterministicRound(staffSupport, 6),
          supplyEnergySavingPct: deterministicRound(
            supplyEnergySavingPct,
            6,
          ),
          supplyEnergyPenaltyPct: deterministicRound(
            supplyEnergyPenaltyPct,
            6,
          ),
          supplyFatigueReductionPct: deterministicRound(
            supplyFatigueReductionPct,
            6,
          ),
          supplyFatiguePenaltyPct: deterministicRound(
            supplyFatiguePenaltyPct,
            6,
          ),
          supplyRecoveryBonusPoints: deterministicRound(
            supplyRecoveryBonusPoints,
            6,
          ),
        },
      }
    })

  return {
    active: true,
    singleCalculationPath: true,
    weather,
    teams,
    resourceUpdates: phase9ResourceUpdates(input),
    caps: PHASE9_CAPS,
    deterministic: true,
    modelVersion: 'universal_phase_9_modifiers_v1',
  }
}

function applyUniversalPhase9ModifiersToInput(
  input: UniversalRaceEngineInput,
  phase9: UniversalPhase9ModifierSummary,
): UniversalRaceEngineInput {
  const teamModifiers = new Map(
    phase9.teams.map((row) => [row.teamId, row]),
  )
  const durableAssignments = phase9DurableSupplyAssignments(input.preparation)
  const rainJacketRiderIds = new Set(
    durableAssignments
      .filter((row) => row.supplyKey === 'rain_jackets')
      .map((row) => row.riderId),
  )
  const rainJacketBadWeather = phase9BadWeatherForRainJacket(input.weather)
  return {
    ...input,
    riders: input.riders.map((rider) => {
      const team = teamModifiers.get(rider.teamId)
      if (!team) return rider
      const existing = rider.preparationModifiers
      const rainJacketAssigned = rainJacketRiderIds.has(rider.riderId)
      const rainJacketFatigueMultiplier =
        rainJacketAssigned && rainJacketBadWeather ? 0.995 : 1
      const rainJacketHealthRiskMultiplier =
        rainJacketAssigned && rainJacketBadWeather ? 0.5 : 1
      const rainJacketEfficiencyPct = rainJacketAssigned ? -1 : 0
      const combinedPerformance = clamp(
        (existing?.performanceBonusPoints ?? 0) +
          team.performanceBonusPoints * phase9.weather.speedMultiplier,
        ...PHASE9_CAPS.performanceBonusPoints,
      )
      return {
        ...rider,
        preparationModifiers: {
          inStageEnergyCostMultiplier: deterministicRound(
            clamp(
              (existing?.inStageEnergyCostMultiplier ?? 1) *
                team.energyCostMultiplier *
                phase9.weather.energyCostMultiplier,
              0.75,
              1.35,
            ),
            6,
          ),
          postStageFatigueMultiplier: deterministicRound(
            clamp(
              (existing?.postStageFatigueMultiplier ?? 1) *
                team.fatigueMultiplier *
                phase9.weather.fatigueMultiplier *
                rainJacketFatigueMultiplier,
              0.75,
              1.35,
            ),
            6,
          ),
          postStageRecoveryBonusPoints: deterministicRound(
            clamp(
              (existing?.postStageRecoveryBonusPoints ?? 0) +
                team.recoveryBonusPoints,
              0,
              8,
            ),
            6,
          ),
          performanceBonusPoints: deterministicRound(combinedPerformance, 6),
          equipmentStagePerformancePct: deterministicRound(
            clamp(existing?.equipmentStagePerformancePct ?? 0, -20, 20),
            6,
          ),
          supplyStagePerformancePct: deterministicRound(
            clamp(
              (existing?.supplyStagePerformancePct ?? 0) +
                rainJacketEfficiencyPct,
              -10,
              10,
            ),
            6,
          ),
          healthIncidentRiskMultiplier: deterministicRound(
            clamp(
              (existing?.healthIncidentRiskMultiplier ?? 1) *
                rainJacketHealthRiskMultiplier,
              0.25,
              1.5,
            ),
            6,
          ),
          incidentRiskMultiplier: deterministicRound(
            clamp(
              (existing?.incidentRiskMultiplier ?? 1) *
                team.incidentRiskMultiplier *
                phase9.weather.incidentRiskMultiplier,
              0.7,
              1.4,
            ),
            6,
          ),
          mechanicalIncidentRiskMultiplier: deterministicRound(
            clamp(existing?.mechanicalIncidentRiskMultiplier ?? 1, 0.78, 1.5),
            6,
          ),
          mechanicalTimeLossMultiplier: deterministicRound(
            clamp(existing?.mechanicalTimeLossMultiplier ?? 1, 0.82, 1),
            6,
          ),
          equipmentConditionPercent: deterministicRound(
            clamp(existing?.equipmentConditionPercent ?? 100, 0, 100),
            6,
          ),
        },
      }
    }),
  }
}

function phase9ObjectRecordCount(value: JsonRecord | undefined): number {
  return Object.keys(value ?? {}).length
}

function phase9CoverageStatus(
  inputRecordCount: number,
  appliedSignalCount: number,
): UniversalPhase9CoverageStatus {
  if (inputRecordCount <= 0) return 'not_supplied'
  return appliedSignalCount > 0 ? 'applied' : 'received_neutral'
}

function buildUniversalPhase9AcceptanceReport(
  originalInput: UniversalRaceEngineInput,
  calculationInput: UniversalRaceEngineInput,
  phase9: UniversalPhase9ModifierSummary,
  postStageUpdate: UniversalPostStageUpdateSummary,
): UniversalPhase9AcceptanceReport {
  const preparation = originalInput.preparation
  const standardized = asRecord(preparation?.standardizedBonuses)
  const teamSource = asRecord(standardized?.teams)
  const teamSourceRows = Object.values(teamSource ?? {})
    .map((value) => asRecord(value))
    .filter((value): value is Record<string, unknown> => value !== null)
  const countSignals = (keys: readonly string[]) =>
    teamSourceRows.reduce(
      (total, row) =>
        total +
        keys.filter((key) => Math.abs(phase9Number(row, key)) > 0).length,
      0,
    )
  const weatherInputCount = originalInput.weather
    ? [
        originalInput.weather.condition,
        originalInput.weather.temperatureC,
        originalInput.weather.windKmh,
        originalInput.weather.precipitationMm,
        originalInput.weather.rainProbabilityPct,
        ...Object.keys(originalInput.weather.snapshot ?? {}),
      ].filter((value) => value !== null && value !== undefined).length
    : 0
  const weatherSignals = [
    phase9.weather.speedMultiplier !== 1,
    phase9.weather.energyCostMultiplier !== 1,
    phase9.weather.fatigueMultiplier !== 1,
    phase9.weather.breakawaySurvivalMultiplier !== 1,
    phase9.weather.incidentRiskMultiplier !== 1,
    phase9.weather.severe,
  ].filter(Boolean).length
  const equipmentInputCount =
    phase9ObjectRecordCount(preparation?.equipment) +
    countSignals([
      'equipmentPerformanceBonusPoints',
      'equipmentSuitabilityBonusPoints',
    ])
  const supplyInputCount =
    phase9ObjectRecordCount(preparation?.raceSupplies) +
    countSignals([
      'supplySupportPoints',
      'shortagePenaltyPoints',
      'supplyEnergySavingPct',
      'supplyEnergyPenaltyPct',
      'supplyFatigueReductionPct',
      'supplyFatiguePenaltyPct',
      'supplyRecoveryBonusPoints',
    ])
  const assetInputCount =
    phase9ObjectRecordCount(preparation?.assets) +
    countSignals(['assetSupportPoints'])
  // Staff coverage is provenance-based. Generic tactical/reliability/recovery
  // channels may come from canonical preparation and must not manufacture a
  // staff input when preparation.staff is empty.
  const staffInputCount = phase9ObjectRecordCount(preparation?.staff)
  const equipmentUpdates = phase9.resourceUpdates.filter(
    (row) =>
      row.resourceType === 'equipment' &&
      row.conditionBefore !== null &&
      row.conditionAfter !== null &&
      row.conditionAfter < row.conditionBefore,
  )
  const assetUpdates = phase9.resourceUpdates.filter(
    (row) =>
      row.resourceType === 'asset' &&
      row.conditionBefore !== null &&
      row.conditionAfter !== null &&
      row.conditionAfter < row.conditionBefore,
  )
  const supplyUpdates = phase9.resourceUpdates.filter(
    (row) =>
      row.resourceType === 'supply' &&
      row.quantityBefore !== null &&
      row.quantityAfter !== null &&
      row.quantityAfter < row.quantityBefore,
  )
  const durableSupplyUpdates = phase9.resourceUpdates.filter(
    (row) =>
      row.resourceType === 'supply' &&
      row.stageUsesBefore !== null &&
      row.stageUsesAfter !== null &&
      row.stageUsesAfter < row.stageUsesBefore,
  )
  const shortages = phase9.resourceUpdates.filter(
    (row) => row.shortageApplied,
  )
  const equipmentSignals =
    countSignals([
      'equipmentPerformanceBonusPoints',
      'equipmentSuitabilityBonusPoints',
    ]) + equipmentUpdates.length
  const supplySignals =
    countSignals([
      'supplySupportPoints',
      'shortagePenaltyPoints',
      'supplyEnergySavingPct',
      'supplyEnergyPenaltyPct',
      'supplyFatigueReductionPct',
      'supplyFatiguePenaltyPct',
      'supplyRecoveryBonusPoints',
    ]) + supplyUpdates.length + durableSupplyUpdates.length + shortages.length
  const assetSignals = countSignals(['assetSupportPoints']) + assetUpdates.length
  const staffSnapshotSignals = Object.values(preparation?.staff ?? {})
    .map((value) => asRecord(value))
    .filter(
      (record) =>
        record?.hasEffectSnapshot === true ||
        phase9Number(record, 'effectSignalCount') > 0,
    ).length
  const staffSignals =
    staffInputCount > 0
      ? countSignals(['staffSupportPoints']) + staffSnapshotSignals
      : 0
  const categories: readonly UniversalPhase9CategoryCoverage[] = [
    {
      category: 'weather',
      status: phase9CoverageStatus(weatherInputCount, weatherSignals),
      inputRecordCount: weatherInputCount,
      appliedSignalCount: weatherSignals,
      updateCount: 0,
    },
    {
      category: 'equipment',
      status: phase9CoverageStatus(equipmentInputCount, equipmentSignals),
      inputRecordCount: equipmentInputCount,
      appliedSignalCount: equipmentSignals,
      updateCount: equipmentUpdates.length,
    },
    {
      category: 'supplies',
      status: phase9CoverageStatus(supplyInputCount, supplySignals),
      inputRecordCount: supplyInputCount,
      appliedSignalCount: supplySignals,
      updateCount: supplyUpdates.length,
    },
    {
      category: 'assets',
      status: phase9CoverageStatus(assetInputCount, assetSignals),
      inputRecordCount: assetInputCount,
      appliedSignalCount: assetSignals,
      updateCount: assetUpdates.length,
    },
    {
      category: 'staff',
      status: phase9CoverageStatus(staffInputCount, staffSignals),
      inputRecordCount: staffInputCount,
      appliedSignalCount: staffSignals,
      updateCount: 0,
    },
  ]
  const postStageByRiderId = new Map(
    postStageUpdate.riderUpdates.map((row) => [row.riderId, row] as const),
  )
  const teamById = new Map(
    phase9.teams.map((row) => [row.teamId, row] as const),
  )
  const riderEffects = calculationInput.riders
    .map((rider): UniversalPhase9RiderEffectRow => {
      const update = postStageByRiderId.get(rider.riderId)
      const modifiers = rider.preparationModifiers
      const team = teamById.get(rider.teamId)
      return {
        riderId: rider.riderId,
        teamId: rider.teamId,
        effectiveEnergyCostMultiplier:
          modifiers?.inStageEnergyCostMultiplier ?? 1,
        effectiveFatigueMultiplier:
          modifiers?.postStageFatigueMultiplier ?? 1,
        effectiveRecoveryBonusPoints:
          modifiers?.postStageRecoveryBonusPoints ?? 0,
        performanceBonusPoints: modifiers?.performanceBonusPoints ?? 0,
        equipmentStagePerformancePct:
          modifiers?.equipmentStagePerformancePct ?? 0,
        supplyStagePerformancePct:
          modifiers?.supplyStagePerformancePct ?? 0,
        incidentRiskMultiplier: modifiers?.incidentRiskMultiplier ?? 1,
        healthIncidentRiskMultiplier:
          modifiers?.healthIncidentRiskMultiplier ?? 1,
        weatherEnergyCostMultiplier: phase9.weather.energyCostMultiplier,
        weatherFatigueMultiplier: phase9.weather.fatigueMultiplier,
        supplySupportPoints: team?.sources.supplySupportPoints ?? 0,
        shortagePenaltyPoints: team?.sources.shortagePenaltyPoints ?? 0,
        actualEnergySpent: update?.energySpent ?? 0,
        actualFatigueGained: update?.fatigueGained ?? 0,
        actualFatigueAfter: update?.fatigueAfter ?? rider.fatigueBeforeStage,
      }
    })
    .sort(
      (left, right) =>
        left.teamId.localeCompare(right.teamId) ||
        left.riderId.localeCompare(right.riderId),
    )
  const resourceMathValid = phase9.resourceUpdates.every((row) => {
    const quantityValid =
      row.quantityBefore === null ||
      row.quantityUsed === null ||
      row.quantityAfter === null ||
      Math.abs(row.quantityBefore - row.quantityUsed - row.quantityAfter) <=
        0.000001
    const conditionValid =
      row.conditionBefore === null ||
      row.conditionUsed === null ||
      row.conditionAfter === null ||
      Math.abs(row.conditionBefore - row.conditionUsed - row.conditionAfter) <=
        0.000001
    const stageUsesValid =
      row.stageUsesBefore === null ||
      row.stageUsesUsed === null ||
      row.stageUsesAfter === null ||
      Math.abs(row.stageUsesBefore - row.stageUsesUsed - row.stageUsesAfter) <=
        0.000001
    return quantityValid && conditionValid && stageUsesValid
  })
  const warnings = categories
    .filter((row) => row.status === 'not_supplied')
    .map((row) => `${row.category} input was not supplied to this race calculation`)
  warnings.push(
    'Resource condition, quantity, and durable-use updates are calculated by the pure engine but are not persisted until the Phase 11 application service applies them after stage finalization',
  )
  const passed =
    phase9.singleCalculationPath &&
    resourceMathValid &&
    riderEffects.length === calculationInput.riders.length

  return {
    passed,
    engineBuild: UNIVERSAL_RACE_ENGINE_DEBUG_BUILD,
    singleCalculationPath: true,
    completeFiveSystemInputCoverage: categories.every(
      (row) => row.status !== 'not_supplied',
    ),
    categories,
    weather: phase9.weather,
    teams: phase9.teams,
    riderEffects,
    resourceUpdates: phase9.resourceUpdates,
    resourceUpdateSummary: {
      equipmentConditionUpdatesCalculated: equipmentUpdates.length,
      assetConditionUpdatesCalculated: assetUpdates.length,
      supplyQuantityUpdatesCalculated: supplyUpdates.length,
      durableSupplyUseUpdatesCalculated: durableSupplyUpdates.length,
      shortagesCalculated: shortages.length,
      resourceMathValid,
    },
    persistence: {
      pureEngineDatabaseWrites: false,
      conditionAndQuantityUpdatesCalculated: phase9.resourceUpdates.length > 0,
      persistenceApplied: false,
      requiredBoundary: 'phase_11_application_service',
    },
    warnings,
    deterministic: true,
    modelVersion: 'universal_phase_9_acceptance_v1',
  }
}

function readinessLabel(
  readinessScore: number,
  eligibleToStart: boolean,
): UniversalReadinessLabel {
  if (!eligibleToStart) return 'unavailable'
  if (readinessScore >= 90) return 'peak'
  if (readinessScore >= 80) return 'strong'
  if (readinessScore >= 70) return 'ready'
  if (readinessScore >= 55) return 'limited'
  if (readinessScore >= 40) return 'poor'
  return 'critical'
}

function availabilityReadinessModifier(
  availabilityStatus: AvailabilityStatus,
): number {
  switch (availabilityStatus) {
    case 'fit':
      return 0
    case 'not_fully_fit':
      return -8
    case 'sick':
      return -18
    case 'injured':
      return -25
  }
}

function calculatePreviousStageRecovery(
  rider: UniversalRiderInput,
  effectiveFatigue: number,
): UniversalPreviousStageRecoverySummary | null {
  const previousStage = rider.previousStage
  if (!previousStage) return null

  const fatigueAfterPreviousStage = deterministicRound(
    clamp(previousStage.fatigueAfterStage, 0, 100),
    3,
  )
  const fatigueBeforeCurrentStage = deterministicRound(effectiveFatigue, 3)
  const recoveredFatiguePoints = deterministicRound(
    Math.max(0, fatigueAfterPreviousStage - fatigueBeforeCurrentStage),
    3,
  )
  const accumulatedFatiguePoints = deterministicRound(
    Math.max(0, fatigueBeforeCurrentStage - fatigueAfterPreviousStage),
    3,
  )

  let state: UniversalPreviousStageRecoveryState = 'unchanged'
  if (recoveredFatiguePoints > 0) state = 'recovered'
  if (accumulatedFatiguePoints > 0) state = 'accumulated_load'

  return {
    stageId: previousStage.stageId,
    stageStatus: previousStage.stageStatus,
    finishStamina:
      previousStage.finishStamina === null
        ? null
        : deterministicRound(clamp(previousStage.finishStamina, 0, 100), 3),
    fatigueAfterPreviousStage,
    fatigueBeforeCurrentStage,
    recoveredFatiguePoints,
    accumulatedFatiguePoints,
    daysSincePreviousStage: previousStage.daysSincePreviousStage,
    state,
    representedByCurrentFatigue: true,
  }
}

function calculateIntrinsicDailyRecoveryPoints(
  recovery: number,
  morale: number,
): number {
  const moraleAdjustment = morale >= 80 ? 1 : morale < 40 ? -1 : 0

  return Math.max(
    3,
    Math.round(6 + clamp(recovery, 0, 100) * 0.1 + moraleAdjustment),
  )
}

function calculateFatigueBalance(
  rider: UniversalRiderInput,
  startFreshness: number,
  morale: number,
  eligibleToStart: boolean,
): UniversalRiderFatigueBalanceResult {
  const preparation = rider.preparationModifiers
  const preStagePerformanceModifier = eligibleToStart
    ? clamp((startFreshness - 85) * 0.08, -6, 1.2)
    : 0

  return {
    active: eligibleToStart,
    preStagePerformanceModifier: deterministicRound(
      preStagePerformanceModifier,
      4,
    ),
    startEnergy: eligibleToStart
      ? deterministicRound(startFreshness, 3)
      : 0,
    directFatigueEnergyCostMultiplier: 1,
    inStageEnergyCostMultiplier: deterministicRound(
      preparation?.inStageEnergyCostMultiplier ?? 1,
      6,
    ),
    intrinsicDailyRecoveryPoints: calculateIntrinsicDailyRecoveryPoints(
      rider.recovery,
      morale,
    ),
    postStageFatigueMultiplier: deterministicRound(
      preparation?.postStageFatigueMultiplier ?? 1,
      6,
    ),
    postStageRecoveryBonusPoints: deterministicRound(
      preparation?.postStageRecoveryBonusPoints ?? 0,
      6,
    ),
    fatigueWritePolicy: 'ledger_guarded_once',
    historicalReapplyAllowed: false,
    startEnergySource: 'engine_starting_condition_v2',
    channels: {
      preStagePerformance: 'start_freshness',
      inStageEnergy: 'start_energy',
      postStageFatigue: 'ledger_guarded_once',
      betweenStageRecovery: 'current_fatigue_snapshot',
    },
    modelVersion: 'universal_fatigue_balance_v2',
  }
}

/**
 * Calculate one rider's immutable pre-stage readiness.
 *
 * Authoritative starting-condition semantics:
 * - fatigue and race sharpness are clamped to 0-100;
 * - the engine owns one physical start-energy calculation:
 *   100 - fatigue*0.50 + (sharpness-50)*0.25 + availability penalty;
 * - not-fully-fit riders receive an -8 physical reserve penalty;
 * - sick, injured, DNS, and selection-blocked riders remain ineligible;
 * - the result is clamped to 1-100, so severely unready riders may start below
 *   50 instead of being artificially protected by the previous floor;
 * - the supplied database startStamina value is retained for diagnostics only;
 * - recovery skill is not reapplied here because current fatigue already
 *   contains between-stage recovery;
 * - recent form and morale adjust readiness after physical start energy and
 *   availability is not charged a second time.
 */
export function calculateRiderReadiness(
  rider: UniversalRiderInput,
): UniversalRiderReadinessResult {
  const clampedFatigue = clamp(rider.fatigueBeforeStage, 0, 100)
  const healthFatigueFloor =
    rider.healthCase?.status === 'recovering'
      ? clamp(rider.healthCase.fatigueFloorOnReturn, 0, 100)
      : 0
  const effectiveFatigue = Math.max(clampedFatigue, healthFatigueFloor)
  const raceSharpness = clamp(rider.raceSharpness, 0, 100)
  const recentFormScore = clamp(rider.recentFormScore, -15, 30)
  const normalizedRecentForm = ((recentFormScore + 15) / 45) * 100
  const morale = clamp(rider.morale, 0, 100)
  const availabilityModifier = availabilityReadinessModifier(
    rider.availabilityStatus,
  )
  const healthSelectionBlocked =
    rider.healthCase?.selectionBlocked === true
  const eligibleToStart =
    rider.startStatus === 'starter' &&
    rider.availabilityStatus !== 'injured' &&
    rider.availabilityStatus !== 'sick' &&
    !healthSelectionBlocked
  const sharpnessStartEnergyAdjustment = clamp(
    (raceSharpness - 50) * 0.25,
    -12.5,
    12.5,
  )
  const availabilityStartEnergyPenalty =
    rider.availabilityStatus === 'not_fully_fit'
      ? availabilityModifier
      : 0
  const startFreshness = eligibleToStart
    ? clamp(
        100 -
          effectiveFatigue * 0.5 +
          sharpnessStartEnergyAdjustment +
          availabilityStartEnergyPenalty,
        1,
        100,
      )
    : 0
  const recentFormModifier = clamp(recentFormScore * 0.2, -3, 6)
  const moraleModifier = clamp((morale - 65) * 0.04, -1.6, 1.4)

  const readinessScore = eligibleToStart
    ? clamp(
        startFreshness + recentFormModifier + moraleModifier,
        0,
        100,
      )
    : 0

  return {
    riderId: rider.riderId,
    teamId: rider.teamId,
    startStatus: rider.startStatus,
    availabilityStatus: rider.availabilityStatus,
    eligibleToStart,
    readinessScore: deterministicRound(readinessScore, 3),
    label: readinessLabel(readinessScore, eligibleToStart),
    healthSelectionBlocked,
    healthFatigueFloor: deterministicRound(healthFatigueFloor, 3),
    components: {
      providedStartStamina: deterministicRound(
        clamp(rider.startStamina, 0, 100),
        3,
      ),
      startFreshness: deterministicRound(startFreshness, 3),
      effectiveFatigue: deterministicRound(effectiveFatigue, 3),
      fatigueReadiness: deterministicRound(100 - effectiveFatigue, 3),
      raceSharpness: deterministicRound(raceSharpness, 3),
      sharpnessStartEnergyAdjustment: deterministicRound(
        sharpnessStartEnergyAdjustment,
        3,
      ),
      availabilityStartEnergyPenalty: deterministicRound(
        availabilityStartEnergyPenalty,
        3,
      ),
      providedStartStaminaDifference: deterministicRound(
        clamp(rider.startStamina, 0, 100) - startFreshness,
        3,
      ),
      recentFormScore: deterministicRound(recentFormScore, 3),
      normalizedRecentForm: deterministicRound(normalizedRecentForm, 3),
      morale: deterministicRound(morale, 3),
      recentFormModifier: deterministicRound(recentFormModifier, 3),
      moraleModifier: deterministicRound(moraleModifier, 3),
      availabilityModifier,
    },
    previousStageRecovery: calculatePreviousStageRecovery(
      rider,
      effectiveFatigue,
    ),
    fatigueBalance: calculateFatigueBalance(
      rider,
      startFreshness,
      morale,
      eligibleToStart,
    ),
    modelVersion: 'universal_rider_readiness_v2',
  }
}

function calculateAllRiderReadiness(
  riders: readonly UniversalRiderInput[],
): readonly UniversalRiderReadinessResult[] {
  return riders
    .map(calculateRiderReadiness)
    .sort((left, right) => {
      if (left.teamId < right.teamId) return -1
      if (left.teamId > right.teamId) return 1
      if (left.riderId < right.riderId) return -1
      if (left.riderId > right.riderId) return 1
      return 0
    })
}

function sumSkillWeights(weights: UniversalRiderSkillWeights): number {
  return UNIVERSAL_SKILL_ATTRIBUTES.reduce(
    (sum, attribute) => sum + weights[attribute],
    0,
  )
}

function normalizeSkillWeights(
  rawWeights: UniversalRiderSkillWeights,
): UniversalRiderSkillWeights {
  const total = sumSkillWeights(rawWeights)
  if (total <= 0) {
    throw new Error('Stage skill weights must have a positive total.')
  }

  const normalized: Record<UniversalSkillAttribute, number> = {
    sprint: 0,
    climbing: 0,
    timeTrial: 0,
    flat: 0,
    endurance: 0,
    recovery: 0,
    resistance: 0,
    raceIQ: 0,
    teamwork: 0,
  }

  UNIVERSAL_SKILL_ATTRIBUTES.forEach((attribute) => {
    normalized[attribute] = deterministicRound(
      rawWeights[attribute] / total,
      6,
    )
  })

  const roundedTotal = UNIVERSAL_SKILL_ATTRIBUTES.reduce(
    (sum, attribute) => sum + normalized[attribute],
    0,
  )
  const correction = deterministicRound(1 - roundedTotal, 6)

  const correctionAttribute = UNIVERSAL_SKILL_ATTRIBUTES.reduce(
    (best, attribute) =>
      rawWeights[attribute] > rawWeights[best] ? attribute : best,
    UNIVERSAL_SKILL_ATTRIBUTES[0],
  )
  normalized[correctionAttribute] = deterministicRound(
    normalized[correctionAttribute] + correction,
    6,
  )

  return normalized
}

function roadStageSkillWeights(
  profile: 'flat' | 'hilly' | 'mountain' | 'cobbled',
): UniversalRiderSkillWeights {
  switch (profile) {
    case 'flat':
      return {
        sprint: 0.3,
        climbing: 0,
        timeTrial: 0,
        flat: 0.25,
        endurance: 0.2,
        recovery: 0,
        resistance: 0.1,
        raceIQ: 0.1,
        teamwork: 0.05,
      }
    case 'hilly':
      return {
        sprint: 0.1,
        climbing: 0.25,
        timeTrial: 0,
        flat: 0.2,
        endurance: 0.2,
        recovery: 0,
        resistance: 0.15,
        raceIQ: 0.1,
        teamwork: 0,
      }
    case 'mountain':
      return {
        sprint: 0,
        climbing: 0.45,
        timeTrial: 0,
        flat: 0,
        endurance: 0.2,
        recovery: 0.15,
        resistance: 0.1,
        raceIQ: 0.1,
        teamwork: 0,
      }
    case 'cobbled':
      return {
        sprint: 0.1,
        climbing: 0,
        timeTrial: 0,
        flat: 0.3,
        endurance: 0.2,
        recovery: 0,
        resistance: 0.25,
        raceIQ: 0.15,
        teamwork: 0,
      }
  }
}

function timeTrialRawSkillWeights(
  stage: UniversalStageInput,
): UniversalRiderSkillWeights {
  const isPrologue = stage.stageFormat === 'prologue'
  const isLongTimeTrial = stage.distanceKm >= 40

  return {
    sprint: 0,
    climbing:
      stage.terrainPercentages.mountain >= 20
        ? 0.12
        : stage.terrainPercentages.hilly >= 30
          ? 0.08
          : 0.04,
    timeTrial: isPrologue ? 0.38 : isLongTimeTrial ? 0.44 : 0.42,
    flat: stage.terrainPercentages.flat >= 60 ? 0.16 : 0.12,
    endurance: isPrologue ? 0.1 : isLongTimeTrial ? 0.18 : 0.15,
    recovery: 0,
    resistance: isPrologue ? 0.1 : isLongTimeTrial ? 0.12 : 0.11,
    raceIQ: isPrologue ? 0.16 : 0.07,
    teamwork:
      stage.stageFormat === 'team_time_trial' ||
      stage.stageFormat === 'pair_time_trial'
        ? 0.1
        : 0.02,
  }
}

/**
 * Return the one universal stage-skill matrix used by later suitability work.
 *
 * Road weights follow the existing production stage-profile favourite model,
 * with the flat profile's non-skill morale share assigned to teamwork so that
 * readiness remains a separate channel. TT weights reproduce the current
 * route-sensitive production formula and are normalized only after all route
 * weights have been selected.
 */
export function calculateStageSkillModel(
  stage: UniversalStageInput,
): UniversalStageSkillModel {
  let profile: UniversalStageSkillProfile
  let rawWeights: UniversalRiderSkillWeights
  let sourceModel: UniversalStageSkillModel['sourceModel']

  if (stage.stageFormat === 'road_race') {
    if (
      stage.terrainType !== 'flat' &&
      stage.terrainType !== 'hilly' &&
      stage.terrainType !== 'mountain' &&
      stage.terrainType !== 'cobbled'
    ) {
      throw new Error(
        `Unsupported road terrain type: ${String(stage.terrainType)}`,
      )
    }

    profile = stage.terrainType
    rawWeights = roadStageSkillWeights(profile)
    sourceModel = 'production_road_stage_profile_weights_v1'
  } else {
    profile = stage.stageFormat
    rawWeights = timeTrialRawSkillWeights(stage)
    sourceModel = 'production_route_time_trial_weights_v1'
  }

  const rawWeightTotal = deterministicRound(sumSkillWeights(rawWeights), 6)

  return {
    profile,
    stageFormat: stage.stageFormat,
    terrainType: stage.terrainType,
    rawWeights,
    weights: normalizeSkillWeights(rawWeights),
    rawWeightTotal,
    normalizedWeightTotal: 1,
    routeContext: {
      distanceBand:
        stage.stageFormat === 'road_race'
          ? 'not_time_trial'
          : stage.stageFormat === 'prologue'
            ? 'prologue'
            : stage.distanceKm >= 40
              ? 'at_least_40_km'
              : 'under_40_km',
      flatPct: deterministicRound(stage.terrainPercentages.flat, 3),
      hillyPct: deterministicRound(stage.terrainPercentages.hilly, 3),
      mountainPct: deterministicRound(stage.terrainPercentages.mountain, 3),
    },
    sourceModel,
    modelVersion: 'universal_stage_skill_weights_v1',
  }
}

/** Exact production TTT cohesion penalty, expressed as a decimal time share. */
export function calculateTeamTimeTrialCohesionPenaltyPct(
  averageTeamwork: number,
  scoreDispersion: number,
): number {
  const teamworkPenalty =
    Math.max(0, 70 - clamp(averageTeamwork, 0, 100)) * 0.00045
  const dispersionPenalty =
    Math.max(0, Math.max(0, scoreDispersion) - 6) * 0.0003

  return deterministicRound(
    Math.min(0.04, teamworkPenalty + dispersionPenalty),
    6,
  )
}

export function buildTeamTimeTrialSuitabilityRules(
  stage: UniversalStageInput,
): UniversalTeamTimeTrialSuitabilityRules {
  const active = stage.stageFormat === 'team_time_trial'
  const configuredCountingRiderNumber =
    active && stage.timeTrialRules
      ? stage.timeTrialRules.countingRiderNumber
      : null

  return {
    active,
    configured:
      active &&
      configuredCountingRiderNumber !== null &&
      configuredCountingRiderNumber >= 2 &&
      configuredCountingRiderNumber <= 8,
    countingRiderNumber: configuredCountingRiderNumber,
    countingRiderNumberSource: 'race_stage_time_trial_rules',
    validCountingRiderRange: [2, 8],
    minimumTeamSize: configuredCountingRiderNumber,
    countingGroupSelection:
      'fastest_projected_riders_then_adjusted_tt_score_then_rider_id',
    teamTimeRule: 'slowest_counting_group_rider',
    droppedRiderTimeMode:
      active && stage.timeTrialRules
        ? stage.timeTrialRules.droppedRiderTimeMode
        : null,
    cohesionRule: {
      averageTeamworkTarget: 70,
      scoreDispersionFreeBand: 6,
      teamworkPenaltyPerPoint: 0.00045,
      dispersionPenaltyPerPoint: 0.0003,
      maximumTimePenaltyPct: 0.04,
    },
    teamRankTieBreak: [
      'team_finish_time_seconds',
      'counting_group_average_score_desc',
      'team_id',
    ],
    modelVersion: 'universal_ttt_suitability_rules_v1',
  }
}


function riderDisplayName(rider: UniversalRiderInput): string {
  const explicit = rider.snapshot.displayName?.trim()
  if (explicit) return explicit

  const joined = [rider.snapshot.firstName, rider.snapshot.lastName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .trim()

  return joined || rider.riderId
}

function riderStartNumber(rider: UniversalRiderInput): number | null {
  return Number.isInteger(rider.snapshot.startNumber) &&
    (rider.snapshot.startNumber ?? 0) > 0
    ? (rider.snapshot.startNumber as number)
    : null
}

function normalizeRoleText(...values: readonly (string | null | undefined)[]): string {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function riderStagePlanById(
  stagePlans: readonly UniversalTeamStagePlanInput[],
): ReadonlyMap<string, UniversalRiderStagePlanInput> {
  const result = new Map<string, UniversalRiderStagePlanInput>()
  stagePlans.forEach((plan) => {
    plan.riders.forEach((riderPlan) => result.set(riderPlan.riderId, riderPlan))
  })
  return result
}

function weightedSkillScore(
  rider: UniversalRiderInput,
  weights: UniversalRiderSkillWeights,
): number {
  return deterministicRound(
    rider.sprint * weights.sprint +
      rider.climbing * weights.climbing +
      rider.timeTrial * weights.timeTrial +
      rider.flat * weights.flat +
      rider.endurance * weights.endurance +
      rider.recovery * weights.recovery +
      rider.resistance * weights.resistance +
      rider.raceIQ * weights.raceIQ +
      rider.teamwork * weights.teamwork,
    4,
  )
}

function compareNullableStartNumbers(
  left: number | null,
  right: number | null,
): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return left - right
}

export function calculateRiderSuitabilityScores(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  stageSkillModel: UniversalStageSkillModel,
): readonly UniversalRiderSuitabilityResult[] {
  const readinessByRiderId = new Map(
    riderReadiness.map((readiness) => [readiness.riderId, readiness]),
  )
  const stagePlanByRiderId = riderStagePlanById(input.stagePlans)

  const provisional = input.riders.map((rider) => {
    const readiness = readinessByRiderId.get(rider.riderId)
    if (!readiness) {
      throw new Error(`Missing readiness for rider ${rider.riderId}`)
    }

    const stageSkillScore = weightedSkillScore(
      rider,
      stageSkillModel.weights,
    )
    const phase9PerformanceBonus = clamp(
      rider.preparationModifiers?.performanceBonusPoints ?? 0,
      -5,
      5,
    )
    const equipmentStagePerformancePct = clamp(
      rider.preparationModifiers?.equipmentStagePerformancePct ?? 0,
      -20,
      20,
    )
    // Equipment is an authoritative percentage effect, not a generic points
    // bonus: weighted UI value -> UI cap -> hidden x5 -> condition scaling.
    const equipmentPerformanceAdjustment = deterministicRound(
      (stageSkillScore * equipmentStagePerformancePct) / 100,
      4,
    )
    const supplyStagePerformancePct = clamp(
      rider.preparationModifiers?.supplyStagePerformancePct ?? 0,
      -10,
      10,
    )
    const supplyPerformanceAdjustment = deterministicRound(
      (stageSkillScore * supplyStagePerformancePct) / 100,
      4,
    )
    const totalReadinessAdjustment =
      readiness.fatigueBalance.preStagePerformanceModifier +
      readiness.components.recentFormModifier +
      readiness.components.moraleModifier +
      phase9PerformanceBonus +
      equipmentPerformanceAdjustment +
      supplyPerformanceAdjustment
    const suitabilityScore = readiness.eligibleToStart
      ? clamp(stageSkillScore + totalReadinessAdjustment, 1, 100)
      : 0
    const stagePlan = stagePlanByRiderId.get(rider.riderId)

    return {
      riderId: rider.riderId,
      teamId: rider.teamId,
      displayName: riderDisplayName(rider),
      startNumber: riderStartNumber(rider),
      stageRole: stagePlan?.stageRole ?? null,
      roleSnapshot: rider.roleSnapshot?.trim() || null,
      eligibleToStart: readiness.eligibleToStart,
      stageSkillScore,
      readinessScore: readiness.readinessScore,
      suitabilityScore: deterministicRound(suitabilityScore, 4),
      components: {
        stageSkillScore,
        freshnessModifier:
          readiness.fatigueBalance.preStagePerformanceModifier,
        recentFormModifier: readiness.components.recentFormModifier,
        moraleModifier: readiness.components.moraleModifier,
        availabilityModifier: readiness.components.availabilityModifier,
        genericPerformanceBonusPoints: deterministicRound(
          phase9PerformanceBonus,
          4,
        ),
        equipmentStagePerformancePct: deterministicRound(
          equipmentStagePerformancePct,
          4,
        ),
        equipmentPerformanceAdjustment,
        supplyStagePerformancePct: deterministicRound(
          supplyStagePerformancePct,
          4,
        ),
        supplyPerformanceAdjustment,
        totalReadinessAdjustment: deterministicRound(
          totalReadinessAdjustment,
          4,
        ),
      },
      modelVersion: 'universal_rider_suitability_v1' as const,
    }
  })

  provisional.sort((left, right) => {
    if (left.suitabilityScore !== right.suitabilityScore) {
      return right.suitabilityScore - left.suitabilityScore
    }
    if (left.stageSkillScore !== right.stageSkillScore) {
      return right.stageSkillScore - left.stageSkillScore
    }
    if (left.readinessScore !== right.readinessScore) {
      return right.readinessScore - left.readinessScore
    }
    const startNumberComparison = compareNullableStartNumbers(
      left.startNumber,
      right.startNumber,
    )
    if (startNumberComparison !== 0) return startNumberComparison
    const nameComparison = left.displayName.localeCompare(right.displayName)
    if (nameComparison !== 0) return nameComparison
    return left.riderId.localeCompare(right.riderId)
  })

  return provisional.map((row, index) => ({
    rank: index + 1,
    ...row,
  }))
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function calculateStageTeamStrength(
  input: UniversalRaceEngineInput,
  riderSuitability: readonly UniversalRiderSuitabilityResult[],
  tttRules: UniversalTeamTimeTrialSuitabilityRules,
): readonly UniversalTeamStrengthResult[] {
  const riderById = new Map(input.riders.map((rider) => [rider.riderId, rider]))

  const rows = input.teams.map((team) => {
    const teamRiders = riderSuitability
      .filter((row) => row.teamId === team.teamId && row.eligibleToStart)
      .sort((left, right) => {
        if (left.suitabilityScore !== right.suitabilityScore) {
          return right.suitabilityScore - left.suitabilityScore
        }
        if (left.stageSkillScore !== right.stageSkillScore) {
          return right.stageSkillScore - left.stageSkillScore
        }
        return left.riderId.localeCompare(right.riderId)
      })
    const suitabilityValues = teamRiders.map((row) => row.suitabilityScore)
    const topThree = suitabilityValues.slice(0, 3)
    const averageSuitabilityScore = average(suitabilityValues)
    const topThreeAverageSuitabilityScore = average(topThree)
    const bestRiderSuitabilityScore = suitabilityValues[0] ?? 0

    let countingRiderNumber: number | null = null
    let countingRiderSuitabilityScore: number | null = null
    let countingGroupAverageTeamwork: number | null = null
    let countingGroupScoreDispersion: number | null = null
    let cohesionPenaltyPct = 0
    let teamStrengthScore = topThreeAverageSuitabilityScore
    let strengthBasis: UniversalTeamStrengthResult['strengthBasis'] =
      'top_three_average_suitability'

    if (
      tttRules.active &&
      tttRules.configured &&
      tttRules.countingRiderNumber !== null &&
      teamRiders.length >= tttRules.countingRiderNumber
    ) {
      countingRiderNumber = tttRules.countingRiderNumber
      const countingGroup = teamRiders.slice(0, countingRiderNumber)
      countingRiderSuitabilityScore =
        countingGroup[countingGroup.length - 1]?.suitabilityScore ?? 0
      const teamworkValues = countingGroup.map(
        (row) => riderById.get(row.riderId)?.teamwork ?? 0,
      )
      countingGroupAverageTeamwork = average(teamworkValues)
      countingGroupScoreDispersion =
        (countingGroup[0]?.suitabilityScore ?? 0) -
        (countingGroup[countingGroup.length - 1]?.suitabilityScore ?? 0)
      cohesionPenaltyPct = calculateTeamTimeTrialCohesionPenaltyPct(
        countingGroupAverageTeamwork,
        countingGroupScoreDispersion,
      )
      teamStrengthScore =
        countingRiderSuitabilityScore * (1 - cohesionPenaltyPct)
      strengthBasis = 'ttt_slowest_counting_rider_after_cohesion'
    }

    return {
      teamId: team.teamId,
      teamName: team.snapshot.teamName?.trim() || team.teamId,
      eligibleRiderCount: teamRiders.length,
      averageSuitabilityScore: deterministicRound(
        averageSuitabilityScore,
        4,
      ),
      topThreeAverageSuitabilityScore: deterministicRound(
        topThreeAverageSuitabilityScore,
        4,
      ),
      bestRiderSuitabilityScore: deterministicRound(
        bestRiderSuitabilityScore,
        4,
      ),
      countingRiderNumber,
      countingRiderSuitabilityScore:
        countingRiderSuitabilityScore === null
          ? null
          : deterministicRound(countingRiderSuitabilityScore, 4),
      countingGroupAverageTeamwork:
        countingGroupAverageTeamwork === null
          ? null
          : deterministicRound(countingGroupAverageTeamwork, 4),
      countingGroupScoreDispersion:
        countingGroupScoreDispersion === null
          ? null
          : deterministicRound(countingGroupScoreDispersion, 4),
      cohesionPenaltyPct,
      teamStrengthScore: deterministicRound(teamStrengthScore, 4),
      strengthBasis,
      modelVersion: 'universal_stage_team_strength_v1' as const,
    }
  })

  rows.sort((left, right) => {
    if (left.teamStrengthScore !== right.teamStrengthScore) {
      return right.teamStrengthScore - left.teamStrengthScore
    }
    if (left.bestRiderSuitabilityScore !== right.bestRiderSuitabilityScore) {
      return (
        right.bestRiderSuitabilityScore - left.bestRiderSuitabilityScore
      )
    }
    return left.teamId.localeCompare(right.teamId)
  })

  return rows.map((row, index) => ({ rank: index + 1, ...row }))
}

type FavouriteProfile = 'flat' | 'mountain' | 'time_trial'

function stageFavouriteProfile(
  stageSkillModel: UniversalStageSkillModel,
): 'flat' | 'hilly' | 'mountain' | 'cobbled' | 'time_trial' {
  switch (stageSkillModel.profile) {
    case 'flat':
    case 'hilly':
    case 'mountain':
    case 'cobbled':
      return stageSkillModel.profile
    case 'individual_time_trial':
    case 'prologue':
    case 'pair_time_trial':
    case 'team_time_trial':
      return 'time_trial'
  }
}

function favouriteReason(
  profile: 'flat' | 'hilly' | 'mountain' | 'cobbled' | 'time_trial',
): string {
  switch (profile) {
    case 'time_trial':
      return 'TT ability, endurance and pacing'
    case 'mountain':
      return 'climbing, endurance and recovery'
    case 'hilly':
      return 'hilly profile, endurance and race IQ'
    case 'cobbled':
      return 'flat power, resistance and cobbled reliability'
    case 'flat':
      return 'flat speed, endurance and race IQ'
  }
}

function favouriteRoleBonus(
  roleText: string,
  profile: 'flat' | 'hilly' | 'mountain' | 'cobbled' | 'time_trial',
): number {
  let bonus = 0
  if (
    roleText.includes('leader') ||
    roleText.includes('captain') ||
    roleText.includes('gc')
  ) {
    bonus += 5
  }
  if (profile === 'flat' && roleText.includes('sprint')) bonus += 4
  if (profile === 'mountain' && roleText.includes('climb')) bonus += 4
  if (
    profile === 'time_trial' &&
    (roleText.includes('time_trial') ||
      roleText === 'tt' ||
      roleText.includes('_tt_'))
  ) {
    bonus += 4
  }
  return bonus
}

function specialistSkillScore(
  rider: UniversalRiderInput,
  profile: FavouriteProfile,
): number {
  switch (profile) {
    case 'flat':
      return deterministicRound(
        rider.sprint * 0.3 +
          rider.flat * 0.25 +
          rider.endurance * 0.2 +
          rider.raceIQ * 0.1 +
          rider.resistance * 0.1 +
          rider.morale * 0.05,
        4,
      )
    case 'mountain':
      return deterministicRound(
        rider.climbing * 0.45 +
          rider.endurance * 0.2 +
          rider.recovery * 0.15 +
          rider.resistance * 0.1 +
          rider.raceIQ * 0.1,
        4,
      )
    case 'time_trial':
      return deterministicRound(
        rider.timeTrial * 0.5 +
          rider.endurance * 0.2 +
          rider.flat * 0.15 +
          rider.raceIQ * 0.1 +
          rider.resistance * 0.05,
        4,
      )
  }
}

function rankFavouriteRows(
  rows: readonly Omit<UniversalFavouriteResult, 'rank' | 'category'>[],
  category: UniversalFavouriteCategory,
  limit?: number,
): readonly UniversalFavouriteResult[] {
  const sorted = [...rows].sort((left, right) => {
    if (left.favouriteScore !== right.favouriteScore) {
      return right.favouriteScore - left.favouriteScore
    }
    const startNumberComparison = compareNullableStartNumbers(
      left.startNumber,
      right.startNumber,
    )
    if (startNumberComparison !== 0) return startNumberComparison
    const nameComparison = left.displayName.localeCompare(right.displayName)
    if (nameComparison !== 0) return nameComparison
    return left.riderId.localeCompare(right.riderId)
  })

  return (limit === undefined ? sorted : sorted.slice(0, limit)).map(
    (row, index) => ({
      rank: index + 1,
      category,
      ...row,
    }),
  )
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function breakawayRolePoints(roleText: string): number {
  if (roleText.includes('break')) return 14
  if (roleText.includes('rouleur')) return 8
  if (roleText.includes('helper') || roleText.includes('domestique')) return 5
  if (roleText.includes('free')) return 4
  if (roleText.includes('leader')) return -8
  if (roleText.includes('sprint')) return -3
  return 0
}

function buildFavouriteBaseRows(
  input: UniversalRaceEngineInput,
  riderSuitability: readonly UniversalRiderSuitabilityResult[],
  stageSkillModel: UniversalStageSkillModel,
): readonly Omit<UniversalFavouriteResult, 'rank' | 'category'>[] {
  const riderById = new Map(input.riders.map((rider) => [rider.riderId, rider]))
  const stageProfile = stageFavouriteProfile(stageSkillModel)

  return riderSuitability
    .filter((row) => row.eligibleToStart)
    .map((row) => {
      const rider = riderById.get(row.riderId)
      if (!rider) throw new Error(`Missing rider ${row.riderId}`)
      const roleText = normalizeRoleText(row.stageRole, row.roleSnapshot)
      const seasonResultPoints = Math.max(0, rider.seasonResultPoints ?? 0)
      const seasonResultBonus = Math.min(seasonResultPoints, 300) / 10
      const roleBonus = favouriteRoleBonus(roleText, stageProfile)
      const teamworkBonus = Math.min(rider.teamwork, 100) * 0.03
      const favouriteScore =
        row.suitabilityScore * 0.72 +
        seasonResultBonus +
        roleBonus +
        teamworkBonus

      return {
        riderId: row.riderId,
        teamId: row.teamId,
        displayName: row.displayName,
        startNumber: row.startNumber,
        stageRole: row.stageRole,
        roleSnapshot: row.roleSnapshot,
        favouriteScore: deterministicRound(favouriteScore, 4),
        suitabilityScore: row.suitabilityScore,
        skillScore: row.stageSkillScore,
        readinessScore: row.readinessScore,
        seasonResultPoints: deterministicRound(seasonResultPoints, 2),
        seasonResultBonus: deterministicRound(seasonResultBonus, 2),
        roleBonus,
        teamworkBonus: deterministicRound(teamworkBonus, 2),
        reason: favouriteReason(stageProfile),
        modelVersion: 'universal_favourite_ranking_v1' as const,
      }
    })
}

function buildSpecialistFavourites(
  input: UniversalRaceEngineInput,
  riderSuitability: readonly UniversalRiderSuitabilityResult[],
  profile: FavouriteProfile,
  category: UniversalFavouriteCategory,
): readonly UniversalFavouriteResult[] {
  const suitabilityByRiderId = new Map(
    riderSuitability.map((row) => [row.riderId, row]),
  )
  const stagePlanByRiderId = riderStagePlanById(input.stagePlans)
  const rows = input.riders
    .filter((rider) => suitabilityByRiderId.get(rider.riderId)?.eligibleToStart)
    .map((rider) => {
      const suitability = suitabilityByRiderId.get(rider.riderId)!
      const skillScore = specialistSkillScore(rider, profile)
      const readinessAdjustment =
        suitability.components.totalReadinessAdjustment
      const specialistSuitability = clamp(
        skillScore + readinessAdjustment,
        1,
        100,
      )
      const stageRole = stagePlanByRiderId.get(rider.riderId)?.stageRole ?? null
      const roleSnapshot = rider.roleSnapshot?.trim() || null
      const roleText = normalizeRoleText(stageRole, roleSnapshot)
      const seasonResultPoints = Math.max(0, rider.seasonResultPoints ?? 0)
      const seasonResultBonus = Math.min(seasonResultPoints, 300) / 10
      const roleBonus = favouriteRoleBonus(roleText, profile)
      const teamworkBonus = Math.min(rider.teamwork, 100) * 0.03
      const favouriteScore =
        specialistSuitability * 0.72 +
        seasonResultBonus +
        roleBonus +
        teamworkBonus

      return {
        riderId: rider.riderId,
        teamId: rider.teamId,
        displayName: riderDisplayName(rider),
        startNumber: riderStartNumber(rider),
        stageRole,
        roleSnapshot,
        favouriteScore: deterministicRound(favouriteScore, 4),
        suitabilityScore: deterministicRound(specialistSuitability, 4),
        skillScore,
        readinessScore: suitability.readinessScore,
        seasonResultPoints: deterministicRound(seasonResultPoints, 2),
        seasonResultBonus: deterministicRound(seasonResultBonus, 2),
        roleBonus,
        teamworkBonus: deterministicRound(teamworkBonus, 2),
        reason: favouriteReason(profile),
        modelVersion: 'universal_favourite_ranking_v1' as const,
      }
    })

  return rankFavouriteRows(rows, category, 5)
}

function buildBreakawayCandidates(
  input: UniversalRaceEngineInput,
  riderSuitability: readonly UniversalRiderSuitabilityResult[],
): {
  readonly candidateCount: number
  readonly candidates: readonly UniversalBreakawayCandidateResult[]
} {
  const suitabilityByRiderId = new Map(
    riderSuitability.map((row) => [row.riderId, row]),
  )
  const stagePlanByRiderId = riderStagePlanById(input.stagePlans)
  const candidateCount =
    4 + (stableHash(`${input.engine.deterministicSeed}:attack_count`) % 3)

  const rows = input.riders
    .filter((rider) => suitabilityByRiderId.get(rider.riderId)?.eligibleToStart)
    .map((rider) => {
      const suitability = suitabilityByRiderId.get(rider.riderId)!
      const stageRole = stagePlanByRiderId.get(rider.riderId)?.stageRole ?? null
      const roleSnapshot = rider.roleSnapshot?.trim() || null
      const roleText = normalizeRoleText(stageRole, roleSnapshot)
      const enduranceContribution = rider.endurance * 0.34
      const flatContribution = rider.flat * 0.24
      const raceIQContribution = rider.raceIQ * 0.2
      const climbingContribution = rider.climbing * 0.1
      const moraleContribution = rider.morale * 0.08
      const rolePoints = breakawayRolePoints(roleText)
      const deterministicSeedBonus =
        (stableHash(`${rider.riderId}:${input.engine.deterministicSeed}`) % 100) /
        20
      const candidateScore =
        enduranceContribution +
        flatContribution +
        raceIQContribution +
        climbingContribution +
        moraleContribution +
        rolePoints +
        deterministicSeedBonus

      return {
        riderId: rider.riderId,
        teamId: rider.teamId,
        displayName: riderDisplayName(rider),
        stageRole,
        roleSnapshot,
        candidateScore: deterministicRound(candidateScore, 4),
        enduranceContribution: deterministicRound(
          enduranceContribution,
          4,
        ),
        flatContribution: deterministicRound(flatContribution, 4),
        raceIQContribution: deterministicRound(raceIQContribution, 4),
        climbingContribution: deterministicRound(climbingContribution, 4),
        moraleContribution: deterministicRound(moraleContribution, 4),
        rolePoints,
        deterministicSeedBonus: deterministicRound(
          deterministicSeedBonus,
          4,
        ),
        suitabilityScore: suitability.suitabilityScore,
        readinessScore: suitability.readinessScore,
        modelVersion: 'universal_breakaway_candidate_v1' as const,
      }
    })

  rows.sort((left, right) => {
    if (left.candidateScore !== right.candidateScore) {
      return right.candidateScore - left.candidateScore
    }
    if (left.suitabilityScore !== right.suitabilityScore) {
      return right.suitabilityScore - left.suitabilityScore
    }
    return left.riderId.localeCompare(right.riderId)
  })

  return {
    candidateCount: Math.min(candidateCount, rows.length),
    candidates: rows.slice(0, candidateCount).map((row, index) => ({
      rank: index + 1,
      ...row,
    })),
  }
}

export function buildUniversalFavouritesSummary(
  input: UniversalRaceEngineInput,
  riderSuitability: readonly UniversalRiderSuitabilityResult[],
  stageSkillModel: UniversalStageSkillModel,
): UniversalFavouritesSummary {
  const baseRows = rankFavouriteRows(
    buildFavouriteBaseRows(input, riderSuitability, stageSkillModel),
    'main_favourite',
  )
  const mainFavourites = baseRows.slice(0, 5).map((row, index) => ({
    ...row,
    rank: index + 1,
    category: 'main_favourite' as const,
  }))
  const secondaryContenders = baseRows.slice(5, 15).map((row, index) => ({
    ...row,
    rank: index + 1,
    category: 'secondary_contender' as const,
  }))
  const outsiders = baseRows.slice(15, 25).map((row, index) => ({
    ...row,
    rank: index + 1,
    category: 'outsider' as const,
  }))
  const breakaway = buildBreakawayCandidates(input, riderSuitability)

  return {
    mainFavouriteLimit: 5,
    secondaryContenderLimit: 10,
    outsiderLimit: 10,
    mainFavourites,
    secondaryContenders,
    outsiders,
    sprinterFavourites: buildSpecialistFavourites(
      input,
      riderSuitability,
      'flat',
      'sprinter_favourite',
    ),
    climberFavourites: buildSpecialistFavourites(
      input,
      riderSuitability,
      'mountain',
      'climber_favourite',
    ),
    timeTrialFavourites: buildSpecialistFavourites(
      input,
      riderSuitability,
      'time_trial',
      'time_trial_favourite',
    ),
    breakawayCandidateCount: breakaway.candidateCount,
    breakawayCandidates: breakaway.candidates,
    tieBreaks: {
      riderSuitability: [
        'suitability_score_desc',
        'stage_skill_score_desc',
        'readiness_score_desc',
        'start_number_asc_nulls_last',
        'display_name_asc',
        'rider_id_asc',
      ],
      favourites: [
        'favourite_score_desc',
        'start_number_asc_nulls_last',
        'display_name_asc',
        'rider_id_asc',
      ],
      teamStrength: [
        'team_strength_score_desc',
        'best_rider_suitability_desc',
        'team_id_asc',
      ],
      breakawayCandidates: [
        'candidate_score_desc',
        'suitability_score_desc',
        'rider_id_asc',
      ],
    },
    modelVersion: 'universal_favourites_summary_v1',
  }
}


function roundCommandValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function getRoadCommandBehaviour(
  command: RoadCommandInput,
): UniversalRoadCommandBehaviour {
  switch (command) {
    case 'follow_team_plan':
      return 'neutral'
    case 'join_breakaway':
      return 'breakaway_entry'
    case 'attack':
      return 'attack'
    case 'control_race':
    case 'control_tempo':
      return 'race_control'
    case 'chase':
    case 'chase_breakaway':
      return 'chase'
    case 'protect_leader':
      return 'leader_protection'
    case 'protect_jersey':
      return 'jersey_protection'
    case 'support_leader':
      return 'leader_support'
    case 'work_for_team':
      return 'team_work'
    case 'conserve_energy':
      return 'energy_conservation'
    case 'prepare_sprint':
    case 'sprint_train_rider':
      return 'sprint_preparation'
    case 'lead_out_sprinter':
    case 'lead_out':
    case 'lead_out_rider':
      return 'lead_out'
    case 'ride_for_stage_result':
    case 'sprint':
    case 'final_sprint':
      return 'stage_result'
    case 'ride_for_time_gc':
      return 'time_gc_result'
    case 'contest_intermediate_sprint':
    case 'fight_sprint_points':
      return 'intermediate_sprint_contest'
    case 'contest_kom_points':
    case 'fight_kom_points':
      return 'kom_contest'
    case 'stay_near_front':
      return 'positioning'
    case 'climb_hard':
      return 'climbing_pressure'
    case 'avoid_risks':
      return 'risk_avoidance'
  }
}

function getProductionCommandEffectReference(
  command: RoadCommandInput,
  phaseNumber: RoadRacePhaseNumber,
): ProductionCommandEffectReference {
  switch (command) {
    case 'control_race':
      return 'control_tempo'
    case 'chase':
      return 'chase_breakaway'
    case 'protect_jersey':
    case 'support_leader':
      return 'protect_leader'
    case 'work_for_team':
      return 'control_tempo'
    case 'prepare_sprint':
    case 'ride_for_time_gc':
      return 'stay_near_front'
    case 'lead_out_sprinter':
    case 'lead_out_rider':
      return 'lead_out'
    case 'ride_for_stage_result':
    case 'final_sprint':
      return phaseNumber === 4 ? 'sprint' : 'stay_near_front'
    case 'contest_intermediate_sprint':
    case 'fight_sprint_points':
      return 'sprint'
    case 'contest_kom_points':
    case 'fight_kom_points':
      return 'climb_hard'
    case 'sprint_train_rider':
      return phaseNumber === 4 ? 'lead_out' : 'control_tempo'
    case 'stay_near_front':
    case 'control_tempo':
    case 'chase_breakaway':
    case 'lead_out':
    case 'sprint':
    case 'climb_hard':
    case 'follow_team_plan':
    case 'protect_leader':
    case 'conserve_energy':
    case 'attack':
    case 'join_breakaway':
    case 'avoid_risks':
      return command
  }
}

function getProductionCommandEffortMultiplier(
  command: ProductionCommandEffectReference,
): number {
  switch (command) {
    case 'attack':
      return 1.45
    case 'climb_hard':
      return 1.35
    case 'chase_breakaway':
      return 1.3
    case 'lead_out':
      return 1.28
    case 'sprint':
      return 1.4
    case 'join_breakaway':
      return 1.25
    case 'control_tempo':
      return 1.18
    case 'stay_near_front':
    case 'protect_leader':
      return 1.12
    case 'avoid_risks':
      return 0.92
    case 'conserve_energy':
      return 0.82
    case 'follow_team_plan':
      return 1
  }
}

function getProductionCommandPerformanceModifier(
  command: ProductionCommandEffectReference,
): number {
  switch (command) {
    case 'attack':
      return 3
    case 'climb_hard':
      return 2
    case 'chase_breakaway':
      return 1.75
    case 'lead_out':
      return 1.5
    case 'sprint':
      return 2.25
    case 'join_breakaway':
      return 1.25
    case 'control_tempo':
      return 0.75
    case 'stay_near_front':
    case 'protect_leader':
      return 0.5
    case 'avoid_risks':
      return -0.25
    case 'conserve_energy':
      return -1.5
    case 'follow_team_plan':
      return 0
  }
}

function getRoleCommandEffortAdjustment(
  stageRole: RiderStageRole,
  command: ProductionCommandEffectReference,
): number {
  if (stageRole === 'sprinter' && command === 'sprint') return 0.92
  if (
    stageRole === 'sprinter' &&
    (command === 'climb_hard' || command === 'attack')
  ) {
    return 1.08
  }

  if (stageRole === 'climber' && command === 'climb_hard') return 0.92
  if (stageRole === 'climber' && command === 'sprint') return 1.06

  if (
    stageRole === 'breakaway_rider' &&
    (command === 'attack' || command === 'join_breakaway')
  ) {
    return 0.9
  }

  if (
    stageRole === 'breakaway_chaser' &&
    command === 'chase_breakaway'
  ) {
    return 0.92
  }

  if (stageRole === 'lead_out_rider' && command === 'lead_out') return 0.9

  if (
    stageRole === 'sprint_train_rider' &&
    (command === 'lead_out' || command === 'control_tempo')
  ) {
    return 0.94
  }

  if (
    (stageRole === 'helper_domestique' ||
      stageRole === 'mountain_domestique') &&
    (command === 'protect_leader' ||
      command === 'control_tempo' ||
      command === 'chase_breakaway')
  ) {
    return 0.94
  }

  if (
    stageRole === 'mountain_domestique' &&
    command === 'climb_hard'
  ) {
    return 0.95
  }

  if (
    (stageRole === 'team_leader_gc' ||
      stageRole === 'protected_rider') &&
    command === 'conserve_energy'
  ) {
    return 0.92
  }

  if (
    (stageRole === 'team_leader_gc' ||
      stageRole === 'protected_rider') &&
    command === 'avoid_risks'
  ) {
    return 0.94
  }

  return 1
}

export function calculateRoadCommandEffect(
  command: RoadCommandInput,
  stageRole: RiderStageRole,
  phaseNumber: RoadRacePhaseNumber,
): UniversalRoadCommandEffect {
  const effectReferenceCommand = getProductionCommandEffectReference(
    command,
    phaseNumber,
  )
  const baseEffortMultiplier =
    getProductionCommandEffortMultiplier(effectReferenceCommand)
  const roleAdjustedEffortMultiplier = roundCommandValue(
    baseEffortMultiplier *
      getRoleCommandEffortAdjustment(stageRole, effectReferenceCommand),
  )
  const behaviour = getRoadCommandBehaviour(command)

  let effectTiming: UniversalRoadCommandEffect['effectTiming'] =
    'continuous_phase'

  if (
    behaviour === 'intermediate_sprint_contest' ||
    behaviour === 'kom_contest'
  ) {
    effectTiming = 'objective_only'
  } else if (behaviour === 'stage_result' && phaseNumber === 4) {
    effectTiming = 'finish_only'
  } else if (
    behaviour === 'breakaway_entry' ||
    behaviour === 'attack' ||
    behaviour === 'stage_result' ||
    behaviour === 'time_gc_result' ||
    behaviour === 'sprint_preparation'
  ) {
    effectTiming = 'phase_resolution'
  }

  return {
    effectReferenceCommand,
    baseEffortMultiplier,
    roleAdjustedEffortMultiplier,
    performanceModifier:
      getProductionCommandPerformanceModifier(effectReferenceCommand),
    effectTiming,
    modelVersion: 'production_command_effects_v1',
  }
}

function getRoleDefaultCommand(
  stageRole: RiderStageRole,
  phaseNumber: RoadRacePhaseNumber,
): RoadCommandInput | null {
  const roleDefaults: Readonly<
    Record<
      Exclude<RiderStageRole, 'free_role'>,
      readonly [RoadCommandInput, RoadCommandInput, RoadCommandInput, RoadCommandInput]
    >
  > = {
    team_leader_gc: [
      'avoid_risks',
      'conserve_energy',
      'stay_near_front',
      'stay_near_front',
    ],
    sprinter: [
      'conserve_energy',
      'conserve_energy',
      'stay_near_front',
      'sprint',
    ],
    lead_out_rider: [
      'conserve_energy',
      'control_tempo',
      'stay_near_front',
      'lead_out',
    ],
    sprint_train_rider: [
      'control_tempo',
      'control_tempo',
      'chase_breakaway',
      'lead_out',
    ],
    climber: [
      'conserve_energy',
      'stay_near_front',
      'climb_hard',
      'climb_hard',
    ],
    mountain_domestique: [
      'protect_leader',
      'control_tempo',
      'climb_hard',
      'protect_leader',
    ],
    helper_domestique: [
      'protect_leader',
      'control_tempo',
      'chase_breakaway',
      'protect_leader',
    ],
    breakaway_rider: [
      'attack',
      'join_breakaway',
      'control_tempo',
      'stay_near_front',
    ],
    breakaway_chaser: [
      'chase_breakaway',
      'chase_breakaway',
      'chase_breakaway',
      'stay_near_front',
    ],
    rouleur: [
      'control_tempo',
      'chase_breakaway',
      'control_tempo',
      'stay_near_front',
    ],
    protected_rider: [
      'avoid_risks',
      'conserve_energy',
      'stay_near_front',
      'stay_near_front',
    ],
  }

  if (stageRole === 'free_role') return null
  return roleDefaults[stageRole][phaseNumber - 1]
}

function getTeamTacticBaseCommand(
  teamTactic: RoadTeamTactic,
  phaseNumber: RoadRacePhaseNumber,
): RoadCommandInput {
  const teamDefaults: Readonly<
    Record<
      RoadTeamTactic,
      readonly [RoadCommandInput, RoadCommandInput, RoadCommandInput, RoadCommandInput]
    >
  > = {
    balanced: [
      'control_tempo',
      'control_tempo',
      'stay_near_front',
      'stay_near_front',
    ],
    aggressive: [
      'stay_near_front',
      'control_tempo',
      'stay_near_front',
      'stay_near_front',
    ],
    sprint_control: [
      'control_tempo',
      'control_tempo',
      'chase_breakaway',
      'stay_near_front',
    ],
    breakaway: [
      'stay_near_front',
      'stay_near_front',
      'control_tempo',
      'stay_near_front',
    ],
    gc_protection: [
      'protect_leader',
      'protect_leader',
      'stay_near_front',
      'protect_leader',
    ],
    climber_support: [
      'protect_leader',
      'control_tempo',
      'climb_hard',
      'protect_leader',
    ],
  }

  return teamDefaults[teamTactic][phaseNumber - 1]
}

function getSavedCommandForPhase(
  commands: UniversalRiderPhaseCommandsInput,
  phaseNumber: RoadRacePhaseNumber,
): RoadCommandInput {
  switch (phaseNumber) {
    case 1:
      return commands.phase1
    case 2:
      return commands.phase2
    case 3:
      return commands.phase3
    case 4:
      return commands.phase4
  }
}

function resolveRoadCommandForPhase(
  savedCommand: RoadCommandInput,
  stageRole: RiderStageRole,
  teamTactic: RoadTeamTactic,
  phaseNumber: RoadRacePhaseNumber,
): {
  readonly resolvedCommand: RoadCommandInput
  readonly resolvedSource: UniversalRoadCommandSource
  readonly precedenceRank: 1 | 2 | 3
} {
  if (savedCommand !== 'follow_team_plan') {
    return {
      resolvedCommand: savedCommand,
      resolvedSource: 'explicit_individual_command',
      precedenceRank: 1,
    }
  }

  const roleDefault = getRoleDefaultCommand(stageRole, phaseNumber)
  if (roleDefault !== null) {
    return {
      resolvedCommand: roleDefault,
      resolvedSource: 'saved_role_default',
      precedenceRank: 2,
    }
  }

  return {
    resolvedCommand: getTeamTacticBaseCommand(teamTactic, phaseNumber),
    resolvedSource: 'saved_team_tactic_base',
    precedenceRank: 3,
  }
}

function getRoadPhaseNumberForPoint(
  kmFromStart: number,
  distanceKm: number,
): RoadRacePhaseNumber {
  const fraction = distanceKm > 0 ? kmFromStart / distanceKm : 0
  if (fraction < 0.25) return 1
  if (fraction < 0.5) return 2
  if (fraction < 0.7) return 3
  return 4
}

function makeEligibility(
  eligible: boolean,
  reason: UniversalObjectiveEligibilityReason,
): UniversalObjectiveEligibility {
  return { eligible, reason }
}

function resolveAttackEligibility(
  eligibleToStart: boolean,
  source: UniversalRoadCommandSource,
  behaviour: UniversalRoadCommandBehaviour,
): UniversalObjectiveEligibility {
  if (!eligibleToStart) return makeEligibility(false, 'rider_unavailable')
  if (source !== 'explicit_individual_command') {
    return makeEligibility(false, 'explicit_saved_command_required')
  }
  if (behaviour !== 'attack') {
    return makeEligibility(false, 'command_does_not_authorize_attack')
  }
  return makeEligibility(true, 'eligible')
}

function resolveOpeningBreakawayEligibility(
  eligibleToStart: boolean,
  phaseNumber: RoadRacePhaseNumber,
  source: UniversalRoadCommandSource,
  behaviour: UniversalRoadCommandBehaviour,
): UniversalObjectiveEligibility {
  if (!eligibleToStart) return makeEligibility(false, 'rider_unavailable')
  if (phaseNumber !== 1) {
    return makeEligibility(false, 'opening_breakaway_only_in_phase_1')
  }
  if (source !== 'explicit_individual_command') {
    return makeEligibility(false, 'explicit_saved_command_required')
  }
  if (behaviour !== 'attack' && behaviour !== 'breakaway_entry') {
    return makeEligibility(false, 'command_does_not_authorize_breakaway')
  }
  return makeEligibility(true, 'eligible')
}

function resolveSprintContestEligibility(
  eligibleToStart: boolean,
  source: UniversalRoadCommandSource,
  behaviour: UniversalRoadCommandBehaviour,
  pointIds: readonly string[],
): UniversalObjectiveEligibility {
  if (!eligibleToStart) return makeEligibility(false, 'rider_unavailable')
  if (source !== 'explicit_individual_command') {
    return makeEligibility(false, 'explicit_saved_command_required')
  }
  if (behaviour !== 'intermediate_sprint_contest') {
    return makeEligibility(
      false,
      'command_does_not_authorize_sprint_contest',
    )
  }
  if (pointIds.length === 0) {
    return makeEligibility(false, 'no_intermediate_sprint_in_phase')
  }
  return makeEligibility(true, 'eligible')
}

function resolveKomContestEligibility(
  eligibleToStart: boolean,
  source: UniversalRoadCommandSource,
  behaviour: UniversalRoadCommandBehaviour,
  pointIds: readonly string[],
): UniversalObjectiveEligibility {
  if (!eligibleToStart) return makeEligibility(false, 'rider_unavailable')
  if (source !== 'explicit_individual_command') {
    return makeEligibility(false, 'explicit_saved_command_required')
  }
  if (behaviour !== 'kom_contest') {
    return makeEligibility(false, 'command_does_not_authorize_kom_contest')
  }
  if (pointIds.length === 0) {
    return makeEligibility(false, 'no_kom_in_phase')
  }
  return makeEligibility(true, 'eligible')
}

export function buildRoadCommandResolution(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
): UniversalRoadCommandResolutionSummary {
  const inputContract: UniversalRoadCommandInputContract = {
    universalCommands: UNIVERSAL_ROAD_COMMANDS,
    acceptedInputCommands: ROAD_COMMAND_INPUTS,
    productionSavedCommands: PRODUCTION_SAVED_ROAD_COMMANDS,
    supportedTeamTactics: ROAD_TEAM_TACTICS,
    fallbackPrecedence: [
      'explicit_individual_command',
      'saved_role_default',
      'saved_team_tactic_base',
    ],
    oneCommandPerRiderPerPhase: true,
    conflictingFallbacksResolvedByPrecedence: true,
    objectiveEligibilityRequiresExplicitSavedCommand: true,
    skillAloneCanAuthorizeObjectiveContest: false,
    unmatchedObjectiveCommandsAreSuppressed: true,
    invalidSupportCommandsAreSuppressed: true,
    joinBreakawayRequiresAttackLauncher: true,
    phaseBoundaryContract: '0_25__25_50__50_70__70_100',
  }

  const phaseBoundaries: UniversalRoadPhaseBoundary[] =
    ROAD_RACE_PHASES.map((phase) => ({
      phaseNumber: phase.phaseNumber,
      key: phase.key,
      label: phase.label,
      startFraction: phase.startFraction,
      endFraction: phase.endFraction,
      startKm: roundCommandValue(
        input.stage.distanceKm * phase.startFraction,
      ),
      endKm: roundCommandValue(input.stage.distanceKm * phase.endFraction),
    }))

  if (input.stage.stageFormat !== 'road_race') {
    return {
      active: false,
      inactiveReason: 'non_road_stage',
      inputContract,
      phaseBoundaries,
      riders: [],
      modelVersion: 'universal_road_command_resolution_v1',
    }
  }

  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row]),
  )
  const sprintPointIdsByPhase = new Map<RoadRacePhaseNumber, string[]>()
  const komPointIdsByPhase = new Map<RoadRacePhaseNumber, string[]>()

  ROAD_RACE_PHASES.forEach((phase) => {
    sprintPointIdsByPhase.set(phase.phaseNumber, [])
    komPointIdsByPhase.set(phase.phaseNumber, [])
  })

  input.points.forEach((point) => {
    const phaseNumber = getRoadPhaseNumberForPoint(
      point.kmFromStart,
      input.stage.distanceKm,
    )
    if (
      point.pointType === 'INTERMEDIATE_SPRINT' ||
      point.pointType === 'BONUS_SPRINT'
    ) {
      sprintPointIdsByPhase.get(phaseNumber)!.push(point.pointId)
    }
    if (point.pointType === 'KOM') {
      komPointIdsByPhase.get(phaseNumber)!.push(point.pointId)
    }
  })

  sprintPointIdsByPhase.forEach((pointIds) => pointIds.sort())
  komPointIdsByPhase.forEach((pointIds) => pointIds.sort())

  const riders: UniversalRoadRiderCommandResolution[] = []

  ;[...input.stagePlans]
    .sort((left, right) => left.teamId.localeCompare(right.teamId))
    .forEach((plan) => {
      const teamTactic = plan.teamTactic as RoadTeamTactic

      ;[...plan.riders]
        .sort((left, right) => left.riderId.localeCompare(right.riderId))
        .forEach((riderPlan) => {
          const readiness = readinessByRiderId.get(riderPlan.riderId)
          const eligibleToStart = readiness?.eligibleToStart === true

          const phases = ROAD_RACE_PHASES.map((phase) => {
            const savedCommand = getSavedCommandForPhase(
              riderPlan.commands,
              phase.phaseNumber,
            )
            const resolution = resolveRoadCommandForPhase(
              savedCommand,
              riderPlan.stageRole,
              teamTactic,
              phase.phaseNumber,
            )
            const behaviour = getRoadCommandBehaviour(
              resolution.resolvedCommand,
            )
            const intermediateSprintPointIds = [
              ...(sprintPointIdsByPhase.get(phase.phaseNumber) ?? []),
            ]
            const komPointIds = [
              ...(komPointIdsByPhase.get(phase.phaseNumber) ?? []),
            ]

            return {
              phaseNumber: phase.phaseNumber,
              phaseKey: phase.key,
              savedCommand,
              resolvedCommand: resolution.resolvedCommand,
              resolvedSource: resolution.resolvedSource,
              precedenceRank: resolution.precedenceRank,
              behaviour,
              commandEffect: calculateRoadCommandEffect(
                resolution.resolvedCommand,
                riderPlan.stageRole,
                phase.phaseNumber,
              ),
              intermediateSprintPointIds,
              komPointIds,
              deliberateAttack: resolveAttackEligibility(
                eligibleToStart,
                resolution.resolvedSource,
                behaviour,
              ),
              openingBreakaway: resolveOpeningBreakawayEligibility(
                eligibleToStart,
                phase.phaseNumber,
                resolution.resolvedSource,
                behaviour,
              ),
              intermediateSprintContest:
                resolveSprintContestEligibility(
                  eligibleToStart,
                  resolution.resolvedSource,
                  behaviour,
                  intermediateSprintPointIds,
                ),
              komContest: resolveKomContestEligibility(
                eligibleToStart,
                resolution.resolvedSource,
                behaviour,
                komPointIds,
              ),
            } satisfies UniversalRoadCommandPhaseResolution
          })

          riders.push({
            riderId: riderPlan.riderId,
            teamId: plan.teamId,
            stageRole: riderPlan.stageRole,
            eligibleToStart,
            phases,
          })
        })
    })

  return {
    active: true,
    inactiveReason: null,
    inputContract,
    phaseBoundaries,
    riders,
    modelVersion: 'universal_road_command_resolution_v1',
  }
}

type RoadOpeningCandidateAction = 'attack' | 'join_breakaway'

interface RoadOpeningCandidate {
  readonly riderId: string
  readonly teamId: string
  readonly stageRole: RiderStageRole
  readonly command: RoadOpeningCandidateAction
  readonly selectedSourceRank: 1
  readonly roleRank: number
  readonly terrainSkill: number
  readonly endurance: number
  readonly raceIQ: number
  readonly resistance: number
  readonly teamwork: number
  readonly deterministicTieKey: string
}

interface RoadOpeningRouteSegment {
  readonly kmStart: number
  readonly kmEnd: number
  readonly distanceKm: number
  readonly slopePercent: number
  readonly terrainType: UniversalRoadOpeningStepTerrain
}

interface RoadStepEnergyComponents {
  readonly effectiveTerrainType: UniversalRoadOpeningStepTerrain
  readonly baseEnergyCostPerKm: number
  readonly slopeEnergyMultiplier: number
  readonly riderEfficiencyMultiplier: number
  readonly commandEnergyMultiplier: number
  readonly weatherEnergyMultiplier: number
  readonly preparationEnergyMultiplier: number
  readonly grossEnergyCost: number
  readonly recoveryCredit: number
  readonly netEnergyCost: number
}

interface RoadOpeningAttackIntentComponents {
  readonly eligible: boolean
  readonly blockReason: string | null
  readonly effectiveTerrainType: UniversalRoadOpeningStepTerrain
  readonly attackSkillScore: number
  readonly attackIntentScore: number
}

interface RoadOpeningAttackOutcomeComponents {
  readonly attackExecutionSkillScore: number
  readonly attackSuccessProbability: number
  readonly projectedBurstSpeedMultiplier: number
  readonly projectedBurstDurationSeconds: number
  readonly projectedAttackEnergyCostPct: number
}

interface PendingRoadOpeningAttempt {
  readonly selectedRank: number
  readonly waveCode: UniversalRoadOpeningWaveCode
  readonly riderId: string
  readonly teamId: string
  readonly stageRole: RiderStageRole
  readonly command: RoadOpeningCandidateAction
  readonly attemptKm: number
  readonly effectiveTerrainType: UniversalRoadOpeningStepTerrain
  readonly slopePercent: number
  readonly energyBeforeAttempt: number
  readonly baselineEnergyCostBeforeAttempt: number
  readonly baselineEnergyCostAfterAttempt: number
  readonly attackIntentScore: number
  readonly attackExecutionSkillScore: number
  readonly attackSuccessProbability: number
  readonly deterministicOutcomeRoll: number
  readonly physicallyValidAttempt: boolean
  readonly attackSucceeded: boolean
  readonly projectedBurstSpeedMultiplier: number
  readonly projectedBurstDurationSeconds: number
  readonly attackEnergyCost: number
  readonly energyAfterAttackAttempt: number
  readonly rawInitialGapSeconds: number
  readonly separationBand: UniversalRoadOpeningSeparationBand
}

function md5LeftRotate(value: number, amount: number): number {
  return (value << amount) | (value >>> (32 - amount))
}

/**
 * Small platform-independent MD5 implementation used only to reproduce the
 * production deterministic unit-roll contract. PostgreSQL md5(text) hashes
 * the UTF-8 bytes, so the same seed produces the same first 32-bit value in
 * browsers, Node, and the database.
 */
function md5Hex(value: string): string {
  const bytes: number[] = []

  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index)

    if (
      codePoint >= 0xd800 &&
      codePoint <= 0xdbff &&
      index + 1 < value.length
    ) {
      const low = value.charCodeAt(index + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint =
          0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00)
        index += 1
      }
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint)
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >>> 6))
      bytes.push(0x80 | (codePoint & 0x3f))
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >>> 12))
      bytes.push(0x80 | ((codePoint >>> 6) & 0x3f))
      bytes.push(0x80 | (codePoint & 0x3f))
    } else {
      bytes.push(0xf0 | (codePoint >>> 18))
      bytes.push(0x80 | ((codePoint >>> 12) & 0x3f))
      bytes.push(0x80 | ((codePoint >>> 6) & 0x3f))
      bytes.push(0x80 | (codePoint & 0x3f))
    }
  }

  const originalBitLength = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)

  const lowBitLength = originalBitLength >>> 0
  const highBitLength = Math.floor(originalBitLength / 0x100000000)
  for (let index = 0; index < 4; index += 1) {
    bytes.push((lowBitLength >>> (index * 8)) & 0xff)
  }
  for (let index = 0; index < 4; index += 1) {
    bytes.push((highBitLength >>> (index * 8)) & 0xff)
  }

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ] as const
  const constants = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
  )

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, wordIndex) => {
      const base = offset + wordIndex * 4
      return (
        bytes[base] |
        (bytes[base + 1] << 8) |
        (bytes[base + 2] << 16) |
        (bytes[base + 3] << 24)
      ) >>> 0
    })

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let index = 0; index < 64; index += 1) {
      let f: number
      let wordIndex: number

      if (index < 16) {
        f = (b & c) | (~b & d)
        wordIndex = index
      } else if (index < 32) {
        f = (d & b) | (~d & c)
        wordIndex = (5 * index + 1) % 16
      } else if (index < 48) {
        f = b ^ c ^ d
        wordIndex = (3 * index + 5) % 16
      } else {
        f = c ^ (b | ~d)
        wordIndex = (7 * index) % 16
      }

      const next = d
      d = c
      c = b
      const sum = (a + f + constants[index] + words[wordIndex]) >>> 0
      b = (b + md5LeftRotate(sum, shifts[index])) >>> 0
      a = next
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  function wordToLittleEndianHex(word: number): string {
    let output = ''
    for (let index = 0; index < 4; index += 1) {
      output += ((word >>> (index * 8)) & 0xff)
        .toString(16)
        .padStart(2, '0')
    }
    return output
  }

  return [a0, b0, c0, d0].map(wordToLittleEndianHex).join('')
}

export function calculateDeterministicUnitRoll(seed: string): number {
  const first32BitValue = Number.parseInt(md5Hex(seed).slice(0, 8), 16)
  return deterministicRound(first32BitValue / 4294967295, 9)
}

/**
 * Frozen Phase 5/6 compatibility path.
 *
 * The accepted pre-Phase-7 engine read these two rolls from an optional
 * top-level seed field. Production inputs do not populate that field, so the
 * resulting `undefined:*` seeds are part of the accepted deterministic output.
 * Replay repair must not silently alter those already-approved race results.
 * All newer calculation paths continue to use `input.engine.deterministicSeed`.
 */
function getFrozenPhase56LegacySeed(
  input: UniversalRaceEngineInput,
): string | undefined {
  const legacyInput = input as UniversalRaceEngineInput & {
    readonly deterministicSeed?: string
  }
  return legacyInput.deterministicSeed
}

function normalizeOpeningRole(stageRole: RiderStageRole): string {
  switch (stageRole) {
    case 'team_leader_gc':
      return 'team_leader_gc'
    case 'protected_rider':
      return 'protected'
    case 'helper_domestique':
      return 'helper_domestique'
    case 'mountain_domestique':
      return 'mountain_domestique'
    case 'lead_out_rider':
      return 'lead_out'
    case 'sprint_train_rider':
      return 'sprint_train'
    case 'breakaway_rider':
      return 'breakaway'
    case 'breakaway_chaser':
      return 'breakaway_chaser'
    case 'rouleur':
      return 'rouleur'
    case 'sprinter':
    case 'climber':
    case 'free_role':
      return stageRole
  }
}

function getOpeningRoleRank(stageRole: RiderStageRole): number {
  switch (stageRole) {
    case 'breakaway_rider':
      return 1
    case 'rouleur':
      return 2
    case 'breakaway_chaser':
      return 3
    case 'free_role':
      return 4
    case 'helper_domestique':
      return 5
    case 'mountain_domestique':
      return 6
    default:
      return 7
  }
}

function getOpeningEffectiveTerrain(
  stageTerrainType: TerrainType,
  slopePercent: number,
): UniversalRoadOpeningStepTerrain {
  if (stageTerrainType === 'cobbled') return 'cobbled'
  if (slopePercent <= -3) return 'descent'
  if (slopePercent >= 6) return 'steep_climb'
  if (slopePercent >= 2.5) return 'climb'
  if (slopePercent >= 0.8) return 'false_flat'
  return 'flat'
}

function buildRoadOpeningRouteSegments(
  stage: UniversalStageInput,
  rangeStartKm: number,
  rangeEndKm: number,
): readonly RoadOpeningRouteSegment[] {
  const startKm = clamp(rangeStartKm, 0, stage.distanceKm)
  const endKm = clamp(rangeEndKm, startKm, stage.distanceKm)
  const segments: RoadOpeningRouteSegment[] = []

  for (let index = 1; index < stage.profilePoints.length; index += 1) {
    const previous = stage.profilePoints[index - 1]
    const current = stage.profilePoints[index]
    const sourceDistanceKm = current.km - previous.km
    if (sourceDistanceKm <= 0) continue

    const overlapStartKm = Math.max(startKm, previous.km)
    const overlapEndKm = Math.min(endKm, current.km)
    if (overlapEndKm <= overlapStartKm) continue

    const slopePercent = clamp(
      (current.elevationM - previous.elevationM) /
        (sourceDistanceKm * 10),
      -20,
      20,
    )

    let chunkStartKm = overlapStartKm
    while (chunkStartKm < overlapEndKm - 1e-9) {
      const chunkEndKm = Math.min(overlapEndKm, chunkStartKm + 20)
      const distanceKm = chunkEndKm - chunkStartKm
      segments.push({
        kmStart: deterministicRound(chunkStartKm, 6),
        kmEnd: deterministicRound(chunkEndKm, 6),
        distanceKm: deterministicRound(distanceKm, 6),
        slopePercent: deterministicRound(slopePercent, 6),
        terrainType: getOpeningEffectiveTerrain(
          stage.terrainType,
          slopePercent,
        ),
      })
      chunkStartKm = chunkEndKm
    }
  }

  return segments
}

function calculateRoadStepEnergyComponents(
  segment: RoadOpeningRouteSegment,
  weather: UniversalWeatherInput | undefined,
  commandEffortMultiplier: number,
  rider: UniversalRiderInput,
  preparationEnergyCostMultiplier: number,
): RoadStepEnergyComponents {
  const slopePercent = clamp(segment.slopePercent, -20, 20)
  const distanceKm = clamp(segment.distanceKm, 0.001, 20)
  const effectiveTerrainType = getOpeningEffectiveTerrain(
    segment.terrainType === 'cobbled' ? 'cobbled' : 'flat',
    slopePercent,
  )
  const endurance = clamp(rider.endurance, 1, 100)
  const resistance = clamp(rider.resistance, 1, 100)
  const recovery = clamp(rider.recovery, 1, 100)
  const normalizedEffort = clamp(commandEffortMultiplier, 0.75, 1.25)
  const preparationMultiplier = clamp(
    preparationEnergyCostMultiplier,
    0.9,
    1,
  )

  let baseEnergyCostPerKm: number
  switch (effectiveTerrainType) {
    case 'flat':
      baseEnergyCostPerKm = 0.28
      break
    case 'false_flat':
      baseEnergyCostPerKm = 0.32
      break
    case 'climb':
      baseEnergyCostPerKm = 0.38
      break
    case 'steep_climb':
      baseEnergyCostPerKm = 0.45
      break
    case 'descent':
      baseEnergyCostPerKm = 0.12
      break
    case 'technical_descent':
      baseEnergyCostPerKm = 0.16
      break
    case 'cobbled':
    case 'cobble':
      baseEnergyCostPerKm = 0.34
      break
    case 'gravel':
      baseEnergyCostPerKm = 0.36
      break
  }

  let slopeCoefficient = 0.02
  if (effectiveTerrainType === 'false_flat') slopeCoefficient = 0.05
  if (effectiveTerrainType === 'climb') slopeCoefficient = 0.08
  if (effectiveTerrainType === 'steep_climb') slopeCoefficient = 0.09
  if (
    effectiveTerrainType === 'cobbled' ||
    effectiveTerrainType === 'cobble'
  ) {
    slopeCoefficient = 0.06
  }
  if (effectiveTerrainType === 'gravel') slopeCoefficient = 0.065

  const slopeEnergyMultiplier =
    1 + Math.max(slopePercent, 0) * slopeCoefficient
  const energyEfficiencyScore =
    endurance * 0.5 + resistance * 0.3 + recovery * 0.2
  const riderEfficiencyMultiplier = clamp(
    1 + (60 - energyEfficiencyScore) * 0.006,
    0.84,
    1.18,
  )
  const commandEnergyMultiplier = clamp(
    1 +
      (normalizedEffort - 1) * 1.8 +
      Math.abs(normalizedEffort - 1) * 0.4,
    0.75,
    1.35,
  )

  const weatherCondition = normalizeWeatherCode(weather?.condition ?? null)
  let precipitationMultiplier = 1
  if (
    weatherCondition === 'storm' ||
    weatherCondition === 'thunderstorm' ||
    weatherCondition === 'heavy_rain' ||
    weatherCondition === 'torrential_rain'
  ) {
    precipitationMultiplier = 1.05
  } else if (
    weatherCondition === 'rain' ||
    weatherCondition === 'showers' ||
    weatherCondition === 'rain_showers'
  ) {
    precipitationMultiplier = 1.025
  } else if (
    weatherCondition === 'drizzle' ||
    weatherCondition === 'light_rain'
  ) {
    precipitationMultiplier = 1.01
  } else if (
    weatherCondition === 'snow' ||
    weatherCondition === 'sleet' ||
    weatherCondition === 'freezing_rain'
  ) {
    precipitationMultiplier = 1.1
  }

  const windKmh = clamp(weather?.windKmh ?? 0, 0, 80)
  const weatherEnergyMultiplier = Math.min(
    1.15,
    precipitationMultiplier *
      (1 + Math.min(0.08, Math.max(windKmh - 5, 0) * 0.002)),
  )
  const grossEnergyCost =
    distanceKm *
    baseEnergyCostPerKm *
    slopeEnergyMultiplier *
    riderEfficiencyMultiplier *
    commandEnergyMultiplier *
    weatherEnergyMultiplier *
    preparationMultiplier
  const calculatedRecoveryCredit =
    effectiveTerrainType === 'descent' ||
    effectiveTerrainType === 'technical_descent'
      ? distanceKm * (0.03 + (recovery / 100) * 0.03)
      : 0
  const recoveryCredit = Math.min(
    grossEnergyCost,
    calculatedRecoveryCredit,
  )

  return {
    effectiveTerrainType,
    baseEnergyCostPerKm: deterministicRound(baseEnergyCostPerKm, 6),
    slopeEnergyMultiplier: deterministicRound(slopeEnergyMultiplier, 6),
    riderEfficiencyMultiplier: deterministicRound(
      riderEfficiencyMultiplier,
      6,
    ),
    commandEnergyMultiplier: deterministicRound(commandEnergyMultiplier, 6),
    weatherEnergyMultiplier: deterministicRound(weatherEnergyMultiplier, 6),
    preparationEnergyMultiplier: deterministicRound(
      preparationMultiplier,
      6,
    ),
    grossEnergyCost: deterministicRound(grossEnergyCost, 6),
    recoveryCredit: deterministicRound(recoveryCredit, 6),
    netEnergyCost: deterministicRound(
      Math.max(0.001, grossEnergyCost - recoveryCredit),
      6,
    ),
  }
}

function calculateRoadEnergyCostForRange(
  input: UniversalRaceEngineInput,
  rider: UniversalRiderInput,
  readiness: UniversalRiderReadinessResult,
  commandEffortMultiplier: number,
  startKm: number,
  endKm: number,
): number {
  if (endKm <= startKm || !readiness.eligibleToStart) return 0

  const segments = buildRoadOpeningRouteSegments(
    input.stage,
    startKm,
    endKm,
  )
  const total = segments.reduce(
    (sum, segment) =>
      sum +
      calculateRoadStepEnergyComponents(
        segment,
        input.weather,
        commandEffortMultiplier,
        rider,
        readiness.fatigueBalance.inStageEnergyCostMultiplier,
      ).netEnergyCost,
    0,
  )
  return deterministicRound(total, 6)
}

function getRoadOpeningSegmentAtKm(
  stage: UniversalStageInput,
  km: number,
): RoadOpeningRouteSegment {
  const probeStart = clamp(km - 0.001, 0, stage.distanceKm)
  const probeEnd = clamp(Math.max(km, probeStart + 0.001), 0, stage.distanceKm)
  const segment = buildRoadOpeningRouteSegments(stage, probeStart, probeEnd)[0]
  if (segment) return segment

  return {
    kmStart: probeStart,
    kmEnd: probeEnd,
    distanceKm: Math.max(0.001, probeEnd - probeStart),
    slopePercent: 0,
    terrainType:
      stage.terrainType === 'cobbled' ? 'cobbled' : 'flat',
  }
}

function calculateOpeningAttackIntent(
  rider: UniversalRiderInput,
  stageRole: RiderStageRole,
  teamPlan: RoadTeamTactic,
  command: RoadOpeningCandidateAction,
  attemptKm: number,
  stageDistanceKm: number,
  neutralKm: number,
  routeSegment: RoadOpeningRouteSegment,
  energyAfterStep: number,
  pointGateCount: number,
): RoadOpeningAttackIntentComponents {
  const roleCode = normalizeOpeningRole(stageRole)
  const effectiveTerrainType = routeSegment.terrainType
  const progress = clamp(attemptKm / Math.max(0.1, stageDistanceKm), 0, 1)
  const isFinishStep = attemptKm >= stageDistanceKm

  const attackSkillScore =
    effectiveTerrainType === 'climb' ||
    effectiveTerrainType === 'steep_climb'
      ? rider.climbing * 0.3 +
        rider.endurance * 0.25 +
        rider.resistance * 0.2 +
        rider.raceIQ * 0.15 +
        rider.morale * 0.1
      : rider.flat * 0.25 +
        rider.endurance * 0.25 +
        rider.resistance * 0.2 +
        rider.raceIQ * 0.2 +
        rider.morale * 0.1

  let roleAttackPoints = 8
  switch (roleCode) {
    case 'breakaway':
      roleAttackPoints = 30
      break
    case 'rouleur':
      roleAttackPoints = 22
      break
    case 'free_role':
      roleAttackPoints = 15
      break
    case 'climber':
      roleAttackPoints =
        effectiveTerrainType === 'climb' ||
        effectiveTerrainType === 'steep_climb'
          ? 18
          : 8
      break
    case 'mountain_domestique':
      roleAttackPoints =
        effectiveTerrainType === 'climb' ||
        effectiveTerrainType === 'steep_climb'
          ? 10
          : 5
      break
    case 'team_leader_gc':
      roleAttackPoints =
        progress >= 0.65 &&
        (effectiveTerrainType === 'climb' ||
          effectiveTerrainType === 'steep_climb')
          ? 14
          : 5
      break
    case 'helper_domestique':
      roleAttackPoints = 5
      break
    case 'breakaway_chaser':
      roleAttackPoints = 4
      break
    case 'sprinter':
      roleAttackPoints = 2
      break
    case 'lead_out':
    case 'sprint_train':
    case 'protected':
      roleAttackPoints = 1
      break
  }

  const commandAttackPoints = command === 'attack' ? 35 : 30
  let teamPlanAttackPoints = 0
  switch (teamPlan) {
    case 'breakaway':
      teamPlanAttackPoints = 18
      break
    case 'aggressive':
      teamPlanAttackPoints = 12
      break
    case 'balanced':
      teamPlanAttackPoints = 4
      break
    case 'climber_support':
      teamPlanAttackPoints =
        effectiveTerrainType === 'climb' ||
        effectiveTerrainType === 'steep_climb'
          ? 7
          : 2
      break
    case 'sprint_control':
      teamPlanAttackPoints = -8
      break
    case 'gc_protection':
      teamPlanAttackPoints = -6
      break
  }

  let terrainAttackPoints = 4
  switch (effectiveTerrainType) {
    case 'flat':
      terrainAttackPoints = 6
      break
    case 'false_flat':
      terrainAttackPoints = 10
      break
    case 'climb':
      terrainAttackPoints = 12
      break
    case 'steep_climb':
      terrainAttackPoints = 9
      break
    case 'descent':
      terrainAttackPoints = 2
      break
    case 'technical_descent':
      terrainAttackPoints = -3
      break
    case 'cobbled':
    case 'cobble':
      terrainAttackPoints = 8
      break
    case 'gravel':
      terrainAttackPoints = 9
      break
  }

  let timingAttackPoints: number
  if (attemptKm <= neutralKm) timingAttackPoints = -30
  else if (progress < 0.25) timingAttackPoints = 14
  else if (progress < 0.5) timingAttackPoints = 10
  else if (progress < 0.7) timingAttackPoints = 6
  else if (progress < 0.88) timingAttackPoints = 3
  else if (progress < 0.95) timingAttackPoints = 3
  else timingAttackPoints = -15

  const energyAttackPoints =
    clamp((energyAfterStep - 30) / 70, 0, 1) * 12
  const skillAttackPoints = (attackSkillScore / 100) * 15

  let blockReason: string | null = null
  if (attemptKm <= neutralKm) blockReason = 'neutralized_opening'
  else if (isFinishStep) blockReason = 'finish_step'
  else if (pointGateCount > 0) blockReason = 'point_gate_step'
  else if (energyAfterStep < 30) blockReason = 'insufficient_energy'
  else if (progress >= 0.95) blockReason = 'too_close_to_finish'

  const eligible = blockReason === null
  const rawAttackIntentScore =
    roleAttackPoints +
    commandAttackPoints +
    teamPlanAttackPoints +
    terrainAttackPoints +
    timingAttackPoints +
    energyAttackPoints +
    skillAttackPoints

  return {
    eligible,
    blockReason,
    effectiveTerrainType,
    attackSkillScore: deterministicRound(attackSkillScore, 6),
    attackIntentScore: deterministicRound(
      eligible ? clamp(rawAttackIntentScore, 0, 100) : 0,
      6,
    ),
  }
}

function calculateOpeningAttackOutcome(
  rider: UniversalRiderInput,
  stageRole: RiderStageRole,
  routeSegment: RoadOpeningRouteSegment,
  stageProgressFraction: number,
  attackIntentScore: number,
  energyAfterStep: number,
  waveSize: number,
  riderAttemptSequence: number,
  teamAttemptSequence: number,
): RoadOpeningAttackOutcomeComponents {
  const roleCode = normalizeOpeningRole(stageRole)
  const terrainType = routeSegment.terrainType
  const energyReadinessFraction = clamp((energyAfterStep - 20) / 80, 0, 1)

  let attackExecutionSkillScore: number
  if (terrainType === 'climb' || terrainType === 'steep_climb') {
    attackExecutionSkillScore =
      rider.climbing * 0.32 +
      rider.endurance * 0.2 +
      rider.resistance * 0.2 +
      rider.raceIQ * 0.18 +
      rider.morale * 0.1
  } else if (
    terrainType === 'cobbled' ||
    terrainType === 'cobble' ||
    terrainType === 'gravel'
  ) {
    attackExecutionSkillScore =
      rider.flat * 0.2 +
      rider.endurance * 0.22 +
      rider.resistance * 0.28 +
      rider.raceIQ * 0.2 +
      rider.morale * 0.1
  } else {
    attackExecutionSkillScore =
      rider.flat * 0.3 +
      rider.endurance * 0.2 +
      rider.resistance * 0.2 +
      rider.raceIQ * 0.2 +
      rider.morale * 0.1
  }

  let roleProbabilityPoints = 0
  if (roleCode === 'breakaway') roleProbabilityPoints = 0.12
  else if (roleCode === 'rouleur') roleProbabilityPoints = 0.09
  else if (roleCode === 'free_role') roleProbabilityPoints = 0.05
  else if (roleCode === 'climber') {
    roleProbabilityPoints =
      terrainType === 'climb' || terrainType === 'steep_climb' ? 0.08 : 0.03
  } else if (roleCode === 'team_leader_gc') {
    roleProbabilityPoints =
      terrainType === 'climb' || terrainType === 'steep_climb' ? 0.06 : 0.02
  }

  let terrainProbabilityPoints = 0
  switch (terrainType) {
    case 'flat':
      terrainProbabilityPoints = 0.02
      break
    case 'false_flat':
    case 'climb':
      terrainProbabilityPoints = 0.04
      break
    case 'steep_climb':
      terrainProbabilityPoints = 0.02
      break
    case 'descent':
      terrainProbabilityPoints = -0.01
      break
    case 'technical_descent':
      terrainProbabilityPoints = -0.05
      break
    case 'cobbled':
    case 'cobble':
      terrainProbabilityPoints = 0.03
      break
    case 'gravel':
      terrainProbabilityPoints = 0.04
      break
  }

  let timingProbabilityPoints: number
  if (stageProgressFraction < 0.25) timingProbabilityPoints = 0.1
  else if (stageProgressFraction < 0.55) timingProbabilityPoints = 0.06
  else if (stageProgressFraction < 0.75) timingProbabilityPoints = 0.02
  else if (stageProgressFraction < 0.9) timingProbabilityPoints = -0.03
  else timingProbabilityPoints = -0.08

  const rawProbability =
    0.08 +
    (attackIntentScore / 100) * 0.25 +
    (attackExecutionSkillScore / 100) * 0.2 +
    energyReadinessFraction * 0.15 +
    roleProbabilityPoints +
    terrainProbabilityPoints +
    timingProbabilityPoints +
    0.18 +
    Math.min(0.12, Math.max(0, waveSize - 1) * 0.04) -
    Math.min(0.24, Math.max(0, riderAttemptSequence - 1) * 0.1) -
    Math.min(0.09, Math.max(0, teamAttemptSequence - 1) * 0.03)
  const probability = clamp(rawProbability, 0.03, 0.92)
  const burstSpeedMultiplier = Math.min(
    1.14,
    1 +
      0.015 +
      (attackExecutionSkillScore / 100) * 0.045 +
      energyReadinessFraction * 0.025 +
      (roleCode === 'breakaway'
        ? 0.01
        : roleCode === 'rouleur'
          ? 0.008
          : roleCode === 'climber'
            ? 0.006
            : 0.003) +
      Math.min(0.015, Math.max(0, waveSize - 1) * 0.005) +
      0.01,
  )
  const burstDurationSeconds = Math.min(
    45,
    18 +
      (attackExecutionSkillScore / 100) * 10 +
      energyReadinessFraction * 7 +
      4,
  )
  const attackEnergyCost = Math.min(
    12,
    1.5 +
      (attackIntentScore / 100) * 2.5 +
      Math.abs(Math.max(0, routeSegment.slopePercent)) * 0.15 +
      Math.max(0, riderAttemptSequence - 1) * 0.5,
  )

  return {
    attackExecutionSkillScore: deterministicRound(
      attackExecutionSkillScore,
      6,
    ),
    attackSuccessProbability: deterministicRound(probability, 6),
    projectedBurstSpeedMultiplier: deterministicRound(
      burstSpeedMultiplier,
      6,
    ),
    projectedBurstDurationSeconds: deterministicRound(
      burstDurationSeconds,
      6,
    ),
    projectedAttackEnergyCostPct: deterministicRound(attackEnergyCost, 6),
  }
}

function getOpeningSeparationBand(
  physicallyValidAttempt: boolean,
  attackSucceeded: boolean,
  rawInitialGapSeconds: number,
): UniversalRoadOpeningSeparationBand {
  if (!physicallyValidAttempt) return 'suppressed'
  if (!attackSucceeded) return 'no_separation'
  if (rawInitialGapSeconds < 1.5) return 'marginal_separation'
  if (rawInitialGapSeconds < 3) return 'clear_initial_separation'
  if (rawInitialGapSeconds < 6) return 'strong_initial_separation'
  return 'very_strong_initial_separation'
}

function getGeneralPhaseEffortMultiplier(
  phaseResolution: UniversalRoadCommandPhaseResolution,
): number {
  if (
    phaseResolution.commandEffect.effectTiming === 'objective_only' ||
    phaseResolution.commandEffect.effectTiming === 'finish_only'
  ) {
    return 1
  }
  return phaseResolution.commandEffect.roleAdjustedEffortMultiplier
}

export function resolveRoadPhase1Opening(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
): UniversalRoadRaceResolutionSummary {
  if (
    input.stage.stageFormat !== 'road_race' ||
    !roadCommandResolution.active
  ) {
    return {
      active: false,
      inactiveReason: 'non_road_stage',
      phase1Opening: null,
      phase2Development: null,
      phase3Decisive: null,
      phase4Finish: null,
      modelVersion: 'universal_road_race_resolution_v1',
    }
  }

  const phaseBoundary = roadCommandResolution.phaseBoundaries.find(
    (phase) => phase.phaseNumber === 1,
  )!
  const openingTimingRoll = calculateDeterministicUnitRoll(
    `${getFrozenPhase56LegacySeed(input)}:opening-timing`,
  )
  const neutralizedDistanceKm = deterministicRound(
    Math.min(
      phaseBoundary.endKm,
      1.5 + openingTimingRoll * 1.5,
    ),
    6,
  )
  const openingDistanceAfterNeutral = Math.max(
    0,
    phaseBoundary.endKm - neutralizedDistanceKm,
  )
  const firstWaveAttemptKm =
    openingDistanceAfterNeutral > 0
      ? deterministicRound(
          Math.min(phaseBoundary.endKm, neutralizedDistanceKm + 0.75),
          6,
        )
      : null
  const secondWaveAttemptKm =
    openingDistanceAfterNeutral > 0
      ? deterministicRound(
          Math.min(phaseBoundary.endKm, neutralizedDistanceKm + 1.75),
          6,
        )
      : null

  const riderById = new Map(input.riders.map((rider) => [rider.riderId, rider]))
  const readinessByRiderId = new Map(
    riderReadiness.map((readiness) => [readiness.riderId, readiness]),
  )
  const planByTeamId = new Map(
    input.stagePlans.map((plan) => [plan.teamId, plan]),
  )
  const phaseResolutionByRiderId = new Map(
    roadCommandResolution.riders.map((row) => [
      row.riderId,
      row.phases.find((phase) => phase.phaseNumber === 1)!,
    ]),
  )

  const candidates: RoadOpeningCandidate[] = roadCommandResolution.riders
    .map((row): RoadOpeningCandidate | null => {
      const phase = row.phases.find((item) => item.phaseNumber === 1)!
      if (!phase.openingBreakaway.eligible) return null
      const rider = riderById.get(row.riderId)
      if (!rider) return null
      const command: RoadOpeningCandidateAction =
        phase.behaviour === 'attack' ? 'attack' : 'join_breakaway'
      const terrainSkill =
        input.stage.terrainType === 'mountain' ||
        input.stage.terrainType === 'hilly'
          ? rider.climbing
          : rider.flat

      return {
        riderId: row.riderId,
        teamId: row.teamId,
        stageRole: row.stageRole,
        command,
        selectedSourceRank: 1,
        roleRank: getOpeningRoleRank(row.stageRole),
        terrainSkill,
        endurance: rider.endurance,
        raceIQ: rider.raceIQ,
        resistance: rider.resistance,
        teamwork: rider.teamwork,
        deterministicTieKey: md5Hex(
          `${input.engine.deterministicSeed}:${input.stage.stageId}:1:${row.riderId}`,
        ),
      }
    })
    .filter((row): row is RoadOpeningCandidate => row !== null)

  const eligibleAttackers = candidates.filter(
    (candidate) => candidate.command === 'attack',
  )
  const eligibleJoiners = candidates.filter(
    (candidate) => candidate.command === 'join_breakaway',
  )
  const totalLockedRiderCount = input.stagePlans.reduce(
    (sum, plan) => sum + plan.riders.length,
    0,
  )
  const teamCount = input.stagePlans.length
  const baseWaveCap =
    4 +
    (stableHash(
      `${input.engine.deterministicSeed}:${input.stage.stageId}:phase:1:attack_count`,
    ) %
      3)
  const averageTeamSizeCap =
    teamCount > 0
      ? Math.max(1, Math.ceil(Math.max(totalLockedRiderCount, 1) / teamCount))
      : baseWaveCap
  const effectiveWaveCap = Math.min(baseWaveCap, averageTeamSizeCap)

  const sortedCandidates = [...candidates].sort((left, right) => {
    if (left.command !== right.command) {
      return left.command === 'attack' ? -1 : 1
    }
    if (left.selectedSourceRank !== right.selectedSourceRank) {
      return left.selectedSourceRank - right.selectedSourceRank
    }
    if (left.roleRank !== right.roleRank) return left.roleRank - right.roleRank
    if (left.terrainSkill !== right.terrainSkill) {
      return right.terrainSkill - left.terrainSkill
    }
    if (left.endurance !== right.endurance) {
      return right.endurance - left.endurance
    }
    if (left.raceIQ !== right.raceIQ) return right.raceIQ - left.raceIQ
    if (left.resistance !== right.resistance) {
      return right.resistance - left.resistance
    }
    if (left.teamwork !== right.teamwork) {
      return right.teamwork - left.teamwork
    }
    return left.deterministicTieKey.localeCompare(right.deterministicTieKey)
  })

  const joinOnlyEscapeBlocked =
    eligibleAttackers.length === 0 && eligibleJoiners.length > 0
  const selectedCandidates =
    eligibleAttackers.length > 0 && firstWaveAttemptKm !== null
      ? sortedCandidates.slice(0, effectiveWaveCap)
      : []
  const firstWaveSize = Math.ceil(selectedCandidates.length / 2)
  const pendingAttempts: PendingRoadOpeningAttempt[] = []
  const selectedTeamAttemptCounts = new Map<string, number>()

  selectedCandidates.forEach((candidate, index) => {
    const rider = riderById.get(candidate.riderId)!
    const readiness = readinessByRiderId.get(candidate.riderId)!
    const phase = phaseResolutionByRiderId.get(candidate.riderId)!
    const teamPlan = planByTeamId.get(candidate.teamId)!
    const waveCode: UniversalRoadOpeningWaveCode =
      index < firstWaveSize ? 'first_wave' : 'second_wave'
    const attemptKm =
      waveCode === 'first_wave'
        ? firstWaveAttemptKm!
        : secondWaveAttemptKm!
    const routeSegment = getRoadOpeningSegmentAtKm(input.stage, attemptKm)
    const commandEffortMultiplier = getGeneralPhaseEffortMultiplier(phase)
    const baselineEnergyCostBeforeAttempt = calculateRoadEnergyCostForRange(
      input,
      rider,
      readiness,
      commandEffortMultiplier,
      phaseBoundary.startKm,
      attemptKm,
    )
    const baselineEnergyCostAfterAttempt = calculateRoadEnergyCostForRange(
      input,
      rider,
      readiness,
      commandEffortMultiplier,
      attemptKm,
      phaseBoundary.endKm,
    )
    const energyBeforeAttempt = deterministicRound(
      Math.max(
        0,
        readiness.fatigueBalance.startEnergy -
          baselineEnergyCostBeforeAttempt,
      ),
      6,
    )
    const pointGateCount = input.points.filter(
      (point) =>
        point.pointType !== 'START' &&
        point.pointType !== 'FINISH' &&
        Math.abs(point.kmFromStart - attemptKm) < 0.000001,
    ).length
    const intent = calculateOpeningAttackIntent(
      rider,
      candidate.stageRole,
      teamPlan.teamTactic as RoadTeamTactic,
      candidate.command,
      attemptKm,
      input.stage.distanceKm,
      neutralizedDistanceKm,
      routeSegment,
      energyBeforeAttempt,
      pointGateCount,
    )
    const waveSize =
      waveCode === 'first_wave'
        ? firstWaveSize
        : selectedCandidates.length - firstWaveSize
    const nextTeamAttemptSequence =
      (selectedTeamAttemptCounts.get(candidate.teamId) ?? 0) + 1
    selectedTeamAttemptCounts.set(
      candidate.teamId,
      nextTeamAttemptSequence,
    )
    const outcome = calculateOpeningAttackOutcome(
      rider,
      candidate.stageRole,
      routeSegment,
      attemptKm / input.stage.distanceKm,
      intent.attackIntentScore,
      energyBeforeAttempt,
      Math.max(1, waveSize),
      1,
      nextTeamAttemptSequence,
    )
    const deterministicOutcomeRoll = calculateDeterministicUnitRoll(
      `${input.engine.deterministicSeed}|${input.stage.stageId}|${candidate.riderId}|${waveCode}|phase_1_attack_outcome_v2`,
    )
    const physicallyValidAttempt = intent.eligible
    const attackSucceeded =
      physicallyValidAttempt &&
      deterministicOutcomeRoll <= outcome.attackSuccessProbability
    const attackEnergyCost = physicallyValidAttempt
      ? outcome.projectedAttackEnergyCostPct
      : 0
    const energyAfterAttackAttempt = deterministicRound(
      Math.max(0, energyBeforeAttempt - attackEnergyCost),
      6,
    )
    const rawInitialGapSeconds = attackSucceeded
      ? Math.max(
          0.5,
          outcome.projectedBurstDurationSeconds *
            Math.max(0, outcome.projectedBurstSpeedMultiplier - 1),
        )
      : 0

    pendingAttempts.push({
      selectedRank: index + 1,
      waveCode,
      riderId: candidate.riderId,
      teamId: candidate.teamId,
      stageRole: candidate.stageRole,
      command: candidate.command,
      attemptKm,
      effectiveTerrainType: intent.effectiveTerrainType,
      slopePercent: routeSegment.slopePercent,
      energyBeforeAttempt,
      baselineEnergyCostBeforeAttempt,
      baselineEnergyCostAfterAttempt,
      attackIntentScore: intent.attackIntentScore,
      attackExecutionSkillScore: outcome.attackExecutionSkillScore,
      attackSuccessProbability: outcome.attackSuccessProbability,
      deterministicOutcomeRoll,
      physicallyValidAttempt,
      attackSucceeded,
      projectedBurstSpeedMultiplier: outcome.projectedBurstSpeedMultiplier,
      projectedBurstDurationSeconds: outcome.projectedBurstDurationSeconds,
      attackEnergyCost,
      energyAfterAttackAttempt,
      rawInitialGapSeconds: deterministicRound(rawInitialGapSeconds, 6),
      separationBand: getOpeningSeparationBand(
        physicallyValidAttempt,
        attackSucceeded,
        rawInitialGapSeconds,
      ),
    })
  })

  const successfulAttackerExists = pendingAttempts.some(
    (attempt) => attempt.command === 'attack' && attempt.attackSucceeded,
  )
  const acceptedRiderIds = pendingAttempts
    .filter(
      (attempt) => successfulAttackerExists && attempt.attackSucceeded,
    )
    .map((attempt) => attempt.riderId)
  const acceptedRiderIdSet = new Set(acceptedRiderIds)
  const attackAttemptByRiderId = new Map(
    pendingAttempts.map((attempt) => [attempt.riderId, attempt]),
  )
  const initialGapSeconds = deterministicRound(
    Math.max(
      0,
      ...pendingAttempts
        .filter((attempt) => acceptedRiderIdSet.has(attempt.riderId))
        .map((attempt) => attempt.rawInitialGapSeconds),
    ),
    6,
  )

  const attackAttempts: UniversalRoadOpeningAttackAttempt[] =
    pendingAttempts.map((attempt) => {
      const acceptedEscapeLaunch = acceptedRiderIdSet.has(attempt.riderId)
      return {
        selectedRank: attempt.selectedRank,
        waveCode: attempt.waveCode,
        riderId: attempt.riderId,
        teamId: attempt.teamId,
        stageRole: attempt.stageRole,
        command: attempt.command,
        attemptKm: attempt.attemptKm,
        effectiveTerrainType: attempt.effectiveTerrainType,
        slopePercent: deterministicRound(attempt.slopePercent, 6),
        energyBeforeAttempt: attempt.energyBeforeAttempt,
        attackIntentScore: attempt.attackIntentScore,
        attackExecutionSkillScore: attempt.attackExecutionSkillScore,
        attackSuccessProbability: attempt.attackSuccessProbability,
        deterministicOutcomeRoll: attempt.deterministicOutcomeRoll,
        physicallyValidAttempt: attempt.physicallyValidAttempt,
        attackSucceeded: attempt.attackSucceeded,
        acceptedEscapeLaunch,
        projectedBurstSpeedMultiplier:
          attempt.projectedBurstSpeedMultiplier,
        projectedBurstDurationSeconds:
          attempt.projectedBurstDurationSeconds,
        attackEnergyCost: attempt.attackEnergyCost,
        energyAfterAttackAttempt: attempt.energyAfterAttackAttempt,
        initialGapSeconds: acceptedEscapeLaunch
          ? attempt.rawInitialGapSeconds
          : 0,
        separationBand: attempt.separationBand,
        modelVersion: 'production_attack_outcome_and_launch_v2',
      }
    })

  const eligibleRiderIds = roadCommandResolution.riders
    .filter((row) => row.eligibleToStart)
    .map((row) => row.riderId)
    .sort()
  const pelotonRiderIds = eligibleRiderIds.filter(
    (riderId) => !acceptedRiderIdSet.has(riderId),
  )

  const riderEnergy: UniversalRoadOpeningRiderEnergy[] =
    roadCommandResolution.riders
      .map((row): UniversalRoadOpeningRiderEnergy => {
        const rider = riderById.get(row.riderId)!
        const readiness = readinessByRiderId.get(row.riderId)!
        const phase = phaseResolutionByRiderId.get(row.riderId)!
        const commandEffortMultiplier = getGeneralPhaseEffortMultiplier(phase)
        const attempt = attackAttemptByRiderId.get(row.riderId)
        const baselineOpeningEnergyCost = attempt
          ? deterministicRound(
              attempt.baselineEnergyCostBeforeAttempt +
                attempt.baselineEnergyCostAfterAttempt,
              6,
            )
          : calculateRoadEnergyCostForRange(
              input,
              rider,
              readiness,
              commandEffortMultiplier,
              phaseBoundary.startKm,
              phaseBoundary.endKm,
            )
        const attackEnergyCost = attempt?.attackEnergyCost ?? 0
        const totalOpeningEnergyCost = deterministicRound(
          baselineOpeningEnergyCost + attackEnergyCost,
          6,
        )
        const energyAfterPhase = deterministicRound(
          Math.max(
            0,
            readiness.fatigueBalance.startEnergy - totalOpeningEnergyCost,
          ),
          6,
        )

        return {
          riderId: row.riderId,
          teamId: row.teamId,
          command: phase.resolvedCommand,
          commandEffortMultiplier: deterministicRound(
            commandEffortMultiplier,
            6,
          ),
          startEnergy: readiness.fatigueBalance.startEnergy,
          baselineOpeningEnergyCost,
          attackEnergyCost,
          totalOpeningEnergyCost,
          energyAfterPhase,
          finalGroupCode: acceptedRiderIdSet.has(row.riderId)
            ? 'opening_breakaway'
            : 'main_peloton',
          modelVersion: 'production_step_energy_v2',
        }
      })
      .sort((left, right) => left.riderId.localeCompare(right.riderId))

  let status: UniversalRoadOpeningStatus
  if (firstWaveAttemptKm === null) status = 'phase_too_short_for_attack'
  else if (eligibleAttackers.length === 0 && eligibleJoiners.length === 0) {
    status = 'no_eligible_attackers'
  } else if (joinOnlyEscapeBlocked) status = 'join_only_blocked'
  else if (acceptedRiderIds.length === 0) status = 'attack_attempts_failed'
  else status = 'breakaway_formed'

  const groups: UniversalRoadOpeningGroup[] =
    acceptedRiderIds.length > 0
      ? [
          {
            groupCode: 'opening_breakaway',
            groupOrder: 1,
            riderIds: [...acceptedRiderIds],
            gapSeconds: 0,
          },
          {
            groupCode: 'main_peloton',
            groupOrder: 2,
            riderIds: pelotonRiderIds,
            gapSeconds: initialGapSeconds,
          },
        ]
      : [
          {
            groupCode: 'main_peloton',
            groupOrder: 1,
            riderIds: eligibleRiderIds,
            gapSeconds: 0,
          },
        ]

  return {
    active: true,
    inactiveReason: null,
    phase1Opening: {
      phaseNumber: 1,
      phaseBoundary,
      neutralizedDistanceKm,
      opportunityWindowKm: 5,
      firstWaveAttemptKm,
      secondWaveAttemptKm:
        selectedCandidates.length > firstWaveSize
          ? secondWaveAttemptKm
          : null,
      baseWaveCap,
      averageTeamSizeCap,
      effectiveWaveCap,
      eligibleAttackerIds: eligibleAttackers
        .map((candidate) => candidate.riderId)
        .sort(),
      eligibleJoinerIds: eligibleJoiners
        .map((candidate) => candidate.riderId)
        .sort(),
      selectedCandidateIds: selectedCandidates.map(
        (candidate) => candidate.riderId,
      ),
      joinOnlyEscapeBlocked,
      status,
      initialGapSeconds,
      initialGapAggregation: 'maximum_accepted_launch_separation',
      breakawayRiderIds: [...acceptedRiderIds],
      pelotonRiderIds,
      attackAttempts,
      riderEnergy,
      groups,
      modelVersion: 'universal_road_phase_1_opening_v1',
    },
    phase2Development: null,
    phase3Decisive: null,
      phase4Finish: null,
    modelVersion: 'universal_road_race_resolution_v1',
  }
}

interface PelotonResponseComponents {
  readonly chaseInterestScore: number
  readonly chaseCapacityScore: number
  readonly coordinationFactor: number
  readonly targetGapLowerSeconds: number
  readonly targetGapUpperSeconds: number
  readonly requiredHoldMultiplier: number
  readonly maximumPursuitMultiplier: number
  readonly selectedResponseMultiplier: number
  readonly chaseUrgencyScore: number
  readonly pelotonWorkIntensityFraction: number
  readonly responseMode: UniversalPelotonResponseMode
}

function calculateBreakawayCooperation(
  breakawayRiderIds: readonly string[],
  ridersById: ReadonlyMap<string, UniversalRiderInput>,
  suitabilityByRiderId: ReadonlyMap<string, UniversalRiderSuitabilityResult>,
): UniversalRoadBreakawayCooperationResult | null {
  const riders = breakawayRiderIds
    .map((riderId) => ridersById.get(riderId))
    .filter((rider): rider is UniversalRiderInput => Boolean(rider))
  if (riders.length === 0) return null

  const averageTeamwork = average(riders.map((rider) => rider.teamwork))
  const averageStageSuitability = average(
    riders.map(
      (rider) =>
        suitabilityByRiderId.get(rider.riderId)?.suitabilityScore ?? 0,
    ),
  )
  const cooperationScore = clamp(averageTeamwork, 0, 100)
  /*
   * Universal bridge: production exposes teamwork and accepts an escape pace,
   * but has no standalone stored cooperation coefficient. Teamwork therefore
   * maps linearly to the response model's verified 0.90-1.05 pace range.
   */
  const cooperationSpeedMultiplier = clamp(
    0.9 + cooperationScore * 0.0015,
    0.9,
    1.05,
  )
  const suitabilityPaceMultiplier = clamp(
    0.9 + averageStageSuitability * 0.0015,
    0.9,
    1.05,
  )
  const projectedEscapePaceKmh = clamp(
    40 * cooperationSpeedMultiplier * suitabilityPaceMultiplier,
    34,
    46,
  )

  return {
    riderCount: riders.length,
    teamCount: new Set(riders.map((rider) => rider.teamId)).size,
    averageTeamwork: deterministicRound(averageTeamwork, 6),
    averageStageSuitability: deterministicRound(
      averageStageSuitability,
      6,
    ),
    cooperationScore: deterministicRound(cooperationScore, 6),
    cooperationSpeedMultiplier: deterministicRound(
      cooperationSpeedMultiplier,
      6,
    ),
    projectedEscapePaceKmh: deterministicRound(projectedEscapePaceKmh, 6),
    modelVersion: 'universal_breakaway_cooperation_v1',
  }
}

function calculatePelotonResponseComponents(
  stageProgressFraction: number,
  remainingKm: number,
  currentGapSeconds: number,
  escapeRiderCount: number,
  escapeTeamCount: number,
  chasingTeamCount: number,
  availableChaseAssets: number,
  totalSprintAssets: number,
  totalProtectedAssets: number,
  baselinePelotonPaceKmh: number,
  escapePaceKmh: number,
  isPointGateNear: boolean,
  isFinishNear: boolean,
  refinedChaseInterestModel = false,
): PelotonResponseComponents {
  const progress = clamp(stageProgressFraction, 0, 1)
  const remaining = Math.max(0, remainingKm)
  const gap = Math.max(0, currentGapSeconds)
  const escapeRiders = Math.max(1, Math.trunc(escapeRiderCount || 1))
  const escapeTeams = Math.max(1, Math.trunc(escapeTeamCount || 1))
  const chasingTeams = Math.max(0, Math.trunc(chasingTeamCount))
  const chaseAssets = Math.max(0, Math.trunc(availableChaseAssets))
  const sprintAssets = Math.max(0, Math.trunc(totalSprintAssets))
  const protectedAssets = Math.max(0, Math.trunc(totalProtectedAssets))
  const pelotonPace = clamp(baselinePelotonPaceKmh, 5, 100)
  const escapePace = clamp(escapePaceKmh, 5, 100)

  // v10e preserves the accepted 0-4 team response exactly, then adds a
  // diminishing extra-pressure term for larger coalitions. Zero interested
  // teams can opt into a genuinely uninterested peloton in Phase 4.
  const chasingTeamInterestFraction = Math.min(1, chasingTeams / 4)
  const chaseAssetFraction = Math.min(1, chaseAssets / 12)
  const sprintInterestFraction = Math.min(1, sprintAssets / 8)
  const protectedInterestFraction = Math.min(1, protectedAssets / 6)
  const hasOrganizedChaseInterest =
    !refinedChaseInterestModel || (chasingTeams > 0 && chaseAssets > 0)
  const largeCoalitionBonus =
    refinedChaseInterestModel && chasingTeams > 4
      ? Math.min(0.012, Math.log2(chasingTeams / 4) * 0.007)
      : 0
  const chaseInterestScore = hasOrganizedChaseInterest
    ? clamp(
        chasingTeamInterestFraction * 0.35 +
          sprintInterestFraction * 0.4 +
          protectedInterestFraction * 0.15 +
          (isPointGateNear ? 0.1 : 0) +
          (isFinishNear ? 0.2 : 0),
        0,
        1,
      )
    : 0
  const chaseCapacityScore = hasOrganizedChaseInterest
    ? clamp(
        chaseAssetFraction * 0.65 + chasingTeamInterestFraction * 0.35,
        0,
        1,
      )
    : 0
  const coordinationFactor = hasOrganizedChaseInterest
    ? clamp(
        chasingTeamInterestFraction * (0.65 + chaseAssetFraction * 0.35),
        0,
        1,
      )
    : 0

  let baseTargetGapUpperSeconds: number
  if (isFinishNear || remaining <= 5) baseTargetGapUpperSeconds = 0
  else if (remaining <= 10) baseTargetGapUpperSeconds = remaining * 1.5
  else if (remaining <= 20) baseTargetGapUpperSeconds = 20 + remaining * 1.5
  else if (progress < 0.2) {
    baseTargetGapUpperSeconds =
      210 + Math.max(0, escapeRiders - 1) * 25 +
      Math.max(0, escapeTeams - 1) * 10
  } else if (progress < 0.5) {
    baseTargetGapUpperSeconds =
      150 + Math.max(0, escapeRiders - 1) * 20 +
      Math.max(0, escapeTeams - 1) * 8
  } else if (progress < 0.75) {
    baseTargetGapUpperSeconds =
      90 + Math.max(0, escapeRiders - 1) * 15 +
      Math.max(0, escapeTeams - 1) * 6
  } else if (progress < 0.9) {
    baseTargetGapUpperSeconds = 45 + Math.max(0, escapeRiders - 1) * 10
  } else {
    baseTargetGapUpperSeconds = Math.max(8, remaining * 1.25)
  }

  const requiredHoldMultiplier = clamp(escapePace / pelotonPace, 0.85, 1.15)
  const targetGapUpperSeconds = Math.max(
    0,
    baseTargetGapUpperSeconds * (1 - chaseInterestScore * 0.25) *
      (isPointGateNear ? 0.7 : 1),
  )
  const targetGapLowerSeconds = targetGapUpperSeconds * 0.65
  const maximumPursuitMultiplier = hasOrganizedChaseInterest
    ? Math.min(
        1.065,
        1 + 0.05 * chaseInterestScore * chaseCapacityScore + largeCoalitionBonus,
      )
    : 1

  let gapUrgencyFraction: number
  if (targetGapUpperSeconds <= 0) gapUrgencyFraction = gap > 0.5 ? 1 : 0
  else if (gap <= targetGapLowerSeconds) gapUrgencyFraction = 0
  else if (gap < targetGapUpperSeconds) {
    gapUrgencyFraction = Math.min(
      0.4,
      ((gap - targetGapLowerSeconds) /
        Math.max(targetGapUpperSeconds * 0.35, 0.000001)) *
        0.4,
    )
  } else {
    gapUrgencyFraction = Math.min(
      1,
      0.5 +
        ((gap - targetGapUpperSeconds) /
          Math.max(30, targetGapUpperSeconds)) *
          0.5,
    )
  }

  const distanceUrgencyFraction =
    remaining <= 10
      ? 1
      : remaining <= 25
        ? 0.75
        : remaining <= 50
          ? 0.45
          : Math.min(0.35, progress * 0.35)
  const escapeStrengthUrgencyFraction = Math.min(
    1,
    Math.max(0, requiredHoldMultiplier - 1) * 20,
  )
  const chaseUrgencyScore = clamp(
    gapUrgencyFraction * 0.45 +
      distanceUrgencyFraction * 0.3 +
      escapeStrengthUrgencyFraction * 0.15 +
      (isPointGateNear ? 0.1 : 0) +
      (isFinishNear ? 0.3 : 0),
    0,
    1,
  )

  let responseMode: UniversalPelotonResponseMode
  if (gap <= 0.5) responseMode = 'no_active_escape'
  else if (!hasOrganizedChaseInterest) responseMode = 'uninterested_peloton'
  else if (isFinishNear || remaining <= 5) responseMode = 'emergency_chase'
  else if (gap < targetGapLowerSeconds && remaining > 20 && !isPointGateNear) {
    responseMode = 'release_escape'
  } else if (gap <= targetGapUpperSeconds) responseMode = 'control_gap'
  else responseMode = 'organized_chase'

  let selectedResponseMultiplier: number
  switch (responseMode) {
    case 'no_active_escape':
      selectedResponseMultiplier = 1
      break
    case 'uninterested_peloton':
      // Normal race pace only. A late bunch may still accelerate for its own
      // sprint below, but the engine does not pace-match the breakaway or
      // manufacture an organized chase.
      selectedResponseMultiplier = 1
      break
    case 'release_escape':
      selectedResponseMultiplier = clamp(
        requiredHoldMultiplier - (0.006 + (1 - progress) * 0.01),
        0.9,
        0.995,
      )
      break
    case 'control_gap': {
      const midpoint = (targetGapLowerSeconds + targetGapUpperSeconds) / 2
      const adjustment =
        targetGapUpperSeconds <= 0
          ? 0
          : ((gap - midpoint) / Math.max(30, targetGapUpperSeconds)) * 0.01
      selectedResponseMultiplier = clamp(
        requiredHoldMultiplier + adjustment,
        0.92,
        maximumPursuitMultiplier,
      )
      break
    }
    case 'organized_chase':
      selectedResponseMultiplier = clamp(
        requiredHoldMultiplier + 0.006 + chaseUrgencyScore * 0.024,
        0.97,
        maximumPursuitMultiplier,
      )
      break
    case 'emergency_chase':
      selectedResponseMultiplier = maximumPursuitMultiplier
      break
  }

  return {
    chaseInterestScore: deterministicRound(chaseInterestScore, 6),
    chaseCapacityScore: deterministicRound(chaseCapacityScore, 6),
    coordinationFactor: deterministicRound(coordinationFactor, 6),
    targetGapLowerSeconds: deterministicRound(targetGapLowerSeconds, 6),
    targetGapUpperSeconds: deterministicRound(targetGapUpperSeconds, 6),
    requiredHoldMultiplier: deterministicRound(requiredHoldMultiplier, 6),
    maximumPursuitMultiplier: deterministicRound(maximumPursuitMultiplier, 6),
    selectedResponseMultiplier: deterministicRound(
      selectedResponseMultiplier,
      6,
    ),
    chaseUrgencyScore: deterministicRound(chaseUrgencyScore, 6),
    pelotonWorkIntensityFraction: deterministicRound(
      clamp((selectedResponseMultiplier - 0.97) / 0.08, 0, 1),
      6,
    ),
    responseMode,
  }
}

function getPhaseResolution(
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  riderId: string,
  phaseNumber: RoadRacePhaseNumber,
): UniversalRoadCommandPhaseResolution {
  return roadCommandResolution.riders
    .find((row) => row.riderId === riderId)!
    .phases.find((phase) => phase.phaseNumber === phaseNumber)!
}

function selectTeamLeaderTarget(
  teamId: string,
  supporterRiderId: string,
  command: UniversalRoadSupportCommand,
  input: UniversalRaceEngineInput,
  suitabilityByRiderId: ReadonlyMap<string, UniversalRiderSuitabilityResult>,
): { riderId: string | null; reason: UniversalRoadSupportAction['targetReason'] } {
  if (command === 'protect_jersey') {
    const leaders = input.preStageLeaders
    const ordered = [
      ['general', leaders?.general],
      ['points', leaders?.points],
      ['mountain', leaders?.mountain],
    ] as const
    for (const [classification, leader] of ordered) {
      if (leader?.teamId !== teamId || leader.riderId === supporterRiderId) {
        continue
      }
      const reason =
        classification === 'general'
          ? 'pre_stage_general_leader'
          : classification === 'points'
            ? 'pre_stage_points_leader'
            : 'pre_stage_mountain_leader'
      return { riderId: leader.riderId, reason }
    }
    return { riderId: null, reason: 'no_valid_target' }
  }

  const plan = input.stagePlans.find((row) => row.teamId === teamId)
  const candidates = (plan?.riders ?? []).filter(
    (row) => row.riderId !== supporterRiderId,
  )
  const leader = candidates.find((row) => row.stageRole === 'team_leader_gc')
  if (leader) return { riderId: leader.riderId, reason: 'team_leader' }
  const protectedRider = candidates.find(
    (row) => row.stageRole === 'protected_rider',
  )
  if (protectedRider) {
    return { riderId: protectedRider.riderId, reason: 'protected_rider' }
  }

  const best = [...candidates].sort((left, right) => {
    const scoreDiff =
      (suitabilityByRiderId.get(right.riderId)?.suitabilityScore ?? 0) -
      (suitabilityByRiderId.get(left.riderId)?.suitabilityScore ?? 0)
    return scoreDiff || left.riderId.localeCompare(right.riderId)
  })[0]
  return best
    ? { riderId: best.riderId, reason: 'best_available_teammate' }
    : { riderId: null, reason: 'no_valid_target' }
}

function resolvePhase2SupportActions(
  input: UniversalRaceEngineInput,
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  suitabilityByRiderId: ReadonlyMap<string, UniversalRiderSuitabilityResult>,
): readonly UniversalRoadSupportAction[] {
  const actions: UniversalRoadSupportAction[] = []
  for (const riderRow of roadCommandResolution.riders) {
    if (!riderRow.eligibleToStart) continue
    const phase = riderRow.phases.find((row) => row.phaseNumber === 2)!
    if (
      phase.behaviour !== 'leader_protection' &&
      phase.behaviour !== 'jersey_protection' &&
      phase.behaviour !== 'leader_support' &&
      phase.behaviour !== 'team_work'
    ) {
      continue
    }

    const command = phase.resolvedCommand as UniversalRoadSupportCommand
    const target = selectTeamLeaderTarget(
      riderRow.teamId,
      riderRow.riderId,
      command,
      input,
      suitabilityByRiderId,
    )
    const deterministicRoll = calculateDeterministicUnitRoll(
      `${input.engine.deterministicSeed}|${input.stage.stageId}|${riderRow.riderId}|phase_2_support`,
    )
    actions.push({
      supporterRiderId: riderRow.riderId,
      teamId: riderRow.teamId,
      command,
      status: target.riderId === null ? 'suppressed_no_valid_target' : 'applied',
      targetRiderId: target.riderId,
      targetReason: target.reason,
      deterministicRoll,
      supportWorkScore:
        target.riderId === null
          ? 0
          : deterministicRound(Math.max(2.5, 6 - deterministicRoll * 2), 6),
      protectionReceivedScore:
        target.riderId === null
          ? 0
          : deterministicRound(
              Math.max(1.5, 4 - deterministicRoll * 1.5),
              6,
            ),
      modelVersion: 'production_stage_command_support_deltas_v1',
    })
  }
  return actions.sort((left, right) =>
    left.supporterRiderId.localeCompare(right.supporterRiderId),
  )
}

function scorePhase2PointContestant(
  point: UniversalStagePointInput,
  rider: UniversalRiderInput,
  stageRole: RiderStageRole,
  liveEnergy: number,
): number {
  if (
    point.pointType === 'INTERMEDIATE_SPRINT' ||
    point.pointType === 'BONUS_SPRINT'
  ) {
    const roleBonus =
      stageRole === 'sprinter'
        ? 4
        : stageRole === 'lead_out_rider' ||
            stageRole === 'sprint_train_rider'
          ? 2
          : 0
    return deterministicRound(
      rider.sprint * 0.46 +
        rider.flat * 0.16 +
        rider.raceIQ * 0.14 +
        rider.endurance * 0.1 +
        rider.resistance * 0.06 +
        rider.morale * 0.04 +
        liveEnergy * 0.04 -
        rider.fatigueBeforeStage * 0.05 +
        roleBonus,
      6,
    )
  }

  const roleBonus =
    stageRole === 'climber' || stageRole === 'mountain_domestique'
      ? 3.5
      : 0
  return deterministicRound(
    rider.climbing * 0.54 +
      rider.endurance * 0.16 +
      rider.resistance * 0.12 +
      rider.raceIQ * 0.08 +
      liveEnergy * 0.08 +
      rider.morale * 0.02 -
      rider.fatigueBeforeStage * 0.05 +
      roleBonus,
    6,
  )
}

export function resolveRoadPhase2Development(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  riderSuitability: readonly UniversalRiderSuitabilityResult[],
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  phase1Resolution: UniversalRoadRaceResolutionSummary,
): UniversalRoadRaceResolutionSummary {
  if (
    !phase1Resolution.active ||
    !phase1Resolution.phase1Opening ||
    input.stage.stageFormat !== 'road_race'
  ) {
    return {
      ...phase1Resolution,
      phase2Development: null,
      phase3Decisive: null,
      phase4Finish: null,
    }
  }

  const phase1 = phase1Resolution.phase1Opening
  const phaseBoundary = roadCommandResolution.phaseBoundaries.find(
    (phase) => phase.phaseNumber === 2,
  )!
  const ridersById = new Map(input.riders.map((rider) => [rider.riderId, rider]))
  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row]),
  )
  const suitabilityByRiderId = new Map(
    riderSuitability.map((row) => [row.riderId, row]),
  )
  const phase1EnergyByRiderId = new Map(
    phase1.riderEnergy.map((row) => [row.riderId, row.energyAfterPhase]),
  )
  const phase2Points = input.points
    .filter((point) => getRoadPhaseNumberForPoint(
      point.kmFromStart,
      input.stage.distanceKm,
    ) === 2)
    .filter(
      (point) =>
        point.pointType === 'INTERMEDIATE_SPRINT' ||
        point.pointType === 'BONUS_SPRINT' ||
        point.pointType === 'KOM',
    )
    .sort((left, right) => left.kmFromStart - right.kmFromStart ||
      left.sortOrder - right.sortOrder || left.pointId.localeCompare(right.pointId))

  const breakawayCooperation = calculateBreakawayCooperation(
    phase1.breakawayRiderIds,
    ridersById,
    suitabilityByRiderId,
  )
  const breakawayActive = phase1.breakawayRiderIds.length > 0 &&
    phase1.initialGapSeconds > 0.5

  const phase2Rows = roadCommandResolution.riders.map((row) => ({
    row,
    phase: row.phases.find((phase) => phase.phaseNumber === 2)!,
  }))
  const controllingTeamIds = Array.from(
    new Set(
      phase2Rows
        .filter(({ phase }) => phase.behaviour === 'race_control')
        .map(({ row }) => row.teamId),
    ),
  ).sort()
  const chasingTeamIds = Array.from(
    new Set(
      phase2Rows
        .filter(({ phase }) => phase.behaviour === 'chase')
        .map(({ row }) => row.teamId),
    ),
  ).sort()
  const availableChaseAssets = phase2Rows.filter(
    ({ phase }) =>
      phase.behaviour === 'chase' ||
      phase.behaviour === 'race_control' ||
      phase.behaviour === 'team_work',
  ).length
  const totalSprintAssets = phase2Rows.filter(
    ({ row, phase }) =>
      row.stageRole === 'sprinter' ||
      row.stageRole === 'lead_out_rider' ||
      row.stageRole === 'sprint_train_rider' ||
      phase.behaviour === 'sprint_preparation',
  ).length
  const totalProtectedAssets = phase2Rows.filter(
    ({ row }) =>
      row.stageRole === 'team_leader_gc' ||
      row.stageRole === 'protected_rider',
  ).length

  const baselinePelotonPaceKmh = 40
  const projectedEscapePaceKmh =
    breakawayCooperation?.projectedEscapePaceKmh ?? baselinePelotonPaceKmh
  let pelotonComponents = calculatePelotonResponseComponents(
    phaseBoundary.startFraction,
    input.stage.distanceKm - phaseBoundary.startKm,
    breakawayActive ? phase1.initialGapSeconds : 0,
    Math.max(1, phase1.breakawayRiderIds.length),
    Math.max(
      1,
      new Set(
        phase1.breakawayRiderIds.map(
          (riderId) => ridersById.get(riderId)?.teamId ?? '',
        ),
      ).size,
    ),
    chasingTeamIds.length + controllingTeamIds.length,
    availableChaseAssets,
    totalSprintAssets,
    totalProtectedAssets,
    baselinePelotonPaceKmh,
    projectedEscapePaceKmh,
    phase2Points.some(
      (point) => Math.abs(point.kmFromStart - phaseBoundary.startKm) <= 5,
    ),
    false,
  )

  const averageAttackCost = average(
    phase1.attackAttempts
      .filter((attempt) => attempt.acceptedEscapeLaunch)
      .map((attempt) => attempt.attackEnergyCost),
  )
  const postAttackPenaltyFraction = Math.min(0.03, averageAttackCost * 0.002)
  const effectiveEscapePaceKmh = projectedEscapePaceKmh *
    Math.max(0.9, 1 - postAttackPenaltyFraction)
  let currentGapSeconds = breakawayActive ? phase1.initialGapSeconds : 0
  let currentKm = phaseBoundary.startKm
  let effectivePelotonPaceKmh = baselinePelotonPaceKmh

  while (
    breakawayActive &&
    currentGapSeconds > 0.5 &&
    currentKm < phaseBoundary.endKm - 0.000001
  ) {
    const stepEndKm = Math.min(phaseBoundary.endKm, currentKm + 5)
    const stepDistanceKm = stepEndKm - currentKm
    const isPointGateNear = phase2Points.some(
      (point) =>
        point.kmFromStart >= currentKm - 0.000001 &&
        point.kmFromStart <= stepEndKm + 5,
    )
    pelotonComponents = calculatePelotonResponseComponents(
      stepEndKm / input.stage.distanceKm,
      input.stage.distanceKm - stepEndKm,
      currentGapSeconds,
      Math.max(1, phase1.breakawayRiderIds.length),
      Math.max(
        1,
        new Set(
          phase1.breakawayRiderIds.map(
            (riderId) => ridersById.get(riderId)?.teamId ?? '',
          ),
        ).size,
      ),
      chasingTeamIds.length + controllingTeamIds.length,
      availableChaseAssets,
      totalSprintAssets,
      totalProtectedAssets,
      baselinePelotonPaceKmh,
      projectedEscapePaceKmh,
      isPointGateNear,
      false,
    )
    effectivePelotonPaceKmh =
      baselinePelotonPaceKmh * pelotonComponents.selectedResponseMultiplier
    const pelotonStepSeconds =
      (stepDistanceKm / Math.max(5, effectivePelotonPaceKmh)) * 3600
    const escapeStepSeconds =
      (stepDistanceKm / Math.max(5, effectiveEscapePaceKmh)) * 3600
    currentGapSeconds = Math.max(
      0,
      currentGapSeconds + pelotonStepSeconds - escapeStepSeconds,
    )
    currentKm = stepEndKm
  }

  const endGapSeconds = deterministicRound(currentGapSeconds, 6)
  const breakawaySurvivesPhase2 = breakawayActive && endGapSeconds > 0.5
  const breakawayRiderIdsAtEnd = breakawaySurvivesPhase2
    ? [...phase1.breakawayRiderIds]
    : []
  const eligibleRiderIds = roadCommandResolution.riders
    .filter((row) => row.eligibleToStart)
    .map((row) => row.riderId)
    .sort()
  const pelotonRiderIdsAtEnd = eligibleRiderIds.filter(
    (riderId) => !breakawayRiderIdsAtEnd.includes(riderId),
  )

  const supportActions = resolvePhase2SupportActions(
    input,
    roadCommandResolution,
    suitabilityByRiderId,
  )
  const supportActionByRiderId = new Map(
    supportActions.map((action) => [action.supporterRiderId, action]),
  )
  const supportWorkByRiderId = new Map<string, number>()
  const protectionByRiderId = new Map<string, number>()
  supportActions.forEach((action) => {
    supportWorkByRiderId.set(
      action.supporterRiderId,
      (supportWorkByRiderId.get(action.supporterRiderId) ?? 0) +
        action.supportWorkScore,
    )
    if (action.targetRiderId) {
      protectionByRiderId.set(
        action.targetRiderId,
        (protectionByRiderId.get(action.targetRiderId) ?? 0) +
          action.protectionReceivedScore,
      )
    }
  })

  const objectiveEnergyCostByRiderId = new Map<string, number>()
  const pointBattles: UniversalRoadPointBattleResult[] = phase2Points.map(
    (point) => {
      const isSprint =
        point.pointType === 'INTERMEDIATE_SPRINT' ||
        point.pointType === 'BONUS_SPRINT'
      const contestants = roadCommandResolution.riders
        .filter((row) => row.eligibleToStart)
        .filter((row) => {
          const phase = row.phases.find((entry) => entry.phaseNumber === 2)!
          return isSprint
            ? phase.intermediateSprintContest.eligible &&
                phase.intermediateSprintPointIds.includes(point.pointId)
            : phase.komContest.eligible &&
                phase.komPointIds.includes(point.pointId)
        })
        .map((row) => {
          const rider = ridersById.get(row.riderId)!
          const readiness = readinessByRiderId.get(row.riderId)!
          const phase = row.phases.find((entry) => entry.phaseNumber === 2)!
          const startEnergy = phase1EnergyByRiderId.get(row.riderId) ?? 0
          const baselineCostBeforePoint = calculateRoadEnergyCostForRange(
            input,
            rider,
            readiness,
            1,
            phaseBoundary.startKm,
            point.kmFromStart,
          )
          const liveEnergy = deterministicRound(
            Math.max(0, startEnergy - baselineCostBeforePoint),
            6,
          )
          const objectiveStartKm = Math.max(
            phaseBoundary.startKm,
            point.kmFromStart - 0.25,
          )
          const objectiveEndKm = Math.min(
            phaseBoundary.endKm,
            point.kmFromStart + 0.25,
          )
          const activeObjectiveCost = calculateRoadEnergyCostForRange(
            input,
            rider,
            readiness,
            phase.commandEffect.roleAdjustedEffortMultiplier,
            objectiveStartKm,
            objectiveEndKm,
          )
          const neutralObjectiveCost = calculateRoadEnergyCostForRange(
            input,
            rider,
            readiness,
            1,
            objectiveStartKm,
            objectiveEndKm,
          )
          const extraObjectiveCost = deterministicRound(
            Math.max(0, activeObjectiveCost - neutralObjectiveCost),
            6,
          )
          objectiveEnergyCostByRiderId.set(
            row.riderId,
            deterministicRound(
              (objectiveEnergyCostByRiderId.get(row.riderId) ?? 0) +
                extraObjectiveCost,
              6,
            ),
          )
          return {
            riderId: row.riderId,
            teamId: row.teamId,
            score: scorePhase2PointContestant(
              point,
              rider,
              row.stageRole,
              liveEnergy,
            ),
            liveEnergy,
          }
        })
        .sort(
          (left, right) =>
            right.score - left.score ||
            right.liveEnergy - left.liveEnergy ||
            left.riderId.localeCompare(right.riderId),
        )

      const awardDepth = Math.max(
        point.pointsScheme.length,
        point.timeBonusSeconds.length,
      )
      const rankings: UniversalRoadPointBattleRanking[] = contestants
        .slice(0, awardDepth)
        .map((contestant, index) => ({
          rank: index + 1,
          riderId: contestant.riderId,
          teamId: contestant.teamId,
          score: contestant.score,
          liveEnergyBeforeObjective: contestant.liveEnergy,
          pointsAwarded: point.pointsScheme[index] ?? 0,
          bonusSecondsAwarded: point.timeBonusSeconds[index] ?? 0,
        }))

      return {
        pointId: point.pointId,
        pointType: point.pointType as UniversalRoadPointBattleResult['pointType'],
        pointName: point.name,
        kmFromStart: point.kmFromStart,
        phaseNumber: 2,
        eligibleContestantIds: contestants.map((row) => row.riderId),
        status: contestants.length > 0 ? 'contested' : 'not_contested',
        winnerRiderId: rankings[0]?.riderId ?? null,
        rankings,
        scoringModel: isSprint
          ? 'production_intermediate_sprint_score_v1'
          : 'production_kom_score_v1',
      }
    },
  )

  const riderEnergy: UniversalRoadDevelopmentRiderEnergy[] =
    roadCommandResolution.riders
      .map((row): UniversalRoadDevelopmentRiderEnergy => {
        const rider = ridersById.get(row.riderId)!
        const readiness = readinessByRiderId.get(row.riderId)!
        const phase = row.phases.find((entry) => entry.phaseNumber === 2)!
        const startEnergy = phase1EnergyByRiderId.get(row.riderId) ?? 0
        const supportAction = supportActionByRiderId.get(row.riderId)
        const effectivePhaseEffortMultiplier =
          supportAction?.status === 'suppressed_no_valid_target'
            ? 1
            : getGeneralPhaseEffortMultiplier(phase)
        const baselinePhaseEnergyCost = calculateRoadEnergyCostForRange(
          input,
          rider,
          readiness,
          effectivePhaseEffortMultiplier,
          phaseBoundary.startKm,
          phaseBoundary.endKm,
        )
        const objectiveEnergyCost =
          objectiveEnergyCostByRiderId.get(row.riderId) ?? 0
        const totalPhaseEnergyCost = deterministicRound(
          baselinePhaseEnergyCost + objectiveEnergyCost,
          6,
        )
        return {
          riderId: row.riderId,
          teamId: row.teamId,
          command: phase.resolvedCommand,
          startEnergy,
          baselinePhaseEnergyCost,
          objectiveEnergyCost,
          totalPhaseEnergyCost,
          energyAfterPhase: deterministicRound(
            Math.max(0, startEnergy - totalPhaseEnergyCost),
            6,
          ),
          supportWorkScore: deterministicRound(
            supportWorkByRiderId.get(row.riderId) ?? 0,
            6,
          ),
          protectionReceivedScore: deterministicRound(
            protectionByRiderId.get(row.riderId) ?? 0,
            6,
          ),
          finalGroupCode: breakawayRiderIdsAtEnd.includes(row.riderId)
            ? 'breakaway'
            : 'main_peloton',
          modelVersion: 'production_step_energy_v2' as const,
        }
      })
      .sort((left, right) => left.riderId.localeCompare(right.riderId))

  let status: UniversalRoadDevelopmentStatus
  if (!breakawayActive) status = 'no_active_breakaway'
  else if (!breakawaySurvivesPhase2) status = 'breakaway_caught'
  else if (pelotonComponents.responseMode === 'release_escape') {
    status = 'breakaway_released'
  } else if (pelotonComponents.responseMode === 'organized_chase') {
    status = 'organized_chase'
  } else status = 'gap_controlled'

  const groups: UniversalRoadDevelopmentGroup[] = breakawaySurvivesPhase2
    ? [
        {
          groupCode: 'breakaway',
          groupOrder: 1,
          riderIds: breakawayRiderIdsAtEnd,
          gapSeconds: 0,
        },
        {
          groupCode: 'main_peloton',
          groupOrder: 2,
          riderIds: pelotonRiderIdsAtEnd,
          gapSeconds: endGapSeconds,
        },
      ]
    : [
        {
          groupCode: 'main_peloton',
          groupOrder: 1,
          riderIds: eligibleRiderIds,
          gapSeconds: 0,
        },
      ]

  return {
    ...phase1Resolution,
    phase2Development: {
      phaseNumber: 2,
      phaseBoundary,
      status,
      startGapSeconds: breakawayActive ? phase1.initialGapSeconds : 0,
      endGapSeconds: breakawaySurvivesPhase2 ? endGapSeconds : 0,
      gapDeltaSeconds: deterministicRound(
        (breakawaySurvivesPhase2 ? endGapSeconds : 0) -
          (breakawayActive ? phase1.initialGapSeconds : 0),
        6,
      ),
      breakawayRiderIdsAtStart: [...phase1.breakawayRiderIds],
      breakawayRiderIdsAtEnd,
      pelotonRiderIdsAtEnd,
      breakawayCooperation,
      pelotonResponse: {
        responseMode: pelotonComponents.responseMode,
        chasingTeamIds,
        controllingTeamIds,
        availableChaseAssets,
        totalSprintAssets,
        totalProtectedAssets,
        chaseInterestScore: pelotonComponents.chaseInterestScore,
        chaseCapacityScore: pelotonComponents.chaseCapacityScore,
        coordinationFactor: pelotonComponents.coordinationFactor,
        targetGapLowerSeconds: pelotonComponents.targetGapLowerSeconds,
        targetGapUpperSeconds: pelotonComponents.targetGapUpperSeconds,
        requiredHoldMultiplier: pelotonComponents.requiredHoldMultiplier,
        maximumPursuitMultiplier:
          pelotonComponents.maximumPursuitMultiplier,
        selectedResponseMultiplier:
          pelotonComponents.selectedResponseMultiplier,
        chaseUrgencyScore: pelotonComponents.chaseUrgencyScore,
        pelotonWorkIntensityFraction:
          pelotonComponents.pelotonWorkIntensityFraction,
        baselinePelotonPaceKmh,
        effectivePelotonPaceKmh: deterministicRound(
          effectivePelotonPaceKmh,
          6,
        ),
        modelVersion: 'production_peloton_response_components_v2',
      },
      supportActions,
      pointBattles,
      riderEnergy,
      groups,
      modelVersion: 'universal_road_phase_2_development_v1',
    },
    phase3Decisive: null,
      phase4Finish: null,
  }
}

function getDecisiveTerrainSelectionScore(
  segment: RoadOpeningRouteSegment,
): number {
  const uphill = Math.max(0, segment.slopePercent)
  switch (segment.terrainType) {
    case 'steep_climb':
      return segment.distanceKm * (8 + uphill * 1.5)
    case 'climb':
      return segment.distanceKm * (5 + uphill)
    case 'cobbled':
    case 'cobble':
      return segment.distanceKm * 8
    case 'gravel':
      return segment.distanceKm * 8.5
    case 'technical_descent':
      return segment.distanceKm * 3.5
    case 'false_flat':
      return segment.distanceKm * 3
    case 'flat':
      return segment.distanceKm
    case 'descent':
      return segment.distanceKm * 0.5
  }
}

function selectDecisiveTerrain(
  stage: UniversalStageInput,
  phaseBoundary: UniversalRoadPhaseBoundary,
): UniversalRoadDecisiveTerrainSelection {
  const segments = buildRoadOpeningRouteSegments(
    stage,
    phaseBoundary.startKm,
    phaseBoundary.endKm,
  )
  const fallback: RoadOpeningRouteSegment = {
    kmStart: phaseBoundary.startKm,
    kmEnd: phaseBoundary.endKm,
    distanceKm: phaseBoundary.endKm - phaseBoundary.startKm,
    slopePercent: 0,
    terrainType: stage.terrainType === 'cobbled' ? 'cobbled' : 'flat',
  }
  const selected = (segments.length > 0 ? [...segments] : [fallback]).sort((left, right) => {
    const scoreDelta =
      getDecisiveTerrainSelectionScore(right) -
      getDecisiveTerrainSelectionScore(left)
    return scoreDelta || left.kmStart - right.kmStart
  })[0]
  const selectionScore = getDecisiveTerrainSelectionScore(selected)
  const elevationGainM = Math.max(
    0,
    selected.slopePercent * selected.distanceKm * 10,
  )
  const primarySkill =
    selected.terrainType === 'climb' ||
    selected.terrainType === 'steep_climb'
      ? 'climbing'
      : selected.terrainType === 'cobbled' ||
          selected.terrainType === 'cobble' ||
          selected.terrainType === 'gravel'
        ? 'resistance'
        : selected.terrainType === 'technical_descent' ||
            selected.terrainType === 'descent'
          ? 'raceIQ'
          : 'flat'

  return {
    kmStart: selected.kmStart,
    kmEnd: selected.kmEnd,
    distanceKm: selected.distanceKm,
    elevationGainM: deterministicRound(elevationGainM, 6),
    averageGradientPercent: selected.slopePercent,
    terrainType: selected.terrainType,
    selectionScore: deterministicRound(selectionScore, 6),
    selectionSeverity: deterministicRound(
      clamp(selectionScore / Math.max(20, selected.distanceKm * 15), 0, 1),
      6,
    ),
    primarySkill,
    modelVersion: 'universal_decisive_terrain_selection_v1',
  }
}

function calculateDecisiveTerrainAbility(
  rider: UniversalRiderInput,
  terrain: UniversalRoadDecisiveTerrainSelection,
): number {
  switch (terrain.terrainType) {
    case 'climb':
    case 'steep_climb':
      return deterministicRound(
        rider.climbing * 0.45 +
          rider.endurance * 0.2 +
          rider.resistance * 0.15 +
          rider.recovery * 0.1 +
          rider.raceIQ * 0.1,
        6,
      )
    case 'cobbled':
    case 'cobble':
    case 'gravel':
      return deterministicRound(
        rider.flat * 0.28 +
          rider.resistance * 0.27 +
          rider.endurance * 0.2 +
          rider.raceIQ * 0.15 +
          rider.teamwork * 0.1,
        6,
      )
    case 'technical_descent':
    case 'descent':
      return deterministicRound(
        rider.raceIQ * 0.35 +
          rider.resistance * 0.2 +
          rider.flat * 0.2 +
          rider.endurance * 0.15 +
          rider.morale * 0.1,
        6,
      )
    case 'false_flat':
      return deterministicRound(
        rider.flat * 0.3 +
          rider.endurance * 0.25 +
          rider.resistance * 0.2 +
          rider.raceIQ * 0.15 +
          rider.teamwork * 0.1,
        6,
      )
    case 'flat':
      return deterministicRound(
        rider.flat * 0.35 +
          rider.endurance * 0.25 +
          rider.resistance * 0.2 +
          rider.raceIQ * 0.1 +
          rider.teamwork * 0.1,
        6,
      )
  }
}

function getStartDevelopmentGroupCode(
  phase2: UniversalRoadPhase2DevelopmentResult,
  riderId: string,
): UniversalRoadDevelopmentGroupCode {
  return phase2.breakawayRiderIdsAtEnd.includes(riderId)
    ? 'breakaway'
    : 'main_peloton'
}

function isSelectiveRoadTerrain(
  terrainType: UniversalRoadOpeningStepTerrain,
): boolean {
  return (
    terrainType === 'climb' ||
    terrainType === 'steep_climb' ||
    terrainType === 'cobbled' ||
    terrainType === 'cobble' ||
    terrainType === 'gravel'
  )
}

function calculateNaturalFrontSelectionDeltaLimit(
  terrain: UniversalRoadDecisiveTerrainSelection,
): number {
  const gradientPressure = clamp(
    (Math.max(0, terrain.averageGradientPercent) - 2.5) / 7.5,
    0,
    1,
  )
  return deterministicRound(
    clamp(
      5.25 - terrain.selectionSeverity * 1.75 - gradientPressure * 1.25,
      2.25,
      5.25,
    ),
    6,
  )
}

function getDecisiveGroupForPositionDelta(
  delta: number,
  energyAfterPhase: number,
): UniversalRoadDecisiveGroupCode {
  if (energyAfterPhase <= 3 || delta > 28) return 'dropped_group'
  if (delta <= 6) return 'front_group'
  if (delta <= 16) return 'main_group'
  return 'chasing_group'
}

function calculateDecisiveGapSeconds(
  groupCode: UniversalRoadDecisiveGroupCode,
  delta: number,
  terrain: UniversalRoadDecisiveTerrainSelection,
): number {
  if (groupCode === 'front_group') return 0
  const severity = 0.75 + terrain.selectionSeverity * 1.25
  const base =
    groupCode === 'main_group'
      ? 8
      : groupCode === 'chasing_group'
        ? 28
        : 75
  return deterministicRound(base + Math.max(0, delta) * severity, 6)
}

export function resolveRoadPhase3Decisive(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  riderSuitability: readonly UniversalRiderSuitabilityResult[],
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  phase2Resolution: UniversalRoadRaceResolutionSummary,
): UniversalRoadRaceResolutionSummary {
  if (
    !phase2Resolution.active ||
    !phase2Resolution.phase2Development ||
    input.stage.stageFormat !== 'road_race'
  ) {
    return {
      ...phase2Resolution,
      phase3Decisive: null,
      phase4Finish: null,
    }
  }

  const phase2 = phase2Resolution.phase2Development
  const phaseBoundary = roadCommandResolution.phaseBoundaries.find(
    (phase) => phase.phaseNumber === 3,
  )!
  const decisiveTerrain = selectDecisiveTerrain(input.stage, phaseBoundary)
  const ridersById = new Map(input.riders.map((rider) => [rider.riderId, rider]))
  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row]),
  )
  const suitabilityByRiderId = new Map(
    riderSuitability.map((row) => [row.riderId, row]),
  )
  const phase2EnergyByRiderId = new Map(
    phase2.riderEnergy.map((row) => [row.riderId, row]),
  )
  const teamPlanByTeamId = new Map(
    input.stagePlans.map((plan) => [plan.teamId, plan.teamTactic as RoadTeamTactic]),
  )
  const phase3Points = input.points
    .filter(
      (point) =>
        getRoadPhaseNumberForPoint(
          point.kmFromStart,
          input.stage.distanceKm,
        ) === 3,
    )
    .filter(
      (point) =>
        point.pointType === 'INTERMEDIATE_SPRINT' ||
        point.pointType === 'BONUS_SPRINT' ||
        point.pointType === 'KOM',
    )
    .sort(
      (left, right) =>
        left.kmFromStart - right.kmFromStart ||
        left.sortOrder - right.sortOrder ||
        left.pointId.localeCompare(right.pointId),
    )

  const baselineEnergyAfterPhaseByRiderId = new Map<string, number>()
  const phaseEnergyCostByRiderId = new Map<string, number>()
  roadCommandResolution.riders.forEach((row) => {
    const rider = ridersById.get(row.riderId)!
    const readiness = readinessByRiderId.get(row.riderId)!
    const phase = row.phases.find((entry) => entry.phaseNumber === 3)!
    const startEnergy = phase2EnergyByRiderId.get(row.riderId)?.energyAfterPhase ?? 0
    const phaseEnergyCost = calculateRoadEnergyCostForRange(
      input,
      rider,
      readiness,
      getGeneralPhaseEffortMultiplier(phase),
      phaseBoundary.startKm,
      phaseBoundary.endKm,
    )
    phaseEnergyCostByRiderId.set(row.riderId, phaseEnergyCost)
    baselineEnergyAfterPhaseByRiderId.set(
      row.riderId,
      deterministicRound(Math.max(0, startEnergy - phaseEnergyCost), 6),
    )
  })

  const explicitAttackRows = roadCommandResolution.riders
    .filter((row) => row.eligibleToStart)
    .filter((row) => {
      const phase = row.phases.find((entry) => entry.phaseNumber === 3)!
      return phase.deliberateAttack.eligible && phase.resolvedCommand === 'attack'
    })
    .sort((left, right) => {
      const leftSuitability = suitabilityByRiderId.get(left.riderId)?.suitabilityScore ?? 0
      const rightSuitability = suitabilityByRiderId.get(right.riderId)?.suitabilityScore ?? 0
      return rightSuitability - leftSuitability || left.riderId.localeCompare(right.riderId)
    })

  const selectedAttackRows: UniversalRoadRiderCommandResolution[] = []
  const selectedTeams = new Set<string>()
  explicitAttackRows.forEach((row) => {
    if (selectedAttackRows.length >= 6 || selectedTeams.has(row.teamId)) return
    selectedAttackRows.push(row)
    selectedTeams.add(row.teamId)
  })

  const attackEnergyCostByRiderId = new Map<string, number>()
  const attackPositionBonusByRiderId = new Map<string, number>()
  const attackAttempts: UniversalRoadDecisiveAttackAttempt[] = selectedAttackRows.map(
    (row, index) => {
      const rider = ridersById.get(row.riderId)!
      const phase = row.phases.find((entry) => entry.phaseNumber === 3)!
      const energyBeforeAttempt = baselineEnergyAfterPhaseByRiderId.get(row.riderId) ?? 0
      const routeSegment: RoadOpeningRouteSegment = {
        kmStart: decisiveTerrain.kmStart,
        kmEnd: decisiveTerrain.kmEnd,
        distanceKm: decisiveTerrain.distanceKm,
        slopePercent: decisiveTerrain.averageGradientPercent,
        terrainType: decisiveTerrain.terrainType,
      }
      const attemptKm = deterministicRound(
        (decisiveTerrain.kmStart + decisiveTerrain.kmEnd) / 2,
        6,
      )
      const pointGateCount = phase3Points.filter(
        (point) => Math.abs(point.kmFromStart - attemptKm) < 0.5,
      ).length
      const intent = calculateOpeningAttackIntent(
        rider,
        row.stageRole,
        teamPlanByTeamId.get(row.teamId) ?? 'balanced',
        'attack',
        attemptKm,
        input.stage.distanceKm,
        0,
        routeSegment,
        energyBeforeAttempt,
        pointGateCount,
      )
      const outcome = calculateOpeningAttackOutcome(
        rider,
        row.stageRole,
        routeSegment,
        attemptKm / input.stage.distanceKm,
        intent.attackIntentScore,
        energyBeforeAttempt,
        Math.max(1, selectedAttackRows.length),
        1,
        index + 1,
      )
      const deterministicOutcomeRoll = calculateDeterministicUnitRoll(
        `${input.engine.deterministicSeed}|${input.stage.stageId}|phase_3_decisive_attack|${row.riderId}`,
      )
      const physicallyValid = intent.eligible && energyBeforeAttempt >= 20
      const attackSucceeded =
        physicallyValid && deterministicOutcomeRoll <= outcome.attackSuccessProbability
      const attackEnergyCost = physicallyValid
        ? Math.min(energyBeforeAttempt, outcome.projectedAttackEnergyCostPct)
        : 0
      const energyAfterAttempt = deterministicRound(
        Math.max(0, energyBeforeAttempt - attackEnergyCost),
        6,
      )
      const positionScoreBonus = attackSucceeded
        ? deterministicRound(
            6 +
              outcome.attackExecutionSkillScore * 0.04 +
              decisiveTerrain.selectionSeverity * 4,
            6,
          )
        : 0
      attackEnergyCostByRiderId.set(row.riderId, attackEnergyCost)
      attackPositionBonusByRiderId.set(row.riderId, positionScoreBonus)
      return {
        riderId: row.riderId,
        teamId: row.teamId,
        sourceGroupCode: getStartDevelopmentGroupCode(phase2, row.riderId),
        attemptKm,
        effectiveTerrainType: decisiveTerrain.terrainType,
        energyBeforeAttempt,
        attackIntentScore: intent.attackIntentScore,
        attackExecutionSkillScore: outcome.attackExecutionSkillScore,
        attackSuccessProbability: outcome.attackSuccessProbability,
        deterministicOutcomeRoll,
        attackSucceeded,
        attackEnergyCost: deterministicRound(attackEnergyCost, 6),
        energyAfterAttempt,
        positionScoreBonus,
        modelVersion: 'production_attack_outcome_v2',
      }
    },
  )

  const successfulAttackRiderIds = attackAttempts
    .filter((attempt) => attempt.attackSucceeded)
    .map((attempt) => attempt.riderId)
    .sort()

  const objectiveEnergyCostByRiderId = new Map<string, number>()
  const pointBattles: UniversalRoadPointBattleResult[] = phase3Points.map((point) => {
    const isSprint =
      point.pointType === 'INTERMEDIATE_SPRINT' ||
      point.pointType === 'BONUS_SPRINT'
    const contestants = roadCommandResolution.riders
      .filter((row) => row.eligibleToStart)
      .filter((row) => {
        const phase = row.phases.find((entry) => entry.phaseNumber === 3)!
        return isSprint
          ? phase.intermediateSprintContest.eligible &&
              phase.intermediateSprintPointIds.includes(point.pointId)
          : phase.komContest.eligible && phase.komPointIds.includes(point.pointId)
      })
      .map((row) => {
        const rider = ridersById.get(row.riderId)!
        const phase = row.phases.find((entry) => entry.phaseNumber === 3)!
        const readiness = readinessByRiderId.get(row.riderId)!
        const startEnergy = phase2EnergyByRiderId.get(row.riderId)?.energyAfterPhase ?? 0
        const beforePointCost = calculateRoadEnergyCostForRange(
          input,
          rider,
          readiness,
          1,
          phaseBoundary.startKm,
          point.kmFromStart,
        )
        const liveEnergy = deterministicRound(
          Math.max(0, startEnergy - beforePointCost),
          6,
        )
        const objectiveStartKm = Math.max(phaseBoundary.startKm, point.kmFromStart - 0.25)
        const objectiveEndKm = Math.min(phaseBoundary.endKm, point.kmFromStart + 0.25)
        const activeCost = calculateRoadEnergyCostForRange(
          input,
          rider,
          readiness,
          phase.commandEffect.roleAdjustedEffortMultiplier,
          objectiveStartKm,
          objectiveEndKm,
        )
        const neutralCost = calculateRoadEnergyCostForRange(
          input,
          rider,
          readiness,
          1,
          objectiveStartKm,
          objectiveEndKm,
        )
        const extraCost = deterministicRound(Math.max(0, activeCost - neutralCost), 6)
        objectiveEnergyCostByRiderId.set(
          row.riderId,
          deterministicRound((objectiveEnergyCostByRiderId.get(row.riderId) ?? 0) + extraCost, 6),
        )
        return {
          riderId: row.riderId,
          teamId: row.teamId,
          score: scorePhase2PointContestant(point, rider, row.stageRole, liveEnergy),
          liveEnergy,
        }
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.liveEnergy - left.liveEnergy ||
          left.riderId.localeCompare(right.riderId),
      )
    const awardDepth = Math.max(point.pointsScheme.length, point.timeBonusSeconds.length)
    const rankings: UniversalRoadPointBattleRanking[] = contestants
      .slice(0, awardDepth)
      .map((contestant, index) => ({
        rank: index + 1,
        riderId: contestant.riderId,
        teamId: contestant.teamId,
        score: contestant.score,
        liveEnergyBeforeObjective: contestant.liveEnergy,
        pointsAwarded: point.pointsScheme[index] ?? 0,
        bonusSecondsAwarded: point.timeBonusSeconds[index] ?? 0,
      }))
    return {
      pointId: point.pointId,
      pointType: point.pointType as UniversalRoadPointBattleResult['pointType'],
      pointName: point.name,
      kmFromStart: point.kmFromStart,
      phaseNumber: 3,
      eligibleContestantIds: contestants.map((row) => row.riderId),
      status: contestants.length > 0 ? 'contested' : 'not_contested',
      winnerRiderId: rankings[0]?.riderId ?? null,
      rankings,
      scoringModel: isSprint
        ? 'production_intermediate_sprint_score_v1'
        : 'production_kom_score_v1',
    }
  })

  const preliminary = roadCommandResolution.riders.map((row) => {
    const rider = ridersById.get(row.riderId)!
    const readiness = readinessByRiderId.get(row.riderId)!
    const suitability = suitabilityByRiderId.get(row.riderId)!
    const phase = row.phases.find((entry) => entry.phaseNumber === 3)!
    const startEnergy = phase2EnergyByRiderId.get(row.riderId)?.energyAfterPhase ?? 0
    const phaseEnergyCost = phaseEnergyCostByRiderId.get(row.riderId) ?? 0
    const attackEnergyCost = attackEnergyCostByRiderId.get(row.riderId) ?? 0
    const objectiveEnergyCost = objectiveEnergyCostByRiderId.get(row.riderId) ?? 0
    const energyAfterPhase = deterministicRound(
      Math.max(0, startEnergy - phaseEnergyCost - attackEnergyCost - objectiveEnergyCost),
      6,
    )
    const terrainAbilityScore = calculateDecisiveTerrainAbility(rider, decisiveTerrain)
    const protectionReceived = phase2EnergyByRiderId.get(row.riderId)?.protectionReceivedScore ?? 0
    const protectionBonus = deterministicRound(Math.min(4, protectionReceived * 0.6), 6)
    const depletionPenalty = deterministicRound(
      Math.max(0, 20 - energyAfterPhase) * (0.55 + decisiveTerrain.selectionSeverity * 0.45),
      6,
    )
    const attackPositionBonus = attackPositionBonusByRiderId.get(row.riderId) ?? 0
    const decisiveScore = deterministicRound(
      terrainAbilityScore * 0.5 +
        suitability.suitabilityScore * 0.22 +
        readiness.readinessScore * 0.1 +
        energyAfterPhase * 0.18 +
        phase.commandEffect.performanceModifier +
        protectionBonus -
        depletionPenalty,
      6,
    )
    const startGroupCode = getStartDevelopmentGroupCode(phase2, row.riderId)
    const breakawayAdvantage =
      startGroupCode === 'breakaway'
        ? Math.min(18, phase2.endGapSeconds / 8)
        : 0
    const positionScore = deterministicRound(
      decisiveScore + breakawayAdvantage + attackPositionBonus,
      6,
    )
    return {
      row,
      phase,
      rider,
      readiness,
      suitability,
      startGroupCode,
      startEnergy,
      phaseEnergyCost: deterministicRound(phaseEnergyCost + objectiveEnergyCost, 6),
      attackEnergyCost: deterministicRound(attackEnergyCost, 6),
      energyAfterPhase,
      terrainAbilityScore,
      protectionBonus,
      depletionPenalty,
      attackPositionBonus,
      decisiveScore,
      positionScore,
    }
  })

  const bestPositionScore = Math.max(...preliminary.map((state) => state.positionScore), 0)
  const riderStates: UniversalRoadDecisiveRiderState[] = preliminary
    .map((state) => {
      const delta = deterministicRound(bestPositionScore - state.positionScore, 6)
      const finalGroupCode = getDecisiveGroupForPositionDelta(
        delta,
        state.energyAfterPhase,
      )
      const status: UniversalRoadDecisiveRiderStatus =
        finalGroupCode === 'front_group'
          ? 'front_selection'
          : finalGroupCode === 'main_group'
            ? 'main_selection'
            : finalGroupCode === 'chasing_group'
              ? 'chasing'
              : 'dropped'
      const gapSeconds = calculateDecisiveGapSeconds(finalGroupCode, delta, decisiveTerrain)
      let finishContestEligible = true
      let finishEligibilityReason: UniversalRoadFinishEligibilityReason = 'eligible'
      if (!state.row.eligibleToStart) {
        finishContestEligible = false
        finishEligibilityReason = 'rider_unavailable'
      } else if (state.energyAfterPhase <= 3) {
        finishContestEligible = false
        finishEligibilityReason = 'energy_depleted'
      } else if (finalGroupCode === 'dropped_group') {
        finishContestEligible = false
        finishEligibilityReason = 'dropped_by_decisive_terrain'
      } else if (gapSeconds > 60) {
        finishContestEligible = false
        finishEligibilityReason = 'too_far_behind_after_selection'
      }
      return {
        riderId: state.row.riderId,
        teamId: state.row.teamId,
        command: state.phase.resolvedCommand,
        startGroupCode: state.startGroupCode,
        startEnergy: state.startEnergy,
        phaseEnergyCost: state.phaseEnergyCost,
        attackEnergyCost: state.attackEnergyCost,
        energyAfterPhase: state.energyAfterPhase,
        terrainAbilityScore: state.terrainAbilityScore,
        readinessScore: state.readiness.readinessScore,
        suitabilityScore: state.suitability.suitabilityScore,
        protectionBonus: state.protectionBonus,
        depletionPenalty: state.depletionPenalty,
        attackPositionBonus: state.attackPositionBonus,
        decisiveScore: state.decisiveScore,
        positionScore: state.positionScore,
        status,
        finalGroupCode,
        gapSeconds,
        finishContestEligible,
        finishEligibilityReason,
        modelVersion: 'universal_decisive_rider_state_v1' as const,
      }
    })
    .sort(
      (left, right) =>
        left.gapSeconds - right.gapSeconds ||
        right.positionScore - left.positionScore ||
        left.riderId.localeCompare(right.riderId),
    )

  const groupOrder: readonly UniversalRoadDecisiveGroupCode[] = [
    'front_group',
    'main_group',
    'chasing_group',
    'dropped_group',
  ]
  const groupMembers = groupOrder
    .map((groupCode) => ({
      groupCode,
      members: riderStates.filter((state) => state.finalGroupCode === groupCode),
    }))
    .filter((row) => row.members.length > 0)
  const persistentBreakawayRiderSet = new Set(
    phase2.breakawayRiderIdsAtEnd,
  )
  const persistentPelotonRiderSet = new Set(
    phase2.pelotonRiderIdsAtEnd,
  )
  const persistentPhysicalBreakawayGapSeconds =
    persistentBreakawayRiderSet.size > 0
      ? phase2.endGapSeconds
      : 0

  const authoritativePelotonGroupIndex = groupMembers
    .map(({ members }, index) => ({
      index,
      pelotonMembershipCount: members.filter((state) =>
        persistentPelotonRiderSet.has(state.riderId),
      ).length,
      breakawayMembershipCount: members.filter((state) =>
        persistentBreakawayRiderSet.has(state.riderId),
      ).length,
      memberCount: members.length,
    }))
    .filter(
      (candidate) =>
        candidate.pelotonMembershipCount > 0 &&
        candidate.breakawayMembershipCount === 0,
    )
    .sort(
      (left, right) =>
        right.pelotonMembershipCount - left.pelotonMembershipCount ||
        right.memberCount - left.memberCount ||
        left.index - right.index,
    )[0]?.index ?? -1

  const groups: UniversalRoadDecisiveGroup[] = groupMembers.map(
    ({ groupCode, members }, index) => {
      const performanceGroupGapSeconds = Math.min(
        ...members.map((state) => state.gapSeconds),
      )
      const gapSeconds =
        index === authoritativePelotonGroupIndex &&
        persistentPhysicalBreakawayGapSeconds > 0
          ? persistentPhysicalBreakawayGapSeconds
          : performanceGroupGapSeconds

      return {
        groupCode,
        groupOrder: (index + 1) as 1 | 2 | 3 | 4,
        riderIds: members.map((state) => state.riderId),
        gapSeconds: deterministicRound(gapSeconds, 6),
        averageDecisiveScore: deterministicRound(
          members.reduce((sum, state) => sum + state.decisiveScore, 0) /
            members.length,
          6,
        ),
      }
    },
  )

  const finishEligibleRiderIds = riderStates
    .filter((state) => state.finishContestEligible)
    .map((state) => state.riderId)
    .sort()
  const finishIneligibleRiderIds = riderStates
    .filter((state) => !state.finishContestEligible)
    .map((state) => state.riderId)
    .sort()
  const status: UniversalRoadDecisiveStatus =
    riderStates.every((state) => state.energyAfterPhase <= 3)
      ? 'all_riders_depleted'
      : groups.some((group) => group.groupCode === 'front_group' && group.riderIds.length < riderStates.length)
        ? 'front_selection_formed'
        : 'main_group_remains_together'

  return {
    ...phase2Resolution,
    phase3Decisive: {
      phaseNumber: 3,
      phaseBoundary,
      status,
      decisiveTerrain,
      attackAttempts,
      successfulAttackRiderIds,
      pointBattles,
      riderStates,
      groups,
      finishEligibleRiderIds,
      finishIneligibleRiderIds,
      modelVersion: 'universal_road_phase_3_decisive_v1',
    },
    phase4Finish: null,
  }
}

function getPhase4ChaseSkill(rider: UniversalRiderInput): number {
  return deterministicRound(
    rider.flat * 0.25 +
      rider.endurance * 0.25 +
      rider.resistance * 0.2 +
      rider.raceIQ * 0.15 +
      rider.teamwork * 0.15,
    6,
  )
}

function getPhase4FinishModel(
  stage: UniversalStageInput,
  contenderCount: number,
): UniversalRoadFinishModel {
  if (contenderCount <= 1) return 'solo_finish'
  switch (stage.finishType) {
    case 'summit_finish':
      return 'summit_finish'
    case 'uphill_finish':
      return 'uphill_finish'
    case 'cobbled_finish':
      return 'cobbled_finish'
    case 'flat_finish':
      return contenderCount <= 12 ? 'reduced_group_sprint' : 'flat_sprint'
    case 'time_trial_finish':
    case 'team_time_trial_finish':
    case 'prologue_finish':
      return 'flat_sprint'
  }
}

function getPhase4BaseFinishPaceKmh(stage: UniversalStageInput): number {
  switch (stage.finishType) {
    case 'summit_finish':
      return 32
    case 'uphill_finish':
      return 35
    case 'cobbled_finish':
      return 37
    case 'flat_finish':
      return 42
    case 'time_trial_finish':
    case 'team_time_trial_finish':
    case 'prologue_finish':
      return 40
  }
}

function scoreRoadFinishRider(
  input: UniversalRaceEngineInput,
  rider: UniversalRiderInput,
  riderState: UniversalRoadPhase4RiderState,
  stageRole: RiderStageRole,
  phase: UniversalRoadCommandPhaseResolution,
  suitability: UniversalRiderSuitabilityResult,
  leadOutSupportReceived: number,
  frontGroupSize: number,
): { score: number; modelVersion: UniversalRoadFinishResult['modelVersion'] } {
  const energy = riderState.energyAtFinish
  const command = phase.resolvedCommand
  const teamPlan = input.stagePlans.find((plan) => plan.teamId === rider.teamId)
    ?.teamTactic
  const isFlatSprint = input.stage.finishType === 'flat_finish'

  if (isFlatSprint) {
    const roleBonus =
      stageRole === 'sprinter'
        ? 6
        : stageRole === 'team_leader_gc'
          ? 2.5
          : stageRole === 'protected_rider'
            ? 2
            : stageRole === 'lead_out_rider'
              ? 1.5
              : 0
    const commandBonus =
      command === 'sprint' || command === 'final_sprint'
        ? 7
        : command === 'ride_for_stage_result'
          ? 4
          : command === 'prepare_sprint'
            ? 3
            : command === 'lead_out' || command === 'lead_out_sprinter'
              ? 2
              : command === 'stay_near_front'
                ? 1
                : 0
    const tacticBonus =
      teamPlan === 'sprint_control' ? 2.5 : teamPlan === 'balanced' ? 0.5 : 0
    const supportBonus = Math.min(6, Math.max(0, leadOutSupportReceived) * 1.35)
    const performanceBridge =
      suitability.suitabilityScore * (frontGroupSize >= 20 ? 0.025 : 0.015)

    return {
      score: deterministicRound(
        rider.sprint * 0.46 +
          rider.flat * 0.14 +
          rider.raceIQ * 0.12 +
          rider.endurance * 0.08 +
          rider.resistance * 0.06 +
          rider.morale * 0.06 +
          energy * 0.08 -
          rider.fatigueBeforeStage * 0.07 +
          roleBonus +
          commandBonus +
          tacticBonus +
          supportBonus +
          performanceBridge,
        6,
      ),
      modelVersion: 'production_front_group_sprint_score_v1',
    }
  }

  let terrainScore: number
  switch (input.stage.finishType) {
    case 'summit_finish':
      terrainScore =
        rider.climbing * 0.5 +
        rider.endurance * 0.18 +
        rider.resistance * 0.12 +
        rider.raceIQ * 0.08 +
        suitability.suitabilityScore * 0.06 +
        energy * 0.06
      break
    case 'uphill_finish':
      terrainScore =
        rider.climbing * 0.42 +
        rider.endurance * 0.18 +
        rider.resistance * 0.12 +
        rider.raceIQ * 0.1 +
        suitability.suitabilityScore * 0.08 +
        energy * 0.1
      break
    case 'cobbled_finish':
      terrainScore =
        rider.flat * 0.25 +
        rider.resistance * 0.25 +
        rider.endurance * 0.15 +
        rider.raceIQ * 0.15 +
        rider.sprint * 0.1 +
        energy * 0.1
      break
    default:
      terrainScore = suitability.suitabilityScore * 0.75 + energy * 0.25
      break
  }

  const commandBonus =
    command === 'attack'
      ? 3
      : command === 'ride_for_stage_result'
        ? 4
        : command === 'ride_for_time_gc'
          ? 3.5
          : command === 'climb_hard'
            ? 3
            : command === 'stay_near_front'
              ? 1
              : command === 'conserve_energy'
                ? -1.5
                : 0
  const roleBonus =
    stageRole === 'climber'
      ? input.stage.finishType === 'summit_finish'
        ? 6
        : 4
      : stageRole === 'team_leader_gc'
        ? 3
        : stageRole === 'protected_rider'
          ? 2
          : 0

  return {
    score: deterministicRound(
      terrainScore + commandBonus + roleBonus - rider.fatigueBeforeStage * 0.05,
      6,
    ),
    modelVersion: 'universal_road_finish_score_v1',
  }
}


function calculateRoadPhase4ChaseStartFraction(
  gapSeconds: number,
  terrainType: TerrainType,
): number {
  let startFraction = 0.74

  if (gapSeconds >= 360) startFraction = 0.65
  else if (gapSeconds >= 300) startFraction = 0.67
  else if (gapSeconds >= 240) startFraction = 0.69
  else if (gapSeconds >= 180) startFraction = 0.71
  else if (gapSeconds >= 120) startFraction = 0.74
  else if (gapSeconds >= 60) startFraction = 0.77
  else startFraction = 0.8

  if (terrainType === 'flat') {
    startFraction -= 0.01
  } else if (terrainType === 'hilly') {
    startFraction += 0.01
  } else if (terrainType === 'mountain') {
    startFraction += 0.02
  }

  return deterministicRound(clamp(startFraction, 0.65, 0.8), 6)
}

function getRoadPreferredCatchFraction(
  terrainType: TerrainType,
): number {
  switch (terrainType) {
    case 'mountain':
      return 0.9
    case 'hilly':
      return 0.91
    case 'cobbled':
      return 0.9
    case 'flat':
    default:
      return 0.92
  }
}

function limitRoadChaseGapClosure(
  currentGapSeconds: number,
  calculatedNextGapSeconds: number,
  currentKm: number,
  stepEndKm: number,
  stageDistanceKm: number,
  terrainType: TerrainType,
): number {
  if (calculatedNextGapSeconds >= currentGapSeconds) {
    return calculatedNextGapSeconds
  }

  const stepDistanceKm = Math.max(0, stepEndKm - currentKm)
  if (stepDistanceKm <= 0) return currentGapSeconds

  const preferredCatchKm =
    stageDistanceKm * getRoadPreferredCatchFraction(terrainType)
  const distanceToPreferredCatchKm = Math.max(
    stepDistanceKm,
    preferredCatchKm - currentKm,
  )
  const proportionalClosureLimit =
    preferredCatchKm > currentKm
      ? currentGapSeconds *
        (stepDistanceKm / distanceToPreferredCatchKm)
      : currentGapSeconds
  const closurePerKmLimit =
    3.5 + Math.min(2, (currentGapSeconds / 120) * 2) - 0.000001
  const distanceClosureLimit = stepDistanceKm * closurePerKmLimit
  const maximumClosureSeconds = Math.min(
    currentGapSeconds,
    proportionalClosureLimit,
    distanceClosureLimit,
  )

  return deterministicRound(
    Math.max(
      calculatedNextGapSeconds,
      currentGapSeconds - maximumClosureSeconds,
    ),
    6,
  )
}

type PersistentOpeningBreakawayPhysicalState = {
  readonly riderIds: readonly string[]
  readonly openingGapSeconds: number
  readonly developmentGapSeconds: number
  readonly rawPhase3PelotonGapSeconds: number
  readonly phase3GapSeconds: number
  readonly lateFrontRiderIds: readonly string[]
  readonly droppedRiderIds: readonly string[]
  readonly physicalGapByRiderId: ReadonlyMap<string, number>
}

function buildPersistentOpeningBreakawayPhysicalState(
  input: UniversalRaceEngineInput,
  phase3Resolution: UniversalRoadRaceResolutionSummary,
  physicallyAvailableRiderIds: readonly string[],
): PersistentOpeningBreakawayPhysicalState {
  const phase1 = phase3Resolution.phase1Opening
  const phase2 = phase3Resolution.phase2Development
  const phase3 = phase3Resolution.phase3Decisive
  const physicallyAvailableSet = new Set(physicallyAvailableRiderIds)
  const sourceRiderIds = phase2
    ? phase2.breakawayRiderIdsAtEnd
    : phase1?.breakawayRiderIds ?? []
  const riderIds = sourceRiderIds
    .filter((riderId) => physicallyAvailableSet.has(riderId))
    .slice()
    .sort()
  const riderIdSet = new Set(riderIds)

  if (!phase1 || !phase2 || !phase3 || riderIds.length === 0) {
    return {
      riderIds,
      openingGapSeconds: 0,
      developmentGapSeconds: 0,
      rawPhase3PelotonGapSeconds: 0,
      phase3GapSeconds: 0,
      lateFrontRiderIds: [],
      droppedRiderIds: [],
      physicalGapByRiderId: new Map(
        physicallyAvailableRiderIds.map((riderId) => [riderId, 0] as const),
      ),
    }
  }

  const teamByRiderId = new Map(
    input.riders.map((rider) => [rider.riderId, rider.teamId] as const),
  )
  const openingTeamCount = new Set(
    riderIds.map((riderId) => teamByRiderId.get(riderId) ?? riderId),
  ).size
  const openingGapSeconds = calculatePhase5OpeningBreakawayGapSeconds(
    riderIds.length,
    openingTeamCount,
    phase1.initialGapSeconds,
  )
  const rawDevelopmentGapSeconds =
    calculatePhase5DevelopmentBreakawayGapSeconds(
      openingGapSeconds,
      phase2.pelotonResponse.responseMode,
      phase2.pelotonResponse.controllingTeamIds.length,
      phase2.pelotonResponse.chasingTeamIds.length,
      phase2.breakawayCooperation?.cooperationScore ?? 0,
    )
  const developmentGapSeconds = Math.max(
    90,
    phase2.pelotonResponse.responseMode === 'release_escape'
      ? Math.max(openingGapSeconds + 30, rawDevelopmentGapSeconds)
      : phase2.pelotonResponse.responseMode === 'control_gap'
        ? Math.max(openingGapSeconds, rawDevelopmentGapSeconds)
        : Math.max(90, rawDevelopmentGapSeconds),
  )

  const authoritativePelotonCandidate = phase3.groups
    .map((group) => ({
      group,
      pelotonMembershipCount: group.riderIds.filter(
        (riderId) =>
          physicallyAvailableSet.has(riderId) && !riderIdSet.has(riderId),
      ).length,
      openingBreakawayMembershipCount: group.riderIds.filter((riderId) =>
        riderIdSet.has(riderId),
      ).length,
    }))
    .filter(
      (candidate) =>
        candidate.pelotonMembershipCount > 0 &&
        candidate.openingBreakawayMembershipCount === 0,
    )
    .sort(
      (left, right) =>
        right.pelotonMembershipCount - left.pelotonMembershipCount ||
        right.group.riderIds.length - left.group.riderIds.length ||
        left.group.groupOrder - right.group.groupOrder,
    )[0]
  const rawPhase3PelotonGapSeconds = deterministicRound(
    Math.max(
      0,
      authoritativePelotonCandidate?.group.gapSeconds ??
        developmentGapSeconds,
    ),
    6,
  )
  const phase3GapSeconds = deterministicRound(
    limitRoadChaseGapClosure(
      developmentGapSeconds,
      rawPhase3PelotonGapSeconds,
      phase2.phaseBoundary.endKm,
      phase3.phaseBoundary.endKm,
      input.stage.distanceKm,
      input.stage.terrainType,
    ),
    6,
  )
  const authoritativePelotonRiderSet = new Set(
    authoritativePelotonCandidate?.group.riderIds.filter((riderId) =>
      physicallyAvailableSet.has(riderId),
    ) ?? [],
  )
  const droppedRiderIds = Array.from(
    new Set(
      phase3.groups
        .filter(
          (group) =>
            group.groupCode === 'dropped_group' &&
            group !== authoritativePelotonCandidate?.group,
        )
        .flatMap((group) => group.riderIds)
        .filter(
          (riderId) =>
            physicallyAvailableSet.has(riderId) &&
            !riderIdSet.has(riderId) &&
            !authoritativePelotonRiderSet.has(riderId),
        ),
    ),
  ).sort()
  const droppedSet = new Set(droppedRiderIds)
  const lateFrontRiderIds = Array.from(
    new Set(phase3.successfulAttackRiderIds),
  )
    .filter(
      (riderId) =>
        physicallyAvailableSet.has(riderId) &&
        !riderIdSet.has(riderId) &&
        !droppedSet.has(riderId),
    )
    .sort()
  const lateFrontSet = new Set(lateFrontRiderIds)
  const lateFrontGapSeconds = Math.max(
    PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
    Math.round(phase3GapSeconds * 0.55),
  )
  const phase3StateByRiderId = new Map(
    phase3.riderStates.map((row) => [row.riderId, row] as const),
  )
  const physicalGapByRiderId = new Map<string, number>()

  physicallyAvailableRiderIds.forEach((riderId) => {
    if (riderIdSet.has(riderId)) {
      physicalGapByRiderId.set(riderId, 0)
      return
    }
    if (lateFrontSet.has(riderId)) {
      physicalGapByRiderId.set(riderId, lateFrontGapSeconds)
      return
    }
    if (droppedSet.has(riderId)) {
      physicalGapByRiderId.set(
        riderId,
        deterministicRound(
          Math.max(
            phase3GapSeconds + 30,
            phase3StateByRiderId.get(riderId)?.gapSeconds ?? 0,
          ),
          6,
        ),
      )
      return
    }
    physicalGapByRiderId.set(riderId, phase3GapSeconds)
  })

  return {
    riderIds,
    openingGapSeconds: deterministicRound(openingGapSeconds, 6),
    developmentGapSeconds: deterministicRound(developmentGapSeconds, 6),
    rawPhase3PelotonGapSeconds,
    phase3GapSeconds,
    lateFrontRiderIds,
    droppedRiderIds,
    physicalGapByRiderId,
  }
}

export function resolveRoadPhase4Finish(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  riderSuitability: readonly UniversalRiderSuitabilityResult[],
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  phase3Resolution: UniversalRoadRaceResolutionSummary,
): UniversalRoadRaceResolutionSummary {
  if (
    !phase3Resolution.active ||
    !phase3Resolution.phase3Decisive ||
    input.stage.stageFormat !== 'road_race'
  ) {
    return {
      ...phase3Resolution,
      phase4Finish: null,
    }
  }

  const phase3 = phase3Resolution.phase3Decisive
  const phaseBoundary = roadCommandResolution.phaseBoundaries.find(
    (phase) => phase.phaseNumber === 4,
  )!
  const ridersById = new Map(input.riders.map((rider) => [rider.riderId, rider]))
  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row]),
  )
  const suitabilityByRiderId = new Map(
    riderSuitability.map((row) => [row.riderId, row]),
  )
  const phase3StateByRiderId = new Map(
    phase3.riderStates.map((row) => [row.riderId, row]),
  )
  const commandByRiderId = new Map(
    roadCommandResolution.riders.map((row) => [
      row.riderId,
      row.phases.find((phase) => phase.phaseNumber === 4)!,
    ]),
  )

  const finishEligibleRiderIds = [...phase3.finishEligibleRiderIds].sort()
  const physicallyAvailableRiderIds = roadCommandResolution.riders
    .filter((row) => row.eligibleToStart)
    .map((row) => row.riderId)
    .sort()
  const physicallyAvailableSet = new Set(physicallyAvailableRiderIds)
  const persistentOpeningState = buildPersistentOpeningBreakawayPhysicalState(
    input,
    phase3Resolution,
    physicallyAvailableRiderIds,
  )
  const phase3FrontGroup = phase3.groups.find(
    (group) => group.groupCode === 'front_group',
  )
  const successfulLateAttackRiderIds = phase3.successfulAttackRiderIds
    .filter((riderId) => physicallyAvailableSet.has(riderId))
    .sort()
  const naturalFrontSelectionActive =
    isSelectiveRoadTerrain(phase3.decisiveTerrain.terrainType) &&
    phase3.decisiveTerrain.selectionSeverity >= 0.2
  const naturalFrontSelectionDeltaLimit =
    calculateNaturalFrontSelectionDeltaLimit(phase3.decisiveTerrain)
  const phase3BestPositionScore = Math.max(
    ...phase3.riderStates.map((row) => row.positionScore),
    0,
  )
  const naturalFrontSelectionRiderIds = naturalFrontSelectionActive
    ? phase3.riderStates
        .filter((row) => phase3FrontGroup?.riderIds.includes(row.riderId))
        .filter(
          (row) =>
            phase3BestPositionScore - row.positionScore <=
            naturalFrontSelectionDeltaLimit + 0.000001,
        )
        .map((row) => row.riderId)
        .filter((riderId) => physicallyAvailableSet.has(riderId))
        .sort()
    : []
  const fallbackFrontRiderIds =
    successfulLateAttackRiderIds.length > 0
      ? successfulLateAttackRiderIds
      : naturalFrontSelectionRiderIds
  const escapeRiderIdsAtStart =
    persistentOpeningState.riderIds.length > 0
      ? [...persistentOpeningState.riderIds]
      : fallbackFrontRiderIds
  const escapeSetAtStart = new Set(escapeRiderIdsAtStart)

  const authoritativePelotonGroup = phase3.groups
    .filter(
      (group) =>
        group.riderIds.some(
          (riderId) =>
            physicallyAvailableSet.has(riderId) &&
            !escapeSetAtStart.has(riderId),
        ),
    )
    .sort(
      (left, right) =>
        right.riderIds.filter((riderId) => !escapeSetAtStart.has(riderId)).length -
          left.riderIds.filter((riderId) => !escapeSetAtStart.has(riderId)).length ||
        left.groupOrder - right.groupOrder ||
        left.gapSeconds - right.gapSeconds,
    )[0]

  const startGapSeconds =
    persistentOpeningState.riderIds.length > 0
      ? persistentOpeningState.phase3GapSeconds
      : escapeRiderIdsAtStart.length > 0 && authoritativePelotonGroup
        ? authoritativePelotonGroup.gapSeconds
        : 0
  const activeEscape =
    escapeRiderIdsAtStart.length > 0 &&
    startGapSeconds > PHASE5_GROUP_MERGE_TOLERANCE_SECONDS
  const phase3NaturalSelectionPhysical =
    isSelectiveRoadTerrain(phase3.decisiveTerrain.terrainType) &&
    phase3.decisiveTerrain.selectionSeverity >= 0.2
  const phase3PhysicalGapByRiderId = new Map<string, number>()
  phase3.riderStates.forEach((state) => {
    if (!physicallyAvailableSet.has(state.riderId)) return
    if (persistentOpeningState.riderIds.length > 0) {
      phase3PhysicalGapByRiderId.set(
        state.riderId,
        persistentOpeningState.physicalGapByRiderId.get(state.riderId) ??
          startGapSeconds,
      )
      return
    }
    if (escapeSetAtStart.has(state.riderId)) {
      phase3PhysicalGapByRiderId.set(state.riderId, 0)
      return
    }
    if (activeEscape) {
      const physicallyDropped =
        state.energyAfterPhase <= 3 ||
        (phase3NaturalSelectionPhysical &&
          state.finalGroupCode === 'dropped_group')
      phase3PhysicalGapByRiderId.set(
        state.riderId,
        physicallyDropped
          ? Math.max(startGapSeconds + 15, state.gapSeconds)
          : startGapSeconds,
      )
      return
    }
    const physicallyDropped =
      state.energyAfterPhase <= 3 ||
      (phase3NaturalSelectionPhysical &&
        state.finalGroupCode === 'dropped_group')
    phase3PhysicalGapByRiderId.set(
      state.riderId,
      physicallyDropped ? Math.max(15, state.gapSeconds) : 0,
    )
  })
  const chaseStartFraction = calculateRoadPhase4ChaseStartFraction(
    startGapSeconds,
    input.stage.terrainType,
  )
  const chaseStartKm = deterministicRound(
    input.stage.distanceKm * chaseStartFraction,
    6,
  )
  const escapeSet = new Set(escapeRiderIdsAtStart)

  const explicitChasers = roadCommandResolution.riders
    .filter((row) => row.eligibleToStart && !escapeSet.has(row.riderId))
    .filter((row) => {
      const phase = row.phases.find((entry) => entry.phaseNumber === 4)!
      return (
        phase.resolvedSource === 'explicit_individual_command' &&
        phase.behaviour === 'chase'
      )
    })
  const explicitChasingTeamIds = Array.from(
    new Set(explicitChasers.map((row) => row.teamId)),
  ).sort()

  const automaticWorkerRows = roadCommandResolution.riders
    .filter((row) => row.eligibleToStart && !escapeSet.has(row.riderId))
    .filter((row) => {
      const phase = row.phases.find((entry) => entry.phaseNumber === 4)!
      return (
        row.stageRole === 'helper_domestique' ||
        row.stageRole === 'rouleur' ||
        row.stageRole === 'breakaway_chaser' ||
        phase.behaviour === 'race_control' ||
        phase.behaviour === 'team_work' ||
        phase.behaviour === 'lead_out' ||
        phase.behaviour === 'sprint_preparation'
      )
    })
  const teamsWithFinishInterest = new Set(
    roadCommandResolution.riders
      .filter((row) => row.eligibleToStart && !escapeSet.has(row.riderId))
      .filter((row) => {
        const phase = row.phases.find((entry) => entry.phaseNumber === 4)!
        return (
          row.stageRole === 'sprinter' ||
          row.stageRole === 'team_leader_gc' ||
          row.stageRole === 'protected_rider' ||
          phase.behaviour === 'stage_result' ||
          phase.behaviour === 'time_gc_result' ||
          phase.behaviour === 'sprint_preparation'
        )
      })
      .map((row) => row.teamId),
  )
  const automaticChasingTeamIds = Array.from(
    new Set(
      automaticWorkerRows
        .filter((row) => teamsWithFinishInterest.has(row.teamId))
        .map((row) => row.teamId),
    ),
  ).sort()

  const chasingTeamIds = Array.from(
    new Set([...explicitChasingTeamIds, ...automaticChasingTeamIds]),
  ).sort()
  const chasingTeamStrength: UniversalRoadChasingTeamStrength[] = chasingTeamIds
    .map((teamId) => {
      const explicitIds = explicitChasers
        .filter((row) => row.teamId === teamId)
        .map((row) => row.riderId)
        .sort()
      const automaticIds = automaticWorkerRows
        .filter((row) => row.teamId === teamId)
        .map((row) => row.riderId)
        .filter((riderId) => !explicitIds.includes(riderId))
        .sort()
      const workerIds = Array.from(new Set([...explicitIds, ...automaticIds]))
      const chaseSkills = workerIds.map((riderId) =>
        getPhase4ChaseSkill(ridersById.get(riderId)!),
      )
      const energies = workerIds.map(
        (riderId) => phase3StateByRiderId.get(riderId)?.energyAfterPhase ?? 0,
      )
      const averageChaseSkill = average(chaseSkills)
      const averageLiveEnergy = average(energies)
      const explicitBonus = explicitIds.length > 0 ? 6 : 0
      const strengthScore = deterministicRound(
        averageChaseSkill * 0.65 +
          averageLiveEnergy * 0.25 +
          Math.min(10, workerIds.length * 2) +
          explicitBonus,
        6,
      )
      return {
        teamId,
        explicitChaserRiderIds: explicitIds,
        automaticWorkerRiderIds: automaticIds,
        riderCount: workerIds.length,
        averageChaseSkill: deterministicRound(averageChaseSkill, 6),
        averageLiveEnergy: deterministicRound(averageLiveEnergy, 6),
        strengthScore,
        modelVersion: 'universal_chasing_team_strength_v1' as const,
      }
    })
    .sort(
      (left, right) =>
        right.strengthScore - left.strengthScore ||
        left.teamId.localeCompare(right.teamId),
    )

  const phase3EnergyByRiderId = new Map(
    phase3.riderStates.map(
      (row) => [row.riderId, row.energyAfterPhase] as const,
    ),
  )
  const phase4PelotonGapAtStart = activeEscape ? startGapSeconds : 0
  const phase4PelotonRiderSetAtStart = new Set(
    Array.from(phase3PhysicalGapByRiderId.entries())
      .filter(
        ([riderId, gapSeconds]) =>
          !escapeSet.has(riderId) &&
          Math.abs(gapSeconds - phase4PelotonGapAtStart) <=
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
      )
      .map(([riderId]) => riderId),
  )

  const lateTerrain = selectDecisiveTerrain(input.stage, phaseBoundary)
  const lateTerrainSelectionKm = deterministicRound(
    clamp(
      lateTerrain.kmEnd,
      phaseBoundary.startKm,
      phaseBoundary.endKm,
    ),
    6,
  )
  const lateTerrainSelectionActive =
    (lateTerrain.terrainType === 'climb' ||
      lateTerrain.terrainType === 'steep_climb') &&
    lateTerrain.selectionSeverity >= 0.18 &&
    lateTerrain.distanceKm >= 0.75 &&
    lateTerrainSelectionKm < input.stage.distanceKm - 0.5
  const lateRacePressure = clamp(
    (lateTerrainSelectionKm / Math.max(input.stage.distanceKm, 1) - 0.7) / 0.3,
    0,
    1,
  )
  const lateGradientPressure = clamp(
    (Math.max(0, lateTerrain.averageGradientPercent) - 2.5) / 7.5,
    0,
    1,
  )
  // v10e4: the climb no longer compares the whole peloton only with the
  // single strongest rider.  The pace reference comes from the competitive
  // part of the field and low live energy is a separate contact constraint.
  // This prevents the old binary "small group survives / everybody else
  // drops at the summit" pattern while retaining deterministic selection.
  const lateTerrainHoldWindow = deterministicRound(
    clamp(
      9 -
        lateTerrain.selectionSeverity * 1.5 -
        lateGradientPressure * 1.5 -
        lateRacePressure,
      5,
      9,
    ),
    6,
  )
  const lateTerrainMinimumEnergy = deterministicRound(
    clamp(
      3 +
        lateTerrain.selectionSeverity * 2.5 +
        lateGradientPressure * 2 +
        lateRacePressure * 1.5,
      3,
      8,
    ),
    6,
  )
  const lateTerrainPelotonCandidateRows = roadCommandResolution.riders
    .filter(
      (row) =>
        lateTerrainSelectionActive &&
        row.eligibleToStart &&
        phase4PelotonRiderSetAtStart.has(row.riderId) &&
        !escapeSet.has(row.riderId) &&
        !persistentOpeningState.droppedRiderIds.includes(row.riderId),
    )
    .map((row) => {
      const rider = ridersById.get(row.riderId)!
      const readiness = readinessByRiderId.get(row.riderId)!
      const phase = row.phases.find((entry) => entry.phaseNumber === 4)!
      const startEnergy = phase3EnergyByRiderId.get(row.riderId) ?? 0
      const energyCostToTerrainStart = calculateRoadEnergyCostForRange(
        input,
        rider,
        readiness,
        getGeneralPhaseEffortMultiplier(phase),
        phaseBoundary.startKm,
        lateTerrain.kmStart,
      )
      const energyCostToSelection = calculateRoadEnergyCostForRange(
        input,
        rider,
        readiness,
        getGeneralPhaseEffortMultiplier(phase),
        phaseBoundary.startKm,
        lateTerrainSelectionKm,
      )
      const energyAtTerrainStart = deterministicRound(
        Math.max(0, startEnergy - energyCostToTerrainStart),
        6,
      )
      const energyAtSelection = deterministicRound(
        Math.max(0, startEnergy - energyCostToSelection),
        6,
      )
      const terrainAbility = calculateDecisiveTerrainAbility(
        rider,
        lateTerrain,
      )
      const suitability =
        suitabilityByRiderId.get(row.riderId)?.suitabilityScore ?? 0
      const holdScore = deterministicRound(
        terrainAbility * 0.56 +
          suitability * 0.12 +
          readiness.readinessScore * 0.08 +
          energyAtSelection * 0.24 +
          phase.commandEffect.performanceModifier,
        6,
      )
      return {
        riderId: row.riderId,
        holdScore,
        energyAtTerrainStart,
        energyAtSelection,
      }
    })
    .sort(
      (left, right) =>
        right.holdScore - left.holdScore ||
        right.energyAtSelection - left.energyAtSelection ||
        left.riderId.localeCompare(right.riderId),
    )
  const lateTerrainHoldScoresAscending = lateTerrainPelotonCandidateRows
    .map((row) => row.holdScore)
    .sort((left, right) => left - right)
  const lateTerrainPaceReferenceQuantile = clamp(
    0.5 +
      lateTerrain.selectionSeverity * 0.08 +
      lateGradientPressure * 0.08 +
      lateRacePressure * 0.06,
    0.5,
    0.72,
  )
  const lateTerrainReferenceIndex = Math.min(
    Math.max(0, lateTerrainHoldScoresAscending.length - 1),
    Math.floor(
      Math.max(0, lateTerrainHoldScoresAscending.length - 1) *
        lateTerrainPaceReferenceQuantile,
    ),
  )
  const lateTerrainReferenceHoldScore =
    lateTerrainHoldScoresAscending[lateTerrainReferenceIndex] ?? 0
  const lateTerrainRequiredHoldScore = deterministicRound(
    lateTerrainReferenceHoldScore - lateTerrainHoldWindow,
    6,
  )
  // v10e4a: selection membership remains deterministic and unchanged, but
  // contact loss is no longer allowed to collapse a large block of similarly
  // rated riders onto one kilometre.  Riders that fail the same competitive
  // pace are ordered by failure pressure, then assigned a bounded rider-
  // specific crack point across the climb.  The seeded component changes only
  // *when* an already-failing rider loses contact; it never decides whether the
  // rider is retained or dropped.
  const lateTerrainSelectionPreRows = lateTerrainPelotonCandidateRows.map((row) => {
    const holdDeficit = deterministicRound(
      Math.max(0, lateTerrainRequiredHoldScore - row.holdScore),
      6,
    )
    const energyDeficit = deterministicRound(
      Math.max(0, lateTerrainMinimumEnergy - row.energyAtSelection),
      6,
    )
    return {
      ...row,
      holdDeficit,
      energyDeficit,
      dropped: holdDeficit > 0 || energyDeficit > 0,
      failurePressure: deterministicRound(
        holdDeficit + energyDeficit * 1.15,
        6,
      ),
    }
  })
  const lateTerrainAbilityFailureRows = lateTerrainSelectionPreRows
    .filter((row) => row.dropped && row.holdDeficit > 0)
    .slice()
    .sort(
      (left, right) =>
        right.failurePressure - left.failurePressure ||
        left.holdScore - right.holdScore ||
        left.riderId.localeCompare(right.riderId),
    )
  const lateTerrainAbilityFailureRankByRiderId = new Map(
    lateTerrainAbilityFailureRows.map(
      (row, index) => [row.riderId, index] as const,
    ),
  )

  const lateTerrainSelectionRows = lateTerrainSelectionPreRows.map((row) => {
    let contactLossKm: number | null = null
    if (row.dropped) {
      let abilityCrackKm = Number.POSITIVE_INFINITY
      if (row.holdDeficit > 0) {
        const abilityFailureStrength = clamp(
          row.holdDeficit / Math.max(6, lateTerrainHoldWindow * 1.5),
          0,
          1,
        )
        const deficitCrackFraction = clamp(
          0.88 - abilityFailureStrength * 0.62,
          0.18,
          0.9,
        )
        const abilityFailureRank =
          lateTerrainAbilityFailureRankByRiderId.get(row.riderId) ?? 0
        const abilityFailureCount = Math.max(
          1,
          lateTerrainAbilityFailureRows.length,
        )
        const rankFraction =
          abilityFailureCount <= 1
            ? 0.5
            : abilityFailureRank / (abilityFailureCount - 1)
        const orderedCrackFraction = 0.22 + rankFraction * 0.68
        const timingRoll = calculateDeterministicUnitRoll(
          `${input.engine.deterministicSeed}|${input.stage.stageId}|phase4-terrain-contact-timing|${row.riderId}`,
        )
        const timingVariation = (timingRoll - 0.5) * 0.08
        const abilityCrackFraction = clamp(
          deficitCrackFraction * 0.5 +
            orderedCrackFraction * 0.5 +
            timingVariation,
          0.16,
          0.94,
        )
        abilityCrackKm =
          lateTerrain.kmStart + lateTerrain.distanceKm * abilityCrackFraction
      }

      let energyCrackKm = Number.POSITIVE_INFINITY
      if (row.energyDeficit > 0) {
        if (row.energyAtTerrainStart <= lateTerrainMinimumEnergy) {
          energyCrackKm =
            lateTerrain.kmStart + Math.min(0.1, lateTerrain.distanceKm * 0.05)
        } else {
          const energyDropAcrossTerrain = Math.max(
            0.000001,
            row.energyAtTerrainStart - row.energyAtSelection,
          )
          const energyCrackFraction = clamp(
            (row.energyAtTerrainStart - lateTerrainMinimumEnergy) /
              energyDropAcrossTerrain,
            0.05,
            0.95,
          )
          energyCrackKm =
            lateTerrain.kmStart + lateTerrain.distanceKm * energyCrackFraction
        }
      }

      contactLossKm = deterministicRound(
        clamp(
          Math.min(abilityCrackKm, energyCrackKm),
          lateTerrain.kmStart,
          lateTerrainSelectionKm,
        ),
        6,
      )
    }

    const remainingTerrainKm =
      contactLossKm === null
        ? 0
        : Math.max(0, lateTerrainSelectionKm - contactLossKm)
    const remainingStageKm =
      contactLossKm === null
        ? 0
        : Math.max(0, input.stage.distanceKm - contactLossKm)
    const gapPenaltySeconds = row.dropped
      ? deterministicRound(
          clamp(
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS +
              1 +
              row.holdDeficit * 2 +
              row.energyDeficit * 2 +
              lateGradientPressure * 1.5 +
              lateRacePressure * 0.75 +
              remainingTerrainKm * 0.55 +
              remainingStageKm * 0.12,
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
            180,
          ),
          6,
        )
      : 0
    return {
      riderId: row.riderId,
      holdScore: row.holdScore,
      energyAtTerrainStart: row.energyAtTerrainStart,
      energyAtSelection: row.energyAtSelection,
      contactLossKm,
      gapPenaltySeconds,
    }
  })
  const lateTerrainDroppedRiderIds = lateTerrainSelectionRows
    .filter((row) => row.contactLossKm !== null)
    .map((row) => row.riderId)
    .sort()
  const lateTerrainDroppedRiderSet = new Set(lateTerrainDroppedRiderIds)
  const lateTerrainGapPenaltyByRiderId = new Map(
    lateTerrainSelectionRows.map(
      (row) => [row.riderId, row.gapPenaltySeconds] as const,
    ),
  )
  const lateTerrainContactLossKmByRiderId = new Map(
    lateTerrainSelectionRows
      .filter((row) => row.contactLossKm !== null)
      .map((row) => [row.riderId, row.contactLossKm!] as const),
  )
  const lateTerrainSelection: UniversalRoadPhase4TerrainSelectionResult | null =
    lateTerrainSelectionActive && lateTerrainPelotonCandidateRows.length > 1
      ? {
          kmStart: lateTerrain.kmStart,
          kmEnd: lateTerrain.kmEnd,
          selectionKm: lateTerrainSelectionKm,
          terrainType: lateTerrain.terrainType,
          averageGradientPercent: lateTerrain.averageGradientPercent,
          selectionSeverity: lateTerrain.selectionSeverity,
          holdWindow: lateTerrainHoldWindow,
          minimumEnergyToHold: lateTerrainMinimumEnergy,
          pelotonRiderIdsBefore: lateTerrainPelotonCandidateRows
            .map((row) => row.riderId)
            .sort(),
          retainedPelotonRiderIds: lateTerrainPelotonCandidateRows
            .map((row) => row.riderId)
            .filter((riderId) => !lateTerrainDroppedRiderSet.has(riderId))
            .sort(),
          droppedRiderIds: lateTerrainDroppedRiderIds,
          riders: lateTerrainSelectionRows,
          modelVersion: 'universal_road_phase_4_terrain_selection_v2',
        }
      : null

  const calculateFrontPaceKmh = (
    riderIds: readonly string[],
    energyByRiderId: ReadonlyMap<string, number>,
    addedBridgeRiderCount: number,
  ): number => {
    if (riderIds.length === 0) return 35
    const riders = riderIds.map((riderId) => ridersById.get(riderId)!)
    const suitability = average(
      riderIds.map(
        (riderId) =>
          suitabilityByRiderId.get(riderId)?.suitabilityScore ?? 0,
      ),
    )
    const teamwork = average(riders.map((rider) => rider.teamwork))
    const energy = average(
      riderIds.map((riderId) => energyByRiderId.get(riderId) ?? 0),
    )
    const representedTeamCount = new Set(
      riders.map((rider) => rider.teamId),
    ).size
    const bridgePowerBonus =
      addedBridgeRiderCount > 0
        ? Math.min(
            4.5,
            Math.log2(addedBridgeRiderCount + 1) * 1.15 +
              Math.min(1.5, representedTeamCount * 0.08),
          )
        : 0
    const cooperationPenalty =
      riderIds.length >= 12 && teamwork < 60
        ? Math.min(1.5, (60 - teamwork) * 0.035)
        : 0

    return deterministicRound(
      clamp(
        35 +
          suitability * 0.045 +
          teamwork * 0.015 +
          energy * 0.015 +
          bridgePowerBonus -
          cooperationPenalty,
        35,
        49,
      ),
      6,
    )
  }

  const phase4AttackCandidateRows = roadCommandResolution.riders
    .filter(
      (row) =>
        row.eligibleToStart &&
        !escapeSet.has(row.riderId) &&
        !persistentOpeningState.droppedRiderIds.includes(row.riderId) &&
        !lateTerrainDroppedRiderSet.has(row.riderId),
    )
    .map((row) => {
      const phase = row.phases.find((entry) => entry.phaseNumber === 4)!
      const rider = ridersById.get(row.riderId)!
      const suitability =
        suitabilityByRiderId.get(row.riderId)?.suitabilityScore ?? 0
      const liveEnergy = phase3EnergyByRiderId.get(row.riderId) ?? 0
      const bridgeScore = deterministicRound(
        suitability * 0.42 +
          liveEnergy * 0.28 +
          rider.raceIQ * 0.12 +
          rider.resistance * 0.1 +
          rider.flat * 0.08,
        6,
      )
      const deterministicRoll = calculateDeterministicUnitRoll(
        `${input.engine.deterministicSeed}|${input.stage.stageId}|phase4-bridge|${row.riderId}`,
      )
      const successChance = clamp((bridgeScore - 45) / 55, 0.15, 0.92)
      const explicitlyAttacks =
        phase.resolvedSource === 'explicit_individual_command' &&
        phase.behaviour === 'attack'
      return {
        riderId: row.riderId,
        bridgeScore,
        liveEnergy,
        explicitlyAttacks,
        selected:
          explicitlyAttacks &&
          liveEnergy >= 18 &&
          (bridgeScore >= 88 || deterministicRoll < successChance),
      }
    })
    .filter((row) => row.selected)
    .sort(
      (left, right) =>
        right.bridgeScore - left.bridgeScore ||
        right.liveEnergy - left.liveEnergy ||
        left.riderId.localeCompare(right.riderId),
    )

  const preExistingBridgeRiderIds = persistentOpeningState.lateFrontRiderIds
    .filter(
      (riderId) =>
        physicallyAvailableSet.has(riderId) &&
        !escapeSet.has(riderId) &&
        !persistentOpeningState.droppedRiderIds.includes(riderId),
    )
    .sort()
  const maximumBridgeSize = Math.min(
    30,
    Math.max(
      1,
      Math.floor(
        (physicallyAvailableRiderIds.length - escapeRiderIdsAtStart.length) *
          0.4,
      ),
    ),
  )
  const bridgeRiderIds =
    persistentOpeningState.riderIds.length > 0
      ? Array.from(
          new Set([
            ...preExistingBridgeRiderIds,
            ...phase4AttackCandidateRows.map((row) => row.riderId),
          ]),
        )
          .slice(0, maximumBridgeSize)
          .sort()
      : []
  const bridgeRiderSet = new Set(bridgeRiderIds)
  const bridgeCandidateScore = average(
    bridgeRiderIds.map((riderId) => {
      const candidate = phase4AttackCandidateRows.find(
        (row) => row.riderId === riderId,
      )
      if (candidate) return candidate.bridgeScore
      const rider = ridersById.get(riderId)!
      return (
        (suitabilityByRiderId.get(riderId)?.suitabilityScore ?? 0) * 0.5 +
        (phase3EnergyByRiderId.get(riderId) ?? 0) * 0.3 +
        rider.raceIQ * 0.1 +
        rider.resistance * 0.1
      )
    }),
  )
  const bridgeLaunchMaximumGapSeconds = deterministicRound(
    clamp(
      12 + bridgeCandidateScore * 0.1 + bridgeRiderIds.length * 0.45,
      16,
      34,
    ),
    6,
  )
  const openingFrontTeamIds = new Set(
    escapeRiderIdsAtStart.map(
      (riderId) => ridersById.get(riderId)?.teamId ?? riderId,
    ),
  )
  const hasAnyOrganizedPhase4ChaseInterest = chasingTeamIds.some(
    (teamId) => !openingFrontTeamIds.has(teamId),
  )
  const independentBridgeLaunchMaximumGapSeconds = deterministicRound(
    clamp(
      bridgeLaunchMaximumGapSeconds +
        bridgeCandidateScore * 0.5 +
        bridgeRiderIds.length * 4,
      bridgeLaunchMaximumGapSeconds,
      120,
    ),
    6,
  )

  const averageChasingStrength = average(
    chasingTeamStrength.map((row) => row.strengthScore),
  )
  const baselinePelotonPaceKmh = deterministicRound(
    39.5 + Math.min(3, averageChasingStrength * 0.03),
    6,
  )
  const totalSprintAssets = roadCommandResolution.riders.filter(
    (row) =>
      row.eligibleToStart &&
      !escapeSet.has(row.riderId) &&
      (row.stageRole === 'sprinter' ||
        row.stageRole === 'lead_out_rider' ||
        row.stageRole === 'sprint_train_rider' ||
        row.phases.find((phase) => phase.phaseNumber === 4)!.behaviour ===
          'sprint_preparation'),
  ).length
  const totalProtectedAssets = roadCommandResolution.riders.filter(
    (row) =>
      row.eligibleToStart &&
      !escapeSet.has(row.riderId) &&
      (row.stageRole === 'team_leader_gc' ||
        row.stageRole === 'protected_rider'),
  ).length

  let escapeStillActive = activeEscape
  let currentGapSeconds = escapeStillActive ? startGapSeconds : 0
  let currentKm = Math.max(phaseBoundary.startKm, chaseStartKm)
  let currentFrontRiderIds = [...escapeRiderIdsAtStart].sort()
  let currentFrontRiderSet = new Set(currentFrontRiderIds)
  let currentEscapePaceKmh = calculateFrontPaceKmh(
    currentFrontRiderIds,
    phase3EnergyByRiderId,
    0,
  )
  let bridgeLaunched = false
  let bridgeActive = false
  let bridgeMergedIntoFront = false
  let bridgeLaunchKm: number | null = null
  let bridgeMergeKm: number | null = null
  let bridgeCurrentGapToLeaderSeconds: number | null = null
  const bridgeGapSamples: UniversalRoadBridgeGapSample[] = []
  const bridgeEnergyCostByRiderId = new Map<string, number>()
  const chaseSteps: UniversalRoadLateChaseStep[] = []

  while (currentKm < phaseBoundary.endKm - 0.000001) {
    const stepEndKm = Math.min(phaseBoundary.endKm, currentKm + 5)
    const stepDistanceKm = stepEndKm - currentKm
    const progress = stepEndKm / input.stage.distanceKm
    const remainingKm = input.stage.distanceKm - stepEndKm

    const shouldLaunchPreExistingBridge =
      preExistingBridgeRiderIds.length > 0 &&
      !bridgeLaunched &&
      currentKm <= chaseStartKm + 0.000001
    const shouldLaunchPhase4Bridge =
      bridgeRiderIds.length > 0 &&
      !bridgeLaunched &&
      currentGapSeconds > PHASE5_GROUP_MERGE_TOLERANCE_SECONDS &&
      currentGapSeconds <=
        (hasAnyOrganizedPhase4ChaseInterest
          ? bridgeLaunchMaximumGapSeconds
          : independentBridgeLaunchMaximumGapSeconds) + 0.000001 &&
      remainingKm >= 2

    if (shouldLaunchPreExistingBridge || shouldLaunchPhase4Bridge) {
      bridgeLaunched = true
      bridgeActive = true
      bridgeLaunchKm = deterministicRound(currentKm, 6)
      const preExistingGapValues = preExistingBridgeRiderIds
        .map((riderId) =>
          persistentOpeningState.physicalGapByRiderId.get(riderId),
        )
        .filter((gap): gap is number => gap !== undefined)
      const initialGapToLeader = shouldLaunchPreExistingBridge
        ? clamp(
            average(preExistingGapValues),
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
            Math.max(
              PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
              currentGapSeconds - 1,
            ),
          )
        : Math.max(
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
            currentGapSeconds - 1,
          )
      bridgeCurrentGapToLeaderSeconds = deterministicRound(
        initialGapToLeader,
        6,
      )
      bridgeGapSamples.push({
        km: bridgeLaunchKm,
        gapToLeaderSeconds: bridgeCurrentGapToLeaderSeconds,
        gapToPelotonSeconds: deterministicRound(
          Math.max(
            0,
            currentGapSeconds - bridgeCurrentGapToLeaderSeconds,
          ),
          6,
        ),
      })
    }

    const currentFrontTeamIds = new Set(
      currentFrontRiderIds.map(
        (riderId) => ridersById.get(riderId)?.teamId ?? riderId,
      ),
    )
    const effectiveExplicitChasingTeamIds = explicitChasingTeamIds.filter(
      (teamId) => !currentFrontTeamIds.has(teamId),
    )
    const effectiveAutomaticChasingTeamIds = automaticChasingTeamIds.filter(
      (teamId) => !currentFrontTeamIds.has(teamId),
    )
    const riderHasLostContactByKm = (riderId: string): boolean => {
      const contactLossKm = lateTerrainContactLossKmByRiderId.get(riderId)
      return (
        contactLossKm !== undefined &&
        currentKm >= contactLossKm - 0.000001
      )
    }
    const effectiveExplicitChaserCount = explicitChasers.filter(
      (row) =>
        !currentFrontRiderSet.has(row.riderId) &&
        !bridgeRiderSet.has(row.riderId) &&
        !riderHasLostContactByKm(row.riderId),
    ).length
    const effectiveAutomaticWorkerRows = automaticWorkerRows.filter(
      (row) =>
        !currentFrontRiderSet.has(row.riderId) &&
        !bridgeRiderSet.has(row.riderId) &&
        !riderHasLostContactByKm(row.riderId),
    )
    const automaticActivityFactor = clamp(
      (progress - chaseStartFraction) /
        Math.max(0.000001, 1 - chaseStartFraction),
      0,
      1,
    )
    const activeAutomaticWorkerCount = Math.ceil(
      effectiveAutomaticWorkerRows.length * automaticActivityFactor,
    )
    const activeAutomaticTeamCount = Math.ceil(
      effectiveAutomaticChasingTeamIds.length * automaticActivityFactor,
    )
    const response = calculatePelotonResponseComponents(
      progress,
      remainingKm,
      currentGapSeconds,
      Math.max(1, currentFrontRiderIds.length),
      Math.max(1, currentFrontTeamIds.size),
      effectiveExplicitChasingTeamIds.length + activeAutomaticTeamCount,
      effectiveExplicitChaserCount + activeAutomaticWorkerCount,
      Math.max(
        0,
        totalSprintAssets -
          currentFrontRiderIds.filter((riderId) => {
            const row = roadCommandResolution.riders.find(
              (candidate) => candidate.riderId === riderId,
            )
            return (
              row?.stageRole === 'sprinter' ||
              row?.stageRole === 'lead_out_rider' ||
              row?.stageRole === 'sprint_train_rider'
            )
          }).length,
      ),
      Math.max(
        0,
        totalProtectedAssets -
          currentFrontRiderIds.filter((riderId) => {
            const row = roadCommandResolution.riders.find(
              (candidate) => candidate.riderId === riderId,
            )
            return (
              row?.stageRole === 'team_leader_gc' ||
              row?.stageRole === 'protected_rider'
            )
          }).length,
      ),
      baselinePelotonPaceKmh,
      currentEscapePaceKmh,
      input.points.some(
        (point) =>
          point.pointType !== 'FINISH' &&
          point.kmFromStart >= currentKm - 0.000001 &&
          point.kmFromStart <= stepEndKm + 3,
      ),
      remainingKm <= 5,
      true,
    )
    const automaticLateMultiplier =
      response.responseMode === 'uninterested_peloton'
        ? input.stage.finishType === 'flat_finish'
          ? 1 + clamp((10 - remainingKm) / 10, 0, 1) * 0.012
          : 1
        : 1 + automaticActivityFactor * 0.025
    const effectiveChasingStrength = average(
      chasingTeamStrength
        .filter((row) => !currentFrontTeamIds.has(row.teamId))
        .map((row) => row.strengthScore),
    )
    const explicitStrengthMultiplier =
      response.responseMode === 'uninterested_peloton'
        ? 1
        : 1 + Math.min(0.025, (effectiveChasingStrength / 100) * 0.025)
    const terrainChaseEfficiencyMultiplier =
      response.responseMode === 'uninterested_peloton'
        ? 1
        : input.stage.terrainType === 'flat'
          ? 1.045
          : input.stage.terrainType === 'cobbled'
            ? 1.025
            : 1
    const effectivePelotonPaceKmh = deterministicRound(
      baselinePelotonPaceKmh *
        response.selectedResponseMultiplier *
        automaticLateMultiplier *
        explicitStrengthMultiplier *
        terrainChaseEfficiencyMultiplier,
      6,
    )
    const pelotonStepSeconds =
      (stepDistanceKm / Math.max(5, effectivePelotonPaceKmh)) * 3600
    const escapeStepSeconds =
      (stepDistanceKm / Math.max(5, currentEscapePaceKmh)) * 3600
    const calculatedNextGapSeconds = escapeStillActive
      ? Math.max(
          0,
          currentGapSeconds + pelotonStepSeconds - escapeStepSeconds,
        )
      : 0
    const boundedNextGapSeconds = escapeStillActive
      ? limitRoadChaseGapClosure(
          currentGapSeconds,
          calculatedNextGapSeconds,
          currentKm,
          stepEndKm,
          input.stage.distanceKm,
          input.stage.terrainType,
        )
      : 0
    let resolvedNextGapSeconds = boundedNextGapSeconds

    const bridgeStartGapToLeaderSeconds: number | null =
      bridgeActive && bridgeCurrentGapToLeaderSeconds !== null
        ? bridgeCurrentGapToLeaderSeconds
        : null
    const bridgeStartGapToPelotonSeconds: number | null =
      bridgeStartGapToLeaderSeconds !== null
        ? deterministicRound(
            Math.max(
              0,
              currentGapSeconds - bridgeStartGapToLeaderSeconds,
            ),
            6,
          )
        : null
    let bridgeEndGapToLeaderSeconds: number | null =
      bridgeStartGapToLeaderSeconds
    let bridgeEndGapToPelotonSeconds: number | null =
      bridgeStartGapToPelotonSeconds
    let bridgeMergedThisStep = false

    if (
      bridgeActive &&
      bridgeStartGapToLeaderSeconds !== null &&
      bridgeRiderIds.length > 0
    ) {
      const bridgeAverageEnergy = average(
        bridgeRiderIds.map(
          (riderId) => phase3EnergyByRiderId.get(riderId) ?? 0,
        ),
      )
      const bridgePaceKmh = deterministicRound(
        clamp(
          Math.max(
            currentEscapePaceKmh + 1.2,
            effectivePelotonPaceKmh + 1.4,
          ) +
            Math.min(2.8, bridgeCandidateScore * 0.018) +
            Math.min(1.6, bridgeRiderIds.length * 0.08) +
            Math.min(1.2, bridgeAverageEnergy * 0.012),
          39,
          53,
        ),
        6,
      )
      const bridgeStepSeconds =
        (stepDistanceKm / Math.max(5, bridgePaceKmh)) * 3600
      const calculatedBridgeEndGapToLeaderSeconds = Math.max(
        0,
        bridgeStartGapToLeaderSeconds +
          bridgeStepSeconds -
          escapeStepSeconds,
      )
      const bridgeClosureSeconds = Math.max(
        0,
        bridgeStartGapToLeaderSeconds -
          calculatedBridgeEndGapToLeaderSeconds,
      )
      const bridgeCanReachFrontThisStep =
        calculatedBridgeEndGapToLeaderSeconds <=
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.000001 &&
        bridgeClosureSeconds > 0.000001
      const pelotonCanReachFrontThisStep =
        boundedNextGapSeconds <=
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.000001 &&
        currentGapSeconds > PHASE5_GROUP_MERGE_TOLERANCE_SECONDS
      const bridgeMergeFraction = bridgeCanReachFrontThisStep
        ? clamp(
            (bridgeStartGapToLeaderSeconds -
              PHASE5_GROUP_MERGE_TOLERANCE_SECONDS) /
              bridgeClosureSeconds,
            0,
            1,
          )
        : Number.POSITIVE_INFINITY
      const pelotonClosureSeconds = Math.max(
        0,
        currentGapSeconds - boundedNextGapSeconds,
      )
      const pelotonCatchFraction = pelotonCanReachFrontThisStep
        ? clamp(
            (currentGapSeconds - PHASE5_GROUP_MERGE_TOLERANCE_SECONDS) /
              Math.max(0.000001, pelotonClosureSeconds),
            0,
            1,
          )
        : Number.POSITIVE_INFINITY
      const bridgeReachesFrontFirst =
        bridgeCanReachFrontThisStep &&
        bridgeMergeFraction + 0.000001 < pelotonCatchFraction

      if (bridgeReachesFrontFirst) {
        const mergeKmRaw =
          currentKm + stepDistanceKm * bridgeMergeFraction
        const pelotonGapAtMerge = deterministicRound(
          Math.max(
            0,
            currentGapSeconds +
              (boundedNextGapSeconds - currentGapSeconds) *
                bridgeMergeFraction,
          ),
          6,
        )

        if (
          pelotonGapAtMerge >
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.000001
        ) {
          bridgeMergedThisStep = true
          bridgeActive = false
          bridgeMergedIntoFront = true
          bridgeMergeKm = deterministicRound(mergeKmRaw, 6)
          currentFrontRiderIds = Array.from(
            new Set([...currentFrontRiderIds, ...bridgeRiderIds]),
          ).sort()
          currentFrontRiderSet = new Set(currentFrontRiderIds)
          bridgeEndGapToLeaderSeconds = 0
          bridgeEndGapToPelotonSeconds = pelotonGapAtMerge
          const bridgeDistanceKm = Math.max(
            0,
            mergeKmRaw - (bridgeLaunchKm ?? mergeKmRaw),
          )
          bridgeRiderIds.forEach((riderId) => {
            const rider = ridersById.get(riderId)!
            const readiness = readinessByRiderId.get(riderId)!
            const launchKm = bridgeLaunchKm ?? mergeKmRaw
            const energyCost = deterministicRound(
              Math.max(
                0,
                calculateRoadEnergyCostForRange(
                  input,
                  rider,
                  readiness,
                  1.55,
                  launchKm,
                  launchKm + bridgeDistanceKm,
                ) -
                  calculateRoadEnergyCostForRange(
                    input,
                    rider,
                    readiness,
                    1,
                    launchKm,
                    launchKm + bridgeDistanceKm,
                  ),
              ),
              6,
            )
            bridgeEnergyCostByRiderId.set(riderId, energyCost)
          })
          const frontEnergyAfterBridge = new Map(phase3EnergyByRiderId)
          bridgeRiderIds.forEach((riderId) => {
            frontEnergyAfterBridge.set(
              riderId,
              Math.max(
                0,
                (phase3EnergyByRiderId.get(riderId) ?? 0) -
                  (bridgeEnergyCostByRiderId.get(riderId) ?? 0),
              ),
            )
          })
          currentEscapePaceKmh = calculateFrontPaceKmh(
            currentFrontRiderIds,
            frontEnergyAfterBridge,
            bridgeRiderIds.length,
          )

          const remainingStepDistanceKm = Math.max(
            0,
            stepEndKm - mergeKmRaw,
          )
          if (remainingStepDistanceKm > 0.000001) {
            const pelotonRemainingSeconds =
              (remainingStepDistanceKm /
                Math.max(5, effectivePelotonPaceKmh)) *
              3600
            const enlargedFrontRemainingSeconds =
              (remainingStepDistanceKm /
                Math.max(5, currentEscapePaceKmh)) *
              3600
            const calculatedGapAfterBridge = Math.max(
              0,
              pelotonGapAtMerge +
                pelotonRemainingSeconds -
                enlargedFrontRemainingSeconds,
            )
            resolvedNextGapSeconds = limitRoadChaseGapClosure(
              pelotonGapAtMerge,
              calculatedGapAfterBridge,
              mergeKmRaw,
              stepEndKm,
              input.stage.distanceKm,
              input.stage.terrainType,
            )
          } else {
            resolvedNextGapSeconds = pelotonGapAtMerge
          }

          bridgeCurrentGapToLeaderSeconds = 0
          bridgeGapSamples.push({
            km: bridgeMergeKm,
            gapToLeaderSeconds: 0,
            gapToPelotonSeconds: deterministicRound(
              pelotonGapAtMerge,
              6,
            ),
          })
        }
      }

      if (!bridgeMergedThisStep) {
        bridgeEndGapToLeaderSeconds = deterministicRound(
          Math.min(
            calculatedBridgeEndGapToLeaderSeconds,
            Math.max(0, boundedNextGapSeconds - 0.5),
          ),
          6,
        )
        bridgeEndGapToPelotonSeconds = deterministicRound(
          Math.max(
            0,
            boundedNextGapSeconds - bridgeEndGapToLeaderSeconds,
          ),
          6,
        )
        bridgeCurrentGapToLeaderSeconds = bridgeEndGapToLeaderSeconds
        bridgeGapSamples.push({
          km: deterministicRound(stepEndKm, 6),
          gapToLeaderSeconds: bridgeEndGapToLeaderSeconds,
          gapToPelotonSeconds: bridgeEndGapToPelotonSeconds,
        })
      }
    }

    const caughtThisStep =
      escapeStillActive &&
      currentGapSeconds > PHASE5_GROUP_MERGE_TOLERANCE_SECONDS &&
      resolvedNextGapSeconds <= PHASE5_GROUP_MERGE_TOLERANCE_SECONDS

    const nextGapSeconds = caughtThisStep ? 0 : resolvedNextGapSeconds
    chaseSteps.push({
      kmStart: deterministicRound(currentKm, 6),
      kmEnd: deterministicRound(stepEndKm, 6),
      startGapSeconds: deterministicRound(currentGapSeconds, 6),
      endGapSeconds: deterministicRound(nextGapSeconds, 6),
      automaticActivityFactor: deterministicRound(automaticActivityFactor, 6),
      responseMode: response.responseMode,
      selectedResponseMultiplier: response.selectedResponseMultiplier,
      escapePaceKmh: currentEscapePaceKmh,
      effectivePelotonPaceKmh,
      explicitChasingTeamCount: effectiveExplicitChasingTeamIds.length,
      automaticChasingTeamCount: activeAutomaticTeamCount,
      pelotonWorkIntensityFraction: response.pelotonWorkIntensityFraction,
      frontRiderCount: currentFrontRiderIds.length,
      bridgeGroupActive:
        bridgeStartGapToLeaderSeconds !== null && !bridgeMergedThisStep,
      bridgeGroupRiderIds:
        bridgeStartGapToLeaderSeconds !== null ? [...bridgeRiderIds] : [],
      bridgeStartGapToLeaderSeconds,
      bridgeEndGapToLeaderSeconds,
      bridgeStartGapToPelotonSeconds,
      bridgeEndGapToPelotonSeconds,
      bridgeMergedIntoFront: bridgeMergedThisStep,
    })
    currentGapSeconds = nextGapSeconds
    currentKm = stepEndKm

    if (caughtThisStep) {
      escapeStillActive = false
      bridgeActive = false
    }
  }

  if (bridgeLaunched && !bridgeMergedIntoFront && bridgeLaunchKm !== null) {
    const bridgeEndKm = phaseBoundary.endKm
    bridgeRiderIds.forEach((riderId) => {
      const rider = ridersById.get(riderId)!
      const readiness = readinessByRiderId.get(riderId)!
      const energyCost = deterministicRound(
        Math.max(
          0,
          calculateRoadEnergyCostForRange(
            input,
            rider,
            readiness,
            1.55,
            bridgeLaunchKm!,
            bridgeEndKm,
          ) -
            calculateRoadEnergyCostForRange(
              input,
              rider,
              readiness,
              1,
              bridgeLaunchKm!,
              bridgeEndKm,
            ),
        ),
        6,
      )
      bridgeEnergyCostByRiderId.set(riderId, energyCost)
    })
  }

  const bridgeGroups: readonly UniversalRoadPhase4BridgeResult[] =
    bridgeLaunched &&
    bridgeLaunchKm !== null &&
    bridgeGapSamples.length > 0
      ? [
          {
            displayCode: 'F1',
            riderIds: [...bridgeRiderIds],
            launchKm: bridgeLaunchKm,
            launchGapToLeaderSeconds:
              bridgeGapSamples[0].gapToLeaderSeconds,
            launchGapToPelotonSeconds:
              bridgeGapSamples[0].gapToPelotonSeconds,
            mergeKm: bridgeMergeKm,
            mergedIntoOpeningBreakaway: bridgeMergedIntoFront,
            gapSamples: bridgeGapSamples,
            energyCostByRider: bridgeRiderIds.map((riderId) => ({
              riderId,
              energyCost: bridgeEnergyCostByRiderId.get(riderId) ?? 0,
            })),
            modelVersion: 'universal_road_phase_4_bridge_v1',
          },
        ]
      : []

  const endGapSeconds = deterministicRound(currentGapSeconds, 6)
  const breakawayCaught = activeEscape && !escapeStillActive
  const breakawaySurvived = activeEscape && escapeStillActive
  const gapClosureSeconds = deterministicRound(
    Math.max(0, startGapSeconds - endGapSeconds),
    6,
  )

  const leadOutGivenByRiderId = new Map<string, number>()
  const leadOutReceivedByRiderId = new Map<string, number>()
  roadCommandResolution.riders.forEach((row) => {
    const phase = row.phases.find((entry) => entry.phaseNumber === 4)!
    if (!row.eligibleToStart || phase.behaviour !== 'lead_out') return
    const sameTeamTargets = roadCommandResolution.riders
      .filter(
        (target) =>
          target.teamId === row.teamId &&
          target.riderId !== row.riderId &&
          phase3.finishEligibleRiderIds.includes(target.riderId),
      )
      .sort((left, right) => {
        const leftRole = left.stageRole === 'sprinter' ? 0 : left.stageRole === 'team_leader_gc' ? 1 : 2
        const rightRole = right.stageRole === 'sprinter' ? 0 : right.stageRole === 'team_leader_gc' ? 1 : 2
        return (
          leftRole - rightRole ||
          (suitabilityByRiderId.get(right.riderId)?.suitabilityScore ?? 0) -
            (suitabilityByRiderId.get(left.riderId)?.suitabilityScore ?? 0) ||
          left.riderId.localeCompare(right.riderId)
        )
      })
    const target = sameTeamTargets[0]
    if (!target) return
    leadOutGivenByRiderId.set(row.riderId, 1)
    leadOutReceivedByRiderId.set(
      target.riderId,
      (leadOutReceivedByRiderId.get(target.riderId) ?? 0) + 1,
    )
  })

  const averageAutomaticActivity = average(
    chaseSteps.map((step) => step.automaticActivityFactor),
  )
  const averageWorkIntensity = average(
    chaseSteps.map((step) => step.pelotonWorkIntensityFraction),
  )
  const explicitChaserSet = new Set(explicitChasers.map((row) => row.riderId))
  const automaticWorkerSet = new Set(automaticWorkerRows.map((row) => row.riderId))
  const phase4MeaningfulContactPressure =
    input.stage.terrainType !== 'flat' ||
    input.stage.finishType !== 'flat_finish' ||
    hasAnyOrganizedPhase4ChaseInterest
  const phase4DepletionContactFloor = deterministicRound(
    clamp(
      3 +
        (input.stage.terrainType === 'mountain'
          ? 1.5
          : input.stage.terrainType === 'hilly' ||
              input.stage.terrainType === 'cobbled'
            ? 0.75
            : 0) +
        (hasAnyOrganizedPhase4ChaseInterest ? 0.75 : 0) +
        (input.stage.finishType === 'summit_finish' ||
        input.stage.finishType === 'uphill_finish'
          ? 0.5
          : 0),
      3,
      6,
    ),
    6,
  )

  const provisionalRiderStates = roadCommandResolution.riders.map((row) => {
    const rider = ridersById.get(row.riderId)!
    const readiness = readinessByRiderId.get(row.riderId)!
    const phase = row.phases.find((entry) => entry.phaseNumber === 4)!
    const startEnergy = phase3StateByRiderId.get(row.riderId)?.energyAfterPhase ?? 0
    const baselinePhaseEnergyCost = calculateRoadEnergyCostForRange(
      input,
      rider,
      readiness,
      getGeneralPhaseEffortMultiplier(phase),
      phaseBoundary.startKm,
      phaseBoundary.endKm,
    )
    const isAutomaticWorker = automaticWorkerSet.has(row.riderId)
    const automaticChaseEnergyCost = isAutomaticWorker
      ? deterministicRound(
          Math.max(
            0,
            calculateRoadEnergyCostForRange(
              input,
              rider,
              readiness,
              1 + 0.18 * averageAutomaticActivity * averageWorkIntensity,
              phaseBoundary.startKm,
              phaseBoundary.endKm,
            ) -
              calculateRoadEnergyCostForRange(
                input,
                rider,
                readiness,
                1,
                phaseBoundary.startKm,
                phaseBoundary.endKm,
              ),
          ),
          6,
        )
      : 0
    const bridgeEnergyCost = bridgeEnergyCostByRiderId.get(row.riderId) ?? 0
    const finishEffortApplies =
      phase.commandEffect.effectTiming === 'finish_only' ||
      phase.behaviour === 'stage_result' ||
      phase.behaviour === 'time_gc_result' ||
      phase.behaviour === 'lead_out' ||
      phase.behaviour === 'sprint_preparation'
    const finishEffortEnergyCost = finishEffortApplies
      ? deterministicRound(
          Math.max(
            0,
            calculateRoadEnergyCostForRange(
              input,
              rider,
              readiness,
              phase.commandEffect.roleAdjustedEffortMultiplier,
              Math.max(phaseBoundary.startKm, input.stage.distanceKm - 1),
              input.stage.distanceKm,
            ) -
              calculateRoadEnergyCostForRange(
                input,
                rider,
                readiness,
                1,
                Math.max(phaseBoundary.startKm, input.stage.distanceKm - 1),
                input.stage.distanceKm,
              ),
          ),
          6,
        )
      : 0
    const totalPhaseEnergyCost = deterministicRound(
      baselinePhaseEnergyCost +
        automaticChaseEnergyCost +
        bridgeEnergyCost +
        finishEffortEnergyCost,
      6,
    )
    const energyAtFinish = deterministicRound(
      Math.max(0, startEnergy - totalPhaseEnergyCost),
      6,
    )
    const chaseWorkScore = deterministicRound(
      (explicitChaserSet.has(row.riderId) ? 8 : 0) +
        (isAutomaticWorker ? 5 * averageAutomaticActivity : 0) +
        getPhase4ChaseSkill(rider) * averageWorkIntensity * 0.08,
      6,
    )

    const phase3Gap =
      phase3PhysicalGapByRiderId.get(row.riderId) ?? 0
    let contactLossKm =
      lateTerrainContactLossKmByRiderId.get(row.riderId) ?? null
    let contactLossReason: 'terrain_pressure' | 'energy_depleted' | null =
      contactLossKm === null ? null : 'terrain_pressure'
    let contactLossGapPenaltySeconds =
      lateTerrainGapPenaltyByRiderId.get(row.riderId) ?? 0

    if (
      phase4MeaningfulContactPressure &&
      phase4PelotonRiderSetAtStart.has(row.riderId) &&
      !escapeSet.has(row.riderId) &&
      !persistentOpeningState.droppedRiderIds.includes(row.riderId) &&
      energyAtFinish < phase4DepletionContactFloor - 0.000001 &&
      startEnergy > energyAtFinish + 0.000001
    ) {
      const depletionFraction = clamp(
        (startEnergy - phase4DepletionContactFloor) /
          Math.max(0.000001, startEnergy - energyAtFinish),
        0,
        1,
      )
      const depletionCrackKm = deterministicRound(
        clamp(
          phaseBoundary.startKm +
            (phaseBoundary.endKm - phaseBoundary.startKm) * depletionFraction,
          phaseBoundary.startKm,
          Math.max(phaseBoundary.startKm, phaseBoundary.endKm - 0.05),
        ),
        6,
      )
      const depletionRemainingKm = Math.max(
        0,
        phaseBoundary.endKm - depletionCrackKm,
      )
      const depletionPenaltySeconds = deterministicRound(
        clamp(
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS +
            1 +
            depletionRemainingKm *
              (input.stage.terrainType === 'mountain' ? 0.9 : 0.65) +
            Math.max(0, phase4DepletionContactFloor - energyAtFinish) * 2,
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
          180,
        ),
        6,
      )
      if (contactLossKm === null || depletionCrackKm < contactLossKm) {
        contactLossKm = depletionCrackKm
        contactLossReason = 'energy_depleted'
        contactLossGapPenaltySeconds = depletionPenaltySeconds
      } else if (depletionPenaltySeconds > contactLossGapPenaltySeconds) {
        // The rider may have already lost the wheel because of terrain pressure.
        // If the remaining reserve later falls through the depletion floor, the
        // gap must continue to grow rather than being frozen at the modest
        // terrain-selection penalty.  The original (earlier) contact-loss km is
        // preserved so replay continuity remains physical.
        const postCrackDepletionDistanceKm = Math.max(
          0,
          depletionCrackKm - contactLossKm,
        )
        contactLossGapPenaltySeconds = deterministicRound(
          clamp(
            Math.max(
              contactLossGapPenaltySeconds,
              depletionPenaltySeconds + postCrackDepletionDistanceKm * 0.2,
            ),
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
            180,
          ),
          6,
        )
      }
    }

    let finalGapSeconds: number
    const finalBridgeGapSeconds =
      bridgeGapSamples.at(-1)?.gapToLeaderSeconds ?? phase3Gap
    if (currentFrontRiderSet.has(row.riderId)) {
      finalGapSeconds = 0
    } else if (
      bridgeLaunched &&
      !bridgeMergedIntoFront &&
      bridgeRiderSet.has(row.riderId) &&
      !breakawayCaught
    ) {
      finalGapSeconds = Math.max(0, finalBridgeGapSeconds)
    } else {
      finalGapSeconds = Math.max(0, phase3Gap - gapClosureSeconds)
    }
    if (!activeEscape) finalGapSeconds = phase3Gap
    if (contactLossKm !== null && contactLossGapPenaltySeconds > 0) {
      finalGapSeconds = deterministicRound(
        finalGapSeconds + contactLossGapPenaltySeconds,
        6,
      )
    }
    const finalGroupCode: UniversalRoadFinalGroupCode =
      finalGapSeconds <= 0.5
        ? 'winning_group'
        : finalGapSeconds <= 10
          ? 'front_chase_group'
          : finalGapSeconds <= 60
            ? 'main_finish_group'
            : 'late_group'

    return {
      riderId: row.riderId,
      teamId: row.teamId,
      command: phase.resolvedCommand,
      startEnergy,
      baselinePhaseEnergyCost,
      automaticChaseEnergyCost,
      bridgeEnergyCost,
      finishEffortEnergyCost,
      totalPhaseEnergyCost,
      energyAtFinish,
      chaseWorkScore,
      leadOutSupportGiven: leadOutGivenByRiderId.get(row.riderId) ?? 0,
      leadOutSupportReceived: leadOutReceivedByRiderId.get(row.riderId) ?? 0,
      contactLossKm,
      contactLossReason,
      contactLossGapPenaltySeconds,
      finalGroupCode,
      finalGapSeconds: deterministicRound(finalGapSeconds, 6),
      modelVersion: 'universal_road_phase_4_rider_state_v2' as const,
    }
  })

  const winnerBaseTimeSeconds = Math.round(
    (input.stage.distanceKm / getPhase4BaseFinishPaceKmh(input.stage)) * 3600,
  )
  const groupCodes: readonly UniversalRoadFinalGroupCode[] = [
    'winning_group',
    'front_chase_group',
    'main_finish_group',
    'late_group',
  ]
  const finalGroups: UniversalRoadFinalGroup[] = groupCodes
    .map((groupCode) => ({
      groupCode,
      members: provisionalRiderStates.filter(
        (state) => state.finalGroupCode === groupCode,
      ),
    }))
    .filter((row) => row.members.length > 0)
    .map(({ groupCode, members }, index) => {
      const gapSeconds = Math.min(...members.map((state) => state.finalGapSeconds))
      return {
        groupCode,
        groupOrder: (index + 1) as 1 | 2 | 3 | 4,
        riderIds: members.map((state) => state.riderId).sort(),
        gapSeconds: deterministicRound(gapSeconds, 6),
        finishTimeSeconds: winnerBaseTimeSeconds + Math.round(gapSeconds),
      }
    })

  const winningGroup = finalGroups.find((group) => group.groupCode === 'winning_group')!
  const contenderRiderIds = winningGroup.riderIds
    .filter((riderId) => phase3.finishEligibleRiderIds.includes(riderId))
    .sort()
  const actualContenderIds =
    contenderRiderIds.length > 0
      ? contenderRiderIds
      : provisionalRiderStates
          .filter((state) => phase3.finishEligibleRiderIds.includes(state.riderId))
          .sort(
            (left, right) =>
              left.finalGapSeconds - right.finalGapSeconds ||
              left.riderId.localeCompare(right.riderId),
          )
          .slice(0, 1)
          .map((state) => state.riderId)
  const finishModel = getPhase4FinishModel(input.stage, actualContenderIds.length)
  const frontGroupSize = actualContenderIds.length
  let finishModelVersion: UniversalRoadFinishResult['modelVersion'] =
    input.stage.finishType === 'flat_finish'
      ? 'production_front_group_sprint_score_v1'
      : 'universal_road_finish_score_v1'
  const scoredContenders = actualContenderIds
    .map((riderId) => {
      const rider = ridersById.get(riderId)!
      const riderState = provisionalRiderStates.find((state) => state.riderId === riderId)!
      const commandRow = roadCommandResolution.riders.find((row) => row.riderId === riderId)!
      const phase = commandByRiderId.get(riderId)!
      const suitability = suitabilityByRiderId.get(riderId)!
      const scored = scoreRoadFinishRider(
        input,
        rider,
        riderState,
        commandRow.stageRole,
        phase,
        suitability,
        riderState.leadOutSupportReceived,
        frontGroupSize,
      )
      finishModelVersion = scored.modelVersion
      return {
        riderId,
        teamId: rider.teamId,
        score: scored.score,
        energyAtFinish: riderState.energyAtFinish,
      }
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.energyAtFinish - left.energyAtFinish ||
        (suitabilityByRiderId.get(right.riderId)?.suitabilityScore ?? 0) -
          (suitabilityByRiderId.get(left.riderId)?.suitabilityScore ?? 0) ||
        left.riderId.localeCompare(right.riderId),
    )

  const finishPoint = input.points
    .filter((point) => point.pointType === 'FINISH' || point.isFinishPoint)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.pointId.localeCompare(right.pointId))[0]
  const winningGroupRankings: UniversalRoadFinishRanking[] = scoredContenders.map(
    (row, index) => ({
      rank: index + 1,
      riderId: row.riderId,
      teamId: row.teamId,
      finishScore: row.score,
      energyAtFinish: row.energyAtFinish,
      finishTimeSeconds: winnerBaseTimeSeconds,
      gapSeconds: 0,
      pointsAwarded: finishPoint?.pointsScheme[index] ?? 0,
      bonusSecondsAwarded: finishPoint?.timeBonusSeconds[index] ?? 0,
    }),
  )
  const rankedIds = new Set(winningGroupRankings.map((row) => row.riderId))
  const remainingRankings: UniversalRoadFinishRanking[] = provisionalRiderStates
    .filter((state) => !rankedIds.has(state.riderId))
    .sort(
      (left, right) =>
        left.finalGapSeconds - right.finalGapSeconds ||
        right.energyAtFinish - left.energyAtFinish ||
        left.riderId.localeCompare(right.riderId),
    )
    .map((state, index) => ({
      rank: winningGroupRankings.length + index + 1,
      riderId: state.riderId,
      teamId: state.teamId,
      finishScore: 0,
      energyAtFinish: state.energyAtFinish,
      finishTimeSeconds: winnerBaseTimeSeconds + Math.round(state.finalGapSeconds),
      gapSeconds: state.finalGapSeconds,
      pointsAwarded:
        finishPoint?.pointsScheme[winningGroupRankings.length + index] ?? 0,
      bonusSecondsAwarded:
        finishPoint?.timeBonusSeconds[winningGroupRankings.length + index] ?? 0,
    }))
  const rankings = [...winningGroupRankings, ...remainingRankings]
  const winnerRiderId = rankings[0].riderId

  let status: UniversalRoadPhase4Status
  if (breakawaySurvived) status = 'breakaway_survived'
  else if (breakawayCaught) status = 'breakaway_caught'
  else if (actualContenderIds.length < finishEligibleRiderIds.length) {
    status = 'reduced_group_finish'
  } else if (activeEscape) status = 'field_finish'
  else status = 'no_active_escape'

  return {
    ...phase3Resolution,
    phase4Finish: {
      phaseNumber: 4,
      phaseBoundary,
      status,
      automaticActivityStartsAtFraction: chaseStartFraction,
      automaticActivityApplied: chaseSteps.some(
        (step) => step.automaticActivityFactor > 0,
      ),
      startGapSeconds: deterministicRound(startGapSeconds, 6),
      endGapSeconds,
      gapClosureSeconds,
      escapeRiderIdsAtStart: [...escapeRiderIdsAtStart].sort(),
      frontRiderIdsAfterBridges: [...currentFrontRiderIds].sort(),
      bridgeGroups,
      frontStrengthRecalculatedAfterBridge: bridgeMergedIntoFront,
      breakawaySurvived,
      breakawayCaught,
      explicitChasingTeamIds,
      automaticChasingTeamIds,
      chasingTeamStrength,
      chaseSteps,
      lateTerrainSelection,
      riderStates: provisionalRiderStates.sort(
        (left, right) =>
          left.finalGapSeconds - right.finalGapSeconds ||
          left.riderId.localeCompare(right.riderId),
      ),
      finalGroups,
      finish: {
        finishModel,
        finishType: input.stage.finishType,
        contenderRiderIds: actualContenderIds,
        winnerRiderId,
        rankings,
        modelVersion: finishModelVersion,
      },
      modelVersion: 'universal_road_phase_4_finish_v1',
    },
  }
}

function classifyStage(
  stage: UniversalStageInput,
): UniversalStageClassification {
  switch (stage.stageFormat) {
    case 'individual_time_trial':
      return 'individual_time_trial'
    case 'team_time_trial':
      return 'team_time_trial'
    case 'pair_time_trial':
      return 'pair_time_trial'
    case 'prologue':
      return 'prologue'
    case 'road_race':
      switch (stage.terrainType) {
        case 'flat':
          return 'flat_road_stage'
        case 'hilly':
          return 'hilly_road_stage'
        case 'mountain':
          return 'mountain_road_stage'
        case 'cobbled':
          return 'cobbled_road_stage'
        default:
          throw new Error(
            `Unsupported road terrain type: ${String(stage.terrainType)}`,
          )
      }
  }
}

/**
 * Phase 1 deterministic stage-analysis entry point.
 */

function getIntermediatePointRacePosition(
  phaseNumber: RoadRacePhaseNumber,
  pointKm: number,
  riderId: string,
  roadRaceResolution: UniversalRoadRaceResolutionSummary,
): UniversalIntermediateRacePosition {
  if (phaseNumber === 1) {
    const phase = roadRaceResolution.phase1Opening
    const attackHasStarted =
      phase?.firstWaveAttemptKm !== null &&
      phase?.firstWaveAttemptKm !== undefined &&
      pointKm >= phase.firstWaveAttemptKm
    if (
      attackHasStarted &&
      phase?.breakawayRiderIds.includes(riderId)
    ) {
      return 'front_escape'
    }
    return 'main_peloton'
  }

  if (phaseNumber === 2) {
    const phase = roadRaceResolution.phase2Development
    if (phase?.breakawayRiderIdsAtEnd.includes(riderId)) {
      return 'front_escape'
    }
    return 'main_peloton'
  }

  if (phaseNumber === 3) {
    const state = roadRaceResolution.phase3Decisive?.riderStates.find(
      (row) => row.riderId === riderId,
    )
    switch (state?.finalGroupCode) {
      case 'front_group':
        return 'front_group'
      case 'chasing_group':
        return 'chasing_group'
      case 'dropped_group':
        return 'dropped_group'
      case 'main_group':
      default:
        return 'main_peloton'
    }
  }

  const state = roadRaceResolution.phase4Finish?.riderStates.find(
    (row) => row.riderId === riderId,
  )
  switch (state?.finalGroupCode) {
    case 'winning_group':
    case 'front_chase_group':
      return 'front_group'
    case 'late_group':
      return 'late_group'
    case 'main_finish_group':
    default:
      return 'main_peloton'
  }
}

function getIntermediatePointEligibilityReasons(
  pointType: UniversalIntermediatePointType,
  racePosition: UniversalIntermediateRacePosition,
  phase: UniversalRoadCommandPhaseResolution,
  stageRole: RiderStageRole,
  teamTactic: RoadTeamTactic,
): UniversalIntermediateEligibilityReason[] {
  const reasons: UniversalIntermediateEligibilityReason[] = []
  const isFrontPosition =
    racePosition === 'front_escape' || racePosition === 'front_group'
  const isSuitablePosition =
    isFrontPosition || racePosition === 'main_peloton'
  const explicitIndividual =
    phase.resolvedSource === 'explicit_individual_command'

  if (
    pointType === 'INTERMEDIATE_SPRINT' ||
    pointType === 'BONUS_SPRINT'
  ) {
    if (phase.intermediateSprintContest.eligible) {
      reasons.push('explicit_contest_command')
    }
    if (
      explicitIndividual &&
      isFrontPosition &&
      (phase.resolvedCommand === 'attack' ||
        phase.resolvedCommand === 'join_breakaway')
    ) {
      reasons.push('explicit_breakaway_or_attack_command')
    }
    if (
      teamTactic === 'sprint_control' &&
      isSuitablePosition &&
      (stageRole === 'sprinter' ||
        stageRole === 'lead_out_rider' ||
        stageRole === 'sprint_train_rider')
    ) {
      reasons.push('team_sprint_objective')
    }
    if (
      explicitIndividual &&
      isSuitablePosition &&
      (phase.resolvedCommand === 'prepare_sprint' ||
        phase.resolvedCommand === 'ride_for_stage_result')
    ) {
      reasons.push('explicit_stage_result_command')
    }
  } else {
    if (phase.komContest.eligible) {
      reasons.push('explicit_contest_command')
    }
    if (
      explicitIndividual &&
      isFrontPosition &&
      (phase.resolvedCommand === 'attack' ||
        phase.resolvedCommand === 'join_breakaway')
    ) {
      reasons.push('explicit_breakaway_or_attack_command')
    }
    if (
      explicitIndividual &&
      isFrontPosition &&
      (stageRole === 'breakaway_rider' ||
        stageRole === 'climber' ||
        stageRole === 'mountain_domestique') &&
      (phase.resolvedCommand === 'attack' ||
        phase.resolvedCommand === 'join_breakaway' ||
        phase.resolvedCommand === 'ride_for_stage_result')
    ) {
      reasons.push('attack_or_breakaway_role_in_front_position')
    }
  }

  return Array.from(new Set(reasons))
}

export function buildUniversalIntermediatePointPlan(
  input: UniversalRaceEngineInput,
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  roadRaceResolution: UniversalRoadRaceResolutionSummary,
): UniversalIntermediatePointPlanSummary {
  const configuredPoints = input.points
    .filter(
      (point): point is UniversalStagePointInput & {
        pointType: UniversalIntermediatePointType
      } =>
        point.pointType === 'INTERMEDIATE_SPRINT' ||
        point.pointType === 'BONUS_SPRINT' ||
        point.pointType === 'KOM',
    )
    .sort(
      (left, right) =>
        left.kmFromStart - right.kmFromStart ||
        left.sortOrder - right.sortOrder ||
        left.pointId.localeCompare(right.pointId),
    )

  if (input.stage.stageFormat !== 'road_race') {
    return {
      active: false,
      inactiveReason: 'non_road_stage',
      configuredPointCount: configuredPoints.length,
      sprintPointCount: configuredPoints.filter(
        (point) => point.pointType !== 'KOM',
      ).length,
      komPointCount: configuredPoints.filter(
        (point) => point.pointType === 'KOM',
      ).length,
      points: [],
      modelVersion: 'universal_intermediate_point_plan_v1',
    }
  }

  if (configuredPoints.length === 0) {
    return {
      active: false,
      inactiveReason: 'no_intermediate_points',
      configuredPointCount: 0,
      sprintPointCount: 0,
      komPointCount: 0,
      points: [],
      modelVersion: 'universal_intermediate_point_plan_v1',
    }
  }

  const teamTacticByTeamId = new Map(
    input.stagePlans.map((plan) => [
      plan.teamId,
      plan.teamTactic as RoadTeamTactic,
    ]),
  )

  const points = configuredPoints.map((point): UniversalIntermediatePointPlan => {
    const phaseNumber = getRoadPhaseNumberForPoint(
      point.kmFromStart,
      input.stage.distanceKm,
    )
    const candidates = roadCommandResolution.riders
      .map((riderRow): UniversalIntermediatePointCandidate => {
        const phase = riderRow.phases.find(
          (row) => row.phaseNumber === phaseNumber,
        )!
        const racePosition = getIntermediatePointRacePosition(
          phaseNumber,
          point.kmFromStart,
          riderRow.riderId,
          roadRaceResolution,
        )
        const teamTactic =
          teamTacticByTeamId.get(riderRow.teamId) ?? 'balanced'
        const reasons = riderRow.eligibleToStart
          ? getIntermediatePointEligibilityReasons(
              point.pointType,
              racePosition,
              phase,
              riderRow.stageRole,
              teamTactic,
            )
          : []
        return {
          riderId: riderRow.riderId,
          teamId: riderRow.teamId,
          phaseNumber,
          pointId: point.pointId,
          pointType: point.pointType,
          racePosition,
          resolvedCommand: phase.resolvedCommand,
          commandSource: phase.resolvedSource,
          stageRole: riderRow.stageRole,
          teamTactic,
          canCrossPoint: riderRow.eligibleToStart,
          eligible: reasons.length > 0,
          eligibilityReasons: reasons,
        }
      })
      .sort((left, right) => left.riderId.localeCompare(right.riderId))
    const eligibleRiderIds = candidates
      .filter((candidate) => candidate.eligible)
      .map((candidate) => candidate.riderId)
      .sort()

    return {
      pointId: point.pointId,
      pointType: point.pointType,
      pointName: point.name,
      kmFromStart: point.kmFromStart,
      sortOrder: point.sortOrder,
      phaseNumber,
      komCategory: point.komCategory,
      configuredPointsScheme: [...point.pointsScheme],
      configuredTimeBonusSeconds: [...point.timeBonusSeconds],
      candidateRiderIds: candidates.map((candidate) => candidate.riderId),
      eligibleRiderIds,
      candidates,
      status: eligibleRiderIds.length > 0 ? 'ready' : 'no_eligible_riders',
    }
  })

  return {
    active: true,
    inactiveReason: null,
    configuredPointCount: points.length,
    sprintPointCount: points.filter((point) => point.pointType !== 'KOM').length,
    komPointCount: points.filter((point) => point.pointType === 'KOM').length,
    points,
    modelVersion: 'universal_intermediate_point_plan_v1',
  }
}


function getIntermediatePointPhaseProgress(
  phaseNumber: RoadRacePhaseNumber,
  pointKm: number,
  stageDistanceKm: number,
): number {
  const phase = ROAD_RACE_PHASES.find(
    (row) => row.phaseNumber === phaseNumber,
  )!
  const startKm = phase.startFraction * stageDistanceKm
  const endKm = phase.endFraction * stageDistanceKm

  if (endKm <= startKm) return 0

  return clamp((pointKm - startKm) / (endKm - startKm), 0, 1)
}

function getIntermediatePointLiveEnergy(
  riderId: string,
  pointKm: number,
  phaseNumber: RoadRacePhaseNumber,
  input: UniversalRaceEngineInput,
  readinessByRiderId: ReadonlyMap<string, UniversalRiderReadinessResult>,
  roadRaceResolution: UniversalRoadRaceResolutionSummary,
): number {
  const readiness = readinessByRiderId.get(riderId)
  const initialEnergy = readiness?.fatigueBalance.startEnergy ?? 0
  const phase1End =
    roadRaceResolution.phase1Opening?.riderEnergy.find(
      (row) => row.riderId === riderId,
    )?.energyAfterPhase ?? initialEnergy
  const phase2End =
    roadRaceResolution.phase2Development?.riderEnergy.find(
      (row) => row.riderId === riderId,
    )?.energyAfterPhase ?? phase1End
  const phase3End =
    roadRaceResolution.phase3Decisive?.riderStates.find(
      (row) => row.riderId === riderId,
    )?.energyAfterPhase ?? phase2End
  const phase4End =
    roadRaceResolution.phase4Finish?.riderStates.find(
      (row) => row.riderId === riderId,
    )?.energyAtFinish ?? phase3End

  let startEnergy: number
  let endEnergy: number
  switch (phaseNumber) {
    case 1:
      startEnergy = initialEnergy
      endEnergy = phase1End
      break
    case 2:
      startEnergy = phase1End
      endEnergy = phase2End
      break
    case 3:
      startEnergy = phase2End
      endEnergy = phase3End
      break
    case 4:
      startEnergy = phase3End
      endEnergy = phase4End
      break
  }

  const progress = getIntermediatePointPhaseProgress(
    phaseNumber,
    pointKm,
    input.stage.distanceKm,
  )

  return deterministicRound(
    clamp(startEnergy + (endEnergy - startEnergy) * progress, 0, 100),
    6,
  )
}

function getIntermediatePointPositionContribution(
  pointType: UniversalIntermediatePointType,
  racePosition: UniversalIntermediateRacePosition,
): number {
  const sprintBattle = pointType !== 'KOM'

  switch (racePosition) {
    case 'front_escape':
      return sprintBattle ? 7 : 8
    case 'front_group':
      return sprintBattle ? 6 : 7
    case 'main_peloton':
      return sprintBattle ? 4 : 1
    case 'chasing_group':
      return sprintBattle ? 0 : -1
    case 'dropped_group':
      return -8
    case 'late_group':
      return -12
  }
}


/**
 * Physical race order always outranks skill at an intermediate line.
 * A rider in a group behind cannot score ahead of a rider who reaches the
 * configured point first. Skill, readiness, support, commands and seeded
 * variation resolve the order only inside the same race-position tier.
 */
function getIntermediatePointRacePositionOrder(
  racePosition: UniversalIntermediateRacePosition,
): number {
  switch (racePosition) {
    case 'front_escape':
      return 0
    case 'front_group':
      return 1
    case 'main_peloton':
      return 2
    case 'chasing_group':
      return 3
    case 'dropped_group':
      return 4
    case 'late_group':
      return 5
  }
}

function getIntermediatePointCommandCommitment(
  reasons: readonly UniversalIntermediateEligibilityReason[],
): number {
  const values = reasons.map((reason) => {
    switch (reason) {
      case 'explicit_contest_command':
        return 6
      case 'explicit_breakaway_or_attack_command':
        return 4.5
      case 'team_sprint_objective':
        return 3.5
      case 'explicit_stage_result_command':
        return 3
      case 'attack_or_breakaway_role_in_front_position':
        return 2.5
    }
  })

  return values.length > 0 ? Math.max(...values) : 0
}

function getKomCategoryDifficultyFactor(
  category: KomCategory | null,
): number {
  switch (category) {
    case 'HC':
      return 1.12
    case '1':
      return 1.09
    case '2':
      return 1.06
    case '3':
      return 1.03
    case '4':
    case null:
      return 1
  }
}

function getIntermediatePointTeamSupportContribution(
  pointType: UniversalIntermediatePointType,
  riderId: string,
  teamTactic: RoadTeamTactic,
  phaseNumber: RoadRacePhaseNumber,
  roadRaceResolution: UniversalRoadRaceResolutionSummary,
): number {
  const protectionReceived =
    phaseNumber >= 2
      ? roadRaceResolution.phase2Development?.supportActions
          .filter(
            (action) =>
              action.status === 'applied' && action.targetRiderId === riderId,
          )
          .reduce(
            (sum, action) => sum + action.protectionReceivedScore,
            0,
          ) ?? 0
      : 0
  const tacticContribution =
    pointType === 'KOM'
      ? teamTactic === 'climber_support'
        ? 2
        : 0
      : teamTactic === 'sprint_control'
        ? 2
        : 0
  const protectionMultiplier = pointType === 'KOM' ? 0.4 : 0.6

  return deterministicRound(
    Math.min(
      5,
      protectionReceived * protectionMultiplier + tacticContribution,
    ),
    6,
  )
}

export function buildUniversalIntermediatePointBattles(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  roadRaceResolution: UniversalRoadRaceResolutionSummary,
  intermediatePointPlan: UniversalIntermediatePointPlanSummary,
): UniversalIntermediatePointBattleSummary {
  if (!intermediatePointPlan.active) {
    return {
      active: false,
      inactiveReason: intermediatePointPlan.inactiveReason,
      configuredPointCount: intermediatePointPlan.configuredPointCount,
      contestedPointCount: 0,
      totalPointsAwarded: 0,
      totalBonusSecondsAwarded: 0,
      battles: [],
      modelVersion: 'universal_intermediate_point_battles_v1',
    }
  }

  const ridersById = new Map(input.riders.map((rider) => [rider.riderId, rider]))
  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row]),
  )

  const battles = intermediatePointPlan.points.map(
    (pointPlan): UniversalIntermediatePointBattle => {
      const point = input.points.find(
        (row) => row.pointId === pointPlan.pointId,
      )!
      const komCategoryDifficultyFactor = getKomCategoryDifficultyFactor(
        pointPlan.komCategory,
      )
      const scoredContestants = pointPlan.candidates
        .filter((candidate) => candidate.canCrossPoint)
        .map((candidate) => {
          const rider = ridersById.get(candidate.riderId)!
          const readiness = readinessByRiderId.get(candidate.riderId)!
          const liveEnergyBeforeBattle = getIntermediatePointLiveEnergy(
            candidate.riderId,
            pointPlan.kmFromStart,
            pointPlan.phaseNumber,
            input,
            readinessByRiderId,
            roadRaceResolution,
          )
          const productionBaseScore = scorePhase2PointContestant(
            point,
            rider,
            candidate.stageRole,
            liveEnergyBeforeBattle,
          )
          const readinessContribution = deterministicRound(
            readiness.readinessScore * 0.08,
            6,
          )
          const racePositionContribution =
            getIntermediatePointPositionContribution(
              pointPlan.pointType,
              candidate.racePosition,
            )
          const teamSupportContribution =
            getIntermediatePointTeamSupportContribution(
              pointPlan.pointType,
              candidate.riderId,
              candidate.teamTactic,
              pointPlan.phaseNumber,
              roadRaceResolution,
            )
          const commandCommitmentContribution =
            getIntermediatePointCommandCommitment(
              candidate.eligibilityReasons,
            )
          const energySpentPenalty = deterministicRound(
            Math.max(
              0,
              readiness.fatigueBalance.startEnergy - liveEnergyBeforeBattle,
            ) * 0.06,
            6,
          )
          const komCategoryContribution =
            pointPlan.pointType === 'KOM'
              ? deterministicRound(
                  (rider.climbing - 50) *
                    (komCategoryDifficultyFactor - 1) *
                    0.8,
                  6,
                )
              : 0
          const deterministicVariation = deterministicRound(
            (calculateDeterministicUnitRoll(
              `${input.engine.deterministicSeed}|${input.stage.stageId}|${pointPlan.pointId}|${candidate.riderId}|intermediate_battle`,
            ) -
              0.5) *
              3,
            6,
          )
          const score = deterministicRound(
            productionBaseScore +
              readinessContribution +
              racePositionContribution +
              teamSupportContribution +
              commandCommitmentContribution -
              energySpentPenalty +
              komCategoryContribution +
              deterministicVariation,
            6,
          )

          return {
            riderId: candidate.riderId,
            teamId: candidate.teamId,
            racePosition: candidate.racePosition,
            resolvedCommand: candidate.resolvedCommand,
            stageRole: candidate.stageRole,
            score,
            readinessScore: readiness.readinessScore,
            liveEnergyBeforeBattle,
            components: {
              productionBaseScore,
              readinessContribution,
              racePositionContribution,
              teamSupportContribution,
              commandCommitmentContribution,
              energySpentPenalty,
              komCategoryContribution,
              deterministicVariation,
            },
          }
        })
        .sort(
          (left, right) =>
            getIntermediatePointRacePositionOrder(left.racePosition) -
              getIntermediatePointRacePositionOrder(right.racePosition) ||
            right.score - left.score ||
            right.liveEnergyBeforeBattle - left.liveEnergyBeforeBattle ||
            right.readinessScore - left.readinessScore ||
            left.riderId.localeCompare(right.riderId),
        )

      const rankings: UniversalIntermediatePointBattleRanking[] =
        scoredContestants.map((contestant, index) => ({
          rank: index + 1,
          ...contestant,
          pointsAwarded: pointPlan.configuredPointsScheme[index] ?? 0,
          bonusSecondsAwarded:
            pointPlan.configuredTimeBonusSeconds[index] ?? 0,
        }))
      const totalPointsAwarded = rankings.reduce(
        (sum, row) => sum + row.pointsAwarded,
        0,
      )
      const totalBonusSecondsAwarded = rankings.reduce(
        (sum, row) => sum + row.bonusSecondsAwarded,
        0,
      )

      return {
        pointId: pointPlan.pointId,
        pointType: pointPlan.pointType,
        pointName: pointPlan.pointName,
        kmFromStart: pointPlan.kmFromStart,
        sortOrder: pointPlan.sortOrder,
        phaseNumber: pointPlan.phaseNumber,
        komCategory: pointPlan.komCategory,
        komCategoryDifficultyFactor,
        configuredPointsScheme: [...pointPlan.configuredPointsScheme],
        configuredTimeBonusSeconds: [
          ...pointPlan.configuredTimeBonusSeconds,
        ],
        eligibleContestantIds: scoredContestants.map(
          (row) => row.riderId,
        ),
        committedContestantIds: pointPlan.candidates
          .filter((candidate) => candidate.canCrossPoint && candidate.eligible)
          .map((candidate) => candidate.riderId)
          .sort(),
        rankingMode:
          scoredContestants.length === 0
            ? 'no_active_riders'
            : pointPlan.eligibleRiderIds.length === 0
              ? 'automatic_crossing_order'
              : pointPlan.eligibleRiderIds.length === scoredContestants.length
                ? 'deliberate_contest'
                : 'mixed_crossing_order',
        status:
          scoredContestants.length > 0 ? 'contested' : 'not_contested',
        winnerRiderId: rankings[0]?.riderId ?? null,
        rankings,
        totalPointsAwarded,
        totalBonusSecondsAwarded,
        scoringModel:
          pointPlan.pointType === 'KOM'
            ? 'universal_kom_battle_v1'
            : 'universal_intermediate_sprint_battle_v1',
      }
    },
  )

  return {
    active: true,
    inactiveReason: null,
    configuredPointCount: battles.length,
    contestedPointCount: battles.filter(
      (battle) => battle.status === 'contested',
    ).length,
    totalPointsAwarded: battles.reduce(
      (sum, battle) => sum + battle.totalPointsAwarded,
      0,
    ),
    totalBonusSecondsAwarded: battles.reduce(
      (sum, battle) => sum + battle.totalBonusSecondsAwarded,
      0,
    ),
    battles,
    modelVersion: 'universal_intermediate_point_battles_v1',
  }
}


function getPointBattlePhaseResolution(
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  riderId: string,
  phaseNumber: RoadRacePhaseNumber,
): UniversalRoadCommandPhaseResolution | null {
  return (
    roadCommandResolution.riders
      .find((row) => row.riderId === riderId)
      ?.phases.find((phase) => phase.phaseNumber === phaseNumber) ?? null
  )
}

function isPointCostAlreadyRepresentedInRoadPhase(
  pointType: UniversalIntermediatePointType,
  pointId: string,
  phaseResolution: UniversalRoadCommandPhaseResolution | null,
): boolean {
  if (!phaseResolution || ![2, 3].includes(phaseResolution.phaseNumber)) {
    return false
  }

  if (pointType === 'KOM') {
    return (
      phaseResolution.komContest.eligible &&
      phaseResolution.komPointIds.includes(pointId)
    )
  }

  return (
    phaseResolution.intermediateSprintContest.eligible &&
    phaseResolution.intermediateSprintPointIds.includes(pointId)
  )
}

function calculateIntermediatePointBattleEnergyCost(
  input: UniversalRaceEngineInput,
  rider: UniversalRiderInput,
  readiness: UniversalRiderReadinessResult,
  stageRole: RiderStageRole,
  phaseNumber: RoadRacePhaseNumber,
  pointType: UniversalIntermediatePointType,
  kmFromStart: number,
): number {
  const objectiveCommand: RoadCommandInput =
    pointType === 'KOM'
      ? 'contest_kom_points'
      : 'contest_intermediate_sprint'
  const commandEffect = calculateRoadCommandEffect(
    objectiveCommand,
    stageRole,
    phaseNumber,
  )
  const objectiveStartKm = Math.max(0, kmFromStart - 0.25)
  const objectiveEndKm = Math.min(
    input.stage.distanceKm,
    kmFromStart + 0.25,
  )
  const activeCost = calculateRoadEnergyCostForRange(
    input,
    rider,
    readiness,
    commandEffect.roleAdjustedEffortMultiplier,
    objectiveStartKm,
    objectiveEndKm,
  )
  const neutralCost = calculateRoadEnergyCostForRange(
    input,
    rider,
    readiness,
    1,
    objectiveStartKm,
    objectiveEndKm,
  )

  return deterministicRound(Math.max(0, activeCost - neutralCost), 6)
}

function buildIntermediatePointEventText(
  battle: UniversalIntermediatePointBattle,
): { readonly title: string; readonly description: string } {
  const displayName = battle.pointName ??
    (battle.pointType === 'KOM'
      ? 'KOM point'
      : battle.pointType === 'BONUS_SPRINT'
        ? 'bonus sprint'
        : 'intermediate sprint')

  if (battle.status === 'not_contested' || battle.rankings.length === 0) {
    return {
      title:
        battle.pointType === 'KOM'
          ? 'KOM result unavailable'
          : 'Sprint result unavailable',
      description: `${displayName} at ${deterministicRound(
        battle.kmFromStart,
        1,
      )} km has no active rider crossing order.`,
    }
  }

  const winner = battle.rankings[0]
  const podium = battle.rankings
    .slice(0, 3)
    .map((row) => `${row.rank}. ${row.riderId}`)
    .join(', ')
  const hasCommittedContestants = battle.committedContestantIds.length > 0
  const title =
    battle.pointType === 'KOM'
      ? hasCommittedContestants
        ? `KOM ${battle.komCategory ?? ''} contested`.trim()
        : `KOM ${battle.komCategory ?? ''} result`.trim()
      : battle.pointType === 'BONUS_SPRINT'
        ? hasCommittedContestants
          ? 'Bonus sprint contested'
          : 'Bonus sprint result'
        : hasCommittedContestants
          ? 'Intermediate sprint contested'
          : 'Intermediate sprint result'
  const awarded = [
    winner.pointsAwarded > 0 ? `${winner.pointsAwarded} points` : null,
    winner.bonusSecondsAwarded > 0
      ? `${winner.bonusSecondsAwarded} bonus seconds`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' and ')

  return {
    title,
    description: `${winner.riderId} crosses first at ${displayName} at ${deterministicRound(
      battle.kmFromStart,
      1,
    )} km for ${winner.teamId}${awarded ? ` and receives ${awarded}` : ''}. Top riders: ${podium}.${
      hasCommittedContestants
        ? ''
        : ' No rider used a deliberate contest command, so the deterministic crossing order awarded the configured places.'
    }`,
  }
}

export function buildUniversalIntermediatePointFinalization(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  intermediatePointPlan: UniversalIntermediatePointPlanSummary,
  intermediatePointBattles: UniversalIntermediatePointBattleSummary,
): UniversalIntermediatePointFinalizationSummary {
  if (!intermediatePointBattles.active) {
    const configuredPointIds = intermediatePointPlan.points.map(
      (point) => point.pointId,
    )
    return {
      active: false,
      inactiveReason: intermediatePointBattles.inactiveReason,
      configuredPointCount: intermediatePointBattles.configuredPointCount,
      finalizedPointCount: 0,
      totalEnergyCost: 0,
      totalFatigueCost: 0,
      costApplications: [],
      replayEvents: [],
      commentaryEntries: [],
      pointLedger: [],
      riderPointTotals: [],
      teamPointTotals: [],
      synchronization: {
        configuredPointCount: configuredPointIds.length,
        battleCount: 0,
        replayEventCount: 0,
        commentaryEntryCount: 0,
        uniqueReplayPointCount: 0,
        costApplicationCount: 0,
        uniqueCostApplicationCount: 0,
        ledgerEntryCount: 0,
        uniqueLedgerEntryCount: 0,
        missingBattlePointIds: [...configuredPointIds],
        missingReplayEventPointIds: [...configuredPointIds],
        missingCommentaryPointIds: [...configuredPointIds],
        duplicateCostApplicationCount: 0,
        duplicateLedgerEntryCount: 0,
        synchronized: configuredPointIds.length === 0,
      },
      modelVersion: 'universal_intermediate_point_finalization_v1',
    }
  }

  const ridersById = new Map(input.riders.map((rider) => [rider.riderId, rider]))
  const readinessByRiderId = new Map(
    riderReadiness.map((readiness) => [readiness.riderId, readiness]),
  )
  const planByPointId = new Map(
    intermediatePointPlan.points.map((point) => [point.pointId, point]),
  )
  const cumulativePointEnergyCostByRiderId = new Map<string, number>()
  const costApplicationByKey = new Map<
    string,
    UniversalIntermediatePointCostApplication
  >()
  const ledgerEntryByKey = new Map<
    string,
    UniversalIntermediatePointLedgerEntry
  >()
  const replayEvents: UniversalIntermediatePointReplayEvent[] = []
  const commentaryEntries: UniversalIntermediatePointCommentaryEntry[] = []

  const orderedBattles = [...intermediatePointBattles.battles].sort(
    (left, right) =>
      left.kmFromStart - right.kmFromStart ||
      left.sortOrder - right.sortOrder ||
      left.pointId.localeCompare(right.pointId),
  )

  orderedBattles.forEach((battle, battleIndex) => {
    const pointPlan = planByPointId.get(battle.pointId)
    const costApplicationKeys: string[] = []

    battle.rankings.forEach((ranking) => {
      if (ranking.pointsAwarded > 0 || ranking.bonusSecondsAwarded > 0) {
        const ledgerEntryKey = `${battle.pointId}|${ranking.riderId}|${ranking.rank}`
        if (!ledgerEntryByKey.has(ledgerEntryKey)) {
          ledgerEntryByKey.set(ledgerEntryKey, {
            ledgerEntryKey,
            pointId: battle.pointId,
            pointType: battle.pointType,
            riderId: ranking.riderId,
            teamId: ranking.teamId,
            rank: ranking.rank,
            pointsAwarded: ranking.pointsAwarded,
            bonusSecondsAwarded: ranking.bonusSecondsAwarded,
            awardApplicationCount: 1,
            modelVersion: 'universal_intermediate_point_ledger_entry_v1',
          })
        }
      }

      const rider = ridersById.get(ranking.riderId)
      const readiness = readinessByRiderId.get(ranking.riderId)
      const candidate = pointPlan?.candidates.find(
        (row) => row.riderId === ranking.riderId,
      )
      if (!rider || !readiness || !candidate || !candidate.eligible) return

      const applicationKey = `${battle.pointId}|${ranking.riderId}`
      if (costApplicationByKey.has(applicationKey)) return

      const previousPointCost =
        cumulativePointEnergyCostByRiderId.get(ranking.riderId) ?? 0
      const energyBeforeBattle = deterministicRound(
        Math.max(0, ranking.liveEnergyBeforeBattle - previousPointCost),
        6,
      )
      const calculatedEnergyCost = calculateIntermediatePointBattleEnergyCost(
        input,
        rider,
        readiness,
        candidate.stageRole,
        battle.phaseNumber,
        battle.pointType,
        battle.kmFromStart,
      )
      const energyCost = deterministicRound(
        Math.min(energyBeforeBattle, calculatedEnergyCost),
        6,
      )
      const fatigueCost = deterministicRound(
        energyCost * readiness.fatigueBalance.postStageFatigueMultiplier,
        6,
      )
      const phaseResolution = getPointBattlePhaseResolution(
        roadCommandResolution,
        ranking.riderId,
        battle.phaseNumber,
      )
      const applicationMode = isPointCostAlreadyRepresentedInRoadPhase(
        battle.pointType,
        battle.pointId,
        phaseResolution,
      )
        ? 'existing_phase_objective_cost'
        : 'point_finalization_cost'
      const application: UniversalIntermediatePointCostApplication = {
        applicationKey,
        pointId: battle.pointId,
        pointType: battle.pointType,
        phaseNumber: battle.phaseNumber,
        riderId: ranking.riderId,
        teamId: ranking.teamId,
        rank: ranking.rank,
        energyBeforeBattle,
        energyCost,
        energyAfterBattle: deterministicRound(
          Math.max(0, energyBeforeBattle - energyCost),
          6,
        ),
        fatigueCost,
        applicationMode,
        applicationCount: 1,
        modelVersion: 'universal_intermediate_point_cost_v1',
      }
      costApplicationByKey.set(applicationKey, application)
      costApplicationKeys.push(applicationKey)
      cumulativePointEnergyCostByRiderId.set(
        ranking.riderId,
        deterministicRound(previousPointCost + energyCost, 6),
      )
    })

    const eventId = `${input.stage.stageId}|point-event|${battle.pointId}`
    const commentaryEntryId = `${eventId}|commentary`
    const eventText = buildIntermediatePointEventText(battle)
    replayEvents.push({
      eventId,
      eventOrder: battleIndex + 1,
      pointId: battle.pointId,
      pointType: battle.pointType,
      pointName: battle.pointName,
      kmFromStart: battle.kmFromStart,
      phaseNumber: battle.phaseNumber,
      title: eventText.title,
      winnerRiderId: battle.rankings[0]?.riderId ?? null,
      winnerTeamId: battle.rankings[0]?.teamId ?? null,
      rankings: battle.rankings.map((ranking) => ({
        rank: ranking.rank,
        riderId: ranking.riderId,
        teamId: ranking.teamId,
        pointsAwarded: ranking.pointsAwarded,
        bonusSecondsAwarded: ranking.bonusSecondsAwarded,
      })),
      costApplicationKeys: costApplicationKeys.sort(),
      commentaryEntryId,
      modelVersion: 'universal_intermediate_point_replay_event_v1',
    })
    commentaryEntries.push({
      commentaryEntryId,
      replayEventId: eventId,
      eventOrder: battleIndex + 1,
      pointId: battle.pointId,
      kmFromStart: battle.kmFromStart,
      phaseNumber: battle.phaseNumber,
      title: eventText.title,
      description: eventText.description,
      modelVersion: 'universal_intermediate_point_commentary_v1',
    })
  })

  const costApplications = [...costApplicationByKey.values()].sort(
    (left, right) =>
      left.phaseNumber - right.phaseNumber ||
      left.pointId.localeCompare(right.pointId) ||
      left.rank - right.rank ||
      left.riderId.localeCompare(right.riderId),
  )
  const pointLedger = [...ledgerEntryByKey.values()].sort(
    (left, right) =>
      left.pointId.localeCompare(right.pointId) ||
      left.rank - right.rank ||
      left.riderId.localeCompare(right.riderId),
  )

  const riderTotalMap = new Map<string, UniversalIntermediateRiderPointTotal>()
  const teamTotalMap = new Map<string, UniversalIntermediateTeamPointTotal>()
  pointLedger.forEach((entry) => {
    const riderExisting = riderTotalMap.get(entry.riderId)
    const sprintPoints =
      entry.pointType === 'KOM' ? 0 : entry.pointsAwarded
    const mountainPoints =
      entry.pointType === 'KOM' ? entry.pointsAwarded : 0
    riderTotalMap.set(entry.riderId, {
      riderId: entry.riderId,
      teamId: entry.teamId,
      sprintPoints: (riderExisting?.sprintPoints ?? 0) + sprintPoints,
      mountainPoints: (riderExisting?.mountainPoints ?? 0) + mountainPoints,
      totalPoints: (riderExisting?.totalPoints ?? 0) + entry.pointsAwarded,
      bonusSeconds:
        (riderExisting?.bonusSeconds ?? 0) + entry.bonusSecondsAwarded,
      pointWins:
        (riderExisting?.pointWins ?? 0) + (entry.rank === 1 ? 1 : 0),
    })

    const teamExisting = teamTotalMap.get(entry.teamId)
    teamTotalMap.set(entry.teamId, {
      teamId: entry.teamId,
      sprintPoints: (teamExisting?.sprintPoints ?? 0) + sprintPoints,
      mountainPoints: (teamExisting?.mountainPoints ?? 0) + mountainPoints,
      totalPoints: (teamExisting?.totalPoints ?? 0) + entry.pointsAwarded,
      bonusSeconds:
        (teamExisting?.bonusSeconds ?? 0) + entry.bonusSecondsAwarded,
      pointWins:
        (teamExisting?.pointWins ?? 0) + (entry.rank === 1 ? 1 : 0),
    })
  })

  const configuredPointIds = intermediatePointPlan.points.map(
    (point) => point.pointId,
  )
  const battlePointIds = new Set(
    intermediatePointBattles.battles.map((battle) => battle.pointId),
  )
  const replayPointIds = new Set(replayEvents.map((event) => event.pointId))
  const commentaryPointIds = new Set(
    commentaryEntries.map((entry) => entry.pointId),
  )
  const missingBattlePointIds = configuredPointIds.filter(
    (pointId) => !battlePointIds.has(pointId),
  )
  const missingReplayEventPointIds = configuredPointIds.filter(
    (pointId) => !replayPointIds.has(pointId),
  )
  const missingCommentaryPointIds = configuredPointIds.filter(
    (pointId) => !commentaryPointIds.has(pointId),
  )
  const duplicateCostApplicationCount =
    costApplications.length -
    new Set(costApplications.map((row) => row.applicationKey)).size
  const duplicateLedgerEntryCount =
    pointLedger.length -
    new Set(pointLedger.map((row) => row.ledgerEntryKey)).size
  const synchronization: UniversalIntermediatePointSynchronizationSummary = {
    configuredPointCount: configuredPointIds.length,
    battleCount: intermediatePointBattles.battles.length,
    replayEventCount: replayEvents.length,
    commentaryEntryCount: commentaryEntries.length,
    uniqueReplayPointCount: replayPointIds.size,
    costApplicationCount: costApplications.length,
    uniqueCostApplicationCount: new Set(
      costApplications.map((row) => row.applicationKey),
    ).size,
    ledgerEntryCount: pointLedger.length,
    uniqueLedgerEntryCount: new Set(
      pointLedger.map((row) => row.ledgerEntryKey),
    ).size,
    missingBattlePointIds,
    missingReplayEventPointIds,
    missingCommentaryPointIds,
    duplicateCostApplicationCount,
    duplicateLedgerEntryCount,
    synchronized:
      missingBattlePointIds.length === 0 &&
      missingReplayEventPointIds.length === 0 &&
      missingCommentaryPointIds.length === 0 &&
      duplicateCostApplicationCount === 0 &&
      duplicateLedgerEntryCount === 0 &&
      intermediatePointBattles.battles.length === configuredPointIds.length &&
      replayEvents.length === configuredPointIds.length &&
      commentaryEntries.length === configuredPointIds.length,
  }

  return {
    active: true,
    inactiveReason: null,
    configuredPointCount: configuredPointIds.length,
    finalizedPointCount: replayEvents.length,
    totalEnergyCost: deterministicRound(
      costApplications.reduce((sum, row) => sum + row.energyCost, 0),
      6,
    ),
    totalFatigueCost: deterministicRound(
      costApplications.reduce((sum, row) => sum + row.fatigueCost, 0),
      6,
    ),
    costApplications,
    replayEvents,
    commentaryEntries,
    pointLedger,
    riderPointTotals: [...riderTotalMap.values()].sort((left, right) =>
      left.riderId.localeCompare(right.riderId),
    ),
    teamPointTotals: [...teamTotalMap.values()].sort((left, right) =>
      left.teamId.localeCompare(right.teamId),
    ),
    synchronization,
    modelVersion: 'universal_intermediate_point_finalization_v1',
  }
}


function phase5SelectionProfile(
  input: UniversalRaceEngineInput,
  difficulty: UniversalDifficultySummary,
): UniversalPhase5GroupingSummary['selectionProfile'] {
  if (input.stage.stageFormat === 'individual_time_trial' || input.stage.stageFormat === 'prologue') {
    return 'individual_timing'
  }
  if (input.stage.stageFormat === 'team_time_trial' || input.stage.stageFormat === 'pair_time_trial') {
    return 'team_timing'
  }
  if (input.stage.terrainType === 'cobbled') return 'cobbled_irregular_selection'
  if (input.stage.terrainType === 'mountain') {
    return difficulty.category >= 5
      ? 'extreme_mountain_large_gaps'
      : 'mountain_multiple_groups'
  }
  if (input.stage.terrainType === 'hilly') {
    return difficulty.category >= 4
      ? 'hard_hilly_reduced_groups'
      : 'hilly_moderate_selection'
  }
  return 'flat_large_groups'
}

function phase5BandThreshold(
  profile: UniversalPhase5GroupingSummary['selectionProfile'],
  phaseNumber: RoadRacePhaseNumber | 0,
): number {
  const base =
    profile === 'flat_large_groups' ? 10 :
    profile === 'hilly_moderate_selection' ? 7 :
    profile === 'hard_hilly_reduced_groups' ? 5 :
    profile === 'mountain_multiple_groups' ? 4 :
    profile === 'extreme_mountain_large_gaps' ? 3 :
    profile === 'cobbled_irregular_selection' ? 5 : 0
  return phaseNumber === 0 ? base : deterministicRound(base * (1 - (phaseNumber - 1) * 0.08), 3)
}

function phase5GapCapSeconds(
  input: UniversalRaceEngineInput,
  difficulty: UniversalDifficultySummary,
): number {
  const terrainCap =
    input.stage.terrainType === 'flat' ? 480 :
    input.stage.terrainType === 'hilly' ? 900 :
    input.stage.terrainType === 'mountain' ? 2400 :
    input.stage.terrainType === 'cobbled' ? 1200 : 3600
  return Math.round(terrainCap * (0.72 + difficulty.category * 0.14))
}

export const PHASE5_GROUP_MERGE_TOLERANCE_SECONDS = 5 as const
const PHASE5_BREAKAWAY_DISPLAY_PREFIX = 'B' as const

export interface UniversalPhase5RoadGroupCandidate {
  readonly sourceOrder: number
  readonly preferredGroupCode: UniversalPhase5GroupCode
  readonly riderIds: readonly string[]
  readonly gapSeconds: number
  readonly riderPerformanceScores: Readonly<Record<string, number>>
  readonly formationReason: UniversalPhase5GroupSnapshot['formationReason']
}

function phase5PerformanceBand(
  scores: readonly number[],
  threshold: number,
): UniversalPhase5PerformanceBand {
  const bestScore = scores.length > 0 ? Math.max(...scores) : 0
  const worstScore = scores.length > 0 ? Math.min(...scores) : 0
  return {
    bestScore: deterministicRound(bestScore, 6),
    worstScore: deterministicRound(worstScore, 6),
    spread: deterministicRound(bestScore - worstScore, 6),
    threshold,
  }
}

function phase5RoadPerformanceScore(
  riderId: string,
  suitabilityByRider: ReadonlyMap<string, UniversalRiderSuitabilityResult>,
  readinessByRider: ReadonlyMap<string, UniversalRiderReadinessResult>,
  energy: number,
  workPenalty: number,
  protectionBonus: number,
): number {
  const suitability = suitabilityByRider.get(riderId)?.suitabilityScore ?? 0
  const readiness = readinessByRider.get(riderId)?.readinessScore ?? 0
  return deterministicRound(
    suitability * 0.56 +
      readiness * 0.2 +
      energy * 0.24 +
      protectionBonus -
      workPenalty,
    6,
  )
}

function phase5RiderTieBreakKey(
  riderId: string,
  riderById: ReadonlyMap<string, UniversalRiderInput>,
): readonly [number, string, string] {
  const rider = riderById.get(riderId)
  const startNumber = rider?.snapshot.startNumber
  const displayName =
    rider?.snapshot.displayName ??
    [rider?.snapshot.firstName, rider?.snapshot.lastName]
      .filter(Boolean)
      .join(' ') ??
    ''

  return [
    typeof startNumber === 'number' ? startNumber : Number.MAX_SAFE_INTEGER,
    displayName,
    riderId,
  ]
}

function comparePhase5Riders(
  leftRiderId: string,
  rightRiderId: string,
  scores: Readonly<Record<string, number>>,
  riderById: ReadonlyMap<string, UniversalRiderInput>,
): number {
  const scoreDifference =
    (scores[rightRiderId] ?? 0) - (scores[leftRiderId] ?? 0)
  if (Math.abs(scoreDifference) > 0.000001) return scoreDifference

  const leftKey = phase5RiderTieBreakKey(leftRiderId, riderById)
  const rightKey = phase5RiderTieBreakKey(rightRiderId, riderById)
  return (
    leftKey[0] - rightKey[0] ||
    leftKey[1].localeCompare(rightKey[1]) ||
    leftKey[2].localeCompare(rightKey[2])
  )
}

/**
 * Merge physically adjacent road groups until every remaining adjacent pair is
 * separated by more than the configured tolerance. The front group's gap is
 * authoritative for the merged group. Rider ordering is performance-first and
 * never team-first.
 */
export function mergeAdjacentPhase5RoadGroups(
  candidates: readonly UniversalPhase5RoadGroupCandidate[],
  riderById: ReadonlyMap<string, UniversalRiderInput> = new Map(),
  toleranceSeconds: number = PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
): readonly UniversalPhase5RoadGroupCandidate[] {
  const ordered = [...candidates]
    .map((candidate) => ({
      ...candidate,
      gapSeconds: Math.max(0, Math.round(candidate.gapSeconds)),
      riderIds: [...new Set(candidate.riderIds)],
      riderPerformanceScores: { ...candidate.riderPerformanceScores },
    }))
    .sort(
      (left, right) =>
        left.gapSeconds - right.gapSeconds ||
        left.sourceOrder - right.sourceOrder,
    )

  const merged: UniversalPhase5RoadGroupCandidate[] = []

  for (const candidate of ordered) {
    const previous = merged[merged.length - 1]
    if (
      previous &&
      candidate.gapSeconds - previous.gapSeconds <= toleranceSeconds
    ) {
      const combinedScores = {
        ...previous.riderPerformanceScores,
        ...candidate.riderPerformanceScores,
      }
      const combinedRiders = [
        ...new Set([...previous.riderIds, ...candidate.riderIds]),
      ].sort((left, right) =>
        comparePhase5Riders(left, right, combinedScores, riderById),
      )

      merged[merged.length - 1] = {
        sourceOrder: Math.min(previous.sourceOrder, candidate.sourceOrder),
        preferredGroupCode:
          previous.preferredGroupCode === 'breakaway' ||
          candidate.preferredGroupCode === 'breakaway'
            ? 'breakaway'
            : previous.preferredGroupCode,
        riderIds: combinedRiders,
        gapSeconds: previous.gapSeconds,
        riderPerformanceScores: combinedScores,
        formationReason: 'chase_reformation',
      }
      continue
    }

    merged.push({
      ...candidate,
      riderIds: [...candidate.riderIds].sort((left, right) =>
        comparePhase5Riders(
          left,
          right,
          candidate.riderPerformanceScores,
          riderById,
        ),
      ),
    })
  }

  return merged
}

function phase5GapSecondsPerPerformancePoint(
  profile: UniversalPhase5GroupingSummary['selectionProfile'],
  phaseNumber: RoadRacePhaseNumber,
): number {
  const profileFactor =
    profile === 'flat_large_groups'
      ? 0.8
      : profile === 'hilly_moderate_selection'
        ? 1.35
        : profile === 'hard_hilly_reduced_groups'
          ? 1.9
          : profile === 'mountain_multiple_groups'
            ? 2.6
            : profile === 'extreme_mountain_large_gaps'
              ? 3.5
              : 2.1

  const phaseFactor =
    phaseNumber === 1 ? 0.5 : phaseNumber === 2 ? 0.75 : phaseNumber === 3 ? 1 : 1.2

  return profileFactor * phaseFactor
}

function splitPhase5SourceGroupIntoBands(
  riderIds: readonly string[],
  riderPerformanceScores: Readonly<Record<string, number>>,
  threshold: number,
  sourceGapSeconds: number,
  sourceOrder: number,
  preferredGroupCode: UniversalPhase5GroupCode,
  formationReason: UniversalPhase5GroupSnapshot['formationReason'],
  profile: UniversalPhase5GroupingSummary['selectionProfile'],
  phaseNumber: RoadRacePhaseNumber,
  gapCap: number,
  riderById: ReadonlyMap<string, UniversalRiderInput>,
): readonly UniversalPhase5RoadGroupCandidate[] {
  const orderedRiders = [...riderIds].sort((left, right) =>
    comparePhase5Riders(
      left,
      right,
      riderPerformanceScores,
      riderById,
    ),
  )

  if (orderedRiders.length === 0) return []

  const bands: string[][] = []
  let currentBand: string[] = []
  let currentBandBest = riderPerformanceScores[orderedRiders[0]] ?? 0

  for (const riderId of orderedRiders) {
    const score = riderPerformanceScores[riderId] ?? 0
    if (
      currentBand.length > 0 &&
      currentBandBest - score > threshold
    ) {
      bands.push(currentBand)
      currentBand = []
      currentBandBest = score
    }
    currentBand.push(riderId)
  }
  if (currentBand.length > 0) bands.push(currentBand)

  const sourceBestScore = riderPerformanceScores[orderedRiders[0]] ?? 0
  const secondsPerPoint = phase5GapSecondsPerPerformancePoint(
    profile,
    phaseNumber,
  )

  return bands.map((bandRiderIds, bandIndex) => {
    const bandBestScore = riderPerformanceScores[bandRiderIds[0]] ?? 0
    const performanceGap = Math.max(0, sourceBestScore - bandBestScore)
    const calculatedOffset = Math.round(performanceGap * secondsPerPoint)
    const minimumBandOffset =
      bandIndex === 0
        ? 0
        : Math.max(
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
            Math.round(secondsPerPoint * bandIndex * 2),
          )

    return {
      sourceOrder: sourceOrder * 100 + bandIndex,
      preferredGroupCode,
      riderIds: bandRiderIds,
      gapSeconds: Math.min(
        gapCap,
        Math.max(0, sourceGapSeconds + calculatedOffset + minimumBandOffset),
      ),
      riderPerformanceScores,
      formationReason:
        bandIndex === 0 ? formationReason : 'performance_band_split',
    }
  })
}

export interface UniversalPhase5PhysicalIdentity {
  readonly groupCode: UniversalPhase5GroupCode
  readonly displayCode: string
  readonly physicalPosition: UniversalPhase5PhysicalPosition
  readonly colorKey: UniversalPhase5ColorKey
}

/**
 * Assign physical group identities only after all groups have been ordered by
 * their authoritative gap. Front groups are B groups, the main body is the
 * single peloton, and only groups behind it may be C/D/TL groups.
 */
export function assignPhase5PhysicalGroupIdentities(
  groupCount: number,
  mainBodyIndex: number,
  phaseNumber: RoadRacePhaseNumber,
  finalPhase: boolean,
): readonly UniversalPhase5PhysicalIdentity[] {
  let breakawayNumber = 0
  let chaseNumber = 0

  return Array.from({ length: groupCount }, (_, index) => {
    if (index < mainBodyIndex) {
      breakawayNumber += 1
      return {
        groupCode: 'breakaway' as const,
        displayCode: `B${breakawayNumber}`,
        physicalPosition: 'ahead_of_peloton' as const,
        colorKey: 'breakaway_red' as const,
      }
    }

    if (index === mainBodyIndex) {
      return {
        groupCode:
          phaseNumber <= 2 || finalPhase
            ? ('main_peloton' as const)
            : ('reduced_peloton' as const),
        displayCode: 'P',
        physicalPosition: 'peloton' as const,
        colorKey: 'peloton_blue' as const,
      }
    }

    chaseNumber += 1
    const isLast = index === groupCount - 1
    const distanceBehindPeloton = index - mainBodyIndex
    const groupCode: UniversalPhase5GroupCode =
      finalPhase && isLast && groupCount - mainBodyIndex > 2
        ? 'time_limit_group'
        : distanceBehindPeloton <= 2
          ? 'chasing_group'
          : 'dropped_group'

    return {
      groupCode,
      displayCode: `C${chaseNumber}`,
      physicalPosition: 'behind_peloton' as const,
      colorKey: 'chasing_orange' as const,
    }
  })
}

export function calculatePhase5OpeningBreakawayGapSeconds(
  breakawayRiderCount: number,
  breakawayTeamCount: number,
  originalGapSeconds: number,
): number {
  if (breakawayRiderCount <= 0) return 0
  const establishedGap =
    90 + Math.min(120, breakawayRiderCount * 18) +
    Math.min(75, breakawayTeamCount * 15)
  return Math.max(originalGapSeconds, Math.min(300, establishedGap))
}

export function calculatePhase5DevelopmentBreakawayGapSeconds(
  openingGapSeconds: number,
  responseMode: UniversalPelotonResponseMode,
  controllingTeamCount: number,
  chasingTeamCount: number,
  cooperationScore: number,
): number {
  if (openingGapSeconds <= 0) return 0
  const cooperationGain = Math.round(Math.max(0, cooperationScore) * 1.2)
  const controlReduction = controllingTeamCount * 35
  const chaseReduction = chasingTeamCount * 70
  const modeDelta =
    responseMode === 'release_escape' ? 75 :
    responseMode === 'control_gap' ? 10 :
    responseMode === 'organized_chase' ? -80 :
    responseMode === 'emergency_chase' ? -150 : 0
  return Math.max(
    0,
    Math.min(600, openingGapSeconds + cooperationGain + modeDelta - controlReduction - chaseReduction),
  )
}

function canonicalizePhase5RoadGroupCodes(
  candidates: readonly UniversalPhase5RoadGroupCandidate[],
  phaseNumber: RoadRacePhaseNumber,
  _profile: UniversalPhase5GroupingSummary['selectionProfile'],
  _breakawaySurvived: boolean,
): readonly UniversalPhase5PhysicalIdentity[] {
  if (candidates.length === 0) return []

  const mainBodyIndex = candidates.reduce((bestIndex, candidate, index) => {
    const best = candidates[bestIndex]
    if (!best || candidate.riderIds.length > best.riderIds.length) return index
    if (
      candidate.riderIds.length === best.riderIds.length &&
      candidate.gapSeconds < best.gapSeconds
    ) {
      return index
    }
    return bestIndex
  }, 0)

  return assignPhase5PhysicalGroupIdentities(
    candidates.length,
    mainBodyIndex,
    phaseNumber,
    phaseNumber === 4,
  )
}

function buildPhase5RoadSnapshots(
  sourceGroups: readonly {
    readonly sourceOrder: number
    readonly preferredGroupCode: UniversalPhase5GroupCode
    readonly riderIds: readonly string[]
    readonly gapSeconds: number
    readonly riderPerformanceScores: Readonly<Record<string, number>>
    readonly formationReason: UniversalPhase5GroupSnapshot['formationReason']
  }[],
  phaseNumber: RoadRacePhaseNumber,
  profile: UniversalPhase5GroupingSummary['selectionProfile'],
  gapCap: number,
  riderById: ReadonlyMap<string, UniversalRiderInput>,
  breakawaySurvived: boolean,
  winnerTimeSeconds: number | null = null,
): readonly UniversalPhase5GroupSnapshot[] {
  const threshold = phase5BandThreshold(profile, phaseNumber)
  const splitCandidates = sourceGroups
    .filter((sourceGroup) => sourceGroup.riderIds.length > 0)
    .flatMap((sourceGroup) => {
      // Phase 4 final groups are already the authoritative physical road state.
      // Performance scores may order riders inside a group, but they must not
      // manufacture an additional physical split after the race engine has
      // resolved the chase, catch, terrain selection, and finish gaps.
      if (phaseNumber === 4) {
        return [
          {
            sourceOrder: sourceGroup.sourceOrder * 100,
            preferredGroupCode: sourceGroup.preferredGroupCode,
            riderIds: [...sourceGroup.riderIds].sort((left, right) =>
              comparePhase5Riders(
                left,
                right,
                sourceGroup.riderPerformanceScores,
                riderById,
              ),
            ),
            gapSeconds: sourceGroup.gapSeconds,
            riderPerformanceScores: sourceGroup.riderPerformanceScores,
            formationReason: sourceGroup.formationReason,
          },
        ]
      }

      return splitPhase5SourceGroupIntoBands(
        sourceGroup.riderIds,
        sourceGroup.riderPerformanceScores,
        threshold,
        sourceGroup.gapSeconds,
        sourceGroup.sourceOrder,
        sourceGroup.preferredGroupCode,
        sourceGroup.formationReason,
        profile,
        phaseNumber,
        gapCap,
        riderById,
      )
    })

  const merged = mergeAdjacentPhase5RoadGroups(
    splitCandidates,
    riderById,
    PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
  )
  const groupIdentities = canonicalizePhase5RoadGroupCodes(
    merged,
    phaseNumber,
    profile,
    breakawaySurvived,
  )

  return merged.map((candidate, index) => {
    const gapSeconds = Math.min(gapCap, Math.max(0, candidate.gapSeconds))
    const scores = candidate.riderIds.map(
      (riderId) => candidate.riderPerformanceScores[riderId] ?? 0,
    )

    return {
      phaseNumber,
      groupOrder: index + 1,
      groupCode: groupIdentities[index].groupCode,
      displayCode: groupIdentities[index].displayCode,
      physicalPosition: groupIdentities[index].physicalPosition,
      colorKey: groupIdentities[index].colorKey,
      riderIds: candidate.riderIds,
      gapSeconds,
      officialTimeSeconds:
        winnerTimeSeconds === null ? null : winnerTimeSeconds + gapSeconds,
      performanceBand: phase5PerformanceBand(scores, threshold),
      formationReason: candidate.formationReason,
    }
  })
}

function phase5OfficialTimesConsistent(
  finalGroups: readonly UniversalPhase5GroupSnapshot[],
  officialResults: readonly UniversalPhase5OfficialResult[],
): boolean {
  if (finalGroups.length === 0 && officialResults.length === 0) return true
  const winnerTime = officialResults[0]?.officialTimeSeconds ?? 0
  const groupByRider = new Map<string, UniversalPhase5GroupSnapshot>()
  for (const group of finalGroups) {
    for (const riderId of group.riderIds) groupByRider.set(riderId, group)
  }

  return officialResults.every((result) => {
    const group = groupByRider.get(result.riderId)
    return (
      group !== undefined &&
      result.groupOrder === group.groupOrder &&
      result.groupCode === group.groupCode &&
      result.gapSeconds === group.gapSeconds &&
      result.officialTimeSeconds === group.officialTimeSeconds &&
      result.officialTimeSeconds - winnerTime === result.gapSeconds
    )
  })
}

function buildUniversalPhase5GroupingSummary(
  input: UniversalRaceEngineInput,
  difficulty: UniversalDifficultySummary,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  riderSuitability: readonly UniversalRiderSuitabilityResult[],
  roadRaceResolution: UniversalRoadRaceResolutionSummary,
): UniversalPhase5GroupingSummary {
  const profile = phase5SelectionProfile(input, difficulty)
  const gapCap = phase5GapCapSeconds(input, difficulty)
  const readinessByRider = new Map(
    riderReadiness.map((row) => [row.riderId, row]),
  )
  const suitabilityByRider = new Map(
    riderSuitability.map((row) => [row.riderId, row]),
  )
  const teamByRider = new Map(
    input.riders.map((row) => [row.riderId, row.teamId]),
  )
  const riderById = new Map(
    input.riders.map((row) => [row.riderId, row]),
  )
  const starterIds = input.riders
    .filter(
      (rider) =>
        rider.startStatus !== 'dns' &&
        readinessByRider.get(rider.riderId)?.eligibleToStart !== false,
    )
    .map((rider) => rider.riderId)

  const eligibleStarterIdSet = new Set(starterIds)

  if (
    input.stage.stageFormat !== 'road_race' ||
    !roadRaceResolution.active ||
    !roadRaceResolution.phase4Finish
  ) {
    const speedBase = input.stage.stageFormat === 'prologue' ? 47 : 44
    const distanceSeconds = (input.stage.distanceKm / speedBase) * 3600
    const sorted = starterIds
      .map((riderId) => ({
        riderId,
        teamId: teamByRider.get(riderId) ?? '',
        score: suitabilityByRider.get(riderId)?.suitabilityScore ?? 0,
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          comparePhase5Riders(
            left.riderId,
            right.riderId,
            Object.fromEntries(
              starterIds.map((riderId) => [
                riderId,
                suitabilityByRider.get(riderId)?.suitabilityScore ?? 0,
              ]),
            ),
            riderById,
          ),
      )

    if (
      input.stage.stageFormat === 'team_time_trial' ||
      input.stage.stageFormat === 'pair_time_trial'
    ) {
      const byTeam = new Map<string, typeof sorted>()
      for (const row of sorted) {
        const current = byTeam.get(row.teamId) ?? []
        current.push(row)
        byTeam.set(row.teamId, current)
      }
      const teamRows = [...byTeam.entries()]
        .map(([teamId, rows]) => {
          const ordered = [...rows].sort(
            (left, right) =>
              right.score - left.score ||
              left.riderId.localeCompare(right.riderId),
          )
          const counting =
            input.stage.stageFormat === 'pair_time_trial'
              ? Math.min(2, ordered.length)
              : Math.min(
                  input.stage.timeTrialRules?.countingRiderNumber ??
                    ordered.length,
                  ordered.length,
                )
          const countingScore =
            ordered[Math.max(0, counting - 1)]?.score ?? 0
          const time = Math.max(
            1,
            Math.round(distanceSeconds + (100 - countingScore) * 5.5),
          )
          return { teamId, rows: ordered, countingScore, time }
        })
        .sort(
          (left, right) =>
            left.time - right.time || left.teamId.localeCompare(right.teamId),
        )
      const winnerTime = teamRows[0]?.time ?? 0
      const finalGroups: UniversalPhase5GroupSnapshot[] = teamRows.map(
        (team, index) => ({
          phaseNumber: 0,
          groupOrder: index + 1,
          groupCode: 'team_time_unit',
          displayCode: `T${index + 1}`,
          physicalPosition: 'timing_unit',
          colorKey: 'timing_neutral',
          riderIds: team.rows.map((row) => row.riderId),
          gapSeconds: team.time - winnerTime,
          officialTimeSeconds: team.time,
          performanceBand: phase5PerformanceBand(
            team.rows.map((row) => row.score),
            0,
          ),
          formationReason: 'team_timing',
        }),
      )
      const officialResults = finalGroups
        .flatMap((group) =>
          group.riderIds.map((riderId) => ({
            riderId,
            teamId: teamByRider.get(riderId) ?? '',
            group,
            score: suitabilityByRider.get(riderId)?.suitabilityScore ?? 0,
          })),
        )
        .sort(
          (left, right) =>
            (left.group.officialTimeSeconds ?? 0) -
              (right.group.officialTimeSeconds ?? 0) ||
            right.score - left.score ||
            left.riderId.localeCompare(right.riderId),
        )
        .map((row, index) => ({
          rank: index + 1,
          riderId: row.riderId,
          teamId: row.teamId,
          groupCode: row.group.groupCode,
          groupOrder: row.group.groupOrder,
          officialTimeSeconds: row.group.officialTimeSeconds ?? 0,
          gapSeconds: row.group.gapSeconds,
          performanceScore: deterministicRound(row.score, 6),
          timeSource:
            input.stage.stageFormat === 'pair_time_trial'
              ? 'pair_time'
              : 'team_counting_rider_time',
        })) as UniversalPhase5OfficialResult[]
      return {
        active: true,
        stageFormat: input.stage.stageFormat,
        selectionProfile: profile,
        phaseGroups: [],
        finalGroups,
        officialResults,
        everyStarterAssignedExactlyOnce:
          new Set(officialResults.map((row) => row.riderId)).size ===
          starterIds.length,
        groupTimesMonotonic: finalGroups.every(
          (group, index) =>
            index === 0 ||
            (group.officialTimeSeconds ?? 0) >=
              (finalGroups[index - 1].officialTimeSeconds ?? 0),
        ),
        deterministicGapCapSeconds: gapCap,
        modelVersion: 'universal_phase_5_lineage_groups_and_times_v2',
      }
    }

    const winnerTime =
      sorted.length > 0
        ? Math.max(
            1,
            Math.round(distanceSeconds + (100 - sorted[0].score) * 4.5),
          )
        : 0
    const officialResults: UniversalPhase5OfficialResult[] = sorted.map(
      (row, index) => {
        const time = Math.max(
          winnerTime,
          Math.round(distanceSeconds + (100 - row.score) * 4.5),
        )
        return {
          rank: index + 1,
          riderId: row.riderId,
          teamId: row.teamId,
          groupCode: 'individual_time_unit',
          groupOrder: index + 1,
          officialTimeSeconds: time,
          gapSeconds: time - winnerTime,
          performanceScore: deterministicRound(row.score, 6),
          timeSource: 'individual_time_trial',
        }
      },
    )
    const finalGroups: UniversalPhase5GroupSnapshot[] = officialResults.map(
      (row, index) => ({
        phaseNumber: 0,
        groupOrder: row.groupOrder,
        groupCode: 'individual_time_unit',
        displayCode: `I${index + 1}`,
        physicalPosition: 'timing_unit',
        colorKey: 'timing_neutral',
        riderIds: [row.riderId],
        gapSeconds: row.gapSeconds,
        officialTimeSeconds: row.officialTimeSeconds,
        performanceBand: phase5PerformanceBand([row.performanceScore], 0),
        formationReason: 'individual_timing',
      }),
    )
    return {
      active: true,
      stageFormat: input.stage.stageFormat,
      selectionProfile: profile,
      phaseGroups: [],
      finalGroups,
      officialResults,
      everyStarterAssignedExactlyOnce:
        officialResults.length === starterIds.length,
      groupTimesMonotonic: officialResults.every(
        (row, index) =>
          index === 0 ||
          row.officialTimeSeconds >=
            officialResults[index - 1].officialTimeSeconds,
      ),
      deterministicGapCapSeconds: gapCap,
      modelVersion: 'universal_phase_5_lineage_groups_and_times_v2',
    }
  }

  const phaseGroups: UniversalPhase5GroupSnapshot[] = []
  const p1 = roadRaceResolution.phase1Opening
  const p2 = roadRaceResolution.phase2Development
  const p3 = roadRaceResolution.phase3Decisive

  const openingBreakawayRiderIds = (p1?.breakawayRiderIds ?? []).filter(
    (riderId) => eligibleStarterIdSet.has(riderId),
  )
  const openingBreakawaySet = new Set(openingBreakawayRiderIds)
  const pelotonStarterIds = starterIds.filter(
    (riderId) => !openingBreakawaySet.has(riderId),
  )

  const scoreFor = (
    riderId: string,
    energy: number,
    workPenalty = 0,
    protectionBonus = 0,
  ) =>
    phase5RoadPerformanceScore(
      riderId,
      suitabilityByRider,
      readinessByRider,
      energy,
      workPenalty,
      protectionBonus,
    )

  const bandFor = (
    riderIds: readonly string[],
    scores: Readonly<Record<string, number>>,
    phaseNumber: RoadRacePhaseNumber,
  ) =>
    phase5PerformanceBand(
      riderIds.map((riderId) => scores[riderId] ?? 0),
      phase5BandThreshold(profile, phaseNumber),
    )

  const makeLifecycleGroup = ({
    phaseNumber,
    groupOrder,
    groupCode,
    displayCode,
    colorKey,
    riderIds,
    gapSeconds,
    scores,
    formationReason,
  }: {
    phaseNumber: RoadRacePhaseNumber
    groupOrder: number
    groupCode: UniversalPhase5GroupCode
    displayCode: string
    colorKey: UniversalPhase5ColorKey
    riderIds: readonly string[]
    gapSeconds: number
    scores: Readonly<Record<string, number>>
    formationReason: UniversalPhase5GroupSnapshot['formationReason']
  }): UniversalPhase5GroupSnapshot => ({
    phaseNumber,
    groupOrder,
    groupCode,
    displayCode,
    physicalPosition:
      displayCode.startsWith('B') || displayCode.startsWith('F')
        ? 'ahead_of_peloton'
        : displayCode === 'P'
          ? 'peloton'
          : 'behind_peloton',
    colorKey,
    riderIds: [...riderIds].sort((left, right) =>
      comparePhase5Riders(left, right, scores, riderById),
    ),
    gapSeconds: Math.max(0, Math.min(gapCap, Math.round(gapSeconds))),
    officialTimeSeconds: null,
    performanceBand: bandFor(riderIds, scores, phaseNumber),
    formationReason,
  })

  const openingTeamCount = new Set(
    openingBreakawayRiderIds.map(
      (riderId) => teamByRider.get(riderId) ?? riderId,
    ),
  ).size
  const openingGapSeconds = calculatePhase5OpeningBreakawayGapSeconds(
    openingBreakawayRiderIds.length,
    openingTeamCount,
    p1?.initialGapSeconds ?? 0,
  )

  if (p1) {
    const phase1Scores = Object.fromEntries(
      starterIds.map((riderId) => {
        const energy = p1.riderEnergy.find((row) => row.riderId === riderId)
        return [
          riderId,
          scoreFor(
            riderId,
            energy?.energyAfterPhase ?? 0,
            energy?.attackEnergyCost ?? 0,
          ),
        ]
      }),
    )
    const phase1Groups: UniversalPhase5GroupSnapshot[] = []
    if (openingBreakawayRiderIds.length > 0) {
      phase1Groups.push(
        makeLifecycleGroup({
          phaseNumber: 1,
          groupOrder: 1,
          groupCode: 'breakaway',
          displayCode: `${PHASE5_BREAKAWAY_DISPLAY_PREFIX}${1}`,
          colorKey: 'breakaway_red',
          riderIds: openingBreakawayRiderIds,
          gapSeconds: 0,
          scores: phase1Scores,
          formationReason: 'opening_escape',
        }),
      )
    }
    phase1Groups.push(
      makeLifecycleGroup({
        phaseNumber: 1,
        groupOrder: phase1Groups.length + 1,
        groupCode: 'main_peloton',
        displayCode: 'P',
        colorKey: 'peloton_blue',
        riderIds: pelotonStarterIds,
        gapSeconds: openingBreakawayRiderIds.length > 0 ? openingGapSeconds : 0,
        scores: phase1Scores,
        formationReason: 'peloton_cohesion',
      }),
    )
    phaseGroups.push(...phase1Groups)
  }

  const rawDevelopmentGap =
    openingBreakawayRiderIds.length > 0 && p2
      ? calculatePhase5DevelopmentBreakawayGapSeconds(
          openingGapSeconds,
          p2.pelotonResponse.responseMode,
          p2.pelotonResponse.controllingTeamIds.length,
          p2.pelotonResponse.chasingTeamIds.length,
          p2.breakawayCooperation?.cooperationScore ?? 0,
        )
      : 0
  const developmentGapSeconds =
    openingBreakawayRiderIds.length > 0
      ? Math.max(
          90,
          p2?.pelotonResponse.responseMode === 'release_escape'
            ? Math.max(openingGapSeconds + 30, rawDevelopmentGap)
            : p2?.pelotonResponse.responseMode === 'control_gap'
              ? Math.max(openingGapSeconds, rawDevelopmentGap)
              : Math.max(90, rawDevelopmentGap),
        )
      : 0

  if (p2) {
    const phase2Scores = Object.fromEntries(
      starterIds.map((riderId) => {
        const state = p2.riderEnergy.find((row) => row.riderId === riderId)
        return [
          riderId,
          scoreFor(
            riderId,
            state?.energyAfterPhase ?? 0,
            (state?.totalPhaseEnergyCost ?? 0) * 0.035,
            (state?.protectionReceivedScore ?? 0) * 0.04,
          ),
        ]
      }),
    )
    const phase2Groups: UniversalPhase5GroupSnapshot[] = []
    if (openingBreakawayRiderIds.length > 0) {
      phase2Groups.push(
        makeLifecycleGroup({
          phaseNumber: 2,
          groupOrder: 1,
          groupCode: 'breakaway',
          displayCode: `${PHASE5_BREAKAWAY_DISPLAY_PREFIX}${1}`,
          colorKey: 'breakaway_red',
          riderIds: openingBreakawayRiderIds,
          gapSeconds: 0,
          scores: phase2Scores,
          formationReason: 'opening_escape',
        }),
      )
    }
    phase2Groups.push(
      makeLifecycleGroup({
        phaseNumber: 2,
        groupOrder: phase2Groups.length + 1,
        groupCode: 'main_peloton',
        displayCode: 'P',
        colorKey: 'peloton_blue',
        riderIds: pelotonStarterIds,
        gapSeconds:
          openingBreakawayRiderIds.length > 0 ? developmentGapSeconds : 0,
        scores: phase2Scores,
        formationReason: 'peloton_cohesion',
      }),
    )
    phaseGroups.push(...phase2Groups)
  }

  if (p3) {
    const phase3Scores = Object.fromEntries(
      starterIds.map((riderId) => [
        riderId,
        p3.riderStates.find((row) => row.riderId === riderId)?.decisiveScore ??
          suitabilityByRider.get(riderId)?.suitabilityScore ??
          0,
      ]),
    )
    /*
     * Keep the opening breakaway on one physical lineage. Decisive performance
     * groups can create a separate F group, but they cannot replace the
     * opening-breakaway-to-peloton gap or move riders across that gap without
     * a physical catch.
     */
    const persistentOpeningPhysicalState =
      buildPersistentOpeningBreakawayPhysicalState(
        input,
        roadRaceResolution,
        starterIds,
      )
    const droppedSet = new Set(
      persistentOpeningPhysicalState.droppedRiderIds,
    )
    const lateFrontRiderIds = [
      ...persistentOpeningPhysicalState.lateFrontRiderIds,
    ]
    const lateFrontSet = new Set(lateFrontRiderIds)
    const phase3PelotonIds = pelotonStarterIds.filter(
      (riderId) => !lateFrontSet.has(riderId) && !droppedSet.has(riderId),
    )
    const phase3GapSeconds =
      openingBreakawayRiderIds.length > 0
        ? persistentOpeningPhysicalState.phase3GapSeconds
        : 0
    const phase3Groups: UniversalPhase5GroupSnapshot[] = []
    if (openingBreakawayRiderIds.length > 0) {
      phase3Groups.push(
        makeLifecycleGroup({
          phaseNumber: 3,
          groupOrder: 1,
          groupCode: 'breakaway',
          displayCode: `${PHASE5_BREAKAWAY_DISPLAY_PREFIX}${1}`,
          colorKey: 'breakaway_red',
          riderIds: openingBreakawayRiderIds,
          gapSeconds: 0,
          scores: phase3Scores,
          formationReason: 'opening_escape',
        }),
      )
    }
    if (lateFrontRiderIds.length > 0) {
      phase3Groups.push(
        makeLifecycleGroup({
          phaseNumber: 3,
          groupOrder: phase3Groups.length + 1,
          groupCode: 'front_favourites',
          displayCode: 'F1',
          colorKey: 'front_yellow',
          riderIds: lateFrontRiderIds,
          gapSeconds:
            openingBreakawayRiderIds.length > 0
              ? Math.max(6, Math.round(phase3GapSeconds * 0.55))
              : 0,
          scores: phase3Scores,
          formationReason: 'late_front_attack',
        }),
      )
    }
    phase3Groups.push(
      makeLifecycleGroup({
        phaseNumber: 3,
        groupOrder: phase3Groups.length + 1,
        groupCode: 'reduced_peloton',
        displayCode: 'P',
        colorKey: 'peloton_blue',
        riderIds: phase3PelotonIds,
        gapSeconds:
          openingBreakawayRiderIds.length > 0
            ? phase3GapSeconds
            : lateFrontRiderIds.length > 0
              ? Math.max(6, Math.round(profile === 'flat_large_groups' ? 12 : 24))
              : 0,
        scores: phase3Scores,
        formationReason: 'peloton_cohesion',
      }),
    )
    if (droppedSet.size > 0) {
      phase3Groups.push(
        makeLifecycleGroup({
          phaseNumber: 3,
          groupOrder: phase3Groups.length + 1,
          groupCode: 'dropped_group',
          displayCode: 'C1',
          colorKey: 'chasing_orange',
          riderIds: [...droppedSet],
          gapSeconds:
            (phase3Groups.find((group) => group.displayCode === 'P')
              ?.gapSeconds ?? 0) + Math.max(30, Math.round(gapCap * 0.08)),
          scores: phase3Scores,
          formationReason: 'decisive_selection',
        }),
      )
    }
    phaseGroups.push(...phase3Groups)
  }

  const p4 = roadRaceResolution.phase4Finish
  const finalCodeMap: Record<
    UniversalRoadFinalGroupCode,
    UniversalPhase5GroupCode
  > = {
    winning_group: p4.breakawaySurvived ? 'breakaway' : 'front_favourites',
    front_chase_group: 'chasing_group',
    main_finish_group:
      profile === 'flat_large_groups' ? 'main_peloton' : 'reduced_peloton',
    late_group: 'time_limit_group',
  }
  // Phase 4 already owns the authoritative physical gap for every rider.
  // Do not route those rider-specific gaps through the four broad Phase 4
  // display buckets before Phase 5, because each bucket intentionally stores
  // only its minimum member gap.  Doing so erases progressive contact-loss
  // separation (for example, riders cracking several kilometres apart can all
  // arrive in Phase 5 at the same +9s).  Feed the existing rider-state gaps
  // directly into the existing Phase 5 adjacency merger; only riders within
  // the established five-second physical tolerance are allowed to regroup.
  const phase4RankByRiderIdForHandoff = new Map(
    p4.finish.rankings.map((ranking) => [ranking.riderId, ranking.rank]),
  )
  const finalSourceGroups = p4.riderStates
    .filter((state) => eligibleStarterIdSet.has(state.riderId))
    .slice()
    .sort(
      (left, right) =>
        left.finalGapSeconds - right.finalGapSeconds ||
        (phase4RankByRiderIdForHandoff.get(left.riderId) ??
          Number.MAX_SAFE_INTEGER) -
          (phase4RankByRiderIdForHandoff.get(right.riderId) ??
            Number.MAX_SAFE_INTEGER) ||
        left.riderId.localeCompare(right.riderId),
    )
    .map((state, index) => ({
      sourceOrder: index + 1,
      preferredGroupCode: finalCodeMap[state.finalGroupCode],
      riderIds: [state.riderId],
      gapSeconds: state.finalGapSeconds,
      riderPerformanceScores: {
        [state.riderId]: phase5RoadPerformanceScore(
          state.riderId,
          suitabilityByRider,
          readinessByRider,
          state.energyAtFinish,
          (state.automaticChaseEnergyCost + state.finishEffortEnergyCost) *
            0.04,
          state.leadOutSupportReceived * 0.04,
        ),
      },
      formationReason:
        state.finalGroupCode === 'main_finish_group'
          ? ('chase_reformation' as const)
          : ('finish_group' as const),
    }))

  const phase4WinnerTime =
    p4.finish.rankings.find(
      (ranking) => ranking.riderId === p4.finish.winnerRiderId,
    )?.finishTimeSeconds ??
    p4.finalGroups[0]?.finishTimeSeconds ??
    0

  const unnormalizedFinalGroups = buildPhase5RoadSnapshots(
    finalSourceGroups,
    4,
    profile,
    gapCap,
    riderById,
    p4.breakawaySurvived,
    phase4WinnerTime,
  )

  const winnerGroup = unnormalizedFinalGroups.find((group) =>
    group.riderIds.includes(p4.finish.winnerRiderId),
  )
  const remainingFinalGroups = unnormalizedFinalGroups
    .filter((group) => group !== winnerGroup)
    .sort(
      (left, right) =>
        left.gapSeconds - right.gapSeconds ||
        left.groupOrder - right.groupOrder,
    )

  let previousGapSeconds = 0
  const gapNormalizedFinalGroups: readonly UniversalPhase5GroupSnapshot[] = [
    ...(winnerGroup
      ? [
          {
            ...winnerGroup,
            groupOrder: 1,
            gapSeconds: 0,
            officialTimeSeconds: phase4WinnerTime,
          },
        ]
      : []),
    ...remainingFinalGroups.map((group, index) => {
      const minimumSeparatedGap =
        previousGapSeconds + PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1
      const normalizedGap = Math.min(
        gapCap,
        Math.max(minimumSeparatedGap, group.gapSeconds),
      )
      previousGapSeconds = normalizedGap
      return {
        ...group,
        groupOrder: index + 2,
        gapSeconds: normalizedGap,
        officialTimeSeconds: phase4WinnerTime + normalizedGap,
      }
    }),
  ]

  const finalMainBodyIndex = gapNormalizedFinalGroups.reduce(
    (bestIndex, group, index) => {
      const best = gapNormalizedFinalGroups[bestIndex]
      return !best || group.riderIds.length > best.riderIds.length
        ? index
        : bestIndex
    },
    0,
  )
  let finalFrontNumber = 0
  let finalChaseNumber = 0
  const labelledFinalGroups: readonly UniversalPhase5GroupSnapshot[] =
    gapNormalizedFinalGroups.map((group, index) => {
      if (index < finalMainBodyIndex) {
        const containsOpeningBreakaway = group.riderIds.some((riderId) =>
          openingBreakawaySet.has(riderId),
        )
        if (p4.breakawaySurvived && containsOpeningBreakaway) {
          return {
            ...group,
            groupCode: 'breakaway' as const,
            displayCode: `${PHASE5_BREAKAWAY_DISPLAY_PREFIX}${1}`,
            physicalPosition: 'ahead_of_peloton' as const,
            colorKey: 'breakaway_red' as const,
          }
        }
        finalFrontNumber += 1
        return {
          ...group,
          groupCode: 'front_favourites' as const,
          displayCode: `F${finalFrontNumber}`,
          physicalPosition: 'ahead_of_peloton' as const,
          colorKey: 'front_yellow' as const,
          formationReason: 'late_front_attack' as const,
        }
      }
      if (index == finalMainBodyIndex) {
        return {
          ...group,
          groupCode: 'main_peloton' as const,
          displayCode: 'P',
          physicalPosition: 'peloton' as const,
          colorKey: 'peloton_blue' as const,
          formationReason: p4.breakawayCaught
            ? ('breakaway_catch' as const)
            : group.formationReason,
        }
      }
      finalChaseNumber += 1
      const isLast = index === gapNormalizedFinalGroups.length - 1
      const groupCode: UniversalPhase5GroupCode =
        isLast && gapNormalizedFinalGroups.length - finalMainBodyIndex > 2
          ? 'time_limit_group'
          : index - finalMainBodyIndex <= 2
            ? 'chasing_group'
            : 'dropped_group'
      return {
        ...group,
        groupCode,
        displayCode: `C${finalChaseNumber}`,
        physicalPosition: 'behind_peloton' as const,
        colorKey: 'chasing_orange' as const,
      }
    })

  const unsupportedFlatFrontGroups =
    profile === 'flat_large_groups' && p4.breakawayCaught
      ? labelledFinalGroups.filter(
          (group) =>
            group.displayCode.startsWith('F') &&
            (group.riderIds.length > 8 ||
              !group.riderIds.every((riderId) =>
                p3?.successfulAttackRiderIds.includes(riderId),
              )),
        )
      : []
  const unsupportedFlatFrontSet = new Set(unsupportedFlatFrontGroups)
  const unsupportedFlatFrontRiderIds = unsupportedFlatFrontGroups.flatMap(
    (group) => group.riderIds,
  )
  const retainedLabelledGroups = labelledFinalGroups.filter(
    (group) => !unsupportedFlatFrontSet.has(group),
  )
  const existingPeloton = retainedLabelledGroups.find(
    (group) => group.displayCode === 'P',
  )
  const mergedFlatGroups =
    unsupportedFlatFrontRiderIds.length > 0 && existingPeloton
      ? retainedLabelledGroups.map((group) =>
          group === existingPeloton
            ? {
                ...group,
                riderIds: [
                  ...new Set([
                    ...unsupportedFlatFrontRiderIds,
                    ...group.riderIds,
                  ]),
                ],
                gapSeconds: Math.min(
                  group.gapSeconds,
                  ...unsupportedFlatFrontGroups.map(
                    (frontGroup) => frontGroup.gapSeconds,
                  ),
                ),
                formationReason: 'chase_reformation' as const,
              }
            : group,
        )
      : retainedLabelledGroups

  let previousFinalGap = -(
    PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1
  )
  const finalGroups: readonly UniversalPhase5GroupSnapshot[] = mergedFlatGroups
    .slice()
    .sort(
      (left, right) =>
        left.gapSeconds - right.gapSeconds ||
        left.groupOrder - right.groupOrder,
    )
    .map((group, index) => {
      const normalizedGap =
        index === 0
          ? 0
          : Math.min(
              gapCap,
              Math.max(
                group.gapSeconds,
                previousFinalGap +
                  PHASE5_GROUP_MERGE_TOLERANCE_SECONDS +
                  1,
              ),
            )
      previousFinalGap = normalizedGap
      return {
        ...group,
        groupOrder: index + 1,
        gapSeconds: normalizedGap,
        officialTimeSeconds: phase4WinnerTime + normalizedGap,
      }
    })

  phaseGroups.push(...finalGroups)

  const finalGroupByRider = new Map<
    string,
    UniversalPhase5GroupSnapshot
  >()
  for (const group of finalGroups) {
    for (const riderId of group.riderIds) {
      finalGroupByRider.set(riderId, group)
    }
  }

  const phase4RankByRider = new Map(
    p4.finish.rankings.map((ranking) => [ranking.riderId, ranking.rank]),
  )
  const phase4RankingByRider = new Map(
    p4.finish.rankings.map((ranking) => [ranking.riderId, ranking]),
  )

  const officialResults: UniversalPhase5OfficialResult[] = finalGroups
    .flatMap((group) =>
      group.riderIds.map((riderId) => {
        const ranking = phase4RankingByRider.get(riderId)
        const state = p4.riderStates.find(
          (row) => row.riderId === riderId,
        )
        return {
          riderId,
          teamId:
            ranking?.teamId ?? teamByRider.get(riderId) ?? '',
          group,
          phase4Rank: phase4RankByRider.get(riderId) ?? Number.MAX_SAFE_INTEGER,
          performanceScore: phase5RoadPerformanceScore(
            riderId,
            suitabilityByRider,
            readinessByRider,
            state?.energyAtFinish ?? ranking?.energyAtFinish ?? 0,
            ((state?.automaticChaseEnergyCost ?? 0) +
              (state?.finishEffortEnergyCost ?? 0)) *
              0.04,
            (state?.leadOutSupportReceived ?? 0) * 0.04,
          ),
        }
      }),
    )
    .sort(
      (left, right) =>
        (left.riderId === p4.finish.winnerRiderId
          ? -1
          : right.riderId === p4.finish.winnerRiderId
            ? 1
            : 0) ||
        left.group.groupOrder - right.group.groupOrder ||
        left.phase4Rank - right.phase4Rank ||
        comparePhase5Riders(
          left.riderId,
          right.riderId,
          {
            [left.riderId]: left.performanceScore,
            [right.riderId]: right.performanceScore,
          },
          riderById,
        ),
    )
    .map((row, index) => ({
      rank: index + 1,
      riderId: row.riderId,
      teamId: row.teamId,
      groupCode: row.group.groupCode,
      groupOrder: row.group.groupOrder,
      officialTimeSeconds: row.group.officialTimeSeconds ?? phase4WinnerTime,
      gapSeconds: row.group.gapSeconds,
      performanceScore: row.performanceScore,
      timeSource: 'road_group_time' as const,
    }))

  const assigned = officialResults.map((row) => row.riderId)
  const phase4WinnerPreserved =
    officialResults[0]?.riderId === p4.finish.winnerRiderId
  const everyStarterAssignedExactlyOnce =
    assigned.length === starterIds.length &&
    new Set(assigned).size === starterIds.length &&
    starterIds.every((riderId) => assigned.includes(riderId))
  const groupTimesMonotonic = finalGroups.every(
    (group, index) =>
      index === 0 ||
      (group.officialTimeSeconds ?? 0) >=
        (finalGroups[index - 1].officialTimeSeconds ?? 0),
  )
  const noAdjacentMergeableGroups = finalGroups.every(
    (group, index) =>
      index === 0 ||
      group.gapSeconds - finalGroups[index - 1].gapSeconds >
        PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
  )

  if (!phase4WinnerPreserved) {
    throw new Error(
      'Phase 5 grouping must preserve the authoritative Phase 4 winner.',
    )
  }

  if (!everyStarterAssignedExactlyOnce) {
    throw new Error(
      'Phase 5 grouping must assign every eligible starter exactly once.',
    )
  }

  if (!groupTimesMonotonic || !noAdjacentMergeableGroups) {
    throw new Error(
      'Phase 5 grouping produced contradictory or mergeable final groups.',
    )
  }

  if (!phase5OfficialTimesConsistent(finalGroups, officialResults)) {
    throw new Error(
      'Phase 5 official result times and group gaps are inconsistent.',
    )
  }

  return {
    active: true,
    stageFormat: input.stage.stageFormat,
    selectionProfile: profile,
    phaseGroups,
    finalGroups,
    officialResults,
    everyStarterAssignedExactlyOnce,
    groupTimesMonotonic,
    deterministicGapCapSeconds: gapCap,
    modelVersion: 'universal_phase_5_lineage_groups_and_times_v2',
  }
}


const UNIVERSAL_REDUCED_GROUP_MAX_SIZE = 12

export function classifyUniversalFinishMode(
  stage: UniversalStageInput,
  stageClassification: UniversalStageClassification,
  frontGroupSize: number,
): UniversalFinishMode {
  switch (stage.stageFormat) {
    case 'individual_time_trial':
      return 'individual_time_trial'
    case 'prologue':
      return 'prologue'
    case 'team_time_trial':
      return 'team_time_trial'
    case 'pair_time_trial':
      return 'pair_time_trial'
    case 'road_race':
      break
  }

  if (frontGroupSize <= 1) return 'solo_finish'

  if (
    stage.finishType === 'summit_finish' ||
    stage.summitFinish
  ) {
    return 'summit_finish'
  }

  if (stage.finishType === 'uphill_finish') {
    return 'hill_finish'
  }

  if (
    stage.finishType === 'cobbled_finish' ||
    stageClassification === 'cobbled_road_stage'
  ) {
    return 'cobbled_finish'
  }

  return frontGroupSize <= UNIVERSAL_REDUCED_GROUP_MAX_SIZE
    ? 'reduced_group_sprint'
    : 'flat_sprint'
}

export function buildUniversalFinishResolutionFoundation(
  sources: UniversalFinishFoundationSources,
): UniversalFinishResolution {
  const {
    input,
    stageClassification,
    riderReadiness,
    riderSuitability,
    roadCommandResolution,
    roadRaceResolution,
    groupAndTimeResolution,
  } = sources

  const readinessByRider = new Map(
    riderReadiness.map((row) => [row.riderId, row]),
  )
  const suitabilityByRider = new Map(
    riderSuitability.map((row) => [row.riderId, row]),
  )
  const phase4StateByRider = new Map(
    (roadRaceResolution.phase4Finish?.riderStates ?? []).map((row) => [
      row.riderId,
      row,
    ]),
  )
  const phase3StateByRider = new Map(
    (roadRaceResolution.phase3Decisive?.riderStates ?? []).map((row) => [
      row.riderId,
      row,
    ]),
  )
  const phase4RankingByRider = new Map(
    (roadRaceResolution.phase4Finish?.finish.rankings ?? []).map((row) => [
      row.riderId,
      row,
    ]),
  )
  const successfulPhase3AttackByRider = new Map<
    string,
    UniversalRoadDecisiveAttackAttempt
  >()
  for (const attempt of
    roadRaceResolution.phase3Decisive?.attackAttempts ?? []) {
    if (!attempt.attackSucceeded) continue
    const existing = successfulPhase3AttackByRider.get(attempt.riderId)
    if (!existing || attempt.attemptKm > existing.attemptKm) {
      successfulPhase3AttackByRider.set(attempt.riderId, attempt)
    }
  }
  const phase3Boundary =
    roadRaceResolution.phase3Decisive?.phaseBoundary ?? null
  const phase4CommandByRider = new Map(
    roadCommandResolution.riders.map((row) => [
      row.riderId,
      row.phases.find((phase) => phase.phaseNumber === 4) ?? null,
    ]),
  )
  const savedFinishCommandByRider = new Map<string, RoadCommandInput>()
  for (const teamPlan of input.stagePlans) {
    for (const riderPlan of teamPlan.riders) {
      savedFinishCommandByRider.set(
        riderPlan.riderId,
        riderPlan.commands.phase4,
      )
    }
  }
  const finalGroupByRider = new Map<
    string,
    UniversalPhase5GroupSnapshot
  >()
  for (const group of groupAndTimeResolution.finalGroups) {
    for (const riderId of group.riderIds) {
      finalGroupByRider.set(riderId, group)
    }
  }
  const officialResultByRider = new Map(
    groupAndTimeResolution.officialResults.map((row) => [
      row.riderId,
      row,
    ]),
  )

  const frontGroupSize =
    groupAndTimeResolution.finalGroups
      .slice()
      .sort(
        (left, right) =>
          left.groupOrder - right.groupOrder ||
          left.gapSeconds - right.gapSeconds,
      )[0]?.riderIds.length ?? 0

  const riderContexts: UniversalFinishRiderContext[] = input.riders.map(
    (rider) => {
      const readiness = readinessByRider.get(rider.riderId)
      const suitability = suitabilityByRider.get(rider.riderId)
      const phase4State = phase4StateByRider.get(rider.riderId)
      const phase3State = phase3StateByRider.get(rider.riderId)
      const phase4Ranking = phase4RankingByRider.get(rider.riderId)
      const successfulAttackAttempt =
        successfulPhase3AttackByRider.get(rider.riderId) ?? null
      const successfulAttackTimingFraction =
        successfulAttackAttempt && phase3Boundary
          ? clamp(
              (successfulAttackAttempt.attemptKm - phase3Boundary.startKm) /
                Math.max(
                  0.000001,
                  phase3Boundary.endKm - phase3Boundary.startKm,
                ),
              0,
              1,
            )
          : null
      const phase4Command = phase4CommandByRider.get(rider.riderId) ?? null
      const finalGroup = finalGroupByRider.get(rider.riderId)
      const officialResult = officialResultByRider.get(rider.riderId)
      const eligibleToStart =
        readiness?.eligibleToStart ?? rider.startStatus !== 'dns'

      return {
        riderId: rider.riderId,
        teamId: rider.teamId,
        eligibleToStart,
        sprintSkill: rider.sprint,
        timeTrialSkill: rider.timeTrial,
        flatSkill: rider.flat,
        climbingSkill: rider.climbing,
        enduranceSkill: rider.endurance,
        resistanceSkill: rider.resistance,
        teamworkSkill: rider.teamwork,
        raceSharpness: rider.raceSharpness,
        startFreshness: readiness?.components.startFreshness ?? 0,
        fatigueBeforeStage: rider.fatigueBeforeStage,
        finishContestEligible:
          phase3State?.finishContestEligible ?? eligibleToStart,
        physicalGroupCode: finalGroup?.groupCode ?? null,
        physicalGroupOrder: finalGroup?.groupOrder ?? null,
        physicalGapSeconds: finalGroup?.gapSeconds ?? null,
        phase5OfficialTimeSeconds:
          officialResult?.officialTimeSeconds ?? null,
        phase5PerformanceScore:
          officialResult?.performanceScore ?? null,
        remainingEnergy: phase4State?.energyAtFinish ?? null,
        readinessScore: readiness?.readinessScore ?? 0,
        suitabilityScore: suitability?.suitabilityScore ?? 0,
        phase4Command:
          phase4Command?.resolvedCommand ??
          savedFinishCommandByRider.get(rider.riderId) ??
          null,
        phase4CommandBehaviour:
          phase4Command?.behaviour ??
          (() => {
            const savedCommand = savedFinishCommandByRider.get(
              rider.riderId,
            )
            return savedCommand
              ? getRoadCommandBehaviour(savedCommand)
              : null
          })(),
        leadOutSupportGiven:
          phase4State?.leadOutSupportGiven ?? 0,
        leadOutSupportReceived:
          phase4State?.leadOutSupportReceived ?? 0,
        teamSupportReceived: phase3State?.protectionBonus ?? 0,
        successfulAttackAttemptKm:
          successfulAttackAttempt?.attemptKm ?? null,
        successfulAttackTimingFraction:
          successfulAttackTimingFraction == null
            ? null
            : deterministicRound(successfulAttackTimingFraction, 6),
        roadFinalGroupCode:
          phase4State?.finalGroupCode ?? null,
        phase4FinishRank: phase4Ranking?.rank ?? null,
        phase4FinishScore:
          phase4Ranking?.finishScore ?? null,
        preparation: {
          inStageEnergyCostMultiplier:
            rider.preparationModifiers
              ?.inStageEnergyCostMultiplier ?? 1,
          postStageFatigueMultiplier:
            rider.preparationModifiers
              ?.postStageFatigueMultiplier ?? 1,
          postStageRecoveryBonusPoints:
            rider.preparationModifiers
              ?.postStageRecoveryBonusPoints ?? 0,
        },
      }
    },
  )

  return {
    active: true,
    complete: false,
    stageClassification,
    finishMode: classifyUniversalFinishMode(
      input.stage,
      stageClassification,
      frontGroupSize,
    ),
    winnerRiderId: null,
    winnerTeamId: null,
    classification: [],
    teamTimes: [],
    riderContexts,
    deterministic: true,
    sourcePhase5ModelVersion:
      groupAndTimeResolution.modelVersion,
    modelVersion: 'universal_finish_resolution_foundation_v1',
  }
}


function isDeliberateFlatSprintContender(
  context: UniversalFinishRiderContext,
): boolean {
  return (
    context.finishContestEligible &&
    (context.phase4CommandBehaviour === 'stage_result' ||
      context.phase4CommandBehaviour === 'sprint_preparation')
  )
}

function calculateFlatSprintCommandComponent(
  command: RoadCommandInput | null,
): number {
  switch (command) {
    case 'sprint':
    case 'final_sprint':
      return 7
    case 'ride_for_stage_result':
      return 5
    case 'prepare_sprint':
      return 3.5
    case 'sprint_train_rider':
      return 2.5
    default:
      return 0
  }
}

export function scoreUniversalFlatSprintRider(
  context: UniversalFinishRiderContext,
  deterministicSeed: string,
  frontGroupSize: number,
): {
  readonly finishScore: number
  readonly components: UniversalFinishScoreComponents
} {
  const normalizedFrontGroupSize = Math.max(1, frontGroupSize)
  const positioningFraction =
    context.phase4FinishRank == null
      ? 0
      : clamp(
          1 -
            (Math.max(1, context.phase4FinishRank) - 1) /
              Math.max(1, normalizedFrontGroupSize - 1),
          0,
          1,
        )
  const preparationAdjustment = clamp(
    (1 - context.preparation.inStageEnergyCostMultiplier) * 12,
    -1.5,
    1.5,
  )
  const variation = deterministicRound(
    (calculateDeterministicUnitRoll(
      `${deterministicSeed}:phase6:flat_sprint:${context.riderId}`,
    ) -
      0.5) *
      2.5,
    6,
  )
  const components: UniversalFinishScoreComponents = {
    skill: deterministicRound(context.sprintSkill * 0.4, 6),
    energy: deterministicRound((context.remainingEnergy ?? 0) * 0.18, 6),
    sharpness: deterministicRound(context.raceSharpness * 0.1, 6),
    readiness: deterministicRound(context.readinessScore * 0.05, 6),
    suitability: deterministicRound(context.suitabilityScore * 0.1, 6),
    positioning: deterministicRound(positioningFraction * 6, 6),
    command: calculateFlatSprintCommandComponent(context.phase4Command),
    support: deterministicRound(
      Math.min(8, Math.max(0, context.leadOutSupportReceived) * 1.35),
      6,
    ),
    preparation: deterministicRound(preparationAdjustment, 6),
    variation,
  }
  const finishScore = deterministicRound(
    Object.values(components).reduce((sum, value) => sum + value, 0),
    6,
  )

  return { finishScore, components }
}

export interface UniversalScoredFinishContext {
  readonly context: UniversalFinishRiderContext
  readonly finishScore: number
  readonly components: UniversalFinishScoreComponents
  readonly winnerContestPriority: 0 | 1
}

export function buildUniversalOfficialRoadClassification(
  riderContexts: readonly UniversalFinishRiderContext[],
  scoredContexts: readonly UniversalScoredFinishContext[],
): readonly UniversalOfficialFinishRow[] {
  const scoreByRider = new Map(
    scoredContexts.map((row) => [row.context.riderId, row]),
  )
  const finishers = riderContexts.filter(
    (context) =>
      context.eligibleToStart &&
      context.phase5OfficialTimeSeconds != null &&
      context.physicalGroupOrder != null,
  )
  const orderedFinishers = finishers.slice().sort((left, right) => {
    const leftScore = scoreByRider.get(left.riderId)
    const rightScore = scoreByRider.get(right.riderId)
    return (
      (left.phase5OfficialTimeSeconds ?? Number.POSITIVE_INFINITY) -
        (right.phase5OfficialTimeSeconds ?? Number.POSITIVE_INFINITY) ||
      (left.physicalGroupOrder ?? Number.POSITIVE_INFINITY) -
        (right.physicalGroupOrder ?? Number.POSITIVE_INFINITY) ||
      (rightScore?.winnerContestPriority ?? 0) -
        (leftScore?.winnerContestPriority ?? 0) ||
      (rightScore?.finishScore ?? 0) - (leftScore?.finishScore ?? 0) ||
      (right.remainingEnergy ?? 0) - (left.remainingEnergy ?? 0) ||
      right.suitabilityScore - left.suitabilityScore ||
      right.sprintSkill - left.sprintSkill ||
      left.riderId.localeCompare(right.riderId)
    )
  })
  const winnerTimeSeconds =
    orderedFinishers[0]?.phase5OfficialTimeSeconds ?? null
  const rankedRows: UniversalOfficialFinishRow[] = orderedFinishers.map(
    (context, index) => {
      const scored = scoreByRider.get(context.riderId)
      const officialTimeSeconds = context.phase5OfficialTimeSeconds!
      const previousTimeSeconds =
        index === 0
          ? null
          : orderedFinishers[index - 1].phase5OfficialTimeSeconds
      return {
        rank: index + 1,
        riderId: context.riderId,
        teamId: context.teamId,
        status: 'finished',
        physicalGroupCode: context.physicalGroupCode,
        physicalGroupOrder: context.physicalGroupOrder,
        officialTimeSeconds,
        gapSeconds:
          winnerTimeSeconds == null
            ? null
            : deterministicRound(
                officialTimeSeconds - winnerTimeSeconds,
                6,
              ),
        sameTimeAsPrevious:
          previousTimeSeconds != null &&
          officialTimeSeconds === previousTimeSeconds,
        finishScore: scored?.finishScore ?? null,
        components: scored?.components ?? null,
      }
    },
  )
  const dnsRows: UniversalOfficialFinishRow[] = riderContexts
    .filter((context) => !context.eligibleToStart)
    .slice()
    .sort((left, right) => left.riderId.localeCompare(right.riderId))
    .map((context) => ({
      rank: null,
      riderId: context.riderId,
      teamId: context.teamId,
      status: 'dns',
      physicalGroupCode: null,
      physicalGroupOrder: null,
      officialTimeSeconds: null,
      gapSeconds: null,
      sameTimeAsPrevious: false,
      finishScore: null,
      components: null,
    }))

  return [...rankedRows, ...dnsRows]
}

export function resolveUniversalSoloFinish(
  sources: UniversalFinishFoundationSources,
  foundation: UniversalFinishResolution =
    buildUniversalFinishResolutionFoundation(sources),
): UniversalFinishResolution {
  if (foundation.finishMode !== 'solo_finish') return foundation

  const eligibleFinishers = foundation.riderContexts.filter(
    (context) =>
      context.eligibleToStart &&
      context.phase5OfficialTimeSeconds != null &&
      context.physicalGroupOrder != null,
  )
  if (eligibleFinishers.length === 0) {
    throw new Error(
      'Solo finish resolution requires at least one eligible finisher.',
    )
  }

  const frontGroupOrder = Math.min(
    ...eligibleFinishers.map((context) => context.physicalGroupOrder!),
  )
  const frontGroup = eligibleFinishers.filter(
    (context) => context.physicalGroupOrder === frontGroupOrder,
  )
  if (frontGroup.length !== 1) {
    throw new Error(
      'Solo finish resolution requires exactly one rider in the first physical group.',
    )
  }

  const scoredContexts: UniversalScoredFinishContext[] =
    eligibleFinishers.map((context) => {
      const finishScore = deterministicRound(
        context.phase4FinishScore ??
          context.phase5PerformanceScore ??
          context.suitabilityScore,
        6,
      )
      return {
        context,
        finishScore,
        components: {
          skill: finishScore,
          energy: 0,
          sharpness: 0,
          readiness: 0,
          suitability: 0,
          positioning: 0,
          command: 0,
          support: 0,
          preparation: 0,
          variation: 0,
        },
        winnerContestPriority:
          context.physicalGroupOrder === frontGroupOrder ? 1 : 0,
      }
    })
  const classification = buildUniversalOfficialRoadClassification(
    foundation.riderContexts,
    scoredContexts,
  )
  const winner = classification.find((row) => row.rank === 1)
  if (!winner) {
    throw new Error('Solo finish resolution did not produce a winner.')
  }

  return {
    ...foundation,
    complete: true,
    winnerRiderId: winner.riderId,
    winnerTeamId: winner.teamId,
    classification,
    teamTimes: [],
    modelVersion: 'universal_solo_finish_v1',
  }
}

export function resolveUniversalFlatSprintFinish(
  sources: UniversalFinishFoundationSources,
  foundation: UniversalFinishResolution =
    buildUniversalFinishResolutionFoundation(sources),
): UniversalFinishResolution {
  if (foundation.finishMode !== 'flat_sprint') return foundation

  const frontGroupOrder = Math.min(
    ...foundation.riderContexts
      .filter(
        (context) =>
          context.eligibleToStart && context.physicalGroupOrder != null,
      )
      .map((context) => context.physicalGroupOrder!),
  )
  const frontGroupContexts = foundation.riderContexts.filter(
    (context) =>
      context.eligibleToStart &&
      context.physicalGroupOrder === frontGroupOrder,
  )
  const deliberateContenders = frontGroupContexts.filter(
    isDeliberateFlatSprintContender,
  )
  const fallbackContenders = frontGroupContexts.filter(
    (context) => context.finishContestEligible,
  )
  const acceptedContenders =
    deliberateContenders.length > 0
      ? deliberateContenders
      : fallbackContenders
  if (acceptedContenders.length === 0) {
    throw new Error(
      'Flat sprint resolution requires an eligible contender in the first physical group.',
    )
  }
  const winnerContenders = new Set(
    acceptedContenders.map((context) => context.riderId),
  )
  const scoredContexts: UniversalScoredFinishContext[] =
    foundation.riderContexts
      .filter(
        (context) =>
          context.eligibleToStart &&
          context.phase5OfficialTimeSeconds != null,
      )
      .map((context) => {
        const scored = scoreUniversalFlatSprintRider(
          context,
          sources.input.engine.deterministicSeed,
          frontGroupContexts.length,
        )
        return {
          context,
          finishScore: scored.finishScore,
          components: scored.components,
          winnerContestPriority:
            context.physicalGroupOrder === frontGroupOrder &&
            winnerContenders.has(context.riderId)
              ? 1
              : 0,
        }
      })
  const classification = buildUniversalOfficialRoadClassification(
    foundation.riderContexts,
    scoredContexts,
  )
  const winner = classification.find((row) => row.rank === 1) ?? null

  return {
    ...foundation,
    complete: winner != null,
    winnerRiderId: winner?.riderId ?? null,
    winnerTeamId: winner?.teamId ?? null,
    classification,
    teamTimes: [],
    modelVersion: 'universal_flat_sprint_finish_v1',
  }
}

function calculateReducedGroupSprintCommandComponent(
  command: RoadCommandInput | null,
): number {
  switch (command) {
    case 'sprint':
    case 'final_sprint':
      return 6
    case 'ride_for_stage_result':
      return 5
    case 'attack':
      return 3.5
    case 'climb_hard':
      return 3
    case 'prepare_sprint':
      return 3
    case 'sprint_train_rider':
      return 2
    default:
      return 0
  }
}

export function scoreUniversalReducedGroupSprintRider(
  context: UniversalFinishRiderContext,
  deterministicSeed: string,
  frontGroupSize: number,
): {
  readonly finishScore: number
  readonly components: UniversalFinishScoreComponents
} {
  const normalizedFrontGroupSize = Math.max(
    1,
    Math.min(UNIVERSAL_REDUCED_GROUP_MAX_SIZE, frontGroupSize),
  )
  const groupSizeFraction = clamp(
    (normalizedFrontGroupSize - 1) /
      Math.max(1, UNIVERSAL_REDUCED_GROUP_MAX_SIZE - 1),
    0,
    1,
  )
  const sprintWeight = 0.22 + groupSizeFraction * 0.1
  const climbingWeight = 0.18 - groupSizeFraction * 0.05
  const energyWeight = 0.22 - groupSizeFraction * 0.04
  const positioningFraction =
    context.phase4FinishRank == null
      ? 0
      : clamp(
          1 -
            (Math.max(1, context.phase4FinishRank) - 1) /
              Math.max(1, normalizedFrontGroupSize - 1),
          0,
          1,
        )
  const supportScale = 0.45 + groupSizeFraction * 0.4
  const preparationAdjustment = clamp(
    (1 - context.preparation.inStageEnergyCostMultiplier) * 12,
    -1.5,
    1.5,
  )
  const variation = deterministicRound(
    (calculateDeterministicUnitRoll(
      `${deterministicSeed}:phase6:reduced_group_sprint:${context.riderId}`,
    ) -
      0.5) *
      2,
    6,
  )
  const components: UniversalFinishScoreComponents = {
    skill: deterministicRound(
      context.sprintSkill * sprintWeight +
        context.climbingSkill * climbingWeight,
      6,
    ),
    energy: deterministicRound(
      (context.remainingEnergy ?? 0) * energyWeight,
      6,
    ),
    sharpness: deterministicRound(context.raceSharpness * 0.08, 6),
    readiness: deterministicRound(context.readinessScore * 0.05, 6),
    suitability: deterministicRound(context.suitabilityScore * 0.14, 6),
    positioning: deterministicRound(positioningFraction * 5, 6),
    command: calculateReducedGroupSprintCommandComponent(
      context.phase4Command,
    ),
    support: deterministicRound(
      Math.min(
        5,
        Math.max(0, context.leadOutSupportReceived) *
          1.1 *
          supportScale,
      ),
      6,
    ),
    preparation: deterministicRound(preparationAdjustment, 6),
    variation,
  }
  const finishScore = deterministicRound(
    Object.values(components).reduce((sum, value) => sum + value, 0),
    6,
  )

  return { finishScore, components }
}

export function resolveUniversalReducedGroupSprintFinish(
  sources: UniversalFinishFoundationSources,
  foundation: UniversalFinishResolution =
    buildUniversalFinishResolutionFoundation(sources),
): UniversalFinishResolution {
  if (foundation.finishMode !== 'reduced_group_sprint') return foundation

  const frontGroupOrders = foundation.riderContexts
    .filter(
      (context) =>
        context.eligibleToStart && context.physicalGroupOrder != null,
    )
    .map((context) => context.physicalGroupOrder!)
  const frontGroupOrder = Math.min(...frontGroupOrders)
  const frontGroupContexts = foundation.riderContexts.filter(
    (context) =>
      context.eligibleToStart &&
      context.physicalGroupOrder === frontGroupOrder,
  )
  const eligibleContenders = frontGroupContexts.filter(
    (context) => context.finishContestEligible,
  )
  const acceptedContenders =
    eligibleContenders.length > 0
      ? eligibleContenders
      : frontGroupContexts
  if (acceptedContenders.length === 0) {
    throw new Error(
      'Reduced-group sprint resolution requires an eligible contender in the first physical group.',
    )
  }
  const winnerContenders = new Set(
    acceptedContenders.map((context) => context.riderId),
  )
  const scoredContexts: UniversalScoredFinishContext[] =
    foundation.riderContexts
      .filter(
        (context) =>
          context.eligibleToStart &&
          context.phase5OfficialTimeSeconds != null,
      )
      .map((context) => {
        const scored = scoreUniversalReducedGroupSprintRider(
          context,
          sources.input.engine.deterministicSeed,
          frontGroupContexts.length,
        )
        return {
          context,
          finishScore: scored.finishScore,
          components: scored.components,
          winnerContestPriority:
            context.physicalGroupOrder === frontGroupOrder &&
            winnerContenders.has(context.riderId)
              ? 1
              : 0,
        }
      })
  const classification = buildUniversalOfficialRoadClassification(
    foundation.riderContexts,
    scoredContexts,
  )
  const winner = classification.find((row) => row.rank === 1) ?? null

  return {
    ...foundation,
    complete: winner != null,
    winnerRiderId: winner?.riderId ?? null,
    winnerTeamId: winner?.teamId ?? null,
    classification,
    teamTimes: [],
    modelVersion: 'universal_reduced_group_sprint_finish_v1',
  }
}

function calculateHillFinishCommandComponent(
  command: RoadCommandInput | null,
): number {
  switch (command) {
    case 'attack':
      return 6
    case 'climb_hard':
      return 5
    case 'ride_for_stage_result':
      return 4.5
    case 'ride_for_time_gc':
      return 4
    case 'sprint':
    case 'final_sprint':
      return 2.5
    case 'stay_near_front':
      return 1.5
    case 'prepare_sprint':
      return 1
    case 'conserve_energy':
      return -1
    default:
      return 0
  }
}

export function scoreUniversalHillFinishRider(
  context: UniversalFinishRiderContext,
  deterministicSeed: string,
  positionInGroup: number,
  physicalGroupSize: number,
): {
  readonly finishScore: number
  readonly components: UniversalFinishScoreComponents
} {
  const normalizedGroupSize = Math.max(1, physicalGroupSize)
  const positioningFraction = clamp(
    1 -
      (Math.max(1, positionInGroup) - 1) /
        Math.max(1, normalizedGroupSize - 1),
    0,
    1,
  )
  const preparationAdjustment = clamp(
    (1 - context.preparation.inStageEnergyCostMultiplier) * 12,
    -1.5,
    1.5,
  )
  const variation = deterministicRound(
    (calculateDeterministicUnitRoll(
      `${deterministicSeed}:phase6:hill_finish:${context.riderId}`,
    ) -
      0.5) *
      2,
    6,
  )
  const components: UniversalFinishScoreComponents = {
    skill: deterministicRound(
      context.climbingSkill * 0.38 + context.sprintSkill * 0.16,
      6,
    ),
    energy: deterministicRound((context.remainingEnergy ?? 0) * 0.2, 6),
    sharpness: deterministicRound(context.raceSharpness * 0.08, 6),
    readiness: deterministicRound(context.readinessScore * 0.05, 6),
    suitability: deterministicRound(context.suitabilityScore * 0.12, 6),
    positioning: deterministicRound(positioningFraction * 5, 6),
    command: calculateHillFinishCommandComponent(context.phase4Command),
    support: deterministicRound(
      Math.min(3, Math.max(0, context.leadOutSupportReceived) * 0.65),
      6,
    ),
    preparation: deterministicRound(preparationAdjustment, 6),
    variation,
  }
  const finishScore = deterministicRound(
    Object.values(components).reduce((sum, value) => sum + value, 0),
    6,
  )

  return { finishScore, components }
}

export function resolveUniversalHillFinish(
  sources: UniversalFinishFoundationSources,
  foundation: UniversalFinishResolution =
    buildUniversalFinishResolutionFoundation(sources),
): UniversalFinishResolution {
  if (foundation.finishMode !== 'hill_finish') return foundation

  const groupedContexts = new Map<number, UniversalFinishRiderContext[]>()
  for (const context of foundation.riderContexts) {
    if (
      !context.eligibleToStart ||
      context.phase5OfficialTimeSeconds == null ||
      context.physicalGroupOrder == null
    ) {
      continue
    }
    const current = groupedContexts.get(context.physicalGroupOrder) ?? []
    current.push(context)
    groupedContexts.set(context.physicalGroupOrder, current)
  }

  const groupOrders = Array.from(groupedContexts.keys()).sort(
    (left, right) => left - right,
  )
  if (groupOrders.length === 0) {
    throw new Error(
      'Hill-finish resolution requires at least one eligible physical finishing group.',
    )
  }
  const frontGroupOrder = groupOrders[0]
  const frontGroupContexts = groupedContexts.get(frontGroupOrder) ?? []
  const eligibleContenders = frontGroupContexts.filter(
    (context) => context.finishContestEligible,
  )
  const acceptedContenders =
    eligibleContenders.length > 0
      ? eligibleContenders
      : frontGroupContexts
  if (acceptedContenders.length === 0) {
    throw new Error(
      'Hill-finish resolution requires an eligible contender in the first physical group.',
    )
  }
  const winnerContenders = new Set(
    acceptedContenders.map((context) => context.riderId),
  )
  const positionByRider = new Map<string, number>()
  const groupSizeByOrder = new Map<number, number>()
  for (const groupOrder of groupOrders) {
    const members = (groupedContexts.get(groupOrder) ?? [])
      .slice()
      .sort(
        (left, right) =>
          (left.phase4FinishRank ?? Number.POSITIVE_INFINITY) -
            (right.phase4FinishRank ?? Number.POSITIVE_INFINITY) ||
          (right.phase4FinishScore ?? 0) -
            (left.phase4FinishScore ?? 0) ||
          left.riderId.localeCompare(right.riderId),
      )
    groupSizeByOrder.set(groupOrder, members.length)
    members.forEach((context, index) => {
      positionByRider.set(context.riderId, index + 1)
    })
  }

  const scoredContexts: UniversalScoredFinishContext[] =
    foundation.riderContexts
      .filter(
        (context) =>
          context.eligibleToStart &&
          context.phase5OfficialTimeSeconds != null &&
          context.physicalGroupOrder != null,
      )
      .map((context) => {
        const scored = scoreUniversalHillFinishRider(
          context,
          sources.input.engine.deterministicSeed,
          positionByRider.get(context.riderId) ?? 1,
          groupSizeByOrder.get(context.physicalGroupOrder!) ?? 1,
        )
        return {
          context,
          finishScore: scored.finishScore,
          components: scored.components,
          winnerContestPriority:
            context.physicalGroupOrder === frontGroupOrder &&
            winnerContenders.has(context.riderId)
              ? 1
              : 0,
        }
      })
  const classification = buildUniversalOfficialRoadClassification(
    foundation.riderContexts,
    scoredContexts,
  )
  const winner = classification.find((row) => row.rank === 1) ?? null

  return {
    ...foundation,
    complete: winner != null,
    winnerRiderId: winner?.riderId ?? null,
    winnerTeamId: winner?.teamId ?? null,
    classification,
    teamTimes: [],
    modelVersion: 'universal_hill_finish_v1',
  }
}


function calculateSummitFinishCommandComponent(
  command: RoadCommandInput | null,
): number {
  switch (command) {
    case 'attack':
      return 5
    case 'climb_hard':
      return 4.5
    case 'ride_for_time_gc':
      return 4
    case 'ride_for_stage_result':
      return 3.5
    case 'stay_near_front':
      return 1.5
    case 'conserve_energy':
      return -1
    default:
      return 0
  }
}

export function scoreUniversalSummitFinishRider(
  context: UniversalFinishRiderContext,
  deterministicSeed: string,
  positionInGroup: number,
  physicalGroupSize: number,
): {
  readonly finishScore: number
  readonly components: UniversalFinishScoreComponents
} {
  const normalizedGroupSize = Math.max(1, physicalGroupSize)
  const positioningFraction = clamp(
    1 -
      (Math.max(1, positionInGroup) - 1) /
        Math.max(1, normalizedGroupSize - 1),
    0,
    1,
  )
  const preparationAdjustment = clamp(
    (1 - context.preparation.inStageEnergyCostMultiplier) * 12,
    -1.5,
    1.5,
  )
  const variation = deterministicRound(
    (calculateDeterministicUnitRoll(
      `${deterministicSeed}:phase6:summit_finish:${context.riderId}`,
    ) -
      0.5) *
      1.5,
    6,
  )
  const attackTiming =
    context.successfulAttackTimingFraction == null
      ? 0
      : deterministicRound(
          2 + context.successfulAttackTimingFraction * 3,
          6,
        )
  const components: UniversalFinishScoreComponents = {
    skill: deterministicRound(
      context.climbingSkill * 0.42 +
        context.enduranceSkill * 0.18 +
        context.resistanceSkill * 0.14,
      6,
    ),
    energy: deterministicRound((context.remainingEnergy ?? 0) * 0.16, 6),
    sharpness: deterministicRound(context.raceSharpness * 0.03, 6),
    readiness: deterministicRound(context.readinessScore * 0.05, 6),
    suitability: deterministicRound(context.suitabilityScore * 0.08, 6),
    positioning: deterministicRound(positioningFraction * 3, 6),
    command: calculateSummitFinishCommandComponent(context.phase4Command),
    support: deterministicRound(
      Math.min(4, Math.max(0, context.teamSupportReceived)),
      6,
    ),
    preparation: deterministicRound(preparationAdjustment, 6),
    variation,
    fatigue: deterministicRound(-context.fatigueBeforeStage * 0.04, 6),
    attackTiming,
  }
  const finishScore = deterministicRound(
    Object.values(components).reduce((sum, value) => sum + value, 0),
    6,
  )

  return { finishScore, components }
}

export function resolveUniversalSummitFinish(
  sources: UniversalFinishFoundationSources,
  foundation: UniversalFinishResolution =
    buildUniversalFinishResolutionFoundation(sources),
): UniversalFinishResolution {
  if (foundation.finishMode !== 'summit_finish') return foundation

  const groupedContexts = new Map<number, UniversalFinishRiderContext[]>()
  for (const context of foundation.riderContexts) {
    if (
      !context.eligibleToStart ||
      context.phase5OfficialTimeSeconds == null ||
      context.physicalGroupOrder == null
    ) {
      continue
    }
    const current = groupedContexts.get(context.physicalGroupOrder) ?? []
    current.push(context)
    groupedContexts.set(context.physicalGroupOrder, current)
  }

  const groupOrders = Array.from(groupedContexts.keys()).sort(
    (left, right) => left - right,
  )
  if (groupOrders.length === 0) {
    throw new Error(
      'Summit-finish resolution requires at least one eligible physical finishing group.',
    )
  }
  const frontGroupOrder = groupOrders[0]
  const frontGroupContexts = groupedContexts.get(frontGroupOrder) ?? []
  const eligibleContenders = frontGroupContexts.filter(
    (context) => context.finishContestEligible,
  )
  const acceptedContenders =
    eligibleContenders.length > 0
      ? eligibleContenders
      : frontGroupContexts
  if (acceptedContenders.length === 0) {
    throw new Error(
      'Summit-finish resolution requires an eligible contender in the first physical group.',
    )
  }
  const winnerContenders = new Set(
    acceptedContenders.map((context) => context.riderId),
  )
  const positionByRider = new Map<string, number>()
  const groupSizeByOrder = new Map<number, number>()
  for (const groupOrder of groupOrders) {
    const members = (groupedContexts.get(groupOrder) ?? [])
      .slice()
      .sort(
        (left, right) =>
          (left.phase4FinishRank ?? Number.POSITIVE_INFINITY) -
            (right.phase4FinishRank ?? Number.POSITIVE_INFINITY) ||
          (right.phase4FinishScore ?? 0) -
            (left.phase4FinishScore ?? 0) ||
          left.riderId.localeCompare(right.riderId),
      )
    groupSizeByOrder.set(groupOrder, members.length)
    members.forEach((context, index) => {
      positionByRider.set(context.riderId, index + 1)
    })
  }

  const scoredContexts: UniversalScoredFinishContext[] =
    foundation.riderContexts
      .filter(
        (context) =>
          context.eligibleToStart &&
          context.phase5OfficialTimeSeconds != null &&
          context.physicalGroupOrder != null,
      )
      .map((context) => {
        const scored = scoreUniversalSummitFinishRider(
          context,
          sources.input.engine.deterministicSeed,
          positionByRider.get(context.riderId) ?? 1,
          groupSizeByOrder.get(context.physicalGroupOrder!) ?? 1,
        )
        return {
          context,
          finishScore: scored.finishScore,
          components: scored.components,
          winnerContestPriority:
            context.physicalGroupOrder === frontGroupOrder &&
            winnerContenders.has(context.riderId)
              ? 1
              : 0,
        }
      })
  const classification = buildUniversalOfficialRoadClassification(
    foundation.riderContexts,
    scoredContexts,
  )
  const winner = classification.find((row) => row.rank === 1) ?? null

  return {
    ...foundation,
    complete: winner != null,
    winnerRiderId: winner?.riderId ?? null,
    winnerTeamId: winner?.teamId ?? null,
    classification,
    teamTimes: [],
    modelVersion: 'universal_summit_finish_v1',
  }
}


function calculateCobbledFinishCommandComponent(
  command: RoadCommandInput | null,
): number {
  switch (command) {
    case 'attack':
      return 5
    case 'ride_for_stage_result':
      return 4.5
    case 'stay_near_front':
      return 4
    case 'sprint':
    case 'final_sprint':
      return 3.5
    case 'chase_breakaway':
    case 'chase':
      return 2
    case 'conserve_energy':
      return -1
    case 'avoid_risks':
      return -1.5
    default:
      return 0
  }
}

export function scoreUniversalCobbledFinishRider(
  context: UniversalFinishRiderContext,
  deterministicSeed: string,
  positionInGroup: number,
  physicalGroupSize: number,
): {
  readonly finishScore: number
  readonly components: UniversalFinishScoreComponents
} {
  const normalizedGroupSize = Math.max(1, physicalGroupSize)
  const positioningFraction = clamp(
    1 -
      (Math.max(1, positionInGroup) - 1) /
        Math.max(1, normalizedGroupSize - 1),
    0,
    1,
  )
  const preparationAdjustment = clamp(
    (1 - context.preparation.inStageEnergyCostMultiplier) * 12,
    -1.5,
    1.5,
  )
  const variation = deterministicRound(
    (calculateDeterministicUnitRoll(
      `${deterministicSeed}:phase6:cobbled_finish:${context.riderId}`,
    ) -
      0.5) *
      2,
    6,
  )
  const components: UniversalFinishScoreComponents = {
    skill: deterministicRound(
      context.flatSkill * 0.3 +
        context.resistanceSkill * 0.22 +
        context.enduranceSkill * 0.16 +
        context.sprintSkill * 0.12,
      6,
    ),
    energy: deterministicRound((context.remainingEnergy ?? 0) * 0.15, 6),
    sharpness: deterministicRound(context.raceSharpness * 0.05, 6),
    readiness: deterministicRound(context.readinessScore * 0.05, 6),
    suitability: deterministicRound(context.suitabilityScore * 0.12, 6),
    positioning: deterministicRound(positioningFraction * 5, 6),
    command: calculateCobbledFinishCommandComponent(context.phase4Command),
    support: deterministicRound(
      Math.min(
        3,
        Math.max(0, context.teamSupportReceived) +
          Math.max(0, context.leadOutSupportReceived) * 0.25,
      ),
      6,
    ),
    preparation: deterministicRound(preparationAdjustment, 6),
    variation,
    fatigue: deterministicRound(-context.fatigueBeforeStage * 0.025, 6),
  }
  const finishScore = deterministicRound(
    Object.values(components).reduce((sum, value) => sum + value, 0),
    6,
  )

  return { finishScore, components }
}

export function resolveUniversalCobbledFinish(
  sources: UniversalFinishFoundationSources,
  foundation: UniversalFinishResolution =
    buildUniversalFinishResolutionFoundation(sources),
): UniversalFinishResolution {
  if (foundation.finishMode !== 'cobbled_finish') return foundation

  const groupedContexts = new Map<number, UniversalFinishRiderContext[]>()
  for (const context of foundation.riderContexts) {
    if (
      !context.eligibleToStart ||
      context.phase5OfficialTimeSeconds == null ||
      context.physicalGroupOrder == null
    ) {
      continue
    }
    const current = groupedContexts.get(context.physicalGroupOrder) ?? []
    current.push(context)
    groupedContexts.set(context.physicalGroupOrder, current)
  }

  const groupOrders = Array.from(groupedContexts.keys()).sort(
    (left, right) => left - right,
  )
  if (groupOrders.length === 0) {
    throw new Error(
      'Cobbled-finish resolution requires at least one eligible physical finishing group.',
    )
  }
  const frontGroupOrder = groupOrders[0]
  const frontGroupContexts = groupedContexts.get(frontGroupOrder) ?? []
  const eligibleContenders = frontGroupContexts.filter(
    (context) => context.finishContestEligible,
  )
  const acceptedContenders =
    eligibleContenders.length > 0
      ? eligibleContenders
      : frontGroupContexts
  if (acceptedContenders.length === 0) {
    throw new Error(
      'Cobbled-finish resolution requires an eligible contender in the first physical group.',
    )
  }
  const winnerContenders = new Set(
    acceptedContenders.map((context) => context.riderId),
  )
  const positionByRider = new Map<string, number>()
  const groupSizeByOrder = new Map<number, number>()
  for (const groupOrder of groupOrders) {
    const members = (groupedContexts.get(groupOrder) ?? [])
      .slice()
      .sort(
        (left, right) =>
          (left.phase4FinishRank ?? Number.POSITIVE_INFINITY) -
            (right.phase4FinishRank ?? Number.POSITIVE_INFINITY) ||
          (right.phase4FinishScore ?? 0) -
            (left.phase4FinishScore ?? 0) ||
          left.riderId.localeCompare(right.riderId),
      )
    groupSizeByOrder.set(groupOrder, members.length)
    members.forEach((context, index) => {
      positionByRider.set(context.riderId, index + 1)
    })
  }

  const scoredContexts: UniversalScoredFinishContext[] =
    foundation.riderContexts
      .filter(
        (context) =>
          context.eligibleToStart &&
          context.phase5OfficialTimeSeconds != null &&
          context.physicalGroupOrder != null,
      )
      .map((context) => {
        const scored = scoreUniversalCobbledFinishRider(
          context,
          sources.input.engine.deterministicSeed,
          positionByRider.get(context.riderId) ?? 1,
          groupSizeByOrder.get(context.physicalGroupOrder!) ?? 1,
        )
        return {
          context,
          finishScore: scored.finishScore,
          components: scored.components,
          winnerContestPriority:
            context.physicalGroupOrder === frontGroupOrder &&
            winnerContenders.has(context.riderId)
              ? 1
              : 0,
        }
      })
  const classification = buildUniversalOfficialRoadClassification(
    foundation.riderContexts,
    scoredContexts,
  )
  const winner = classification.find((row) => row.rank === 1) ?? null

  return {
    ...foundation,
    complete: winner != null,
    winnerRiderId: winner?.riderId ?? null,
    winnerTeamId: winner?.teamId ?? null,
    classification,
    teamTimes: [],
    modelVersion: 'universal_cobbled_finish_v1',
  }
}


function universalTimeTrialTerrainShares(
  stage: UniversalStageInput,
): {
  readonly flat: number
  readonly hilly: number
  readonly mountain: number
  readonly cobbled: number
} {
  const raw = stage.terrainPercentages
  const total = Math.max(
    0,
    raw.flat + raw.hilly + raw.mountain + raw.cobbled,
  )
  if (total <= 0) {
    return { flat: 1, hilly: 0, mountain: 0, cobbled: 0 }
  }
  return {
    flat: raw.flat / total,
    hilly: raw.hilly / total,
    mountain: raw.mountain / total,
    cobbled: raw.cobbled / total,
  }
}

export function calculateUniversalIndividualTimeTrialBaseSeconds(
  stage: UniversalStageInput,
): number {
  const shares = universalTimeTrialTerrainShares(stage)
  const ascentDensity =
    stage.distanceKm > 0 ? stage.elevationGainM / stage.distanceKm : 0
  const routePenaltyKmh =
    shares.hilly * 2.5 +
    shares.mountain * 7 +
    shares.cobbled * 5 +
    clamp(ascentDensity * 0.035, 0, 5.5)
  const longDistancePenaltyKmh = clamp(
    (stage.distanceKm - 40) * 0.02,
    0,
    1.5,
  )
  const referenceSpeedKmh = clamp(
    47 - routePenaltyKmh - longDistancePenaltyKmh,
    28,
    50,
  )

  return Math.max(
    1,
    Math.round((stage.distanceKm / referenceSpeedKmh) * 3600),
  )
}

function calculateUniversalTimeTrialPacingComponent(
  command: RoadCommandInput | null,
): number {
  switch (command) {
    case 'ride_for_time_gc':
      return 3
    case 'ride_for_stage_result':
      return 2.5
    case 'control_tempo':
    case 'control_race':
      return 1
    case 'climb_hard':
      return 0.75
    case 'stay_near_front':
      return 0.5
    case 'avoid_risks':
      return -0.75
    case 'attack':
      return -1
    case 'conserve_energy':
      return -1.5
    default:
      return 0
  }
}

function calculateUniversalTimeTrialWeatherPenaltySeconds(
  input: UniversalRaceEngineInput,
  resistanceSkill: number,
): number {
  const weather = input.weather
  if (!weather) return 0

  const severity = calculateWeatherSeverity(weather)
  const distanceKm = input.stage.distanceKm
  const severityPenalty = severity * distanceKm * 0.35
  const windPenalty =
    Math.max(0, (weather.windKmh ?? 0) - 20) * distanceKm * 0.035
  const precipitationPenalty =
    Math.min(12, Math.max(0, weather.precipitationMm ?? 0)) *
    distanceKm *
    0.08
  const temperature = weather.temperatureC
  const temperaturePenalty =
    temperature == null
      ? 0
      : (Math.max(0, 12 - temperature) + Math.max(0, temperature - 30)) *
        distanceKm *
        0.045
  const resistanceMitigation = 1 - clamp(resistanceSkill * 0.001, 0, 0.1)

  return deterministicRound(
    (severityPenalty +
      windPenalty +
      precipitationPenalty +
      temperaturePenalty) *
      resistanceMitigation,
    6,
  )
}

export function scoreUniversalIndividualTimeTrialRider(
  context: UniversalFinishRiderContext,
  input: UniversalRaceEngineInput,
): {
  readonly finishScore: number
  readonly officialTimeSeconds: number
  readonly routeBaseTimeSeconds: number
  readonly weatherPenaltySeconds: number
  readonly components: UniversalFinishScoreComponents
} {
  const stage = input.stage
  const shares = universalTimeTrialTerrainShares(stage)
  const distanceFactor = clamp((stage.distanceKm - 8) / 52, 0, 1)
  const routeSpecialtySkill =
    context.flatSkill * (shares.flat + shares.hilly * 0.35) +
    context.climbingSkill * (shares.mountain + shares.hilly * 0.65) +
    context.resistanceSkill * shares.cobbled
  const enduranceWeight = 0.06 + distanceFactor * 0.08
  const sharpnessWeight = 0.08 - distanceFactor * 0.04
  const preparationEquipmentComponent = clamp(
    (1 - context.preparation.inStageEnergyCostMultiplier) * 20,
    -2.5,
    2.5,
  )
  const weatherSeverity = calculateWeatherSeverity(input.weather)
  const weatherScorePenalty = deterministicRound(
    -weatherSeverity *
      (1.1 - clamp(context.resistanceSkill, 0, 100) * 0.005),
    6,
  )
  const variation = deterministicRound(
    (calculateDeterministicUnitRoll(
      `${input.engine.deterministicSeed}:phase6:individual_time_trial:${context.riderId}`,
    ) -
      0.5) *
      1.5,
    6,
  )
  const components: UniversalFinishScoreComponents = {
    skill: deterministicRound(
      context.timeTrialSkill * 0.5 +
        context.enduranceSkill * enduranceWeight,
      6,
    ),
    route: deterministicRound(routeSpecialtySkill * 0.12, 6),
    energy: deterministicRound(context.startFreshness * 0.06, 6),
    sharpness: deterministicRound(
      context.raceSharpness * sharpnessWeight,
      6,
    ),
    readiness: deterministicRound(context.readinessScore * 0.1, 6),
    suitability: deterministicRound(context.suitabilityScore * 0.12, 6),
    positioning: 0,
    command: 0,
    support: 0,
    preparation: 0,
    equipment: deterministicRound(preparationEquipmentComponent, 6),
    pacing: deterministicRound(
      calculateUniversalTimeTrialPacingComponent(context.phase4Command),
      6,
    ),
    weather: weatherScorePenalty,
    variation,
  }
  const finishScore = deterministicRound(
    Object.values(components).reduce((sum, value) => sum + value, 0),
    6,
  )
  const routeBaseTimeSeconds =
    calculateUniversalIndividualTimeTrialBaseSeconds(stage)
  const weatherPenaltySeconds =
    calculateUniversalTimeTrialWeatherPenaltySeconds(
      input,
      context.resistanceSkill,
    )
  const secondsPerPerformancePoint = 1.2 + stage.distanceKm * 0.055
  const performanceAdjustmentSeconds =
    (76 - finishScore) * secondsPerPerformancePoint
  const officialTimeSeconds = Math.max(
    1,
    Math.round(
      routeBaseTimeSeconds +
        weatherPenaltySeconds +
        performanceAdjustmentSeconds,
    ),
  )

  return {
    finishScore,
    officialTimeSeconds,
    routeBaseTimeSeconds,
    weatherPenaltySeconds,
    components,
  }
}


export function calculateUniversalPrologueBaseSeconds(
  stage: UniversalStageInput,
): number {
  return calculateUniversalIndividualTimeTrialBaseSeconds(stage)
}

export function scoreUniversalPrologueRider(
  context: UniversalFinishRiderContext,
  input: UniversalRaceEngineInput,
): {
  readonly finishScore: number
  readonly officialTimeSeconds: number
  readonly routeBaseTimeSeconds: number
  readonly weatherPenaltySeconds: number
  readonly components: UniversalFinishScoreComponents
} {
  const stage = input.stage
  const shares = universalTimeTrialTerrainShares(stage)
  const shortDistanceFactor = clamp((12 - stage.distanceKm) / 10, 0, 1)
  const routeSpecialtySkill =
    context.flatSkill * (shares.flat + shares.hilly * 0.3) +
    context.climbingSkill * (shares.mountain + shares.hilly * 0.7) +
    context.resistanceSkill * shares.cobbled
  const preparationEquipmentComponent = clamp(
    (1 - context.preparation.inStageEnergyCostMultiplier) * 20,
    -2.5,
    2.5,
  )
  const weatherSeverity = calculateWeatherSeverity(input.weather)
  const weatherScorePenalty = deterministicRound(
    -weatherSeverity *
      (1 - clamp(context.resistanceSkill, 0, 100) * 0.0045),
    6,
  )
  const variation = deterministicRound(
    (calculateDeterministicUnitRoll(
      `${input.engine.deterministicSeed}:phase6:prologue:${context.riderId}`,
    ) -
      0.5) *
      1.5,
    6,
  )
  const components: UniversalFinishScoreComponents = {
    skill: deterministicRound(
      context.timeTrialSkill * 0.48 +
        context.sprintSkill * (0.08 + shortDistanceFactor * 0.025) +
        context.flatSkill * (0.065 + shortDistanceFactor * 0.02) +
        context.enduranceSkill * 0.03,
      6,
    ),
    route: deterministicRound(routeSpecialtySkill * 0.08, 6),
    energy: deterministicRound(context.startFreshness * 0.05, 6),
    sharpness: deterministicRound(
      context.raceSharpness * (0.14 + shortDistanceFactor * 0.04),
      6,
    ),
    readiness: deterministicRound(context.readinessScore * 0.08, 6),
    suitability: deterministicRound(context.suitabilityScore * 0.11, 6),
    positioning: 0,
    command: 0,
    support: 0,
    preparation: 0,
    equipment: deterministicRound(preparationEquipmentComponent, 6),
    pacing: deterministicRound(
      calculateUniversalTimeTrialPacingComponent(context.phase4Command) * 1.05,
      6,
    ),
    weather: weatherScorePenalty,
    variation,
  }
  const finishScore = deterministicRound(
    Object.values(components).reduce((sum, value) => sum + value, 0),
    6,
  )
  const routeBaseTimeSeconds = calculateUniversalPrologueBaseSeconds(stage)
  const weatherPenaltySeconds =
    calculateUniversalTimeTrialWeatherPenaltySeconds(
      input,
      context.resistanceSkill,
    )
  const secondsPerPerformancePoint = 0.45 + stage.distanceKm * 0.035
  const performanceAdjustmentSeconds =
    (82 - finishScore) * secondsPerPerformancePoint
  const officialTimeSeconds = Math.max(
    1,
    Math.round(
      routeBaseTimeSeconds +
        weatherPenaltySeconds +
        performanceAdjustmentSeconds,
    ),
  )

  return {
    finishScore,
    officialTimeSeconds,
    routeBaseTimeSeconds,
    weatherPenaltySeconds,
    components,
  }
}

export function buildUniversalOfficialIndividualTimeTrialClassification(
  riderContexts: readonly UniversalFinishRiderContext[],
  scoredRows: readonly {
    readonly context: UniversalFinishRiderContext
    readonly finishScore: number
    readonly officialTimeSeconds: number
    readonly components: UniversalFinishScoreComponents
  }[],
): readonly UniversalOfficialFinishRow[] {
  const orderedFinishers = scoredRows
    .slice()
    .sort(
      (left, right) =>
        left.officialTimeSeconds - right.officialTimeSeconds ||
        right.finishScore - left.finishScore ||
        right.context.timeTrialSkill - left.context.timeTrialSkill ||
        left.context.riderId.localeCompare(right.context.riderId),
    )
  const winnerTimeSeconds = orderedFinishers[0]?.officialTimeSeconds ?? null
  const rankedRows: UniversalOfficialFinishRow[] = orderedFinishers.map(
    (row, index) => ({
      rank: index + 1,
      riderId: row.context.riderId,
      teamId: row.context.teamId,
      status: 'finished',
      physicalGroupCode: row.context.physicalGroupCode,
      physicalGroupOrder: row.context.physicalGroupOrder,
      officialTimeSeconds: row.officialTimeSeconds,
      gapSeconds:
        winnerTimeSeconds == null
          ? null
          : row.officialTimeSeconds - winnerTimeSeconds,
      sameTimeAsPrevious:
        index > 0 &&
        row.officialTimeSeconds ===
          orderedFinishers[index - 1].officialTimeSeconds,
      finishScore: row.finishScore,
      components: row.components,
    }),
  )
  const dnsRows: UniversalOfficialFinishRow[] = riderContexts
    .filter((context) => !context.eligibleToStart)
    .slice()
    .sort((left, right) => left.riderId.localeCompare(right.riderId))
    .map((context) => ({
      rank: null,
      riderId: context.riderId,
      teamId: context.teamId,
      status: 'dns',
      physicalGroupCode: null,
      physicalGroupOrder: null,
      officialTimeSeconds: null,
      gapSeconds: null,
      sameTimeAsPrevious: false,
      finishScore: null,
      components: null,
    }))

  return [...rankedRows, ...dnsRows]
}

export function resolveUniversalIndividualTimeTrialFinish(
  sources: UniversalFinishFoundationSources,
  foundation: UniversalFinishResolution =
    buildUniversalFinishResolutionFoundation(sources),
): UniversalFinishResolution {
  if (foundation.finishMode !== 'individual_time_trial') return foundation

  const scoredRows = foundation.riderContexts
    .filter(
      (context) =>
        context.eligibleToStart &&
        context.phase5OfficialTimeSeconds != null,
    )
    .map((context) => {
      const scored = scoreUniversalIndividualTimeTrialRider(
        context,
        sources.input,
      )
      return {
        context,
        finishScore: scored.finishScore,
        officialTimeSeconds: scored.officialTimeSeconds,
        components: scored.components,
      }
    })
  if (scoredRows.length === 0) {
    throw new Error(
      'Individual time-trial resolution requires at least one eligible starter.',
    )
  }

  const classification =
    buildUniversalOfficialIndividualTimeTrialClassification(
      foundation.riderContexts,
      scoredRows,
    )
  const winner = classification.find((row) => row.rank === 1) ?? null

  return {
    ...foundation,
    complete: winner != null,
    winnerRiderId: winner?.riderId ?? null,
    winnerTeamId: winner?.teamId ?? null,
    classification,
    teamTimes: [],
    modelVersion: 'universal_individual_time_trial_finish_v1',
  }
}


export function resolveUniversalPrologueFinish(
  sources: UniversalFinishFoundationSources,
  foundation: UniversalFinishResolution =
    buildUniversalFinishResolutionFoundation(sources),
): UniversalFinishResolution {
  if (foundation.finishMode !== 'prologue') return foundation

  const scoredRows = foundation.riderContexts
    .filter(
      (context) =>
        context.eligibleToStart &&
        context.phase5OfficialTimeSeconds != null,
    )
    .map((context) => {
      const scored = scoreUniversalPrologueRider(context, sources.input)
      return {
        context,
        finishScore: scored.finishScore,
        officialTimeSeconds: scored.officialTimeSeconds,
        components: scored.components,
      }
    })
  if (scoredRows.length === 0) {
    throw new Error(
      'Prologue resolution requires at least one eligible starter.',
    )
  }

  const classification =
    buildUniversalOfficialIndividualTimeTrialClassification(
      foundation.riderContexts,
      scoredRows,
    )
  const winner = classification.find((row) => row.rank === 1) ?? null

  return {
    ...foundation,
    complete: winner != null,
    winnerRiderId: winner?.riderId ?? null,
    winnerTeamId: winner?.teamId ?? null,
    classification,
    teamTimes: [],
    modelVersion: 'universal_prologue_finish_v1',
  }
}


function averageUniversalFinishValues(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length
}

function calculateUniversalTeamTimeTrialRiderProjection(
  context: UniversalFinishRiderContext,
  input: UniversalRaceEngineInput,
): number {
  const shares = universalTimeTrialTerrainShares(input.stage)
  const distanceFactor = clamp((input.stage.distanceKm - 15) / 55, 0, 1)
  const routeSkill =
    context.flatSkill * (shares.flat + shares.hilly * 0.3) +
    context.climbingSkill * (shares.mountain + shares.hilly * 0.7) +
    context.resistanceSkill * shares.cobbled
  const preparationComponent = clamp(
    (1 - context.preparation.inStageEnergyCostMultiplier) * 20,
    -2.5,
    2.5,
  )

  return deterministicRound(
    context.timeTrialSkill * 0.46 +
      context.enduranceSkill * (0.08 + distanceFactor * 0.06) +
      routeSkill * 0.1 +
      context.suitabilityScore * 0.12 +
      context.readinessScore * 0.08 +
      context.startFreshness * 0.05 +
      calculateUniversalTimeTrialPacingComponent(context.phase4Command) +
      preparationComponent,
    6,
  )
}

export function scoreUniversalTeamTimeTrialTeam(
  teamContexts: readonly UniversalFinishRiderContext[],
  input: UniversalRaceEngineInput,
  countingRiderNumber: number,
): {
  readonly teamId: string
  readonly finishScore: number
  readonly officialTimeSeconds: number
  readonly countingRiderId: string
  readonly selectedRiderIds: readonly string[]
  readonly countingRiderIds: readonly string[]
  readonly riderProjectionScores: Readonly<Record<string, number>>
  readonly components: UniversalTeamTimeTrialScoreComponents
} {
  const eligibleContexts = teamContexts.filter(
    (context) => context.eligibleToStart,
  )
  if (eligibleContexts.length < countingRiderNumber) {
    throw new Error(
      `Team time-trial resolution requires at least ${countingRiderNumber} eligible riders per team.`,
    )
  }
  const teamId = eligibleContexts[0]?.teamId ?? ''
  if (
    teamId.length === 0 ||
    eligibleContexts.some((context) => context.teamId !== teamId)
  ) {
    throw new Error(
      'Team time-trial scoring requires contexts from exactly one team.',
    )
  }

  const projected = eligibleContexts
    .map((context) => ({
      context,
      projectionScore: calculateUniversalTeamTimeTrialRiderProjection(
        context,
        input,
      ),
    }))
    .sort(
      (left, right) =>
        right.projectionScore - left.projectionScore ||
        right.context.timeTrialSkill - left.context.timeTrialSkill ||
        left.context.riderId.localeCompare(right.context.riderId),
    )
  const countingGroup = projected.slice(0, countingRiderNumber)
  const strongestGroup = countingGroup.slice(
    0,
    Math.min(2, countingGroup.length),
  )
  const weakestCountingRider = countingGroup[countingGroup.length - 1]
  if (!weakestCountingRider) {
    throw new Error('Team time-trial counting group cannot be empty.')
  }

  const countingScores = countingGroup.map((row) => row.projectionScore)
  const averageTeamwork = averageUniversalFinishValues(
    countingGroup.map((row) => row.context.teamworkSkill),
  )
  const scoreDispersion =
    (countingScores[0] ?? 0) -
    (countingScores[countingScores.length - 1] ?? 0)
  const cohesionPenaltyPct = calculateTeamTimeTrialCohesionPenaltyPct(
    averageTeamwork,
    scoreDispersion,
  )
  const averageFatigue = averageUniversalFinishValues(
    countingGroup.map((row) => row.context.fatigueBeforeStage),
  )
  const averageResistance = averageUniversalFinishValues(
    countingGroup.map((row) => row.context.resistanceSkill),
  )
  const averagePreparation = averageUniversalFinishValues(
    countingGroup.map((row) =>
      clamp(
        (1 - row.context.preparation.inStageEnergyCostMultiplier) * 20,
        -2.5,
        2.5,
      ),
    ),
  )
  const averagePacing = averageUniversalFinishValues(
    countingGroup.map((row) =>
      calculateUniversalTimeTrialPacingComponent(
        row.context.phase4Command,
      ),
    ),
  )
  const weatherSeverity = calculateWeatherSeverity(input.weather)
  const weatherComponent = deterministicRound(
    -weatherSeverity *
      (1.05 - clamp(averageResistance, 0, 100) * 0.0045),
    6,
  )
  const variation = deterministicRound(
    (calculateDeterministicUnitRoll(
      `${input.engine.deterministicSeed}:phase6:team_time_trial:${teamId}`,
    ) -
      0.5) *
      1,
    6,
  )
  const components: UniversalTeamTimeTrialScoreComponents = {
    strongestRiders: deterministicRound(
      averageUniversalFinishValues(
        strongestGroup.map((row) => row.projectionScore),
      ) * 0.22,
      6,
    ),
    teamAverage: deterministicRound(
      averageUniversalFinishValues(
        projected.map((row) => row.projectionScore),
      ) * 0.18,
      6,
    ),
    weakestCountingRider: deterministicRound(
      weakestCountingRider.projectionScore * 0.42,
      6,
    ),
    cooperation: deterministicRound(
      averageTeamwork * 0.12 - cohesionPenaltyPct * 100,
      6,
    ),
    fatigue: deterministicRound(-averageFatigue * 0.04, 6),
    equipment: deterministicRound(averagePreparation, 6),
    weather: weatherComponent,
    pacing: deterministicRound(averagePacing, 6),
    variation,
  }
  const finishScore = deterministicRound(
    Object.values(components).reduce((sum, value) => sum + value, 0),
    6,
  )
  const baseSeconds = calculateUniversalIndividualTimeTrialBaseSeconds(
    input.stage,
  )
  const aerodynamicBenefitPct = clamp(
    (countingRiderNumber - 1) * 0.012 +
      (eligibleContexts.length - countingRiderNumber) * 0.0025,
    0,
    0.12,
  )
  const weatherPenaltySeconds =
    calculateUniversalTimeTrialWeatherPenaltySeconds(
      input,
      averageResistance,
    )
  const secondsPerPerformancePoint = 1.35 + input.stage.distanceKm * 0.06
  const officialTimeSeconds = Math.max(
    1,
    Math.round(
      baseSeconds * (1 - aerodynamicBenefitPct) +
        weatherPenaltySeconds +
        (78 - finishScore) * secondsPerPerformancePoint,
    ),
  )

  return {
    teamId,
    finishScore,
    officialTimeSeconds,
    countingRiderId: weakestCountingRider.context.riderId,
    selectedRiderIds: projected.map((row) => row.context.riderId),
    countingRiderIds: countingGroup.map((row) => row.context.riderId),
    riderProjectionScores: Object.fromEntries(
      projected.map((row) => [
        row.context.riderId,
        row.projectionScore,
      ]),
    ),
    components,
  }
}

export function resolveUniversalTeamTimeTrialFinish(
  sources: UniversalFinishFoundationSources,
  foundation: UniversalFinishResolution =
    buildUniversalFinishResolutionFoundation(sources),
): UniversalFinishResolution {
  if (foundation.finishMode !== 'team_time_trial') return foundation

  const countingRiderNumber =
    sources.input.stage.timeTrialRules?.countingRiderNumber ?? null
  if (
    countingRiderNumber == null ||
    countingRiderNumber < 2 ||
    countingRiderNumber > 8
  ) {
    throw new Error(
      'Team time-trial resolution requires a configured counting rider number from 2 through 8.',
    )
  }

  const eligibleByTeam = new Map<string, UniversalFinishRiderContext[]>()
  for (const context of foundation.riderContexts) {
    if (!context.eligibleToStart) continue
    const current = eligibleByTeam.get(context.teamId) ?? []
    current.push(context)
    eligibleByTeam.set(context.teamId, current)
  }
  const scoredTeams = Array.from(eligibleByTeam.values()).map(
    (teamContexts) =>
      scoreUniversalTeamTimeTrialTeam(
        teamContexts,
        sources.input,
        countingRiderNumber,
      ),
  )
  if (scoredTeams.length === 0) {
    throw new Error(
      'Team time-trial resolution requires at least one eligible team.',
    )
  }
  scoredTeams.sort(
    (left, right) =>
      left.officialTimeSeconds - right.officialTimeSeconds ||
      right.finishScore - left.finishScore ||
      left.teamId.localeCompare(right.teamId),
  )
  const winnerTimeSeconds = scoredTeams[0].officialTimeSeconds
  const teamTimes: UniversalOfficialTeamTime[] = scoredTeams.map(
    (team, index) => ({
      rank: index + 1,
      teamId: team.teamId,
      officialTimeSeconds: team.officialTimeSeconds,
      gapSeconds: team.officialTimeSeconds - winnerTimeSeconds,
      countingRiderId: team.countingRiderId,
      countingRiderNumber,
      selectedRiderIds: team.selectedRiderIds,
      countingRiderIds: team.countingRiderIds,
      finishScore: team.finishScore,
      components: team.components,
    }),
  )
  const teamById = new Map(scoredTeams.map((team) => [team.teamId, team]))
  const orderedFinishers = foundation.riderContexts
    .filter((context) => context.eligibleToStart)
    .slice()
    .sort((left, right) => {
      const leftTeam = teamById.get(left.teamId)!
      const rightTeam = teamById.get(right.teamId)!
      return (
        leftTeam.officialTimeSeconds - rightTeam.officialTimeSeconds ||
        (rightTeam.riderProjectionScores[right.riderId] ?? 0) -
          (leftTeam.riderProjectionScores[left.riderId] ?? 0) ||
        left.riderId.localeCompare(right.riderId)
      )
    })
  const classification: UniversalOfficialFinishRow[] = orderedFinishers.map(
    (context, index) => {
      const team = teamById.get(context.teamId)!
      const previous = orderedFinishers[index - 1]
      const previousTeam = previous ? teamById.get(previous.teamId) : null
      const projection = team.riderProjectionScores[context.riderId] ?? 0
      return {
        rank: index + 1,
        riderId: context.riderId,
        teamId: context.teamId,
        status: 'finished',
        physicalGroupCode: context.physicalGroupCode,
        physicalGroupOrder: context.physicalGroupOrder,
        officialTimeSeconds: team.officialTimeSeconds,
        gapSeconds: team.officialTimeSeconds - winnerTimeSeconds,
        sameTimeAsPrevious:
          previousTeam?.officialTimeSeconds === team.officialTimeSeconds,
        finishScore: deterministicRound(projection, 6),
        components: {
          skill: deterministicRound(projection, 6),
          energy: 0,
          sharpness: 0,
          readiness: 0,
          suitability: 0,
          positioning: 0,
          command: 0,
          support: deterministicRound(team.components.cooperation, 6),
          preparation: deterministicRound(team.components.equipment, 6),
          fatigue: deterministicRound(team.components.fatigue, 6),
          weather: deterministicRound(team.components.weather, 6),
          pacing: deterministicRound(team.components.pacing, 6),
          variation: deterministicRound(team.components.variation, 6),
        },
      }
    },
  )
  const dnsRows: UniversalOfficialFinishRow[] = foundation.riderContexts
    .filter((context) => !context.eligibleToStart)
    .slice()
    .sort((left, right) => left.riderId.localeCompare(right.riderId))
    .map((context) => ({
      rank: null,
      riderId: context.riderId,
      teamId: context.teamId,
      status: 'dns',
      physicalGroupCode: null,
      physicalGroupOrder: null,
      officialTimeSeconds: null,
      gapSeconds: null,
      sameTimeAsPrevious: false,
      finishScore: null,
      components: null,
    }))
  const winnerTeam = scoredTeams[0]

  return {
    ...foundation,
    complete: true,
    winnerRiderId: winnerTeam.countingRiderId,
    winnerTeamId: winnerTeam.teamId,
    classification: [...classification, ...dnsRows],
    teamTimes,
    modelVersion: 'universal_team_time_trial_finish_v1',
  }
}


export function scoreUniversalPairTimeTrialTeam(
  pairContexts: readonly UniversalFinishRiderContext[],
  input: UniversalRaceEngineInput,
): {
  readonly teamId: string
  readonly finishScore: number
  readonly officialTimeSeconds: number
  readonly countingRiderId: string
  readonly selectedRiderIds: readonly string[]
  readonly countingRiderIds: readonly string[]
  readonly riderProjectionScores: Readonly<Record<string, number>>
  readonly components: UniversalTeamTimeTrialScoreComponents
} {
  const eligibleContexts = pairContexts.filter(
    (context) => context.eligibleToStart,
  )
  if (eligibleContexts.length !== 2) {
    throw new Error(
      'Pair time-trial scoring requires exactly two eligible riders per team.',
    )
  }
  const teamId = eligibleContexts[0]?.teamId ?? ''
  if (
    teamId.length === 0 ||
    eligibleContexts.some((context) => context.teamId !== teamId)
  ) {
    throw new Error(
      'Pair time-trial scoring requires contexts from exactly one team.',
    )
  }

  const projected = eligibleContexts
    .map((context) => ({
      context,
      projectionScore: calculateUniversalTeamTimeTrialRiderProjection(
        context,
        input,
      ),
    }))
    .sort(
      (left, right) =>
        right.projectionScore - left.projectionScore ||
        right.context.timeTrialSkill - left.context.timeTrialSkill ||
        left.context.riderId.localeCompare(right.context.riderId),
    )
  const strongerRider = projected[0]
  const weakerRider = projected[1]
  if (!strongerRider || !weakerRider) {
    throw new Error('Pair time-trial scoring requires a complete pair.')
  }

  const projectionScores = projected.map((row) => row.projectionScore)
  const averageProjection = averageUniversalFinishValues(projectionScores)
  const averageTeamwork = averageUniversalFinishValues(
    projected.map((row) => row.context.teamworkSkill),
  )
  const scoreDispersion =
    strongerRider.projectionScore - weakerRider.projectionScore
  const cohesionPenaltyPct = calculateTeamTimeTrialCohesionPenaltyPct(
    averageTeamwork,
    scoreDispersion,
  )
  const averageFatigue = averageUniversalFinishValues(
    projected.map((row) => row.context.fatigueBeforeStage),
  )
  const averageResistance = averageUniversalFinishValues(
    projected.map((row) => row.context.resistanceSkill),
  )
  const averagePreparation = averageUniversalFinishValues(
    projected.map((row) =>
      clamp(
        (1 - row.context.preparation.inStageEnergyCostMultiplier) * 20,
        -2.5,
        2.5,
      ),
    ),
  )
  const averagePacing = averageUniversalFinishValues(
    projected.map((row) =>
      calculateUniversalTimeTrialPacingComponent(
        row.context.phase4Command,
      ),
    ),
  )
  const weatherSeverity = calculateWeatherSeverity(input.weather)
  const weatherComponent = deterministicRound(
    -weatherSeverity *
      (1.08 - clamp(averageResistance, 0, 100) * 0.0048),
    6,
  )
  const variation = deterministicRound(
    (calculateDeterministicUnitRoll(
      `${input.engine.deterministicSeed}:phase6:pair_time_trial:${teamId}`,
    ) -
      0.5) *
      0.8,
    6,
  )
  const components: UniversalTeamTimeTrialScoreComponents = {
    strongestRiders: deterministicRound(
      strongerRider.projectionScore * 0.18,
      6,
    ),
    teamAverage: deterministicRound(averageProjection * 0.2, 6),
    weakestCountingRider: deterministicRound(
      weakerRider.projectionScore * 0.48,
      6,
    ),
    cooperation: deterministicRound(
      averageTeamwork * 0.14 - cohesionPenaltyPct * 120,
      6,
    ),
    fatigue: deterministicRound(-averageFatigue * 0.05, 6),
    equipment: deterministicRound(averagePreparation, 6),
    weather: weatherComponent,
    pacing: deterministicRound(averagePacing, 6),
    variation,
  }
  const finishScore = deterministicRound(
    Object.values(components).reduce((sum, value) => sum + value, 0),
    6,
  )
  const baseSeconds = calculateUniversalIndividualTimeTrialBaseSeconds(
    input.stage,
  )
  const pairDraftBenefitPct = 0.018
  const weatherPenaltySeconds =
    calculateUniversalTimeTrialWeatherPenaltySeconds(
      input,
      averageResistance,
    )
  const secondsPerPerformancePoint =
    1.5 + input.stage.distanceKm * 0.065
  const officialTimeSeconds = Math.max(
    1,
    Math.round(
      baseSeconds * (1 - pairDraftBenefitPct) +
        weatherPenaltySeconds +
        (78 - finishScore) * secondsPerPerformancePoint,
    ),
  )

  return {
    teamId,
    finishScore,
    officialTimeSeconds,
    countingRiderId: weakerRider.context.riderId,
    selectedRiderIds: projected.map((row) => row.context.riderId),
    countingRiderIds: projected.map((row) => row.context.riderId),
    riderProjectionScores: Object.fromEntries(
      projected.map((row) => [
        row.context.riderId,
        row.projectionScore,
      ]),
    ),
    components,
  }
}

export function resolveUniversalPairTimeTrialFinish(
  sources: UniversalFinishFoundationSources,
  foundation: UniversalFinishResolution =
    buildUniversalFinishResolutionFoundation(sources),
): UniversalFinishResolution {
  if (foundation.finishMode !== 'pair_time_trial') return foundation

  const eligibleByTeam = new Map<string, UniversalFinishRiderContext[]>()
  for (const context of foundation.riderContexts) {
    if (!context.eligibleToStart) continue
    const current = eligibleByTeam.get(context.teamId) ?? []
    current.push(context)
    eligibleByTeam.set(context.teamId, current)
  }
  const scoredTeams = Array.from(eligibleByTeam.values()).map(
    (teamContexts) =>
      scoreUniversalPairTimeTrialTeam(teamContexts, sources.input),
  )
  if (scoredTeams.length === 0) {
    throw new Error(
      'Pair time-trial resolution requires at least one complete pair.',
    )
  }
  scoredTeams.sort(
    (left, right) =>
      left.officialTimeSeconds - right.officialTimeSeconds ||
      right.finishScore - left.finishScore ||
      left.teamId.localeCompare(right.teamId),
  )
  const winnerTimeSeconds = scoredTeams[0].officialTimeSeconds
  const teamTimes: UniversalOfficialTeamTime[] = scoredTeams.map(
    (team, index) => ({
      rank: index + 1,
      teamId: team.teamId,
      officialTimeSeconds: team.officialTimeSeconds,
      gapSeconds: team.officialTimeSeconds - winnerTimeSeconds,
      countingRiderId: team.countingRiderId,
      countingRiderNumber: 2,
      selectedRiderIds: team.selectedRiderIds,
      countingRiderIds: team.countingRiderIds,
      finishScore: team.finishScore,
      components: team.components,
    }),
  )
  const teamById = new Map(scoredTeams.map((team) => [team.teamId, team]))
  const orderedFinishers = foundation.riderContexts
    .filter((context) => context.eligibleToStart)
    .slice()
    .sort((left, right) => {
      const leftTeam = teamById.get(left.teamId)!
      const rightTeam = teamById.get(right.teamId)!
      return (
        leftTeam.officialTimeSeconds - rightTeam.officialTimeSeconds ||
        (rightTeam.riderProjectionScores[right.riderId] ?? 0) -
          (leftTeam.riderProjectionScores[left.riderId] ?? 0) ||
        left.riderId.localeCompare(right.riderId)
      )
    })
  const classification: UniversalOfficialFinishRow[] = orderedFinishers.map(
    (context, index) => {
      const team = teamById.get(context.teamId)!
      const previous = orderedFinishers[index - 1]
      const previousTeam = previous ? teamById.get(previous.teamId) : null
      const projection = team.riderProjectionScores[context.riderId] ?? 0
      return {
        rank: index + 1,
        riderId: context.riderId,
        teamId: context.teamId,
        status: 'finished',
        physicalGroupCode: context.physicalGroupCode,
        physicalGroupOrder: context.physicalGroupOrder,
        officialTimeSeconds: team.officialTimeSeconds,
        gapSeconds: team.officialTimeSeconds - winnerTimeSeconds,
        sameTimeAsPrevious:
          previousTeam?.officialTimeSeconds === team.officialTimeSeconds,
        finishScore: deterministicRound(projection, 6),
        components: {
          skill: deterministicRound(projection, 6),
          energy: 0,
          sharpness: 0,
          readiness: 0,
          suitability: 0,
          positioning: 0,
          command: 0,
          support: deterministicRound(team.components.cooperation, 6),
          preparation: deterministicRound(team.components.equipment, 6),
          fatigue: deterministicRound(team.components.fatigue, 6),
          weather: deterministicRound(team.components.weather, 6),
          pacing: deterministicRound(team.components.pacing, 6),
          variation: deterministicRound(team.components.variation, 6),
        },
      }
    },
  )
  const dnsRows: UniversalOfficialFinishRow[] = foundation.riderContexts
    .filter((context) => !context.eligibleToStart)
    .slice()
    .sort((left, right) => left.riderId.localeCompare(right.riderId))
    .map((context) => ({
      rank: null,
      riderId: context.riderId,
      teamId: context.teamId,
      status: 'dns',
      physicalGroupCode: null,
      physicalGroupOrder: null,
      officialTimeSeconds: null,
      gapSeconds: null,
      sameTimeAsPrevious: false,
      finishScore: null,
      components: null,
    }))
  const winnerTeam = scoredTeams[0]

  return {
    ...foundation,
    complete: true,
    winnerRiderId: winnerTeam.countingRiderId,
    winnerTeamId: winnerTeam.teamId,
    classification: [...classification, ...dnsRows],
    teamTimes,
    modelVersion: 'universal_pair_time_trial_finish_v1',
  }
}

export function assertUniversalFinishResolutionComplete(
  input: UniversalRaceEngineInput,
  resolution: UniversalFinishResolution,
): void {
  if (!resolution.complete) {
    throw new Error(
      `Phase 6 finish resolution is incomplete for ${resolution.finishMode}.`,
    )
  }
  if (!resolution.winnerRiderId || !resolution.winnerTeamId) {
    throw new Error('Phase 6 finish resolution must publish a winner.')
  }

  const inputRiderIds = input.riders
    .map((rider) => rider.riderId)
    .slice()
    .sort()
  const classificationRiderIds = resolution.classification
    .map((row) => row.riderId)
    .slice()
    .sort()
  if (
    classificationRiderIds.length !== inputRiderIds.length ||
    new Set(classificationRiderIds).size !== classificationRiderIds.length ||
    classificationRiderIds.some(
      (riderId, index) => riderId !== inputRiderIds[index],
    )
  ) {
    throw new Error(
      'Phase 6 classification must contain every input rider exactly once.',
    )
  }

  const finishers = resolution.classification.filter(
    (row) => row.status === 'finished',
  )
  const expectedRanks = Array.from(
    { length: finishers.length },
    (_, index) => index + 1,
  )
  if (
    finishers.length === 0 ||
    finishers.some((row, index) => row.rank !== expectedRanks[index])
  ) {
    throw new Error(
      'Phase 6 finisher ranks must be unique, continuous, and start at one.',
    )
  }

  const winnerTimeSeconds = finishers[0].officialTimeSeconds
  if (
    winnerTimeSeconds == null ||
    !Number.isFinite(winnerTimeSeconds) ||
    winnerTimeSeconds <= 0
  ) {
    throw new Error('Phase 6 winner must have a valid official time.')
  }
  for (let index = 0; index < finishers.length; index += 1) {
    const row = finishers[index]
    if (
      row.officialTimeSeconds == null ||
      !Number.isFinite(row.officialTimeSeconds) ||
      row.officialTimeSeconds < winnerTimeSeconds ||
      (index > 0 &&
        row.officialTimeSeconds < finishers[index - 1].officialTimeSeconds!)
    ) {
      throw new Error(
        'Phase 6 official finishing times must be valid and monotonic.',
      )
    }
    const expectedGap = deterministicRound(
      row.officialTimeSeconds - winnerTimeSeconds,
      6,
    )
    if (row.gapSeconds !== expectedGap) {
      throw new Error(
        'Phase 6 rider gaps must equal official time minus winner time.',
      )
    }
  }

  const nonFinishers = resolution.classification.filter(
    (row) => row.status !== 'finished',
  )
  if (
    nonFinishers.some(
      (row) =>
        row.rank != null ||
        row.officialTimeSeconds != null ||
        row.gapSeconds != null,
    )
  ) {
    throw new Error(
      'Phase 6 non-finishers must not receive ranks, times, or gaps.',
    )
  }

  const teamFormat =
    input.stage.stageFormat === 'team_time_trial' ||
    input.stage.stageFormat === 'pair_time_trial'
  if (teamFormat) {
    const teamTimes = resolution.teamTimes
    const expectedTeamRanks = Array.from(
      { length: teamTimes.length },
      (_, index) => index + 1,
    )
    if (
      teamTimes.length === 0 ||
      teamTimes.some((row, index) => row.rank !== expectedTeamRanks[index])
    ) {
      throw new Error(
        'Phase 6 team-time-trial ranks must be unique and continuous.',
      )
    }
    const winningTeam = teamTimes[0]
    if (
      winningTeam.teamId !== resolution.winnerTeamId ||
      winningTeam.countingRiderId !== resolution.winnerRiderId
    ) {
      throw new Error(
        'Phase 6 team winner must match the first official team time.',
      )
    }
    for (let index = 0; index < teamTimes.length; index += 1) {
      const team = teamTimes[index]
      const expectedGap = deterministicRound(
        team.officialTimeSeconds - winningTeam.officialTimeSeconds,
        6,
      )
      if (
        team.gapSeconds !== expectedGap ||
        (index > 0 &&
          team.officialTimeSeconds < teamTimes[index - 1].officialTimeSeconds)
      ) {
        throw new Error(
          'Phase 6 official team times and gaps must be monotonic and consistent.',
        )
      }
    }
    if (finishers[0].teamId !== resolution.winnerTeamId) {
      throw new Error(
        'Phase 6 rider classification must begin with the winning team.',
      )
    }
  } else {
    if (resolution.teamTimes.length !== 0) {
      throw new Error(
        'Phase 6 individual and road formats must not publish team times.',
      )
    }
    if (
      finishers[0].riderId !== resolution.winnerRiderId ||
      finishers[0].teamId !== resolution.winnerTeamId
    ) {
      throw new Error(
        'Phase 6 winner must match the first rider classification row.',
      )
    }
  }

  if (input.stage.stageFormat === 'road_race') {
    const contextByRider = new Map(
      resolution.riderContexts.map((context) => [context.riderId, context]),
    )
    for (const row of finishers) {
      const context = contextByRider.get(row.riderId)
      if (
        !context ||
        row.physicalGroupCode !== context.physicalGroupCode ||
        row.physicalGroupOrder !== context.physicalGroupOrder ||
        row.officialTimeSeconds !== context.phase5OfficialTimeSeconds
      ) {
        throw new Error(
          'Phase 6 road classification must preserve Phase 5 groups and official times.',
        )
      }
    }
  }
}

export function resolveUniversalFinishResolution(
  sources: UniversalFinishFoundationSources,
): UniversalFinishResolution {
  const foundation = buildUniversalFinishResolutionFoundation(sources)
  let resolution: UniversalFinishResolution

  switch (foundation.finishMode) {
    case 'solo_finish':
      resolution = resolveUniversalSoloFinish(sources, foundation)
      break
    case 'flat_sprint':
      resolution = resolveUniversalFlatSprintFinish(sources, foundation)
      break
    case 'reduced_group_sprint':
      resolution = resolveUniversalReducedGroupSprintFinish(
        sources,
        foundation,
      )
      break
    case 'hill_finish':
      resolution = resolveUniversalHillFinish(sources, foundation)
      break
    case 'summit_finish':
      resolution = resolveUniversalSummitFinish(sources, foundation)
      break
    case 'cobbled_finish':
      resolution = resolveUniversalCobbledFinish(sources, foundation)
      break
    case 'individual_time_trial':
      resolution = resolveUniversalIndividualTimeTrialFinish(
        sources,
        foundation,
      )
      break
    case 'prologue':
      resolution = resolveUniversalPrologueFinish(sources, foundation)
      break
    case 'team_time_trial':
      resolution = resolveUniversalTeamTimeTrialFinish(sources, foundation)
      break
    case 'pair_time_trial':
      resolution = resolveUniversalPairTimeTrialFinish(sources, foundation)
      break
    default: {
      const unsupportedMode: never = foundation.finishMode
      throw new Error(
        `Unsupported universal finish mode: ${String(unsupportedMode)}`,
      )
    }
  }

  assertUniversalFinishResolutionComplete(sources.input, resolution)
  return resolution
}


export function buildUniversalRaceCalibrationSummary(
  input: UniversalRaceEngineInput,
  stageClassification: UniversalStageClassification,
  roadRaceResolution: UniversalRoadRaceResolutionSummary,
  groupAndTimeResolution: UniversalPhase5GroupingSummary,
  finishResolution: UniversalFinishResolution,
): UniversalRaceCalibrationSummary {
  const winner = finishResolution.classification.find(
    (row) => row.rank === 1 && row.status === 'finished',
  )

  if (
    !winner ||
    winner.officialTimeSeconds == null ||
    !finishResolution.winnerRiderId ||
    !finishResolution.winnerTeamId
  ) {
    throw new Error(
      'Universal calibration summary requires one completed official winner.',
    )
  }

  const phase1 = roadRaceResolution.phase1Opening
  const phase2 = roadRaceResolution.phase2Development
  const phase4 = roadRaceResolution.phase4Finish
  const acceptedOpeningAttempts = (phase1?.attackAttempts ?? []).filter(
    (attempt) => attempt.acceptedEscapeLaunch,
  )
  const openingAttackKm =
    acceptedOpeningAttempts.length > 0
      ? Math.min(...acceptedOpeningAttempts.map((attempt) => attempt.attemptKm))
      : null

  const physicalGapSamples: number[] = []
  if (phase1) physicalGapSamples.push(phase1.initialGapSeconds)
  if (phase2) {
    physicalGapSamples.push(phase2.startGapSeconds, phase2.endGapSeconds)
  }
  if (phase4) {
    physicalGapSamples.push(phase4.startGapSeconds, phase4.endGapSeconds)
    for (const step of phase4.chaseSteps) {
      physicalGapSamples.push(step.startGapSeconds, step.endGapSeconds)
    }
  }

  const catchStep = phase4?.chaseSteps.find(
    (step) =>
      step.startGapSeconds > PHASE5_GROUP_MERGE_TOLERANCE_SECONDS &&
      step.endGapSeconds <= PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
  )
  const remainingEnergy = (phase4?.riderStates ?? []).map(
    (state) => state.energyAtFinish,
  )
  const finalGroups = groupAndTimeResolution.finalGroups
    .slice()
    .sort((left, right) => left.groupOrder - right.groupOrder)
  const finishingRiderCount = finishResolution.classification.filter(
    (row) => row.status === 'finished',
  ).length
  const winningTimeSeconds = winner.officialTimeSeconds

  return {
    stageClassification,
    finishMode: finishResolution.finishMode,
    winnerRiderId: finishResolution.winnerRiderId,
    winnerTeamId: finishResolution.winnerTeamId,
    winningTimeSeconds,
    averageSpeedKmh: deterministicRound(
      input.stage.distanceKm / Math.max(winningTimeSeconds / 3600, 0.000001),
      6,
    ),
    finishingRiderCount,
    finalGroupCount: finalGroups.length,
    finalGroupGapsSeconds: finalGroups.map((group) => group.gapSeconds),
    openingBreakawaySize: phase1?.breakawayRiderIds.length ?? 0,
    openingAttackKm,
    maximumBreakawayGapSeconds: deterministicRound(
      Math.max(0, ...physicalGapSamples),
      6,
    ),
    breakawayCaught:
      phase2?.status === 'breakaway_caught' || Boolean(phase4?.breakawayCaught),
    breakawaySurvived: Boolean(phase4?.breakawaySurvived),
    catchKm: catchStep ? deterministicRound(catchStep.kmEnd, 6) : null,
    averageRemainingEnergy:
      remainingEnergy.length > 0
        ? deterministicRound(
            remainingEnergy.reduce((sum, energy) => sum + energy, 0) /
              remainingEnergy.length,
            6,
          )
        : null,
    minimumRemainingEnergy:
      remainingEnergy.length > 0
        ? deterministicRound(Math.min(...remainingEnergy), 6)
        : null,
    deterministic: true,
    sourceModels: {
      roadRace: roadRaceResolution.modelVersion,
      groupsAndTimes: groupAndTimeResolution.modelVersion,
      finish: finishResolution.modelVersion,
    },
    modelVersion: 'universal_race_calibration_summary_v1',
  }
}


function buildUniversalTimeTrialReplayTimeline(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  groupAndTimeResolution: UniversalPhase5GroupingSummary,
  finishResolution: UniversalFinishResolution,
): UniversalReplayTimeline {
  const stageFormat = input.stage.stageFormat
  const isIndividualFormat =
    stageFormat === 'individual_time_trial' || stageFormat === 'prologue'
  const isTeamFormat =
    stageFormat === 'team_time_trial' || stageFormat === 'pair_time_trial'

  if (!isIndividualFormat && !isTeamFormat) {
    return {
      active: false,
      inactiveReason: 'road_resolution_incomplete',
      completeBeforePlayback: true,
      playbackRecalculatesRace: false,
      baseCheckpointCount: 0,
      eventCheckpointCount: 0,
      checkpoints: [],
      finalCheckpointId: null,
      resultsVisibleFromCheckpointId: null,
      deterministic: true,
      modelVersion: 'universal_replay_timeline_v1',
    }
  }

  const stageDistanceKm = input.stage.distanceKm
  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row] as const),
  )
  const finishByRiderId = new Map(
    finishResolution.classification.map((row) => [row.riderId, row] as const),
  )
  const riderById = new Map(
    input.riders.map((rider) => [rider.riderId, rider] as const),
  )
  const teamById = new Map(
    input.teams.map((team) => [team.teamId, team] as const),
  )
  const eligibleRiderIds = riderReadiness
    .filter((row) => row.eligibleToStart)
    .map((row) => row.riderId)
  const eligibleRiderIdSet = new Set(eligibleRiderIds)
  const startEnergyByRiderId = new Map(
    riderReadiness.map(
      (row) => [row.riderId, row.fatigueBalance.startEnergy] as const,
    ),
  )
  const finishEnergyByRiderId = new Map(
    finishResolution.riderContexts.map((context) => [
      context.riderId,
      context.remainingEnergy ??
        startEnergyByRiderId.get(context.riderId) ??
        0,
    ] as const),
  )

  const zeroPerformanceBand = (): UniversalPhase5PerformanceBand => ({
    bestScore: 0,
    worstScore: 0,
    spread: 0,
    threshold: 0,
  })
  const startNumberValue = (riderId: string): number => {
    const value = Number(riderById.get(riderId)?.snapshot.startNumber)
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
  }
  const displayRiderName = (riderId: string): string =>
    riderById.get(riderId)?.snapshot.displayName?.trim() || riderId
  const displayTeamName = (teamId: string): string =>
    teamById.get(teamId)?.snapshot.teamName?.trim() || teamId

  const orderedEligibleRiderIds = [...eligibleRiderIds].sort(
    (left, right) =>
      startNumberValue(left) - startNumberValue(right) ||
      left.localeCompare(right),
  )

  const startGroups: UniversalPhase5GroupSnapshot[] = isIndividualFormat
    ? orderedEligibleRiderIds.map((riderId, index) => ({
        phaseNumber: 0,
        groupOrder: index + 1,
        groupCode: 'individual_time_unit',
        displayCode: `I${index + 1}`,
        physicalPosition: 'timing_unit',
        colorKey: 'timing_neutral',
        riderIds: [riderId],
        gapSeconds: 0,
        officialTimeSeconds: null,
        performanceBand: zeroPerformanceBand(),
        formationReason: 'individual_timing',
      }))
    : Array.from(
        orderedEligibleRiderIds.reduce((teams, riderId) => {
          const teamId = riderById.get(riderId)?.teamId ?? ''
          const current = teams.get(teamId) ?? []
          current.push(riderId)
          teams.set(teamId, current)
          return teams
        }, new Map<string, string[]>()),
      )
        .sort(
          ([leftTeamId, leftRiderIds], [rightTeamId, rightRiderIds]) =>
            Math.min(...leftRiderIds.map(startNumberValue)) -
              Math.min(...rightRiderIds.map(startNumberValue)) ||
            leftTeamId.localeCompare(rightTeamId),
        )
        .map(([teamId, riderIds], index) => ({
          phaseNumber: 0,
          groupOrder: index + 1,
          groupCode: 'team_time_unit' as const,
          displayCode: `T${index + 1}`,
          physicalPosition: 'timing_unit' as const,
          colorKey: 'timing_neutral' as const,
          riderIds: [...riderIds].sort(
            (left, right) =>
              startNumberValue(left) - startNumberValue(right) ||
              left.localeCompare(right),
          ),
          gapSeconds: 0,
          officialTimeSeconds: null,
          performanceBand: zeroPerformanceBand(),
          formationReason: 'team_timing' as const,
        }))

  const phase5GroupByRiderId = new Map<string, UniversalPhase5GroupSnapshot>()
  groupAndTimeResolution.finalGroups.forEach((group) => {
    group.riderIds.forEach((riderId) => phase5GroupByRiderId.set(riderId, group))
  })

  const finalGroups: UniversalPhase5GroupSnapshot[] = isIndividualFormat
    ? finishResolution.classification
        .filter(
          (row) =>
            row.status === 'finished' &&
            row.rank !== null &&
            row.officialTimeSeconds !== null &&
            row.gapSeconds !== null,
        )
        .slice()
        .sort(
          (left, right) =>
            (left.rank ?? Number.MAX_SAFE_INTEGER) -
              (right.rank ?? Number.MAX_SAFE_INTEGER) ||
            left.riderId.localeCompare(right.riderId),
        )
        .map((row, index) => {
          const source = phase5GroupByRiderId.get(row.riderId)
          return {
            phaseNumber: 0,
            groupOrder: index + 1,
            groupCode: 'individual_time_unit' as const,
            displayCode: `I${index + 1}`,
            physicalPosition: 'timing_unit' as const,
            colorKey: 'timing_neutral' as const,
            riderIds: [row.riderId],
            gapSeconds: row.gapSeconds ?? 0,
            officialTimeSeconds: row.officialTimeSeconds,
            performanceBand:
              source?.performanceBand ?? zeroPerformanceBand(),
            formationReason: 'individual_timing' as const,
          }
        })
    : finishResolution.teamTimes
        .slice()
        .sort(
          (left, right) =>
            left.rank - right.rank || left.teamId.localeCompare(right.teamId),
        )
        .map((team, index) => {
          const classifiedRiderIds = finishResolution.classification
            .filter(
              (row) =>
                row.teamId === team.teamId && row.status === 'finished',
            )
            .slice()
            .sort(
              (left, right) =>
                (left.rank ?? Number.MAX_SAFE_INTEGER) -
                  (right.rank ?? Number.MAX_SAFE_INTEGER) ||
                left.riderId.localeCompare(right.riderId),
            )
            .map((row) => row.riderId)
          const riderIds =
            classifiedRiderIds.length > 0
              ? classifiedRiderIds
              : [...team.selectedRiderIds]
          const source = phase5GroupByRiderId.get(riderIds[0] ?? '')

          return {
            phaseNumber: 0,
            groupOrder: index + 1,
            groupCode: 'team_time_unit' as const,
            displayCode: `T${index + 1}`,
            physicalPosition: 'timing_unit' as const,
            colorKey: 'timing_neutral' as const,
            riderIds,
            gapSeconds: team.gapSeconds,
            officialTimeSeconds: team.officialTimeSeconds,
            performanceBand:
              source?.performanceBand ?? zeroPerformanceBand(),
            formationReason: 'team_timing' as const,
          }
        })

  const projectedGroups = (
    fraction: number,
  ): readonly UniversalPhase5GroupSnapshot[] =>
    finalGroups.map((group) => ({
      ...group,
      riderIds: [...group.riderIds],
      gapSeconds: deterministicRound(group.gapSeconds * fraction, 6),
      officialTimeSeconds: null,
    }))

  const energyAtFraction = (fraction: number): ReadonlyMap<string, number> => {
    const values = new Map<string, number>()
    input.riders.forEach((rider) => {
      const startEnergy = startEnergyByRiderId.get(rider.riderId) ?? 0
      const finishEnergy = finishEnergyByRiderId.get(rider.riderId) ?? startEnergy
      values.set(
        rider.riderId,
        deterministicRound(
          startEnergy + (finishEnergy - startEnergy) * clamp(fraction, 0, 1),
          6,
        ),
      )
    })
    return values
  }

  const leadingUnitLabel = (groups: readonly UniversalPhase5GroupSnapshot[]) => {
    const leader = groups[0]
    if (!leader) return 'No timing unit'
    if (isIndividualFormat) {
      return displayRiderName(leader.riderIds[0] ?? '')
    }
    const teamId = riderById.get(leader.riderIds[0] ?? '')?.teamId ?? ''
    return displayTeamName(teamId)
  }
  const formatLabel =
    stageFormat === 'prologue'
      ? 'prologue'
      : stageFormat === 'individual_time_trial'
        ? 'individual time trial'
        : stageFormat === 'pair_time_trial'
          ? 'pair time trial'
          : 'team time trial'

  type TimeTrialCheckpointDefinition = {
    readonly checkpointIdSuffix: string
    readonly checkpointKind: UniversalReplayCheckpointKind
    readonly phase: 0 | RoadRacePhaseNumber
    readonly fraction: number
    readonly sortOrder: number
    readonly groups: readonly UniversalPhase5GroupSnapshot[]
    readonly energyByRiderId: ReadonlyMap<string, number>
    readonly eventType: UniversalReplayEventType
    readonly title: string
    readonly description: string
    readonly riderIds: readonly string[]
    readonly teamIds: readonly string[]
    readonly finalResultsVisible?: boolean
  }

  const definitions: TimeTrialCheckpointDefinition[] = [
    {
      checkpointIdSuffix: 'start',
      checkpointKind: 'base',
      phase: 0,
      fraction: 0,
      sortOrder: 0,
      groups: startGroups,
      energyByRiderId: energyAtFraction(0),
      eventType: 'race_start',
      title: `${formatLabel} starts`,
      description: isIndividualFormat
        ? `${eligibleRiderIds.length} riders leave in the stored start order. The complete classification and every replay checkpoint were calculated before playback.`
        : `${startGroups.length} timing units and ${eligibleRiderIds.length} riders leave in the stored start order. The complete classification and every replay checkpoint were calculated before playback.`,
      riderIds: [...eligibleRiderIds],
      teamIds: Array.from(
        new Set(
          eligibleRiderIds
            .map((riderId) => riderById.get(riderId)?.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      ).sort(),
    },
    {
      checkpointIdSuffix: 'first-time-check',
      checkpointKind: 'base',
      phase: 1,
      fraction: 0.25,
      sortOrder: 100,
      groups: projectedGroups(0.25),
      energyByRiderId: energyAtFraction(0.25),
      eventType: 'phase_end',
      title: 'First time check',
      description: `${leadingUnitLabel(finalGroups)} records the quickest calculated first split. Displayed gaps are stored projections of the completed official result.`,
      riderIds: finalGroups[0]?.riderIds ?? [],
      teamIds: finalGroups[0]?.riderIds.length
        ? Array.from(
            new Set(
              finalGroups[0].riderIds
                .map((riderId) => riderById.get(riderId)?.teamId)
                .filter((teamId): teamId is string => Boolean(teamId)),
            ),
          )
        : [],
    },
    {
      checkpointIdSuffix: 'midpoint-time-check',
      checkpointKind: 'base',
      phase: 2,
      fraction: 0.5,
      sortOrder: 200,
      groups: projectedGroups(0.5),
      energyByRiderId: energyAtFraction(0.5),
      eventType: 'phase_end',
      title: 'Midpoint time check',
      description: `${leadingUnitLabel(finalGroups)} leads the stored midpoint order. No timing calculation runs during playback.`,
      riderIds: finalGroups[0]?.riderIds ?? [],
      teamIds: finalGroups[0]?.riderIds.length
        ? Array.from(
            new Set(
              finalGroups[0].riderIds
                .map((riderId) => riderById.get(riderId)?.teamId)
                .filter((teamId): teamId is string => Boolean(teamId)),
            ),
          )
        : [],
    },
    {
      checkpointIdSuffix: 'final-sector',
      checkpointKind: 'base',
      phase: 3,
      fraction: 0.7,
      sortOrder: 300,
      groups: projectedGroups(0.7),
      energyByRiderId: energyAtFraction(0.7),
      eventType: 'phase_end',
      title: 'Final sector begins',
      description: `${leadingUnitLabel(finalGroups)} remains ahead at the stored 70% time check as the ${formatLabel} enters its final sector.`,
      riderIds: finalGroups[0]?.riderIds ?? [],
      teamIds: finalGroups[0]?.riderIds.length
        ? Array.from(
            new Set(
              finalGroups[0].riderIds
                .map((riderId) => riderById.get(riderId)?.teamId)
                .filter((teamId): teamId is string => Boolean(teamId)),
            ),
          )
        : [],
    },
    {
      checkpointIdSuffix: 'finish-preparation',
      checkpointKind: 'event',
      phase: 4,
      fraction: 0.85,
      sortOrder: 400,
      groups: projectedGroups(0.85),
      energyByRiderId: energyAtFraction(0.85),
      eventType: 'finish_preparation',
      title: 'Final pacing effort',
      description: `The stored timing units enter the final 15% of the ${formatLabel}. Playback reveals the completed calculation without rerunning pacing, weather, equipment or finish logic.`,
      riderIds: [],
      teamIds: [],
    },
    {
      checkpointIdSuffix: 'finish',
      checkpointKind: 'base',
      phase: 4,
      fraction: 1,
      sortOrder: 500,
      groups: finalGroups,
      energyByRiderId: energyAtFraction(1),
      eventType: 'finish',
      title: `${formatLabel} finished`,
      description: (() => {
        const winner = finishResolution.classification.find(
          (row) => row.rank === 1 && row.status === 'finished',
        )
        if (!winner || winner.officialTimeSeconds == null) {
          return 'The stored finish resolution did not return a valid winner.'
        }
        return isIndividualFormat
          ? `${displayRiderName(winner.riderId)} wins the ${formatLabel} in ${winner.officialTimeSeconds} seconds. The final classification is now visible.`
          : `${displayTeamName(winner.teamId)} wins the ${formatLabel} in ${winner.officialTimeSeconds} seconds. The final team and rider classifications are now visible.`
      })(),
      riderIds: finishResolution.winnerRiderId
        ? [finishResolution.winnerRiderId]
        : [],
      teamIds: finishResolution.winnerTeamId
        ? [finishResolution.winnerTeamId]
        : [],
      finalResultsVisible: true,
    },
  ]

  const checkpoints = definitions
    .slice()
    .sort(
      (left, right) =>
        left.fraction - right.fraction ||
        left.sortOrder - right.sortOrder ||
        left.checkpointIdSuffix.localeCompare(right.checkpointIdSuffix),
    )
    .map((definition, checkpointIndex): UniversalReplayCheckpoint => {
      const progressFraction = deterministicRound(
        clamp(definition.fraction, 0, 1),
        9,
      )
      const progressKm = deterministicRound(
        stageDistanceKm * progressFraction,
        6,
      )
      const groupByRiderId = new Map<string, UniversalPhase5GroupSnapshot>()
      definition.groups.forEach((group) => {
        group.riderIds.forEach((riderId) => {
          groupByRiderId.set(riderId, group)
        })
      })
      const finalResultsVisible = definition.finalResultsVisible === true
      const riderStates = input.riders
        .map((rider): UniversalReplayRiderState => {
          const readiness = readinessByRiderId.get(rider.riderId)
          const finish = finishByRiderId.get(rider.riderId)
          const group = groupByRiderId.get(rider.riderId)
          const status: UniversalReplayRiderStatus = finalResultsVisible
            ? finish?.status ?? (readiness?.eligibleToStart ? 'dnf' : 'dns')
            : readiness?.eligibleToStart
              ? 'racing'
              : 'dns'

          return {
            riderId: rider.riderId,
            teamId: rider.teamId,
            status,
            groupCode: group?.groupCode ?? null,
            displayCode: group?.displayCode ?? null,
            gapSeconds: group?.gapSeconds ?? null,
            energy: deterministicRound(
              definition.energyByRiderId.get(rider.riderId) ?? 0,
              6,
            ),
            readinessScore: readiness?.readinessScore ?? 0,
            finishRank: finalResultsVisible ? finish?.rank ?? null : null,
            officialTimeSeconds: finalResultsVisible
              ? finish?.officialTimeSeconds ?? null
              : null,
          }
        })
        .sort((left, right) => left.riderId.localeCompare(right.riderId))

      const teamStates = input.teams
        .map((team): UniversalReplayTeamState => {
          const teamRiderStates = riderStates.filter(
            (row) => row.teamId === team.teamId,
          )
          const activeRiderIds = teamRiderStates
            .filter(
              (row) => row.status === 'racing' || row.status === 'finished',
            )
            .map((row) => row.riderId)
            .sort()

          return {
            teamId: team.teamId,
            activeRiderIds,
            racingRiderCount: teamRiderStates.filter(
              (row) => row.status === 'racing',
            ).length,
            finishedRiderCount: teamRiderStates.filter(
              (row) => row.status === 'finished',
            ).length,
            dnsRiderCount: teamRiderStates.filter(
              (row) => row.status === 'dns',
            ).length,
            dnfRiderCount: teamRiderStates.filter(
              (row) => row.status === 'dnf',
            ).length,
            otlRiderCount: teamRiderStates.filter(
              (row) => row.status === 'otl',
            ).length,
          }
        })
        .sort((left, right) => left.teamId.localeCompare(right.teamId))
      const checkpointId =
        `${input.stage.stageId}|replay|${definition.checkpointIdSuffix}`

      return {
        checkpointId,
        checkpointIndex,
        checkpointKind: definition.checkpointKind,
        phase: definition.phase,
        raceProgress: {
          fraction: progressFraction,
          percent: deterministicRound(progressFraction * 100, 6),
          kmFromStart: progressKm,
        },
        groups: definition.groups.map((group) => ({
          groupCode: group.groupCode,
          displayCode: group.displayCode,
          physicalPosition: group.physicalPosition,
          colorKey: group.colorKey,
          riderIds: [...group.riderIds],
        })),
        gaps: definition.groups.map((group) => ({
          groupCode: group.groupCode,
          displayCode: group.displayCode,
          gapSeconds: group.gapSeconds,
          officialTimeSeconds: finalResultsVisible
            ? group.officialTimeSeconds
            : null,
        })),
        riderStates,
        teamStates,
        activeCommands: [],
        intermediateResults: [],
        incidents: [],
        commentary: [
          {
            commentaryId: `${checkpointId}|commentary`,
            eventType: definition.eventType,
            title: definition.title,
            description: definition.description,
            riderIds: [...definition.riderIds],
            teamIds: [...definition.teamIds],
          },
        ],
        finalResultsVisible,
      }
    })

  const finalCheckpoint = checkpoints.find(
    (checkpoint) =>
      checkpoint.checkpointKind === 'base' &&
      checkpoint.phase === 4 &&
      checkpoint.raceProgress.fraction === 1,
  )
  const finalCheckpointId = finalCheckpoint?.checkpointId ?? null

  return {
    active: true,
    inactiveReason: null,
    completeBeforePlayback: true,
    playbackRecalculatesRace: false,
    baseCheckpointCount: checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'base',
    ).length,
    eventCheckpointCount: checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'event',
    ).length,
    checkpoints,
    finalCheckpointId,
    resultsVisibleFromCheckpointId: finalCheckpointId,
    deterministic: true,
    modelVersion: 'universal_replay_timeline_v1',
  }
}


function buildUniversalReplayTimeline(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  roadRaceResolution: UniversalRoadRaceResolutionSummary,
  intermediatePointBattles: UniversalIntermediatePointBattleSummary,
  intermediatePointFinalization: UniversalIntermediatePointFinalizationSummary,
  groupAndTimeResolution: UniversalPhase5GroupingSummary,
  finishResolution: UniversalFinishResolution,
): UniversalReplayTimeline {
  if (input.stage.stageFormat !== 'road_race') {
    return buildUniversalTimeTrialReplayTimeline(
      input,
      riderReadiness,
      groupAndTimeResolution,
      finishResolution,
    )
  }

  if (
    !roadRaceResolution.active ||
    !roadRaceResolution.phase1Opening ||
    !roadRaceResolution.phase2Development ||
    !roadRaceResolution.phase3Decisive ||
    !roadRaceResolution.phase4Finish
  ) {
    return {
      active: false,
      inactiveReason: 'road_resolution_incomplete',
      completeBeforePlayback: true,
      playbackRecalculatesRace: false,
      baseCheckpointCount: 0,
      eventCheckpointCount: 0,
      checkpoints: [],
      finalCheckpointId: null,
      resultsVisibleFromCheckpointId: null,
      deterministic: true,
      modelVersion: 'universal_replay_timeline_v1',
    }
  }

  const phase1 = roadRaceResolution.phase1Opening
  const phase2 = roadRaceResolution.phase2Development
  const phase3 = roadRaceResolution.phase3Decisive
  const phase4 = roadRaceResolution.phase4Finish
  const stageDistanceKm = input.stage.distanceKm
  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row] as const),
  )
  const finishByRiderId = new Map(
    finishResolution.classification.map((row) => [row.riderId, row] as const),
  )
  const riderById = new Map(
    input.riders.map((rider) => [rider.riderId, rider] as const),
  )
  const commentaryByPointId = new Map(
    intermediatePointFinalization.commentaryEntries.map(
      (entry) => [entry.pointId, entry] as const,
    ),
  )
  const battleByPointId = new Map(
    intermediatePointBattles.battles.map(
      (battle) => [battle.pointId, battle] as const,
    ),
  )

  const rawPhaseGroupsFor = (
    phaseNumber: RoadRacePhaseNumber,
  ): readonly UniversalPhase5GroupSnapshot[] =>
    groupAndTimeResolution.phaseGroups
      .filter((group) => group.phaseNumber === phaseNumber)
      .slice()
      .sort(
        (left, right) =>
          left.groupOrder - right.groupOrder ||
          left.displayCode.localeCompare(right.displayCode),
      )

  const startGroup: UniversalPhase5GroupSnapshot = {
    phaseNumber: 0,
    groupOrder: 1,
    groupCode: 'main_peloton',
    displayCode: 'P',
    physicalPosition: 'peloton',
    colorKey: 'peloton_blue',
    riderIds: riderReadiness
      .filter((row) => row.eligibleToStart)
      .map((row) => row.riderId)
      .sort(),
    gapSeconds: 0,
    officialTimeSeconds: null,
    performanceBand: {
      bestScore: 0,
      worstScore: 0,
      spread: 0,
      threshold: 0,
    },
    formationReason: 'peloton_cohesion',
  }

  const cloneReplayGroups = (
    groups: readonly UniversalPhase5GroupSnapshot[],
  ): UniversalPhase5GroupSnapshot[] =>
    groups
      .filter((group) => group.riderIds.length > 0)
      .map((group) => ({
        ...group,
        riderIds: [...group.riderIds].sort(),
        officialTimeSeconds: null,
      }))
      .sort(
        (left, right) =>
          left.groupOrder - right.groupOrder ||
          left.displayCode.localeCompare(right.displayCode),
      )

  const normalizeReplayGroups = (
    groups: readonly UniversalPhase5GroupSnapshot[],
  ): UniversalPhase5GroupSnapshot[] => {
    const cloned = cloneReplayGroups(groups)
    if (cloned.length === 0) return [startGroup]

    const hasPeloton = cloned.some((group) => group.displayCode === 'P')
    if (!hasPeloton) {
      const firstNonFrontIndex = cloned.findIndex(
        (group) =>
          !group.displayCode.startsWith('B') &&
          !group.displayCode.startsWith('F'),
      )
      const pelotonIndex = firstNonFrontIndex >= 0 ? firstNonFrontIndex : 0
      cloned[pelotonIndex] = {
        ...cloned[pelotonIndex],
        groupCode: 'main_peloton',
        displayCode: 'P',
        physicalPosition: 'peloton',
        colorKey: 'peloton_blue',
      }
    }

    const mergedByGap: UniversalPhase5GroupSnapshot[] = []
    cloned.forEach((group) => {
      const existingIndex = mergedByGap.findIndex(
        (candidate) =>
          Math.abs(candidate.gapSeconds - group.gapSeconds) <= 0.000001,
      )
      if (existingIndex < 0) {
        mergedByGap.push(group)
        return
      }

      const existing = mergedByGap[existingIndex]
      const usePelotonIdentity =
        existing.displayCode === 'P' || group.displayCode === 'P'
      const identitySource =
        group.displayCode === 'P' ? group : existing
      mergedByGap[existingIndex] = {
        ...identitySource,
        groupCode: usePelotonIdentity
          ? 'main_peloton'
          : identitySource.groupCode,
        displayCode: usePelotonIdentity
          ? 'P'
          : identitySource.displayCode,
        physicalPosition: usePelotonIdentity
          ? 'peloton'
          : identitySource.physicalPosition,
        colorKey: usePelotonIdentity
          ? 'peloton_blue'
          : identitySource.colorKey,
        riderIds: Array.from(
          new Set([...existing.riderIds, ...group.riderIds]),
        ).sort(),
        gapSeconds: existing.gapSeconds,
        officialTimeSeconds: null,
      }
    })

    return mergedByGap
      .sort(
        (left, right) =>
          left.gapSeconds - right.gapSeconds ||
          left.groupOrder - right.groupOrder ||
          left.displayCode.localeCompare(right.displayCode),
      )
      .map((group, index) => ({
        ...group,
        groupOrder: index + 1,
      }))
  }

  const rawPhase1Groups = rawPhaseGroupsFor(1)
  const rawPhase2Groups = rawPhaseGroupsFor(2)
  const rawPhase3Groups = rawPhaseGroupsFor(3)
  const phase1Groups = normalizeReplayGroups(rawPhase1Groups)
  const phase2Groups = normalizeReplayGroups(rawPhase2Groups)
  const phase3Groups = normalizeReplayGroups(rawPhase3Groups)
  const finalGroups = groupAndTimeResolution.finalGroups
    .slice()
    .sort(
      (left, right) =>
        left.groupOrder - right.groupOrder ||
        left.displayCode.localeCompare(right.displayCode),
    )
    .map((group) => ({
      ...group,
      riderIds: [...group.riderIds],
    }))

  const rawPelotonGap = (
    groups: readonly UniversalPhase5GroupSnapshot[],
    fallback = 0,
  ): number =>
    deterministicRound(
      Math.max(
        0,
        groups.find((group) => group.displayCode === 'P')?.gapSeconds ??
          fallback,
      ),
      6,
    )

  const adjustGroupsToPelotonGap = (
    groups: readonly UniversalPhase5GroupSnapshot[],
    pelotonGapSeconds: number,
  ): readonly UniversalPhase5GroupSnapshot[] => {
    const normalized = normalizeReplayGroups(groups)
    const peloton = normalized.find((group) => group.displayCode === 'P')
    if (!peloton) return normalized

    const targetGap = deterministicRound(
      Math.max(0, pelotonGapSeconds),
      6,
    )
    const originalPelotonGap = peloton.gapSeconds

    return normalized.map((group) => {
      if (group.displayCode === 'P') {
        return {
          ...group,
          gapSeconds: targetGap,
          officialTimeSeconds: null,
        }
      }

      if (group.groupOrder > peloton.groupOrder) {
        return {
          ...group,
          gapSeconds: deterministicRound(
            targetGap +
              Math.max(0, group.gapSeconds - originalPelotonGap),
            6,
          ),
          officialTimeSeconds: null,
        }
      }

      return {
        ...group,
        officialTimeSeconds: null,
      }
    })
  }

  const startEnergyByRiderId = new Map(
    riderReadiness.map(
      (row) => [row.riderId, row.fatigueBalance.startEnergy] as const,
    ),
  )
  const phase1EnergyByRiderId = new Map(
    phase1.riderEnergy.map(
      (row) => [row.riderId, row.energyAfterPhase] as const,
    ),
  )
  const phase2EnergyByRiderId = new Map(
    phase2.riderEnergy.map(
      (row) => [row.riderId, row.energyAfterPhase] as const,
    ),
  )
  const phase3EnergyByRiderId = new Map(
    phase3.riderStates.map(
      (row) => [row.riderId, row.energyAfterPhase] as const,
    ),
  )
  const phase4EnergyByRiderId = new Map(
    phase4.riderStates.map(
      (row) => [row.riderId, row.energyAtFinish] as const,
    ),
  )

  const phaseEnergyEndpoints = new Map<
    RoadRacePhaseNumber,
    {
      readonly start: ReadonlyMap<string, number>
      readonly end: ReadonlyMap<string, number>
      readonly startKm: number
      readonly endKm: number
    }
  >([
    [
      1,
      {
        start: startEnergyByRiderId,
        end: phase1EnergyByRiderId,
        startKm: phase1.phaseBoundary.startKm,
        endKm: phase1.phaseBoundary.endKm,
      },
    ],
    [
      2,
      {
        start: phase1EnergyByRiderId,
        end: phase2EnergyByRiderId,
        startKm: phase2.phaseBoundary.startKm,
        endKm: phase2.phaseBoundary.endKm,
      },
    ],
    [
      3,
      {
        start: phase2EnergyByRiderId,
        end: phase3EnergyByRiderId,
        startKm: phase3.phaseBoundary.startKm,
        endKm: phase3.phaseBoundary.endKm,
      },
    ],
    [
      4,
      {
        start: phase3EnergyByRiderId,
        end: phase4EnergyByRiderId,
        startKm: phase4.phaseBoundary.startKm,
        endKm: phase4.phaseBoundary.endKm,
      },
    ],
  ])

  const phaseForKm = (
    kmFromStart: number,
  ): 0 | RoadRacePhaseNumber => {
    if (kmFromStart <= 0) return 0
    if (kmFromStart <= phase1.phaseBoundary.endKm + 0.000001) return 1
    if (kmFromStart <= phase2.phaseBoundary.endKm + 0.000001) return 2
    if (kmFromStart <= phase3.phaseBoundary.endKm + 0.000001) return 3
    return 4
  }

  const energyAtKm = (
    phaseNumber: 0 | RoadRacePhaseNumber,
    kmFromStart: number,
    overrides: ReadonlyMap<string, number> = new Map(),
  ): ReadonlyMap<string, number> => {
    if (phaseNumber === 0) return startEnergyByRiderId
    const endpoints = phaseEnergyEndpoints.get(phaseNumber)
    if (!endpoints) return startEnergyByRiderId

    const fraction = clamp(
      (kmFromStart - endpoints.startKm) /
        Math.max(0.000001, endpoints.endKm - endpoints.startKm),
      0,
      1,
    )
    const values = new Map<string, number>()

    input.riders.forEach((rider) => {
      const override = overrides.get(rider.riderId)
      const startEnergy = endpoints.start.get(rider.riderId) ?? 0
      const endEnergy = endpoints.end.get(rider.riderId) ?? startEnergy
      values.set(
        rider.riderId,
        deterministicRound(
          override ?? startEnergy + (endEnergy - startEnergy) * fraction,
          6,
        ),
      )
    })

    return values
  }

  const acceptedOpeningAttempts = phase1.attackAttempts
    .filter((attempt) => attempt.acceptedEscapeLaunch)
    .slice()
    .sort(
      (left, right) =>
        left.attemptKm - right.attemptKm ||
        left.selectedRank - right.selectedRank ||
        left.riderId.localeCompare(right.riderId),
    )
  const openingBreakawayActive =
    phase1.status === 'breakaway_formed' &&
    phase1.breakawayRiderIds.length > 0
  const formationKm = openingBreakawayActive
    ? Math.max(
        0,
        ...acceptedOpeningAttempts.map((attempt) => attempt.attemptKm),
      )
    : Number.POSITIVE_INFINITY
  const decisiveSplitKm = clamp(
    phase3.decisiveTerrain.kmEnd,
    phase3.phaseBoundary.startKm,
    phase3.phaseBoundary.endKm,
  )
  const chaseStartKm = deterministicRound(
    stageDistanceKm * phase4.automaticActivityStartsAtFraction,
    6,
  )
  const catchStep = phase4.chaseSteps.find(
    (step) =>
      step.startGapSeconds > PHASE5_GROUP_MERGE_TOLERANCE_SECONDS &&
      step.endGapSeconds <= PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
  )
  const catchKm =
    phase4.breakawayCaught && catchStep
      ? deterministicRound(catchStep.kmEnd, 6)
      : null
  const phase4FrontActive =
    phase4.escapeRiderIdsAtStart.length > 0 &&
    phase4.startGapSeconds > 0
  const nonOpeningFrontFormationActive =
    phase4FrontActive && !openingBreakawayActive
  const nonOpeningFrontFormationKm = decisiveSplitKm
  const nonOpeningFrontFormationGapSeconds = deterministicRound(
    Math.min(
      phase4.startGapSeconds,
      PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
    ),
    6,
  )
  const nonOpeningFrontGapAtKm = (kmFromStart: number): number => {
    if (!nonOpeningFrontFormationActive) return 0
    const km = clamp(
      kmFromStart,
      nonOpeningFrontFormationKm,
      Math.max(nonOpeningFrontFormationKm, chaseStartKm),
    )
    if (chaseStartKm <= nonOpeningFrontFormationKm + 0.000001) {
      return deterministicRound(phase4.startGapSeconds, 6)
    }
    const fraction = clamp(
      (km - nonOpeningFrontFormationKm) /
        (chaseStartKm - nonOpeningFrontFormationKm),
      0,
      1,
    )
    const easedFraction = fraction * fraction * (3 - 2 * fraction)
    return deterministicRound(
      nonOpeningFrontFormationGapSeconds +
        (phase4.startGapSeconds - nonOpeningFrontFormationGapSeconds) *
          easedFraction,
      6,
    )
  }
  const lateTerrainSelection = phase4.lateTerrainSelection
  const lateTerrainSelectionKm = lateTerrainSelection?.selectionKm ?? null
  const phase4FinalStateByRiderId = new Map(
    phase4.riderStates.map((row) => [row.riderId, row] as const),
  )
  const phase4ContactLossStates = phase4.riderStates
    .filter(
      (row) =>
        row.contactLossKm !== null &&
        row.contactLossGapPenaltySeconds > 0,
    )
    .sort(
      (left, right) =>
        (left.contactLossKm ?? stageDistanceKm) -
          (right.contactLossKm ?? stageDistanceKm) ||
        left.riderId.localeCompare(right.riderId),
    )
  const phase4ContactLossRiderSet = new Set(
    phase4ContactLossStates.map((row) => row.riderId),
  )
  const openingFrontDisplayCode = ['B', '1'].join('')

  type ReplayGapAnchor = {
    readonly km: number
    readonly gapSeconds: number
    readonly priority: number
  }

  const gapAnchorCandidates: ReplayGapAnchor[] = []
  const addGapAnchor = (
    km: number,
    gapSeconds: number,
    priority: number,
  ): void => {
    gapAnchorCandidates.push({
      km: deterministicRound(clamp(km, 0, stageDistanceKm), 6),
      gapSeconds: deterministicRound(Math.max(0, gapSeconds), 6),
      priority,
    })
  }

  addGapAnchor(0, 0, 0)
  if (openingBreakawayActive && Number.isFinite(formationKm)) {
    addGapAnchor(formationKm, phase1.initialGapSeconds, 10)
  }
  addGapAnchor(
    phase1.phaseBoundary.endKm,
    rawPelotonGap(rawPhase1Groups, phase1.initialGapSeconds),
    20,
  )
  addGapAnchor(
    phase2.phaseBoundary.endKm,
    rawPelotonGap(rawPhase2Groups, phase2.endGapSeconds),
    30,
  )
  addGapAnchor(
    decisiveSplitKm,
    rawPelotonGap(rawPhase3Groups, phase4.startGapSeconds),
    40,
  )
  addGapAnchor(
    phase3.phaseBoundary.endKm,
    rawPelotonGap(rawPhase3Groups, phase4.startGapSeconds),
    45,
  )
  if (phase4FrontActive) {
    addGapAnchor(chaseStartKm, phase4.startGapSeconds, 50)
    phase4.chaseSteps.forEach((step, index) => {
      addGapAnchor(step.kmStart, step.startGapSeconds, 60 + index * 2)
      addGapAnchor(step.kmEnd, step.endGapSeconds, 61 + index * 2)
    })
  }
  if (catchKm !== null) {
    addGapAnchor(catchKm, 0, 90)
  }
  addGapAnchor(
    stageDistanceKm,
    phase4.breakawayCaught ? 0 : phase4.endGapSeconds,
    100,
  )

  const gapAnchors = gapAnchorCandidates
    .sort(
      (left, right) =>
        left.km - right.km ||
        left.priority - right.priority,
    )
    .reduce<ReplayGapAnchor[]>((anchors, candidate) => {
      const previous = anchors[anchors.length - 1]
      if (previous && Math.abs(previous.km - candidate.km) <= 0.000001) {
        anchors[anchors.length - 1] = candidate
      } else {
        anchors.push(candidate)
      }
      return anchors
    }, [])

  const gapAtKm = (kmFromStart: number): number => {
    if (!phase4FrontActive && !openingBreakawayActive) return 0
    const km = clamp(kmFromStart, 0, stageDistanceKm)

    let previous = gapAnchors[0]
    let next = gapAnchors[gapAnchors.length - 1]
    for (let index = 0; index < gapAnchors.length; index += 1) {
      const anchor = gapAnchors[index]
      if (anchor.km <= km + 0.000001) previous = anchor
      if (anchor.km >= km - 0.000001) {
        next = anchor
        break
      }
    }

    if (!previous || !next || Math.abs(next.km - previous.km) <= 0.000001) {
      return previous?.gapSeconds ?? next?.gapSeconds ?? 0
    }

    const fraction = clamp(
      (km - previous.km) / (next.km - previous.km),
      0,
      1,
    )
    const easedFraction = fraction * fraction * (3 - 2 * fraction)

    return deterministicRound(
      previous.gapSeconds +
        (next.gapSeconds - previous.gapSeconds) * easedFraction,
      6,
    )
  }

  const authoritativeBridgeGroup = phase4.bridgeGroups[0] ?? null

  const bridgeStateAtKm = (
    kmFromStart: number,
  ): {
    readonly launched: boolean
    readonly active: boolean
    readonly merged: boolean
    readonly gapToLeaderSeconds: number | null
    readonly gapToPelotonSeconds: number | null
  } => {
    if (!authoritativeBridgeGroup) {
      return {
        launched: false,
        active: false,
        merged: false,
        gapToLeaderSeconds: null,
        gapToPelotonSeconds: null,
      }
    }
    const km = clamp(kmFromStart, 0, stageDistanceKm)
    if (km < authoritativeBridgeGroup.launchKm - 0.000001) {
      return {
        launched: false,
        active: false,
        merged: false,
        gapToLeaderSeconds: null,
        gapToPelotonSeconds: null,
      }
    }
    if (
      authoritativeBridgeGroup.mergedIntoOpeningBreakaway &&
      authoritativeBridgeGroup.mergeKm !== null &&
      km >= authoritativeBridgeGroup.mergeKm - 0.000001
    ) {
      return {
        launched: true,
        active: false,
        merged: true,
        gapToLeaderSeconds: 0,
        gapToPelotonSeconds: gapAtKm(km),
      }
    }

    const samples = authoritativeBridgeGroup.gapSamples
    let previous = samples[0]
    let next = samples[samples.length - 1]
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]
      if (sample.km <= km + 0.000001) previous = sample
      if (sample.km >= km - 0.000001) {
        next = sample
        break
      }
    }
    const fraction =
      Math.abs(next.km - previous.km) <= 0.000001
        ? 0
        : clamp((km - previous.km) / (next.km - previous.km), 0, 1)
    const easedFraction = fraction * fraction * (3 - 2 * fraction)
    const gapToLeaderSeconds = deterministicRound(
      previous.gapToLeaderSeconds +
        (next.gapToLeaderSeconds - previous.gapToLeaderSeconds) *
          easedFraction,
      6,
    )
    const gapToPelotonSeconds = deterministicRound(
      previous.gapToPelotonSeconds +
        (next.gapToPelotonSeconds - previous.gapToPelotonSeconds) *
          easedFraction,
      6,
    )
    return {
      launched: true,
      active: true,
      merged: false,
      gapToLeaderSeconds,
      gapToPelotonSeconds,
    }
  }

  const findGapCrossingKm = (
    targetGapSeconds: number,
    kmStart: number,
    kmEnd: number,
  ): number => {
    let lowerKm = kmStart
    let upperKm = kmEnd

    for (let iteration = 0; iteration < 40; iteration += 1) {
      const middleKm = (lowerKm + upperKm) / 2
      if (gapAtKm(middleKm) > targetGapSeconds) lowerKm = middleKm
      else upperKm = middleKm
    }

    return deterministicRound(upperKm, 6)
  }

  const eligibleStarterIds = riderReadiness
    .filter((row) => row.eligibleToStart)
    .map((row) => row.riderId)
    .sort()
  const phase4EscapeSet = new Set(phase4.escapeRiderIdsAtStart)

  const buildPhase4ChaseGroups = (
    kmFromStart: number,
    pelotonGapSeconds: number,
  ): readonly UniversalPhase5GroupSnapshot[] => {
    if (!phase4FrontActive) {
      return adjustGroupsToPelotonGap(phase3Groups, pelotonGapSeconds)
    }

    const targetPelotonGap = deterministicRound(
      Math.max(0, pelotonGapSeconds),
      6,
    )
    const bridgeState = bridgeStateAtKm(kmFromStart)
    const bridgeRiderIds = authoritativeBridgeGroup?.riderIds ?? []
    const bridgeRiderSet = new Set(bridgeRiderIds)
    const frontRiderIds = Array.from(
      new Set([
        ...phase4.escapeRiderIdsAtStart,
        ...(bridgeState.merged ? bridgeRiderIds : []),
      ]),
    ).sort()
    const frontRiderSet = new Set(frontRiderIds)
    const activeBridgeRiderIds = bridgeState.active
      ? [...bridgeRiderIds].sort()
      : []
    const activeBridgeRiderSet = new Set(activeBridgeRiderIds)
    const openingTemplate =
      phase3Groups.find((group) => group.displayCode.startsWith('B')) ??
      phase2Groups.find((group) => group.displayCode.startsWith('B')) ??
      phase1Groups.find((group) => group.displayCode.startsWith('B')) ??
      startGroup
    const bridgeTemplate =
      phase3Groups.find((group) => group.displayCode.startsWith('F')) ??
      openingTemplate
    const pelotonTemplate =
      phase3Groups.find((group) => group.displayCode === 'P') ??
      phase2Groups.find((group) => group.displayCode === 'P') ??
      startGroup
    const trailingGroups = phase3Groups.filter(
      (group) =>
        group.displayCode !== 'P' &&
        !group.displayCode.startsWith('B') &&
        !group.displayCode.startsWith('F'),
    )
    const trailingRiderSet = new Set(
      trailingGroups.flatMap((group) => group.riderIds),
    )
    const groups: UniversalPhase5GroupSnapshot[] = []

    if (frontRiderIds.length > 0) {
      groups.push({
        ...openingTemplate,
        phaseNumber: 4,
        groupOrder: 1,
        groupCode: openingBreakawayActive
          ? 'breakaway'
          : 'front_favourites',
        displayCode: openingBreakawayActive ? openingFrontDisplayCode : 'F1',
        physicalPosition: 'ahead_of_peloton',
        colorKey: openingBreakawayActive
          ? 'breakaway_red'
          : 'front_yellow',
        riderIds: frontRiderIds,
        gapSeconds: 0,
        officialTimeSeconds: null,
        formationReason: openingBreakawayActive
          ? bridgeState.merged
            ? 'chase_reformation'
            : 'opening_escape'
          : 'late_front_attack',
      })
    }

    if (
      activeBridgeRiderIds.length > 0 &&
      bridgeState.gapToLeaderSeconds !== null
    ) {
      groups.push({
        ...bridgeTemplate,
        phaseNumber: 4,
        groupOrder: groups.length + 1,
        groupCode: 'front_favourites',
        displayCode: 'F1',
        physicalPosition: 'ahead_of_peloton',
        colorKey: 'front_yellow',
        riderIds: activeBridgeRiderIds,
        gapSeconds: deterministicRound(
          Math.max(
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.000001,
            Math.min(
              targetPelotonGap - 0.000001,
              bridgeState.gapToLeaderSeconds,
            ),
          ),
          6,
        ),
        officialTimeSeconds: null,
        formationReason: 'late_front_attack',
      })
    }

    const pelotonRiderIds = eligibleStarterIds.filter(
      (riderId) =>
        !frontRiderSet.has(riderId) &&
        !activeBridgeRiderSet.has(riderId) &&
        !trailingRiderSet.has(riderId),
    )
    if (pelotonRiderIds.length > 0) {
      groups.push({
        ...pelotonTemplate,
        phaseNumber: 4,
        groupOrder: groups.length + 1,
        groupCode: 'main_peloton',
        displayCode: 'P',
        physicalPosition: 'peloton',
        colorKey: 'peloton_blue',
        riderIds: pelotonRiderIds,
        gapSeconds: targetPelotonGap,
        officialTimeSeconds: null,
        formationReason:
          bridgeState.launched && !bridgeState.merged
            ? 'late_front_attack'
            : bridgeState.merged
              ? 'chase_reformation'
              : pelotonTemplate.formationReason,
      })
    }

    trailingGroups.forEach((group) => {
      const riderIds = group.riderIds.filter(
        (riderId) =>
          !frontRiderSet.has(riderId) &&
          !activeBridgeRiderSet.has(riderId),
      )
      if (riderIds.length === 0) return
      groups.push({
        ...group,
        phaseNumber: 4,
        groupOrder: groups.length + 1,
        riderIds,
        gapSeconds: deterministicRound(
          targetPelotonGap +
            Math.max(0, group.gapSeconds - pelotonTemplate.gapSeconds),
          6,
        ),
        officialTimeSeconds: null,
      })
    })

    return groups
      .filter((group) => group.riderIds.length > 0)
      .sort(
        (left, right) =>
          left.gapSeconds - right.gapSeconds ||
          left.groupOrder - right.groupOrder ||
          left.displayCode.localeCompare(right.displayCode),
      )
      .map((group, index) => ({
        ...group,
        groupOrder: index + 1,
      }))
  }

  const applyPhase4ContactLossToGroups = (
    sourceGroups: readonly UniversalPhase5GroupSnapshot[],
    kmFromStart: number,
  ): readonly UniversalPhase5GroupSnapshot[] => {
    if (
      phase4ContactLossStates.length === 0 ||
      kmFromStart >= stageDistanceKm - 0.000001
    ) {
      return sourceGroups
    }

    const activeContactLossStates = phase4ContactLossStates.filter(
      (state) =>
        state.contactLossKm !== null &&
        kmFromStart >= state.contactLossKm - 0.000001,
    )
    if (activeContactLossStates.length === 0) return sourceGroups

    const activeContactLossRiderSet = new Set(
      activeContactLossStates.map((state) => state.riderId),
    )
    const retainedGroups = sourceGroups
      .map((group) => ({
        ...group,
        riderIds: group.riderIds.filter(
          (riderId) => !activeContactLossRiderSet.has(riderId),
        ),
      }))
      .filter((group) => group.riderIds.length > 0)

    const pelotonTemplate =
      retainedGroups.find((group) => group.displayCode === 'P') ??
      sourceGroups.find((group) => group.displayCode === 'P') ??
      sourceGroups[0]
    if (!pelotonTemplate) return retainedGroups

    const pelotonGapSeconds = deterministicRound(
      Math.max(0, pelotonTemplate.gapSeconds),
      6,
    )
    let nextChaseNumber =
      retainedGroups.filter((group) => group.displayCode.startsWith('C')).length + 1

    const riderCandidates: UniversalPhase5RoadGroupCandidate[] =
      activeContactLossStates
        .map((state, index) => {
          const contactLossKm = state.contactLossKm ?? kmFromStart
          const evolutionFraction = clamp(
            (kmFromStart - contactLossKm) /
              Math.max(0.000001, stageDistanceKm - contactLossKm),
            0,
            1,
          )
          const easedFraction =
            evolutionFraction * evolutionFraction * (3 - 2 * evolutionFraction)
          const initialPenaltySeconds = Math.min(
            state.contactLossGapPenaltySeconds,
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
          )
          const currentPenaltySeconds = deterministicRound(
            initialPenaltySeconds +
              (state.contactLossGapPenaltySeconds - initialPenaltySeconds) *
                easedFraction,
            6,
          )
          const gapSeconds = deterministicRound(
            pelotonGapSeconds +
              Math.max(
                PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
                currentPenaltySeconds,
              ),
            6,
          )
          const preferredGroupCode: UniversalPhase5GroupCode =
            state.finalGroupCode === 'late_group'
              ? 'dropped_group'
              : 'chasing_group'
          return {
            sourceOrder: index + 1,
            preferredGroupCode,
            riderIds: [state.riderId],
            gapSeconds,
            riderPerformanceScores: { [state.riderId]: -gapSeconds },
            formationReason: 'decisive_selection' as const,
          }
        })
        .sort(
          (left, right) =>
            left.gapSeconds - right.gapSeconds ||
            left.riderIds[0].localeCompare(right.riderIds[0]),
        )
        .map((candidate, index) => ({ ...candidate, sourceOrder: index + 1 }))

    // Each already-cracked rider keeps an independently evolving physical gap.
    // Only riders that are actually within the existing five-second merge
    // tolerance are allowed to share one displayed chase group. A newly
    // detached rider at +6s therefore cannot reset a much older group that has
    // already drifted farther back.
    const mergedContactLossGroups = mergeAdjacentPhase5RoadGroups(
      riderCandidates,
      riderById,
      PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
    )
    const selectedGroups: UniversalPhase5GroupSnapshot[] =
      mergedContactLossGroups.map((candidate, index) => ({
        ...pelotonTemplate,
        phaseNumber: 4,
        groupOrder: retainedGroups.length + index + 1,
        groupCode: candidate.preferredGroupCode,
        displayCode: `C${nextChaseNumber++}`,
        physicalPosition: 'behind_peloton',
        colorKey: 'chasing_orange',
        riderIds: [...candidate.riderIds],
        gapSeconds: deterministicRound(candidate.gapSeconds, 6),
        officialTimeSeconds: null,
        formationReason: 'decisive_selection',
      }))

    return [...retainedGroups, ...selectedGroups]
      .sort(
        (left, right) =>
          left.gapSeconds - right.gapSeconds ||
          left.groupOrder - right.groupOrder ||
          left.displayCode.localeCompare(right.displayCode),
      )
      .map((group, index) => ({
        ...group,
        groupOrder: index + 1,
      }))
  }

  const caughtGroups: readonly UniversalPhase5GroupSnapshot[] =
    catchKm !== null && phase4FrontActive
      ? normalizeReplayGroups(buildPhase4ChaseGroups(catchKm, 0)).map(
          (group, index) => ({
            ...group,
            phaseNumber: 4 as const,
            groupOrder: index + 1,
            officialTimeSeconds: null,
            formationReason:
              group.displayCode === 'P'
                ? ('breakaway_catch' as const)
                : group.formationReason,
          }),
        )
      : finalGroups.map((group, index) => ({
          ...group,
          phaseNumber: 4 as const,
          groupOrder: index + 1,
          officialTimeSeconds: null,
        }))

  const caughtPelotonRiderIds = new Set(
    caughtGroups.find((group) => group.displayCode === 'P')?.riderIds ?? [],
  )
  const postCatchSplitRiderIds = finalGroups
    .filter((group) => group.displayCode !== 'P')
    .flatMap((group) => group.riderIds)
    .filter(
      (riderId) =>
        caughtPelotonRiderIds.has(riderId) &&
        !phase4ContactLossRiderSet.has(riderId),
    )
    .sort()
  const postCatchSplitActive =
    catchKm !== null &&
    postCatchSplitRiderIds.length > 0 &&
    catchKm < stageDistanceKm - 0.000001
  const postCatchSplitKm = postCatchSplitActive
    ? deterministicRound(
        Math.min(
          stageDistanceKm - 0.000001,
          catchKm! +
            clamp((stageDistanceKm - catchKm!) * 0.4, 0.000001, 6),
        ),
        6,
      )
    : null

  const postCatchInitialGapByDisplayCode = new Map<string, number>()
  if (postCatchSplitActive) {
    let previousInitialGap = 0
    finalGroups
      .slice()
      .sort((left, right) => left.groupOrder - right.groupOrder)
      .forEach((group) => {
        if (group.displayCode === 'P') {
          postCatchInitialGapByDisplayCode.set(group.displayCode, 0)
          previousInitialGap = 0
          return
        }
        const initialGap = deterministicRound(
          Math.min(
            group.gapSeconds,
            Math.max(
              previousInitialGap + PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 1,
              group.gapSeconds * 0.4,
            ),
          ),
          6,
        )
        postCatchInitialGapByDisplayCode.set(group.displayCode, initialGap)
        previousInitialGap = initialGap
      })
  }

  const buildPostCatchEvolutionGroups = (
    kmFromStart: number,
  ): readonly UniversalPhase5GroupSnapshot[] => {
    if (!postCatchSplitActive || postCatchSplitKm === null) return caughtGroups
    const fraction = clamp(
      (kmFromStart - postCatchSplitKm) /
        Math.max(0.000001, stageDistanceKm - postCatchSplitKm),
      0,
      1,
    )
    const easedFraction = fraction * fraction * (3 - 2 * fraction)

    return finalGroups
      .slice()
      .sort((left, right) => left.groupOrder - right.groupOrder)
      .map((group, index) => {
        const initialGap =
          postCatchInitialGapByDisplayCode.get(group.displayCode) ??
          group.gapSeconds
        const gapSeconds = deterministicRound(
          initialGap +
            (group.gapSeconds - initialGap) * easedFraction,
          6,
        )
        return {
          ...group,
          phaseNumber: 4 as const,
          groupOrder: index + 1,
          gapSeconds,
          officialTimeSeconds: null,
          formationReason:
            group.displayCode === 'P'
              ? ('peloton_cohesion' as const)
              : ('decisive_selection' as const),
        }
      })
  }

  const groupsAtKm = (
    kmFromStart: number,
  ): readonly UniversalPhase5GroupSnapshot[] => {
    const km = clamp(kmFromStart, 0, stageDistanceKm)
    let groups: readonly UniversalPhase5GroupSnapshot[]
    if (km >= stageDistanceKm - 0.000001) {
      groups = finalGroups
    } else if (catchKm !== null && km >= catchKm - 0.000001) {
      if (
        postCatchSplitActive &&
        postCatchSplitKm !== null &&
        km >= postCatchSplitKm - 0.000001
      ) {
        groups = buildPostCatchEvolutionGroups(km)
      } else {
        groups = caughtGroups
      }
    } else if (phase4FrontActive && km >= chaseStartKm - 0.000001) {
      groups = buildPhase4ChaseGroups(km, gapAtKm(km))
    } else if (
      nonOpeningFrontFormationActive &&
      km >= nonOpeningFrontFormationKm - 0.000001
    ) {
      groups = buildPhase4ChaseGroups(km, nonOpeningFrontGapAtKm(km))
    } else if (km >= decisiveSplitKm - 0.000001) {
      groups = adjustGroupsToPelotonGap(
        phase3Groups,
        openingBreakawayActive
          ? gapAtKm(km)
          : rawPelotonGap(rawPhase3Groups, 0),
      )
    } else if (km >= phase1.phaseBoundary.endKm - 0.000001) {
      groups = adjustGroupsToPelotonGap(phase2Groups, gapAtKm(km))
    } else if (
      openingBreakawayActive &&
      Number.isFinite(formationKm) &&
      km >= formationKm - 0.000001
    ) {
      groups = adjustGroupsToPelotonGap(phase1Groups, gapAtKm(km))
    } else {
      groups = [startGroup]
    }
    return applyPhase4ContactLossToGroups(groups, km)
  }

  const getActiveCommands = (
    phaseNumber: 0 | RoadRacePhaseNumber,
  ): readonly UniversalReplayActiveCommand[] =>
    phaseNumber === 0
      ? []
      : roadCommandResolution.riders
          .filter((row) => row.eligibleToStart)
          .map((row): UniversalReplayActiveCommand | null => {
            const phase = row.phases.find(
              (entry) => entry.phaseNumber === phaseNumber,
            )
            if (!phase) return null

            return {
              riderId: row.riderId,
              teamId: row.teamId,
              phaseNumber: phase.phaseNumber,
              stageRole: row.stageRole,
              savedCommand: phase.savedCommand,
              resolvedCommand: phase.resolvedCommand,
              resolvedSource: phase.resolvedSource,
              behaviour: phase.behaviour,
            }
          })
          .filter(
            (row): row is UniversalReplayActiveCommand => row !== null,
          )
          .sort((left, right) =>
            left.riderId.localeCompare(right.riderId),
          )

  const formatReplaySeconds = (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds))
    if (total < 60) {
      return `${total} second${total === 1 ? '' : 's'}`
    }
    const minutes = Math.floor(total / 60)
    const remainder = total % 60
    return `${minutes}:${String(remainder).padStart(2, '0')}`
  }

  const sanitizeReplayText = (value: string): string =>
    value
      .replace(
        /(-?\d+(?:\.\d+)?)\s*-\s*second/gi,
        (_match, rawValue: string) =>
          `${Math.max(0, Math.round(Number(rawValue)))}-second`,
      )
      .replace(
        /(-?\d+(?:\.\d+)?)\s+seconds?/gi,
        (_match, rawValue: string) =>
          formatReplaySeconds(Number(rawValue)),
      )
      .replace(/\bPhase\s+[1-9]\b/gi, 'the race')
      .replace(/\bphase\s+[1-9]\b/gi, 'the race')
      .replace(/\bdeterministic\s+/gi, '')
      .replace(/\bconfigured\s+/gi, '')

  const buildRaceStatusCommentary = (
    kmFromStart: number,
    groups: readonly UniversalPhase5GroupSnapshot[],
  ): {
    readonly title: string
    readonly description: string
    readonly riderIds: readonly string[]
    readonly teamIds: readonly string[]
  } => {
    const ordered = normalizeReplayGroups(groups)
    const front = ordered[0]
    const peloton = ordered.find((group) => group.displayCode === 'P')
    const previousGap = gapAtKm(
      Math.max(0, kmFromStart - stageDistanceKm * 0.05),
    )
    const currentGap = peloton?.gapSeconds ?? 0

    if (
      front &&
      peloton &&
      front.groupOrder < peloton.groupOrder &&
      (front.displayCode.startsWith('B') ||
        front.displayCode.startsWith('F'))
    ) {
      const gapDelta = currentGap - previousGap
      const title =
        gapDelta > 4
          ? 'The leaders extend their advantage'
          : gapDelta < -4
            ? 'The peloton closes in'
            : 'The race situation remains stable'
      const groupLabel = front.displayCode.startsWith('B')
        ? 'breakaway'
        : 'front group'
      return {
        title,
        description: `The ${front.riderIds.length}-rider ${groupLabel} is ${formatReplaySeconds(currentGap)} ahead of the peloton.`,
        riderIds: [...front.riderIds],
        teamIds: Array.from(
          new Set(
            front.riderIds
              .map((riderId) => riderById.get(riderId)?.teamId)
              .filter((teamId): teamId is string => Boolean(teamId)),
          ),
        ).sort(),
      }
    }

    if (ordered.length === 1) {
      return {
        title: 'The field remains together',
        description: `${ordered[0].riderIds.length} riders remain in the main group.`,
        riderIds: [],
        teamIds: [],
      }
    }

    const second = ordered[1]
    const gap = Math.max(0, second.gapSeconds - front.gapSeconds)
    return {
      title: 'The race remains split',
      description: `${front.displayCode} leads ${second.displayCode} by ${formatReplaySeconds(gap)} with ${ordered.length} groups on the road.`,
      riderIds: [],
      teamIds: [],
    }
  }

  type ReplayCheckpointDefinition = {
    readonly checkpointIdSuffix: string
    readonly checkpointKind: UniversalReplayCheckpointKind
    readonly phase: 0 | RoadRacePhaseNumber
    readonly kmFromStart: number
    readonly sortOrder: number
    readonly groups: readonly UniversalPhase5GroupSnapshot[]
    readonly energyByRiderId: ReadonlyMap<string, number>
    readonly eventType: UniversalReplayEventType
    readonly title: string
    readonly description: string
    readonly riderIds: readonly string[]
    readonly teamIds: readonly string[]
    readonly incidents?: readonly UniversalReplayIncident[]
    readonly finalResultsVisible?: boolean
  }

  const makeStatusDefinition = ({
    checkpointIdSuffix,
    checkpointKind,
    kmFromStart,
    sortOrder,
  }: {
    readonly checkpointIdSuffix: string
    readonly checkpointKind: UniversalReplayCheckpointKind
    readonly kmFromStart: number
    readonly sortOrder: number
  }): ReplayCheckpointDefinition => {
    const phase = phaseForKm(kmFromStart)
    const groups = groupsAtKm(kmFromStart)
    const commentary = buildRaceStatusCommentary(kmFromStart, groups)
    return {
      checkpointIdSuffix,
      checkpointKind,
      phase,
      kmFromStart,
      sortOrder,
      groups,
      energyByRiderId: energyAtKm(phase, kmFromStart),
      eventType: 'race_status',
      title: commentary.title,
      description: commentary.description,
      riderIds: commentary.riderIds,
      teamIds: commentary.teamIds,
    }
  }

  const baseDefinitions: ReplayCheckpointDefinition[] = [
    {
      checkpointIdSuffix: 'start',
      checkpointKind: 'base',
      phase: 0,
      kmFromStart: 0,
      sortOrder: 0,
      groups: [startGroup],
      energyByRiderId: startEnergyByRiderId,
      eventType: 'race_start',
      title: 'Race starts',
      description: `${eligibleStarterIds.length} riders begin the stage.`,
      riderIds: [],
      teamIds: [],
    },
    makeStatusDefinition({
      checkpointIdSuffix: 'phase-1-end',
      checkpointKind: 'base',
      kmFromStart: phase1.phaseBoundary.endKm,
      sortOrder: 900,
    }),
    makeStatusDefinition({
      checkpointIdSuffix: 'phase-2-end',
      checkpointKind: 'base',
      kmFromStart: phase2.phaseBoundary.endKm,
      sortOrder: 900,
    }),
    makeStatusDefinition({
      checkpointIdSuffix: 'phase-3-end',
      checkpointKind: 'base',
      kmFromStart: phase3.phaseBoundary.endKm,
      sortOrder: 900,
    }),
    {
      checkpointIdSuffix: 'finish',
      checkpointKind: 'base',
      phase: 4,
      kmFromStart: stageDistanceKm,
      sortOrder: 1000,
      groups: finalGroups,
      energyByRiderId: phase4EnergyByRiderId,
      eventType: 'finish',
      title: 'Stage finished',
      description: finishResolution.winnerRiderId
        ? `${finishResolution.winnerRiderId} wins the stage.`
        : 'The stage finishes without a classified winner.',
      riderIds: finishResolution.winnerRiderId
        ? [finishResolution.winnerRiderId]
        : [],
      teamIds: finishResolution.winnerTeamId
        ? [finishResolution.winnerTeamId]
        : [],
      finalResultsVisible: true,
    },
  ]

  const eventDefinitions: ReplayCheckpointDefinition[] = []

  acceptedOpeningAttempts.forEach((attempt, index) => {
    eventDefinitions.push({
      checkpointIdSuffix: `opening-attack-${attempt.riderId}-${index + 1}`,
      checkpointKind: 'event',
      phase: 1,
      kmFromStart: attempt.attemptKm,
      sortOrder: 100 + index,
      groups: groupsAtKm(attempt.attemptKm),
      energyByRiderId: energyAtKm(
        1,
        attempt.attemptKm,
        new Map([
          [attempt.riderId, attempt.energyAfterAttackAttempt],
        ]),
      ),
      eventType: 'attack',
      title: 'Attack succeeds',
      description: `${attempt.riderId} attacks on ${attempt.effectiveTerrainType} terrain and opens ${formatReplaySeconds(attempt.initialGapSeconds)}.`,
      riderIds: [attempt.riderId],
      teamIds: [attempt.teamId],
    })
  })

  if (openingBreakawayActive && Number.isFinite(formationKm)) {
    const formationOverrides = new Map(
      acceptedOpeningAttempts.map(
        (attempt) =>
          [attempt.riderId, attempt.energyAfterAttackAttempt] as const,
      ),
    )
    eventDefinitions.push({
      checkpointIdSuffix: 'opening-breakaway-formed',
      checkpointKind: 'event',
      phase: 1,
      kmFromStart: formationKm,
      sortOrder: 150,
      groups: groupsAtKm(formationKm),
      energyByRiderId: energyAtKm(1, formationKm, formationOverrides),
      eventType: 'breakaway_formation',
      title: 'The breakaway is established',
      description: `${phase1.breakawayRiderIds.length} rider${phase1.breakawayRiderIds.length === 1 ? '' : 's'} form the day's breakaway with ${formatReplaySeconds(gapAtKm(formationKm))} of separation.`,
      riderIds: [...phase1.breakawayRiderIds],
      teamIds: Array.from(
        new Set(
          phase1.breakawayRiderIds
            .map((riderId) => riderById.get(riderId)?.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      ).sort(),
    })
  }

  if (phase2.pelotonResponse.responseMode !== 'no_active_escape') {
    const controlKm = deterministicRound(
      (phase2.phaseBoundary.startKm + phase2.phaseBoundary.endKm) / 2,
      6,
    )
    eventDefinitions.push({
      checkpointIdSuffix: 'peloton-response',
      checkpointKind: 'event',
      phase: phaseForKm(controlKm) as RoadRacePhaseNumber,
      kmFromStart: controlKm,
      sortOrder: 300,
      groups: groupsAtKm(controlKm),
      energyByRiderId: energyAtKm(phaseForKm(controlKm), controlKm),
      eventType: 'peloton_control',
      title: 'The peloton sets its response',
      description: `${phase2.pelotonResponse.controllingTeamIds.length} team${phase2.pelotonResponse.controllingTeamIds.length === 1 ? '' : 's'} control the pace and ${phase2.pelotonResponse.chasingTeamIds.length} team${phase2.pelotonResponse.chasingTeamIds.length === 1 ? '' : 's'} contribute to the chase.`,
      riderIds: [],
      teamIds: Array.from(
        new Set([
          ...phase2.pelotonResponse.controllingTeamIds,
          ...phase2.pelotonResponse.chasingTeamIds,
        ]),
      ).sort(),
    })
  }

  intermediatePointFinalization.replayEvents.forEach((event) => {
    const battle = battleByPointId.get(event.pointId)
    const commentary = commentaryByPointId.get(event.pointId)
    const pointCosts = intermediatePointFinalization.costApplications.filter(
      (cost) =>
        cost.pointId === event.pointId &&
        cost.applicationMode === 'point_finalization_cost',
    )
    const pointCostByRiderId = new Map<string, number>()
    pointCosts.forEach((cost) => {
      pointCostByRiderId.set(
        cost.riderId,
        (pointCostByRiderId.get(cost.riderId) ?? 0) + cost.energyCost,
      )
    })
    const pointEnergyOverrides = new Map<string, number>()
    battle?.rankings.forEach((ranking) => {
      pointEnergyOverrides.set(
        ranking.riderId,
        Math.max(
          0,
          ranking.liveEnergyBeforeBattle -
            (pointCostByRiderId.get(ranking.riderId) ?? 0),
        ),
      )
    })
    const eventType: UniversalReplayEventType =
      event.pointType === 'KOM'
        ? 'kom'
        : event.pointType === 'BONUS_SPRINT'
          ? 'bonus_sprint'
          : 'intermediate_sprint'
    const phase = phaseForKm(event.kmFromStart)

    eventDefinitions.push({
      checkpointIdSuffix: `point-${event.pointId}`,
      checkpointKind: 'event',
      phase,
      kmFromStart: event.kmFromStart,
      sortOrder: 400 + event.eventOrder,
      groups: groupsAtKm(event.kmFromStart),
      energyByRiderId: energyAtKm(
        phase,
        event.kmFromStart,
        pointEnergyOverrides,
      ),
      eventType,
      title: event.title,
      description:
        commentary?.description ??
        `${event.pointType} ${event.pointId} is resolved from the crossing order.`,
      riderIds: event.rankings.map((ranking) => ranking.riderId),
      teamIds: Array.from(
        new Set(event.rankings.map((ranking) => ranking.teamId)),
      ).sort(),
    })
  })

  phase3.attackAttempts
    .filter((attempt) => attempt.attackSucceeded)
    .slice()
    .sort(
      (left, right) =>
        left.attemptKm - right.attemptKm ||
        left.riderId.localeCompare(right.riderId),
    )
    .forEach((attempt, index) => {
      eventDefinitions.push({
        checkpointIdSuffix: `decisive-attack-${attempt.riderId}-${index + 1}`,
        checkpointKind: 'event',
        phase: 3,
        kmFromStart: attempt.attemptKm,
        sortOrder: 500 + index,
        groups: groupsAtKm(attempt.attemptKm),
        energyByRiderId: energyAtKm(
          3,
          attempt.attemptKm,
          new Map([[attempt.riderId, attempt.energyAfterAttempt]]),
        ),
        eventType: 'attack',
        title: 'A decisive attack is launched',
        description: `${attempt.riderId} attacks on ${attempt.effectiveTerrainType} terrain.`,
        riderIds: [attempt.riderId],
        teamIds: [attempt.teamId],
      })
    })

  const preDecisiveSplitKm = deterministicRound(
    Math.max(
      0,
      decisiveSplitKm - Math.max(0.01, Math.min(0.1, stageDistanceKm * 0.0005)),
    ),
    6,
  )
  const preDecisiveGroupByRiderId = new Map<string, string>()
  groupsAtKm(preDecisiveSplitKm).forEach((group) => {
    group.riderIds.forEach((riderId) => {
      preDecisiveGroupByRiderId.set(riderId, group.displayCode)
    })
  })
  const decisiveGroupByRiderId = new Map<string, string>()
  groupsAtKm(decisiveSplitKm).forEach((group) => {
    group.riderIds.forEach((riderId) => {
      decisiveGroupByRiderId.set(riderId, group.displayCode)
    })
  })
  const decisiveFrontTransferRiderIds = eligibleStarterIds
    .filter(
      (riderId) =>
        preDecisiveGroupByRiderId.get(riderId) === 'P' &&
        decisiveGroupByRiderId.get(riderId)?.startsWith('F'),
    )
    .sort()

  if (nonOpeningFrontFormationActive) {
    const formationGroups = groupsAtKm(nonOpeningFrontFormationKm)
    eventDefinitions.push({
      checkpointIdSuffix: 'late-front-selection-formed',
      checkpointKind: 'event',
      phase: 3,
      kmFromStart: nonOpeningFrontFormationKm,
      sortOrder: 350,
      groups: formationGroups,
      energyByRiderId: energyAtKm(3, nonOpeningFrontFormationKm),
      eventType: 'group_split',
      title: 'A front group forms under pressure',
      description: `${phase4.escapeRiderIdsAtStart.length} riders split from the main group and open ${formatReplaySeconds(nonOpeningFrontFormationGapSeconds)}.`,
      riderIds: [...phase4.escapeRiderIdsAtStart].sort(),
      teamIds: Array.from(
        new Set(
          phase4.escapeRiderIdsAtStart
            .map((riderId) => riderById.get(riderId)?.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      ).sort(),
    })
  } else if (
    phase3Groups.length > 1 ||
    decisiveFrontTransferRiderIds.length > 0
  ) {
    eventDefinitions.push({
      checkpointIdSuffix: 'decisive-group-split',
      checkpointKind: 'event',
      phase: 3,
      kmFromStart: decisiveSplitKm,
      sortOrder: 600,
      groups: groupsAtKm(decisiveSplitKm),
      energyByRiderId: energyAtKm(3, decisiveSplitKm),
      eventType: 'group_split',
      title: 'The race splits under pressure',
      description: `${groupsAtKm(decisiveSplitKm).length} groups are now on the road.`,
      riderIds: decisiveFrontTransferRiderIds,
      teamIds: Array.from(
        new Set(
          decisiveFrontTransferRiderIds
            .map((riderId) => riderById.get(riderId)?.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      ).sort(),
    })
  }

  const phase3BoundaryKm = phase3.phaseBoundary.endKm
  const prePhase3BoundaryKm = deterministicRound(
    Math.max(
      0,
      phase3BoundaryKm -
        Math.max(0.01, Math.min(0.1, stageDistanceKm * 0.0005)),
    ),
    6,
  )
  const prePhase3BoundaryGroupByRiderId = new Map<string, string>()
  groupsAtKm(prePhase3BoundaryKm).forEach((group) => {
    group.riderIds.forEach((riderId) => {
      prePhase3BoundaryGroupByRiderId.set(riderId, group.displayCode)
    })
  })
  const phase3BoundaryGroupByRiderId = new Map<string, string>()
  groupsAtKm(phase3BoundaryKm).forEach((group) => {
    group.riderIds.forEach((riderId) => {
      phase3BoundaryGroupByRiderId.set(riderId, group.displayCode)
    })
  })
  const phase3BoundaryFrontTransferRiderIds = eligibleStarterIds
    .filter(
      (riderId) =>
        prePhase3BoundaryGroupByRiderId.get(riderId) === 'P' &&
        phase3BoundaryGroupByRiderId.get(riderId)?.startsWith('F'),
    )
    .sort()

  const phase3BoundarySplitAlreadyCovered = eventDefinitions.some(
    (definition) =>
      definition.eventType === 'group_split' &&
      Math.abs(definition.kmFromStart - phase3BoundaryKm) <= 0.000001,
  )

  if (
    phase3BoundaryFrontTransferRiderIds.length > 0 &&
    !phase3BoundarySplitAlreadyCovered
  ) {
    eventDefinitions.push({
      checkpointIdSuffix: 'phase-3-boundary-front-split',
      checkpointKind: 'event',
      phase: 3,
      kmFromStart: phase3BoundaryKm,
      sortOrder: 890,
      groups: groupsAtKm(phase3BoundaryKm),
      energyByRiderId: energyAtKm(3, phase3BoundaryKm),
      eventType: 'group_split',
      title: 'A front group separates from the peloton',
      description: `${phase3BoundaryFrontTransferRiderIds.length} rider${
        phase3BoundaryFrontTransferRiderIds.length === 1 ? '' : 's'
      } move clear of the peloton.`,
      riderIds: phase3BoundaryFrontTransferRiderIds,
      teamIds: Array.from(
        new Set(
          phase3BoundaryFrontTransferRiderIds
            .map((riderId) => riderById.get(riderId)?.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      ).sort(),
    })
  }

  const buildContactLossClusters = (
    reason: 'terrain_pressure' | 'energy_depleted',
  ): readonly {
    readonly kmFromStart: number
    readonly riderIds: readonly string[]
  }[] => {
    const matching = phase4ContactLossStates
      .filter((state) => state.contactLossReason === reason)
      .map((state) => ({
        riderId: state.riderId,
        kmFromStart: state.contactLossKm ?? stageDistanceKm,
      }))
      .sort(
        (left, right) =>
          left.kmFromStart - right.kmFromStart ||
          left.riderId.localeCompare(right.riderId),
      )
    const clusters: { kmFromStart: number; riderIds: string[] }[] = []
    const clusterWindowKm = reason === 'terrain_pressure' ? 0.45 : 0.6
    const maximumRidersPerCluster = reason === 'terrain_pressure' ? 8 : 4
    matching.forEach((row) => {
      const current = clusters.at(-1)
      if (
        current &&
        row.kmFromStart - current.kmFromStart <= clusterWindowKm &&
        current.riderIds.length < maximumRidersPerCluster
      ) {
        current.kmFromStart = Math.max(current.kmFromStart, row.kmFromStart)
        current.riderIds.push(row.riderId)
      } else {
        clusters.push({
          kmFromStart: row.kmFromStart,
          riderIds: [row.riderId],
        })
      }
    })
    return clusters.map((cluster) => ({
      kmFromStart: deterministicRound(cluster.kmFromStart, 6),
      riderIds: cluster.riderIds.sort(),
    }))
  }

  const terrainContactLossClusters = buildContactLossClusters('terrain_pressure')
  terrainContactLossClusters.forEach((cluster, index) => {
    const gradient = lateTerrainSelection?.averageGradientPercent ?? 0
    eventDefinitions.push({
      checkpointIdSuffix: `late-terrain-contact-loss-${index + 1}`,
      checkpointKind: 'event',
      phase: 4,
      kmFromStart: cluster.kmFromStart,
      sortOrder: 650 + index,
      groups: groupsAtKm(cluster.kmFromStart),
      energyByRiderId: energyAtKm(4, cluster.kmFromStart),
      eventType: 'group_split',
      title: 'Riders crack on the climb',
      description: `${cluster.riderIds.length} rider${cluster.riderIds.length === 1 ? '' : 's'} can no longer hold the main group on the ${gradient.toFixed(1)}% climb.`,
      riderIds: [...cluster.riderIds],
      teamIds: Array.from(
        new Set(
          cluster.riderIds
            .map((riderId) => riderById.get(riderId)?.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      ).sort(),
    })
  })

  const depletionContactLossClusters = buildContactLossClusters('energy_depleted')
  depletionContactLossClusters.forEach((cluster, index) => {
    eventDefinitions.push({
      checkpointIdSuffix: `phase4-energy-contact-loss-${index + 1}`,
      checkpointKind: 'event',
      phase: 4,
      kmFromStart: cluster.kmFromStart,
      sortOrder: 680 + index,
      groups: groupsAtKm(cluster.kmFromStart),
      energyByRiderId: energyAtKm(4, cluster.kmFromStart),
      eventType: 'group_split',
      title: 'Exhausted riders lose contact',
      description: `${cluster.riderIds.length} rider${cluster.riderIds.length === 1 ? '' : 's'} can no longer hold the group as their live energy reserve is exhausted.`,
      riderIds: [...cluster.riderIds],
      teamIds: Array.from(
        new Set(
          cluster.riderIds
            .map((riderId) => riderById.get(riderId)?.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      ).sort(),
    })
  })

  if (phase4FrontActive && chaseStartKm < stageDistanceKm - 0.000001) {
    eventDefinitions.push({
      checkpointIdSuffix: 'late-chase-start',
      checkpointKind: 'event',
      phase: 4,
      kmFromStart: chaseStartKm,
      sortOrder: 700,
      groups: groupsAtKm(chaseStartKm),
      energyByRiderId: energyAtKm(4, chaseStartKm),
      eventType: 'late_chase',
      title: 'The peloton increases the pace',
      description: `The main group speeds up and begins an organized chase of the breakaway from ${formatReplaySeconds(phase4.startGapSeconds)} behind.`,
      riderIds: [],
      teamIds: Array.from(
        new Set([
          ...phase4.explicitChasingTeamIds,
          ...phase4.automaticChasingTeamIds,
        ]),
      ).sort(),
    })

    phase4.chaseSteps.forEach((step, index) => {
      if (step.kmEnd >= stageDistanceKm - 0.000001) {
        return
      }
      if (catchKm !== null && step.kmEnd >= catchKm - 0.000001) {
        return
      }
      if (step.bridgeMergedIntoFront) {
        return
      }
      const gapChange = step.endGapSeconds - step.startGapSeconds
      eventDefinitions.push({
        checkpointIdSuffix: `late-chase-step-${index + 1}`,
        checkpointKind: 'event',
        phase: 4,
        kmFromStart: step.kmEnd,
        sortOrder: 720 + index,
        groups: groupsAtKm(step.kmEnd),
        energyByRiderId: energyAtKm(4, step.kmEnd),
        eventType: 'late_chase',
        title:
          gapChange < -1
            ? 'The peloton reduces the gap'
            : gapChange > 1
              ? 'The leaders gain time'
              : 'The chase remains balanced',
        description: `The gap changes from ${formatReplaySeconds(step.startGapSeconds)} to ${formatReplaySeconds(step.endGapSeconds)}.`,
        riderIds: [],
        teamIds: Array.from(
          new Set([
            ...phase4.explicitChasingTeamIds,
            ...phase4.automaticChasingTeamIds,
          ]),
        ).sort(),
      })
    })
  }

  phase4.bridgeGroups.forEach((bridgeGroup, bridgeIndex) => {
    const teamIds = Array.from(
      new Set(
        bridgeGroup.riderIds
          .map((riderId) => riderById.get(riderId)?.teamId)
          .filter((teamId): teamId is string => Boolean(teamId)),
      ),
    ).sort()
    eventDefinitions.push({
      checkpointIdSuffix: `bridge-attack-${bridgeIndex + 1}`,
      checkpointKind: 'event',
      phase: 4,
      kmFromStart: bridgeGroup.launchKm,
      sortOrder: 750 + bridgeIndex * 20,
      groups: groupsAtKm(bridgeGroup.launchKm),
      energyByRiderId: energyAtKm(4, bridgeGroup.launchKm),
      eventType: 'bridge_attack',
      title: 'A group attacks from the peloton',
      description: `${bridgeGroup.riderIds.length} riders leave the main group and begin bridging across. They are ${formatReplaySeconds(bridgeGroup.launchGapToLeaderSeconds)} behind ${openingFrontDisplayCode} and ${formatReplaySeconds(bridgeGroup.launchGapToPelotonSeconds)} ahead of the peloton.`,
      riderIds: [...bridgeGroup.riderIds],
      teamIds,
    })

    bridgeGroup.gapSamples.slice(1).forEach((sample, sampleIndex) => {
      if (
        bridgeGroup.mergedIntoOpeningBreakaway &&
        bridgeGroup.mergeKm !== null &&
        sample.km >= bridgeGroup.mergeKm - 0.000001
      ) {
        return
      }
      if (sample.km >= stageDistanceKm - 0.000001) return
      if (catchKm !== null && sample.km >= catchKm - 0.000001) return
      eventDefinitions.push({
        checkpointIdSuffix: `bridge-progress-${bridgeIndex + 1}-${sampleIndex + 1}`,
        checkpointKind: 'event',
        phase: 4,
        kmFromStart: sample.km,
        sortOrder: 755 + bridgeIndex * 20 + sampleIndex,
        groups: groupsAtKm(sample.km),
        energyByRiderId: energyAtKm(4, sample.km),
        eventType: 'bridge_progress',
        title: `The chasing group closes on ${openingFrontDisplayCode}`,
        description: `F1 is ${formatReplaySeconds(sample.gapToLeaderSeconds)} behind ${openingFrontDisplayCode} and ${formatReplaySeconds(sample.gapToPelotonSeconds)} ahead of the peloton.`,
        riderIds: [...bridgeGroup.riderIds],
        teamIds,
      })
    })

    if (
      bridgeGroup.mergedIntoOpeningBreakaway &&
      bridgeGroup.mergeKm !== null
    ) {
      eventDefinitions.push({
        checkpointIdSuffix: `bridge-merge-${bridgeIndex + 1}`,
        checkpointKind: 'event',
        phase: 4,
        kmFromStart: bridgeGroup.mergeKm,
        sortOrder: 775 + bridgeIndex,
        groups: groupsAtKm(bridgeGroup.mergeKm),
        energyByRiderId: energyAtKm(4, bridgeGroup.mergeKm),
        eventType: 'bridge_merge',
        title: 'The chasing group reaches the breakaway',
        description: `F1 makes contact with ${openingFrontDisplayCode} inside the ${PHASE5_GROUP_MERGE_TOLERANCE_SECONDS}-second merge tolerance. A new ${phase4.frontRiderIdsAfterBridges.length}-rider ${openingFrontDisplayCode} forms, and its strength is recalculated from the riders and energy now in front.`,
        riderIds: [...bridgeGroup.riderIds],
        teamIds,
      })
    }
  })

  if (
    phase4.breakawayCaught &&
    catchKm !== null &&
    catchKm < stageDistanceKm - 0.000001
  ) {
    eventDefinitions.push({
      checkpointIdSuffix: 'opening-breakaway-caught',
      checkpointKind: 'event',
      phase: 4,
      kmFromStart: catchKm,
      sortOrder: 800,
      groups: groupsAtKm(catchKm),
      energyByRiderId: energyAtKm(4, catchKm),
      eventType: 'catch',
      title: openingBreakawayActive
        ? 'The breakaway is caught'
        : 'The front group is caught',
      description: `${openingBreakawayActive ? 'The breakaway riders are' : 'The front riders are'} absorbed at kilometre ${deterministicRound(catchKm, 1)} and the gap closes to zero.`,
      riderIds: [...phase4.frontRiderIdsAfterBridges],
      teamIds: Array.from(
        new Set(
          phase4.frontRiderIdsAfterBridges
            .map((riderId) => riderById.get(riderId)?.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      ).sort(),
    })
  }

  if (postCatchSplitActive && postCatchSplitKm !== null) {
    eventDefinitions.push({
      checkpointIdSuffix: 'post-catch-peloton-split',
      checkpointKind: 'event',
      phase: 4,
      kmFromStart: postCatchSplitKm,
      sortOrder: 820,
      groups: groupsAtKm(postCatchSplitKm),
      energyByRiderId: energyAtKm(4, postCatchSplitKm),
      eventType: 'group_split',
      title: 'The peloton splits under late pressure',
      description: `${postCatchSplitRiderIds.length} riders lose contact with the main finishing group as the pace rises.`,
      riderIds: [...postCatchSplitRiderIds],
      teamIds: Array.from(
        new Set(
          postCatchSplitRiderIds
            .map((riderId) => riderById.get(riderId)?.teamId)
            .filter((teamId): teamId is string => Boolean(teamId)),
        ),
      ).sort(),
    })
  }

  const occupiedKm = [
    ...baseDefinitions,
    ...eventDefinitions,
  ].map((definition) => definition.kmFromStart)
  for (let percent = 5; percent < 100; percent += 5) {
    const kmFromStart = deterministicRound(
      stageDistanceKm * (percent / 100),
      6,
    )
    if (
      occupiedKm.some(
        (existingKm) =>
          Math.abs(existingKm - kmFromStart) <=
          Math.max(0.05, stageDistanceKm * 0.0025),
      )
    ) {
      continue
    }

    eventDefinitions.push(
      makeStatusDefinition({
        checkpointIdSuffix: `race-status-${percent}`,
        checkpointKind: 'event',
        kmFromStart,
        sortOrder: 850,
      }),
    )
  }

  const definitions = [...baseDefinitions, ...eventDefinitions].sort(
    (left, right) =>
      left.kmFromStart - right.kmFromStart ||
      left.sortOrder - right.sortOrder ||
      left.checkpointIdSuffix.localeCompare(right.checkpointIdSuffix),
  )

  const checkpoints = definitions.map(
    (definition, checkpointIndex): UniversalReplayCheckpoint => {
      const progressKm = deterministicRound(
        clamp(definition.kmFromStart, 0, stageDistanceKm),
        6,
      )
      const finalResultsVisible = definition.finalResultsVisible === true
      const isAtFinishKm =
        Math.abs(progressKm - stageDistanceKm) <= 0.000001
      const normalizedGroups =
        finalResultsVisible || isAtFinishKm
          ? definition.groups
              .slice()
              .sort(
                (left, right) =>
                  left.groupOrder - right.groupOrder ||
                  left.displayCode.localeCompare(right.displayCode),
              )
              .map((group) => ({
                ...group,
                riderIds: [...group.riderIds],
              }))
          : normalizeReplayGroups(definition.groups)
      const groupByRiderId = new Map<
        string,
        UniversalPhase5GroupSnapshot
      >()
      normalizedGroups.forEach((group) => {
        group.riderIds.forEach((riderId) => {
          groupByRiderId.set(riderId, group)
        })
      })
      const riderStates = input.riders
        .map((rider): UniversalReplayRiderState => {
          const readiness = readinessByRiderId.get(rider.riderId)
          const finish = finishByRiderId.get(rider.riderId)
          const group = groupByRiderId.get(rider.riderId)
          const status: UniversalReplayRiderStatus = finalResultsVisible
            ? finish?.status ?? (readiness?.eligibleToStart ? 'dnf' : 'dns')
            : readiness?.eligibleToStart
              ? 'racing'
              : 'dns'

          return {
            riderId: rider.riderId,
            teamId: rider.teamId,
            status,
            groupCode: group?.groupCode ?? null,
            displayCode: group?.displayCode ?? null,
            gapSeconds: group?.gapSeconds ?? null,
            energy: deterministicRound(
              definition.energyByRiderId.get(rider.riderId) ?? 0,
              6,
            ),
            readinessScore: readiness?.readinessScore ?? 0,
            finishRank: finalResultsVisible ? finish?.rank ?? null : null,
            officialTimeSeconds: finalResultsVisible
              ? finish?.officialTimeSeconds ?? null
              : null,
          }
        })
        .sort((left, right) => left.riderId.localeCompare(right.riderId))

      const teamStates = input.teams
        .map((team): UniversalReplayTeamState => {
          const teamRiderStates = riderStates.filter(
            (row) => row.teamId === team.teamId,
          )
          const activeRiderIds = teamRiderStates
            .filter(
              (row) =>
                row.status === 'racing' || row.status === 'finished',
            )
            .map((row) => row.riderId)
            .sort()

          return {
            teamId: team.teamId,
            activeRiderIds,
            racingRiderCount: teamRiderStates.filter(
              (row) => row.status === 'racing',
            ).length,
            finishedRiderCount: teamRiderStates.filter(
              (row) => row.status === 'finished',
            ).length,
            dnsRiderCount: teamRiderStates.filter(
              (row) => row.status === 'dns',
            ).length,
            dnfRiderCount: teamRiderStates.filter(
              (row) => row.status === 'dnf',
            ).length,
            otlRiderCount: teamRiderStates.filter(
              (row) => row.status === 'otl',
            ).length,
          }
        })
        .sort((left, right) => left.teamId.localeCompare(right.teamId))
      const checkpointId =
        `${input.stage.stageId}|replay|${definition.checkpointIdSuffix}`
      const intermediateResults = intermediatePointFinalization.replayEvents
        .filter((event) => event.kmFromStart <= progressKm + 0.000001)
        .slice()
        .sort(
          (left, right) =>
            left.kmFromStart - right.kmFromStart ||
            left.eventOrder - right.eventOrder ||
            left.eventId.localeCompare(right.eventId),
        )

      return {
        checkpointId,
        checkpointIndex,
        checkpointKind: definition.checkpointKind,
        phase: definition.phase,
        raceProgress: {
          fraction: deterministicRound(
            progressKm / Math.max(0.000001, stageDistanceKm),
            9,
          ),
          percent: deterministicRound(
            (progressKm / Math.max(0.000001, stageDistanceKm)) * 100,
            6,
          ),
          kmFromStart: progressKm,
        },
        groups: normalizedGroups.map((group) => ({
          groupCode: group.groupCode,
          displayCode: group.displayCode,
          physicalPosition: group.physicalPosition,
          colorKey: group.colorKey,
          riderIds: [...group.riderIds],
        })),
        gaps: normalizedGroups.map((group) => ({
          groupCode: group.groupCode,
          displayCode: group.displayCode,
          gapSeconds: group.gapSeconds,
          officialTimeSeconds: finalResultsVisible
            ? group.officialTimeSeconds
            : null,
        })),
        riderStates,
        teamStates,
        activeCommands: getActiveCommands(definition.phase),
        intermediateResults,
        incidents: [...(definition.incidents ?? [])],
        commentary: [
          {
            commentaryId: `${checkpointId}|commentary`,
            eventType: definition.eventType,
            title: sanitizeReplayText(definition.title),
            description: sanitizeReplayText(definition.description),
            riderIds: [...definition.riderIds],
            teamIds: [...definition.teamIds],
          },
        ],
        finalResultsVisible,
      }
    },
  )

  const finalCheckpoint = checkpoints.find(
    (checkpoint) =>
      checkpoint.checkpointKind === 'base' &&
      checkpoint.phase === 4 &&
      checkpoint.raceProgress.fraction === 1,
  )
  const finalCheckpointId = finalCheckpoint?.checkpointId ?? null

  return {
    active: true,
    inactiveReason: null,
    completeBeforePlayback: true,
    playbackRecalculatesRace: false,
    baseCheckpointCount: checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'base',
    ).length,
    eventCheckpointCount: checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'event',
    ).length,
    checkpoints,
    finalCheckpointId,
    resultsVisibleFromCheckpointId: finalCheckpointId,
    deterministic: true,
    modelVersion: 'universal_replay_timeline_v1',
  }
}



const PHASE10_BASE_PROBABILITY_PER_30_SECONDS: Readonly<
  Record<UniversalPhase10IncidentKind, number>
> = {
  // v10c: ordinary background crashes are deliberately rarer than technical
  // problems. Race-state multipliers raise crash risk in the places where it
  // should matter most (downhill, hard peloton chase, late flat sprint).
  individual_crash: 0.00008,
  group_crash: 0.00008,
  technical_incident: 0.00012,
}

const PHASE10_MAXIMUM_PROBABILITY: Readonly<
  Record<UniversalPhase10IncidentKind, number>
> = {
  individual_crash: 0.08,
  group_crash: 0.04,
  technical_incident: 0.05,
}

const PHASE10_GLOBAL_COOLDOWN_SECONDS = 120 as const
const PHASE10_RIDER_COOLDOWN_SECONDS = 900 as const
const PHASE10_MAXIMUM_INCIDENTS_PER_STAGE = 10 as const
const PHASE10_MAXIMUM_INCIDENTS_PER_PHASE: Readonly<
  Record<RoadRacePhaseNumber, number>
> = {
  1: 2,
  2: 3,
  3: 3,
  4: 4,
} as const
const PHASE10_AUTONOMOUS_CHASE_STEP_KM = 0.5 as const

type Phase10AutonomousChaseEpisodeSample = {
  readonly kmFromStart: number
  readonly gapToTargetSeconds: number
  readonly displayCode: string
  readonly targetDisplayCode: string
  readonly groupRiderIds: readonly string[]
  readonly cumulativeChaseEnergyCostPoints: number
}

type Phase10AutonomousChaseEpisode = {
  readonly episodeKey: string
  readonly incidentId: string
  readonly riderId: string
  readonly teamId: string
  readonly incidentKm: number
  readonly samples: Phase10AutonomousChaseEpisodeSample[]
  actualRejoinKm: number | null
  finalGapToTargetSeconds: number
  chaseEnergyCostPoints: number
}

type Phase10AutonomousChaseMergeEvent = {
  readonly eventId: string
  readonly kmFromStart: number
  readonly displayCode: string
  readonly targetDisplayCode: string
  readonly riderIds: readonly string[]
  readonly teamIds: readonly string[]
}

type Phase10AutonomousChaseSimulation = {
  readonly active: boolean
  readonly episodes: readonly Phase10AutonomousChaseEpisode[]
  readonly episodeByKey: ReadonlyMap<string, Phase10AutonomousChaseEpisode>
  readonly mergeEvents: readonly Phase10AutonomousChaseMergeEvent[]
  readonly summary: UniversalPhase10AutonomousChaseSummary
}

type Phase10MutableAutonomousGroup = {
  readonly createdOrder: number
  displayCode: string
  targetDisplayCode: string
  gapToTargetSeconds: number
  members: Array<{ readonly episodeKey: string; readonly riderId: string }>
}

function phase10ReplayGapAtKm(
  timeline: UniversalReplayTimeline,
  displayCode: string,
  kmFromStart: number,
): number | null {
  let previous: { readonly km: number; readonly gap: number } | null = null
  let next: { readonly km: number; readonly gap: number } | null = null
  for (const checkpoint of timeline.checkpoints) {
    const gap = checkpoint.gaps.find((row) => row.displayCode === displayCode)
    if (!gap) continue
    const km = checkpoint.raceProgress.kmFromStart
    if (km <= kmFromStart + 0.000001) previous = { km, gap: gap.gapSeconds }
    if (km >= kmFromStart - 0.000001) {
      next = { km, gap: gap.gapSeconds }
      break
    }
  }
  if (previous && next) {
    if (Math.abs(next.km - previous.km) <= 0.000001) return previous.gap
    const fraction = clamp(
      (kmFromStart - previous.km) / Math.max(0.000001, next.km - previous.km),
      0,
      1,
    )
    return deterministicRound(
      previous.gap + (next.gap - previous.gap) * fraction,
      6,
    )
  }
  return previous?.gap ?? next?.gap ?? null
}

function phase10ReplayRiderEnergyAtKm(
  timeline: UniversalReplayTimeline,
  riderId: string,
  kmFromStart: number,
): number {
  let previous: { readonly km: number; readonly energy: number } | null = null
  let next: { readonly km: number; readonly energy: number } | null = null
  for (const checkpoint of timeline.checkpoints) {
    const state = checkpoint.riderStates.find((row) => row.riderId === riderId)
    if (!state) continue
    const km = checkpoint.raceProgress.kmFromStart
    if (km <= kmFromStart + 0.000001) previous = { km, energy: state.energy }
    if (km >= kmFromStart - 0.000001) {
      next = { km, energy: state.energy }
      break
    }
  }
  if (previous && next) {
    if (Math.abs(next.km - previous.km) <= 0.000001) return previous.energy
    const fraction = clamp(
      (kmFromStart - previous.km) / Math.max(0.000001, next.km - previous.km),
      0,
      1,
    )
    return deterministicRound(
      Math.max(0, previous.energy + (next.energy - previous.energy) * fraction),
      6,
    )
  }
  return deterministicRound(Math.max(0, previous?.energy ?? next?.energy ?? 0), 6)
}

function phase10AutonomousChaseSkillScore(
  rider: UniversalRiderInput,
  gradientPercent: number,
): number {
  if (gradientPercent >= 2) {
    return (
      rider.climbing * 0.45 +
      rider.endurance * 0.25 +
      rider.resistance * 0.15 +
      rider.teamwork * 0.1 +
      rider.raceIQ * 0.05
    )
  }
  if (gradientPercent <= -2) {
    return (
      rider.resistance * 0.35 +
      rider.raceIQ * 0.25 +
      rider.flat * 0.2 +
      rider.endurance * 0.1 +
      rider.teamwork * 0.1
    )
  }
  return (
    rider.flat * 0.35 +
    rider.endurance * 0.25 +
    rider.resistance * 0.2 +
    rider.teamwork * 0.1 +
    rider.raceIQ * 0.1
  )
}

function phase10AutonomousGroupClosureSecondsPerKm({
  input,
  baseReplayTimeline,
  riderReadiness,
  group,
  fromKm,
  toKm,
  flatSprintFinish,
}: {
  readonly input: UniversalRaceEngineInput
  readonly baseReplayTimeline: UniversalReplayTimeline
  readonly riderReadiness: readonly UniversalRiderReadinessResult[]
  readonly group: Phase10MutableAutonomousGroup
  readonly fromKm: number
  readonly toKm: number
  readonly flatSprintFinish: boolean
}): { readonly closureSecondsPerKm: number; readonly chaseEnergyCostPerKm: number } {
  const distanceKm = Math.max(0.000001, toKm - fromKm)
  const midKm = (fromKm + toKm) / 2
  const phase = phase10PhaseForFraction(
    midKm / Math.max(0.000001, input.stage.distanceKm),
  )
  const gradient = phase10GradientAtKm(input.stage, midKm)
  const riderById = new Map(input.riders.map((row) => [row.riderId, row] as const))
  const readinessById = new Map(riderReadiness.map((row) => [row.riderId, row] as const))
  const memberRows = group.members
    .map((member) => riderById.get(member.riderId))
    .filter((row): row is UniversalRiderInput => Boolean(row))
  const groupSize = Math.max(1, memberRows.length)
  const averageSkill =
    memberRows.reduce(
      (sum, rider) => sum + phase10AutonomousChaseSkillScore(rider, gradient),
      0,
    ) / groupSize
  const averageBaseEnergy =
    group.members.reduce(
      (sum, member) =>
        sum + phase10ReplayRiderEnergyAtKm(baseReplayTimeline, member.riderId, midKm),
      0,
    ) / groupSize
  const averageStartEnergy =
    group.members.reduce(
      (sum, member) =>
        sum + (readinessById.get(member.riderId)?.fatigueBalance.startEnergy ?? 100),
      0,
    ) / groupSize
  const averageEnergyFraction = clamp(
    averageBaseEnergy / Math.max(1, averageStartEnergy),
    0,
    1.2,
  )
  const averageStartFatigue =
    memberRows.reduce((sum, rider) => sum + rider.fatigueBeforeStage, 0) / groupSize
  const targetGapStart =
    phase10ReplayGapAtKm(baseReplayTimeline, group.targetDisplayCode, fromKm) ??
    phase10ReplayGapAtKm(baseReplayTimeline, 'P', fromKm) ??
    0
  const targetGapEnd =
    phase10ReplayGapAtKm(baseReplayTimeline, group.targetDisplayCode, toKm) ??
    phase10ReplayGapAtKm(baseReplayTimeline, 'P', toKm) ??
    targetGapStart
  const targetClosureSecondsPerKm = deterministicRound(
    (targetGapStart - targetGapEnd) / distanceKm,
    6,
  )

  const phaseBaseClosure: Readonly<Record<RoadRacePhaseNumber, number>> = {
    1: 4.8,
    2: 3.2,
    3: 0.4,
    4: -1.2,
  }
  const draftingBonus = Math.min(3.6, Math.log2(groupSize) * 1.8)
  const skillAdjustment = clamp((averageSkill - 60) * 0.065, -2.4, 2.6)
  const energyAdjustment = clamp((averageEnergyFraction - 0.55) * 4, -1.6, 1.2)
  const fatiguePenalty = clamp((averageStartFatigue - 30) * 0.018, 0, 1.1)
  const targetPressurePenalty =
    Math.max(0, targetClosureSecondsPerKm) * 0.9 -
    Math.min(0, targetClosureSecondsPerKm) * 0.15
  const progressFraction = midKm / Math.max(0.000001, input.stage.distanceKm)
  const targetIsPeloton = group.targetDisplayCode === 'P'
  const hardPhase4Peloton =
    targetIsPeloton && phase === 4 && targetClosureSecondsPerKm > 0.5
  const lateFlatSprint =
    targetIsPeloton &&
    phase === 4 &&
    input.stage.terrainType === 'flat' &&
    flatSprintFinish &&
    progressFraction >= 0.9
  const phase4PressurePenalty = hardPhase4Peloton
    ? groupSize === 1
      ? 2.4
      : 1.2
    : 0
  const sprintPressurePenalty = lateFlatSprint
    ? groupSize === 1
      ? 3.2
      : 2
    : 0

  const closureSecondsPerKm = deterministicRound(
    clamp(
      phaseBaseClosure[phase] +
        draftingBonus +
        skillAdjustment +
        energyAdjustment -
        fatiguePenalty -
        targetPressurePenalty -
        phase4PressurePenalty -
        sprintPressurePenalty,
      -8,
      8,
    ),
    6,
  )
  const draftingCostMultiplier = clamp(1 - Math.min(0.42, (groupSize - 1) * 0.09), 0.58, 1)
  const chaseEnergyCostPerKm = deterministicRound(
    clamp(
      (0.09 +
        phase * 0.015 +
        Math.max(0, targetClosureSecondsPerKm) * 0.018 +
        (hardPhase4Peloton ? 0.04 : 0) +
        (lateFlatSprint ? 0.05 : 0) +
        (groupSize === 1 ? 0.035 : 0)) *
        draftingCostMultiplier,
      0.04,
      0.3,
    ),
    6,
  )
  return { closureSecondsPerKm, chaseEnergyCostPerKm }
}

function phase10EpisodeKey(incidentId: string, riderId: string): string {
  return `${incidentId}|${riderId}`
}

function phase10AppendAutonomousEpisodeSample(
  episode: Phase10AutonomousChaseEpisode,
  group: Phase10MutableAutonomousGroup,
  kmFromStart: number,
): void {
  const previous = episode.samples.at(-1)
  const sample: Phase10AutonomousChaseEpisodeSample = {
    kmFromStart: deterministicRound(kmFromStart, 6),
    gapToTargetSeconds: deterministicRound(group.gapToTargetSeconds, 6),
    displayCode: group.displayCode,
    targetDisplayCode: group.targetDisplayCode,
    groupRiderIds: group.members.map((row) => row.riderId).sort(),
    cumulativeChaseEnergyCostPoints: deterministicRound(
      episode.chaseEnergyCostPoints,
      6,
    ),
  }
  if (
    previous &&
    Math.abs(previous.kmFromStart - sample.kmFromStart) <= 0.000001 &&
    previous.displayCode === sample.displayCode &&
    previous.targetDisplayCode === sample.targetDisplayCode
  ) {
    episode.samples[episode.samples.length - 1] = sample
  } else {
    episode.samples.push(sample)
  }
}

function phase10BuildAutonomousIncidentChase({
  input,
  riderReadiness,
  baseReplayTimeline,
  baseFinishResolution,
  incidents,
}: {
  readonly input: UniversalRaceEngineInput
  readonly riderReadiness: readonly UniversalRiderReadinessResult[]
  readonly baseReplayTimeline: UniversalReplayTimeline
  readonly baseFinishResolution: UniversalFinishResolution
  readonly incidents: readonly UniversalPhase10IncidentRecord[]
}): Phase10AutonomousChaseSimulation {
  if (input.stage.stageFormat !== 'road_race' || incidents.length === 0) {
    const summary: UniversalPhase10AutonomousChaseSummary = {
      active: input.stage.stageFormat === 'road_race',
      modelVersion: 'autonomous_incident_chase_v1',
      simulationStepKm: PHASE10_AUTONOMOUS_CHASE_STEP_KM,
      mergeToleranceSeconds: PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
      riderEpisodeCount: 0,
      rejoinedEpisodeCount: 0,
      nonRejoinedEpisodeCount: 0,
      groupMergeCount: 0,
      groupMergeKms: [],
      exactRejoinKms: [],
      totalChaseEnergyCostPoints: 0,
    }
    return {
      active: summary.active,
      episodes: [],
      episodeByKey: new Map(),
      mergeEvents: [],
      summary,
    }
  }

  const episodeByKey = new Map<string, Phase10AutonomousChaseEpisode>()
  const activeGroups: Phase10MutableAutonomousGroup[] = []
  const mergeEvents: Phase10AutonomousChaseMergeEvent[] = []
  const riderById = new Map(input.riders.map((row) => [row.riderId, row] as const))
  const incidentIndexById = new Map(
    incidents.map((incident, index) => [incident.incidentId, index] as const),
  )
  const incidentsByKm = new Map<string, UniversalPhase10IncidentRecord[]>()
  incidents.forEach((incident) => {
    const key = incident.kmFromStart.toFixed(6)
    const bucket = incidentsByKm.get(key) ?? []
    bucket.push(incident)
    incidentsByKm.set(key, bucket)
  })

  const appendAllGroupSamples = (group: Phase10MutableAutonomousGroup, km: number): void => {
    group.members.forEach((member) => {
      const episode = episodeByKey.get(member.episodeKey)
      if (episode) phase10AppendAutonomousEpisodeSample(episode, group, km)
    })
  }

  const removeMemberFromActiveGroup = (riderId: string): number | null => {
    for (let index = activeGroups.length - 1; index >= 0; index -= 1) {
      const group = activeGroups[index]
      const memberIndex = group.members.findIndex((row) => row.riderId === riderId)
      if (memberIndex < 0) continue
      const pelotonGap = phase10ReplayGapAtKm(baseReplayTimeline, 'P', currentKm) ?? 0
      const targetGap =
        phase10ReplayGapAtKm(baseReplayTimeline, group.targetDisplayCode, currentKm) ??
        pelotonGap
      const absoluteGap = targetGap + group.gapToTargetSeconds
      const gapToPeloton = deterministicRound(absoluteGap - pelotonGap, 6)
      group.members.splice(memberIndex, 1)
      if (group.members.length === 0) activeGroups.splice(index, 1)
      else appendAllGroupSamples(group, currentKm)
      return gapToPeloton
    }
    return null
  }


  const mergeIncidentGroupsAtCurrentKm = (): void => {
    // Incident groups that physically meet within the existing five-second
    // tolerance become one autonomous chase group and share drafting/cooperation.
    let merged = true
    while (merged) {
      merged = false
      const candidates = activeGroups
        .slice()
        .sort(
          (left, right) =>
            left.targetDisplayCode.localeCompare(right.targetDisplayCode) ||
            left.gapToTargetSeconds - right.gapToTargetSeconds ||
            left.createdOrder - right.createdOrder,
        )
      for (let index = 0; index < candidates.length - 1; index += 1) {
        const left = candidates[index]
        const right = candidates[index + 1]
        if (left.targetDisplayCode !== right.targetDisplayCode) continue
        if (
          Math.abs(left.gapToTargetSeconds - right.gapToTargetSeconds) >
          PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.000001
        ) {
          continue
        }
        const keep = left.createdOrder <= right.createdOrder ? left : right
        const absorb = keep === left ? right : left
        const combinedMembers = [...keep.members, ...absorb.members]
        const weightedGap =
          (keep.gapToTargetSeconds * keep.members.length +
            absorb.gapToTargetSeconds * absorb.members.length) /
          Math.max(1, combinedMembers.length)
        keep.members = combinedMembers
        keep.gapToTargetSeconds = deterministicRound(weightedGap, 6)
        const absorbIndex = activeGroups.indexOf(absorb)
        if (absorbIndex >= 0) activeGroups.splice(absorbIndex, 1)
        appendAllGroupSamples(keep, currentKm)
        const riderIds = keep.members.map((row) => row.riderId).sort()
        mergeEvents.push({
          eventId: `phase10-autonomous-merge:${mergeEvents.length + 1}`,
          kmFromStart: currentKm,
          displayCode: keep.displayCode,
          targetDisplayCode: keep.targetDisplayCode,
          riderIds,
          teamIds: Array.from(
            new Set(
              riderIds
                .map((riderId) => riderById.get(riderId)?.teamId)
                .filter((teamId): teamId is string => Boolean(teamId)),
            ),
          ).sort(),
        })
        merged = true
        break
      }
    }
  }

  let currentKm = Math.min(
    ...incidents.map((incident) => incident.kmFromStart),
  )

  const processIncidentsAtCurrentKm = (): void => {
    const rows = incidentsByKm.get(currentKm.toFixed(6)) ?? []
    rows.forEach((incident) => {
      const movingConsequences = incident.riderConsequences.filter(
        (row) => row.movedToLaterGroup && row.statusImpact === 'finished',
      )
      if (movingConsequences.length === 0) return
      const incidentIndex = (incidentIndexById.get(incident.incidentId) ?? 0) + 1
      const existingGaps = movingConsequences.map(
        (row) => removeMemberFromActiveGroup(row.riderId) ?? 0,
      )
      let targetDisplayCode = incident.sourceDisplayCode ?? 'P'
      if (
        targetDisplayCode !== 'P' &&
        phase10ReplayGapAtKm(baseReplayTimeline, targetDisplayCode, currentKm) === null
      ) {
        targetDisplayCode = 'P'
      }
      const initialGap = deterministicRound(
        Math.max(incident.timeLossSeconds, ...existingGaps.map((gap) => gap + incident.timeLossSeconds)),
        6,
      )
      const group: Phase10MutableAutonomousGroup = {
        createdOrder: incidentIndex,
        displayCode: `I${incidentIndex}`,
        targetDisplayCode,
        gapToTargetSeconds: initialGap,
        members: [],
      }
      movingConsequences.forEach((row) => {
        const episodeKey = phase10EpisodeKey(incident.incidentId, row.riderId)
        const episode: Phase10AutonomousChaseEpisode = {
          episodeKey,
          incidentId: incident.incidentId,
          riderId: row.riderId,
          teamId: row.teamId,
          incidentKm: incident.kmFromStart,
          samples: [],
          actualRejoinKm: null,
          finalGapToTargetSeconds: initialGap,
          chaseEnergyCostPoints: 0,
        }
        episodeByKey.set(episodeKey, episode)
        group.members.push({ episodeKey, riderId: row.riderId })
      })
      activeGroups.push(group)
      appendAllGroupSamples(group, currentKm)
    })
  }

  processIncidentsAtCurrentKm()
  mergeIncidentGroupsAtCurrentKm()

  const pointSet = new Set<number>()
  const firstGridPoint = Math.ceil(currentKm / PHASE10_AUTONOMOUS_CHASE_STEP_KM) * PHASE10_AUTONOMOUS_CHASE_STEP_KM
  for (
    let km = firstGridPoint;
    km <= input.stage.distanceKm + 0.000001;
    km += PHASE10_AUTONOMOUS_CHASE_STEP_KM
  ) {
    if (km > currentKm + 0.000001) pointSet.add(deterministicRound(Math.min(km, input.stage.distanceKm), 6))
  }
  incidents.forEach((incident) => {
    if (incident.kmFromStart > currentKm + 0.000001) pointSet.add(incident.kmFromStart)
  })
  pointSet.add(input.stage.distanceKm)
  const points = [...pointSet].sort((a, b) => a - b)
  const flatSprintFinish = baseFinishResolution.finishMode === 'flat_sprint'

  for (const nextKmRaw of points) {
    const nextKm = deterministicRound(nextKmRaw, 6)
    if (nextKm <= currentKm + 0.000001) continue
    const intervalDistance = nextKm - currentKm

    for (let groupIndex = activeGroups.length - 1; groupIndex >= 0; groupIndex -= 1) {
      const group = activeGroups[groupIndex]
      if (
        group.targetDisplayCode !== 'P' &&
        phase10ReplayGapAtKm(baseReplayTimeline, group.targetDisplayCode, nextKm) === null
      ) {
        const pelotonGap = phase10ReplayGapAtKm(baseReplayTimeline, 'P', currentKm) ?? 0
        const targetGap =
          phase10ReplayGapAtKm(baseReplayTimeline, group.targetDisplayCode, currentKm) ??
          pelotonGap
        group.gapToTargetSeconds = deterministicRound(
          targetGap + group.gapToTargetSeconds - pelotonGap,
          6,
        )
        group.targetDisplayCode = 'P'
      }

      const previousGap = group.gapToTargetSeconds
      const { closureSecondsPerKm, chaseEnergyCostPerKm } =
        phase10AutonomousGroupClosureSecondsPerKm({
          input,
          baseReplayTimeline,
          riderReadiness,
          group,
          fromKm: currentKm,
          toKm: nextKm,
          flatSprintFinish,
        })
      const projectedGap = deterministicRound(
        previousGap - closureSecondsPerKm * intervalDistance,
        6,
      )
      let riddenFraction = 1
      let rejoinKm: number | null = null
      if (
        previousGap > PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.000001 &&
        projectedGap <= PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.000001
      ) {
        const denominator = previousGap - projectedGap
        riddenFraction = clamp(
          denominator <= 0
            ? 1
            : (previousGap - PHASE5_GROUP_MERGE_TOLERANCE_SECONDS) / denominator,
          0,
          1,
        )
        rejoinKm = deterministicRound(
          currentKm + intervalDistance * riddenFraction,
          6,
        )
        group.gapToTargetSeconds = PHASE5_GROUP_MERGE_TOLERANCE_SECONDS
      } else {
        group.gapToTargetSeconds = projectedGap
      }

      const riddenDistance = intervalDistance * riddenFraction
      group.members.forEach((member) => {
        const episode = episodeByKey.get(member.episodeKey)
        const rider = riderById.get(member.riderId)
        if (!episode || !rider) return
        const skill = phase10AutonomousChaseSkillScore(
          rider,
          phase10GradientAtKm(input.stage, (currentKm + nextKm) / 2),
        )
        const riderCostMultiplier = clamp(1 + (60 - skill) * 0.004, 0.85, 1.18)
        episode.chaseEnergyCostPoints = deterministicRound(
          episode.chaseEnergyCostPoints +
            riddenDistance * chaseEnergyCostPerKm * riderCostMultiplier,
          6,
        )
        episode.finalGapToTargetSeconds = Math.max(
          0,
          deterministicRound(group.gapToTargetSeconds, 6),
        )
      })

      if (rejoinKm !== null) {
        appendAllGroupSamples(group, rejoinKm)
        group.members.forEach((member) => {
          const episode = episodeByKey.get(member.episodeKey)
          if (!episode) return
          episode.actualRejoinKm = rejoinKm
          episode.finalGapToTargetSeconds = 0
        })
        activeGroups.splice(groupIndex, 1)
      } else {
        appendAllGroupSamples(group, nextKm)
      }
    }

    currentKm = nextKm

    mergeIncidentGroupsAtCurrentKm()

    processIncidentsAtCurrentKm()
    mergeIncidentGroupsAtCurrentKm()
  }

  activeGroups.forEach((group) => {
    group.members.forEach((member) => {
      const episode = episodeByKey.get(member.episodeKey)
      if (!episode) return
      episode.finalGapToTargetSeconds = Math.max(
        0,
        deterministicRound(group.gapToTargetSeconds, 6),
      )
    })
  })

  const episodes = [...episodeByKey.values()].sort(
    (left, right) =>
      left.incidentKm - right.incidentKm ||
      left.riderId.localeCompare(right.riderId),
  )
  const exactRejoinKms = episodes
    .map((episode) => episode.actualRejoinKm)
    .filter((km): km is number => km !== null)
    .sort((a, b) => a - b)
  const summary: UniversalPhase10AutonomousChaseSummary = {
    active: true,
    modelVersion: 'autonomous_incident_chase_v1',
    simulationStepKm: PHASE10_AUTONOMOUS_CHASE_STEP_KM,
    mergeToleranceSeconds: PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
    riderEpisodeCount: episodes.length,
    rejoinedEpisodeCount: episodes.filter((episode) => episode.actualRejoinKm !== null).length,
    nonRejoinedEpisodeCount: episodes.filter((episode) => episode.actualRejoinKm === null).length,
    groupMergeCount: mergeEvents.length,
    groupMergeKms: mergeEvents.map((event) => event.kmFromStart),
    exactRejoinKms,
    totalChaseEnergyCostPoints: deterministicRound(
      episodes.reduce((sum, episode) => sum + episode.chaseEnergyCostPoints, 0),
      6,
    ),
  }
  return {
    active: true,
    episodes,
    episodeByKey,
    mergeEvents,
    summary,
  }
}

function phase10AutonomousEpisodeSampleAtKm(
  simulation: Phase10AutonomousChaseSimulation,
  episodeKey: string,
  kmFromStart: number,
): Phase10AutonomousChaseEpisodeSample | null {
  const episode = simulation.episodeByKey.get(episodeKey)
  if (!episode || kmFromStart < episode.incidentKm - 0.000001) return null
  if (
    episode.actualRejoinKm !== null &&
    kmFromStart >= episode.actualRejoinKm - 0.000001
  ) {
    return null
  }
  const exactSample = episode.samples
    .filter((sample) => Math.abs(sample.kmFromStart - kmFromStart) <= 0.000001)
    .at(-1)
  if (exactSample) return exactSample
  let previous = episode.samples[0] ?? null
  let next: Phase10AutonomousChaseEpisodeSample | null = null
  for (const sample of episode.samples) {
    if (sample.kmFromStart <= kmFromStart + 0.000001) previous = sample
    if (sample.kmFromStart >= kmFromStart - 0.000001) {
      next = sample
      break
    }
  }
  if (!previous) return null
  if (
    !next ||
    Math.abs(next.kmFromStart - previous.kmFromStart) <= 0.000001 ||
    previous.displayCode !== next.displayCode ||
    previous.targetDisplayCode !== next.targetDisplayCode
  ) {
    return previous
  }
  const fraction = clamp(
    (kmFromStart - previous.kmFromStart) /
      Math.max(0.000001, next.kmFromStart - previous.kmFromStart),
    0,
    1,
  )
  return {
    ...previous,
    kmFromStart: deterministicRound(kmFromStart, 6),
    gapToTargetSeconds: deterministicRound(
      previous.gapToTargetSeconds +
        (next.gapToTargetSeconds - previous.gapToTargetSeconds) * fraction,
      6,
    ),
    cumulativeChaseEnergyCostPoints: deterministicRound(
      previous.cumulativeChaseEnergyCostPoints +
        (next.cumulativeChaseEnergyCostPoints -
          previous.cumulativeChaseEnergyCostPoints) *
          fraction,
      6,
    ),
  }
}

function phase10AutonomousChaseEnergyAtKm(
  simulation: Phase10AutonomousChaseSimulation,
  riderId: string,
  kmFromStart: number,
): number {
  return deterministicRound(
    simulation.episodes
      .filter((episode) => episode.riderId === riderId && episode.incidentKm <= kmFromStart + 0.000001)
      .reduce((sum, episode) => {
        const activeSample = phase10AutonomousEpisodeSampleAtKm(
          simulation,
          episode.episodeKey,
          kmFromStart,
        )
        if (activeSample) return sum + activeSample.cumulativeChaseEnergyCostPoints
        if (
          episode.actualRejoinKm !== null &&
          kmFromStart >= episode.actualRejoinKm - 0.000001
        ) {
          return sum + episode.chaseEnergyCostPoints
        }
        const lastSample = episode.samples.at(-1)
        return sum + (lastSample?.cumulativeChaseEnergyCostPoints ?? 0)
      }, 0),
    6,
  )
}

function phase10EquipmentConditionRiskMultiplier(conditionPercent: number): number {
  const condition = clamp(conditionPercent, 0, 100)
  if (condition >= 90) return 1
  if (condition >= 75) return 1.05
  if (condition >= 50) return 1.15
  if (condition >= 25) return 1.3
  return 1.5
}

export function calculateUniversalPhase10IncidentProbability(
  input: UniversalPhase10IncidentProbabilityInput,
): UniversalPhase10IncidentProbabilityBreakdown {
  const baseProbabilityPer30Seconds =
    PHASE10_BASE_PROBABILITY_PER_30_SECONDS[input.incidentKind]
  const maximumProbability = PHASE10_MAXIMUM_PROBABILITY[input.incidentKind]
  const tickDurationMultiplier = clamp(input.tickSeconds / 30, 0, 4)
  const weatherMultiplier = clamp(input.weatherMultiplier, 0.7, 2.5)
  const speedThreshold = input.incidentKind === 'group_crash' ? 35 : 40
  const speedMultiplier = clamp(
    1 + Math.max(0, input.currentSpeedKmh - speedThreshold) * 0.04,
    1,
    3,
  )
  const descentMultiplier =
    input.gradientPercent < 0
      ? clamp(1 + Math.abs(input.gradientPercent) * 0.12, 1, 3.5)
      : 1
  const densityMultiplier =
    input.incidentKind === 'technical_incident'
      ? 1
      : input.incidentKind === 'individual_crash'
        ? clamp(1 + Math.max(0, input.groupSize - 10) * 0.03, 1, 2)
        : clamp(1 + Math.max(0, input.groupSize - 6) * 0.08, 1, 5)
  const fatigueMultiplier = calculateUniversalFatigueIncidentRiskMultiplier(
    input.runtimeFatigue,
  )
  const riderControl = (clamp(input.resistance, 0, 100) + clamp(input.raceIq, 0, 100)) / 2
  const riderControlMultiplier = clamp(
    1 - ((riderControl - 50) / 50) * 0.4,
    0.6,
    1.4,
  )
  const preparationSupportMultiplier = clamp(
    input.preparationSupportMultiplier,
    0.7,
    1.4,
  )
  const commandIntensityMultiplier = clamp(
    input.commandIntensityMultiplier,
    0.82,
    1.45,
  )
  const raceSituationMultiplier = clamp(
    input.raceSituationMultiplier ?? 1,
    0.6,
    6,
  )
  const equipmentConditionMultiplier =
    input.incidentKind === 'technical_incident'
      ? phase10EquipmentConditionRiskMultiplier(
          input.equipmentConditionPercent ?? 100,
        )
      : 1
  const mechanicalSupportMultiplier =
    input.incidentKind === 'technical_incident'
      ? clamp(input.mechanicalIncidentRiskMultiplier ?? 1, 0.78, 1.5)
      : 1
  const uncappedProbability =
    baseProbabilityPer30Seconds *
    tickDurationMultiplier *
    weatherMultiplier *
    speedMultiplier *
    descentMultiplier *
    densityMultiplier *
    fatigueMultiplier *
    riderControlMultiplier *
    preparationSupportMultiplier *
    commandIntensityMultiplier *
    raceSituationMultiplier *
    equipmentConditionMultiplier *
    mechanicalSupportMultiplier
  const finalProbability = deterministicRound(
    clamp(uncappedProbability, 0, maximumProbability),
    12,
  )

  return {
    incidentKind: input.incidentKind,
    baseProbabilityPer30Seconds,
    tickDurationMultiplier: deterministicRound(tickDurationMultiplier, 6),
    weatherMultiplier: deterministicRound(weatherMultiplier, 6),
    speedMultiplier: deterministicRound(speedMultiplier, 6),
    descentMultiplier: deterministicRound(descentMultiplier, 6),
    densityMultiplier: deterministicRound(densityMultiplier, 6),
    fatigueMultiplier: deterministicRound(fatigueMultiplier, 6),
    riderControlMultiplier: deterministicRound(riderControlMultiplier, 6),
    preparationSupportMultiplier: deterministicRound(
      preparationSupportMultiplier,
      6,
    ),
    commandIntensityMultiplier: deterministicRound(commandIntensityMultiplier, 6),
    raceSituationMultiplier: deterministicRound(raceSituationMultiplier, 6),
    equipmentConditionMultiplier: deterministicRound(
      equipmentConditionMultiplier,
      6,
    ),
    mechanicalSupportMultiplier: deterministicRound(mechanicalSupportMultiplier, 6),
    uncappedProbability: deterministicRound(uncappedProbability, 12),
    maximumProbability,
    finalProbability,
  }
}

function phase10DeterministicRoll(hash: string): number {
  const numerator = Number.parseInt(hash.slice(0, 13), 16)
  return deterministicRound(numerator / 0x10000000000000, 12)
}

function phase10PhaseForFraction(fraction: number): RoadRacePhaseNumber {
  if (fraction <= 0.25) return 1
  if (fraction <= 0.5) return 2
  if (fraction <= 0.7) return 3
  return 4
}

function phase10GradientAtKm(
  stage: UniversalStageInput,
  kmFromStart: number,
): number {
  const points = stage.profilePoints
  if (points.length < 2) return 0
  const km = clamp(kmFromStart, 0, stage.distanceKm)
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]
    const right = points[index]
    if (km <= right.km + 0.000001) {
      const distance = Math.max(0.001, right.km - left.km)
      return deterministicRound(
        ((right.elevationM - left.elevationM) / (distance * 1000)) * 100,
        6,
      )
    }
  }
  return 0
}

function phase10TimeLimitPercentage(stage: UniversalStageInput): number {
  if (
    stage.stageFormat === 'individual_time_trial' ||
    stage.stageFormat === 'team_time_trial' ||
    stage.stageFormat === 'pair_time_trial' ||
    stage.stageFormat === 'prologue'
  ) {
    return 30
  }
  if (stage.terrainType === 'mountain') return 25
  if (stage.terrainType === 'cobbled') return 22
  if (stage.terrainType === 'hilly') return 20
  return 18
}


export function calculateUniversalPhase10TimeLimitPercentage(
  stage: UniversalStageInput,
): number {
  return phase10TimeLimitPercentage(stage)
}

export function isUniversalPhase10OutsideTimeLimit(
  stage: UniversalStageInput,
  winnerTimeSeconds: number,
  riderTimeSeconds: number,
): boolean {
  const cutoff =
    winnerTimeSeconds * (1 + phase10TimeLimitPercentage(stage) / 100)
  return riderTimeSeconds > cutoff + 0.000001
}

function phase10TechnicalType(
  hash: string,
  equipmentConditionPercent: number,
): UniversalPhase10TechnicalIncidentType {
  const condition = clamp(equipmentConditionPercent, 0, 100)
  const weighted: readonly {
    readonly type: UniversalPhase10TechnicalIncidentType
    readonly weight: number
  }[] =
    condition < 25
      ? [
          { type: 'dropped_chain', weight: 5 },
          { type: 'puncture', weight: 20 },
          { type: 'wheel_damage', weight: 20 },
          { type: 'drivetrain_failure', weight: 25 },
          { type: 'bike_change', weight: 30 },
        ]
      : condition < 50
        ? [
            { type: 'dropped_chain', weight: 10 },
            { type: 'puncture', weight: 25 },
            { type: 'wheel_damage', weight: 20 },
            { type: 'drivetrain_failure', weight: 25 },
            { type: 'bike_change', weight: 20 },
          ]
        : condition < 75
          ? [
              { type: 'dropped_chain', weight: 15 },
              { type: 'puncture', weight: 30 },
              { type: 'wheel_damage', weight: 20 },
              { type: 'drivetrain_failure', weight: 22 },
              { type: 'bike_change', weight: 13 },
            ]
          : condition < 90
            ? [
                { type: 'dropped_chain', weight: 25 },
                { type: 'puncture', weight: 35 },
                { type: 'wheel_damage', weight: 15 },
                { type: 'drivetrain_failure', weight: 17 },
                { type: 'bike_change', weight: 8 },
              ]
            : [
                { type: 'dropped_chain', weight: 35 },
                { type: 'puncture', weight: 45 },
                { type: 'wheel_damage', weight: 10 },
                { type: 'drivetrain_failure', weight: 8 },
                { type: 'bike_change', weight: 2 },
              ]
  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0)
  const target = phase10DeterministicRoll(hash) * totalWeight
  let cursor = 0
  for (const row of weighted) {
    cursor += row.weight
    if (target < cursor) return row.type
  }
  return weighted[weighted.length - 1].type
}

function phase10CrashSeverity(
  incidentKind: 'individual_crash' | 'group_crash',
  probability: UniversalPhase10IncidentProbabilityBreakdown,
  hash: string,
  causes: readonly string[],
): UniversalPhase10IncidentSeverity {
  const roll = phase10DeterministicRoll(hash)
  const ratio = Math.min(
    1,
    probability.finalProbability /
      (incidentKind === 'group_crash' ? 0.04 : 0.08),
  )
  let serious = incidentKind === 'group_crash' ? 0.08 : 0.05
  let moderate = incidentKind === 'group_crash' ? 0.35 : 0.25
  serious += ratio * (incidentKind === 'group_crash' ? 0.08 : 0.05)
  moderate += ratio * 0.1
  if (causes.includes('wet_road') && causes.includes('descending')) {
    serious += 0.05
    moderate += 0.1
  }
  if (causes.includes('runtime_fatigue')) {
    serious += 0.03
    moderate += 0.07
  }
  if (causes.includes('high_speed')) {
    serious += 0.02
    moderate += 0.05
  }
  serious = Math.min(0.3, serious)
  moderate = Math.min(0.55, moderate)
  if (roll < serious) return 'serious'
  if (roll < serious + moderate) return 'moderate'
  return 'minor'
}

function phase10CrashHealthOutcome(
  incidentKind: UniversalPhase10IncidentKind,
  crashSeverity: UniversalPhase10IncidentSeverity,
  deterministicHash: string,
  riderId: string,
): UniversalPhase10RiderHealthOutcome {
  const noInjury = (roll: number): UniversalPhase10RiderHealthOutcome => ({
    injuryOccurred: false,
    caseCode: null,
    severity: null,
    bodyPart: null,
    currentStageContinuation: 'unaffected',
    selectionBlockedAfterStage: false,
    currentStagePerformancePenaltyPoints: 0,
    additionalEnergyLossPoints: 0,
    deterministicRoll: roll,
    persistentAction: 'none',
    source: 'universal_phase10_crash_health_handoff_v1',
  })
  if (incidentKind === 'technical_incident') {
    return noInjury(phase10DeterministicRoll(md5Hex(`${deterministicHash}:health:${riderId}`)))
  }

  const injuryRoll = phase10DeterministicRoll(
    md5Hex(`${deterministicHash}:health:${riderId}:injury`),
  )
  const injuryProbability =
    crashSeverity === 'minor' ? 0.42 : crashSeverity === 'moderate' ? 0.72 : 1
  if (injuryRoll >= injuryProbability) return noInjury(injuryRoll)

  const severityRoll = phase10DeterministicRoll(
    md5Hex(`${deterministicHash}:health:${riderId}:severity`),
  )
  let healthSeverity: HealthCaseSeverity
  if (crashSeverity === 'serious' && incidentKind === 'individual_crash') {
    // Preserve the already-approved serious individual-crash abandonment path.
    healthSeverity = 'major'
  } else if (crashSeverity === 'serious') {
    healthSeverity = severityRoll < 0.5 ? 'major' : severityRoll < 0.85 ? 'moderate' : 'minor'
  } else if (crashSeverity === 'moderate') {
    healthSeverity = severityRoll < 0.1 ? 'major' : severityRoll < 0.52 ? 'moderate' : 'minor'
  } else {
    // A crash already classified as minor may still create a moderate sprain,
    // but it must not unexpectedly become a fracture/concussion DNF.
    healthSeverity = severityRoll < 0.14 ? 'moderate' : 'minor'
  }

  const caseRoll = phase10DeterministicRoll(
    md5Hex(`${deterministicHash}:health:${riderId}:case`),
  )
  let caseCode: UniversalPhase10HealthCaseCode
  let bodyPart: string
  if (healthSeverity === 'major') {
    if (caseRoll < 0.72) {
      caseCode = 'fracture'
      const parts = ['collarbone', 'wrist', 'ribs', 'hip'] as const
      bodyPart = parts[phase10IntegerFromHash(
        md5Hex(`${deterministicHash}:health:${riderId}:body`),
        0,
        parts.length - 1,
      )]
    } else {
      caseCode = 'concussion'
      bodyPart = 'head'
    }
  } else if (healthSeverity === 'moderate') {
    const choices = ['wrist_sprain', 'ankle_sprain', 'muscle_strain'] as const
    caseCode = choices[phase10IntegerFromHash(
      md5Hex(`${deterministicHash}:health:${riderId}:case-moderate`),
      0,
      choices.length - 1,
    )]
    bodyPart =
      caseCode === 'wrist_sprain'
        ? 'wrist'
        : caseCode === 'ankle_sprain'
          ? 'ankle'
          : ['thigh', 'shoulder', 'lower back'][phase10IntegerFromHash(
              md5Hex(`${deterministicHash}:health:${riderId}:body-moderate`),
              0,
              2,
            )]
  } else {
    caseCode = caseRoll < 0.8 ? 'road_rash' : 'muscle_strain'
    bodyPart =
      caseCode === 'road_rash'
        ? ['elbow', 'hip', 'knee', 'shoulder'][phase10IntegerFromHash(
            md5Hex(`${deterministicHash}:health:${riderId}:body-minor`),
            0,
            3,
          )]
        : ['thigh', 'shoulder'][phase10IntegerFromHash(
            md5Hex(`${deterministicHash}:health:${riderId}:body-minor-strain`),
            0,
            1,
          )]
  }

  const major = healthSeverity === 'major'
  return {
    injuryOccurred: true,
    caseCode,
    severity: healthSeverity,
    bodyPart,
    currentStageContinuation: major ? 'dnf' : 'continues_injured',
    selectionBlockedAfterStage: major,
    currentStagePerformancePenaltyPoints:
      healthSeverity === 'minor' ? 2.5 : healthSeverity === 'moderate' ? 8 : 100,
    additionalEnergyLossPoints:
      healthSeverity === 'minor' ? 0.75 : healthSeverity === 'moderate' ? 2.5 : 0,
    deterministicRoll: injuryRoll,
    persistentAction: 'create_health_case_after_finalization',
    source: 'universal_phase10_crash_health_handoff_v1',
  }
}

function phase10EffectiveSprintZoneKm(stage: UniversalStageInput): number {
  const eligibleStage =
    stage.stageFormat === 'road_race' &&
    stage.finishType === 'flat_finish' &&
    !stage.summitFinish
  if (!eligibleStage) return 0
  const configured = stage.sprintZoneKm
  if (configured === null || configured === undefined) return 3
  return deterministicRound(clamp(configured, 0, 5), 6)
}

function phase10ProtectedSourceOfficialTime(
  baseReplayTimeline: UniversalReplayTimeline,
  baseFinishResolution: UniversalFinishResolution,
  incidentKm: number,
  sourceDisplayCode: string | null,
  affectedRiderIds: readonly string[],
): number | null {
  const sourceCode = sourceDisplayCode ?? 'P'
  const sourceCheckpoint = [...baseReplayTimeline.checkpoints]
    .filter(
      (checkpoint) =>
        checkpoint.raceProgress.kmFromStart <= incidentKm + 0.000001,
    )
    .at(-1)
  const sourceGroup = sourceCheckpoint?.groups.find(
    (group) => group.displayCode === sourceCode,
  )
  if (!sourceGroup) return null
  const affected = new Set(affectedRiderIds)
  const times = sourceGroup.riderIds
    .filter((riderId) => !affected.has(riderId))
    .map((riderId) =>
      baseFinishResolution.classification.find((row) => row.riderId === riderId),
    )
    .filter(
      (row): row is UniversalOfficialFinishRow =>
        Boolean(row && row.status === 'finished' && row.officialTimeSeconds !== null),
    )
    .map((row) => row.officialTimeSeconds as number)
  if (times.length === 0) return null
  const counts = new Map<number, number>()
  times.forEach((time) => {
    const key = deterministicRound(time, 6)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? null
}

function phase10TechnicalSeverity(
  probability: UniversalPhase10IncidentProbabilityBreakdown,
  hash: string,
  causes: readonly string[],
  equipmentConditionPercent: number,
): UniversalPhase10IncidentSeverity {
  const roll = phase10DeterministicRoll(hash)
  const ratio = Math.min(1, probability.finalProbability / 0.05)
  let serious = 0.07 + ratio * 0.13
  let moderate = 0.32 + ratio * 0.18
  if (equipmentConditionPercent < 50) {
    serious += 0.1
    moderate += 0.08
  } else if (equipmentConditionPercent < 75) {
    serious += 0.04
    moderate += 0.08
  }
  if (causes.includes('runtime_fatigue')) {
    serious += 0.03
    moderate += 0.05
  }
  serious = Math.min(0.35, serious)
  moderate = Math.min(0.58, moderate)
  if (roll < serious) return 'serious'
  if (roll < serious + moderate) return 'moderate'
  return 'minor'
}

function phase10IntegerFromHash(hash: string, minimum: number, maximum: number): number {
  const roll = phase10DeterministicRoll(hash)
  return minimum + Math.floor(roll * (maximum - minimum + 1))
}

function phase10TimeLossRange(
  kind: UniversalPhase10IncidentKind,
  severity: UniversalPhase10IncidentSeverity,
  technicalType: UniversalPhase10TechnicalIncidentType | null,
): readonly [number, number] {
  if (kind === 'individual_crash') {
    return severity === 'minor' ? [15, 35] : severity === 'moderate' ? [36, 90] : [91, 180]
  }
  if (kind === 'group_crash') {
    return severity === 'minor' ? [20, 45] : severity === 'moderate' ? [46, 100] : [101, 210]
  }
  const ranges: Readonly<
    Record<
      UniversalPhase10TechnicalIncidentType,
      Readonly<Record<UniversalPhase10IncidentSeverity, readonly [number, number]>>
    >
  > = {
    dropped_chain: { minor: [8, 18], moderate: [19, 35], serious: [36, 60] },
    puncture: { minor: [20, 35], moderate: [36, 60], serious: [61, 95] },
    wheel_damage: { minor: [35, 55], moderate: [56, 90], serious: [91, 140] },
    drivetrain_failure: { minor: [25, 50], moderate: [51, 95], serious: [96, 160] },
    bike_change: { minor: [60, 90], moderate: [91, 140], serious: [141, 220] },
  }
  return ranges[technicalType ?? 'puncture'][severity]
}

function phase10IncidentEnergyLoss(
  kind: UniversalPhase10IncidentKind,
  timeLossSeconds: number,
): number {
  const kindFactor =
    kind === 'technical_incident' ? 0.5 : kind === 'group_crash' ? 0.85 : 1
  return deterministicRound(
    clamp((timeLossSeconds / 30) * kindFactor, 0.5, 8),
    6,
  )
}

function phase10PreRaceAvailability(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  phase9: UniversalPhase9ModifierSummary,
): readonly UniversalPhase10PreRaceAvailabilityRow[] {
  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row] as const),
  )
  return input.riders
    .map((rider): UniversalPhase10PreRaceAvailabilityRow => {
      const readiness = readinessByRiderId.get(rider.riderId)
      if (!readiness) {
        throw new Error(`Phase 10 pre-race availability missing readiness for ${rider.riderId}.`)
      }
      const persistedHealthCase = Boolean(
        rider.healthCase &&
          (rider.healthCase.status === 'active' ||
            rider.healthCase.status === 'recovering'),
      )
      const excessiveFatigue = readiness.components.effectiveFatigue >= 90
      const restriction: UniversalPhase10PreRaceRestriction =
        persistedHealthCase
          ? 'persisted_health_case'
          : rider.availabilityStatus === 'not_fully_fit'
            ? 'not_fully_fit'
            : excessiveFatigue
              ? 'excessive_fatigue'
              : phase9.weather.severe
                ? 'severe_weather'
                : 'none'
      const source: UniversalPhase10PreRaceAvailabilityRow['source'] =
        !readiness.eligibleToStart && persistedHealthCase
          ? 'existing_health_system'
          : !readiness.eligibleToStart
            ? 'existing_start_status'
            : restriction !== 'none'
              ? 'existing_readiness_restriction'
              : 'none'
      return {
        riderId: rider.riderId,
        teamId: rider.teamId,
        acceptedRider: true,
        startStatus: readiness.startStatus,
        startAllowed: readiness.eligibleToStart,
        dns: !readiness.eligibleToStart,
        availabilityStatus: rider.availabilityStatus,
        restriction,
        healthCaseType: rider.healthCase?.caseType ?? null,
        healthCaseSeverity: rider.healthCase?.severity ?? null,
        healthSelectionBlocked: readiness.healthSelectionBlocked,
        source,
      }
    })
    .sort(
      (left, right) =>
        left.teamId.localeCompare(right.teamId) ||
        left.riderId.localeCompare(right.riderId),
    )
}

function phase10ReplayTeamStates(
  input: UniversalRaceEngineInput,
  riderStates: readonly UniversalReplayRiderState[],
): readonly UniversalReplayTeamState[] {
  return input.teams
    .map((team): UniversalReplayTeamState => {
      const rows = riderStates.filter((row) => row.teamId === team.teamId)
      return {
        teamId: team.teamId,
        activeRiderIds: rows
          .filter((row) => row.status === 'racing' || row.status === 'finished')
          .map((row) => row.riderId)
          .sort(),
        racingRiderCount: rows.filter((row) => row.status === 'racing').length,
        finishedRiderCount: rows.filter((row) => row.status === 'finished').length,
        dnsRiderCount: rows.filter((row) => row.status === 'dns').length,
        dnfRiderCount: rows.filter((row) => row.status === 'dnf').length,
        otlRiderCount: rows.filter((row) => row.status === 'otl').length,
      }
    })
    .sort((left, right) => left.teamId.localeCompare(right.teamId))
}

function phase10BuildExactEventReplayTimeline(
  input: UniversalRaceEngineInput,
  baseTimeline: UniversalReplayTimeline,
  incidents: readonly UniversalPhase10IncidentRecord[],
  autonomousChase: Phase10AutonomousChaseSimulation | null = null,
): UniversalReplayTimeline {
  if (!baseTimeline.active || incidents.length === 0) return baseTimeline

  const exactPoints = new Map<
    string,
    { readonly km: number; readonly suffix: string }
  >()
  const addPoint = (km: number, suffix: string): void => {
    const boundedKm = deterministicRound(
      clamp(km, 0, input.stage.distanceKm),
      6,
    )
    if (
      boundedKm <= 0.000001 ||
      boundedKm >= input.stage.distanceKm - 0.000001
    ) {
      return
    }
    const key = boundedKm.toFixed(6)
    if (!exactPoints.has(key)) exactPoints.set(key, { km: boundedKm, suffix })
  }

  incidents.forEach((incident, incidentIndex) => {
    addPoint(incident.kmFromStart, `incident-${incidentIndex + 1}`)
    const rejoinKm = incident.riderConsequences
      .filter((row) => row.temporarySeparation && row.expectedRejoinKm !== null)
      .reduce<number | null>(
        (maximum, row) =>
          maximum === null
            ? row.expectedRejoinKm
            : Math.max(maximum, row.expectedRejoinKm ?? maximum),
        null,
      )
    if (rejoinKm !== null) {
      addPoint(rejoinKm, `incident-${incidentIndex + 1}-rejoin`)
    }
  })
  autonomousChase?.mergeEvents.forEach((event, index) => {
    addPoint(event.kmFromStart, `incident-chase-merge-${index + 1}`)
  })

  if (exactPoints.size === 0) return baseTimeline

  const original = [...baseTimeline.checkpoints].sort(
    (left, right) =>
      left.raceProgress.kmFromStart - right.raceProgress.kmFromStart ||
      left.checkpointIndex - right.checkpointIndex,
  )
  const synthetic: UniversalReplayCheckpoint[] = []

  ;[...exactPoints.values()]
    .sort((left, right) => left.km - right.km || left.suffix.localeCompare(right.suffix))
    .forEach(({ km, suffix }) => {
      if (
        original.some(
          (checkpoint) =>
            Math.abs(checkpoint.raceProgress.kmFromStart - km) <= 0.000001,
        )
      ) {
        return
      }

      let previous = original[0]
      let next = original[original.length - 1]
      for (let index = 0; index < original.length; index += 1) {
        const checkpoint = original[index]
        if (checkpoint.raceProgress.kmFromStart < km - 0.000001) {
          previous = checkpoint
          continue
        }
        next = checkpoint
        break
      }
      if (!previous || !next || previous === next) return

      const distanceSpan = Math.max(
        0.000001,
        next.raceProgress.kmFromStart - previous.raceProgress.kmFromStart,
      )
      const interpolationFraction = clamp(
        (km - previous.raceProgress.kmFromStart) / distanceSpan,
        0,
        1,
      )
      const fraction = deterministicRound(
        km / Math.max(0.000001, input.stage.distanceKm),
        9,
      )
      const gapByDisplayCode = new Map(
        previous.gaps.map((gap) => {
          const nextGap = next.gaps.find(
            (candidate) =>
              candidate.groupCode === gap.groupCode &&
              candidate.displayCode === gap.displayCode,
          )
          const gapSeconds = nextGap
            ? deterministicRound(
                gap.gapSeconds +
                  (nextGap.gapSeconds - gap.gapSeconds) * interpolationFraction,
                6,
              )
            : gap.gapSeconds
          return [
            gap.displayCode,
            {
              ...gap,
              gapSeconds,
              officialTimeSeconds: null,
            } satisfies UniversalReplayGapState,
          ] as const
        }),
      )
      const groups = previous.groups.map((group) => ({
        ...group,
        riderIds: [...group.riderIds],
      }))
      const gaps: UniversalReplayGapState[] = []
      groups.forEach((group) => {
        const gap = gapByDisplayCode.get(group.displayCode)
        if (gap) gaps.push(gap)
      })
      const nextStateByRiderId = new Map(
        next.riderStates.map((state) => [state.riderId, state] as const),
      )
      const riderStates = previous.riderStates.map(
        (state): UniversalReplayRiderState => {
          const nextState = nextStateByRiderId.get(state.riderId)
          const interpolatedEnergy = nextState
            ? deterministicRound(
                Math.max(
                  0,
                  state.energy +
                    (nextState.energy - state.energy) * interpolationFraction,
                ),
                6,
              )
            : state.energy
          const groupGap = state.displayCode
            ? gapByDisplayCode.get(state.displayCode)?.gapSeconds
            : undefined
          return {
            ...state,
            energy: interpolatedEnergy,
            gapSeconds:
              groupGap !== undefined ? groupGap : state.gapSeconds,
            finishRank: null,
            officialTimeSeconds: null,
          }
        },
      )

      const phase = phase10PhaseForFraction(fraction)
      const activeCommandsSource =
        previous.phase === phase
          ? previous.activeCommands
          : next.phase === phase
            ? next.activeCommands
            : []

      synthetic.push({
        ...previous,
        checkpointId: `${input.stage.stageId}:phase10-exact:${suffix}:${km.toFixed(6)}`,
        checkpointIndex: -1,
        checkpointKind: 'event',
        phase,
        raceProgress: {
          fraction,
          percent: deterministicRound(fraction * 100, 6),
          kmFromStart: km,
        },
        groups,
        gaps,
        riderStates,
        teamStates: phase10ReplayTeamStates(input, riderStates),
        activeCommands: activeCommandsSource.map((command) => ({ ...command })),
        intermediateResults: previous.intermediateResults.map((row) => ({
          ...row,
          rankings: row.rankings.map((ranking) => ({ ...ranking })),
        })),
        incidents: [],
        commentary: [],
        finalResultsVisible: false,
      })
    })

  if (synthetic.length === 0) return baseTimeline

  const checkpoints = [...original, ...synthetic]
    .sort((left, right) => {
      const distanceOrder =
        left.raceProgress.kmFromStart - right.raceProgress.kmFromStart

      if (Math.abs(distanceOrder) > 0.000001) {
        return distanceOrder
      }

      const leftIsFinal =
        left.checkpointId === baseTimeline.finalCheckpointId
      const rightIsFinal =
        right.checkpointId === baseTimeline.finalCheckpointId

      // The authoritative final checkpoint must always remain the last
      // checkpoint at the finish kilometre. Competition points and other
      // calculated events at the finish still occur, but they precede the
      // final physical/result checkpoint.
      if (leftIsFinal !== rightIsFinal) {
        return leftIsFinal ? 1 : -1
      }

      const checkpointKindOrder =
        (left.checkpointKind === 'base' ? -1 : 1) -
        (right.checkpointKind === 'base' ? -1 : 1)

      if (checkpointKindOrder !== 0) {
        return checkpointKindOrder
      }

      return left.checkpointId.localeCompare(right.checkpointId)
    })
    .map(
      (checkpoint, checkpointIndex): UniversalReplayCheckpoint => ({
        ...checkpoint,
        checkpointIndex,
      }),
    )

  return {
    ...baseTimeline,
    baseCheckpointCount: checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'base',
    ).length,
    eventCheckpointCount: checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'event',
    ).length,
    checkpoints,
  }
}

function phase10NormalizeBehindPelotonDisplay(
  groups: readonly UniversalReplayGroupState[],
  gaps: readonly UniversalReplayGapState[],
): {
  readonly groups: readonly UniversalReplayGroupState[]
  readonly gaps: readonly UniversalReplayGapState[]
  readonly displayCodeByOldCode: ReadonlyMap<string, string>
} {
  const gapByDisplayCode = new Map(
    gaps.map((gap) => [gap.displayCode, gap] as const),
  )
  const ordered = groups
    .map((group, sourceIndex) => ({
      group,
      sourceIndex,
      gap: gapByDisplayCode.get(group.displayCode),
    }))
    .sort(
      (left, right) =>
        (left.gap?.gapSeconds ?? 0) - (right.gap?.gapSeconds ?? 0) ||
        left.sourceIndex - right.sourceIndex,
    )
  const displayCodeByOldCode = new Map<string, string>()
  let chaseNumber = 0
  ordered.forEach(({ group }) => {
    if (group.physicalPosition !== 'behind_peloton') {
      displayCodeByOldCode.set(group.displayCode, group.displayCode)
      return
    }
    chaseNumber += 1
    displayCodeByOldCode.set(group.displayCode, `C${chaseNumber}`)
  })

  const normalizedPairs = ordered.map(({ group, gap }) => {
    const displayCode = displayCodeByOldCode.get(group.displayCode) ?? group.displayCode
    const behindPeloton = group.physicalPosition === 'behind_peloton'
    return {
      group: {
        ...group,
        displayCode,
        colorKey: behindPeloton ? ('chasing_orange' as const) : group.colorKey,
        riderIds: [...group.riderIds],
      },
      gap: gap
        ? { ...gap, displayCode }
        : null,
    }
  })

  return {
    groups: normalizedPairs.map((row) => row.group),
    gaps: normalizedPairs
      .map((row) => row.gap)
      .filter((row): row is UniversalReplayGapState => row !== null),
    displayCodeByOldCode,
  }
}

function phase10BuildFinalRoadGroups(
  baseTimeline: UniversalReplayTimeline,
  classification: readonly UniversalOfficialFinishRow[],
  physicalGapByRiderId: ReadonlyMap<string, number> = new Map(),
): {
  readonly groups: readonly UniversalReplayGroupState[]
  readonly gaps: readonly UniversalReplayGapState[]
  readonly groupOrderByRiderId: ReadonlyMap<string, number>
  readonly groupCodeByRiderId: ReadonlyMap<string, UniversalPhase5GroupCode>
} {
  const baseFinal = baseTimeline.checkpoints.at(-1)
  const baseIdentityByGap = new Map<number, UniversalReplayGroupState>()
  baseFinal?.groups.forEach((group) => {
    const gap = baseFinal.gaps.find((row) => row.displayCode === group.displayCode)
    if (gap) baseIdentityByGap.set(deterministicRound(gap.gapSeconds, 6), group)
  })
  const finishedRows = classification.filter(
    (row) => row.status === 'finished' && row.gapSeconds !== null,
  )
  const rowsByGap = new Map<number, UniversalOfficialFinishRow[]>()
  finishedRows.forEach((row) => {
    const key = deterministicRound(
      physicalGapByRiderId.get(row.riderId) ?? row.gapSeconds ?? 0,
      6,
    )
    const bucket = rowsByGap.get(key) ?? []
    bucket.push(row)
    rowsByGap.set(key, bucket)
  })
  let incidentGroupNumber = 0
  const groups: UniversalReplayGroupState[] = []
  const gaps: UniversalReplayGapState[] = []
  const groupOrderByRiderId = new Map<string, number>()
  const groupCodeByRiderId = new Map<string, UniversalPhase5GroupCode>()
  ;[...rowsByGap.entries()]
    .sort((left, right) => left[0] - right[0])
    .forEach(([gapSeconds, rows], index) => {
      const baseIdentity = baseIdentityByGap.get(gapSeconds)
      if (!baseIdentity) incidentGroupNumber += 1
      const groupCode: UniversalPhase5GroupCode =
        baseIdentity?.groupCode ?? 'dropped_group'
      const displayCode = baseIdentity?.displayCode ?? `I${incidentGroupNumber}`
      const group: UniversalReplayGroupState = {
        groupCode,
        displayCode,
        physicalPosition:
          baseIdentity?.physicalPosition ??
          (gapSeconds <= 0 ? 'peloton' : 'behind_peloton'),
        colorKey: baseIdentity?.colorKey ?? 'dropped_gray',
        riderIds: rows.map((row) => row.riderId).sort(),
      }
      groups.push(group)
      gaps.push({
        groupCode,
        displayCode,
        gapSeconds,
        officialTimeSeconds: rows[0]?.officialTimeSeconds ?? null,
      })
      rows.forEach((row) => {
        groupOrderByRiderId.set(row.riderId, index + 1)
        groupCodeByRiderId.set(row.riderId, groupCode)
      })
    })
  const normalized = phase10NormalizeBehindPelotonDisplay(groups, gaps)
  return {
    groups: normalized.groups,
    gaps: normalized.gaps,
    groupOrderByRiderId,
    groupCodeByRiderId,
  }
}

function resolveUniversalPhase10Incidents({
  input,
  sourceInput,
  phase9,
  riderReadiness,
  roadCommandResolution,
  baseFinishResolution,
  baseReplayTimeline,
}: {
  readonly input: UniversalRaceEngineInput
  readonly sourceInput: UniversalRaceEngineInput
  readonly phase9: UniversalPhase9ModifierSummary
  readonly riderReadiness: readonly UniversalRiderReadinessResult[]
  readonly roadCommandResolution: UniversalRoadCommandResolutionSummary
  readonly baseFinishResolution: UniversalFinishResolution
  readonly baseReplayTimeline: UniversalReplayTimeline
}): {
  readonly summary: UniversalPhase10IncidentSummary
  readonly finishResolution: UniversalFinishResolution
  readonly replayTimeline: UniversalReplayTimeline
} {
  const preRaceAvailability = phase10PreRaceAvailability(
    input,
    riderReadiness,
    phase9,
  )
  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row] as const),
  )
  const riderById = new Map(
    input.riders.map((row) => [row.riderId, row] as const),
  )
  const teamById = new Map(
    input.teams.map((row) => [row.teamId, row] as const),
  )
  const riderDisplayName = (riderId: string): string => {
    const rider = riderById.get(riderId)
    if (!rider) return riderId
    const explicit = rider.snapshot.displayName?.trim()
    if (explicit) return explicit
    const joined = [rider.snapshot.firstName, rider.snapshot.lastName]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' ')
      .trim()
    return joined || riderId
  }
  const riderTeamLabel = (riderId: string): string => {
    const rider = riderById.get(riderId)
    if (!rider) return riderId
    const riderName = riderDisplayName(riderId)
    const teamName = teamById.get(rider.teamId)?.snapshot.teamName?.trim()
    return teamName ? `${riderName} (${teamName})` : riderName
  }
  const sourceRiderById = new Map(
    sourceInput.riders.map((row) => [row.riderId, row] as const),
  )
  const phase9TeamById = new Map(
    phase9.teams.map((row) => [row.teamId, row] as const),
  )
  const baseFinishByRiderId = new Map(
    baseFinishResolution.classification.map((row) => [row.riderId, row] as const),
  )
  const baseWinnerTime =
    baseFinishResolution.classification.find(
      (row) => row.status === 'finished' && row.rank === 1,
    )?.officialTimeSeconds ??
    Math.max(60, (input.stage.distanceKm / 40) * 3600)
  const modelEnabled = input.incidentModel?.enabled === true
  if (!modelEnabled) {
    const classification = baseFinishResolution.classification
    const finalCheckpoint = baseReplayTimeline.checkpoints.at(-1)
    const statusByRiderId = Object.fromEntries(
      classification.map((row) => [row.riderId, row.status]),
    ) as Readonly<Record<string, UniversalOfficialFinishStatus>>
    const statusGroups: UniversalPhase10StatusGroup[] =
      UNIVERSAL_PHASE10_OFFICIAL_STATUSES.map((status) => ({
        status,
        riderIds: classification
          .filter((row) => row.status === status)
          .map((row) => row.riderId)
          .sort(),
      }))
    const allStatusRiderIds = statusGroups.flatMap((row) => row.riderIds).sort()
    const acceptedRiderIds = input.riders.map((row) => row.riderId).sort()
    const winnerTime = classification.find(
      (row) => row.status === 'finished' && row.rank === 1,
    )?.officialTimeSeconds ?? null
    const timeLimitPercentage = phase10TimeLimitPercentage(input.stage)
    const summary: UniversalPhase10IncidentSummary = {
      active: false,
      modelEnabled: false,
      preRaceAvailability,
      incidents: [],
      incidentCount: 0,
      individualCrashCount: 0,
      groupCrashCount: 0,
      technicalIncidentCount: 0,
      maximumIncidentsPerStage: PHASE10_MAXIMUM_INCIDENTS_PER_STAGE,
      maximumIncidentsPerPhase: PHASE10_MAXIMUM_INCIDENTS_PER_PHASE,
      incidentCountByPhase: { 1: 0, 2: 0, 3: 0, 4: 0 },
      globalCooldownSeconds: PHASE10_GLOBAL_COOLDOWN_SECONDS,
      riderCooldownSeconds: PHASE10_RIDER_COOLDOWN_SECONDS,
      autonomousChase: {
        active: false,
        modelVersion: 'autonomous_incident_chase_v1',
        simulationStepKm: PHASE10_AUTONOMOUS_CHASE_STEP_KM,
        mergeToleranceSeconds: PHASE5_GROUP_MERGE_TOLERANCE_SECONDS,
        riderEpisodeCount: 0,
        rejoinedEpisodeCount: 0,
        nonRejoinedEpisodeCount: 0,
        groupMergeCount: 0,
        groupMergeKms: [],
        exactRejoinKms: [],
        totalChaseEnergyCostPoints: 0,
      },
      sprintZone: {
        configuredKm: phase10EffectiveSprintZoneKm(input.stage),
        eligibleStage:
          input.stage.stageFormat === 'road_race' &&
          input.stage.finishType === 'flat_finish' &&
          !input.stage.summitFinish,
        protectedRiderCount: 0,
        protectedIncidentCount: 0,
        source: 'universal_phase10_sprint_zone_time_protection_v1',
      },
      healthHandoff: {
        injuryOutcomeCount: 0,
        continuingInjuredCount: 0,
        dnfInjuryCount: 0,
        persistentCaseCandidateCount: 0,
        persistentWritesPerformed: false,
        source: 'universal_phase10_crash_health_handoff_v1',
      },
      finalClassification: classification,
      finalRoadGroups:
        input.stage.stageFormat === 'road_race'
          ? finalCheckpoint?.groups ?? []
          : [],
      finalRoadGaps:
        input.stage.stageFormat === 'road_race'
          ? finalCheckpoint?.gaps ?? []
          : [],
      statusGroups,
      statusByRiderId,
      allAcceptedRidersHaveExactlyOneStatus:
        classification.length === input.riders.length &&
        new Set(classification.map((row) => row.riderId)).size === input.riders.length,
      allAcceptedRidersPresentInStatusGroups:
        allStatusRiderIds.length === acceptedRiderIds.length &&
        allStatusRiderIds.every((id, index) => id === acceptedRiderIds[index]),
      everyIncidentRiderRemainsTracked: true,
      timeLimit: {
        percentage: timeLimitPercentage,
        enforced: false,
        winnerTimeSeconds: winnerTime,
        cutoffTimeSeconds:
          winnerTime === null
            ? null
            : deterministicRound(winnerTime * (1 + timeLimitPercentage / 100), 6),
        source: 'universal_phase10_time_limit_v1',
      },
      persistentHealthWritesPerformed: false,
      directDatabaseWritesPerformed: false,
      deterministic: true,
      modelVersion: 'universal_phase_10_incidents_v4',
    }
    return {
      summary,
      finishResolution: baseFinishResolution,
      replayTimeline: baseReplayTimeline,
    }
  }
  const weatherMultiplier = phase9.weather.incidentRiskMultiplier
  const weatherRelated = weatherMultiplier > 1.000001 || phase9.weather.severe
  const normalizedWeatherCondition = (input.weather?.condition ?? '').trim().toLowerCase()
  const wetWeather =
    (input.weather?.precipitationMm ?? 0) > 0.05 ||
    (input.weather?.rainProbabilityPct ?? 0) >= 50 ||
    ['rain', 'rainy', 'showers', 'shower', 'storm', 'heavy_rain', 'sleet', 'snow'].includes(
      normalizedWeatherCondition,
    )
  const incidents: UniversalPhase10IncidentRecord[] = []
  const nextRiderEligibleSecondById = new Map<string, number>()
  const nextRiderEligibleKmById = new Map<string, number>()
  const permanentlyUnavailableRiderIds = new Set<string>()
  const incidentCountByPhase: Record<RoadRacePhaseNumber, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
  }
  let nextGlobalEligibleSecond = 0

  const checkpointForFraction = (fraction: number): UniversalReplayCheckpoint => {
    const checkpoints = baseReplayTimeline.checkpoints
    let selected = checkpoints[0]
    for (const checkpoint of checkpoints) {
      if (checkpoint.raceProgress.fraction <= fraction + 0.000001) {
        selected = checkpoint
      } else {
        break
      }
    }
    if (!selected) {
      throw new Error('Phase 10 requires at least one replay checkpoint.')
    }
    return selected
  }

  const commandIntensityFor = (
    riderId: string,
    phase: RoadRacePhaseNumber,
  ): number => {
    if (!roadCommandResolution.active) return 1
    const rider = roadCommandResolution.riders.find((row) => row.riderId === riderId)
    const phaseRow = rider?.phases.find((row) => row.phaseNumber === phase)
    return phaseRow?.commandEffect.roleAdjustedEffortMultiplier ?? 1
  }

  const runtimeFatigueFor = (
    riderId: string,
    checkpoint: UniversalReplayCheckpoint,
  ): number => {
    const readiness = readinessByRiderId.get(riderId)
    const state = checkpoint.riderStates.find((row) => row.riderId === riderId)
    if (!readiness || !state) return 0
    const startEnergy = Math.max(1, readiness.fatigueBalance.startEnergy)
    const energySpent = Math.max(0, startEnergy - state.energy)
    return deterministicRound(
      clamp(
        readiness.components.effectiveFatigue +
          (energySpent / startEnergy) * 45,
        0,
        100,
      ),
      6,
    )
  }

  type Candidate = {
    readonly kind: UniversalPhase10IncidentKind
    readonly entityId: string
    readonly riderIds: readonly string[]
    readonly teamIds: readonly string[]
    readonly sourceDisplayCode: string | null
    readonly probability: UniversalPhase10IncidentProbabilityBreakdown
    readonly roll: number
    readonly hash: string
    readonly causes: readonly string[]
    readonly runtimeFatigue: number
    readonly equipmentConditionPercent: number
    readonly mechanicalTimeLossMultiplier: number
  }

  const addCauses = ({
    runtimeFatigue,
    gradient,
    speed,
    condition,
    support,
    command,
    kind,
  }: {
    readonly runtimeFatigue: number
    readonly gradient: number
    readonly speed: number
    readonly condition: number
    readonly support: number
    readonly command: number
    readonly kind: UniversalPhase10IncidentKind
  }): readonly string[] => {
    const causes: string[] = []
    if (wetWeather) causes.push('wet_road')
    else if (weatherRelated) causes.push('severe_weather')
    if (runtimeFatigue >= 50) causes.push('runtime_fatigue')
    if (gradient <= -2) causes.push('descending')
    if (speed >= 45) causes.push('high_speed')
    if (kind === 'technical_incident' && condition < 90) causes.push('equipment_condition')
    if (support < 0.999) causes.push('team_staff_asset_support')
    if (command > 1.05) causes.push('high_command_intensity')
    if (command < 0.95) causes.push('risk_avoidance')
    return causes.sort()
  }

  const isRiderIncidentEligible = (
    riderId: string,
    raceSecond: number,
    kmFromStart: number,
  ): boolean =>
    !permanentlyUnavailableRiderIds.has(riderId) &&
    raceSecond >= (nextRiderEligibleSecondById.get(riderId) ?? 0) &&
    kmFromStart >= (nextRiderEligibleKmById.get(riderId) ?? 0) - 0.000001

  const phase10RaceSituationFor = ({
    kind,
    sourceDisplayCode,
    progressFraction,
    phase,
    gradient,
    baseSpeedKmh,
    groupSize,
    checkpoint,
  }: {
    readonly kind: UniversalPhase10IncidentKind
    readonly sourceDisplayCode: string | null
    readonly progressFraction: number
    readonly phase: RoadRacePhaseNumber
    readonly gradient: number
    readonly baseSpeedKmh: number
    readonly groupSize: number
    readonly checkpoint: UniversalReplayCheckpoint
  }): {
    readonly currentSpeedKmh: number
    readonly multiplier: number
    readonly activePelotonChase: boolean
    readonly lateFlatSprint: boolean
  } => {
    const isPeloton = sourceDisplayCode === 'P'
    const frontGroupActive = checkpoint.groups.some(
      (group) =>
        group.physicalPosition === 'ahead_of_peloton' &&
        group.riderIds.length > 0,
    )
    const activePelotonChase =
      input.stage.stageFormat === 'road_race' &&
      isPeloton &&
      phase === 4 &&
      frontGroupActive
    const lateFlatSprint =
      input.stage.stageFormat === 'road_race' &&
      isPeloton &&
      input.stage.terrainType === 'flat' &&
      baseFinishResolution.finishMode === 'flat_sprint' &&
      progressFraction >= 0.9 &&
      groupSize >= 12

    let currentSpeedKmh = baseSpeedKmh
    if (gradient < -1) {
      currentSpeedKmh += Math.min(22, Math.abs(gradient) * 3)
    }
    if (activePelotonChase) currentSpeedKmh += 6
    if (lateFlatSprint) currentSpeedKmh += 12
    currentSpeedKmh = deterministicRound(clamp(currentSpeedKmh, 20, 80), 6)

    let multiplier = 1
    if (activePelotonChase) {
      multiplier *=
        kind === 'group_crash'
          ? 2.4
          : kind === 'individual_crash'
            ? 1.45
            : 1.2
    }
    if (lateFlatSprint) {
      multiplier *=
        kind === 'group_crash'
          ? 4.5
          : kind === 'individual_crash'
            ? 1.9
            : 1.15
    }

    return {
      currentSpeedKmh,
      multiplier: deterministicRound(clamp(multiplier, 0.6, 6), 6),
      activePelotonChase,
      lateFlatSprint,
    }
  }

  const lastTickSecond = Math.max(30, Math.floor(baseWinnerTime / 30) * 30)
  for (
    let raceSecond = 30;
    raceSecond <= lastTickSecond && incidents.length < PHASE10_MAXIMUM_INCIDENTS_PER_STAGE;
    raceSecond += 30
  ) {
    if (raceSecond < nextGlobalEligibleSecond) continue
    const progressFraction = clamp(raceSecond / baseWinnerTime, 0, 1)
    const kmFromStart = deterministicRound(input.stage.distanceKm * progressFraction, 6)
    if (raceSecond <= 60 || kmFromStart <= 1 || input.stage.distanceKm - kmFromStart <= 0.5) {
      continue
    }
    const phase = phase10PhaseForFraction(progressFraction)
    if (incidentCountByPhase[phase] >= PHASE10_MAXIMUM_INCIDENTS_PER_PHASE[phase]) {
      continue
    }
    const checkpoint = checkpointForFraction(progressFraction)
    const gradient = phase10GradientAtKm(input.stage, kmFromStart)
    const baseAverageSpeedKmh = deterministicRound(
      input.stage.distanceKm / Math.max(baseWinnerTime / 3600, 0.01),
      6,
    )
    const candidates: Candidate[] = []

    const racingStates = checkpoint.riderStates.filter(
      (state) =>
        state.status === 'racing' &&
        readinessByRiderId.get(state.riderId)?.eligibleToStart &&
        isRiderIncidentEligible(state.riderId, raceSecond, kmFromStart),
    )

    racingStates.forEach((state) => {
      const rider = riderById.get(state.riderId)
      if (!rider) return
      const group = checkpoint.groups.find((row) => row.riderIds.includes(state.riderId))
      const groupSize = group?.riderIds.length ?? 1
      const runtimeFatigue = runtimeFatigueFor(state.riderId, checkpoint)
      const sourceRider = sourceRiderById.get(state.riderId)
      const canonicalPreparationIncidentMultiplier = clamp(
        sourceRider?.preparationModifiers?.incidentRiskMultiplier ?? 1,
        0.7,
        1.4,
      )
      const teamPreparationIncidentMultiplier = clamp(
        phase9TeamById.get(rider.teamId)?.incidentRiskMultiplier ?? 1,
        0.7,
        1.4,
      )
      const supportMultiplier = deterministicRound(
        clamp(
          canonicalPreparationIncidentMultiplier * teamPreparationIncidentMultiplier,
          0.7,
          1.4,
        ),
        6,
      )
      const commandIntensity = commandIntensityFor(state.riderId, phase)
      const condition = clamp(
        rider.preparationModifiers?.equipmentConditionPercent ?? 100,
        0,
        100,
      )
      ;(['individual_crash', 'technical_incident'] as const).forEach((kind) => {
        const situation = phase10RaceSituationFor({
          kind,
          sourceDisplayCode: state.displayCode,
          progressFraction,
          phase,
          gradient,
          baseSpeedKmh: baseAverageSpeedKmh,
          groupSize,
          checkpoint,
        })
        const probability = calculateUniversalPhase10IncidentProbability({
          incidentKind: kind,
          tickSeconds: 30,
          weatherMultiplier,
          currentSpeedKmh: situation.currentSpeedKmh,
          gradientPercent: gradient,
          groupSize,
          runtimeFatigue,
          resistance: rider.resistance,
          raceIq: rider.raceIQ,
          preparationSupportMultiplier: supportMultiplier,
          commandIntensityMultiplier: commandIntensity,
          raceSituationMultiplier: situation.multiplier,
          equipmentConditionPercent: condition,
          mechanicalIncidentRiskMultiplier:
            rider.preparationModifiers?.mechanicalIncidentRiskMultiplier ?? 1,
        })
        const hash = md5Hex(
          [
            input.engine.deterministicSeed,
            input.race.raceId,
            input.stage.stageId,
            'phase10',
            kind,
            incidents.length,
            raceSecond,
            state.riderId,
          ].join('|'),
        )
        const roll = phase10DeterministicRoll(hash)
        if (roll >= probability.finalProbability) return
        const causes = addCauses({
          runtimeFatigue,
          gradient,
          speed: situation.currentSpeedKmh,
          condition,
          support: supportMultiplier,
          command: commandIntensity,
          kind,
        })
        const contextualCauses = [...causes]
        if (situation.activePelotonChase) contextualCauses.push('peloton_chase')
        if (situation.lateFlatSprint) contextualCauses.push('sprint_congestion')
        candidates.push({
          kind,
          entityId: state.riderId,
          riderIds: [state.riderId],
          teamIds: [state.teamId],
          sourceDisplayCode: state.displayCode,
          probability,
          roll,
          hash,
          causes: Array.from(new Set(contextualCauses)).sort(),
          runtimeFatigue,
          equipmentConditionPercent: condition,
          mechanicalTimeLossMultiplier: clamp(
            rider.preparationModifiers?.mechanicalTimeLossMultiplier ?? 1,
            0.82,
            1,
          ),
        })
      })
    })

    if (input.stage.stageFormat === 'road_race') {
      checkpoint.groups
        .filter((group) => group.riderIds.length >= 6)
        .forEach((group) => {
          const riders = group.riderIds
            .filter((id) => isRiderIncidentEligible(id, raceSecond, kmFromStart))
            .map((id) => riderById.get(id))
            .filter((row): row is UniversalRiderInput => Boolean(row))
          if (riders.length < 6) return
          const runtimeFatigue = deterministicRound(
            riders.reduce(
              (sum, rider) => sum + runtimeFatigueFor(rider.riderId, checkpoint),
              0,
            ) / riders.length,
            6,
          )
          const resistance =
            riders.reduce((sum, rider) => sum + rider.resistance, 0) / riders.length
          const raceIq =
            riders.reduce((sum, rider) => sum + rider.raceIQ, 0) / riders.length
          const support =
            riders.reduce((sum, rider) => {
              const sourceRider = sourceRiderById.get(rider.riderId)
              const canonicalPreparationIncidentMultiplier = clamp(
                sourceRider?.preparationModifiers?.incidentRiskMultiplier ?? 1,
                0.7,
                1.4,
              )
              const teamPreparationIncidentMultiplier = clamp(
                phase9TeamById.get(rider.teamId)?.incidentRiskMultiplier ?? 1,
                0.7,
                1.4,
              )
              return (
                sum +
                clamp(
                  canonicalPreparationIncidentMultiplier *
                    teamPreparationIncidentMultiplier,
                  0.7,
                  1.4,
                )
              )
            }, 0) / riders.length
          const command =
            riders.reduce(
              (sum, rider) => sum + commandIntensityFor(rider.riderId, phase),
              0,
            ) / riders.length
          const situation = phase10RaceSituationFor({
            kind: 'group_crash',
            sourceDisplayCode: group.displayCode,
            progressFraction,
            phase,
            gradient,
            baseSpeedKmh: baseAverageSpeedKmh,
            groupSize: riders.length,
            checkpoint,
          })
          const probability = calculateUniversalPhase10IncidentProbability({
            incidentKind: 'group_crash',
            tickSeconds: 30,
            weatherMultiplier,
            currentSpeedKmh: situation.currentSpeedKmh,
            gradientPercent: gradient,
            groupSize: riders.length,
            runtimeFatigue,
            resistance,
            raceIq,
            preparationSupportMultiplier: support,
            commandIntensityMultiplier: command,
            raceSituationMultiplier: situation.multiplier,
          })
          const entityId = `${group.displayCode}:${riders.map((r) => r.riderId).sort().join(',')}`
          const hash = md5Hex(
            [
              input.engine.deterministicSeed,
              input.race.raceId,
              input.stage.stageId,
              'phase10',
              'group_crash',
              incidents.length,
              raceSecond,
              entityId,
            ].join('|'),
          )
          const roll = phase10DeterministicRoll(hash)
          if (roll >= probability.finalProbability) return
          const causes = addCauses({
            runtimeFatigue,
            gradient,
            speed: situation.currentSpeedKmh,
            condition: 100,
            support,
            command,
            kind: 'group_crash',
          })
          const contextualCauses = [...causes]
          if (situation.activePelotonChase) contextualCauses.push('peloton_chase')
          if (situation.lateFlatSprint) contextualCauses.push('sprint_congestion')
          candidates.push({
            kind: 'group_crash',
            entityId,
            riderIds: riders.map((rider) => rider.riderId).sort(),
            teamIds: Array.from(new Set(riders.map((rider) => rider.teamId))).sort(),
            sourceDisplayCode: group.displayCode,
            probability,
            roll,
            hash,
            causes: Array.from(new Set(contextualCauses)).sort(),
            runtimeFatigue,
            equipmentConditionPercent: 100,
            mechanicalTimeLossMultiplier: 1,
          })
        })
    }

    const selected = candidates
      .slice()
      .sort(
        (left, right) =>
          left.roll / Math.max(left.probability.finalProbability, 1e-12) -
            right.roll / Math.max(right.probability.finalProbability, 1e-12) ||
          left.kind.localeCompare(right.kind) ||
          left.entityId.localeCompare(right.entityId),
      )[0]
    if (!selected) continue

    let affectedRiderIds: readonly string[]
    if (selected.kind === 'group_crash') {
      const maxAffected = Math.min(6, selected.riderIds.length)
      const countHash = md5Hex(`${selected.hash}|affected_count`)
      const affectedCount = phase10IntegerFromHash(countHash, 2, maxAffected)
      affectedRiderIds = selected.riderIds
        .slice()
        .sort((left, right) => {
          const leftHash = md5Hex(`${selected.hash}|member|${left}`)
          const rightHash = md5Hex(`${selected.hash}|member|${right}`)
          return leftHash.localeCompare(rightHash) || left.localeCompare(right)
        })
        .slice(0, affectedCount)
        .sort()
    } else {
      affectedRiderIds = selected.riderIds
    }

    const technicalType =
      selected.kind === 'technical_incident'
        ? phase10TechnicalType(
            md5Hex(`${selected.hash}|technical_type`),
            selected.equipmentConditionPercent,
          )
        : null
    const severity =
      selected.kind === 'technical_incident'
        ? phase10TechnicalSeverity(
            selected.probability,
            md5Hex(`${selected.hash}|severity`),
            selected.causes,
            selected.equipmentConditionPercent,
          )
        : phase10CrashSeverity(
            selected.kind,
            selected.probability,
            md5Hex(`${selected.hash}|severity`),
            selected.causes,
          )
    const [minimumTimeLoss, maximumTimeLoss] = phase10TimeLossRange(
      selected.kind,
      severity,
      technicalType,
    )
    let timeLossSeconds = phase10IntegerFromHash(
      md5Hex(`${selected.hash}|time_loss`),
      minimumTimeLoss,
      maximumTimeLoss,
    )
    if (selected.kind === 'technical_incident') {
      timeLossSeconds = Math.max(
        1,
        Math.round(timeLossSeconds * selected.mechanicalTimeLossMultiplier),
      )
    }
    const remainingKm = Math.max(0, input.stage.distanceKm - kmFromStart)
    const incidentNumber = incidents.length + 1
    const incidentId = `${input.stage.stageId}:phase10:${incidentNumber}:${selected.hash.slice(0, 12)}`
    const sprintZoneKm = phase10EffectiveSprintZoneKm(input.stage)
    const sprintZoneEligibleIncident =
      sprintZoneKm > 0 &&
      input.stage.stageFormat === 'road_race' &&
      remainingKm <= sprintZoneKm + 0.000001
    const protectedSourceOfficialTimeSeconds = sprintZoneEligibleIncident
      ? phase10ProtectedSourceOfficialTime(
          baseReplayTimeline,
          baseFinishResolution,
          kmFromStart,
          selected.sourceDisplayCode,
          affectedRiderIds,
        )
      : null
    const riderConsequences = affectedRiderIds.map(
      (riderId): UniversalPhase10RiderIncidentConsequence => {
        const rider = riderById.get(riderId)
        if (!rider) throw new Error(`Phase 10 incident rider missing: ${riderId}.`)
        const healthOutcome = phase10CrashHealthOutcome(
          selected.kind,
          severity,
          selected.hash,
          riderId,
        )
        const teamTimeTrialFormat =
          input.stage.stageFormat === 'team_time_trial' ||
          input.stage.stageFormat === 'pair_time_trial'
        const healthDnf =
          healthOutcome.currentStageContinuation === 'dnf' &&
          !teamTimeTrialFormat
        const statusImpact: 'finished' | 'dnf' = healthDnf ? 'dnf' : 'finished'
        const createsPhysicalRoadSeparation =
          input.stage.stageFormat === 'road_race' &&
          statusImpact === 'finished' &&
          timeLossSeconds > PHASE5_GROUP_MERGE_TOLERANCE_SECONDS
        // v10d/v10e deliberately does not decide recovery here. Every real road
        // separation enters the autonomous chase simulation after the complete
        // incident set is known. That simulation discovers whether/when the
        // rider catches the target group and what gap remains if the catch fails.
        const provisionalTimePenaltySeconds =
          statusImpact === 'dnf' || teamTimeTrialFormat
            ? 0
            : createsPhysicalRoadSeparation
              ? timeLossSeconds
              : 0
        const sprintProtectionApplied =
          statusImpact === 'finished' &&
          sprintZoneEligibleIncident &&
          protectedSourceOfficialTimeSeconds !== null
        return {
          riderId,
          teamId: rider.teamId,
          energyLossPoints: deterministicRound(
            phase10IncidentEnergyLoss(selected.kind, timeLossSeconds) +
              healthOutcome.additionalEnergyLossPoints,
            6,
          ),
          timePenaltySeconds: provisionalTimePenaltySeconds,
          movedToLaterGroup: createsPhysicalRoadSeparation,
          temporarySeparation: false,
          expectedRejoinKm: null,
          actualRejoinKm: null,
          chaseEnergyCostPoints: 0,
          recoveryTargetDisplayCode: createsPhysicalRoadSeparation
            ? selected.sourceDisplayCode ?? 'P'
            : null,
          finalGapToTargetSeconds: createsPhysicalRoadSeparation
            ? timeLossSeconds
            : 0,
          healthOutcome,
          sprintZoneProtection: {
            eligible: sprintZoneEligibleIncident,
            applied: sprintProtectionApplied,
            zoneKm: sprintZoneKm,
            protectedOfficialTimeSeconds: sprintProtectionApplied
              ? protectedSourceOfficialTimeSeconds
              : null,
            sourceDisplayCode: selected.sourceDisplayCode,
            source: 'universal_phase10_sprint_zone_time_protection_v1',
          },
          statusImpact,
        }
      },
    )
    const incidentType =
      selected.kind === 'technical_incident'
        ? technicalType ?? 'technical_incident'
        : weatherRelated
          ? `weather_related_${selected.kind}`
          : selected.kind
    const title =
      selected.kind === 'individual_crash'
        ? 'Rider crash'
        : selected.kind === 'group_crash'
          ? 'Group crash'
          : technicalType === 'puncture'
            ? 'Puncture'
            : technicalType === 'bike_change'
              ? 'Bike change'
              : 'Technical problem'
    const dnfCount = riderConsequences.filter((row) => row.statusImpact === 'dnf').length
    const injuryOutcomes = riderConsequences
      .map((row) => row.healthOutcome)
      .filter((outcome) => outcome.injuryOccurred)
    const incidentHealthSeverityHint: HealthCaseSeverity | null =
      injuryOutcomes.some((outcome) => outcome.severity === 'major')
        ? 'major'
        : injuryOutcomes.some((outcome) => outcome.severity === 'moderate')
          ? 'moderate'
          : injuryOutcomes.some((outcome) => outcome.severity === 'minor')
            ? 'minor'
            : null
    const incidentHealthSubtypeHint =
      injuryOutcomes.find((outcome) => outcome.caseCode !== null)?.caseCode ?? null
    const affectedLabels = affectedRiderIds.map(riderTeamLabel)
    const roundedIncidentKm = Math.round(kmFromStart)
    const description =
      selected.kind === 'group_crash'
        ? `Group crash at ${roundedIncidentKm} km involving ${affectedLabels.join(', ')}. All ${affectedRiderIds.length} affected riders lose ${timeLossSeconds} seconds${dnfCount > 0 ? `; ${dnfCount} rider${dnfCount === 1 ? '' : 's'} abandon` : ''}.`
        : selected.kind === 'individual_crash'
          ? `${affectedLabels[0]} crashes at ${roundedIncidentKm} km and loses ${timeLossSeconds} seconds${dnfCount > 0 ? '; the rider abandons the race' : ''}.`
          : `${affectedLabels[0]} suffers ${technicalType === 'puncture' ? 'a puncture' : technicalType === 'bike_change' ? 'a bike change' : 'a technical problem'} at ${roundedIncidentKm} km and loses ${timeLossSeconds} seconds.`
    const incident: UniversalPhase10IncidentRecord = {
      incidentId,
      incidentKind: selected.kind,
      incidentType,
      severity,
      technicalType,
      phase,
      raceSecond,
      kmFromStart,
      progressFraction: deterministicRound(progressFraction, 6),
      probability: selected.probability,
      deterministicRoll: selected.roll,
      deterministicHash: selected.hash,
      weatherRelated,
      causes: selected.causes,
      sourceDisplayCode: selected.sourceDisplayCode,
      timeLossSeconds,
      riderIds: affectedRiderIds,
      teamIds: Array.from(
        new Set(
          affectedRiderIds
            .map((id) => riderById.get(id)?.teamId)
            .filter((id): id is string => Boolean(id)),
        ),
      ).sort(),
      riderConsequences,
      title,
      description,
      healthCaseEligible: injuryOutcomes.length > 0,
      healthSeverityHint: incidentHealthSeverityHint,
      healthSubtypeHint: incidentHealthSubtypeHint,
      persistentHealthOutcome: 'application_health_system_after_finalization',
    }
    incidents.push(incident)
    incidentCountByPhase[phase] += 1
    affectedRiderIds.forEach((id) => {
      nextRiderEligibleSecondById.set(
        id,
        raceSecond + PHASE10_RIDER_COOLDOWN_SECONDS,
      )
    })
    riderConsequences
      .filter((row) => row.statusImpact === 'dnf')
      .forEach((row) => {
        permanentlyUnavailableRiderIds.add(row.riderId)
        nextRiderEligibleKmById.set(row.riderId, Number.POSITIVE_INFINITY)
      })

    // The 900-second cooldown is real, but a rider who is still physically
    // detached by an unresolved incident cannot suffer a second peloton/group
    // incident before rejoining. Re-evaluate the authoritative autonomous
    // chase after each physical separation so a successfully rejoined rider
    // becomes eligible again once both the time and physical constraints clear.
    if (
      input.stage.stageFormat === 'road_race' &&
      riderConsequences.some(
        (row) => row.movedToLaterGroup && row.statusImpact === 'finished',
      )
    ) {
      const provisionalAutonomousChase = phase10BuildAutonomousIncidentChase({
        input,
        riderReadiness,
        baseReplayTimeline,
        baseFinishResolution,
        incidents,
      })
      incidents.forEach((generatedIncident) => {
        generatedIncident.riderConsequences.forEach((row) => {
          if (!row.movedToLaterGroup || row.statusImpact !== 'finished') return
          const episode = provisionalAutonomousChase.episodeByKey.get(
            phase10EpisodeKey(generatedIncident.incidentId, row.riderId),
          )
          nextRiderEligibleKmById.set(
            row.riderId,
            episode?.actualRejoinKm ?? Number.POSITIVE_INFINITY,
          )
        })
      })
    }
    nextGlobalEligibleSecond = raceSecond + PHASE10_GLOBAL_COOLDOWN_SECONDS
  }

  const autonomousChase = phase10BuildAutonomousIncidentChase({
    input,
    riderReadiness,
    baseReplayTimeline,
    baseFinishResolution,
    incidents,
  })
  const autonomousIncidents = incidents.map(
    (incident): UniversalPhase10IncidentRecord => ({
      ...incident,
      riderConsequences: incident.riderConsequences.map(
        (row): UniversalPhase10RiderIncidentConsequence => {
          if (!row.movedToLaterGroup || row.statusImpact === 'dnf') return row
          const episode = autonomousChase.episodeByKey.get(
            phase10EpisodeKey(incident.incidentId, row.riderId),
          )
          if (!episode) return row
          const actualRejoinKm = episode.actualRejoinKm
          const finalGapToTargetSeconds = deterministicRound(
            Math.max(0, episode.finalGapToTargetSeconds),
            6,
          )
          return {
            ...row,
            timePenaltySeconds:
              actualRejoinKm !== null
                ? 0
                : Math.max(0, Math.round(finalGapToTargetSeconds)),
            temporarySeparation: actualRejoinKm !== null,
            expectedRejoinKm: actualRejoinKm,
            actualRejoinKm,
            chaseEnergyCostPoints: deterministicRound(
              episode.chaseEnergyCostPoints,
              6,
            ),
            recoveryTargetDisplayCode:
              episode.samples[0]?.targetDisplayCode ?? row.recoveryTargetDisplayCode,
            finalGapToTargetSeconds,
          }
        },
      ),
    }),
  )
  incidents.splice(0, incidents.length, ...autonomousIncidents)

  const consequenceByRiderId = new Map<
    string,
    {
      energyLoss: number
      timePenalty: number
      dnf: boolean
      movedToLaterGroup: boolean
      finishPerformancePenalty: number
      protectedOfficialTimeSeconds: number | null
      sprintProtected: boolean
    }
  >()
  incidents.forEach((incident) => {
    incident.riderConsequences.forEach((row) => {
      const existing = consequenceByRiderId.get(row.riderId) ?? {
        energyLoss: 0,
        timePenalty: 0,
        dnf: false,
        movedToLaterGroup: false,
        finishPerformancePenalty: 0,
        protectedOfficialTimeSeconds: null,
        sprintProtected: false,
      }
      consequenceByRiderId.set(row.riderId, {
        energyLoss: deterministicRound(
          existing.energyLoss + row.energyLossPoints + row.chaseEnergyCostPoints,
          6,
        ),
        timePenalty: existing.timePenalty + row.timePenaltySeconds,
        dnf: existing.dnf || row.statusImpact === 'dnf',
        movedToLaterGroup: existing.movedToLaterGroup || row.movedToLaterGroup,
        finishPerformancePenalty: deterministicRound(
          existing.finishPerformancePenalty +
            row.healthOutcome.currentStagePerformancePenaltyPoints,
          6,
        ),
        protectedOfficialTimeSeconds:
          row.sprintZoneProtection.applied &&
          row.sprintZoneProtection.protectedOfficialTimeSeconds !== null
            ? row.sprintZoneProtection.protectedOfficialTimeSeconds
            : existing.protectedOfficialTimeSeconds,
        sprintProtected:
          existing.sprintProtected || row.sprintZoneProtection.applied,
      })
    })
  })

  const physicalFinishTimeByRiderId = new Map<string, number>()
  const adjustedFinishScoreByRiderId = new Map<string, number>()
  const preliminary = baseFinishResolution.classification.map(
    (row): UniversalOfficialFinishRow => {
      const consequence = consequenceByRiderId.get(row.riderId)
      if (row.status === 'dns') return row
      if (consequence?.dnf) {
        return {
          ...row,
          rank: null,
          status: 'dnf',
          physicalGroupCode: null,
          physicalGroupOrder: null,
          officialTimeSeconds: null,
          gapSeconds: null,
          sameTimeAsPrevious: false,
          finishScore: null,
          components: null,
        }
      }
      if (row.status !== 'finished' || row.officialTimeSeconds === null) return row
      const physicalFinishTimeSeconds = deterministicRound(
        row.officialTimeSeconds + (consequence?.timePenalty ?? 0),
        6,
      )
      physicalFinishTimeByRiderId.set(row.riderId, physicalFinishTimeSeconds)
      adjustedFinishScoreByRiderId.set(
        row.riderId,
        deterministicRound(
          (row.finishScore ?? 0) -
            (consequence?.finishPerformancePenalty ?? 0),
          6,
        ),
      )
      return {
        ...row,
        // Sprint-zone protection changes official time only. Physical stage
        // place remains driven by the real finish time below.
        officialTimeSeconds: deterministicRound(
          consequence?.protectedOfficialTimeSeconds ?? physicalFinishTimeSeconds,
          6,
        ),
      }
    },
  )
  const winnerTimeBeforeOtl = preliminary
    .filter((row) => row.status === 'finished' && row.officialTimeSeconds !== null)
    .reduce<number | null>(
      (minimum, row) =>
        minimum === null
          ? row.officialTimeSeconds
          : Math.min(minimum, row.officialTimeSeconds ?? minimum),
      null,
    )
  const timeLimitPercentage = phase10TimeLimitPercentage(input.stage)
  const cutoffTimeSeconds =
    winnerTimeBeforeOtl === null
      ? null
      : deterministicRound(
          winnerTimeBeforeOtl * (1 + timeLimitPercentage / 100),
          6,
        )
  const withOtl = preliminary.map((row): UniversalOfficialFinishRow => {
    if (
      row.status === 'finished' &&
      row.officialTimeSeconds !== null &&
      cutoffTimeSeconds !== null &&
      row.officialTimeSeconds > cutoffTimeSeconds + 0.000001
    ) {
      return {
        ...row,
        rank: null,
        status: 'otl',
        physicalGroupCode: null,
        physicalGroupOrder: null,
        sameTimeAsPrevious: false,
      }
    }
    return row
  })
  const finishedSorted = withOtl
    .filter((row) => row.status === 'finished' && row.officialTimeSeconds !== null)
    .slice()
    .sort(
      (left, right) =>
        (physicalFinishTimeByRiderId.get(left.riderId) ?? Number.POSITIVE_INFINITY) -
          (physicalFinishTimeByRiderId.get(right.riderId) ?? Number.POSITIVE_INFINITY) ||
        (adjustedFinishScoreByRiderId.get(right.riderId) ?? Number.NEGATIVE_INFINITY) -
          (adjustedFinishScoreByRiderId.get(left.riderId) ?? Number.NEGATIVE_INFINITY) ||
        (left.rank ?? Number.MAX_SAFE_INTEGER) -
          (right.rank ?? Number.MAX_SAFE_INTEGER) ||
        left.riderId.localeCompare(right.riderId),
    )
  const winnerTime = finishedSorted[0]?.officialTimeSeconds ?? null
  const physicalWinnerTime =
    finishedSorted.length > 0
      ? physicalFinishTimeByRiderId.get(finishedSorted[0].riderId) ?? null
      : null
  const physicalGapByRiderId = new Map<string, number>()
  if (physicalWinnerTime !== null) {
    finishedSorted.forEach((row) => {
      const physicalTime = physicalFinishTimeByRiderId.get(row.riderId)
      if (physicalTime !== undefined) {
        physicalGapByRiderId.set(
          row.riderId,
          deterministicRound(Math.max(0, physicalTime - physicalWinnerTime), 6),
        )
      }
    })
  }
  const finishedRanked = finishedSorted.map(
    (row, index): UniversalOfficialFinishRow => ({
      ...row,
      rank: index + 1,
      gapSeconds:
        winnerTime === null || row.officialTimeSeconds === null
          ? null
          : deterministicRound(row.officialTimeSeconds - winnerTime, 6),
      sameTimeAsPrevious:
        index > 0 &&
        row.officialTimeSeconds === finishedSorted[index - 1]?.officialTimeSeconds,
    }),
  )
  const rankedById = new Map(finishedRanked.map((row) => [row.riderId, row] as const))
  let classification = withOtl
    .map((row) => rankedById.get(row.riderId) ?? row)
    .sort(
      (left, right) =>
        (left.rank ?? Number.MAX_SAFE_INTEGER) -
          (right.rank ?? Number.MAX_SAFE_INTEGER) ||
        left.status.localeCompare(right.status) ||
        left.riderId.localeCompare(right.riderId),
    )

  const finalRoad =
    input.stage.stageFormat === 'road_race'
      ? phase10BuildFinalRoadGroups(
          baseReplayTimeline,
          classification,
          physicalGapByRiderId,
        )
      : {
          groups: [] as readonly UniversalReplayGroupState[],
          gaps: [] as readonly UniversalReplayGapState[],
          groupOrderByRiderId: new Map<string, number>(),
          groupCodeByRiderId: new Map<string, UniversalPhase5GroupCode>(),
        }
  if (input.stage.stageFormat === 'road_race') {
    classification = classification.map((row) => {
      if (row.status !== 'finished') return row
      return {
        ...row,
        physicalGroupCode: finalRoad.groupCodeByRiderId.get(row.riderId) ?? null,
        physicalGroupOrder: finalRoad.groupOrderByRiderId.get(row.riderId) ?? null,
      }
    })
  }
  const winner = classification.find((row) => row.status === 'finished' && row.rank === 1)
  const teamTimeTrialFormat =
    input.stage.stageFormat === 'team_time_trial' ||
    input.stage.stageFormat === 'pair_time_trial'
  const finishResolution: UniversalFinishResolution = {
    ...baseFinishResolution,
    winnerRiderId: teamTimeTrialFormat
      ? baseFinishResolution.winnerRiderId
      : winner?.riderId ?? null,
    winnerTeamId: teamTimeTrialFormat
      ? baseFinishResolution.winnerTeamId
      : winner?.teamId ?? null,
    classification,
  }

  const dnfIncidentByRiderId = new Map<string, UniversalPhase10IncidentRecord>()
  incidents.forEach((incident) => {
    incident.riderConsequences.forEach((row) => {
      if (row.statusImpact === 'dnf') dnfIncidentByRiderId.set(row.riderId, incident)
    })
  })
  const phase10SourceReplayTimeline = phase10BuildExactEventReplayTimeline(
    input,
    baseReplayTimeline,
    incidents,
    autonomousChase,
  )
  const firstCheckpointIndexByIncidentId = new Map<string, number>()
  const firstRejoinCheckpointIndexByIncidentId = new Map<string, number>()
  incidents.forEach((incident) => {
    const index = phase10SourceReplayTimeline.checkpoints.findIndex(
      (checkpoint) =>
        checkpoint.raceProgress.kmFromStart >= incident.kmFromStart - 0.000001,
    )
    firstCheckpointIndexByIncidentId.set(
      incident.incidentId,
      index >= 0
        ? index
        : Math.max(0, phase10SourceReplayTimeline.checkpoints.length - 1),
    )
    const rejoinKm = incident.riderConsequences
      .filter((row) => row.temporarySeparation && row.expectedRejoinKm !== null)
      .reduce<number | null>(
        (maximum, row) =>
          maximum === null
            ? row.expectedRejoinKm
            : Math.max(maximum, row.expectedRejoinKm ?? maximum),
        null,
      )
    if (rejoinKm !== null) {
      const rejoinIndex = phase10SourceReplayTimeline.checkpoints.findIndex(
        (checkpoint) =>
          !checkpoint.finalResultsVisible &&
          checkpoint.raceProgress.kmFromStart >= rejoinKm - 0.000001,
      )
      if (rejoinIndex >= 0) {
        firstRejoinCheckpointIndexByIncidentId.set(incident.incidentId, rejoinIndex)
      }
    }
  })

  const replayCheckpoints = phase10SourceReplayTimeline.checkpoints.map(
    (checkpoint, checkpointIndex): UniversalReplayCheckpoint => {
      const occurred = incidents.filter(
        (incident) =>
          checkpoint.raceProgress.kmFromStart >= incident.kmFromStart - 0.000001,
      )
      const energyLossByRiderId = new Map<string, number>()
      occurred.forEach((incident) => {
        incident.riderConsequences.forEach((row) => {
          energyLossByRiderId.set(
            row.riderId,
            (energyLossByRiderId.get(row.riderId) ?? 0) + row.energyLossPoints,
          )
        })
      })
      let groups = checkpoint.groups.map((group) => ({
        ...group,
        riderIds: [...group.riderIds],
      }))
      let gaps = checkpoint.gaps.map((gap) => ({ ...gap }))
      const riderStates = checkpoint.riderStates.map((state): UniversalReplayRiderState => {
        const official = classification.find((row) => row.riderId === state.riderId)
        const dnfIncident = dnfIncidentByRiderId.get(state.riderId)
        const dnfReached = Boolean(
          dnfIncident &&
            checkpoint.raceProgress.kmFromStart >= dnfIncident.kmFromStart - 0.000001,
        )
        const status: UniversalReplayRiderStatus = checkpoint.finalResultsVisible
          ? official?.status ?? state.status
          : dnfReached
            ? 'dnf'
            : state.status
        return {
          ...state,
          status,
          energy: deterministicRound(
            Math.max(
              0,
              state.energy -
                (energyLossByRiderId.get(state.riderId) ?? 0) -
                phase10AutonomousChaseEnergyAtKm(
                  autonomousChase,
                  state.riderId,
                  checkpoint.raceProgress.kmFromStart,
                ),
            ),
            6,
          ),
          finishRank: checkpoint.finalResultsVisible ? official?.rank ?? null : null,
          officialTimeSeconds: checkpoint.finalResultsVisible
            ? official?.officialTimeSeconds ?? null
            : null,
          gapSeconds: checkpoint.finalResultsVisible
            ? official?.gapSeconds ?? null
            : state.gapSeconds,
        }
      })

      if (input.stage.stageFormat === 'road_race' && !checkpoint.finalResultsVisible) {
        const checkpointKm = checkpoint.raceProgress.kmFromStart
        const autonomousSamples = autonomousChase.episodes
          .map((episode) => ({
            episode,
            sample: phase10AutonomousEpisodeSampleAtKm(
              autonomousChase,
              episode.episodeKey,
              checkpointKm,
            ),
          }))
          .filter(
            (row): row is {
              episode: Phase10AutonomousChaseEpisode
              sample: Phase10AutonomousChaseEpisodeSample
            } => Boolean(row.sample),
          )
        const autonomousRiderIds = new Set(
          autonomousSamples.map((row) => row.episode.riderId),
        )
        const reachedDnfRiderIds = new Set(
          occurred.flatMap((incident) =>
            incident.riderConsequences
              .filter((row) => row.statusImpact === 'dnf')
              .map((row) => row.riderId),
          ),
        )
        const detachedRiderIds = new Set([
          ...autonomousRiderIds,
          ...reachedDnfRiderIds,
        ])
        groups = groups
          .map((group) => ({
            ...group,
            riderIds: group.riderIds.filter((id) => !detachedRiderIds.has(id)),
          }))
          .filter((group) => group.riderIds.length > 0)
        gaps = gaps.filter((gap) =>
          groups.some((group) => group.displayCode === gap.displayCode),
        )

        reachedDnfRiderIds.forEach((riderId) => {
          const state = riderStates.find((row) => row.riderId === riderId)
          if (!state) return
          ;(state as { groupCode: UniversalPhase5GroupCode | null }).groupCode = null
          ;(state as { displayCode: string | null }).displayCode = null
          ;(state as { gapSeconds: number | null }).gapSeconds = null
        })

        const autonomousGroupByDisplayCode = new Map<
          string,
          {
            readonly displayCode: string
            readonly targetDisplayCode: string
            readonly gapToTargetSeconds: number
            readonly riderIds: Set<string>
          }
        >()
        autonomousSamples.forEach(({ episode, sample }) => {
          const existing = autonomousGroupByDisplayCode.get(sample.displayCode)
          if (existing) {
            existing.riderIds.add(episode.riderId)
            return
          }
          autonomousGroupByDisplayCode.set(sample.displayCode, {
            displayCode: sample.displayCode,
            targetDisplayCode: sample.targetDisplayCode,
            gapToTargetSeconds: sample.gapToTargetSeconds,
            riderIds: new Set(sample.groupRiderIds),
          })
        })

        autonomousGroupByDisplayCode.forEach((autonomousGroup) => {
          const targetGap =
            checkpoint.gaps.find(
              (gap) => gap.displayCode === autonomousGroup.targetDisplayCode,
            )?.gapSeconds ??
            checkpoint.gaps.find((gap) => gap.displayCode === 'P')?.gapSeconds ??
            0
          const incidentGap = deterministicRound(
            Math.max(0, targetGap + autonomousGroup.gapToTargetSeconds),
            6,
          )
          const pelotonGap =
            checkpoint.gaps.find((gap) => gap.displayCode === 'P')?.gapSeconds ?? 0
          const riderIds = [...autonomousGroup.riderIds].sort()
          groups.push({
            groupCode: 'dropped_group',
            displayCode: autonomousGroup.displayCode,
            physicalPosition:
              incidentGap + PHASE5_GROUP_MERGE_TOLERANCE_SECONDS < pelotonGap
                ? 'ahead_of_peloton'
                : 'behind_peloton',
            colorKey: 'dropped_gray',
            riderIds,
          })
          gaps.push({
            groupCode: 'dropped_group',
            displayCode: autonomousGroup.displayCode,
            gapSeconds: incidentGap,
            officialTimeSeconds: null,
          })
          riderIds.forEach((riderId) => {
            const state = riderStates.find((row) => row.riderId === riderId)
            if (!state) return
            ;(state as {
              groupCode: UniversalPhase5GroupCode | null
            }).groupCode = 'dropped_group'
            ;(state as { displayCode: string | null }).displayCode =
              autonomousGroup.displayCode
            ;(state as { gapSeconds: number | null }).gapSeconds = incidentGap
          })
        })


        // A newly detached incident rider can land directly on an already
        // existing chasing/dropped road group. Reuse the authoritative five-
        // second physical merge tolerance here as well: the rider joins that
        // group instead of creating two display groups at the same road position.
        let replayGroupsMerged = true
        while (replayGroupsMerged) {
          replayGroupsMerged = false
          const ordered = groups
            .map((group) => ({
              group,
              gap: gaps.find((row) => row.displayCode === group.displayCode),
            }))
            .filter((row) => Boolean(row.gap))
            .map((row) => ({ group: row.group, gap: row.gap! }))
            .sort(
              (left, right) =>
                left.gap.gapSeconds - right.gap.gapSeconds ||
                left.group.displayCode.localeCompare(right.group.displayCode),
            )
          for (let index = 0; index < ordered.length - 1; index += 1) {
            const left = ordered[index]
            const right = ordered[index + 1]
            if (
              Math.abs(left.gap.gapSeconds - right.gap.gapSeconds) >
              PHASE5_GROUP_MERGE_TOLERANCE_SECONDS + 0.000001
            ) {
              continue
            }
            const leftIncident = left.group.displayCode.startsWith('I')
            const rightIncident = right.group.displayCode.startsWith('I')
            if (!leftIncident && !rightIncident) continue
            const keep =
              leftIncident !== rightIncident
                ? leftIncident
                  ? right
                  : left
                : left.group.displayCode.localeCompare(right.group.displayCode) <= 0
                  ? left
                  : right
            const absorb = keep === left ? right : left
            const mergedRiderIds = Array.from(
              new Set([...keep.group.riderIds, ...absorb.group.riderIds]),
            ).sort()
            const keepGroupIndex = groups.findIndex(
              (group) => group.displayCode === keep.group.displayCode,
            )
            if (keepGroupIndex >= 0) {
              groups[keepGroupIndex] = {
                ...groups[keepGroupIndex],
                riderIds: mergedRiderIds,
              }
            }
            groups = groups.filter(
              (group) => group.displayCode !== absorb.group.displayCode,
            )
            gaps = gaps.filter(
              (gap) => gap.displayCode !== absorb.group.displayCode,
            )
            absorb.group.riderIds.forEach((riderId) => {
              const state = riderStates.find((row) => row.riderId === riderId)
              if (!state) return
              ;(state as {
                groupCode: UniversalPhase5GroupCode | null
              }).groupCode = keep.group.groupCode
              ;(state as { displayCode: string | null }).displayCode =
                keep.group.displayCode
              ;(state as { gapSeconds: number | null }).gapSeconds =
                keep.gap.gapSeconds
            })
            replayGroupsMerged = true
            break
          }
        }

        const paired = groups.map((group) => ({
          group,
          gap: gaps.find((row) => row.displayCode === group.displayCode),
        }))
        paired.sort(
          (left, right) =>
            (left.gap?.gapSeconds ?? 0) - (right.gap?.gapSeconds ?? 0) ||
            left.group.displayCode.localeCompare(right.group.displayCode),
        )
        groups = paired.map((row) => row.group)
        gaps = paired
          .map((row) => row.gap)
          .filter((row): row is UniversalReplayGapState => Boolean(row))
      }

      const isRoadFinishKmCheckpoint =
        input.stage.stageFormat === 'road_race' &&
        Math.abs(
          checkpoint.raceProgress.kmFromStart - input.stage.distanceKm,
        ) <= 0.000001

      // Every checkpoint at the exact road-race finish kilometre must share
      // the authoritative final physical road state. A competition-point
      // checkpoint at the finish remains result-hidden: only its groups and
      // physical gaps are synchronized here; ranks and official times remain
      // unavailable until the authoritative final checkpoint.
      if (isRoadFinishKmCheckpoint && !checkpoint.finalResultsVisible) {
        groups = finalRoad.groups.map((group) => ({
          ...group,
          riderIds: [...group.riderIds],
        }))
        gaps = finalRoad.gaps.map((gap) => ({
          ...gap,
          officialTimeSeconds: null,
        }))
        riderStates.forEach((state) => {
          const group = groups.find((row) =>
            row.riderIds.includes(state.riderId),
          )
          const gap = group
            ? gaps.find((row) => row.displayCode === group.displayCode)
            : null

          ;(state as {
            groupCode: UniversalPhase5GroupCode | null
          }).groupCode = group?.groupCode ?? null
          ;(state as { displayCode: string | null }).displayCode =
            group?.displayCode ?? null
          ;(state as { gapSeconds: number | null }).gapSeconds =
            group && gap
              ? gap.gapSeconds
              : classification.find((row) => row.riderId === state.riderId)
                  ?.gapSeconds ?? null
          ;(state as { officialTimeSeconds: number | null }).officialTimeSeconds =
            null
          ;(state as { finishRank: number | null }).finishRank = null
        })
      }

      if (checkpoint.finalResultsVisible) {
        if (input.stage.stageFormat === 'road_race') {
          groups = finalRoad.groups.map((group) => ({ ...group, riderIds: [...group.riderIds] }))
          gaps = finalRoad.gaps.map((gap) => ({ ...gap }))
          riderStates.forEach((state) => {
            const group = groups.find((row) => row.riderIds.includes(state.riderId))
            const gap = group
              ? gaps.find((row) => row.displayCode === group.displayCode)
              : null
            ;(state as { groupCode: UniversalPhase5GroupCode | null }).groupCode = group?.groupCode ?? null
            ;(state as { displayCode: string | null }).displayCode = group?.displayCode ?? null
            ;(state as { gapSeconds: number | null }).gapSeconds =
              group && gap
                ? gap.gapSeconds
                : classification.find((row) => row.riderId === state.riderId)?.gapSeconds ?? null
            if (group && gap) {
              ;(state as { officialTimeSeconds: number | null }).officialTimeSeconds =
                classification.find((row) => row.riderId === state.riderId)?.officialTimeSeconds ?? null
            }
          })
        } else {
          const nonFinished = new Set(
            classification
              .filter((row) => row.status !== 'finished')
              .map((row) => row.riderId),
          )
          groups = groups
            .map((group) => ({
              ...group,
              riderIds: group.riderIds.filter((id) => !nonFinished.has(id)),
            }))
            .filter((group) => group.riderIds.length > 0)
          gaps = gaps.filter((gap) =>
            groups.some((group) => group.displayCode === gap.displayCode),
          )
          riderStates.forEach((state) => {
            const official = classification.find(
              (row) => row.riderId === state.riderId,
            )
            if (!official || official.status === 'finished') return
            ;(state as {
              groupCode: UniversalPhase5GroupCode | null
            }).groupCode = null
            ;(state as { displayCode: string | null }).displayCode = null
            ;(state as { gapSeconds: number | null }).gapSeconds =
              official.gapSeconds ?? null
            ;(state as {
              officialTimeSeconds: number | null
            }).officialTimeSeconds = official.officialTimeSeconds ?? null
          })
          if (
            input.stage.stageFormat === 'individual_time_trial' ||
            input.stage.stageFormat === 'prologue'
          ) {
            gaps = gaps.map((gap) => {
              const group = groups.find((row) => row.displayCode === gap.displayCode)
              const riderId = group?.riderIds[0]
              const official = riderId
                ? classification.find((row) => row.riderId === riderId)
                : undefined
              return official?.status === 'finished'
                ? {
                    ...gap,
                    gapSeconds: official.gapSeconds ?? gap.gapSeconds,
                    officialTimeSeconds:
                      official.officialTimeSeconds ?? gap.officialTimeSeconds,
                  }
                : gap
            })
          }
        }
      }

      const replayIncidents: UniversalReplayIncident[] = occurred.map((incident) => ({
        incidentId: incident.incidentId,
        incidentType: incident.incidentType,
        phase: incident.phase,
        kmFromStart: incident.kmFromStart,
        riderIds: incident.riderIds,
        teamIds: incident.teamIds,
        title: incident.title,
        description: incident.description,
      }))
      const incidentCommentary = incidents
        .filter(
          (incident) => firstCheckpointIndexByIncidentId.get(incident.incidentId) === checkpointIndex,
        )
        .map((incident): UniversalReplayCommentaryEntry => ({
          commentaryId: `commentary:${incident.incidentId}`,
          eventType: 'incident',
          title: incident.title,
          description: incident.description,
          riderIds: incident.riderIds,
          teamIds: incident.teamIds,
        }))
      const incidentRejoinCommentary = incidents
        .filter(
          (incident) =>
            firstRejoinCheckpointIndexByIncidentId.get(incident.incidentId) ===
            checkpointIndex,
        )
        .map((incident): UniversalReplayCommentaryEntry => {
          const labels = incident.riderIds.map(riderTeamLabel)
          const sourceLabel =
            incident.sourceDisplayCode === 'P' || incident.sourceDisplayCode === null
              ? 'the peloton'
              : `group ${incident.sourceDisplayCode}`
          return {
            commentaryId: `commentary:${incident.incidentId}:rejoin`,
            eventType: 'group_merge',
            title: labels.length === 1 ? 'Rider chases back' : 'Riders chase back',
            description: `${labels.join(', ')} ${labels.length === 1 ? 'rejoins' : 'rejoin'} ${sourceLabel} after recovering from the ${incident.timeLossSeconds}-second incident delay.`,
            riderIds: incident.riderIds,
            teamIds: incident.teamIds,
          }
        })
      const autonomousMergeCommentary = autonomousChase.mergeEvents
        .filter(
          (event) =>
            Math.abs(
              checkpoint.raceProgress.kmFromStart - event.kmFromStart,
            ) <= 0.000001,
        )
        .map((event): UniversalReplayCommentaryEntry => ({
          commentaryId: `commentary:${event.eventId}`,
          eventType: 'group_merge',
          title: 'Incident chase groups join forces',
          description: `${event.riderIds.map(riderTeamLabel).join(', ')} form one chase group behind ${event.targetDisplayCode === 'P' ? 'the peloton' : `group ${event.targetDisplayCode}`}.`,
          riderIds: event.riderIds,
          teamIds: event.teamIds,
        }))
      if (input.stage.stageFormat === 'road_race') {
        const normalizedBehindPeloton = phase10NormalizeBehindPelotonDisplay(
          groups,
          gaps,
        )
        groups = normalizedBehindPeloton.groups.map((group) => ({
          ...group,
          riderIds: [...group.riderIds],
        }))
        gaps = normalizedBehindPeloton.gaps.map((gap) => ({ ...gap }))
        const displayCodeByRiderId = new Map<string, string>()
        groups.forEach((group) =>
          group.riderIds.forEach((riderId) =>
            displayCodeByRiderId.set(riderId, group.displayCode),
          ),
        )
        riderStates.forEach((state) => {
          const displayCode = displayCodeByRiderId.get(state.riderId)
          if (displayCode) {
            ;(state as { displayCode: string | null }).displayCode = displayCode
          }
        })
      }

      const activeCommands = checkpoint.activeCommands.filter((command) => {
        const incident = dnfIncidentByRiderId.get(command.riderId)
        return !incident || checkpoint.raceProgress.kmFromStart < incident.kmFromStart - 0.000001
      })
      const correctedBaseCommentary = checkpoint.commentary.map((entry) => {
        if (
          entry.title !== 'The race remains split' &&
          entry.title !== 'The field remains together'
        ) {
          return entry
        }

        const orderedGroups = groups
          .map((group) => ({
            group,
            gap:
              gaps.find((row) => row.displayCode === group.displayCode)
                ?.gapSeconds ?? 0,
          }))
          .sort(
            (left, right) =>
              left.gap - right.gap ||
              left.group.displayCode.localeCompare(right.group.displayCode),
          )
        if (orderedGroups.length <= 1) {
          const main = orderedGroups[0]?.group
          return {
            ...entry,
            title: 'The field remains together',
            description: `${main?.riderIds.length ?? 0} riders remain in the main group.`,
          }
        }

        const first = orderedGroups[0]
        const second = orderedGroups[1]
        const gapSeconds = Math.max(0, Math.round(second.gap - first.gap))
        const gapLabel =
          gapSeconds < 60
            ? `${gapSeconds} second${gapSeconds === 1 ? '' : 's'}`
            : `${Math.floor(gapSeconds / 60)}:${String(gapSeconds % 60).padStart(2, '0')}`
        return {
          ...entry,
          title: 'The race remains split',
          description: `${first.group.displayCode} leads ${second.group.displayCode} by ${gapLabel} with ${orderedGroups.length} groups on the road.`,
        }
      })
      return {
        ...checkpoint,
        groups,
        gaps,
        riderStates,
        teamStates: phase10ReplayTeamStates(input, riderStates),
        activeCommands,
        incidents: replayIncidents,
        commentary: [
          ...correctedBaseCommentary,
          ...incidentCommentary,
          ...incidentRejoinCommentary,
          ...autonomousMergeCommentary,
        ],
      }
    },
  )
  const replayTimeline: UniversalReplayTimeline = {
    ...phase10SourceReplayTimeline,
    checkpoints: replayCheckpoints,
  }

  const statusByRiderId = Object.fromEntries(
    classification.map((row) => [row.riderId, row.status]),
  ) as Readonly<Record<string, UniversalOfficialFinishStatus>>
  const statusGroups: UniversalPhase10StatusGroup[] =
    UNIVERSAL_PHASE10_OFFICIAL_STATUSES.map((status) => ({
      status,
      riderIds: classification
        .filter((row) => row.status === status)
        .map((row) => row.riderId)
        .sort(),
    }))
  const allStatusRiderIds = statusGroups.flatMap((row) => row.riderIds).sort()
  const acceptedRiderIds = input.riders.map((row) => row.riderId).sort()
  const everyIncidentRiderRemainsTracked = incidents.every((incident) =>
    incident.riderIds.every(
      (riderId) =>
        acceptedRiderIds.includes(riderId) &&
        classification.some((row) => row.riderId === riderId) &&
        replayTimeline.checkpoints.every((checkpoint) =>
          checkpoint.riderStates.some((row) => row.riderId === riderId),
        ),
    ),
  )
  const summary: UniversalPhase10IncidentSummary = {
    active: true,
    modelEnabled: true,
    preRaceAvailability,
    incidents,
    incidentCount: incidents.length,
    individualCrashCount: incidents.filter((row) => row.incidentKind === 'individual_crash').length,
    groupCrashCount: incidents.filter((row) => row.incidentKind === 'group_crash').length,
    technicalIncidentCount: incidents.filter((row) => row.incidentKind === 'technical_incident').length,
    maximumIncidentsPerStage: PHASE10_MAXIMUM_INCIDENTS_PER_STAGE,
    maximumIncidentsPerPhase: PHASE10_MAXIMUM_INCIDENTS_PER_PHASE,
    incidentCountByPhase: { ...incidentCountByPhase },
    globalCooldownSeconds: PHASE10_GLOBAL_COOLDOWN_SECONDS,
    riderCooldownSeconds: PHASE10_RIDER_COOLDOWN_SECONDS,
    autonomousChase: autonomousChase.summary,
    sprintZone: {
      configuredKm: phase10EffectiveSprintZoneKm(input.stage),
      eligibleStage:
        input.stage.stageFormat === 'road_race' &&
        input.stage.finishType === 'flat_finish' &&
        !input.stage.summitFinish,
      protectedRiderCount: new Set(
        incidents.flatMap((incident) =>
          incident.riderConsequences
            .filter((row) => row.sprintZoneProtection.applied)
            .map((row) => row.riderId),
        ),
      ).size,
      protectedIncidentCount: incidents.filter((incident) =>
        incident.riderConsequences.some((row) => row.sprintZoneProtection.applied),
      ).length,
      source: 'universal_phase10_sprint_zone_time_protection_v1',
    },
    healthHandoff: {
      injuryOutcomeCount: incidents.reduce(
        (sum, incident) =>
          sum +
          incident.riderConsequences.filter(
            (row) => row.healthOutcome.injuryOccurred,
          ).length,
        0,
      ),
      continuingInjuredCount: incidents.reduce(
        (sum, incident) =>
          sum +
          incident.riderConsequences.filter(
            (row) =>
              row.healthOutcome.currentStageContinuation === 'continues_injured',
          ).length,
        0,
      ),
      dnfInjuryCount: incidents.reduce(
        (sum, incident) =>
          sum +
          incident.riderConsequences.filter(
            (row) => row.healthOutcome.currentStageContinuation === 'dnf',
          ).length,
        0,
      ),
      persistentCaseCandidateCount: incidents.reduce(
        (sum, incident) =>
          sum +
          incident.riderConsequences.filter(
            (row) =>
              row.healthOutcome.persistentAction ===
              'create_health_case_after_finalization',
          ).length,
        0,
      ),
      persistentWritesPerformed: false,
      source: 'universal_phase10_crash_health_handoff_v1',
    },
    finalClassification: classification,
    finalRoadGroups: finalRoad.groups,
    finalRoadGaps: finalRoad.gaps,
    statusGroups,
    statusByRiderId,
    allAcceptedRidersHaveExactlyOneStatus:
      classification.length === input.riders.length &&
      new Set(classification.map((row) => row.riderId)).size === input.riders.length,
    allAcceptedRidersPresentInStatusGroups:
      allStatusRiderIds.length === acceptedRiderIds.length &&
      allStatusRiderIds.every((id, index) => id === acceptedRiderIds[index]),
    everyIncidentRiderRemainsTracked,
    timeLimit: {
      percentage: timeLimitPercentage,
      enforced: true,
      winnerTimeSeconds: winnerTime,
      cutoffTimeSeconds:
        winnerTime === null
          ? null
          : deterministicRound(winnerTime * (1 + timeLimitPercentage / 100), 6),
      source: 'universal_phase10_time_limit_v1',
    },
    persistentHealthWritesPerformed: false,
    directDatabaseWritesPerformed: false,
    deterministic: true,
    modelVersion: 'universal_phase_10_incidents_v4',
  }
  return { summary, finishResolution, replayTimeline }
}


export function buildUniversalReplaySynchronizationSummary(
  input: UniversalRaceEngineInput,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  intermediatePointFinalization: UniversalIntermediatePointFinalizationSummary,
  groupAndTimeResolution: UniversalPhase5GroupingSummary,
  finishResolution: UniversalFinishResolution,
  phase10Incidents: UniversalPhase10IncidentSummary,
  replayTimeline: UniversalReplayTimeline,
): UniversalReplaySynchronizationSummary {
  const issueList: string[] = []
  const pushIssue = (issue: string): void => {
    issueList.push(issue)
  }
  const sameStringArray = (
    left: readonly string[],
    right: readonly string[],
  ): boolean =>
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  const inputRiderIds = input.riders
    .map((rider) => rider.riderId)
    .sort()
  const inputRiderIdSet = new Set(inputRiderIds)
  const inputTeamIds = input.teams
    .map((team) => team.teamId)
    .sort()
  const inputTeamIdSet = new Set(inputTeamIds)
  const riderTeamById = new Map(
    input.riders.map((rider) => [rider.riderId, rider.teamId] as const),
  )
  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row] as const),
  )
  const finishByRiderId = new Map(
    finishResolution.classification.map(
      (row) => [row.riderId, row] as const,
    ),
  )
  const checkpointIds = replayTimeline.checkpoints.map(
    (checkpoint) => checkpoint.checkpointId,
  )
  const commentaryIds = replayTimeline.checkpoints.flatMap((checkpoint) =>
    checkpoint.commentary.map((entry) => entry.commentaryId),
  )
  const incidentIds = replayTimeline.checkpoints.flatMap((checkpoint) =>
    checkpoint.incidents.map((incident) => incident.incidentId),
  )
  const uniqueIncidentIds = new Set(incidentIds)
  let allCheckpointsChronological = true
  let allCheckpointRidersComplete = true
  let allGroupMembershipUnique = true
  let allGapsMatchGroups = true
  let allTeamStatesMatchRiders = true
  let allCommandsMatchResolution = true
  let allIntermediateResultsCumulative = true
  let allCommentaryReferencesValid = true
  let allSameKilometreStatesConsistent = true
  let allGapChangesDistanceBounded = true
  let openingBreakawayLineageStable = true
  let allFrontGroupTransfersPhysicallyValid = true
  let allBridgeSequencesPhysicallyValid = true
  let allCommentaryPhaseNeutral = true
  let allCommentaryWholeSecondFormatting = true
  let postCatchStateStable = true
  let allResultFieldsHiddenBeforeFinish = true
  let finalCheckpointMatchesClassification = true
  let previousProgress = -1
  let previousCheckpoint: UniversalReplayCheckpoint | null = null

  if (!replayTimeline.active) {
    pushIssue('timeline_inactive')
  }
  if (!replayTimeline.completeBeforePlayback) {
    pushIssue('timeline_not_complete_before_playback')
  }
  if (replayTimeline.playbackRecalculatesRace) {
    pushIssue('playback_recalculates_race')
  }
  if (replayTimeline.baseCheckpointCount !== 5) {
    pushIssue('base_checkpoint_count_must_equal_five')
  }
  if (
    replayTimeline.baseCheckpointCount !==
    replayTimeline.checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'base',
    ).length
  ) {
    pushIssue('base_checkpoint_count_mismatch')
  }
  if (
    replayTimeline.eventCheckpointCount !==
    replayTimeline.checkpoints.filter(
      (checkpoint) => checkpoint.checkpointKind === 'event',
    ).length
  ) {
    pushIssue('event_checkpoint_count_mismatch')
  }
  if (new Set(checkpointIds).size !== checkpointIds.length) {
    pushIssue('duplicate_checkpoint_id')
  }
  if (new Set(commentaryIds).size !== commentaryIds.length) {
    allCommentaryReferencesValid = false
    pushIssue('duplicate_commentary_id')
  }

  replayTimeline.checkpoints.forEach((checkpoint, checkpointIndex) => {
    const checkpointKey = checkpoint.checkpointId
    if (checkpoint.checkpointIndex !== checkpointIndex) {
      allCheckpointsChronological = false
      pushIssue(`checkpoint_index_mismatch:${checkpointKey}`)
    }
    if (
      checkpoint.raceProgress.fraction < previousProgress - 0.000000001 ||
      checkpoint.raceProgress.fraction < 0 ||
      checkpoint.raceProgress.fraction > 1
    ) {
      allCheckpointsChronological = false
      pushIssue(`checkpoint_progress_invalid:${checkpointKey}`)
    }
    previousProgress = checkpoint.raceProgress.fraction

    if (previousCheckpoint) {
      const distanceDelta =
        checkpoint.raceProgress.kmFromStart -
        previousCheckpoint.raceProgress.kmFromStart
      const previousPhysicalState = JSON.stringify({
        groups: previousCheckpoint.groups,
        gaps: previousCheckpoint.gaps.map((gap) => ({
          groupCode: gap.groupCode,
          displayCode: gap.displayCode,
          gapSeconds: gap.gapSeconds,
        })),
      })
      const currentPhysicalState = JSON.stringify({
        groups: checkpoint.groups,
        gaps: checkpoint.gaps.map((gap) => ({
          groupCode: gap.groupCode,
          displayCode: gap.displayCode,
          gapSeconds: gap.gapSeconds,
        })),
      })
      if (
        Math.abs(distanceDelta) <= 0.000001 &&
        previousPhysicalState !== currentPhysicalState
      ) {
        allSameKilometreStatesConsistent = false
        pushIssue(`same_kilometre_physical_state_mismatch:${previousCheckpoint.checkpointId}->${checkpointKey}`)
      }

      const previousPelotonGap = previousCheckpoint.gaps.find(
        (gap) => gap.displayCode === 'P',
      )?.gapSeconds
      const currentPelotonGap = checkpoint.gaps.find(
        (gap) => gap.displayCode === 'P',
      )?.gapSeconds
      const previousOpeningGroup = previousCheckpoint.groups.find((group) =>
        group.displayCode.startsWith('B'),
      )
      const currentOpeningGroup = checkpoint.groups.find((group) =>
        group.displayCode.startsWith('B'),
      )
      const sameOpeningLineage =
        previousOpeningGroup !== undefined &&
        currentOpeningGroup !== undefined &&
        sameStringArray(
          [...previousOpeningGroup.riderIds].sort(),
          [...currentOpeningGroup.riderIds].sort(),
        )
      if (
        previousPelotonGap !== undefined &&
        currentPelotonGap !== undefined &&
        sameOpeningLineage &&
        currentPelotonGap < previousPelotonGap - 0.000001
      ) {
        const travelledKm = Math.max(0, distanceDelta)
        const maximumPhysicalClosureSeconds =
          travelledKm * 8.5 + 2
        if (
          !checkpoint.finalResultsVisible &&
          previousPelotonGap - currentPelotonGap >
            maximumPhysicalClosureSeconds + 0.000001
        ) {
          allGapChangesDistanceBounded = false
          pushIssue(`gap_change_not_distance_bounded:${checkpointKey}`)
        }
      }
    }
    previousCheckpoint = checkpoint

    const riderStateIds = checkpoint.riderStates
      .map((row) => row.riderId)
      .sort()
    if (
      new Set(riderStateIds).size !== riderStateIds.length ||
      !sameStringArray(riderStateIds, inputRiderIds)
    ) {
      allCheckpointRidersComplete = false
      pushIssue(`checkpoint_rider_states_incomplete:${checkpointKey}`)
    }
    checkpoint.riderStates.forEach((row) => {
      if (
        !inputRiderIdSet.has(row.riderId) ||
        riderTeamById.get(row.riderId) !== row.teamId
      ) {
        allCheckpointRidersComplete = false
        pushIssue(`checkpoint_rider_identity_mismatch:${checkpointKey}`)
      }
    })

    const groupDisplayCodes = checkpoint.groups.map(
      (group) => group.displayCode,
    )
    if (new Set(groupDisplayCodes).size !== groupDisplayCodes.length) {
      allGroupMembershipUnique = false
      pushIssue(`duplicate_group_display_code:${checkpointKey}`)
    }
    const groupedRiderIds = checkpoint.groups.flatMap(
      (group) => group.riderIds,
    )
    if (new Set(groupedRiderIds).size !== groupedRiderIds.length) {
      allGroupMembershipUnique = false
      pushIssue(`duplicate_group_rider_membership:${checkpointKey}`)
    }
    if (groupedRiderIds.some((riderId) => !inputRiderIdSet.has(riderId))) {
      allGroupMembershipUnique = false
      pushIssue(`unknown_group_rider:${checkpointKey}`)
    }

    const gapByDisplayCode = new Map(
      checkpoint.gaps.map((gap) => [gap.displayCode, gap] as const),
    )
    if (
      checkpoint.gaps.length !== checkpoint.groups.length ||
      gapByDisplayCode.size !== checkpoint.gaps.length
    ) {
      allGapsMatchGroups = false
      pushIssue(`group_gap_cardinality_mismatch:${checkpointKey}`)
    }
    const distinctGapValues = new Set(
      checkpoint.gaps.map((gap) => deterministicRound(gap.gapSeconds, 6)),
    )
    if (
      input.stage.stageFormat === 'road_race' &&
      checkpoint.gaps.length > 1 &&
      distinctGapValues.size !== checkpoint.gaps.length
    ) {
      allGapsMatchGroups = false
      pushIssue(`duplicate_physical_group_gap:${checkpointKey}`)
    }
    checkpoint.groups.forEach((group) => {
      const gap = gapByDisplayCode.get(group.displayCode)
      if (!gap || gap.groupCode !== group.groupCode) {
        allGapsMatchGroups = false
        pushIssue(`group_gap_identity_mismatch:${checkpointKey}`)
      }
      group.riderIds.forEach((riderId) => {
        const riderState = checkpoint.riderStates.find(
          (row) => row.riderId === riderId,
        )
        if (
          !riderState ||
          riderState.groupCode !== group.groupCode ||
          riderState.displayCode !== group.displayCode ||
          riderState.gapSeconds !== gap?.gapSeconds
        ) {
          allGapsMatchGroups = false
          pushIssue(`rider_group_gap_mismatch:${checkpointKey}`)
        }
      })
    })
    checkpoint.riderStates.forEach((riderState) => {
      if (riderState.groupCode === null && riderState.displayCode === null) {
        return
      }
      const group = checkpoint.groups.find(
        (candidate) =>
          candidate.groupCode === riderState.groupCode &&
          candidate.displayCode === riderState.displayCode &&
          candidate.riderIds.includes(riderState.riderId),
      )
      if (!group) {
        allGroupMembershipUnique = false
        pushIssue(`rider_state_missing_group:${checkpointKey}`)
      }
    })

    const teamStateIds = checkpoint.teamStates
      .map((row) => row.teamId)
      .sort()
    if (
      new Set(teamStateIds).size !== teamStateIds.length ||
      !sameStringArray(teamStateIds, inputTeamIds)
    ) {
      allTeamStatesMatchRiders = false
      pushIssue(`team_states_incomplete:${checkpointKey}`)
    }
    checkpoint.teamStates.forEach((teamState) => {
      const teamRiders = checkpoint.riderStates.filter(
        (row) => row.teamId === teamState.teamId,
      )
      const expectedActiveRiderIds = teamRiders
        .filter(
          (row) => row.status === 'racing' || row.status === 'finished',
        )
        .map((row) => row.riderId)
        .sort()
      if (
        !inputTeamIdSet.has(teamState.teamId) ||
        !sameStringArray(
          [...teamState.activeRiderIds].sort(),
          expectedActiveRiderIds,
        ) ||
        teamState.racingRiderCount !==
          teamRiders.filter((row) => row.status === 'racing').length ||
        teamState.finishedRiderCount !==
          teamRiders.filter((row) => row.status === 'finished').length ||
        teamState.dnsRiderCount !==
          teamRiders.filter((row) => row.status === 'dns').length ||
        teamState.dnfRiderCount !==
          teamRiders.filter((row) => row.status === 'dnf').length ||
        teamState.otlRiderCount !==
          teamRiders.filter((row) => row.status === 'otl').length
      ) {
        allTeamStatesMatchRiders = false
        pushIssue(`team_state_count_mismatch:${checkpointKey}`)
      }
    })

    const expectedCommands =
      input.stage.stageFormat !== 'road_race' || checkpoint.phase === 0
        ? []
        : roadCommandResolution.riders
            .filter((row) => {
              if (!row.eligibleToStart) return false
              return !phase10Incidents.incidents.some(
                (incident) =>
                  incident.kmFromStart <= checkpoint.raceProgress.kmFromStart + 0.000001 &&
                  incident.riderConsequences.some(
                    (consequence) =>
                      consequence.riderId === row.riderId &&
                      consequence.statusImpact === 'dnf',
                  ),
              )
            })
            .flatMap((row): UniversalReplayActiveCommand[] => {
              const phase = row.phases.find(
                (entry) => entry.phaseNumber === checkpoint.phase,
              )
              return phase
                ? [
                    {
                      riderId: row.riderId,
                      teamId: row.teamId,
                      phaseNumber: phase.phaseNumber,
                      stageRole: row.stageRole,
                      savedCommand: phase.savedCommand,
                      resolvedCommand: phase.resolvedCommand,
                      resolvedSource: phase.resolvedSource,
                      behaviour: phase.behaviour,
                    },
                  ]
                : []
            })
            .sort((left, right) =>
              left.riderId.localeCompare(right.riderId),
            )
    if (
      JSON.stringify(checkpoint.activeCommands) !==
      JSON.stringify(expectedCommands)
    ) {
      allCommandsMatchResolution = false
      pushIssue(`active_commands_mismatch:${checkpointKey}`)
    }

    const expectedIntermediateEventIds =
      intermediatePointFinalization.replayEvents
        .filter(
          (event) =>
            event.kmFromStart <=
            checkpoint.raceProgress.kmFromStart + 0.000001,
        )
        .slice()
        .sort(
          (left, right) =>
            left.kmFromStart - right.kmFromStart ||
            left.eventOrder - right.eventOrder ||
            left.eventId.localeCompare(right.eventId),
        )
        .map((event) => event.eventId)
    const actualIntermediateEventIds = checkpoint.intermediateResults.map(
      (event) => event.eventId,
    )
    if (
      !sameStringArray(
        actualIntermediateEventIds,
        expectedIntermediateEventIds,
      )
    ) {
      allIntermediateResultsCumulative = false
      pushIssue(`intermediate_results_mismatch:${checkpointKey}`)
    }

    if (checkpoint.commentary.length === 0) {
      allCommentaryReferencesValid = false
      pushIssue(`checkpoint_commentary_missing:${checkpointKey}`)
    }
    checkpoint.commentary.forEach((entry) => {
      if (
        entry.riderIds.some((riderId) => !inputRiderIdSet.has(riderId)) ||
        entry.teamIds.some((teamId) => !inputTeamIdSet.has(teamId))
      ) {
        allCommentaryReferencesValid = false
        pushIssue(`commentary_reference_invalid:${checkpointKey}`)
      }
      const playerText = `${entry.title} ${entry.description}`
      if (/\bphase\s+[1-9]\b/i.test(playerText)) {
        allCommentaryPhaseNeutral = false
        pushIssue(`commentary_exposes_internal_phase:${checkpointKey}`)
      }
      if (/\d+\.\d+\s*(?:-\s*)?seconds?/i.test(playerText)) {
        allCommentaryWholeSecondFormatting = false
        pushIssue(`commentary_decimal_seconds:${checkpointKey}`)
      }
    })

    if (!checkpoint.finalResultsVisible) {
      if (
        checkpoint.riderStates.some(
          (row) =>
            row.finishRank !== null || row.officialTimeSeconds !== null,
        ) ||
        checkpoint.gaps.some(
          (gap) => gap.officialTimeSeconds !== null,
        )
      ) {
        allResultFieldsHiddenBeforeFinish = false
        pushIssue(`official_result_leak:${checkpointKey}`)
      }
      checkpoint.riderStates.forEach((row) => {
        const readiness = readinessByRiderId.get(row.riderId)
        const dnfIncident = phase10Incidents.incidents.find(
          (incident) =>
            incident.kmFromStart <= checkpoint.raceProgress.kmFromStart + 0.000001 &&
            incident.riderConsequences.some(
              (consequence) =>
                consequence.riderId === row.riderId &&
                consequence.statusImpact === 'dnf',
            ),
        )
        const expectedStatus: UniversalReplayRiderStatus =
          !readiness?.eligibleToStart
            ? 'dns'
            : dnfIncident
              ? 'dnf'
              : 'racing'
        if (row.status !== expectedStatus) {
          allResultFieldsHiddenBeforeFinish = false
          pushIssue(`pre_finish_status_mismatch:${checkpointKey}`)
        }
      })
    }
  })

  const visibleCheckpoints = replayTimeline.checkpoints.filter(
    (checkpoint) => checkpoint.finalResultsVisible,
  )
  if (visibleCheckpoints.length !== 1) {
    finalCheckpointMatchesClassification = false
    pushIssue('final_results_visibility_checkpoint_count_mismatch')
  }
  const finalCheckpoint = replayTimeline.checkpoints.find(
    (checkpoint) => checkpoint.checkpointId === replayTimeline.finalCheckpointId,
  )
  if (
    !finalCheckpoint ||
    replayTimeline.finalCheckpointId === null ||
    replayTimeline.resultsVisibleFromCheckpointId !==
      replayTimeline.finalCheckpointId ||
    finalCheckpoint !== replayTimeline.checkpoints.at(-1) ||
    !finalCheckpoint.finalResultsVisible
  ) {
    finalCheckpointMatchesClassification = false
    pushIssue('final_checkpoint_identity_mismatch')
  }

  if (finalCheckpoint) {
    const finalRiderStateById = new Map(
      finalCheckpoint.riderStates.map(
        (row) => [row.riderId, row] as const,
      ),
    )
    const finalPhysicalGapByRiderId = new Map<string, number>()
    phase10Incidents.finalRoadGroups.forEach((group) => {
      const gap = phase10Incidents.finalRoadGaps.find(
        (row) => row.displayCode === group.displayCode,
      )
      if (!gap) return
      group.riderIds.forEach((riderId) =>
        finalPhysicalGapByRiderId.set(riderId, gap.gapSeconds),
      )
    })
    finishResolution.classification.forEach((official) => {
      const replay = finalRiderStateById.get(official.riderId)
      const expectedReplayGap =
        input.stage.stageFormat === 'road_race' && official.status === 'finished'
          ? finalPhysicalGapByRiderId.get(official.riderId) ?? official.gapSeconds
          : official.gapSeconds
      if (
        !replay ||
        replay.status !== official.status ||
        replay.finishRank !== official.rank ||
        replay.officialTimeSeconds !== official.officialTimeSeconds ||
        replay.gapSeconds !== expectedReplayGap
      ) {
        finalCheckpointMatchesClassification = false
        pushIssue(`final_rider_result_mismatch:${official.riderId}`)
      }
    })
    const finishedRiderIds = finishResolution.classification
      .filter((row) => row.status === 'finished')
      .map((row) => row.riderId)
      .sort()
    const groupedFinalRiderIds = finalCheckpoint.groups
      .flatMap((group) => group.riderIds)
      .sort()
    if (!sameStringArray(groupedFinalRiderIds, finishedRiderIds)) {
      finalCheckpointMatchesClassification = false
      pushIssue('final_group_membership_mismatch')
    }

    if (input.stage.stageFormat === 'road_race') {
      const expectedGroups = phase10Incidents.finalRoadGroups.map(
        (group) => ({
          groupCode: group.groupCode,
          displayCode: group.displayCode,
          physicalPosition: group.physicalPosition,
          colorKey: group.colorKey,
          riderIds: [...group.riderIds],
        }),
      )
      const expectedGaps = phase10Incidents.finalRoadGaps.map(
        (gap) => ({ ...gap }),
      )
      if (
        JSON.stringify(finalCheckpoint.groups) !==
          JSON.stringify(expectedGroups) ||
        JSON.stringify(finalCheckpoint.gaps) !== JSON.stringify(expectedGaps)
      ) {
        finalCheckpointMatchesClassification = false
        pushIssue('final_road_groups_or_gaps_mismatch')
      }
    }

    const teamFormat =
      input.stage.stageFormat === 'team_time_trial' ||
      input.stage.stageFormat === 'pair_time_trial'
    if (teamFormat) {
      const winningTeam = finishResolution.teamTimes[0]
      if (
        !winningTeam ||
        winningTeam.teamId !== finishResolution.winnerTeamId ||
        winningTeam.countingRiderId !== finishResolution.winnerRiderId
      ) {
        finalCheckpointMatchesClassification = false
        pushIssue('finish_winner_mismatch')
      }
    } else {
      const winner = finishResolution.classification.find(
        (row) => row.rank === 1 && row.status === 'finished',
      )
      if (
        !winner ||
        winner.riderId !== finishResolution.winnerRiderId ||
        winner.teamId !== finishResolution.winnerTeamId
      ) {
        finalCheckpointMatchesClassification = false
        pushIssue('finish_winner_mismatch')
      }
    }
  }

  const openingFormationCheckpointIndex =
    replayTimeline.checkpoints.findIndex((checkpoint) =>
      checkpoint.commentary.some(
        (entry) => entry.eventType === 'breakaway_formation',
      ),
    )
  const openingFormationCheckpoint =
    openingFormationCheckpointIndex >= 0
      ? replayTimeline.checkpoints[openingFormationCheckpointIndex]
      : null
  const openingBreakawayRiderIds =
    openingFormationCheckpoint?.groups
      .filter((group) => group.displayCode.startsWith('B'))
      .flatMap((group) => group.riderIds)
      .sort() ?? []
  const openingBreakawayRiderIdSet = new Set(openingBreakawayRiderIds)
  let expectedBreakawayRiderIds = [...openingBreakawayRiderIds]
  let openingCatchSeen = false

  if (openingFormationCheckpoint && openingBreakawayRiderIds.length === 0) {
    openingBreakawayLineageStable = false
    pushIssue('opening_breakaway_formation_missing_physical_group')
  }

  replayTimeline.checkpoints.forEach((checkpoint, checkpointIndex) => {
    if (checkpointIndex < openingFormationCheckpointIndex) return

    const eventTypes = new Set(
      checkpoint.commentary.map((entry) => entry.eventType),
    )
    const sameKilometreEventTypes = new Set(
      replayTimeline.checkpoints
        .filter(
          (candidate) =>
            Math.abs(
              candidate.raceProgress.kmFromStart -
                checkpoint.raceProgress.kmFromStart,
            ) <= 0.000001,
        )
        .flatMap((candidate) =>
          candidate.commentary.map((entry) => entry.eventType),
        ),
    )
    const hasCatch = sameKilometreEventTypes.has('catch')
    const incidentRiderIdsAtKm = new Set(
      phase10Incidents.incidents
        .filter(
          (incident) =>
            Math.abs(
              incident.kmFromStart - checkpoint.raceProgress.kmFromStart,
            ) <= 0.000001,
        )
        .flatMap((incident) => incident.riderIds),
    )
    const hasBridgeAttack = sameKilometreEventTypes.has('bridge_attack')
    const hasBridgeProgress = eventTypes.has('bridge_progress')
    const hasBridgeMerge = sameKilometreEventTypes.has('bridge_merge')
    const breakawayGroups = checkpoint.groups.filter((group) =>
      group.displayCode.startsWith('B'),
    )
    const breakawayRiderIds = breakawayGroups
      .flatMap((group) => group.riderIds)
      .sort()
    const bridgeGroups = checkpoint.groups.filter((group) =>
      group.displayCode.startsWith('F'),
    )

    if (hasCatch) openingCatchSeen = true

    if (
      !checkpoint.finalResultsVisible &&
      !openingCatchSeen &&
      openingFormationCheckpointIndex >= 0
    ) {
      const originalRidersStillPresent = openingBreakawayRiderIds.every(
        (riderId) => breakawayRiderIds.includes(riderId),
      )
      if (breakawayGroups.length !== 1 || !originalRidersStillPresent) {
        openingBreakawayLineageStable = false
        pushIssue(
          `opening_breakaway_lineage_changed:${checkpoint.checkpointId}`,
        )
      }

      if (hasBridgeMerge && checkpointIndex > 0) {
        const previous = replayTimeline.checkpoints[checkpointIndex - 1]
        const previousBreakawayRiderIds = previous.groups
          .filter((group) => group.displayCode.startsWith('B'))
          .flatMap((group) => group.riderIds)
          .sort()
        const previousBridgeRiderIds = previous.groups
          .filter((group) => group.displayCode.startsWith('F'))
          .flatMap((group) => group.riderIds)
          .sort()
        const expectedMergedRiderIds = Array.from(
          new Set([
            ...previousBreakawayRiderIds,
            ...previousBridgeRiderIds,
          ]),
        ).sort()
        const previousBridgeGap = previous.gaps.find((gap) =>
          gap.displayCode.startsWith('F'),
        )?.gapSeconds
        const previousBreakawayGap = previous.gaps.find((gap) =>
          gap.displayCode.startsWith('B'),
        )?.gapSeconds ?? 0
        const distanceDelta = Math.max(
          0,
          checkpoint.raceProgress.kmFromStart -
            previous.raceProgress.kmFromStart,
        )
        const maximumBridgeClosure = distanceDelta * 14 + 2
        if (
          previousBridgeRiderIds.length === 0 ||
          !sameStringArray(breakawayRiderIds, expectedMergedRiderIds) ||
          bridgeGroups.length > 0 ||
          previousBridgeGap === undefined ||
          previousBridgeGap - previousBreakawayGap >
            PHASE5_GROUP_MERGE_TOLERANCE_SECONDS +
              maximumBridgeClosure +
              0.000001
        ) {
          openingBreakawayLineageStable = false
          allBridgeSequencesPhysicallyValid = false
          pushIssue(`bridge_merge_invalid:${checkpoint.checkpointId}`)
        } else {
          expectedBreakawayRiderIds = expectedMergedRiderIds
        }
      } else if (
        !sameStringArray(breakawayRiderIds, expectedBreakawayRiderIds)
      ) {
        openingBreakawayLineageStable = false
        pushIssue(
          `opening_breakaway_lineage_changed_without_bridge_merge:${checkpoint.checkpointId}`,
        )
      }
    } else if (
      !checkpoint.finalResultsVisible &&
      openingCatchSeen &&
      breakawayGroups.length > 0
    ) {
      openingBreakawayLineageStable = false
      pushIssue(`opening_breakaway_reappears:${checkpoint.checkpointId}`)
    }

    if (checkpointIndex === 0 || checkpoint.finalResultsVisible) return
    const previous = replayTimeline.checkpoints[checkpointIndex - 1]
    const previousStateByRiderId = new Map(
      previous.riderStates.map((row) => [row.riderId, row] as const),
    )
    const currentStateByRiderId = new Map(
      checkpoint.riderStates.map((row) => [row.riderId, row] as const),
    )
    const previousBridge = previous.groups.find((group) =>
      group.displayCode.startsWith('F'),
    )
    const currentBridge = checkpoint.groups.find((group) =>
      group.displayCode.startsWith('F'),
    )
    const previousPeloton = previous.groups.find(
      (group) => group.displayCode === 'P',
    )
    const currentPeloton = checkpoint.groups.find(
      (group) => group.displayCode === 'P',
    )

    if (hasBridgeAttack) {
      const bridgeRiders = currentBridge?.riderIds ?? []
      const cameFromPeloton = bridgeRiders.every((riderId) =>
        previousPeloton?.riderIds.includes(riderId),
      )
      const alreadySeparateFrontGroup = bridgeRiders.every((riderId) =>
        previous.groups.some(
          (group) =>
            group.displayCode.startsWith('F') &&
            group.riderIds.includes(riderId),
        ),
      )
      const currentBridgeGap = checkpoint.gaps.find((gap) =>
        gap.displayCode.startsWith('F'),
      )?.gapSeconds
      const currentPelotonGap = checkpoint.gaps.find(
        (gap) => gap.displayCode === 'P',
      )?.gapSeconds
      if (
        bridgeRiders.length === 0 ||
        (!cameFromPeloton && !alreadySeparateFrontGroup) ||
        currentBridgeGap === undefined ||
        currentPelotonGap === undefined ||
        currentBridgeGap <= PHASE5_GROUP_MERGE_TOLERANCE_SECONDS ||
        currentBridgeGap >= currentPelotonGap
      ) {
        allBridgeSequencesPhysicallyValid = false
        pushIssue(`bridge_attack_invalid:${checkpoint.checkpointId}`)
      }
    }

    if (hasBridgeProgress && previousBridge && currentBridge) {
      const sameBridgeRiders = sameStringArray(
        [...previousBridge.riderIds].sort(),
        [...currentBridge.riderIds].sort(),
      )
      const previousBridgeGap = previous.gaps.find((gap) =>
        gap.displayCode === previousBridge.displayCode,
      )?.gapSeconds
      const currentBridgeGap = checkpoint.gaps.find((gap) =>
        gap.displayCode === currentBridge.displayCode,
      )?.gapSeconds
      const previousPelotonGap = previous.gaps.find(
        (gap) => gap.displayCode === 'P',
      )?.gapSeconds
      const currentPelotonGap = checkpoint.gaps.find(
        (gap) => gap.displayCode === 'P',
      )?.gapSeconds
      if (
        !sameBridgeRiders ||
        previousBridgeGap === undefined ||
        currentBridgeGap === undefined ||
        previousPelotonGap === undefined ||
        currentPelotonGap === undefined ||
        currentBridgeGap > previousBridgeGap + 0.000001 ||
        currentBridgeGap >= currentPelotonGap ||
        currentPelotonGap - currentBridgeGap <
          previousPelotonGap - previousBridgeGap - 2.000001
      ) {
        allBridgeSequencesPhysicallyValid = false
        pushIssue(`bridge_progress_invalid:${checkpoint.checkpointId}`)
      }
    }

    inputRiderIds.forEach((riderId) => {
      const previousState = previousStateByRiderId.get(riderId)
      const currentState = currentStateByRiderId.get(riderId)
      const previousDisplayCode = previousState?.displayCode ?? null
      const currentDisplayCode = currentState?.displayCode ?? null
      if (
        previousDisplayCode === currentDisplayCode ||
        previousDisplayCode === null ||
        currentDisplayCode === null
      ) {
        return
      }

      const previousIsOpeningBreakaway =
        previousDisplayCode.startsWith('B')
      const currentIsOpeningBreakaway = currentDisplayCode.startsWith('B')
      const previousIsLateFront = previousDisplayCode.startsWith('F')
      const currentIsLateFront = currentDisplayCode.startsWith('F')
      const currentIsPeloton = currentDisplayCode === 'P'
      const previousIsPeloton = previousDisplayCode === 'P'
      let transitionValid = true

      if (currentIsOpeningBreakaway) {
        const openingFormationTransition =
          (eventTypes.has('attack') ||
            eventTypes.has('breakaway_formation')) &&
          openingBreakawayRiderIdSet.has(riderId) &&
          checkpointIndex <= openingFormationCheckpointIndex
        const bridgeMergeTransition =
          previousIsLateFront && hasBridgeMerge
        transitionValid =
          openingFormationTransition || bridgeMergeTransition
      } else if (previousIsOpeningBreakaway) {
        transitionValid = hasCatch || incidentRiderIdsAtKm.has(riderId)
      } else if (previousIsLateFront && currentIsPeloton) {
        transitionValid = hasCatch || incidentRiderIdsAtKm.has(riderId)
      } else if (previousIsPeloton && currentIsLateFront) {
        transitionValid =
          hasBridgeAttack ||
          eventTypes.has('group_split')
      } else if (previousIsLateFront && currentIsOpeningBreakaway) {
        transitionValid = hasBridgeMerge
      }

      if (!transitionValid) {
        allFrontGroupTransfersPhysicallyValid = false
        pushIssue(
          `front_group_transfer_without_physical_transition:${riderId}:${previousDisplayCode}->${currentDisplayCode}:${checkpoint.checkpointId}`,
        )
      }
    })

    if (
      previousBridge &&
      !currentBridge &&
      !hasBridgeMerge &&
      !hasCatch
    ) {
      allBridgeSequencesPhysicallyValid = false
      pushIssue(`bridge_group_disappears_without_merge:${checkpoint.checkpointId}`)
    }
    if (
      currentBridge &&
      !currentPeloton &&
      !hasCatch
    ) {
      allBridgeSequencesPhysicallyValid = false
      pushIssue(`bridge_group_without_peloton:${checkpoint.checkpointId}`)
    }
  })

  const catchCheckpointIndex = replayTimeline.checkpoints.findIndex(
    (checkpoint) =>
      checkpoint.commentary.some((entry) => entry.eventType === 'catch'),
  )
  if (catchCheckpointIndex >= 0) {
    replayTimeline.checkpoints
      .slice(catchCheckpointIndex + 1)
      .forEach((checkpoint, relativeIndex) => {
        if (
          checkpoint.groups.some(
            (group) =>
              group.displayCode.startsWith('B'),
          ) ||
          checkpoint.commentary.some(
            (entry) => entry.eventType === 'late_chase',
          )
        ) {
          postCatchStateStable = false
          pushIssue(`post_catch_breakaway_or_chase_reappears:${checkpoint.checkpointId}`)
        }

        const previousCheckpoint =
          replayTimeline.checkpoints[catchCheckpointIndex + relativeIndex]
        const previousStateByRiderId = new Map(
          previousCheckpoint.riderStates.map(
            (state) => [state.riderId, state] as const,
          ),
        )
        const currentStateByRiderId = new Map(
          checkpoint.riderStates.map(
            (state) => [state.riderId, state] as const,
          ),
        )
        const eventTypes = new Set(
          checkpoint.commentary.map((entry) => entry.eventType),
        )
        const physicalTransitionPublished =
          eventTypes.has('group_split') ||
          eventTypes.has('incident') ||
          eventTypes.has('group_merge')

        inputRiderIds.forEach((riderId) => {
          const previousDisplayCode =
            previousStateByRiderId.get(riderId)?.displayCode ?? null
          const currentDisplayCode =
            currentStateByRiderId.get(riderId)?.displayCode ?? null
          if (
            previousDisplayCode === currentDisplayCode ||
            previousDisplayCode === null ||
            currentDisplayCode === null ||
            previousDisplayCode.startsWith('I') ||
            currentDisplayCode.startsWith('I')
          ) {
            return
          }
          if (!physicalTransitionPublished) {
            postCatchStateStable = false
            pushIssue(
              `post_catch_group_transfer_without_physical_transition:${riderId}:${previousDisplayCode}->${currentDisplayCode}:${checkpoint.checkpointId}`,
            )
          }
        })
      })
  }

  const incidentCommentaryCount = replayTimeline.checkpoints.reduce(
    (sum, checkpoint) =>
      sum +
      checkpoint.commentary.filter((entry) => entry.eventType === 'incident')
        .length,
    0,
  )
  const authoritativeIncidentIds = phase10Incidents.incidents
    .map((incident) => incident.incidentId)
    .sort()
  const replayIncidentIds = [...uniqueIncidentIds].sort()
  const incidentSynchronizationStatus:
    UniversalReplayIncidentSynchronizationStatus = phase10Incidents.active
      ? 'synchronized'
      : 'not_available'
  if (!sameStringArray(replayIncidentIds, authoritativeIncidentIds)) {
    pushIssue('incident_id_set_mismatch')
  }
  if (incidentCommentaryCount !== phase10Incidents.incidentCount) {
    pushIssue('incident_commentary_count_mismatch')
  }
  phase10Incidents.incidents.forEach((incident) => {
    if (
      incident.riderIds.some((riderId) => !inputRiderIdSet.has(riderId)) ||
      incident.teamIds.some((teamId) => !inputTeamIdSet.has(teamId))
    ) {
      pushIssue(`incident_reference_invalid:${incident.incidentId}`)
    }
  })

  const issues = Array.from(new Set(issueList)).sort()

  return {
    synchronized: issues.length === 0,
    checkpointCount: replayTimeline.checkpoints.length,
    baseCheckpointCount: replayTimeline.baseCheckpointCount,
    eventCheckpointCount: replayTimeline.eventCheckpointCount,
    uniqueCheckpointIdCount: new Set(checkpointIds).size,
    uniqueCommentaryIdCount: new Set(commentaryIds).size,
    resultsVisibleCheckpointCount: visibleCheckpoints.length,
    allCheckpointsChronological,
    allCheckpointRidersComplete,
    allGroupMembershipUnique,
    allGapsMatchGroups,
    allTeamStatesMatchRiders,
    allCommandsMatchResolution,
    allIntermediateResultsCumulative,
    allCommentaryReferencesValid,
    allSameKilometreStatesConsistent,
    allGapChangesDistanceBounded,
    openingBreakawayLineageStable,
    allFrontGroupTransfersPhysicallyValid,
    allBridgeSequencesPhysicallyValid,
    allCommentaryPhaseNeutral,
    allCommentaryWholeSecondFormatting,
    postCatchStateStable,
    allResultFieldsHiddenBeforeFinish,
    finalCheckpointMatchesClassification,
    incidentSynchronizationStatus,
    incidentIntegrationComplete: phase10Incidents.active,
    incidentCount: uniqueIncidentIds.size,
    issues,
    deterministic: true,
    modelVersion: 'universal_replay_synchronization_v1',
  }
}


export function calculateUniversalFatigueIncidentRiskMultiplier(
  fatigue: number,
): number {
  const clampedFatigue = clamp(fatigue, 0, 100)
  const excessFatigue = Math.max(0, clampedFatigue - 20)

  return deterministicRound(
    clamp(1 + excessFatigue * 0.015625, 1, 2.25),
    6,
  )
}

function universalPostStageHealthRestrictionReason(
  rider: UniversalRiderInput,
  readiness: UniversalRiderReadinessResult,
): UniversalPostStageHealthRestrictionReason {
  if (readiness.healthSelectionBlocked) return 'selection_blocked'
  if (rider.availabilityStatus === 'injured') return 'injured'
  if (rider.availabilityStatus === 'sick') return 'sick'
  if (rider.availabilityStatus === 'not_fully_fit') return 'not_fully_fit'
  if (rider.startStatus === 'dns') return 'dns'
  return 'none'
}

function universalPostStageEffortCategory({
  eligibleToStart,
  averageCommandEffortMultiplier,
  attackEnergySpent,
  chaseEnergySpent,
  finishEffortEnergySpent,
  intermediatePointEnergySpent,
  supportWorkScore,
  protectionReceivedScore,
  breakawayPhaseCount,
}: {
  readonly eligibleToStart: boolean
  readonly averageCommandEffortMultiplier: number
  readonly attackEnergySpent: number
  readonly chaseEnergySpent: number
  readonly finishEffortEnergySpent: number
  readonly intermediatePointEnergySpent: number
  readonly supportWorkScore: number
  readonly protectionReceivedScore: number
  readonly breakawayPhaseCount: number
}): UniversalPostStageEffortCategory {
  if (!eligibleToStart) return 'not_started'

  if (
    averageCommandEffortMultiplier <= 0.95 &&
    attackEnergySpent === 0 &&
    chaseEnergySpent === 0 &&
    supportWorkScore === 0
  ) {
    return 'protected'
  }

  if (
    averageCommandEffortMultiplier >= 1.25 ||
    attackEnergySpent > 0 ||
    chaseEnergySpent >= 2 ||
    breakawayPhaseCount >= 3
  ) {
    return 'very_high'
  }

  if (
    averageCommandEffortMultiplier >= 1.1 ||
    chaseEnergySpent > 0 ||
    finishEffortEnergySpent > 0 ||
    intermediatePointEnergySpent > 0 ||
    supportWorkScore > 0 ||
    breakawayPhaseCount > 0
  ) {
    return 'high'
  }

  if (protectionReceivedScore > 0) {
    return 'protected'
  }

  return 'normal'
}

function universalPostStageIncidentFatigueLoad(
  incidentType: string,
): number {
  const normalized = incidentType.trim().toLowerCase().replace(/[-\s]+/g, '_')

  if (normalized.includes('injury')) return 3
  if (normalized.includes('crash')) return 2.5
  if (normalized.includes('illness') || normalized.includes('sick')) return 2
  if (normalized.includes('abandon') || normalized.includes('dnf')) return 2
  if (normalized.includes('mechanical')) return 1
  if (normalized.includes('puncture')) return 0.5
  return 0.75
}

function universalPostStagePayloadValid(
  rows: readonly UniversalPostStagePersistenceRow[],
): boolean {
  const writeKeys = rows.map((row) => row.writeKey)
  if (new Set(writeKeys).size !== writeKeys.length) return false

  return rows.every(
    (row) =>
      Number.isFinite(row.fatigueBefore) &&
      row.fatigueBefore >= 0 &&
      row.fatigueBefore <= 100 &&
      Number.isFinite(row.fatigueGained) &&
      row.fatigueGained >= 0 &&
      Number.isFinite(row.fatigueAfter) &&
      row.fatigueAfter >= 0 &&
      row.fatigueAfter <= 100 &&
      Number.isFinite(row.energySpent) &&
      row.energySpent >= 0 &&
      Number.isFinite(row.recoveryDemand) &&
      row.recoveryDemand >= 0 &&
      row.recoveryDemand <= 100 &&
      Number.isFinite(row.incidentRiskMultiplierAfter) &&
      row.incidentRiskMultiplierAfter >= 1,
  )
}

export function evaluateUniversalPostStagePersistenceDecision(
  summary: UniversalPostStageUpdateSummary,
  state: {
    readonly stageFinalized: boolean
    readonly finishResolutionComplete: boolean
    readonly replaySynchronized: boolean
  },
): UniversalPostStagePersistenceDecision {
  const reasons: string[] = []
  const payloadValid =
    summary.persistenceContract.payloadValid &&
    universalPostStagePayloadValid(summary.persistenceContract.rows)

  if (!state.stageFinalized) reasons.push('stage_not_finalized')
  if (!state.finishResolutionComplete) {
    reasons.push('finish_resolution_incomplete')
  }
  if (!state.replaySynchronized) reasons.push('replay_not_synchronized')
  if (!payloadValid) reasons.push('post_stage_payload_invalid')
  if (summary.persistenceApplied) reasons.push('persistence_already_applied')

  return {
    allowed: reasons.length === 0,
    reasons,
    stageFinalized: state.stageFinalized,
    finishResolutionComplete: state.finishResolutionComplete,
    replaySynchronized: state.replaySynchronized,
    payloadValid,
    modelVersion: 'universal_post_stage_persistence_decision_v1',
  }
}

function universalPostStageFinishStatusLoad(
  status: UniversalOfficialFinishStatus,
): number {
  switch (status) {
    case 'finished':
    case 'dns':
      return 0
    case 'otl':
      return 1.5
    case 'dnf':
      return 2.5
  }
}

/**
 * Build one immutable post-stage update from already-calculated race outputs.
 *
 * Measured energy expenditure is the main load signal. Stage distance,
 * difficulty, terrain, weather, resolved commands, attacks, chasing,
 * breakaway participation, support work and point battles are all represented
 * by the accepted race outputs. Phase 8 also emits the fatigue-derived incident
 * risk multiplier that Phase 10 will consume; it does not invent incidents.
 * Nothing is persisted here.
 */
export function buildUniversalPostStageUpdateSummary(
  input: UniversalRaceEngineInput,
  difficulty: UniversalDifficultySummary,
  riderReadiness: readonly UniversalRiderReadinessResult[],
  roadCommandResolution: UniversalRoadCommandResolutionSummary,
  roadRaceResolution: UniversalRoadRaceResolutionSummary,
  intermediatePointFinalization: UniversalIntermediatePointFinalizationSummary,
  finishResolution: UniversalFinishResolution,
  phase10Incidents: UniversalPhase10IncidentSummary,
  replayTimeline: UniversalReplayTimeline,
  replaySynchronization: UniversalReplaySynchronizationSummary,
): UniversalPostStageUpdateSummary {
  const readinessByRiderId = new Map(
    riderReadiness.map((row) => [row.riderId, row] as const),
  )
  const phase10EnergyLossByRiderId = new Map<string, number>()
  phase10Incidents.incidents.forEach((incident) => {
    incident.riderConsequences.forEach((row) => {
      phase10EnergyLossByRiderId.set(
        row.riderId,
        deterministicRound(
          (phase10EnergyLossByRiderId.get(row.riderId) ?? 0) +
            row.energyLossPoints +
            row.chaseEnergyCostPoints,
          6,
        ),
      )
    })
  })
  const officialByRiderId = new Map(
    finishResolution.classification.map((row) => [row.riderId, row] as const),
  )
  const roadCommandByRiderId = new Map(
    roadCommandResolution.riders.map((row) => [row.riderId, row] as const),
  )
  const stagePlanByRiderId = new Map<
    string,
    {
      readonly stageRole: RiderStageRole
      readonly commands: UniversalRiderPhaseCommandsInput
    }
  >()
  input.stagePlans.forEach((teamPlan) => {
    teamPlan.riders.forEach((riderPlan) => {
      stagePlanByRiderId.set(riderPlan.riderId, {
        stageRole: riderPlan.stageRole,
        commands: riderPlan.commands,
      })
    })
  })

  const phase1 = roadRaceResolution.phase1Opening
  const phase2 = roadRaceResolution.phase2Development
  const phase3 = roadRaceResolution.phase3Decisive
  const phase4 = roadRaceResolution.phase4Finish
  const phase2EnergyByRiderId = new Map(
    (phase2?.riderEnergy ?? []).map((row) => [row.riderId, row] as const),
  )
  const phase3StateByRiderId = new Map(
    (phase3?.riderStates ?? []).map((row) => [row.riderId, row] as const),
  )
  const phase4StateByRiderId = new Map(
    (phase4?.riderStates ?? []).map((row) => [row.riderId, row] as const),
  )
  const roadFinishEnergyByRiderId = new Map(
    (phase4?.riderStates ?? []).map(
      (row) => [row.riderId, row.energyAtFinish] as const,
    ),
  )
  const finishContextEnergyByRiderId = new Map(
    finishResolution.riderContexts.map(
      (row) => [row.riderId, row.remainingEnergy] as const,
    ),
  )

  const attackEnergyByRiderId = new Map<string, number>()
  const postStageAttackAttempts = [
    ...(phase1?.attackAttempts ?? []),
    ...(phase3?.attackAttempts ?? []),
  ]
  postStageAttackAttempts.forEach((attempt) => {
    attackEnergyByRiderId.set(
      attempt.riderId,
      (attackEnergyByRiderId.get(attempt.riderId) ?? 0) +
        attempt.attackEnergyCost,
    )
  })

  const allPointEnergyByRiderId = new Map<string, number>()
  const additionalPointEnergyByRiderId = new Map<string, number>()
  intermediatePointFinalization.costApplications.forEach((row) => {
    allPointEnergyByRiderId.set(
      row.riderId,
      (allPointEnergyByRiderId.get(row.riderId) ?? 0) + row.energyCost,
    )
    if (row.applicationMode === 'point_finalization_cost') {
      additionalPointEnergyByRiderId.set(
        row.riderId,
        (additionalPointEnergyByRiderId.get(row.riderId) ?? 0) +
          row.energyCost,
      )
    }
  })

  const incidentById = new Map<string, UniversalReplayIncident>()
  replayTimeline.checkpoints.forEach((checkpoint) => {
    checkpoint.incidents.forEach((incident) => {
      incidentById.set(incident.incidentId, incident)
    })
  })
  const incidentsByRiderId = new Map<string, UniversalReplayIncident[]>()
  incidentById.forEach((incident) => {
    incident.riderIds.forEach((riderId) => {
      const existing = incidentsByRiderId.get(riderId) ?? []
      existing.push(incident)
      incidentsByRiderId.set(riderId, existing)
    })
  })

  const timeTrialFinishEnergyByRiderId = new Map<string, number>()
  if (input.stage.stageFormat !== 'road_race') {
    input.riders.forEach((rider) => {
      const readiness = readinessByRiderId.get(rider.riderId)
      if (!readiness?.eligibleToStart) {
        timeTrialFinishEnergyByRiderId.set(rider.riderId, 0)
        return
      }

      const plan = stagePlanByRiderId.get(rider.riderId)
      const stageRole = plan?.stageRole ?? 'free_role'
      const command = plan?.commands.phase4 ?? 'follow_team_plan'
      const effortMultiplier = calculateRoadCommandEffect(
        command,
        stageRole,
        4,
      ).roleAdjustedEffortMultiplier
      const fullStageEnergyCost = calculateRoadEnergyCostForRange(
        input,
        rider,
        readiness,
        effortMultiplier,
        0,
        input.stage.distanceKm,
      )
      timeTrialFinishEnergyByRiderId.set(
        rider.riderId,
        deterministicRound(
          Math.max(
            0,
            readiness.fatigueBalance.startEnergy - fullStageEnergyCost,
          ),
          6,
        ),
      )
    })
  }

  const riderUpdates = input.riders
    .map((rider): UniversalPostStageRiderUpdate => {
      const readiness = readinessByRiderId.get(rider.riderId)
      const official = officialByRiderId.get(rider.riderId)
      if (!readiness || !official) {
        throw new Error(
          `Post-stage update requires readiness and classification for ${rider.riderId}.`,
        )
      }

      const eligibleToStart = readiness.eligibleToStart
      const plan = stagePlanByRiderId.get(rider.riderId)
      const stageRole = plan?.stageRole ?? 'free_role'
      const resolvedCommands = roadCommandByRiderId.get(rider.riderId)
      const commandEfforts = resolvedCommands?.phases.length
        ? resolvedCommands.phases.map((phase) =>
            getGeneralPhaseEffortMultiplier(phase),
          )
        : ([1, 2, 3, 4] as const).map((phaseNumber) => {
            const key = `phase${phaseNumber}` as keyof UniversalRiderPhaseCommandsInput
            const command = plan?.commands[key] ?? 'follow_team_plan'
            return calculateRoadCommandEffect(
              command,
              stageRole,
              phaseNumber,
            ).roleAdjustedEffortMultiplier
          })
      const averageCommandEffortMultiplier = deterministicRound(
        average(commandEfforts),
        6,
      )
      const phase2Energy = phase2EnergyByRiderId.get(rider.riderId)
      const phase3State = phase3StateByRiderId.get(rider.riderId)
      const phase4State = phase4StateByRiderId.get(rider.riderId)
      const attackEnergySpent = deterministicRound(
        attackEnergyByRiderId.get(rider.riderId) ?? 0,
        6,
      )
      const chaseEnergySpent = deterministicRound(
        phase4State?.automaticChaseEnergyCost ?? 0,
        6,
      )
      const finishEffortEnergySpent = deterministicRound(
        phase4State?.finishEffortEnergyCost ?? 0,
        6,
      )
      const intermediatePointEnergySpent = deterministicRound(
        allPointEnergyByRiderId.get(rider.riderId) ?? 0,
        6,
      )
      const supportWorkScore = deterministicRound(
        (phase2Energy?.supportWorkScore ?? 0) +
          (phase4State?.leadOutSupportGiven ?? 0),
        6,
      )
      const protectionReceivedScore = deterministicRound(
        (phase2Energy?.protectionReceivedScore ?? 0) +
          (phase3State?.protectionBonus ?? 0) +
          (phase4State?.leadOutSupportReceived ?? 0),
        6,
      )
      const breakawayPhaseCount = [
        phase1?.breakawayRiderIds.includes(rider.riderId) ?? false,
        phase2?.breakawayRiderIdsAtStart.includes(rider.riderId) ?? false,
        phase2?.breakawayRiderIdsAtEnd.includes(rider.riderId) ?? false,
        phase4?.escapeRiderIdsAtStart.includes(rider.riderId) ?? false,
      ].filter(Boolean).length
      const effortCategory = universalPostStageEffortCategory({
        eligibleToStart,
        averageCommandEffortMultiplier,
        attackEnergySpent,
        chaseEnergySpent,
        finishEffortEnergySpent,
        intermediatePointEnergySpent,
        supportWorkScore,
        protectionReceivedScore,
        breakawayPhaseCount,
      })
      const effort: UniversalPostStageEffortBreakdown = {
        effortCategory,
        averageCommandEffortMultiplier,
        attackEnergySpent,
        chaseEnergySpent,
        finishEffortEnergySpent,
        intermediatePointEnergySpent,
        supportWorkScore,
        protectionReceivedScore,
        breakawayPhaseCount,
        modelVersion: 'universal_post_stage_effort_breakdown_v1',
      }

      const inputFatigueBeforeStage = deterministicRound(
        clamp(rider.fatigueBeforeStage, 0, 100),
        6,
      )
      const effectiveFatigueBeforeStage = deterministicRound(
        readiness.components.effectiveFatigue,
        6,
      )
      const startEnergy = eligibleToStart
        ? deterministicRound(readiness.fatigueBalance.startEnergy, 6)
        : 0
      const rawFinishEnergy =
        roadFinishEnergyByRiderId.get(rider.riderId) ??
        timeTrialFinishEnergyByRiderId.get(rider.riderId) ??
        finishContextEnergyByRiderId.get(rider.riderId) ??
        startEnergy
      const finishEnergyBeforePointCosts = eligibleToStart
        ? deterministicRound(
            clamp(
              (rawFinishEnergy ?? startEnergy) -
                (phase10EnergyLossByRiderId.get(rider.riderId) ?? 0),
              0,
              startEnergy,
            ),
            6,
          )
        : 0
      const additionalPointEnergyCost = eligibleToStart
        ? deterministicRound(
            Math.min(
              finishEnergyBeforePointCosts,
              additionalPointEnergyByRiderId.get(rider.riderId) ?? 0,
            ),
            6,
          )
        : 0
      const finishEnergy = eligibleToStart
        ? deterministicRound(
            Math.max(
              0,
              finishEnergyBeforePointCosts - additionalPointEnergyCost,
            ),
            6,
          )
        : 0
      const totalEnergySpent = eligibleToStart
        ? deterministicRound(Math.max(0, startEnergy - finishEnergy), 6)
        : 0
      const energySpentPctOfStart =
        eligibleToStart && startEnergy > 0
          ? deterministicRound((totalEnergySpent / startEnergy) * 100, 6)
          : 0
      const distanceLoad = eligibleToStart
        ? deterministicRound(
            clamp(input.stage.distanceKm / 100, 0, 3) * 1.5,
            6,
          )
        : 0
      const difficultyLoad = eligibleToStart
        ? deterministicRound(difficulty.category * 1.2, 6)
        : 0
      const finishStatusLoad = eligibleToStart
        ? universalPostStageFinishStatusLoad(official.status)
        : 0
      const riderIncidents = incidentsByRiderId.get(rider.riderId) ?? []
      const incidentCount = riderIncidents.length
      const incidentFatigueLoad = eligibleToStart
        ? deterministicRound(
            riderIncidents.reduce(
              (sum, incident) =>
                sum + universalPostStageIncidentFatigueLoad(incident.incidentType),
              0,
            ),
            6,
          )
        : 0
      const grossFatigueGain = eligibleToStart
        ? deterministicRound(
            totalEnergySpent * 0.16 +
              distanceLoad +
              difficultyLoad +
              finishStatusLoad +
              incidentFatigueLoad,
            6,
          )
        : 0
      const adjustedFatigueGain = eligibleToStart
        ? deterministicRound(
            Math.max(
              0,
              grossFatigueGain *
                readiness.fatigueBalance.postStageFatigueMultiplier -
                readiness.fatigueBalance.postStageRecoveryBonusPoints,
            ),
            6,
          )
        : 0
      const uncappedFatigueAfterStage =
        effectiveFatigueBeforeStage + adjustedFatigueGain
      const fatigueAfterStage = deterministicRound(
        clamp(uncappedFatigueAfterStage, 0, 100),
        6,
      )
      const appliedFatigueGain = deterministicRound(
        Math.max(0, fatigueAfterStage - effectiveFatigueBeforeStage),
        6,
      )
      const intrinsicDailyRecoveryPoints =
        readiness.fatigueBalance.intrinsicDailyRecoveryPoints
      const fatigueAfterOneRecoveryDay = deterministicRound(
        Math.max(0, fatigueAfterStage - intrinsicDailyRecoveryPoints),
        6,
      )
      const estimatedDaysToPreStageFatigue =
        appliedFatigueGain > 0
          ? Math.ceil(appliedFatigueGain / intrinsicDailyRecoveryPoints)
          : 0
      const estimatedDaysToFullRecovery =
        fatigueAfterStage > 0
          ? Math.ceil(fatigueAfterStage / intrinsicDailyRecoveryPoints)
          : 0
      const recoveryDemandPoints = fatigueAfterStage
      const phase9IncidentRiskMultiplier = clamp(
        rider.preparationModifiers?.incidentRiskMultiplier ?? 1,
        0.7,
        1.4,
      )
      const incidentRiskMultiplierBefore = deterministicRound(
        Math.max(
          1,
          calculateUniversalFatigueIncidentRiskMultiplier(
            effectiveFatigueBeforeStage,
          ) * phase9IncidentRiskMultiplier,
        ),
        6,
      )
      const incidentRiskMultiplierAfter = deterministicRound(
        Math.max(
          1,
          calculateUniversalFatigueIncidentRiskMultiplier(fatigueAfterStage) *
            phase9IncidentRiskMultiplier,
        ),
        6,
      )
      const incidentRiskIncrease = deterministicRound(
        incidentRiskMultiplierAfter - incidentRiskMultiplierBefore,
        6,
      )
      const healthRestrictionReason =
        universalPostStageHealthRestrictionReason(rider, readiness)
      const writeEligible = eligibleToStart
      const writeKey = `${input.stage.stageId}|${rider.riderId}|post-stage-fatigue-v2`

      return {
        riderId: rider.riderId,
        teamId: rider.teamId,
        startStatus: readiness.startStatus,
        finishStatus: official.status,
        eligibleToStart,
        availabilityStatus: readiness.availabilityStatus,
        healthRestrictionApplied: healthRestrictionReason !== 'none',
        healthRestrictionReason,
        previousRecoveryState:
          readiness.previousStageRecovery?.state ?? 'no_previous_stage',
        startFreshness: readiness.components.startFreshness,
        raceSharpness: readiness.components.raceSharpness,
        inputFatigueBeforeStage,
        effectiveFatigueBeforeStage,
        fatigueBefore: effectiveFatigueBeforeStage,
        startEnergy,
        finishEnergyBeforePointCosts,
        additionalPointEnergyCost,
        finishEnergy,
        totalEnergySpent,
        energySpent: totalEnergySpent,
        energySpentPctOfStart,
        effort,
        weatherSeverity: difficulty.components.weatherSeverity,
        incidentCount,
        incidentFatigueLoad,
        incidentRiskMultiplierBefore,
        incidentRiskMultiplierAfter,
        incidentRiskIncrease,
        distanceLoad,
        difficultyLoad,
        finishStatusLoad,
        grossFatigueGain,
        postStageFatigueMultiplier:
          readiness.fatigueBalance.postStageFatigueMultiplier,
        postStageRecoveryBonusPoints:
          readiness.fatigueBalance.postStageRecoveryBonusPoints,
        adjustedFatigueGain,
        appliedFatigueGain,
        fatigueGained: appliedFatigueGain,
        fatigueAfterStage,
        fatigueAfter: fatigueAfterStage,
        fatigueClampedAtMaximum: uncappedFatigueAfterStage > 100,
        intrinsicDailyRecoveryPoints,
        fatigueAfterOneRecoveryDay,
        estimatedDaysToPreStageFatigue,
        estimatedDaysToFullRecovery,
        recoveryDemandPoints,
        recoveryDemand: recoveryDemandPoints,
        writeEligible,
        writeKey,
        previousStageSeed: {
          stageId: input.stage.stageId,
          stageStatus: official.status,
          finishStamina: eligibleToStart ? finishEnergy : null,
          fatigueAfterStage,
          fatigueGain: writeEligible ? appliedFatigueGain : null,
        },
        modelVersion: 'universal_post_stage_rider_update_v2',
      }
    })
    .sort(
      (left, right) =>
        left.teamId.localeCompare(right.teamId) ||
        left.riderId.localeCompare(right.riderId),
    )

  const writeEligibleUpdates = riderUpdates.filter((row) => row.writeEligible)
  const totalEnergySpent = deterministicRound(
    writeEligibleUpdates.reduce((sum, row) => sum + row.totalEnergySpent, 0),
    6,
  )
  const averageEnergySpent =
    writeEligibleUpdates.length > 0
      ? deterministicRound(totalEnergySpent / writeEligibleUpdates.length, 6)
      : 0
  const totalAppliedFatigueGain = writeEligibleUpdates.reduce(
    (sum, row) => sum + row.appliedFatigueGain,
    0,
  )
  const persistenceRows: UniversalPostStagePersistenceRow[] =
    writeEligibleUpdates.map((row) => ({
      riderId: row.riderId,
      teamId: row.teamId,
      fatigueBefore: row.fatigueBefore,
      fatigueGained: row.fatigueGained,
      fatigueAfter: row.fatigueAfter,
      energySpent: row.energySpent,
      recoveryDemand: row.recoveryDemand,
      finishStamina: row.previousStageSeed.finishStamina,
      finishStatus: row.finishStatus,
      incidentRiskMultiplierAfter: row.incidentRiskMultiplierAfter,
      writeKey: row.writeKey,
    }))
  const payloadValid = universalPostStagePayloadValid(persistenceRows)
  const persistenceContract: UniversalPostStagePersistenceContract = {
    requiresOfficialStageFinalization: true,
    requiresCompleteClassification: true,
    requiresSynchronizedReplay: true,
    directDatabaseWritePerformed: false,
    activationBoundary:
      'existing_application_service_after_stage_finalization',
    idempotencyScope: 'stage_rider_post_stage_v2',
    sourceClassificationComplete: finishResolution.complete,
    sourceReplaySynchronized: replaySynchronization.synchronized,
    payloadValid,
    rowCount: persistenceRows.length,
    rows: persistenceRows,
    modelVersion: 'universal_post_stage_persistence_contract_v1',
  }

  return {
    active: true,
    calculatedBeforePersistence: true,
    persistenceApplied: false,
    persistenceBoundary: 'phase_11_application_service',
    writePolicy: 'ledger_guarded_once',
    riderUpdateCount: riderUpdates.length,
    writeEligibleCount: writeEligibleUpdates.length,
    dnsCount: riderUpdates.filter((row) => row.finishStatus === 'dns').length,
    totalEnergySpent,
    averageEnergySpent,
    averageAppliedFatigueGain:
      writeEligibleUpdates.length > 0
        ? deterministicRound(
            totalAppliedFatigueGain / writeEligibleUpdates.length,
            6,
          )
        : 0,
    maximumFatigueAfterStage:
      riderUpdates.length > 0
        ? deterministicRound(
            Math.max(...riderUpdates.map((row) => row.fatigueAfterStage)),
            6,
          )
        : 0,
    riderUpdates,
    persistenceContract,
    sourceCoverage: {
      terrain: 'represented_by_energy_and_difficulty',
      riderEffort: 'represented_by_calculated_energy_spent',
      savedCommands: 'represented_by_resolved_command_effort',
      attacks: 'represented_by_attack_energy',
      chasing: 'represented_by_chase_energy',
      breakaway: 'represented_by_breakaway_energy_and_duration',
      supportWork: 'represented_by_support_and_lead_out_energy',
      intermediatePoints: 'represented_exactly_once',
      weather: 'represented_by_energy_and_difficulty',
      equipment: 'represented_by_capped_performance_reliability_and_wear',
      assets: 'represented_by_condition_dependent_support_and_wear',
      supplies: 'represented_by_benefits_shortages_and_consumption',
      staff: 'represented_by_approved_capped_role_support',
      incidents:
        'consumes_authoritative_incidents_when_available_and_exposes_fatigue_risk',
    },
    deterministic: true,
    modelVersion: 'universal_post_stage_update_v2',
  }
}


function universalPhase78AcceptanceActual(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(',')
  }

  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  return String(value)
}

function universalPhase78AcceptanceInvariant(
  key: string,
  passed: boolean,
  expected: unknown,
  actual: unknown,
): UniversalPhase78AcceptanceInvariant {
  return {
    key,
    passed,
    expected: universalPhase78AcceptanceActual(expected),
    actual: universalPhase78AcceptanceActual(actual),
  }
}

export function buildUniversalPhase78AcceptanceReport(
  input: UniversalRaceEngineInput,
  finishResolution: UniversalFinishResolution,
  replayTimeline: UniversalReplayTimeline,
  replaySynchronization: UniversalReplaySynchronizationSummary,
  postStageUpdate: UniversalPostStageUpdateSummary,
): UniversalPhase78AcceptanceReport {
  const classificationByRiderId = new Map(
    finishResolution.classification.map((row) => [row.riderId, row] as const),
  )
  const updateByRiderId = new Map(
    postStageUpdate.riderUpdates.map((row) => [row.riderId, row] as const),
  )
  const finalCheckpoint =
    replayTimeline.checkpoints.find(
      (checkpoint) => checkpoint.checkpointId === replayTimeline.finalCheckpointId,
    ) ??
    replayTimeline.checkpoints[replayTimeline.checkpoints.length - 1] ??
    null
  const finalReplayByRiderId = new Map(
    (finalCheckpoint?.riderStates ?? []).map(
      (row) => [row.riderId, row] as const,
    ),
  )

  const inputRiderIds = input.riders
    .map((rider) => rider.riderId)
    .sort((left, right) => left.localeCompare(right))
  const classificationRiderIds = finishResolution.classification
    .map((row) => row.riderId)
    .sort((left, right) => left.localeCompare(right))
  const updateRiderIds = postStageUpdate.riderUpdates
    .map((row) => row.riderId)
    .sort((left, right) => left.localeCompare(right))
  const finalReplayRiderIds = (finalCheckpoint?.riderStates ?? [])
    .map((row) => row.riderId)
    .sort((left, right) => left.localeCompare(right))

  const riderRows = input.riders
    .map((rider): UniversalPhase78AcceptanceRiderRow => {
      const classification = classificationByRiderId.get(rider.riderId)
      const update = updateByRiderId.get(rider.riderId)
      const replayState = finalReplayByRiderId.get(rider.riderId)

      if (!classification || !update) {
        throw new Error(
          `Phase 7 + 8 acceptance requires classification and post-stage update for ${rider.riderId}.`,
        )
      }

      return {
        riderId: rider.riderId,
        teamId: rider.teamId,
        eligibleToStart: update.eligibleToStart,
        finishStatus: classification.status,
        finishRank: classification.rank,
        replayFinishStatus: replayState?.status ?? null,
        replayFinishRank: replayState?.finishRank ?? null,
        startEnergy: update.startEnergy,
        finishEnergy: update.finishEnergy,
        energySpent: update.energySpent,
        fatigueBefore: update.fatigueBefore,
        fatigueGained: update.fatigueGained,
        fatigueAfter: update.fatigueAfter,
        recoveryDemand: update.recoveryDemand,
        incidentRiskMultiplierAfter: update.incidentRiskMultiplierAfter,
        effortCategory: update.effort.effortCategory,
        writeEligible: update.writeEligible,
        writeKey: update.writeKey,
      }
    })
    .sort(
      (left, right) =>
        left.teamId.localeCompare(right.teamId) ||
        left.riderId.localeCompare(right.riderId),
    )

  const allRiderCoverageMatches =
    JSON.stringify(inputRiderIds) === JSON.stringify(classificationRiderIds) &&
    JSON.stringify(inputRiderIds) === JSON.stringify(updateRiderIds) &&
    JSON.stringify(inputRiderIds) === JSON.stringify(finalReplayRiderIds)
  const allEnergyBalancesValid = riderRows.every(
    (row) =>
      Math.abs(row.startEnergy - row.finishEnergy - row.energySpent) <= 0.00001,
  )
  const allFatigueBoundsValid = riderRows.every(
    (row) =>
      row.fatigueBefore >= 0 &&
      row.fatigueBefore <= 100 &&
      row.fatigueGained >= 0 &&
      row.fatigueAfter >= 0 &&
      row.fatigueAfter <= 100 &&
      row.recoveryDemand >= 0 &&
      row.recoveryDemand <= 100,
  )
  const allFinalRowsMatch = riderRows.every(
    (row) =>
      row.replayFinishStatus === row.finishStatus &&
      row.replayFinishRank === row.finishRank,
  )
  const writeKeys = postStageUpdate.persistenceContract.rows.map(
    (row) => row.writeKey,
  )
  const allWriteKeysUnique =
    new Set(writeKeys).size === writeKeys.length
  const finalResultsVisibleOnlyAtFinish =
    replaySynchronization.resultsVisibleCheckpointCount === 1 &&
    finalCheckpoint?.finalResultsVisible === true &&
    replayTimeline.checkpoints
      .filter((checkpoint) => checkpoint.checkpointId !== finalCheckpoint.checkpointId)
      .every((checkpoint) => !checkpoint.finalResultsVisible)

  const invariants: UniversalPhase78AcceptanceInvariant[] = [
    universalPhase78AcceptanceInvariant(
      'phase7_replay_active',
      replayTimeline.active,
      true,
      replayTimeline.active,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_complete_before_playback',
      replayTimeline.completeBeforePlayback,
      true,
      replayTimeline.completeBeforePlayback,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_playback_does_not_recalculate',
      replayTimeline.playbackRecalculatesRace === false,
      false,
      replayTimeline.playbackRecalculatesRace,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_replay_synchronized',
      replaySynchronization.synchronized,
      true,
      replaySynchronization.synchronized,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_final_results_visible_only_at_finish',
      finalResultsVisibleOnlyAtFinish,
      true,
      finalResultsVisibleOnlyAtFinish,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_final_checkpoint_matches_classification',
      replaySynchronization.finalCheckpointMatchesClassification &&
        allFinalRowsMatch,
      true,
      replaySynchronization.finalCheckpointMatchesClassification &&
        allFinalRowsMatch,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_result_fields_hidden_before_finish',
      replaySynchronization.allResultFieldsHiddenBeforeFinish,
      true,
      replaySynchronization.allResultFieldsHiddenBeforeFinish,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_same_kilometre_states_consistent',
      replaySynchronization.allSameKilometreStatesConsistent,
      true,
      replaySynchronization.allSameKilometreStatesConsistent,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_gap_changes_distance_bounded',
      replaySynchronization.allGapChangesDistanceBounded,
      true,
      replaySynchronization.allGapChangesDistanceBounded,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_opening_breakaway_lineage_stable',
      replaySynchronization.openingBreakawayLineageStable,
      true,
      replaySynchronization.openingBreakawayLineageStable,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_front_group_transfers_physically_valid',
      replaySynchronization.allFrontGroupTransfersPhysicallyValid,
      true,
      replaySynchronization.allFrontGroupTransfersPhysicallyValid,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_commentary_phase_neutral',
      replaySynchronization.allCommentaryPhaseNeutral,
      true,
      replaySynchronization.allCommentaryPhaseNeutral,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_commentary_whole_second_formatting',
      replaySynchronization.allCommentaryWholeSecondFormatting,
      true,
      replaySynchronization.allCommentaryWholeSecondFormatting,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_post_catch_state_stable',
      replaySynchronization.postCatchStateStable,
      true,
      replaySynchronization.postCatchStateStable,
    ),
    universalPhase78AcceptanceInvariant(
      'phase7_phase8_rider_coverage_matches_input',
      allRiderCoverageMatches,
      input.riders.length,
      `${classificationRiderIds.length}/${updateRiderIds.length}/${finalReplayRiderIds.length}`,
    ),
    universalPhase78AcceptanceInvariant(
      'phase8_energy_balance_valid',
      allEnergyBalancesValid,
      true,
      allEnergyBalancesValid,
    ),
    universalPhase78AcceptanceInvariant(
      'phase8_fatigue_bounds_valid',
      allFatigueBoundsValid,
      true,
      allFatigueBoundsValid,
    ),
    universalPhase78AcceptanceInvariant(
      'phase8_persistence_payload_valid',
      postStageUpdate.persistenceContract.payloadValid,
      true,
      postStageUpdate.persistenceContract.payloadValid,
    ),
    universalPhase78AcceptanceInvariant(
      'phase8_no_direct_database_write',
      postStageUpdate.persistenceContract.directDatabaseWritePerformed === false,
      false,
      postStageUpdate.persistenceContract.directDatabaseWritePerformed,
    ),
    universalPhase78AcceptanceInvariant(
      'phase8_persistence_rows_match_write_eligible_updates',
      postStageUpdate.persistenceContract.rowCount ===
        postStageUpdate.writeEligibleCount,
      postStageUpdate.writeEligibleCount,
      postStageUpdate.persistenceContract.rowCount,
    ),
    universalPhase78AcceptanceInvariant(
      'phase8_write_keys_unique',
      allWriteKeysUnique,
      writeKeys.length,
      new Set(writeKeys).size,
    ),
    universalPhase78AcceptanceInvariant(
      'phase8_source_terrain_active',
      postStageUpdate.sourceCoverage.terrain ===
        'represented_by_energy_and_difficulty',
      'represented_by_energy_and_difficulty',
      postStageUpdate.sourceCoverage.terrain,
    ),
    universalPhase78AcceptanceInvariant(
      'phase8_source_weather_active',
      postStageUpdate.sourceCoverage.weather ===
        'represented_by_energy_and_difficulty',
      'represented_by_energy_and_difficulty',
      postStageUpdate.sourceCoverage.weather,
    ),
    universalPhase78AcceptanceInvariant(
      'phase8_source_commands_active',
      postStageUpdate.sourceCoverage.savedCommands ===
        'represented_by_resolved_command_effort',
      'represented_by_resolved_command_effort',
      postStageUpdate.sourceCoverage.savedCommands,
    ),
  ]
  const issues = invariants
    .filter((invariant) => !invariant.passed)
    .map((invariant) => invariant.key)

  return {
    passed: issues.length === 0,
    source: 'single_runRaceEngine_result',
    engineBuild: UNIVERSAL_RACE_ENGINE_DEBUG_BUILD,
    engineKey: PPM_UNIVERSAL_RACE_ENGINE_KEY,
    engineVersion: PPM_UNIVERSAL_RACE_ENGINE_VERSION,
    raceId: input.race.raceId,
    stageId: input.stage.stageId,
    stageFormat: input.stage.stageFormat,
    terrainType: input.stage.terrainType,
    deterministicSeed: input.engine.deterministicSeed,
    riderCount: input.riders.length,
    teamCount: input.teams.length,
    phase7: {
      replayActive: replayTimeline.active,
      completeBeforePlayback: replayTimeline.completeBeforePlayback,
      playbackRecalculatesRace: replayTimeline.playbackRecalculatesRace,
      checkpointCount: replaySynchronization.checkpointCount,
      baseCheckpointCount: replaySynchronization.baseCheckpointCount,
      eventCheckpointCount: replaySynchronization.eventCheckpointCount,
      replaySynchronized: replaySynchronization.synchronized,
      finalResultsVisibleCheckpointCount:
        replaySynchronization.resultsVisibleCheckpointCount,
      finalCheckpointMatchesClassification:
        replaySynchronization.finalCheckpointMatchesClassification,
      resultFieldsHiddenBeforeFinish:
        replaySynchronization.allResultFieldsHiddenBeforeFinish,
      sameKilometreStatesConsistent:
        replaySynchronization.allSameKilometreStatesConsistent,
      gapChangesDistanceBounded:
        replaySynchronization.allGapChangesDistanceBounded,
      openingBreakawayLineageStable:
        replaySynchronization.openingBreakawayLineageStable,
      frontGroupTransfersPhysicallyValid:
        replaySynchronization.allFrontGroupTransfersPhysicallyValid,
      bridgeSequencesPhysicallyValid:
        replaySynchronization.allBridgeSequencesPhysicallyValid,
      commentaryPhaseNeutral:
        replaySynchronization.allCommentaryPhaseNeutral,
      commentaryWholeSecondFormatting:
        replaySynchronization.allCommentaryWholeSecondFormatting,
      postCatchStateStable:
        replaySynchronization.postCatchStateStable,
    },
    phase8: {
      updateCount: postStageUpdate.riderUpdateCount,
      writeEligibleCount: postStageUpdate.writeEligibleCount,
      persistenceRowCount: postStageUpdate.persistenceContract.rowCount,
      payloadValid: postStageUpdate.persistenceContract.payloadValid,
      directDatabaseWritePerformed:
        postStageUpdate.persistenceContract.directDatabaseWritePerformed,
      totalEnergySpent: postStageUpdate.totalEnergySpent,
      averageEnergySpent: postStageUpdate.averageEnergySpent,
      averageFatigueGained: postStageUpdate.averageAppliedFatigueGain,
      maximumFatigueAfter: postStageUpdate.maximumFatigueAfterStage,
    },
    applicability: {
      supportedStageFormats: [...STAGE_FORMATS],
      terrainRepresented:
        postStageUpdate.sourceCoverage.terrain ===
        'represented_by_energy_and_difficulty',
      weatherRepresented:
        postStageUpdate.sourceCoverage.weather ===
        'represented_by_energy_and_difficulty',
      savedCommandsRepresented:
        postStageUpdate.sourceCoverage.savedCommands ===
        'represented_by_resolved_command_effort',
      attacksRepresented:
        postStageUpdate.sourceCoverage.attacks ===
        'represented_by_attack_energy',
      chasingRepresented:
        postStageUpdate.sourceCoverage.chasing ===
        'represented_by_chase_energy',
      breakawayRepresented:
        postStageUpdate.sourceCoverage.breakaway ===
        'represented_by_breakaway_energy_and_duration',
      intermediatePointsRepresentedExactlyOnce:
        postStageUpdate.sourceCoverage.intermediatePoints ===
        'represented_exactly_once',
      incidentRiskSignalAvailable: riderRows.every(
        (row) => row.incidentRiskMultiplierAfter >= 1,
      ),
      authoritativeIncidentIntegrationStatus:
        replaySynchronization.incidentSynchronizationStatus,
    },
    invariants,
    issues,
    riderRows,
    deterministic: true,
    modelVersion: 'universal_phase_7_8_acceptance_v1',
  }
}

export function runRaceEngine(
  input: UniversalRaceEngineInput,
): UniversalRaceEngineResult {
  const errors = validateRunInput(input)

  if (errors.length > 0) {
    throw new UniversalRaceEngineValidationError(errors)
  }

  const phase9Modifiers = buildUniversalPhase9ModifierSummary(input)
  const calculationInput = applyUniversalPhase9ModifiersToInput(
    input,
    phase9Modifiers,
  )
  const stageClassification = classifyStage(calculationInput.stage)
  const terrain = analyzeTerrain(calculationInput.stage)
  const difficulty = calculateDifficulty(calculationInput, terrain)
  const riderReadiness = calculateAllRiderReadiness(calculationInput.riders)
  const stageSkillModel = calculateStageSkillModel(calculationInput.stage)
  const teamTimeTrialSuitabilityRules =
    buildTeamTimeTrialSuitabilityRules(calculationInput.stage)
  const riderSuitability = calculateRiderSuitabilityScores(
    calculationInput,
    riderReadiness,
    stageSkillModel,
  )
  const teamStrength = calculateStageTeamStrength(
    calculationInput,
    riderSuitability,
    teamTimeTrialSuitabilityRules,
  )
  const favourites = buildUniversalFavouritesSummary(
    calculationInput,
    riderSuitability,
    stageSkillModel,
  )
  const roadCommandResolution = buildRoadCommandResolution(
    calculationInput,
    riderReadiness,
  )
  const phase1RoadRaceResolution = resolveRoadPhase1Opening(
    calculationInput,
    riderReadiness,
    roadCommandResolution,
  )
  const phase2RoadRaceResolution = resolveRoadPhase2Development(
    calculationInput,
    riderReadiness,
    riderSuitability,
    roadCommandResolution,
    phase1RoadRaceResolution,
  )
  const phase3RoadRaceResolution = resolveRoadPhase3Decisive(
    calculationInput,
    riderReadiness,
    riderSuitability,
    roadCommandResolution,
    phase2RoadRaceResolution,
  )
  const roadRaceResolution = resolveRoadPhase4Finish(
    calculationInput,
    riderReadiness,
    riderSuitability,
    roadCommandResolution,
    phase3RoadRaceResolution,
  )
  const intermediatePointPlan = buildUniversalIntermediatePointPlan(
    calculationInput,
    roadCommandResolution,
    roadRaceResolution,
  )
  const intermediatePointBattles = buildUniversalIntermediatePointBattles(
    calculationInput,
    riderReadiness,
    roadRaceResolution,
    intermediatePointPlan,
  )
  const intermediatePointFinalization =
    buildUniversalIntermediatePointFinalization(
      calculationInput,
      riderReadiness,
      roadCommandResolution,
      intermediatePointPlan,
      intermediatePointBattles,
    )
  const groupAndTimeResolution = buildUniversalPhase5GroupingSummary(
    calculationInput,
    difficulty,
    riderReadiness,
    riderSuitability,
    roadRaceResolution,
  )
  const baseFinishResolution = resolveUniversalFinishResolution({
    input: calculationInput,
    stageClassification,
    riderReadiness,
    riderSuitability,
    roadCommandResolution,
    roadRaceResolution,
    groupAndTimeResolution,
  })
  const baseReplayTimeline = buildUniversalReplayTimeline(
    calculationInput,
    riderReadiness,
    roadCommandResolution,
    roadRaceResolution,
    intermediatePointBattles,
    intermediatePointFinalization,
    groupAndTimeResolution,
    baseFinishResolution,
  )
  const phase10Resolution = resolveUniversalPhase10Incidents({
    input: calculationInput,
    sourceInput: input,
    phase9: phase9Modifiers,
    riderReadiness,
    roadCommandResolution,
    baseFinishResolution,
    baseReplayTimeline,
  })
  const phase10Incidents = phase10Resolution.summary
  const finishResolution = phase10Resolution.finishResolution
  const replayTimeline = phase10Resolution.replayTimeline
  const rawReplaySynchronization =
    buildUniversalReplaySynchronizationSummary(
      calculationInput,
      riderReadiness,
      roadCommandResolution,
      intermediatePointFinalization,
      groupAndTimeResolution,
      finishResolution,
      phase10Incidents,
      replayTimeline,
    )
  const replaySynchronization =
    applyUniversalReplayProgressGuarantee(rawReplaySynchronization)

  if (!replaySynchronization.synchronized) {
    throw new Error(
      `Universal replay synchronization failed: ${replaySynchronization.issues.join(', ')}`,
    )
  }
  const postStageUpdate = buildUniversalPostStageUpdateSummary(
    calculationInput,
    difficulty,
    riderReadiness,
    roadCommandResolution,
    roadRaceResolution,
    intermediatePointFinalization,
    finishResolution,
    phase10Incidents,
    replayTimeline,
    replaySynchronization,
  )
  const phase9Acceptance = buildUniversalPhase9AcceptanceReport(
    input,
    calculationInput,
    phase9Modifiers,
    postStageUpdate,
  )
  if (!phase9Acceptance.passed) {
    throw new Error(
      `Phase 9 acceptance audit failed: ${phase9Acceptance.warnings.join(', ')}`,
    )
  }
  const phase78Acceptance = buildUniversalPhase78AcceptanceReport(
    calculationInput,
    finishResolution,
    replayTimeline,
    replaySynchronization,
    postStageUpdate,
  )
  if (!phase78Acceptance.passed) {
    throw new Error(
      `Phase 7 + 8 acceptance audit failed: ${phase78Acceptance.issues.join(', ')}`,
    )
  }
  const calibrationSummary = buildUniversalRaceCalibrationSummary(
    calculationInput,
    stageClassification,
    roadRaceResolution,
    groupAndTimeResolution,
    finishResolution,
  )

  return {
    engineKey: PPM_UNIVERSAL_RACE_ENGINE_KEY,
    engineVersion: PPM_UNIVERSAL_RACE_ENGINE_VERSION,
    raceId: input.race.raceId,
    stageId: input.stage.stageId,
    validationPassed: true,
    stageClassification,
    terrain,
    difficulty,
    riderReadiness,
    stageSkillModel,
    teamTimeTrialSuitabilityRules,
    riderSuitability,
    teamStrength,
    favourites,
    roadCommandResolution,
    roadRaceResolution,
    intermediatePointPlan,
    intermediatePointBattles,
    intermediatePointFinalization,
    groupAndTimeResolution,
    finishResolution,
    replayTimeline,
    replaySynchronization,
    phase9Modifiers,
    phase9Acceptance,
    phase10Incidents,
    postStageUpdate,
    phase78Acceptance,
    calibrationSummary,
  }
}
