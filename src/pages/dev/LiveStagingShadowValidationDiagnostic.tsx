/**
 * LiveStagingShadowValidationDiagnostic.tsx
 *
 * Phase 8J.8A authenticated, read-only browser diagnostic.
 *
 * It calls the existing source-bundle RPC, runs the real deterministic engine
 * twice in memory for flat, hilly, and mountain stages, validates the real
 * generic replay model, and compares classifications with persisted official
 * legacy result rows.
 *
 * It performs no insert, update, delete, writer call, replay persistence,
 * production route change, player UI switch, or deployment.
 */

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  supabase,
} from '../../lib/supabase'
import {
  GenericRaceReplayView,
  type ReplayStageModel,
} from '../../race-replay'
import {
  LIVE_STAGING_SHADOW_STAGES as BASE_LIVE_STAGING_SHADOW_STAGES,
  createLiveStagingShadowBatchReport,
  executeLiveStagingShadowStageValidation,
  type LiveShadowSourceBundle,
  type LiveShadowStageDefinition,
  type LiveStagingShadowBatchReport,
  type LiveStagingShadowStageReport,
} from '../../race-engine/migration/liveStagingShadowValidation'
import {
  validateLiveStagingShadowBatchReport,
  validateLiveStagingShadowStageReport,
} from '../../race-engine/migration/validateLiveStagingShadowValidationReport'

const SOURCE_RPC_NAME =
  'race_engine_get_calibrated_shadow_source_bundle_dev_v1'

const LIVE_STAGING_SHADOW_STAGES =
  BASE_LIVE_STAGING_SHADOW_STAGES.map(
    (definition) =>
      definition.profile ===
        'mountain'
        ? {
            ...definition,
            stageId:
              '2d33de11-3a34-412a-b90a-847d4839c8d9',
            label:
              'Mentougou International Road Race Stage 3 · Zhaitang Mountain Circuit',
          }
        : definition,
  )

type JsonObject =
  Record<string, unknown>

interface RpcErrorShape {
  readonly message: string
}

interface RpcResultShape {
  readonly data: unknown
  readonly error:
    RpcErrorShape | null
}

interface RpcClientShape {
  rpc(
    functionName: string,
    args: JsonObject,
  ): Promise<RpcResultShape>
}

interface LiveSourceShapeInspection {
  readonly bundleKeys:
    readonly string[]

  readonly firstRiderInputKeys:
    readonly string[]

  readonly stageKeys:
    readonly string[]

  readonly profileDetailKeys:
    readonly string[]

  readonly firstPhaseCommandKeys:
    readonly string[]

  readonly phaseCommandCount:
    number

  readonly hasFatigue:
    boolean

  readonly hasFatigueBeforeStage:
    boolean

  readonly hasStartStamina:
    boolean

  readonly hasMorale:
    boolean

  readonly hasAvailabilityStatus:
    boolean

  readonly hasWeatherSource:
    boolean

  readonly equipmentConditionCount:
    number | null

  readonly preparationModifierCount:
    number | null

  readonly uniquePhase1Commands:
    readonly string[]

  readonly uniquePhase2Commands:
    readonly string[]

  readonly uniquePhase3Commands:
    readonly string[]

  readonly uniquePhase4Commands:
    readonly string[]

  readonly uniqueTeamPlans:
    readonly string[]

  readonly uniqueRoleCodes:
    readonly string[]

  readonly commandsWithAnyPhaseValue:
    number

  readonly commandsWithNoPhaseValue:
    number
}

interface StageExecutionRecord {
  readonly definition:
    LiveShadowStageDefinition

  readonly report:
    LiveStagingShadowStageReport

  readonly replayModel:
    ReplayStageModel

  readonly sourceInspection:
    LiveSourceShapeInspection

  readonly attackStartedEventCount:
    number

  readonly groupCreatedEventCount:
    number
}

interface DiagnosticResult {
  readonly batch:
    LiveStagingShadowBatchReport
  readonly stages:
    readonly StageExecutionRecord[]
}


interface AuthSnapshot {
  readonly loading: boolean
  readonly authenticated: boolean
  readonly userId: string | null
  readonly email: string | null
  readonly jwtRole: string | null
  readonly issuerHost: string | null
  readonly error: string | null
}

const EMPTY_AUTH_SNAPSHOT:
  AuthSnapshot = {
    loading: true,
    authenticated: false,
    userId: null,
    email: null,
    jwtRole: null,
    issuerHost: null,
    error: null,
  }

function decodeJwtPayload(
  token: string,
): JsonObject {
  const payloadPart =
    token.split('.')[1]

  if (!payloadPart) {
    return {}
  }

  try {
    const normalized =
      payloadPart
        .replace(/-/g, '+')
        .replace(/_/g, '/')

    const padded =
      normalized.padEnd(
        Math.ceil(
          normalized.length / 4,
        ) * 4,
        '=',
      )

    return asObject(
      JSON.parse(
        window.atob(padded),
      ),
    )
  } catch {
    return {}
  }
}

function issuerHostFromPayload(
  payload: JsonObject,
): string | null {
  const issuer =
    typeof payload.iss ===
      'string'
      ? payload.iss
      : ''

  if (!issuer) {
    return null
  }

  try {
    return new URL(issuer).host
  } catch {
    return null
  }
}

async function readAuthSnapshot():
  Promise<AuthSnapshot> {
  const {
    data,
    error,
  } =
    await supabase.auth.getSession()

  if (error) {
    return {
      loading: false,
      authenticated: false,
      userId: null,
      email: null,
      jwtRole: null,
      issuerHost: null,
      error:
        error.message,
    }
  }

  const session =
    data.session

  if (!session) {
    return {
      loading: false,
      authenticated: false,
      userId: null,
      email: null,
      jwtRole: null,
      issuerHost: null,
      error: null,
    }
  }

  const payload =
    decodeJwtPayload(
      session.access_token,
    )

  const jwtRole =
    typeof payload.role ===
      'string'
      ? payload.role
      : null

  return {
    loading: false,

    authenticated:
      jwtRole ===
      'authenticated',

    userId:
      session.user.id,

    email:
      session.user.email ??
      null,

    jwtRole,

    issuerHost:
      issuerHostFromPayload(
        payload,
      ),

    error: null,
  }
}

function asObject(
  value: unknown,
): JsonObject {
  return (
    value !== null &&
    typeof value ===
      'object' &&
    !Array.isArray(value)
  )
    ? value as JsonObject
    : {}
}

function asObjectArray(
  value: unknown,
): readonly JsonObject[] {
  return Array.isArray(value)
    ? value.map(asObject)
    : []
}

function requireString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !==
      'string' ||
    value.trim().length ===
      0
  ) {
    throw new Error(
      `${fieldName} must be a non-empty string.`,
    )
  }

  return value.trim()
}

function nullableString(
  value: unknown,
): string | null {
  return typeof value ===
    'string' &&
    value.trim().length > 0
    ? value.trim()
    : null
}

function normalizeBundle(
  value: unknown,
): LiveShadowSourceBundle {
  const source =
    asObject(value)

  return {
    status:
      requireString(
        source.status,
        'bundle.status',
      ),

    bundle_version:
      requireString(
        source.bundle_version,
        'bundle.bundle_version',
      ),

    generated_at:
      source.generated_at,

    race_id:
      requireString(
        source.race_id,
        'bundle.race_id',
      ),

    stage_id:
      requireString(
        source.stage_id,
        'bundle.stage_id',
      ),

    stage_format:
      requireString(
        source.stage_format,
        'bundle.stage_format',
      ),

    stage:
      asObject(
        source.stage,
      ),

    profile_detail:
      asObject(
        source.profile_detail,
      ),

    teams:
      asObjectArray(
        source.teams,
      ),

    participants:
      asObjectArray(
        source.participants,
      ),

    rider_inputs:
      asObjectArray(
        source.rider_inputs,
      ),

    phase_commands:
      asObjectArray(
        source.phase_commands,
      ),

    official_results:
      asObjectArray(
        source.official_results,
      ),

    official_simulation_runs:
      asObjectArray(
        source.official_simulation_runs,
      ),

    counts:
      asObject(
        source.counts,
      ),

    safety:
      asObject(
        source.safety,
      ),
  }
}

function sortedKeys(
  value: unknown,
): readonly string[] {
  return Object.keys(
    asObject(value),
  ).sort(
    (
      left,
      right,
    ) =>
      left.localeCompare(
        right,
      ),
  )
}

function hasAnyKey(
  source: JsonObject,
  keys: readonly string[],
): boolean {
  return keys.some(
    (key) =>
      Object.prototype
        .hasOwnProperty
        .call(
          source,
          key,
        ),
  )
}

function uniqueStringValues(
  rows:
    readonly JsonObject[],
  key: string,
): readonly string[] {
  return Array.from(
    new Set(
      rows
        .map(
          (row) =>
            nullableString(
              row[key],
            ),
        )
        .filter(
          (
            value,
          ): value is string =>
            value !== null,
        ),
    ),
  ).sort(
    (
      left,
      right,
    ) =>
      left.localeCompare(
        right,
      ),
  )
}

function inspectLiveSourceShape(
  value: unknown,
): LiveSourceShapeInspection {
  const source =
    asObject(value)

  const riderInputs =
    asObjectArray(
      source.rider_inputs,
    )

  const firstRiderInput =
    riderInputs[0] ??
    {}

  const phaseCommands =
    asObjectArray(
      source.phase_commands,
    )

  const hasPhaseValue =
    (
      command:
        JsonObject,
    ): boolean =>
      [
        command.phase_1_command,
        command.phase_2_command,
        command.phase_3_command,
        command.phase_4_command,
      ].some(
        (value) =>
          nullableString(
            value,
          ) !== null,
      )

  const commandsWithAnyPhaseValue =
    phaseCommands.filter(
      hasPhaseValue,
    ).length

  const firstPhaseCommand =
    phaseCommands[0] ??
    {}

  const equipmentConditionsValue =
    source.equipment_conditions

  const preparationModifiersValue =
    source.preparation_modifiers

  const stage =
    asObject(
      source.stage,
    )

  const profileDetail =
    asObject(
      source.profile_detail,
    )

  return {
    bundleKeys:
      sortedKeys(source),

    firstRiderInputKeys:
      sortedKeys(
        firstRiderInput,
      ),

    stageKeys:
      sortedKeys(stage),

    profileDetailKeys:
      sortedKeys(
        profileDetail,
      ),

    firstPhaseCommandKeys:
      sortedKeys(
        firstPhaseCommand,
      ),

    phaseCommandCount:
      phaseCommands.length,

    hasFatigue:
      hasAnyKey(
        firstRiderInput,
        [
          'fatigue',
        ],
      ),

    hasFatigueBeforeStage:
      hasAnyKey(
        firstRiderInput,
        [
          'fatigue_before_stage',
        ],
      ),

    hasStartStamina:
      hasAnyKey(
        firstRiderInput,
        [
          'start_stamina',
        ],
      ),

    hasMorale:
      hasAnyKey(
        firstRiderInput,
        [
          'morale',
        ],
      ),

    hasAvailabilityStatus:
      hasAnyKey(
        firstRiderInput,
        [
          'availability_status',
        ],
      ),

    hasWeatherSource:
      hasAnyKey(
        source,
        [
          'weather',
          'weather_snapshot',
          'stage_weather',
          'profile_weather',
        ],
      ) ||
      hasAnyKey(
        stage,
        [
          'weather',
          'weather_snapshot',
          'weather_summary',
        ],
      ) ||
      hasAnyKey(
        profileDetail,
        [
          'weather',
          'weather_snapshot',
          'weather_summary',
        ],
      ),

    equipmentConditionCount:
      Array.isArray(
        equipmentConditionsValue,
      )
        ? equipmentConditionsValue
            .length
        : null,

    preparationModifierCount:
      Array.isArray(
        preparationModifiersValue,
      )
        ? preparationModifiersValue
            .length
        : null,

    uniquePhase1Commands:
      uniqueStringValues(
        phaseCommands,
        'phase_1_command',
      ),

    uniquePhase2Commands:
      uniqueStringValues(
        phaseCommands,
        'phase_2_command',
      ),

    uniquePhase3Commands:
      uniqueStringValues(
        phaseCommands,
        'phase_3_command',
      ),

    uniquePhase4Commands:
      uniqueStringValues(
        phaseCommands,
        'phase_4_command',
      ),

    uniqueTeamPlans:
      uniqueStringValues(
        phaseCommands,
        'team_plan',
      ),

    uniqueRoleCodes:
      uniqueStringValues(
        phaseCommands,
        'role_code',
      ),

    commandsWithAnyPhaseValue,

    commandsWithNoPhaseValue:
      phaseCommands.length -
      commandsWithAnyPhaseValue,
  }
}

function connectedProjectHost():
  string {
  const client =
    supabase as unknown as {
      readonly supabaseUrl?:
        string
    }

  const url =
    client.supabaseUrl ??
    ''

  if (!url) {
    return 'unknown'
  }

  try {
    return new URL(url).host
  } catch {
    return 'invalid-url'
  }
}

function Metric({
  label,
  value,
}: {
  readonly label: string
  readonly value:
    string | number
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-400">
        {label}
      </dt>

      <dd className="max-w-[68%] break-all text-right font-semibold text-slate-100">
        {value}
      </dd>
    </div>
  )
}

function KeyList({
  label,
  keys,
}: {
  readonly label: string
  readonly keys:
    readonly string[]
}): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-800 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>

      {keys.length === 0
        ? (
            <div className="mt-3 text-sm text-slate-500">
              No keys found
            </div>
          )
        : (
            <div className="mt-3 flex flex-wrap gap-2">
              {keys.map(
                (key) => (
                  <code
                    key={key}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-cyan-200"
                  >
                    {key}
                  </code>
                ),
              )}
            </div>
          )}
    </div>
  )
}

function formatSeconds(
  value:
    number | null,
): string {
  return value ===
    null
    ? 'Unavailable'
    : `${value.toFixed(3)} s`
}

interface LegacyComparisonRow {
  readonly riderId: string
  readonly riderName: string
  readonly officialPosition: number | null
  readonly deterministicPosition: number | null
  readonly positionDifference: number | null
  readonly officialTimeSeconds: number | null
  readonly deterministicTimeSeconds: number | null
  readonly absoluteTimeDifferenceSeconds: number | null
}

interface ClassificationEntry {
  readonly riderId: string
  readonly riderName: string | null
  readonly position: number | null
  readonly timeSeconds: number | null
}

function readFirst(
  source: JsonObject,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(
        source,
        key,
      )
    ) {
      return source[key]
    }
  }

  return undefined
}

function readString(
  source: JsonObject,
  keys: readonly string[],
): string | null {
  const value =
    readFirst(
      source,
      keys,
    )

  return typeof value ===
    'string' &&
    value.trim().length > 0
    ? value.trim()
    : null
}

function readNumber(
  source: JsonObject,
  keys: readonly string[],
): number | null {
  const value =
    readFirst(
      source,
      keys,
    )

  if (
    typeof value ===
      'number' &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (
    typeof value ===
      'string' &&
    value.trim().length > 0
  ) {
    const parsed =
      Number(value)

    return Number.isFinite(parsed)
      ? parsed
      : null
  }

  return null
}

function readObjectArray(
  source: JsonObject,
  keys: readonly string[],
): readonly JsonObject[] {
  return asObjectArray(
    readFirst(
      source,
      keys,
    ),
  )
}

function classificationEntries(
  value: unknown,
): readonly ClassificationEntry[] {
  return asObjectArray(value)
    .map(
      (
        entry,
      ) => ({
        riderId:
          readString(
            entry,
            [
              'riderId',
              'rider_id',
              'id',
            ],
          ) ?? '',

        riderName:
          readString(
            entry,
            [
              'riderName',
              'rider_name',
              'name',
              'displayName',
              'display_name',
            ],
          ),

        position:
          readNumber(
            entry,
            [
              'position',
              'finishPosition',
              'finish_position',
              'rank',
            ],
          ),

        timeSeconds:
          readNumber(
            entry,
            [
              'timeSeconds',
              'time_seconds',
              'finishTimeSeconds',
              'finish_time_seconds',
              'elapsedTimeSeconds',
              'elapsed_time_seconds',
              'totalTimeSeconds',
              'total_time_seconds',
            ],
          ),
      }),
    )
    .filter(
      (
        entry,
      ) => entry.riderId.length > 0,
    )
}

function legacyComparisonRows(
  stage: LiveStagingShadowStageReport,
): readonly LegacyComparisonRow[] {
  const evidence =
    asObject(stage)

  const official =
    classificationEntries(
      readFirst(
        evidence,
        [
          'officialClassifications',
          'officialClassification',
          'official_classifications',
        ],
      ),
    )

  const deterministic =
    classificationEntries(
      readFirst(
        evidence,
        [
          'deterministicClassifications',
          'deterministicClassification',
          'deterministic_classifications',
        ],
      ),
    )

  const differences =
    readObjectArray(
      evidence,
      [
        'riderDifferences',
        'classificationDifferences',
        'comparisonDifferences',
        'timingDifferences',
        'timeDifferences',
        'rider_differences',
      ],
    )

  const officialByRider =
    new Map(
      official.map(
        (
          entry,
        ) => [
          entry.riderId,
          entry,
        ],
      ),
    )

  const deterministicByRider =
    new Map(
      deterministic.map(
        (
          entry,
        ) => [
          entry.riderId,
          entry,
        ],
      ),
    )

  const differenceByRider =
    new Map<string, JsonObject>()

  for (const difference of differences) {
    const riderId =
      readString(
        difference,
        [
          'riderId',
          'rider_id',
          'id',
        ],
      )

    if (riderId) {
      differenceByRider.set(
        riderId,
        difference,
      )
    }
  }

  const riderIds =
    new Set<string>([
      ...officialByRider.keys(),
      ...deterministicByRider.keys(),
      ...differenceByRider.keys(),
    ])

  return Array.from(riderIds)
    .map(
      (
        riderId,
      ) => {
        const officialEntry =
          officialByRider.get(
            riderId,
          )

        const deterministicEntry =
          deterministicByRider.get(
            riderId,
          )

        const difference =
          differenceByRider.get(
            riderId,
          ) ?? {}

        const officialPosition =
          officialEntry?.position ??
          readNumber(
            difference,
            [
              'officialPosition',
              'official_position',
            ],
          )

        const deterministicPosition =
          deterministicEntry?.position ??
          readNumber(
            difference,
            [
              'deterministicPosition',
              'deterministic_position',
            ],
          )

        const officialTimeSeconds =
          officialEntry?.timeSeconds ??
          readNumber(
            difference,
            [
              'officialTimeSeconds',
              'official_time_seconds',
            ],
          )

        const deterministicTimeSeconds =
          deterministicEntry?.timeSeconds ??
          readNumber(
            difference,
            [
              'deterministicTimeSeconds',
              'deterministic_time_seconds',
            ],
          )

        const reportedAbsoluteDifference =
          readNumber(
            difference,
            [
              'absoluteTimeDifferenceSeconds',
              'absolute_time_difference_seconds',
              'timeDifferenceSeconds',
              'time_difference_seconds',
            ],
          )

        return {
          riderId,

          riderName:
            officialEntry?.riderName ??
            deterministicEntry?.riderName ??
            readString(
              difference,
              [
                'riderName',
                'rider_name',
                'name',
              ],
            ) ??
            riderId,

          officialPosition,

          deterministicPosition,

          positionDifference:
            officialPosition !== null &&
            deterministicPosition !== null
              ? deterministicPosition -
                officialPosition
              : null,

          officialTimeSeconds,

          deterministicTimeSeconds,

          absoluteTimeDifferenceSeconds:
            reportedAbsoluteDifference !== null
              ? Math.abs(
                  reportedAbsoluteDifference,
                )
              : officialTimeSeconds !== null &&
                  deterministicTimeSeconds !== null
                ? Math.abs(
                    deterministicTimeSeconds -
                      officialTimeSeconds,
                  )
                : null,
        }
      },
    )
}

function positionLabel(
  value: number | null,
): string {
  return value === null
    ? 'Missing'
    : String(value)
}

function ComparisonTable({
  title,
  rows,
}: {
  readonly title: string
  readonly rows:
    readonly LegacyComparisonRow[]
}): JSX.Element {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-200">
        {title}
      </h4>

      {rows.length === 0
        ? (
            <div className="mt-2 rounded-xl border border-slate-800 px-4 py-3 text-sm text-slate-500">
              No rows in the stage report.
            </div>
          )
        : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">
                      Rider
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      Official
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      Deterministic
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      Position Δ
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      Official time
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      Deterministic time
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      Absolute time Δ
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800">
                  {rows.map(
                    (
                      row,
                    ) => (
                      <tr key={row.riderId}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-200">
                            {row.riderName}
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                            {row.riderId}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {positionLabel(
                            row.officialPosition,
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {positionLabel(
                            row.deterministicPosition,
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.positionDifference === null
                            ? 'Unavailable'
                            : row.positionDifference}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatSeconds(
                            row.officialTimeSeconds,
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatSeconds(
                            row.deterministicTimeSeconds,
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap font-semibold text-amber-200">
                          {formatSeconds(
                            row.absoluteTimeDifferenceSeconds,
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
    </div>
  )
}

function LegacyComparisonEvidence({
  stage,
}: {
  readonly stage:
    LiveStagingShadowStageReport
}): JSX.Element {
  const evidence =
    asObject(stage)

  const rows =
    legacyComparisonRows(stage)

  const officialTopTen =
    rows
      .filter(
        (
          row,
        ) => row.officialPosition !== null,
      )
      .sort(
        (
          left,
          right,
        ) =>
          (left.officialPosition ??
            Number.MAX_SAFE_INTEGER) -
          (right.officialPosition ??
            Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 10)

  const deterministicTopTen =
    rows
      .filter(
        (
          row,
        ) => row.deterministicPosition !== null,
      )
      .sort(
        (
          left,
          right,
        ) =>
          (left.deterministicPosition ??
            Number.MAX_SAFE_INTEGER) -
          (right.deterministicPosition ??
            Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 10)

  const largestTimeDifferences =
    rows
      .filter(
        (
          row,
        ) =>
          row.absoluteTimeDifferenceSeconds !==
          null,
      )
      .sort(
        (
          left,
          right,
        ) =>
          (right.absoluteTimeDifferenceSeconds ??
            -1) -
          (left.absoluteTimeDifferenceSeconds ??
            -1),
      )
      .slice(0, 20)

  const missingPositions =
    rows.filter(
      (
        row,
      ) =>
        row.officialPosition === null ||
        row.deterministicPosition === null,
    )

  const officialWinner =
    officialTopTen.find(
      (
        row,
      ) => row.officialPosition === 1,
    ) ??
    null

  const deterministicWinner =
    deterministicTopTen.find(
      (
        row,
      ) => row.deterministicPosition === 1,
    ) ??
    null

  const averageTimeDifferenceSeconds =
    readNumber(
      evidence,
      [
        'averageAbsoluteTimeDifferenceSeconds',
        'averageTimeDifferenceSeconds',
        'meanAbsoluteTimeDifferenceSeconds',
        'meanTimeDifferenceSeconds',
        'average_absolute_time_difference_seconds',
        'average_time_difference_seconds',
      ],
    )

  const comparedRiderCount =
    readNumber(
      evidence,
      [
        'comparedRiderCount',
        'comparisonRiderCount',
        'compared_rider_count',
      ],
    )

  const officialWinnerDeterministicPosition =
    readNumber(
      evidence,
      [
        'officialWinnerDeterministicPosition',
        'officialWinnerPositionInDeterministic',
        'official_winner_deterministic_position',
      ],
    ) ??
    officialWinner?.deterministicPosition ??
    null

  const deterministicWinnerOfficialPosition =
    readNumber(
      evidence,
      [
        'deterministicWinnerOfficialPosition',
        'deterministicWinnerPositionInOfficial',
        'deterministic_winner_official_position',
      ],
    ) ??
    deterministicWinner?.officialPosition ??
    null

  return (
    <details className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/40">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-cyan-200">
        Inspect legacy comparison differences
      </summary>

      <div className="space-y-6 border-t border-slate-800 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <dl className="space-y-2 rounded-xl border border-slate-800 p-4 text-xs">
            <Metric
              label="Official winner"
              value={
                officialWinner
                  ? `${officialWinner.riderName} (${officialWinner.riderId})`
                  : 'Unavailable'
              }
            />
            <Metric
              label="Deterministic winner"
              value={
                deterministicWinner
                  ? `${deterministicWinner.riderName} (${deterministicWinner.riderId})`
                  : 'Unavailable'
              }
            />
          </dl>

          <dl className="space-y-2 rounded-xl border border-slate-800 p-4 text-xs">
            <Metric
              label="Average absolute time difference"
              value={formatSeconds(
                averageTimeDifferenceSeconds,
              )}
            />
            <Metric
              label="Compared rider count"
              value={
                comparedRiderCount ??
                rows.filter(
                  (
                    row,
                  ) =>
                    row.officialPosition !== null &&
                    row.deterministicPosition !== null,
                ).length
              }
            />
          </dl>

          <dl className="space-y-2 rounded-xl border border-slate-800 p-4 text-xs">
            <Metric
              label="Official winner’s deterministic position"
              value={positionLabel(
                officialWinnerDeterministicPosition,
              )}
            />
            <Metric
              label="Deterministic winner’s official position"
              value={positionLabel(
                deterministicWinnerOfficialPosition,
              )}
            />
          </dl>

          <dl className="space-y-2 rounded-xl border border-slate-800 p-4 text-xs">
            <Metric
              label="Rows with missing positions"
              value={missingPositions.length}
            />
            <Metric
              label="Rows with timing differences"
              value={largestTimeDifferences.length}
            />
          </dl>
        </div>

        <ComparisonTable
          title="Top 10 official classification"
          rows={officialTopTen}
        />

        <ComparisonTable
          title="Top 10 deterministic classification"
          rows={deterministicTopTen}
        />

        <ComparisonTable
          title="Largest 20 absolute time differences"
          rows={largestTimeDifferences}
        />

        <ComparisonTable
          title="Riders with official or deterministic missing positions"
          rows={missingPositions}
        />
      </div>
    </details>
  )
}

export default function LiveStagingShadowValidationDiagnostic():
  JSX.Element {
  const projectHost =
    useMemo(
      connectedProjectHost,
      [],
    )

  const [
    authSnapshot,
    setAuthSnapshot,
  ] = useState<AuthSnapshot>(
    EMPTY_AUTH_SNAPSHOT,
  )

  const [
    environmentAttested,
    setEnvironmentAttested,
  ] = useState(false)

  const [
    running,
    setRunning,
  ] = useState(false)

  const [
    progress,
    setProgress,
  ] = useState(
    'Not started',
  )

  const [
    result,
    setResult,
  ] = useState<
    DiagnosticResult | null
  >(null)

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null)

  const [
    replayStageId,
    setReplayStageId,
  ] = useState<
    string | null
  >(null)

  const refreshAuthSnapshot =
    async (): Promise<AuthSnapshot> => {
      setAuthSnapshot(
        (
          current,
        ) => ({
          ...current,
          loading: true,
          error: null,
        }),
      )

      const next =
        await readAuthSnapshot()

      setAuthSnapshot(next)

      return next
    }

  useEffect(
    () => {
      let mounted = true

      const load =
        async (): Promise<void> => {
          const next =
            await readAuthSnapshot()

          if (mounted) {
            setAuthSnapshot(next)
          }
        }

      void load()

      const {
        data:
          authListener,
      } =
        supabase.auth.onAuthStateChange(
          () => {
            void load()
          },
        )

      return () => {
        mounted = false

        authListener
          .subscription
          .unsubscribe()
      }
    },
    [],
  )

  const runAll =
    async (): Promise<void> => {
      if (!environmentAttested) {
        setError(
          'Confirm that the connected Supabase project is the staging environment before running.',
        )
        return
      }

      const activeAuth =
        await refreshAuthSnapshot()

      if (
        !activeAuth.authenticated ||
        !activeAuth.userId
      ) {
        setError(
          'No authenticated Supabase session is active in this browser tab. The client would call the RPC with the anon role. Sign in, return to the dashboard, then navigate to this diagnostic without refreshing the page.',
        )

        setProgress(
          'Blocked — authenticated session required',
        )

        return
      }

      if (
        activeAuth.issuerHost !==
          null &&
        activeAuth.issuerHost !==
          projectHost
      ) {
        setError(
          `Authenticated session project mismatch. Session host: ${activeAuth.issuerHost}; RPC host: ${projectHost}.`,
        )

        setProgress(
          'Blocked — project mismatch',
        )

        return
      }

      setRunning(true)
      setResult(null)
      setError(null)
      setReplayStageId(null)

      try {
        const rpcClient =
          supabase as unknown as
            RpcClientShape

        const records:
          StageExecutionRecord[] = []

        for (
          let index = 0;
          index <
          LIVE_STAGING_SHADOW_STAGES.length;
          index += 1
        ) {
          const definition =
            LIVE_STAGING_SHADOW_STAGES[
              index
            ]

          if (!definition) {
            throw new Error(
              `Missing stage definition at index ${index}.`,
            )
          }

          setProgress(
            `Loading ${definition.profile} stage ${index + 1} of ${LIVE_STAGING_SHADOW_STAGES.length}`,
          )

          const {
            data,
            error:
              rpcError,
          } = await rpcClient.rpc(
            SOURCE_RPC_NAME,
            {
              p_stage_id:
                definition.stageId,
            },
          )

          if (rpcError) {
            throw new Error(
              `${definition.label}: ${rpcError.message}`,
            )
          }

          const sourceInspection =
            inspectLiveSourceShape(
              data,
            )

          const bundle =
            normalizeBundle(
              data,
            )

          setProgress(
            `Running deterministic engine and replay validation for ${definition.profile}`,
          )

          const execution =
            executeLiveStagingShadowStageValidation({
              definition,
              bundle,
            })

          const stageValidation =
            validateLiveStagingShadowStageReport(
              execution.report,
            )

          if (
            !stageValidation.valid
          ) {
            throw new Error(
              `${definition.label}: ${stageValidation.issues.join('; ')}`,
            )
          }

          const attackStartedEventCount =
            execution
              .simulationOutput
              .events
              .filter(
                (
                  event,
                ) =>
                  event.eventType ===
                  'ATTACK_STARTED',
              )
              .length

          const groupCreatedEventCount =
            execution
              .simulationOutput
              .events
              .filter(
                (
                  event,
                ) =>
                  event.eventType ===
                  'GROUP_CREATED',
              )
              .length

          records.push({
            definition,

            report:
              execution.report,

            replayModel:
              execution.replayModel,

            sourceInspection,

            attackStartedEventCount,

            groupCreatedEventCount,
          })
        }

        const batch =
          createLiveStagingShadowBatchReport({
            stages:
              records.map(
                (
                  record,
                ) =>
                  record.report,
              ),

            environmentAttested,
            connectedProjectHost:
              projectHost,
          })

        const batchValidation =
          validateLiveStagingShadowBatchReport(
            batch,
          )

        if (
          !batchValidation.valid
        ) {
          throw new Error(
            batchValidation.issues.join(
              '; ',
            ),
          )
        }

        setResult({
          batch,
          stages:
            records,
        })

        setProgress(
          'Completed',
        )
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
        )

        setProgress(
          'Failed',
        )
      } finally {
        setRunning(false)
      }
    }

  const selectedReplay =
    result?.stages.find(
      (
        record,
      ) =>
        record.definition.stageId ===
        replayStageId,
    ) ??
    null

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Phase 8J.8A live diagnostic
          </div>

          <h1 className="mt-2 text-3xl font-bold">
            Live read-only staging shadow validation
          </h1>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-slate-300">
            Loads three authenticated read-only source bundles from the
            connected Supabase project, executes the real deterministic engine
            twice per stage, validates the real generic replay model, and
            compares the output with persisted official legacy classifications.
          </p>
        </header>

        <section className="rounded-3xl border border-amber-700 bg-amber-950/20 p-6">
          <h2 className="text-xl font-semibold text-amber-200">
            Environment attestation
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            This page can identify the connected Supabase host but cannot
            independently prove whether it is staging. Confirm the environment
            before running the authenticated read-only RPC.
          </p>

          <dl className="mt-4 space-y-2 text-sm">
            <Metric
              label="Connected project host"
              value={projectHost}
            />
            <Metric
              label="RPC"
              value={SOURCE_RPC_NAME}
            />

            <Metric
              label="Session detected"
              value={
                authSnapshot.loading
                  ? 'Checking…'
                  : String(
                      authSnapshot.authenticated,
                    )
              }
            />

            <Metric
              label="JWT role"
              value={
                authSnapshot.jwtRole ??
                'none'
              }
            />

            <Metric
              label="Authenticated user"
              value={
                authSnapshot.userId ??
                'none'
              }
            />

            <Metric
              label="Session project host"
              value={
                authSnapshot.issuerHost ??
                'none'
              }
            />
          </dl>

          {!authSnapshot.loading &&
            !authSnapshot.authenticated && (
              <div className="mt-5 rounded-2xl border border-rose-700 bg-rose-950/30 p-4 text-sm text-rose-100">
                <div className="font-semibold">
                  Authenticated session missing
                </div>

                <p className="mt-2 leading-6">
                  This project uses persistSession=false. A full page reload
                  removes the in-memory login session. Sign in again, open the
                  dashboard, then navigate here in the same page without
                  refreshing.
                </p>

                <div className="mt-3 flex flex-wrap gap-3">
                  <a
                    href="#/login"
                    className="rounded-xl border border-rose-500 px-4 py-2 font-semibold"
                  >
                    Open login
                  </a>

                  <button
                    type="button"
                    className="rounded-xl border border-slate-600 px-4 py-2 font-semibold"
                    onClick={
                      () => {
                        void refreshAuthSnapshot()
                      }
                    }
                  >
                    Recheck session
                  </button>
                </div>
              </div>
            )}

          {authSnapshot.error && (
            <div className="mt-5 rounded-2xl border border-rose-700 bg-rose-950/30 p-4 text-sm text-rose-100">
              Session check failed: {authSnapshot.error}
            </div>
          )}

          <label className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-800 p-4 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={
                environmentAttested
              }
              onChange={
                (
                  event,
                ) =>
                  setEnvironmentAttested(
                    event.target.checked,
                  )
              }
            />

            <span>
              I confirm that the connected Supabase project is the staging
              environment and that I am signed in with a club accepted in all
              three validation races.
            </span>
          </label>

          <button
            type="button"
            className="mt-5 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              running ||
              authSnapshot.loading ||
              !authSnapshot.authenticated ||
              !environmentAttested
            }
            onClick={
              () => {
                void runAll()
              }
            }
          >
            {running
              ? 'Running live validation…'
              : 'Run all three live validations'}
          </button>

          <div className="mt-3 text-xs text-slate-400">
            Progress: {progress}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            The RPC button is enabled only when the shared Supabase client
            contains a user session whose JWT role is authenticated.
          </div>
        </section>

        {error && (
          <section className="rounded-3xl border border-rose-700 bg-rose-950/30 p-6">
            <h2 className="text-xl font-semibold text-rose-200">
              Validation failed
            </h2>

            <pre className="mt-3 whitespace-pre-wrap text-sm text-rose-100">
              {error}
            </pre>
          </section>
        )}

        {result && (
          <>
            <section
              className={`rounded-3xl border p-6 ${
                result
                  .batch
                  .executionPassed
                  ? 'border-emerald-700 bg-emerald-950/30'
                  : 'border-rose-700 bg-rose-950/30'
              }`}
            >
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Live read-only execution
              </div>

              <h2 className="mt-2 text-2xl font-bold">
                {result
                  .batch
                  .executionPassed
                  ? 'PASS — flat, hilly, and mountain staging evidence executed safely'
                  : 'FAIL — one or more live stage executions failed'}
              </h2>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-xs text-slate-400">
                    Batch report hash
                  </div>
                  <div className="mt-1 break-all font-mono text-sm">
                    {result.batch.reportHash}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">
                    Execution passing
                  </div>
                  <div className="mt-1 text-xl font-bold">
                    {result
                      .batch
                      .executionPassingStageCount}
                    /{result.batch.stageCount}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">
                    Strict migration comparison
                  </div>
                  <div
                    className={`mt-1 text-xl font-bold ${
                      result
                        .batch
                        .strictMigrationAcceptancePassed
                        ? 'text-emerald-300'
                        : 'text-amber-300'
                    }`}
                  >
                    {result
                      .batch
                      .strictMigrationAcceptancePassed
                      ? 'PASSED'
                      : `BLOCKED (${result.batch.strictComparisonPassingStageCount}/${result.batch.stageCount})`}
                  </div>
                </div>
              </div>

              <p className="mt-5 text-sm leading-6 text-slate-300">
                A green execution result proves read-only source transport,
                deterministic repeatability, complete classifications, and
                valid generic replay models. Strict migration acceptance also
                requires the persisted legacy winner, exact finish order, and
                configured time tolerance to match on all three stages.
              </p>
            </section>

            <section className="grid gap-5">
              {result.stages.map(
                (
                  record,
                ) => {
                  const stage =
                    record.report

                  const inspection =
                    record.sourceInspection

                  return (
                    <article
                      key={
                        stage.stageId
                      }
                      className="rounded-3xl border border-slate-800 bg-slate-900 p-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-cyan-300">
                            {stage.profile}
                          </div>

                          <h2 className="mt-1 text-xl font-semibold">
                            {stage.raceName} — {stage.stageName}
                          </h2>

                          <div className="mt-1 text-sm text-slate-400">
                            {stage.distanceKm.toFixed(2)} km
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              stage.executionPassed
                                ? 'bg-emerald-950 text-emerald-200'
                                : 'bg-rose-950 text-rose-200'
                            }`}
                          >
                            Execution {stage.executionPassed
                              ? 'PASS'
                              : 'FAIL'}
                          </span>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              stage.strictMigrationComparisonPassed
                                ? 'bg-emerald-950 text-emerald-200'
                                : 'bg-amber-950 text-amber-200'
                            }`}
                          >
                            Comparison {stage.strictMigrationComparisonPassed
                              ? 'PASS'
                              : 'BLOCKED'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-6 lg:grid-cols-3">
                        <dl className="space-y-2 text-xs">
                          <Metric
                            label="Report hash"
                            value={stage.reportHash}
                          />
                          <Metric
                            label="Source hash"
                            value={stage.sourceRowsHash}
                          />
                          <Metric
                            label="Input hash"
                            value={stage.stageInputHash}
                          />
                          <Metric
                            label="Output hash"
                            value={stage.deterministicOutputHash}
                          />
                          <Metric
                            label="Replay hash"
                            value={stage.replayModelHash}
                          />
                        </dl>

                        <dl className="space-y-2 text-xs">
                          <Metric
                            label="Executable riders"
                            value={stage.executableRiderCount}
                          />

                          <Metric
                            label="Executable orders"
                            value={stage.orderCount}
                          />

                          <Metric
                            label="Attack started events"
                            value={
                              record
                                .attackStartedEventCount
                            }
                          />

                          <Metric
                            label="Group created events"
                            value={
                              record
                                .groupCreatedEventCount
                            }
                          />

                          <Metric
                            label="Official results"
                            value={stage.officialResultCount}
                          />

                          <Metric
                            label="Snapshots"
                            value={stage.deterministicSnapshotCount}
                          />

                          <Metric
                            label="Events"
                            value={stage.deterministicEventCount}
                          />

                          <Metric
                            label="Replay frames"
                            value={stage.replayFrameCount}
                          />
                        </dl>

                        <dl className="space-y-2 text-xs">
                          <Metric
                            label="Rider coverage"
                            value={String(stage.riderCoverageMatches)}
                          />
                          <Metric
                            label="Winner matches"
                            value={String(stage.winnerMatches)}
                          />
                          <Metric
                            label="Exact order"
                            value={String(stage.exactFinishOrderMatches)}
                          />
                          <Metric
                            label="Maximum time difference"
                            value={formatSeconds(stage.maximumTimeDifferenceSeconds)}
                          />
                          <Metric
                            label="Allowed tolerance"
                            value={`${stage.configuredTimeToleranceSeconds} s`}
                          />
                        </dl>
                      </div>

                      <div className="mt-6">
                        <h3 className="font-semibold">
                          Stage checks
                        </h3>

                        <div className="mt-3 space-y-2">
                          {stage.checks.map(
                            (
                              check,
                            ) => (
                              <div
                                key={check.label}
                                className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 px-4 py-3 text-sm"
                              >
                                <span>
                                  {check.label}
                                </span>

                                <strong
                                  className={
                                    check.passed
                                      ? 'text-emerald-300'
                                      : 'text-rose-300'
                                  }
                                >
                                  {check.passed
                                    ? 'PASS'
                                    : 'FAIL'}
                                </strong>
                              </div>
                            ),
                          )}
                        </div>
                      </div>

                      <details className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/40">
                        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-violet-200">
                          Inspect live source fields
                        </summary>

                        <div className="space-y-5 border-t border-slate-800 p-4">
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <dl className="space-y-2 rounded-xl border border-slate-800 p-4 text-xs">
                              <Metric
                                label="Fatigue"
                                value={String(
                                  inspection
                                    .hasFatigue,
                                )}
                              />

                              <Metric
                                label="Fatigue before stage"
                                value={String(
                                  inspection
                                    .hasFatigueBeforeStage,
                                )}
                              />

                              <Metric
                                label="Start stamina"
                                value={String(
                                  inspection
                                    .hasStartStamina,
                                )}
                              />
                            </dl>

                            <dl className="space-y-2 rounded-xl border border-slate-800 p-4 text-xs">
                              <Metric
                                label="Morale"
                                value={String(
                                  inspection
                                    .hasMorale,
                                )}
                              />

                              <Metric
                                label="Availability status"
                                value={String(
                                  inspection
                                    .hasAvailabilityStatus,
                                )}
                              />

                              <Metric
                                label="Weather source"
                                value={String(
                                  inspection
                                    .hasWeatherSource,
                                )}
                              />
                            </dl>

                            <dl className="space-y-2 rounded-xl border border-slate-800 p-4 text-xs">
                              <Metric
                                label="Equipment condition rows"
                                value={
                                  inspection
                                    .equipmentConditionCount ??
                                  'Not returned'
                                }
                              />

                              <Metric
                                label="Preparation modifier rows"
                                value={
                                  inspection
                                    .preparationModifierCount ??
                                  'Not returned'
                                }
                              />
                            </dl>

                            <dl className="space-y-2 rounded-xl border border-slate-800 p-4 text-xs">
                              <Metric
                                label="Phase command count"
                                value={
                                  inspection
                                    .phaseCommandCount
                                }
                              />

                              <Metric
                                label="Commands with phase values"
                                value={
                                  inspection
                                    .commandsWithAnyPhaseValue
                                }
                              />

                              <Metric
                                label="Commands without phase values"
                                value={
                                  inspection
                                    .commandsWithNoPhaseValue
                                }
                              />
                            </dl>
                          </div>

                          <KeyList
                            label="Bundle keys"
                            keys={
                              inspection
                                .bundleKeys
                            }
                          />

                          <KeyList
                            label="First rider input keys"
                            keys={
                              inspection
                                .firstRiderInputKeys
                            }
                          />

                          <KeyList
                            label="Stage keys"
                            keys={
                              inspection
                                .stageKeys
                            }
                          />

                          <KeyList
                            label="Profile detail keys"
                            keys={
                              inspection
                                .profileDetailKeys
                            }
                          />

                          <KeyList
                            label="First phase command keys"
                            keys={
                              inspection
                                .firstPhaseCommandKeys
                            }
                          />

                          <KeyList
                            label="Unique role codes"
                            keys={
                              inspection
                                .uniqueRoleCodes
                            }
                          />

                          <KeyList
                            label="Unique team plans"
                            keys={
                              inspection
                                .uniqueTeamPlans
                            }
                          />

                          <KeyList
                            label="Unique phase 1 commands"
                            keys={
                              inspection
                                .uniquePhase1Commands
                            }
                          />

                          <KeyList
                            label="Unique phase 2 commands"
                            keys={
                              inspection
                                .uniquePhase2Commands
                            }
                          />

                          <KeyList
                            label="Unique phase 3 commands"
                            keys={
                              inspection
                                .uniquePhase3Commands
                            }
                          />

                          <KeyList
                            label="Unique phase 4 commands"
                            keys={
                              inspection
                                .uniquePhase4Commands
                            }
                          />
                        </div>
                      </details>

                      <LegacyComparisonEvidence
                        stage={stage}
                      />

                      <button
                        type="button"
                        className="mt-6 rounded-xl border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-200"
                        onClick={
                          () =>
                            setReplayStageId(
                              stage.stageId,
                            )
                        }
                      >
                        Open generic replay preview
                      </button>
                    </article>
                  )
                },
              )}
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-xl font-semibold">
                Batch checks
              </h2>

              <div className="mt-4 space-y-2">
                {result.batch.checks.map(
                  (
                    check,
                  ) => (
                    <div
                      key={check.label}
                      className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 px-4 py-3 text-sm"
                    >
                      <span>
                        {check.label}
                      </span>

                      <strong
                        className={
                          check.passed
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }
                      >
                        {check.passed
                          ? 'PASS'
                          : 'FAIL'}
                      </strong>
                    </div>
                  ),
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-amber-800 bg-amber-950/20 p-6">
              <h2 className="text-xl font-semibold">
                Legacy comparison boundary
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-300">
                The legacy side is the persisted official classification
                snapshot returned by the existing read-only RPC. This page does
                not invoke a fresh legacy race simulation and cannot compare
                legacy replay events. Any strict comparison failure must be
                reviewed before authoritative persistence or canary execution.
              </p>
            </section>
          </>
        )}

        {selectedReplay && (
          <section className="overflow-hidden rounded-3xl border border-cyan-600 bg-white">
            <div className="flex items-center justify-between gap-4 bg-slate-900 px-5 py-4 text-slate-100">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-cyan-300">
                  Live staging generic replay preview
                </div>

                <div className="font-semibold">
                  {selectedReplay.report.raceName} — {selectedReplay.report.stageName}
                </div>
              </div>

              <button
                type="button"
                className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold"
                onClick={
                  () =>
                    setReplayStageId(
                      null,
                    )
                }
              >
                Close replay
              </button>
            </div>

            <GenericRaceReplayView
              model={
                selectedReplay.replayModel
              }
              displayMode="page"
              onClose={
                () =>
                  setReplayStageId(
                    null,
                  )
              }
              raceName={
                selectedReplay.report.raceName
              }
              stageLabel={
                selectedReplay.report.stageName
              }
            />
          </section>
        )}

        <section className="rounded-3xl border border-rose-800 bg-rose-950/20 p-6">
          <h2 className="text-xl font-semibold">
            Safety status
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            The source RPC is read-only. The deterministic engine and generic
            replay execute in browser memory only. No official result, replay,
            rider condition, health case, equipment state, production route,
            feature flag, or player UI is changed.
          </p>
        </section>
      </div>
    </main>
  )
}
