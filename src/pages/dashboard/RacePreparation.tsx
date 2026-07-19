/**
 * RacePreparation.tsx
 * Main dashboard page for Race Preparation.
 *
 * Tabs:
 * 1. Accepted Races
 * 2. Race Plan
 * 3. Stage Plans
 *
 * Write flow:
 * Button → Supabase Edge Function → SQL RPC → Database
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import TutorialOverlay from "../../components/tutorial/TutorialOverlay";
import {
  racePreparationTutorialSteps,
  racePreparationWelcomeTutorial,
} from "../../lib/tutorials";
import {
  getTutorialProgress,
  saveTutorialProgress,
} from "../../lib/tutorialProgress";
import { supabase } from "../../lib/supabase";
import RaceDetailPage from "./RaceDetailPage";
import {
  askSportDirectorForStagePlan,
  getRiderName,
  loadAcceptedRacePreparations,
  loadExistingRacePreparationDraft,
  loadRacePreparationContext,
  loadRacePreparationSelectableData,
  loadRacePreparationSquadOptions,
  loadRaceStageProfileDetail,
  loadU23StagePlanAutomationDashboard,
  quoteRacePreparation,
  resolveCurrentClubId,
  saveRacePreparationDraft,
  saveRaceStagePlan,
  setU23StagePlanAutomation,
  submitRacePreparation,
} from "./race-preparation/racePreparationApi";
import type {
  AcceptedRacePreparationRow,
  BlockedRacePreparationResource,
  EquipmentSetupPresetOption,
  JsonRecord,
  RacePrepAssetInventoryKey,
  RacePrepAssetKey,
  RacePreparationPayload,
  RacePreparationQuote,
  RacePreparationSelectableData,
  RacePreparationSquadOption,
  RacePreparationTab,
  RacePreparationTacticalPlannerChoice,
  RacePreparationTarget,
  RaceSupplyOption,
  U23StagePlanAutomationDashboard,
  U23StagePlanDashboardStage,
  UUID,
} from "./race-preparation/racePreparationTypes";

type RiderRaceSharpnessUiRow = {
  rider_id: UUID;
  rider_name: string;
  club_id: UUID | null;
  club_name: string | null;
  race_sharpness: number | string;
  race_sharpness_percent: number | string;
  race_sharpness_label: string;
  race_sharpness_status: string;
  badge_tone: "success" | "info" | "warning" | "danger" | string;
  last_raced_on: string | null;
  race_days_last_14: number | string;
  race_days_last_30: number | string;
  total_race_days: number | string;
  last_stage_sharpness_delta: number | string;
  overload_penalty: number | string;
  overload_warning: boolean;
  race_sharpness_message: string;
};

type StagePlanUiTone = "green" | "yellow" | "orange" | "red" | "gray";

type StagePlanReadinessStage = {
  race_stage_plan_id: UUID;
  race_preparation_id: UUID;
  race_id: UUID;
  stage_id: UUID;
  stage_number: number;
  stage_date: string;
  status: string;
  last_saved_at: string | null;
  submitted_at: string | null;
  rider_role_count: number;
  rider_equipment_count: number;
  rider_supply_count: number;
  rider_individual_tactic_count: number;
  team_tactic_rider_count: number;
  has_saved_plan: boolean;
  has_core_rider_plan: boolean;
  has_supply_plan: boolean;
  has_tactical_plan: boolean;
  is_placeholder: boolean;
  is_usable_for_engine: boolean;
  readiness_status: string;
  readiness_label: string;
  recommended_action: string;
  ui_tone: StagePlanUiTone;
  metadata?: JsonRecord;
};

type StagePlanReadinessSummary = {
  race_preparation_id: UUID;
  race_id: UUID;
  total_stage_plans: number;
  saved_stage_plans: number;
  usable_stage_plans: number;
  missing_stage_plans: number;
  saved_without_supplies: number;
  saved_but_empty: number;
  incomplete_stage_plans: number;
  all_required_stage_plans_saved: boolean;
  has_missing_stage_plans: boolean;
  has_problem_stage_plans: boolean;
  readiness_status: string;
  readiness_label: string;
  recommended_action: string;
  ui_tone: StagePlanUiTone;
};

type StagePlanReadinessUiResponse = {
  status: string;
  version: string;
  race_preparation_id: UUID | null;
  race_id: UUID | null;
  summary: StagePlanReadinessSummary[];
  stages: StagePlanReadinessStage[];
};

type SportDirectorSuggestionResponse = {
  status?: string;
  code?: string;
  message?: string;
  safe_frontend_label?: string;
  sport_director?: JsonRecord;
  stage_kind?: string;
  stage_name?: string;
  suggestion?: JsonRecord;
  explanation?: string[];
};

type SportDirectorSuggestionSection =
  "equipment" | "team" | "individual" | "supplies";

const assetLabels: Record<RacePrepAssetKey, string> = {
  team_bus: "Team Bus",
  equipment_van: "Equipment Van",
  mobile_workshop: "Mobile Workshop",
  medical_van: "Medical Van",
  team_car_1: "Team Car 1",
  team_car_2: "Team Car 2",
  team_car_3: "Team Car 3",
};

const stagePlanReadinessToneClasses: Record<StagePlanUiTone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
  red: "border-red-200 bg-red-50 text-red-800",
  gray: "border-slate-200 bg-slate-50 text-slate-700",
};

const stagePlanReadinessBadgeClasses: Record<StagePlanUiTone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  red: "border-red-200 bg-red-50 text-red-700",
  gray: "border-slate-200 bg-slate-50 text-slate-600",
};

function getAssetInventoryKey(
  assetKey: RacePrepAssetKey,
): RacePrepAssetInventoryKey {
  if (
    assetKey === "team_car_1" ||
    assetKey === "team_car_2" ||
    assetKey === "team_car_3"
  ) {
    return "team_car";
  }

  return assetKey as RacePrepAssetInventoryKey;
}

function createEmptySelectedAssets(): Record<RacePrepAssetKey, UUID | ""> {
  return {
    team_bus: "",
    equipment_van: "",
    mobile_workshop: "",
    medical_van: "",
    team_car_1: "",
    team_car_2: "",
    team_car_3: "",
  };
}

function isAssetSelectedInAnotherSlot(
  selectedAssets: Record<RacePrepAssetKey, UUID | "">,
  currentAssetKey: RacePrepAssetKey,
  assetId: UUID,
): boolean {
  return Object.entries(selectedAssets).some(([key, value]) => {
    return key !== currentAssetKey && value === assetId;
  });
}

const staffRoleLabels: Record<string, string> = {
  sport_director: "Sport Director",
  team_doctor: "Team Doctor",
  physio: "Physio",
  mechanic: "Mechanic",
};

const supportStaffRoleLabels: Record<string, string> = {
  team_doctor: "Team Doctor",
  physio: "Physio",
  mechanic: "Mechanic",
};

const raceAssetKeys = Object.keys(assetLabels) as RacePrepAssetKey[];

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const fullMonthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstNonEmptyRecord(...values: unknown[]): JsonRecord {
  for (const value of values) {
    const record = asRecord(value);

    if (Object.keys(record).length > 0) {
      return record;
    }
  }

  return {};
}

function toArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getText(obj: unknown, key: string) {
  return String(asRecord(obj)[key] ?? "");
}

function getNumber(obj: unknown, key: string) {
  const n = Number(asRecord(obj)[key] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: unknown) {
  const n = Number(value ?? 0);
  return `$${n.toLocaleString()}`;
}

function normalizeNumericValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function getPlannerQualityTierLabel(value: unknown): string {
  const score = normalizeNumericValue(value, 0);

  if (score >= 85) return "Elite";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Solid";
  if (score > 0) return "Basic";

  return "Planning quality pending";
}

async function fetchRiderRaceSharpnessForClub(
  clubId: UUID,
): Promise<RiderRaceSharpnessUiRow[]> {
  const { data, error } = await supabase.rpc("get_rider_race_sharpness_ui_v1", {
    p_club_id: clubId,
    p_rider_id: null,
  });

  if (error) throw error;

  return (data ?? []) as RiderRaceSharpnessUiRow[];
}

function parseDateParts(value: unknown) {
  if (!value) return null;

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!year || !month || !day) return null;

  return {
    year,
    month,
    day,
    season: year - 1999,
  };
}

function parseGameDateTime(value: unknown): number | null {
  const parts = parseDateParts(value);
  if (!parts) return null;

  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

const GAME_DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const FINISHED_RACE_VISIBILITY_DAYS = 3;

function getAcceptedRaceLifecycleStatus(
  row: AcceptedRacePreparationRow,
): string {
  return String(asRecord(asRecord(row).race).status ?? "")
    .trim()
    .toLowerCase();
}

function shouldShowAcceptedRacePreparation(
  row: AcceptedRacePreparationRow,
  currentGameDate?: string,
): boolean {
  const raceRecord = asRecord(asRecord(row).race);
  const raceMetadata = asRecord(raceRecord.metadata);
  const raceStatus = getAcceptedRaceLifecycleStatus(row);

  /*
   * Historical chains closed by the forward-only repair are not actionable
   * preparation targets and should disappear immediately.
   */
  if (raceMetadata.forward_only_terminal_closure === true) {
    return false;
  }

  /*
   * A cancelled race cannot be prepared anymore. Do not let an old submitted
   * race_preparations row keep it inside Accepted Races.
   */
  if (
    raceStatus === "cancelled" ||
    raceStatus === "canceled" ||
    raceStatus === "weather_cancelled"
  ) {
    return false;
  }

  if (raceStatus === "archived") {
    return false;
  }

  if (raceStatus !== "completed") {
    return true;
  }

  /*
   * Finished races remain visible for three in-game days so the manager has
   * time to review the final state, then they leave Race Preparation.
   */
  const currentTime = parseGameDateTime(currentGameDate);
  const endTime = parseGameDateTime(
    raceRecord.end_date ?? raceRecord.start_date,
  );

  if (currentTime === null || endTime === null) {
    return true;
  }

  return (
    currentTime - endTime <=
    FINISHED_RACE_VISIBILITY_DAYS * GAME_DAY_MILLISECONDS
  );
}

function filterAcceptedRacePreparations(
  rows: AcceptedRacePreparationRow[],
  currentGameDate?: string,
): AcceptedRacePreparationRow[] {
  return rows.filter((row) =>
    shouldShowAcceptedRacePreparation(row, currentGameDate),
  );
}

function formatGameDate(value: unknown) {
  const parts = parseDateParts(value);
  if (!parts) return "—";

  return `S${parts.season} · ${monthLabels[parts.month - 1]} ${String(
    parts.day,
  ).padStart(2, "0")}`;
}

function formatFullGameDate(value: unknown) {
  const parts = parseDateParts(value);
  if (!parts) return "—";

  return `Season ${parts.season} - ${
    fullMonthLabels[parts.month - 1]
  } ${String(parts.day).padStart(2, "0")}`;
}

function formatFullStageDateTime(stage: JsonRecord) {
  const dateLabel = formatFullGameDate(stage.stage_date);
  const timeLabel = getStageStartTime(stage);

  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
}

function formatCompactStageDateTime(stage: JsonRecord) {
  const parts = parseDateParts(stage.stage_date);
  const timeLabel = getStageStartTime(stage);

  if (!parts) return timeLabel ? `— · ${timeLabel}` : "—";

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  const weekday = date.toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });

  const monthLabel = monthLabels[parts.month - 1] ?? `M${parts.month}`;

  const label = `S${parts.season} · ${weekday} · ${monthLabel} ${String(
    parts.day,
  ).padStart(2, "0")}`;

  return timeLabel ? `${label} · ${timeLabel}` : label;
}

function formatGameDateRange(start: unknown, end: unknown) {
  const startParts = parseDateParts(start);
  const endParts = parseDateParts(end);

  if (!startParts && !endParts) return "—";
  if (startParts && !endParts) return formatGameDate(start);
  if (!startParts && endParts) return formatGameDate(end);

  if (
    startParts!.season === endParts!.season &&
    startParts!.month === endParts!.month
  ) {
    return `S${startParts!.season} · ${monthLabels[startParts!.month - 1]} ${String(
      startParts!.day,
    ).padStart(2, "0")} – ${String(endParts!.day).padStart(2, "0")}`;
  }

  if (startParts!.season === endParts!.season) {
    return `S${startParts!.season} · ${
      monthLabels[startParts!.month - 1]
    } ${String(startParts!.day).padStart(2, "0")} – ${
      monthLabels[endParts!.month - 1]
    } ${String(endParts!.day).padStart(2, "0")}`;
  }

  return `${formatGameDate(start)} – ${formatGameDate(end)}`;
}

function formatBlockedResourceReason(
  blocked?: BlockedRacePreparationResource | null,
): string | null {
  if (!blocked) return null;

  const raceName = blocked.blocking_race_name || "another race";
  const range = formatGameDateRange(
    blocked.blocking_start_date,
    blocked.blocking_end_date,
  );

  return range && range !== "—"
    ? `Already assigned to ${raceName} (${range})`
    : `Already assigned to ${raceName}`;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function normalizeRacePreparationTab(value: string | null): RacePreparationTab {
  switch (value) {
    case "racePlan":
    case "racePackage":
      return "racePackage";
    case "stagePlans":
      return "stagePlans";
    case "acceptedRaces":
      return "acceptedRaces";
    default:
      return "acceptedRaces";
  }
}

function getRacePreparationTabForTutorialStepKey(
  stepKey?: string | null,
): RacePreparationTab {
  switch (stepKey) {
    case "race-preparation-race-plan":
      return "racePackage";
    case "race-preparation-stage-plans":
      return "stagePlans";
    case "race-preparation-accepted-races":
    default:
      return "acceptedRaces";
  }
}

function buildSelectedRacePlanRiders(
  selectedRiderIds: UUID[],
  selectableData: RacePreparationSelectableData | null,
): JsonRecord[] {
  if (!selectableData || selectedRiderIds.length === 0) return [];

  const selectedIdSet = new Set(selectedRiderIds);

  return selectableData.riders
    .filter((option) => selectedIdSet.has(option.rider_id))
    .map((option) => {
      const rider = asRecord(option.rider);

      return {
        ...rider,
        id: option.rider_id,
        rider_id: option.rider_id,
        club_rider_id: option.club_rider_id,
        full_name: getRiderName(option.rider),
        role_label:
          option.assigned_role ??
          rider.role_label ??
          rider.specialty ??
          "Rider",
      };
    });
}

function normalizeCountryCode(code?: string | null): string | null {
  if (!code) return null;

  const normalized = code.trim().toUpperCase();

  if (normalized === "UK") return "GB";
  if (!/^[A-Z]{2}$/.test(normalized)) return null;

  return normalized;
}

function getFlagImageUrl(code?: string | null): string | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;

  return `https://flagcdn.com/w40/${normalized.toLowerCase()}.png`;
}

function CountryFlag({ code }: { code?: string | null }) {
  const flagUrl = getFlagImageUrl(code);
  const normalized = normalizeCountryCode(code);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [normalized]);

  if (!flagUrl || !normalized || hasError) {
    return (
      <span
        className="inline-block h-4 w-6 shrink-0 rounded-sm border border-slate-200 bg-slate-100 align-middle"
        title={normalized ?? "Unknown country"}
        aria-label={normalized ?? "Unknown country"}
      />
    );
  }

  return (
    <img
      src={flagUrl}
      alt={normalized}
      title={normalized}
      className="inline-block h-4 w-6 shrink-0 rounded-sm border border-slate-200 object-cover align-middle"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

const riderSkillLabels: Record<string, string> = {
  flat: "Flat",
  hill: "Hill",
  hills: "Hills",
  mountain: "Mountain",
  climbing: "Climbing",
  sprint: "Sprint",
  time_trial: "Time Trial",
  timetrial: "Time Trial",
  cobble: "Cobble",
  cobbles: "Cobbles",
  endurance: "Endurance",
  stamina: "Stamina",
  recovery: "Recovery",
  acceleration: "Acceleration",
  descending: "Descending",
  technique: "Technique",
  teamwork: "Teamwork",
  race_intelligence: "Race IQ",
  intelligence: "Race IQ",
};

const preferredRiderSkillKeys = [
  "mountain",
  "climbing",
  "hill",
  "hills",
  "flat",
  "sprint",
  "time_trial",
  "timetrial",
  "cobble",
  "cobbles",
  "endurance",
  "stamina",
  "recovery",
  "acceleration",
  "descending",
  "technique",
  "teamwork",
  "race_intelligence",
  "intelligence",
];

function getRiderCountryCode(rider: JsonRecord): string | null {
  return (
    getOptionalText(rider, "country_code") ??
    getOptionalText(rider, "nationality_code") ??
    getOptionalText(rider, "country_iso2") ??
    getOptionalText(rider, "nation_code") ??
    null
  );
}

function getOptionalText(obj: unknown, key: string): string | null {
  const value = asRecord(obj)[key];

  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
}

function getRiderAgeLabel(
  rider: JsonRecord,
  currentGameDate?: string,
): string | null {
  const directAge = Number(
    rider.age ?? rider.rider_age ?? rider.current_age ?? 0,
  );

  if (Number.isFinite(directAge) && directAge > 0) {
    return `${Math.floor(directAge)} years`;
  }

  const birthDate = String(
    rider.date_of_birth ?? rider.birth_date ?? rider.dob ?? "",
  );

  const birthParts = parseDateParts(birthDate);
  const currentParts = parseDateParts(currentGameDate);

  if (!birthParts || !currentParts) {
    return null;
  }

  let age = currentParts.year - birthParts.year;

  if (
    currentParts.month < birthParts.month ||
    (currentParts.month === birthParts.month &&
      currentParts.day < birthParts.day)
  ) {
    age -= 1;
  }

  return age > 0 ? `${age} years` : null;
}

function getTopRiderSkills(rider: JsonRecord): {
  key: string;
  label: string;
  value: number;
}[] {
  const rows = preferredRiderSkillKeys.flatMap((key) => {
    const value = Number(rider[key] ?? rider[`${key}_skill`] ?? NaN);

    if (!Number.isFinite(value)) {
      return [];
    }

    return [
      {
        key,
        label: riderSkillLabels[key] ?? titleFromSnake(key),
        value: Math.round(value),
      },
    ];
  });

  return rows.sort((a, b) => b.value - a.value).slice(0, 6);
}

function getRaceRouteLine(race: unknown, stageCount?: number): string {
  const record = asRecord(race);

  const startCity = String(
    record.start_city ??
      record.host_city ??
      record.city ??
      record.location_city ??
      "",
  ).trim();

  const finishCity = String(
    record.finish_city ??
      record.end_city ??
      record.host_city ??
      record.city ??
      record.location_city ??
      "",
  ).trim();

  const route =
    startCity && finishCity && startCity !== finishCity
      ? `${startCity} → ${finishCity}`
      : startCity || finishCity || "Route details pending";

  const stages = Number(stageCount ?? record.stage_count ?? 0);

  if (stages > 1) {
    return `${route} · ${stages} stages`;
  }

  return `${route} · One Day Race`;
}

function getWeatherCancellationStatusFromRace(race: unknown): string | null {
  const metadata = asRecord(asRecord(race).metadata);
  const value = metadata.weather_cancellation_status;

  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isRaceAllWeatherCanceledInPreparation(race: unknown): boolean {
  const metadata = asRecord(asRecord(race).metadata);
  const explicitValue = metadata.weather_all_stages_cancelled;

  if (typeof explicitValue === "boolean") return explicitValue;
  if (typeof explicitValue === "string") {
    return explicitValue.toLowerCase() === "true";
  }

  return (
    getWeatherCancellationStatusFromRace(race) ===
    "all_stages_weather_cancelled"
  );
}

function isRacePartlyWeatherCanceledInPreparation(race: unknown): boolean {
  return (
    getWeatherCancellationStatusFromRace(race) === "partly_weather_cancelled"
  );
}

function getWeatherCancellationDisplayStatusForPreparation(
  race: unknown,
): string | null {
  if (isRaceAllWeatherCanceledInPreparation(race)) return "Race canceled";
  if (isRacePartlyWeatherCanceledInPreparation(race)) return "Weather affected";

  return null;
}

function isPreparationStageWeatherCanceled(stage: unknown): boolean {
  return asRecord(stage).weather_cancelled === true;
}

function getPreparationWeatherCancellationReasonLabel(
  reason?: unknown,
): string {
  switch (String(reason ?? "")) {
    case "snow":
      return "Snow";
    case "temperature_below_5c":
      return "Average temperature below 5°C";
    default:
      return reason ? titleFromSnake(String(reason)) : "Unsafe weather";
  }
}

function getPreparationStageWeatherCancellationReason(
  stage: unknown,
): string | null {
  const reason = asRecord(stage).weather_cancellation_reason;

  return reason ? String(reason) : null;
}

function getPreparationStageWeatherRiskReason(stage: unknown): string | null {
  const record = asRecord(stage);
  const weather = firstNonEmptyRecord(
    record.weather_snapshot,
    record.weather_json,
    record.weather_snapshot_json,
    asRecord(record.metadata).weather_snapshot,
    asRecord(record.metadata).weather,
  );

  if (Object.keys(weather).length === 0) return null;

  const conditionText = String(
    weather.condition ??
      weather.condition_label ??
      weather.label ??
      weather.name ??
      weather.summary ??
      "",
  )
    .trim()
    .toLowerCase();

  const avgTemp = normalizeNumericValue(
    weather.avg_temp_c ??
      weather.average_temp_c ??
      weather.temperature_c ??
      weather.temp_c,
    Number.NaN,
  );

  if (conditionText === "snow" || conditionText.includes("snow")) {
    return "snow";
  }

  if (Number.isFinite(avgTemp) && avgTemp < 5) {
    return "temperature_below_5c";
  }

  return null;
}

function WeatherCancellationPreparationNotice({
  race,
  stage,
}: {
  race?: unknown;
  stage?: unknown;
}) {
  const raceStatus = getWeatherCancellationStatusFromRace(race);
  const stageCanceled = isPreparationStageWeatherCanceled(stage);
  const shouldRender =
    stageCanceled ||
    raceStatus === "all_stages_weather_cancelled" ||
    raceStatus === "partly_weather_cancelled";

  if (!shouldRender) return null;

  const title = stageCanceled
    ? "Stage canceled due to weather"
    : raceStatus === "all_stages_weather_cancelled"
      ? "Race canceled due to weather"
      : "Race partly canceled by weather";

  const reason = getPreparationWeatherCancellationReasonLabel(
    getPreparationStageWeatherCancellationReason(stage),
  );

  const body = stageCanceled
    ? `This stage was canceled by the race engine (${reason}). Stage Plans are locked because no result, points, prize money, fatigue or replay will be generated for this stage.`
    : raceStatus === "all_stages_weather_cancelled"
      ? "This race was canceled due to weather. Race preparation is no longer needed for this race."
      : "At least one stage in this race was canceled due to weather. Remaining uncanceled stages can continue normally.";

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 leading-6">{body}</div>
    </div>
  );
}

function WeatherCancellationRiskPreparationNotice({
  stage,
}: {
  stage: unknown;
}) {
  if (isPreparationStageWeatherCanceled(stage)) return null;

  const riskReason = getPreparationStageWeatherRiskReason(stage);
  if (!riskReason) return null;

  return (
    <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-800">
      <div className="font-semibold">
        Weather cancellation likely:{" "}
        {getPreparationWeatherCancellationReasonLabel(riskReason)}
      </div>
      <div>
        Current forecast is below the safety threshold. Final decision 24
        in-game hours before start.
      </div>
    </div>
  );
}

function getRaceLifecycleLabel(status?: string | null) {
  switch (status) {
    case "completed":
      return "Race finished";
    case "active":
      return "Race active";
    case "scheduled":
      return "Scheduled";
    case "cancelled":
      return "Canceled";
    default:
      return status ? titleFromSnake(status) : "Scheduled";
  }
}

function statusClass(status?: string) {
  switch (status) {
    case "weather_cancelled":
    case "cancelled":
      return "bg-red-100 text-red-800 ring-1 ring-red-200";
    case "completed":
    case "archived":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
    case "race_plan_open":
    case "draft":
      return "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200";
    case "submitted":
    case "accepted":
      return "bg-emerald-100 text-emerald-800";
    case "locked":
      return "bg-slate-200 text-slate-800";
    case "not_created":
      return "bg-slate-100 text-slate-700";
    case "deadline_reached":
    case "missed_startlist":
    case "declined":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getRacePlanStatusLabel(status?: string) {
  switch (status) {
    case "weather_cancelled":
    case "cancelled":
      return "Race canceled";
    case "completed":
    case "archived":
      return "Race Finished";
    case "missed_startlist":
      return "Not Participating";
    case "draft":
    case "race_plan_open":
      return "Race Plan Open";
    case "submitted":
      return "Race Plan Submitted";
    case "locked":
    case "sent_to_engine":
      return "Race Active";
    case "deadline_reached":
      return "Rider Deadline Reached";
    case "not_created":
      return "Race Plan Not Open";
    default:
      return status ? titleFromSnake(status) : "Race Plan Not Open";
  }
}

function getRacePlanUiStatus({
  raceStatus,
  prepStatus,
  isPackageTooEarly,
  isPackageDeadlinePassed,
  packageSubmitted,
}: {
  raceStatus: string;
  prepStatus: string;
  isPackageTooEarly: boolean;
  isPackageDeadlinePassed: boolean;
  packageSubmitted: boolean;
}) {
  if (raceStatus === "missed_startlist" || prepStatus === "missed_startlist") {
    return "missed_startlist";
  }

  if (packageSubmitted) {
    return "submitted";
  }

  if (isPackageDeadlinePassed) {
    return "deadline_reached";
  }

  if (isPackageTooEarly) {
    return "not_created";
  }

  if (
    raceStatus === "draft" ||
    prepStatus === "draft" ||
    raceStatus === "not_created"
  ) {
    return "race_plan_open";
  }

  return raceStatus || prepStatus || "race_plan_open";
}

function titleFromSnake(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeAvailabilityStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function getRiderAvailabilityStatus(rider: JsonRecord): string {
  return normalizeAvailabilityStatus(
    rider.availability_status ??
      rider.medical_status ??
      rider.health_status ??
      rider.fitness_status ??
      "fit",
  );
}

function isRiderMedicallyUnavailable(rider: JsonRecord): boolean {
  const availabilityStatus = getRiderAvailabilityStatus(rider);

  if (
    rider.is_injured === true ||
    rider.injured === true ||
    rider.has_injury === true
  ) {
    return true;
  }

  if (
    availabilityStatus === "" ||
    availabilityStatus === "fit" ||
    availabilityStatus === "available" ||
    availabilityStatus === "not_fully_fit" ||
    availabilityStatus === "partly_fit" ||
    availabilityStatus === "tired" ||
    availabilityStatus === "fatigued"
  ) {
    return false;
  }

  return [
    "injured",
    "injury",
    "sick",
    "ill",
    "illness",
    "cold",
    "flu",
    "unavailable",
    "not_available",
    "medical_unavailable",
    "medical_blocked",
    "recovering_from_injury",
    "rehab",
  ].includes(availabilityStatus);
}

function formatAvailabilityStatusLabel(value: string): string {
  if (!value || value === "fit") return "Fit";
  if (value === "not_fully_fit") return "Not fully fit";
  return titleFromSnake(value);
}

function formatRiderMedicalUnavailableReason(rider: JsonRecord): string | null {
  if (!isRiderMedicallyUnavailable(rider)) return null;

  const status = getRiderAvailabilityStatus(rider);
  const label = formatAvailabilityStatusLabel(status);

  return `${label}: cannot be selected for this race.`;
}

function isRacePackageSubmitted(status?: string | null) {
  return (
    status === "submitted" || status === "locked" || status === "sent_to_engine"
  );
}

function getAcceptedRacePreparationState(
  row: AcceptedRacePreparationRow,
  currentGameDate?: string,
) {
  const rowRecord = asRecord(row);
  const raceRecord = asRecord(rowRecord.race);
  const preparationRecord = asRecord(rowRecord.preparation);
  const entryRulesRecord = asRecord(rowRecord.entry_rules);

  const raceStatus = String(raceRecord.status ?? "").toLowerCase();

  const packageStatus = String(
    rowRecord.race_package_status ??
      rowRecord.preparation_status ??
      preparationRecord.status ??
      "",
  ).toLowerCase();

  const startlistStatus = String(
    rowRecord.startlist_status ?? preparationRecord.startlist_status ?? "",
  ).toLowerCase();

  const entryStatus = String(
    rowRecord.status ??
      rowRecord.entry_status ??
      asRecord(rowRecord.entry).status ??
      "",
  ).toLowerCase();

  const preparationMetadata = asRecord(preparationRecord.metadata);
  const missedStartlist =
    entryStatus === "missed_startlist" ||
    packageStatus === "missed_startlist" ||
    startlistStatus === "missed_startlist" ||
    preparationMetadata.missed_startlist === true ||
    String(preparationMetadata.display_status ?? "").toLowerCase() ===
      "missed_startlist";

  /*
   * Important:
   * The accepted-races card must prefer the repaired race_preparations
   * deadline over the default race-start-minus-N fallback. Repaired rows can
   * have a temporary rider_submission_deadline_on that is later than the
   * original race_entry_rules deadline.
   */
  const setupWindowOpensOn =
    rowRecord.setup_window_opens_on ??
    preparationRecord.setup_window_opens_on ??
    entryRulesRecord.setup_window_opens_on;

  const riderSubmissionDeadlineOn =
    rowRecord.rider_submission_deadline_on ??
    preparationRecord.rider_submission_deadline_on ??
    entryRulesRecord.rider_submission_deadline_on ??
    entryRulesRecord.rider_submission_deadline;

  const racePreparationId =
    rowRecord.race_preparation_id ?? preparationRecord.id ?? null;

  const currentTime = parseGameDateTime(currentGameDate);
  const opensTime = parseGameDateTime(setupWindowOpensOn);
  const deadlineTime = parseGameDateTime(riderSubmissionDeadlineOn);

  const isDeadlinePassed =
    currentTime !== null && deadlineTime !== null && currentTime > deadlineTime;

  const isRacePlanOpenByDate =
    currentTime !== null &&
    opensTime !== null &&
    deadlineTime !== null &&
    currentTime >= opensTime &&
    currentTime <= deadlineTime;

  const isDraftRacePreparation =
    Boolean(racePreparationId) &&
    (packageStatus === "draft" ||
      startlistStatus === "draft" ||
      packageStatus === "race_plan_open");

  if (isRaceAllWeatherCanceledInPreparation(raceRecord)) {
    return {
      label: "Race canceled",
      className: "bg-red-100 text-red-800 ring-1 ring-red-200",
      racePlanEnabled: false,
      stagePlansEnabled: false,
      missedStartlist: false,
    };
  }

  if (
    raceStatus === "cancelled" ||
    raceStatus === "canceled" ||
    raceStatus === "weather_cancelled"
  ) {
    return {
      label: "Race canceled",
      className: "bg-red-100 text-red-800 ring-1 ring-red-200",
      racePlanEnabled: false,
      stagePlansEnabled: false,
      missedStartlist: false,
    };
  }

  if (missedStartlist) {
    return {
      label: "Not Participating",
      className: "bg-red-100 text-red-800 ring-1 ring-red-200",
      racePlanEnabled: false,
      stagePlansEnabled: false,
      missedStartlist: true,
    };
  }

  if (raceStatus === "completed" || raceStatus === "archived") {
    return {
      label: "Race Finished",
      className: "bg-slate-100 text-slate-700",
      racePlanEnabled: false,
      stagePlansEnabled: false,
      missedStartlist: false,
    };
  }

  if (raceStatus === "active") {
    return {
      label: "Race Active",
      className: "bg-emerald-100 text-emerald-700",
      racePlanEnabled: false,
      stagePlansEnabled: isRacePackageSubmitted(packageStatus),
    };
  }

  if (packageStatus === "submitted") {
    return {
      label: "Stage Plans Open",
      className: "bg-blue-100 text-blue-700",
      racePlanEnabled: false,
      stagePlansEnabled: true,
    };
  }

  if (packageStatus === "locked" || packageStatus === "sent_to_engine") {
    return {
      label: "All Set",
      className: "bg-emerald-100 text-emerald-700",
      racePlanEnabled: false,
      stagePlansEnabled: true,
    };
  }

  if (isDraftRacePreparation || packageStatus === "draft") {
    if (isDeadlinePassed) {
      return {
        label: "Rider Deadline Reached",
        className: "bg-red-100 text-red-800",
        racePlanEnabled: false,
        stagePlansEnabled: false,
      };
    }

    return {
      label: "Race Plan Open",
      className: statusClass("race_plan_open"),
      racePlanEnabled: true,
      stagePlansEnabled: false,
    };
  }

  if (isRacePlanOpenByDate) {
    return {
      label: "Race Plan Open",
      className: statusClass("race_plan_open"),
      racePlanEnabled: true,
      stagePlansEnabled: false,
    };
  }

  if (currentTime !== null && opensTime !== null && currentTime < opensTime) {
    return {
      label: "Race Plan Not Open",
      className: "bg-slate-100 text-slate-700",
      racePlanEnabled: false,
      stagePlansEnabled: false,
    };
  }

  if (isDeadlinePassed) {
    return {
      label: "Rider Deadline Reached",
      className: "bg-red-100 text-red-800",
      racePlanEnabled: false,
      stagePlansEnabled: false,
    };
  }

  return {
    label: "Scheduled",
    className: "bg-slate-100 text-slate-700",
    racePlanEnabled: false,
    stagePlansEnabled: false,
  };
}

export default function RacePreparationPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<RacePreparationTab>(() =>
    normalizeRacePreparationTab(searchParams.get("tab")),
  );

  const [clubId, setClubId] = useState<UUID | null>(null);
  const [selectedRaceId, setSelectedRaceId] = useState<UUID | null>(null);
  const [acceptedRaces, setAcceptedRaces] = useState<
    AcceptedRacePreparationRow[]
  >([]);
  const [target, setTarget] = useState<RacePreparationTarget | null>(null);
  const [selectableData, setSelectableData] =
    useState<RacePreparationSelectableData | null>(null);
  const [riderRaceSharpnessById, setRiderRaceSharpnessById] = useState<
    Map<UUID, RiderRaceSharpnessUiRow>
  >(() => new Map());
  const [squadOptions, setSquadOptions] = useState<
    RacePreparationSquadOption[]
  >([]);
  const [participatingClubId, setParticipatingClubId] = useState<UUID | null>(
    null,
  );
  const [pendingParticipatingClubId, setPendingParticipatingClubId] =
    useState<UUID | null>(null);

  const [selectedRiderIds, setSelectedRiderIds] = useState<UUID[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<UUID[]>([]);
  const [tacticalPlannerChoice, setTacticalPlannerChoice] =
    useState<RacePreparationTacticalPlannerChoice>("sport_director");
  const [selectedU23HeadCoachId, setSelectedU23HeadCoachId] =
    useState<UUID | null>(null);
  const [u23AutomationEnabled, setU23AutomationEnabled] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<
    Record<RacePrepAssetKey, UUID | "">
  >(() => createEmptySelectedAssets());
  const [quote, setQuote] = useState<RacePreparationQuote | null>(null);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [racePreviewId, setRacePreviewId] = useState<UUID | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [tutorialLoading, setTutorialLoading] = useState(true);
  const [tutorialMode, setTutorialMode] = useState<
    "closed" | "invite" | "steps"
  >("closed");
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);

  useEffect(() => {
    let alive = true;

    async function loadRacePreparationTutorialProgress() {
      setTutorialLoading(true);

      const autoStartTutorial =
        window.sessionStorage.getItem("ppm:auto-start-tutorial") ===
        "race-preparation";

      if (autoStartTutorial) {
        window.sessionStorage.removeItem("ppm:auto-start-tutorial");

        const firstStep = racePreparationTutorialSteps[0];

        await saveTutorialProgress(
          "race-preparation",
          "started",
          firstStep?.key ?? null,
        );

        if (!alive) return;

        setActiveTab("acceptedRaces");
        setTutorialStepIndex(0);
        setTutorialMode("steps");
        setTutorialLoading(false);
        return;
      }

      const progress = await getTutorialProgress("race-preparation");

      if (!alive) return;

      if (progress?.status === "started") {
        const savedStepIndex = racePreparationTutorialSteps.findIndex(
          (step) => step.key === progress.last_step_key,
        );

        const nextStepIndex = savedStepIndex >= 0 ? savedStepIndex : 0;
        const nextStep = racePreparationTutorialSteps[nextStepIndex];

        setActiveTab(getRacePreparationTabForTutorialStepKey(nextStep?.key));
        setTutorialStepIndex(nextStepIndex);
        setTutorialMode("steps");
      } else {
        setTutorialMode("closed");
      }

      setTutorialLoading(false);
    }

    void loadRacePreparationTutorialProgress();

    return () => {
      alive = false;
    };
  }, []);

  const race = target?.race ?? null;
  const entryRules = target?.entry_rules ?? null;
  const preparation = target?.preparation ?? null;
  const raceId = selectedRaceId ?? (getText(race, "id") || null);
  const raceStatus = target?.race_package_status ?? "not_created";
  const prepStatus = getText(preparation, "status");
  const cost = asRecord(
    quote?.cost_breakdown ?? preparation?.cost_breakdown_json ?? {},
  );

  const travelTickets = Number(cost.policy_travel_cost_cash ?? 0);

  const accommodation =
    Number(cost.policy_accommodation_cost_cash ?? 0) +
    Number(cost.policy_staff_accommodation_cost_cash ?? 0);

  const assetTransport = Number(cost.asset_transport_cost_cash ?? 0);

  const logistics = Number(
    cost.policy_logistics_cost_cash ?? cost.operations_cost_cash ?? 0,
  );

  const total = Number(cost.total_cost_cash ?? 0);

  const validationSnapshot = asRecord(preparation?.validation_snapshot_json);
  const savedQuote = asRecord(validationSnapshot.quote);

  const liveBonusPreview = asRecord(quote?.bonus_preview);
  const savedBonusPreviewFromRoot = asRecord(validationSnapshot.bonus_preview);
  const savedBonusPreviewFromQuote = asRecord(savedQuote.bonus_preview);

  const bonusPreview = firstNonEmptyRecord(
    liveBonusPreview,
    savedBonusPreviewFromRoot,
    savedBonusPreviewFromQuote,
  );

  const standardizedBonus = firstNonEmptyRecord(
    quote?.standardized_bonus,
    liveBonusPreview.standardized_bonus,
    validationSnapshot.standardized_bonus,
    savedQuote.standardized_bonus,
    bonusPreview.groups ? bonusPreview : {},
  );

  const blockedResources = useMemo(
    () =>
      toArray<BlockedRacePreparationResource>(
        asRecord(selectableData).blockedResources,
      ),
    [selectableData],
  );

  const blockedRiderMap = useMemo(() => {
    return new Map(
      blockedResources
        .filter((row) => row.resource_type === "rider")
        .map((row) => [row.resource_id, row]),
    );
  }, [blockedResources]);

  const blockedStaffMap = useMemo(() => {
    return new Map(
      blockedResources
        .filter((row) => row.resource_type === "staff")
        .map((row) => [row.resource_id, row]),
    );
  }, [blockedResources]);

  const blockedAssetMap = useMemo(() => {
    return new Map(
      blockedResources
        .filter((row) => row.resource_type === "asset")
        .map((row) => [row.resource_id, row]),
    );
  }, [blockedResources]);

  const blockedRiderIds = useMemo(
    () => new Set(blockedRiderMap.keys()),
    [blockedRiderMap],
  );

  const medicallyUnavailableRiderMap = useMemo(() => {
    return new Map(
      (selectableData?.riders ?? []).flatMap((option) => {
        const reason = formatRiderMedicalUnavailableReason(
          asRecord(option.rider),
        );

        return reason ? [[option.rider_id, reason] as const] : [];
      }),
    );
  }, [selectableData?.riders]);

  const medicallyUnavailableRiderIds = useMemo(
    () => new Set(medicallyUnavailableRiderMap.keys()),
    [medicallyUnavailableRiderMap],
  );

  const blockedStaffIds = useMemo(
    () => new Set(blockedStaffMap.keys()),
    [blockedStaffMap],
  );

  const blockedAssetIds = useMemo(
    () => new Set(blockedAssetMap.keys()),
    [blockedAssetMap],
  );

  const cleanSelectedRiderIds = useMemo(() => {
    return selectedRiderIds.filter(
      (id) => !blockedRiderIds.has(id) && !medicallyUnavailableRiderIds.has(id),
    );
  }, [blockedRiderIds, medicallyUnavailableRiderIds, selectedRiderIds]);

  const cleanSelectedStaffIds = useMemo(() => {
    return selectedStaffIds.filter((id) => !blockedStaffIds.has(id));
  }, [blockedStaffIds, selectedStaffIds]);

  const cleanSelectedAssets = useMemo(() => {
    const next = { ...selectedAssets };

    raceAssetKeys.forEach((assetKey) => {
      const assetId = next[assetKey];

      if (assetId && blockedAssetIds.has(assetId)) {
        next[assetKey] = "";
      }
    });

    return next;
  }, [blockedAssetIds, selectedAssets]);

  const selectedRacePlanRiders = useMemo(() => {
    return buildSelectedRacePlanRiders(
      cleanSelectedRiderIds,
      selectableData,
    ).map((rider) => {
      const riderId = String(rider.rider_id ?? rider.id ?? "");
      const raceSharpness = riderRaceSharpnessById.get(riderId);

      if (!raceSharpness) return rider;

      return {
        ...rider,
        race_sharpness: raceSharpness.race_sharpness,
        race_sharpness_percent: raceSharpness.race_sharpness_percent,
        race_sharpness_label: raceSharpness.race_sharpness_label,
        race_sharpness_status: raceSharpness.race_sharpness_status,
        race_sharpness_message: raceSharpness.race_sharpness_message,
        race_days_last_14: raceSharpness.race_days_last_14,
        overload_warning: raceSharpness.overload_warning,
      };
    });
  }, [cleanSelectedRiderIds, riderRaceSharpnessById, selectableData]);

  const selectedStaffByRole = useMemo(() => {
    const result: Record<string, UUID> = {};

    (selectableData?.staff ?? []).forEach((staff) => {
      if (cleanSelectedStaffIds.includes(staff.id)) {
        result[staff.role_type] = staff.id;
      }
    });

    return result;
  }, [cleanSelectedStaffIds, selectableData?.staff]);

  const packageSubmitted =
    raceStatus === "submitted" ||
    raceStatus === "locked" ||
    raceStatus === "sent_to_engine" ||
    prepStatus === "submitted" ||
    prepStatus === "locked" ||
    prepStatus === "sent_to_engine";

  const visibleRiderOptions = useMemo(() => {
    const riders = selectableData?.riders ?? [];

    if (!packageSubmitted) {
      return riders;
    }

    const selectedIdSet = new Set(selectedRiderIds);

    return riders.filter((option) => selectedIdSet.has(option.rider_id));
  }, [packageSubmitted, selectableData?.riders, selectedRiderIds]);

  useEffect(() => {
    let mounted = true;
    const sharpnessClubId = participatingClubId ?? clubId;

    if (!sharpnessClubId) {
      setRiderRaceSharpnessById(new Map());
      return () => {
        mounted = false;
      };
    }

    fetchRiderRaceSharpnessForClub(sharpnessClubId)
      .then((rows) => {
        if (!mounted) return;
        setRiderRaceSharpnessById(
          new Map(rows.map((row) => [row.rider_id, row])),
        );
      })
      .catch((error) => {
        console.error("Failed to load rider race sharpness", error);
        if (!mounted) return;
        setRiderRaceSharpnessById(new Map());
      });

    return () => {
      mounted = false;
    };
  }, [clubId, participatingClubId]);

  const selectedSquadOption = useMemo(() => {
    return (
      squadOptions.find((option) => option.id === participatingClubId) ?? null
    );
  }, [participatingClubId, squadOptions]);

  const isDevelopingTeamSelected =
    selectedSquadOption?.club_type === "developing" &&
    selectedSquadOption.parent_club_id === clubId;

  const effectiveTacticalPlannerChoice: RacePreparationTacticalPlannerChoice =
    isDevelopingTeamSelected ? tacticalPlannerChoice : "sport_director";

  const selectedU23HeadCoach = useMemo(() => {
    if (!selectedU23HeadCoachId) return null;

    return (
      (selectableData?.staff ?? []).find(
        (staff) =>
          staff.id === selectedU23HeadCoachId &&
          staff.role_type === "u23_head_coach",
      ) ?? null
    );
  }, [selectableData?.staff, selectedU23HeadCoachId]);

  const raceStaffIdsForPayload = useMemo(() => {
    const staffById = new Map(
      (selectableData?.staff ?? []).map((staff) => [staff.id, staff]),
    );

    return cleanSelectedStaffIds.filter((staffId) => {
      const roleType = staffById.get(staffId)?.role_type;

      if (roleType === "u23_head_coach") {
        return false;
      }

      if (
        isDevelopingTeamSelected &&
        effectiveTacticalPlannerChoice === "u23_head_coach" &&
        roleType === "sport_director"
      ) {
        return false;
      }

      return true;
    });
  }, [
    cleanSelectedStaffIds,
    effectiveTacticalPlannerChoice,
    isDevelopingTeamSelected,
    selectableData?.staff,
  ]);

  const pendingSquadOption = useMemo(() => {
    return (
      squadOptions.find((option) => option.id === pendingParticipatingClubId) ??
      null
    );
  }, [pendingParticipatingClubId, squadOptions]);

  const defaultEquipmentSetupId: UUID | null = null;
  const supplyReservations = useMemo(() => ({}), []);

  const payload: RacePreparationPayload | null = useMemo(() => {
    if (!raceId || !clubId) return null;

    const assetAssignments = raceAssetKeys.flatMap((assetKey) => {
      const assetId = cleanSelectedAssets[assetKey];
      if (!assetId) return [];

      return [
        {
          asset_key: getAssetInventoryKey(assetKey),
          asset_slot_key: assetKey,
          asset_id: assetId,
        },
      ];
    });

    return {
      race_id: raceId,
      club_id: clubId,
      participating_club_id: participatingClubId ?? clubId,
      rider_ids: cleanSelectedRiderIds,
      staff_ids: raceStaffIdsForPayload,
      asset_assignments: assetAssignments,
      supply_reservations: supplyReservations,
      default_equipment_setup_id: defaultEquipmentSetupId,
    };
  }, [
    cleanSelectedAssets,
    cleanSelectedRiderIds,
    clubId,
    raceStaffIdsForPayload,
    defaultEquipmentSetupId,
    participatingClubId,
    raceId,
    supplyReservations,
  ]);

  const currentGameDateTime = parseGameDateTime(target?.current_game_date);
  const packageOpensTime = parseGameDateTime(target?.setup_window_opens_on);
  const riderDeadlineTime = parseGameDateTime(
    target?.rider_submission_deadline_on,
  );

  const isPackageWindowOpen =
    currentGameDateTime !== null &&
    packageOpensTime !== null &&
    riderDeadlineTime !== null &&
    currentGameDateTime >= packageOpensTime &&
    currentGameDateTime <= riderDeadlineTime;

  const isPackageTooEarly =
    currentGameDateTime !== null &&
    packageOpensTime !== null &&
    currentGameDateTime < packageOpensTime;

  const isPackageDeadlinePassed =
    currentGameDateTime !== null &&
    riderDeadlineTime !== null &&
    currentGameDateTime > riderDeadlineTime;

  const selectedRaceAllWeatherCanceled =
    isRaceAllWeatherCanceledInPreparation(race);

  const canEdit =
    !selectedRaceAllWeatherCanceled &&
    isPackageWindowOpen &&
    (raceStatus === "not_created" ||
      raceStatus === "draft" ||
      prepStatus === "draft");

  useEffect(() => {
    if (!canEdit) return;

    setSelectedRiderIds((current) => {
      const next = current.filter(
        (id) =>
          !blockedRiderIds.has(id) && !medicallyUnavailableRiderIds.has(id),
      );
      return next.length === current.length ? current : next;
    });

    setSelectedStaffIds((current) => {
      const next = current.filter((id) => !blockedStaffIds.has(id));
      return next.length === current.length ? current : next;
    });

    setSelectedAssets((current) => {
      let changed = false;
      const next = { ...current };

      raceAssetKeys.forEach((assetKey) => {
        const assetId = current[assetKey];
        if (assetId && blockedAssetIds.has(assetId)) {
          next[assetKey] = "";
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [
    blockedAssetIds,
    blockedRiderIds,
    blockedStaffIds,
    canEdit,
    medicallyUnavailableRiderIds,
  ]);

  const selectedRaceLifecycleStatus = getText(race, "status")
    .trim()
    .toLowerCase();

  const selectedRaceCancelled =
    selectedRaceLifecycleStatus === "cancelled" ||
    selectedRaceLifecycleStatus === "canceled" ||
    selectedRaceLifecycleStatus === "weather_cancelled";

  const selectedRaceFinished =
    selectedRaceLifecycleStatus === "completed" ||
    selectedRaceLifecycleStatus === "archived";

  const selectedRaceClosed = selectedRaceCancelled || selectedRaceFinished;

  const stagePlansOpen =
    packageSubmitted &&
    !selectedRaceAllWeatherCanceled &&
    !selectedRaceClosed;

  const racePlanUiStatus =
    selectedRaceAllWeatherCanceled || selectedRaceCancelled
      ? "cancelled"
      : selectedRaceFinished
        ? "completed"
        : getRacePlanUiStatus({
            raceStatus,
            prepStatus,
            isPackageTooEarly,
            isPackageDeadlinePassed,
            packageSubmitted,
          });

  const minRiders = getNumber(entryRules, "min_riders_per_team");
  const maxRiders = getNumber(entryRules, "max_riders_per_team");

  const selectedRiderCount = cleanSelectedRiderIds.length;

  const riderSelectionTooFew = minRiders > 0 && selectedRiderCount < minRiders;

  const riderSelectionTooMany = maxRiders > 0 && selectedRiderCount > maxRiders;

  const riderSelectionValid = !riderSelectionTooFew && !riderSelectionTooMany;

  const tacticalPlannerSelectionValid = isDevelopingTeamSelected
    ? effectiveTacticalPlannerChoice === "u23_head_coach"
      ? Boolean(selectedU23HeadCoachId)
      : Boolean(selectedStaffByRole.sport_director)
    : Boolean(selectedStaffByRole.sport_director);

  /*
   * Missing race staff is an incomplete-plan warning, not a reason to disable
   * Save or Submit. The submit confirmation already allows the manager to
   * continue with missing staff and assets.
   *
   * Keep only one blocking planner case: a Developing Team explicitly set to
   * U23 Head Coach without an actual coach selected, because that automation
   * choice cannot be persisted safely.
   */
  const u23PlannerChoiceIncomplete =
    isDevelopingTeamSelected &&
    effectiveTacticalPlannerChoice === "u23_head_coach" &&
    !selectedU23HeadCoachId;

  const canSaveRacePlan =
    canEdit && !riderSelectionTooMany && !u23PlannerChoiceIncomplete;

  const canSubmitRacePlan =
    canEdit && riderSelectionValid && !u23PlannerChoiceIncomplete;

  const selectedSupportStaffCount = Object.keys(supportStaffRoleLabels).filter(
    (roleType) => Boolean(selectedStaffByRole[roleType]),
  ).length;

  const selectedPlannerCount = tacticalPlannerSelectionValid ? 1 : 0;
  const selectedStaffCount = selectedSupportStaffCount + selectedPlannerCount;
  const maxStaffSlots = Object.keys(staffRoleLabels).length;
  const selectedAssetCount =
    Object.values(cleanSelectedAssets).filter(Boolean).length;
  const maxAssetSlots = raceAssetKeys.length;

  const submitPlanWarnings = [
    !tacticalPlannerSelectionValid
      ? isDevelopingTeamSelected
        ? "Choose either a Sport Director or a U23 Head Coach."
        : "Select a Sport Director."
      : null,
    maxRiders > 0 && selectedRiderCount < maxRiders
      ? `Maximum riders allowed: ${maxRiders}. You selected: ${selectedRiderCount}.`
      : null,
    maxStaffSlots > 0 && selectedStaffCount < maxStaffSlots
      ? `Maximum race staff slots: ${maxStaffSlots}. You selected: ${selectedStaffCount}.`
      : null,
    maxAssetSlots > 0 && selectedAssetCount < maxAssetSlots
      ? `Maximum race asset slots: ${maxAssetSlots}. You selected: ${selectedAssetCount}.`
      : null,
  ].filter(Boolean) as string[];

  const hasSubmitPlanWarnings = submitPlanWarnings.length > 0;

  useEffect(() => {
    if (!payload || !canEdit) return;

    const timer = window.setTimeout(() => {
      setQuoteRefreshing(true);

      quoteRacePreparation(payload)
        .then((result) => {
          console.log("Race Plan live quote payload", payload);
          console.log("Race Plan live quote result", result);
          console.log(
            "Race Plan standardized bonus",
            asRecord(result).standardized_bonus,
          );
          setQuote(result);
        })
        .catch((error) => {
          console.error("Failed to refresh Race Plan quote", error);
        })
        .finally(() => {
          setQuoteRefreshing(false);
        });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [payload, canEdit]);

  useEffect(() => {
    if (!loading && activeTab === "stagePlans" && !stagePlansOpen) {
      setActiveTab("racePackage");
    }
  }, [activeTab, loading, stagePlansOpen]);

  async function applyContext(
    context: RacePreparationTarget,
    currentClubId: UUID | null = clubId,
  ) {
    setTarget(context);
    setQuote(null);
    setPendingParticipatingClubId(null);

    const contextRaceId = getText(context.race, "id");
    setSelectedRaceId(contextRaceId || null);

    const prepId = context.preparation?.id
      ? String(context.preparation.id)
      : null;

    const savedParticipatingClubId =
      getText(context.preparation, "participating_club_id") ||
      getText(context.entry, "participating_club_id");

    const nextParticipatingClubId =
      currentClubId && isUuid(savedParticipatingClubId)
        ? savedParticipatingClubId
        : currentClubId;

    setParticipatingClubId(nextParticipatingClubId);

    let nextSquadIsDeveloping = false;

    if (currentClubId) {
      const [squadOptionResult, selectableResult] = await Promise.all([
        loadRacePreparationSquadOptions(currentClubId),
        loadRacePreparationSelectableData(
          currentClubId,
          contextRaceId || null,
          prepId,
          nextParticipatingClubId,
        ),
      ]);

      setSquadOptions(squadOptionResult);
      setSelectableData(selectableResult);

      const contextSquad = squadOptionResult.find(
        (option) => option.id === nextParticipatingClubId,
      );

      nextSquadIsDeveloping =
        contextSquad?.club_type === "developing" &&
        contextSquad.parent_club_id === currentClubId;
    } else {
      setSquadOptions([]);
      setSelectableData(null);
    }

    if (prepId) {
      const draft = await loadExistingRacePreparationDraft(prepId);
      setSelectedRiderIds(draft.riderIds);
      setSelectedStaffIds(draft.staffIds);
      setSelectedAssets({
        ...createEmptySelectedAssets(),
        ...draft.assetAssignments,
      });

      if (
        nextSquadIsDeveloping &&
        draft.tacticalPlannerChoice === "u23_head_coach" &&
        draft.u23HeadCoachId
      ) {
        setTacticalPlannerChoice("u23_head_coach");
        setSelectedU23HeadCoachId(draft.u23HeadCoachId);
        setU23AutomationEnabled(draft.u23AutomationEnabled);
      } else {
        setTacticalPlannerChoice("sport_director");
        setSelectedU23HeadCoachId(null);
        setU23AutomationEnabled(false);
      }
    } else {
      setSelectedRiderIds([]);
      setSelectedStaffIds([]);
      setTacticalPlannerChoice("sport_director");
      setSelectedU23HeadCoachId(null);
      setU23AutomationEnabled(false);
      setSelectedAssets(createEmptySelectedAssets());
    }
  }

  async function applyNoVisibleAcceptedRaceState(
    resolvedClubId: UUID,
  ): Promise<void> {
    const [squadOptionResult, selectableResult] = await Promise.all([
      loadRacePreparationSquadOptions(resolvedClubId),
      loadRacePreparationSelectableData(
        resolvedClubId,
        null,
        null,
        resolvedClubId,
      ),
    ]);

    setAcceptedRaces([]);
    setSelectedRaceId(null);
    setSquadOptions(squadOptionResult);
    setParticipatingClubId(resolvedClubId);
    setPendingParticipatingClubId(null);
    setSelectableData(selectableResult);
    setSelectedRiderIds([]);
    setSelectedStaffIds([]);
    setTacticalPlannerChoice("sport_director");
    setSelectedU23HeadCoachId(null);
    setU23AutomationEnabled(false);
    setSelectedAssets(createEmptySelectedAssets());
    setTarget({
      has_target: false,
      message: "No accepted races found for this club.",
    });
  }

  async function loadPage(preferredRaceId?: UUID | null) {
    setLoading(true);
    setErrorMessage(null);
    setMessage(null);
    setQuote(null);

    try {
      const resolvedClubId = await resolveCurrentClubId();
      setClubId(resolvedClubId);

      const rawAcceptedResult =
        await loadAcceptedRacePreparations(resolvedClubId);

      /*
       * The first pass does not need the game date to remove cancelled races.
       * This prevents a stale cancelled race from becoming the default target.
       */
      const provisionallyVisibleResult =
        filterAcceptedRacePreparations(rawAcceptedResult);

      const preferredRaceIsVisible = Boolean(
        preferredRaceId &&
          provisionallyVisibleResult.some(
            (row) => row.race_id === preferredRaceId,
          ),
      );

      const selectedRaceIsVisible = Boolean(
        selectedRaceId &&
          provisionallyVisibleResult.some(
            (row) => row.race_id === selectedRaceId,
          ),
      );

      let raceToLoad = preferredRaceIsVisible
        ? preferredRaceId!
        : selectedRaceIsVisible
          ? selectedRaceId!
          : provisionallyVisibleResult[0]?.race_id ?? null;

      if (!raceToLoad) {
        await applyNoVisibleAcceptedRaceState(resolvedClubId);
        return;
      }

      let context = await loadRacePreparationContext(
        resolvedClubId,
        raceToLoad,
      );

      /*
       * The selected context contains the authoritative current game date.
       * Use it for the three-day retention rule for completed races.
       */
      const visibleAcceptedResult = filterAcceptedRacePreparations(
        rawAcceptedResult,
        context.current_game_date,
      );

      if (
        !visibleAcceptedResult.some((row) => row.race_id === raceToLoad)
      ) {
        raceToLoad = visibleAcceptedResult[0]?.race_id ?? null;

        if (!raceToLoad) {
          await applyNoVisibleAcceptedRaceState(resolvedClubId);
          return;
        }

        context = await loadRacePreparationContext(
          resolvedClubId,
          raceToLoad,
        );
      }

      setAcceptedRaces(visibleAcceptedResult);
      await applyContext(context, resolvedClubId);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load page.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function selectRace(raceIdToSelect: UUID, nextTab: RacePreparationTab) {
    if (!clubId) return;

    setActionLoading(true);
    setErrorMessage(null);
    setMessage(null);
    setQuote(null);
    setSelectedRaceId(raceIdToSelect);
    setParticipatingClubId(clubId);
    setPendingParticipatingClubId(null);
    setSelectedRiderIds([]);
    setSelectedStaffIds([]);
    setTacticalPlannerChoice("sport_director");
    setSelectedU23HeadCoachId(null);
    setU23AutomationEnabled(false);
    setSelectedAssets(createEmptySelectedAssets());

    try {
      const context = await loadRacePreparationContext(clubId, raceIdToSelect);
      await applyContext(context, clubId);
      setActiveTab(nextTab);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load selected race.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function refreshSelectedRace() {
    if (!clubId || !raceId) return;

    const [rawAcceptedResult, context] = await Promise.all([
      loadAcceptedRacePreparations(clubId),
      loadRacePreparationContext(clubId, raceId),
    ]);

    const visibleAcceptedResult = filterAcceptedRacePreparations(
      rawAcceptedResult,
      context.current_game_date,
    );

    setAcceptedRaces(visibleAcceptedResult);

    if (
      !visibleAcceptedResult.some((row) => row.race_id === raceId)
    ) {
      const fallbackRaceId = visibleAcceptedResult[0]?.race_id ?? null;

      if (!fallbackRaceId) {
        await applyNoVisibleAcceptedRaceState(clubId);
        return;
      }

      const fallbackContext = await loadRacePreparationContext(
        clubId,
        fallbackRaceId,
      );

      await applyContext(fallbackContext, clubId);
      return;
    }

    await applyContext(context, clubId);
  }

  useEffect(() => {
    const tabFromUrl = normalizeRacePreparationTab(searchParams.get("tab"));
    const raceIdFromUrl = searchParams.get("raceId");

    setActiveTab(tabFromUrl);

    void loadPage(isUuid(raceIdFromUrl) ? raceIdFromUrl : null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyParticipatingClub(nextParticipatingClubId: UUID) {
    if (
      !clubId ||
      !raceId ||
      !canEdit ||
      nextParticipatingClubId === participatingClubId
    ) {
      setPendingParticipatingClubId(null);
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setMessage(null);
    setQuote(null);

    /*
     * Remove the old squad riders immediately so the First Squad
     * roster is not displayed while the Developing Team roster is
     * loading.
     */
    setSelectedRiderIds([]);

    setSelectableData((current) => {
      if (!current) return current;

      return {
        ...current,
        riders: [],
      };
    });

    try {
      const prepId = preparation?.id ? String(preparation.id) : null;

      const selectableResult = await loadRacePreparationSelectableData(
        clubId,
        raceId,
        prepId,
        nextParticipatingClubId,
      );

      setParticipatingClubId(nextParticipatingClubId);

      /*
       * Replace the rider pool with the selected squad.
       *
       * Shared club resources stay attached to the main club.
       */
      setSelectableData((current) => {
        if (!current) {
          return selectableResult;
        }

        return {
          ...current,

          riders: selectableResult.riders,

          blockedResources: selectableResult.blockedResources,

          /*
           * These are still returned from the main club, but keep
           * the existing selections and displayed resource pools.
           */
          staff: selectableResult.staff,

          assets: selectableResult.assets,

          supplies: selectableResult.supplies,

          equipmentPresets: selectableResult.equipmentPresets,
        };
      });

      setPendingParticipatingClubId(null);

      const nextOption = squadOptions.find(
        (option) => option.id === nextParticipatingClubId,
      );

      setTacticalPlannerChoice("sport_director");
      setSelectedU23HeadCoachId(null);
      setU23AutomationEnabled(false);

      setMessage(
        nextOption
          ? `Competing squad changed to ${nextOption.name}.`
          : "Competing squad changed.",
      );
    } catch (error) {
      /*
       * Restore the currently selected squad roster if loading the
       * requested squad fails.
       */
      try {
        const prepId = preparation?.id ? String(preparation.id) : null;

        const restoredResult = await loadRacePreparationSelectableData(
          clubId,
          raceId,
          prepId,
          participatingClubId ?? clubId,
        );

        setSelectableData(restoredResult);
      } catch (restoreError) {
        console.error("Failed to restore current squad riders:", restoreError);
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to change competing squad.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  function requestParticipatingClubChange(nextParticipatingClubId: UUID) {
    if (!canEdit || nextParticipatingClubId === participatingClubId) {
      return;
    }

    if (cleanSelectedRiderIds.length > 0) {
      setPendingParticipatingClubId(nextParticipatingClubId);
      return;
    }

    void applyParticipatingClub(nextParticipatingClubId);
  }

  async function resolveRacePreparationIdAfterSave(
    saveResult?: unknown,
  ): Promise<UUID | null> {
    const directId = String(
      asRecord(saveResult).race_preparation_id ??
        asRecord(saveResult).id ??
        asRecord(preparation).id ??
        "",
    );

    if (isUuid(directId)) {
      return directId;
    }

    if (!clubId || !raceId) {
      return null;
    }

    const refreshedContext = await loadRacePreparationContext(clubId, raceId);
    const refreshedPreparationId = String(
      asRecord(refreshedContext.preparation).id ?? "",
    );

    return isUuid(refreshedPreparationId) ? refreshedPreparationId : null;
  }

  async function persistPendingU23PlannerChoice(
    racePreparationId: UUID,
  ): Promise<void> {
    if (
      !isDevelopingTeamSelected ||
      effectiveTacticalPlannerChoice !== "u23_head_coach"
    ) {
      return;
    }

    if (!selectedU23HeadCoachId) {
      throw new Error(
        "Select a U23 Head Coach before saving this Developing Team Race Plan.",
      );
    }

    const result = await setU23StagePlanAutomation({
      racePreparationId,
      enabled: false,
      plannerStaffId: selectedU23HeadCoachId,
    });

    setU23AutomationEnabled(Boolean(result.is_enabled));
  }

  async function handleQuote() {
    if (!payload) return;

    setActionLoading(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const result = await quoteRacePreparation(payload);
      console.log("Race quote result", result);
      console.log("Standardized bonus", asRecord(result).standardized_bonus);
      setQuote(result);
      setMessage("Race Plan quote refreshed.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to quote race plan.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveDraft() {
    if (!payload) return;

    if (riderSelectionTooMany) {
      setErrorMessage(
        `Remove ${selectedRiderCount - maxRiders} rider${
          selectedRiderCount - maxRiders === 1 ? "" : "s"
        } before saving.`,
      );
      return;
    }

    if (u23PlannerChoiceIncomplete) {
      setErrorMessage(
        "Select a U23 Head Coach or switch the tactical planner back to Sport Director before saving the Race Plan.",
      );
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const saveResult = await saveRacePreparationDraft(payload);
      const savedRacePreparationId =
        await resolveRacePreparationIdAfterSave(saveResult);

      if (savedRacePreparationId) {
        await persistPendingU23PlannerChoice(savedRacePreparationId);
      }

      setMessage(
        isDevelopingTeamSelected &&
          effectiveTacticalPlannerChoice === "u23_head_coach"
          ? "Race Plan saved. The U23 Head Coach will take control when the Race Plan is submitted."
          : "Race Plan saved.",
      );

      await refreshSelectedRace();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save race plan.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmit() {
    if (!riderSelectionValid) {
      setErrorMessage(
        `Select ${minRiders}–${maxRiders} riders before submitting the Race Plan.`,
      );
      return;
    }

    if (u23PlannerChoiceIncomplete) {
      setErrorMessage(
        "Select a U23 Head Coach or switch the tactical planner back to Sport Director before submitting the Race Plan.",
      );
      return;
    }

    if (!raceId || !clubId || !payload) return;

    setActionLoading(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      let savedRacePreparationId = String(asRecord(preparation).id ?? "");

      if (canEdit) {
        const saveResult = await saveRacePreparationDraft(payload);
        savedRacePreparationId =
          (await resolveRacePreparationIdAfterSave(saveResult)) ?? "";

        if (savedRacePreparationId) {
          await persistPendingU23PlannerChoice(savedRacePreparationId);
        }
      }

      const result = await submitRacePreparation({
        race_id: raceId,
        club_id: clubId,
      });

      const submittedRacePreparationId = String(
        result.race_preparation_id ??
          savedRacePreparationId ??
          asRecord(preparation).id ??
          "",
      );

      let u23ActivationMessage = "";

      if (
        isDevelopingTeamSelected &&
        effectiveTacticalPlannerChoice === "u23_head_coach"
      ) {
        if (!selectedU23HeadCoachId) {
          throw new Error(
            "The Race Plan was submitted, but no U23 Head Coach was selected.",
          );
        }

        if (!isUuid(submittedRacePreparationId)) {
          throw new Error(
            "The Race Plan was submitted, but its preparation ID could not be resolved for U23 automation.",
          );
        }

        const automationResult = await setU23StagePlanAutomation({
          racePreparationId: submittedRacePreparationId,
          enabled: true,
          plannerStaffId: selectedU23HeadCoachId,
        });

        const initialGeneration = asRecord(automationResult.initial_generation);

        if (String(initialGeneration.status ?? "") === "error") {
          throw new Error(
            String(
              initialGeneration.message ??
                "The Race Plan was submitted, but the U23 Head Coach could not generate the first Stage Plan.",
            ),
          );
        }

        setU23AutomationEnabled(Boolean(automationResult.is_enabled));
        u23ActivationMessage = Boolean(initialGeneration.applied)
          ? " The U23 Head Coach generated the first eligible Stage Plan."
          : " U23 automation is active.";
      }

      setMessage(
        `${String(
          result.message ?? "Race Plan submitted successfully.",
        )}${u23ActivationMessage}`,
      );

      await refreshSelectedRace();
      setActiveTab("stagePlans");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to submit race plan.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  function requestSubmitRacePlan() {
    if (!riderSelectionValid) {
      setErrorMessage(
        `Select ${minRiders}–${maxRiders} riders before submitting the Race Plan.`,
      );
      return;
    }

    if (u23PlannerChoiceIncomplete) {
      setErrorMessage(
        "Select a U23 Head Coach or switch the tactical planner back to Sport Director before submitting the Race Plan.",
      );
      return;
    }

    if (!canEdit) return;

    if (!isPackageDeadlinePassed && !packageSubmitted) {
      setShowSubmitConfirm(true);
      return;
    }

    void handleSubmit();
  }

  async function handleStartRacePreparationTutorial() {
    const firstStep = racePreparationTutorialSteps[0];

    await saveTutorialProgress(
      "race-preparation",
      "started",
      firstStep?.key ?? null,
    );

    setActiveTab("acceptedRaces");
    setTutorialStepIndex(0);
    setTutorialMode("steps");
  }

  async function handleSkipRacePreparationTutorial() {
    await saveTutorialProgress("race-preparation", "skipped", null);
    setTutorialMode("closed");
  }

  async function handleNextRacePreparationTutorialStep() {
    const currentStep = racePreparationTutorialSteps[tutorialStepIndex];
    const isLastStep =
      tutorialStepIndex >= racePreparationTutorialSteps.length - 1;

    if (!isLastStep) {
      const nextIndex = tutorialStepIndex + 1;
      const nextStep = racePreparationTutorialSteps[nextIndex];
      const nextTab = getRacePreparationTabForTutorialStepKey(nextStep.key);

      setActiveTab(nextTab);

      await saveTutorialProgress("race-preparation", "started", nextStep.key);

      setTutorialStepIndex(nextIndex);
      return;
    }

    await saveTutorialProgress(
      "race-preparation",
      "completed",
      currentStep?.key ?? null,
    );

    window.sessionStorage.setItem("ppm:auto-start-tutorial", "team-ranking");
    navigate("/dashboard/team-ranking");
  }

  async function handleFinishRacePreparationTutorialForNow() {
    const currentStep = racePreparationTutorialSteps[tutorialStepIndex];

    await saveTutorialProgress(
      "race-preparation",
      "completed",
      currentStep?.key ?? null,
    );

    setTutorialMode("closed");
  }

  async function handleCloseRacePreparationTutorial() {
    const currentStep = racePreparationTutorialSteps[tutorialStepIndex];

    if (tutorialMode === "invite") {
      await saveTutorialProgress("race-preparation", "skipped", null);
      setTutorialMode("closed");
      return;
    }

    if (tutorialMode === "steps") {
      await saveTutorialProgress(
        "race-preparation",
        "started",
        currentStep?.key ?? null,
      );
    }

    setTutorialMode("closed");
  }

  function toggleRider(riderId: UUID) {
    if (!canEdit) return;

    if (blockedRiderIds.has(riderId)) {
      setErrorMessage(
        "This rider is already assigned to an overlapping submitted race.",
      );
      return;
    }

    const medicalUnavailableReason = medicallyUnavailableRiderMap.get(riderId);

    if (medicalUnavailableReason) {
      setErrorMessage(medicalUnavailableReason);
      return;
    }

    setSelectedRiderIds((current) => {
      const currentClean = current.filter(
        (id) =>
          !blockedRiderIds.has(id) && !medicallyUnavailableRiderIds.has(id),
      );

      if (currentClean.includes(riderId)) {
        setErrorMessage(null);
        return currentClean.filter((id) => id !== riderId);
      }

      if (maxRiders > 0 && currentClean.length >= maxRiders) {
        setErrorMessage(`You can select at most ${maxRiders} riders.`);
        return currentClean;
      }

      setErrorMessage(null);
      return [...currentClean, riderId];
    });
  }

  function setStaffForRole(roleType: string, staffId: UUID | "") {
    if (!canEdit) return;

    if (staffId && blockedStaffIds.has(staffId)) {
      setErrorMessage(
        "This staff member is already assigned to an overlapping submitted race.",
      );
      return;
    }

    const staffInRole = new Set(
      (selectableData?.staff ?? [])
        .filter((staff) => staff.role_type === roleType)
        .map((staff) => staff.id),
    );

    setErrorMessage(null);

    setSelectedStaffIds((current) => {
      const withoutThisRole = current.filter((id) => {
        return !staffInRole.has(id) && !blockedStaffIds.has(id);
      });

      return staffId ? [...withoutThisRole, staffId] : withoutThisRole;
    });

    if (roleType === "sport_director" && isDevelopingTeamSelected && staffId) {
      setTacticalPlannerChoice("sport_director");
      setSelectedU23HeadCoachId(null);
      setU23AutomationEnabled(false);
    }
  }

  function selectTacticalPlanner(choice: "sport_director" | "u23_head_coach") {
    if (!canEdit || !isDevelopingTeamSelected) return;

    setTacticalPlannerChoice(choice);
    setErrorMessage(null);

    if (choice === "u23_head_coach") {
      setStaffForRole("sport_director", "");
      return;
    }

    setSelectedU23HeadCoachId(null);
    setU23AutomationEnabled(false);
  }

  function selectU23HeadCoach(staffId: UUID | "") {
    if (!canEdit || !isDevelopingTeamSelected) return;

    if (staffId && blockedStaffIds.has(staffId)) {
      setErrorMessage(
        "This U23 Head Coach is already assigned to an overlapping submitted race.",
      );
      return;
    }

    setTacticalPlannerChoice("u23_head_coach");
    setSelectedU23HeadCoachId(staffId || null);
    setU23AutomationEnabled(false);
    setStaffForRole("sport_director", "");
    setErrorMessage(null);
  }

  function updateSelectedAsset(assetKey: RacePrepAssetKey, assetId: UUID | "") {
    if (!canEdit) return;

    if (assetId && blockedAssetIds.has(assetId)) {
      setErrorMessage(
        "This asset is already assigned to an overlapping submitted race.",
      );
      return;
    }

    if (
      assetId &&
      isAssetSelectedInAnotherSlot(cleanSelectedAssets, assetKey, assetId)
    ) {
      setErrorMessage(
        "This asset is already selected in another Race Plan slot.",
      );
      return;
    }

    setErrorMessage(null);

    setSelectedAssets((current) => {
      const next = { ...current };

      raceAssetKeys.forEach((key) => {
        const currentAssetId = next[key];

        if (currentAssetId && blockedAssetIds.has(currentAssetId)) {
          next[key] = "";
        }
      });

      return {
        ...next,
        [assetKey]: assetId,
      };
    });
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          Loading Race Preparation...
        </div>
      </div>
    );
  }

  if (errorMessage && !target) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          {errorMessage}
        </div>
      </div>
    );
  }

  const raceClassCode =
    getText(entryRules, "race_class_code") ||
    getText(race, "race_class_code") ||
    getText(race, "category");

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Race Preparation</h1>
        <p className="text-sm text-slate-600">
          Accepted races are listed first. Race Plan handles whole-race
          startlist, travel, staff, assets and costs. Stage Plans handle
          stage-by-stage tactics after the race plan is submitted.
        </p>
      </header>

      <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">
        <TabButton
          label="Accepted Races"
          active={activeTab === "acceptedRaces"}
          onClick={() => setActiveTab("acceptedRaces")}
        />
        <TabButton
          label="Race Plan"
          active={activeTab === "racePackage"}
          onClick={() => setActiveTab("racePackage")}
        />
        <TabButton
          label="Stage Plans"
          active={activeTab === "stagePlans"}
          disabled={!stagePlansOpen}
          onClick={() => setActiveTab("stagePlans")}
        />
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {activeTab === "acceptedRaces" && (
        <AcceptedRacesTab
          acceptedRaces={acceptedRaces}
          selectedRaceId={raceId}
          currentGameDate={target?.current_game_date}
          actionLoading={actionLoading}
          onPrepareRace={(id) => selectRace(id, "racePackage")}
          onOpenStages={(id) => selectRace(id, "stagePlans")}
        />
      )}

      {activeTab === "racePackage" && (
        <>
          {!target?.has_target ? (
            <EmptyCard message="No accepted race selected." />
          ) : (
            <>
              <RaceHeaderCard
                race={race}
                raceClassCode={raceClassCode}
                minRiders={minRiders}
                maxRiders={maxRiders}
                raceStatus={racePlanUiStatus}
                currentGameDate={target.current_game_date}
                packageOpensOn={target.setup_window_opens_on}
                riderDeadlineOn={target.rider_submission_deadline_on}
                stageCount={target.stages?.length ?? 1}
                stages={target.stages ?? []}
                squadOptions={squadOptions}
                participatingClubId={participatingClubId}
                canChangeSquad={canEdit}
                squadChangeLoading={actionLoading}
                onParticipatingClubChange={requestParticipatingClubChange}
                onOpenRacePreview={(id) => setRacePreviewId(id)}
              />

              {selectedRaceAllWeatherCanceled ? (
                <WeatherCancellationPreparationNotice race={race} />
              ) : null}

              {isPackageTooEarly && !selectedRaceAllWeatherCanceled && (
                <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
                  Race Plan is not open yet. It opens on{" "}
                  {formatFullGameDate(target.setup_window_opens_on)}.
                </div>
              )}

              {isPackageDeadlinePassed && !selectedRaceAllWeatherCanceled && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  Rider submission deadline has passed. This Race Plan can no
                  longer be edited.
                </div>
              )}

              <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
                <div className="space-y-6">
                  <RacePackageCard
                    title="1. Riders"
                    action={
                      <InfoTooltip
                        label="Rider freshness help"
                        panelWidthClass="w-[30rem]"
                      >
                        <div className="text-sm font-semibold text-slate-900">
                          Freshness, sharpness and fatigue
                        </div>
                        <p className="mt-2">
                          Race sharpness shows whether a rider has enough recent
                          racing rhythm. Higher sharpness helps a rider start
                          sharper and perform more reliably.
                        </p>
                        <p className="mt-2">
                          Fatigue is still the main limiter. A rider with good
                          race sharpness but very high fatigue will not start
                          the race fully fresh.
                        </p>
                        <p className="mt-2">
                          The race-start red freshness bar combines fatigue and
                          race sharpness. It is capped between 50 and 100 so no
                          selected rider starts a race unrealistically empty.
                        </p>
                        {packageSubmitted ? (
                          <p className="mt-2 font-semibold text-slate-800">
                            Because this Race Plan is already submitted, only
                            riders selected for this race are shown here.
                          </p>
                        ) : null}
                      </InfoTooltip>
                    }
                  >
                    <div
                      className={`mb-3 text-sm ${
                        riderSelectionTooFew || riderSelectionTooMany
                          ? "text-red-700"
                          : "text-slate-600"
                      }`}
                    >
                      Selected riders: {cleanSelectedRiderIds.length} ·
                      Required: {minRiders || "—"}–{maxRiders || "—"}
                      {selectedSquadOption
                        ? ` · ${selectedSquadOption.name}`
                        : ""}
                      {riderSelectionTooMany && (
                        <div className="mt-1 font-medium">
                          Remove {selectedRiderCount - maxRiders} rider
                          {selectedRiderCount - maxRiders === 1 ? "" : "s"}{" "}
                          before saving.
                        </div>
                      )}
                      {riderSelectionTooFew && (
                        <div className="mt-1 font-medium">
                          Select at least {minRiders} riders before submitting.
                        </div>
                      )}
                    </div>

                    {blockedRiderIds.size > 0 ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {blockedRiderIds.size} rider
                        {blockedRiderIds.size === 1 ? "" : "s"} unavailable
                        because they are already assigned to an overlapping
                        race.
                      </div>
                    ) : null}

                    {medicallyUnavailableRiderIds.size > 0 ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
                        {medicallyUnavailableRiderIds.size} rider
                        {medicallyUnavailableRiderIds.size === 1
                          ? ""
                          : "s"}{" "}
                        medically unavailable and cannot be selected for this
                        Race Plan.
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      {visibleRiderOptions.map((option) => {
                        const selected = cleanSelectedRiderIds.includes(
                          option.rider_id,
                        );
                        const blockedReason = formatBlockedResourceReason(
                          blockedRiderMap.get(option.rider_id),
                        );

                        return (
                          <RiderSelectionCard
                            key={option.rider_id}
                            option={option}
                            selected={selected}
                            canEdit={canEdit}
                            currentGameDate={target?.current_game_date}
                            raceSharpness={
                              riderRaceSharpnessById.get(option.rider_id) ??
                              null
                            }
                            blockedReason={blockedReason}
                            medicalUnavailableReason={
                              medicallyUnavailableRiderMap.get(
                                option.rider_id,
                              ) ?? null
                            }
                            onToggle={() => toggleRider(option.rider_id)}
                          />
                        );
                      })}
                    </div>
                  </RacePackageCard>

                  <RacePackageCard
                    title="2. Race Staff"
                    action={
                      <InfoTooltip
                        label="Race staff help"
                        panelWidthClass="w-[30rem]"
                      >
                        <div className="text-sm font-semibold text-slate-900">
                          Tactical planner and support staff
                        </div>
                        <p className="mt-2">
                          First Team races use a Sport Director. For a
                          Developing Team race, choose exactly one tactical
                          planner: Sport Director or U23 Head Coach.
                        </p>
                        <p className="mt-2">
                          A U23 Head Coach automatically prepares the first
                          eligible Stage Plan after submission and continues
                          stage by stage. These Stage Plans are view-only.
                          Switch back to Sport Director to edit them manually.
                        </p>
                        <p className="mt-2">
                          Team Doctor, Physio and Mechanic remain independent
                          support-staff choices.
                        </p>
                        <p className="mt-2 font-semibold text-slate-800">
                          Without a Team Doctor, medical fitness warnings are
                          not created.
                        </p>
                      </InfoTooltip>
                    }
                  >
                    <div className="mb-3 text-sm text-slate-600">
                      {isDevelopingTeamSelected
                        ? "Choose one tactical planner for the Developing Team. Team Doctor, Physio and Mechanic remain separate."
                        : "First Team races use a Sport Director. Team Doctor, Physio and Mechanic remain optional support staff."}
                    </div>

                    {blockedStaffIds.size > 0 ? (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {blockedStaffIds.size} staff member
                        {blockedStaffIds.size === 1 ? "" : "s"} unavailable
                        because they are already assigned to an overlapping
                        race.
                      </div>
                    ) : null}

                    {isDevelopingTeamSelected ? (
                      <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-900">
                          Tactical Planner
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-600">
                          Choose either manual Sport Director planning or
                          automatic U23 Head Coach planning. Both cannot be
                          active together.
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() =>
                              selectTacticalPlanner("sport_director")
                            }
                            className={[
                              "rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                              effectiveTacticalPlannerChoice ===
                              "sport_director"
                                ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
                                : "border-slate-200 bg-white hover:border-slate-300",
                            ].join(" ")}
                          >
                            <div className="font-semibold text-slate-900">
                              Sport Director
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-600">
                              You manage Stage Plans manually and may ask the
                              Sport Director for suggestions.
                            </div>
                          </button>

                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() =>
                              selectTacticalPlanner("u23_head_coach")
                            }
                            className={[
                              "rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                              effectiveTacticalPlannerChoice ===
                              "u23_head_coach"
                                ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100"
                                : "border-slate-200 bg-white hover:border-slate-300",
                            ].join(" ")}
                          >
                            <div className="font-semibold text-slate-900">
                              U23 Head Coach
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-600">
                              The coach automatically prepares Stage Plans.
                              Plans remain view-only until you switch back to a
                              Sport Director.
                            </div>
                          </button>
                        </div>

                        {effectiveTacticalPlannerChoice === "sport_director" ? (
                          <label className="mt-4 block">
                            <span className="text-sm font-medium text-slate-700">
                              Sport Director
                            </span>
                            <select
                              disabled={!canEdit}
                              value={selectedStaffByRole.sport_director ?? ""}
                              onChange={(event) =>
                                setStaffForRole(
                                  "sport_director",
                                  event.target.value,
                                )
                              }
                              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
                            >
                              <option value="">
                                No Sport Director selected
                              </option>
                              {(selectableData?.staff ?? [])
                                .filter(
                                  (staff) =>
                                    staff.role_type === "sport_director",
                                )
                                .map((staff) => {
                                  const blockedReason =
                                    formatBlockedResourceReason(
                                      blockedStaffMap.get(staff.id),
                                    );

                                  return (
                                    <option
                                      key={staff.id}
                                      value={staff.id}
                                      disabled={Boolean(blockedReason)}
                                    >
                                      {staff.staff_name}
                                      {blockedReason
                                        ? ` — ${blockedReason}`
                                        : ""}
                                    </option>
                                  );
                                })}
                            </select>
                          </label>
                        ) : (
                          <div className="mt-4">
                            <label className="block">
                              <span className="text-sm font-medium text-slate-700">
                                U23 Head Coach
                              </span>
                              <select
                                disabled={!canEdit}
                                value={selectedU23HeadCoachId ?? ""}
                                onChange={(event) =>
                                  selectU23HeadCoach(event.target.value)
                                }
                                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
                              >
                                <option value="">
                                  No U23 Head Coach selected
                                </option>
                                {(selectableData?.staff ?? [])
                                  .filter(
                                    (staff) =>
                                      staff.role_type === "u23_head_coach",
                                  )
                                  .map((staff) => {
                                    const blockedReason =
                                      formatBlockedResourceReason(
                                        blockedStaffMap.get(staff.id),
                                      );

                                    const availabilityFactor =
                                      normalizeNumericValue(
                                        staff.current_availability_factor,
                                        1,
                                      );
                                    const coachUnavailable =
                                      availabilityFactor <= 0;

                                    const details = [
                                      staff.expertise
                                        ? `Expertise ${Math.round(
                                            staff.expertise,
                                          )}`
                                        : null,
                                      staff.leadership
                                        ? `Leadership ${Math.round(
                                            staff.leadership,
                                          )}`
                                        : null,
                                      staff.specialization ?? null,
                                      coachUnavailable
                                        ? "Unavailable"
                                        : availabilityFactor < 1
                                          ? `${Math.round(
                                              availabilityFactor * 100,
                                            )}% available`
                                          : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ");

                                    return (
                                      <option
                                        key={staff.id}
                                        value={staff.id}
                                        disabled={
                                          Boolean(blockedReason) ||
                                          coachUnavailable
                                        }
                                      >
                                        {staff.staff_name}
                                        {details ? ` · ${details}` : ""}
                                        {blockedReason
                                          ? ` — ${blockedReason}`
                                          : ""}
                                      </option>
                                    );
                                  })}
                              </select>
                            </label>

                            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
                              {packageSubmitted && u23AutomationEnabled
                                ? "U23 automation is active. The coach manages eligible stages automatically."
                                : selectedU23HeadCoach
                                  ? `${selectedU23HeadCoach.staff_name} will take control when the Race Plan is submitted.`
                                  : "Select the U23 Head Coach who should manage this race."}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      {Object.entries(
                        isDevelopingTeamSelected
                          ? supportStaffRoleLabels
                          : staffRoleLabels,
                      ).map(([roleType, label]) => {
                        const staffOptionsForRole = (
                          selectableData?.staff ?? []
                        ).filter((staff) => staff.role_type === roleType);

                        return (
                          <label key={roleType} className="block">
                            <span className="text-sm font-medium text-slate-700">
                              {label}
                            </span>
                            <select
                              disabled={!canEdit}
                              value={selectedStaffByRole[roleType] ?? ""}
                              onChange={(event) =>
                                setStaffForRole(roleType, event.target.value)
                              }
                              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
                            >
                              <option value="">No {label} selected</option>
                              {staffOptionsForRole.map((staff) => {
                                const blockedReason =
                                  formatBlockedResourceReason(
                                    blockedStaffMap.get(staff.id),
                                  );

                                return (
                                  <option
                                    key={staff.id}
                                    value={staff.id}
                                    disabled={Boolean(blockedReason)}
                                  >
                                    {staff.staff_name}
                                    {blockedReason ? ` — ${blockedReason}` : ""}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  </RacePackageCard>

                  <RacePackageCard title="3. Race Assets">
                    {blockedAssetIds.size > 0 ? (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {blockedAssetIds.size} asset
                        {blockedAssetIds.size === 1 ? "" : "s"} unavailable
                        because they are already assigned to an overlapping
                        race.
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      {raceAssetKeys.map((assetKey) => {
                        const assetInventoryKey =
                          getAssetInventoryKey(assetKey);

                        const assetOptions =
                          selectableData?.assets[assetInventoryKey] ?? [];

                        return (
                          <label key={assetKey} className="block">
                            <span className="text-sm font-medium text-slate-700">
                              {assetLabels[assetKey]}
                            </span>
                            <select
                              disabled={!canEdit}
                              value={cleanSelectedAssets[assetKey]}
                              onChange={(event) =>
                                updateSelectedAsset(
                                  assetKey,
                                  event.target.value as UUID | "",
                                )
                              }
                              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
                            >
                              <option value="">No asset selected</option>
                              {assetOptions.map((asset) => {
                                const blockedReason =
                                  formatBlockedResourceReason(
                                    blockedAssetMap.get(asset.id),
                                  );

                                const selectedInAnotherSlot =
                                  isAssetSelectedInAnotherSlot(
                                    cleanSelectedAssets,
                                    assetKey,
                                    asset.id,
                                  );

                                return (
                                  <option
                                    key={asset.id}
                                    value={asset.id}
                                    disabled={
                                      Boolean(blockedReason) ||
                                      selectedInAnotherSlot
                                    }
                                  >
                                    {asset.display_name} · Lv{" "}
                                    {asset.asset_level ?? 1} ·{" "}
                                    {Number(
                                      asset.condition_percent ?? 0,
                                    ).toFixed(0)}
                                    % condition
                                    {blockedReason ? ` — ${blockedReason}` : ""}
                                    {!blockedReason && selectedInAnotherSlot
                                      ? " — already selected in another slot"
                                      : ""}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  </RacePackageCard>
                </div>

                <aside className="space-y-6">
                  <RacePackageCard title="Cost Preview">
                    <div className="space-y-2 text-sm">
                      <CostLine label="Travel tickets" value={travelTickets} />
                      <CostLine label="Accommodation" value={accommodation} />
                      <CostLine
                        label="Asset transport"
                        value={assetTransport}
                      />
                      <CostLine
                        label="Team logistics & operations"
                        value={logistics}
                      />
                      <div className="border-t pt-3">
                        <CostLine label="Total" value={total} strong />
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      This is a preview only. Saving the Race Plan does not
                      charge money or lock assets. Payment and locks happen only
                      after confirmed submission or the rider deadline.
                      {quoteRefreshing ? <span> Updating preview…</span> : null}
                    </div>

                    <div className="mt-5 flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={
                          actionLoading ||
                          !payload ||
                          selectedRaceAllWeatherCanceled
                        }
                        onClick={handleQuote}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Refresh Quote
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading || !payload || !canSaveRacePlan}
                        onClick={handleSaveDraft}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Save Race Plan
                      </button>

                      <button
                        type="button"
                        disabled={
                          actionLoading || !payload || !canSubmitRacePlan
                        }
                        onClick={requestSubmitRacePlan}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Submit Race Plan
                      </button>
                    </div>
                  </RacePackageCard>

                  <RacePackageCard title="Validation">
                    {quote?.errors?.length ? (
                      <div className="space-y-2">
                        {quote.errors.map((error) => (
                          <div
                            key={error}
                            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
                          >
                            {error}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-600">
                        Refresh quote to check validation.
                      </div>
                    )}

                    {quote?.warnings?.length ? (
                      <div className="mt-4 space-y-2">
                        {quote.warnings.map((warning) => (
                          <div
                            key={warning}
                            className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
                          >
                            {warning}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </RacePackageCard>

                  <RacePlanBonusPreview
                    standardizedBonus={standardizedBonus}
                    exactBonusPreview={bonusPreview}
                  />
                </aside>
              </section>
            </>
          )}
        </>
      )}

      {activeTab === "stagePlans" && (
        <StagePlansTab
          target={target}
          packageSubmitted={stagePlansOpen}
          raceId={raceId}
          selectedRiders={selectedRacePlanRiders}
          equipmentPresetOptions={selectableData?.equipmentPresets ?? []}
          supplyOptions={selectableData?.supplies ?? []}
          standardizedBonus={standardizedBonus}
          exactBonusPreview={bonusPreview}
          hasSportDirectorAssigned={Boolean(selectedStaffByRole.sport_director)}
          tacticalPlannerChoice={effectiveTacticalPlannerChoice}
          u23HeadCoachId={selectedU23HeadCoachId}
          u23AutomationEnabled={u23AutomationEnabled}
          selectedStageIdFromUrl={searchParams.get("stageId")}
          onOpenRacePreview={setRacePreviewId}
        />
      )}

      {pendingParticipatingClubId && pendingSquadOption && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">
              Change competing squad?
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              Changing to <strong>{pendingSquadOption.name}</strong> will remove
              the currently selected riders and reset the tactical planner.
              Support staff, assets, supplies and equipment settings will remain
              unchanged.
            </p>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setPendingParticipatingClubId(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={actionLoading}
                onClick={() =>
                  void applyParticipatingClub(pendingParticipatingClubId)
                }
                className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-yellow-300 disabled:opacity-50"
              >
                Change squad
              </button>
            </div>
          </div>
        </div>
      )}

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-950">
              Submit Race Plan now?
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-600">
              The rider deadline is{" "}
              <strong>
                {formatGameDate(target?.rider_submission_deadline_on)}
              </strong>
              . If you submit the Race Plan now, riders, race staff and race
              assets will be locked for this race. Stage Plans will open
              immediately after submission.
            </p>

            {hasSubmitPlanWarnings ? (
              <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4">
                <div className="text-base font-bold text-red-800">
                  Warning: this Race Plan is not fully assigned.
                </div>

                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm font-semibold text-red-700">
                  {submitPlanWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>

                <p className="mt-3 text-sm font-medium text-red-700">
                  If you continue, the Race Plan will be submitted exactly like
                  this and missing riders, staff or assets will stay empty.
                </p>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSubmitConfirm(false);
                  void handleSubmit();
                }}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {hasSubmitPlanWarnings
                  ? "Yes, Submit Anyway"
                  : "Yes, Submit Race Plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {racePreviewId && (
        <RacePreviewModal
          raceId={racePreviewId}
          onClose={() => setRacePreviewId(null)}
        />
      )}

      {!tutorialLoading && tutorialMode === "invite" ? (
        <TutorialOverlay
          open
          variant="invite"
          title={racePreparationWelcomeTutorial.title}
          body={racePreparationWelcomeTutorial.body}
          primaryAction={racePreparationWelcomeTutorial.primaryAction}
          secondaryAction={racePreparationWelcomeTutorial.secondaryAction}
          onPrimary={handleStartRacePreparationTutorial}
          onSecondary={handleSkipRacePreparationTutorial}
          onClose={handleCloseRacePreparationTutorial}
        />
      ) : null}

      {!tutorialLoading && tutorialMode === "steps" ? (
        <TutorialOverlay
          open
          variant="panel"
          title={racePreparationTutorialSteps[tutorialStepIndex].title}
          body={racePreparationTutorialSteps[tutorialStepIndex].body}
          stepLabel={`${tutorialStepIndex + 1}/${racePreparationTutorialSteps.length}`}
          primaryAction={
            racePreparationTutorialSteps[tutorialStepIndex].primaryAction ??
            "Next"
          }
          secondaryAction={
            tutorialStepIndex === racePreparationTutorialSteps.length - 1
              ? racePreparationTutorialSteps[tutorialStepIndex].secondaryAction
              : "Skip tutorial"
          }
          onPrimary={handleNextRacePreparationTutorialStep}
          onSecondary={
            tutorialStepIndex === racePreparationTutorialSteps.length - 1
              ? handleFinishRacePreparationTutorialForNow
              : handleSkipRacePreparationTutorial
          }
          onClose={handleCloseRacePreparationTutorial}
        />
      ) : null}
    </div>
  );
}

function AcceptedRacesTab({
  acceptedRaces,
  selectedRaceId,
  currentGameDate,
  actionLoading,
  onPrepareRace,
  onOpenStages,
}: {
  acceptedRaces: AcceptedRacePreparationRow[];
  selectedRaceId: UUID | null;
  currentGameDate?: string;
  actionLoading: boolean;
  onPrepareRace: (raceId: UUID) => void;
  onOpenStages: (raceId: UUID) => void;
}) {
  if (acceptedRaces.length === 0) {
    return <EmptyCard message="No accepted races found for this club." />;
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Accepted Races</h2>
        <p className="mt-1 text-sm text-slate-600">
          Confirmed participations. The status shows what can be done now for
          Race Plan and Stage Plans.
        </p>
      </div>

      <div className="space-y-3">
        {acceptedRaces.map((row) => {
          const selected = selectedRaceId === row.race_id;
          const race = row.race;
          const prepState = getAcceptedRacePreparationState(
            row,
            currentGameDate,
          );
          const isMissedStartlist = Boolean(
            (prepState as { missedStartlist?: boolean }).missedStartlist,
          );
          const raceWeatherStatus = getWeatherCancellationStatusFromRace(race);
          const raceAllWeatherCanceled =
            isRaceAllWeatherCanceledInPreparation(race);
          const racePartlyWeatherCanceled =
            isRacePartlyWeatherCanceledInPreparation(race);

          const raceClass =
            String(
              row.entry_rules?.race_class_code ??
                race.race_class_code ??
                race.category ??
                "—",
            ) || "—";

          const raceTypeLabel = row.stage_count > 1 ? "Stage Race" : "One Day";

          const startParts = parseDateParts(race.start_date);
          const endParts = parseDateParts(race.end_date);

          const startDay = startParts
            ? `${String(startParts.day).padStart(2, "0")} ${
                monthLabels[startParts.month - 1]
              }`
            : "—";

          const endDay = endParts
            ? `${String(endParts.day).padStart(2, "0")} ${
                monthLabels[endParts.month - 1]
              }`
            : "—";

          return (
            <div
              key={row.race_team_entry_id}
              className={`rounded-2xl border p-4 transition ${
                raceAllWeatherCanceled
                  ? "border-red-200 bg-red-50"
                  : isMissedStartlist
                    ? "border-red-200 bg-red-50"
                    : selected
                      ? "border-yellow-300 bg-yellow-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="grid gap-4 md:grid-cols-[80px_1fr_auto] md:items-center">
                <div className="flex items-center gap-4">
                  <div className="w-16 text-right text-sm font-semibold leading-tight text-slate-950">
                    <div>{startDay}</div>
                    {race.start_date !== race.end_date && <div>{endDay}</div>}
                  </div>

                  <div className="h-14 w-px bg-emerald-400" />
                </div>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => onPrepareRace(row.race_id)}
                  className="min-w-0 text-left disabled:opacity-60"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <CountryFlag code={String(race.country_code ?? "")} />

                    <div className="truncate text-base font-semibold text-slate-900">
                      {race.name}
                    </div>

                    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                      {raceClass}
                    </span>

                    {raceWeatherStatus ? (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          raceAllWeatherCanceled
                            ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                            : racePartlyWeatherCanceled
                              ? "bg-orange-100 text-orange-700 ring-1 ring-orange-200"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {getWeatherCancellationDisplayStatusForPreparation(
                          race,
                        ) ?? titleFromSnake(raceWeatherStatus)}
                      </span>
                    ) : null}

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        row.stage_count > 1
                          ? "bg-blue-100 text-blue-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {raceTypeLabel}
                    </span>
                  </div>

                  <div className="mt-1 truncate text-xs text-slate-500">
                    {getRaceRouteLine(race, row.stage_count)}
                  </div>
                </button>

                <div className="flex flex-nowrap items-center justify-start gap-2 md:justify-end">
                  {isMissedStartlist ? (
                    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                      <span className="whitespace-nowrap">
                        Your team missed the startlist and is not participating
                      </span>
                      <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5">
                        Not Participating
                      </span>
                    </span>
                  ) : (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${prepState.className}`}
                    >
                      {prepState.label}
                    </span>
                  )}

                  {prepState.racePlanEnabled ? (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => onPrepareRace(row.race_id)}
                      className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-yellow-300 disabled:opacity-50"
                      title="Open Race Plan"
                    >
                      Race Plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionLoading || !prepState.stagePlansEnabled}
                      onClick={() => onOpenStages(row.race_id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        prepState.stagePlansEnabled
                          ? "bg-yellow-400 text-slate-950 hover:bg-yellow-300"
                          : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                      title={
                        prepState.stagePlansEnabled
                          ? "Open Stage Plans"
                          : "Stage Plans open after the Race Plan is submitted"
                      }
                    >
                      Stage Plans
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function getStageHeaderProfileKind(stage: JsonRecord): {
  label: string;
  shortLabel: string;
  className: string;
} {
  const format = String(stage.stage_format ?? "").toLowerCase();
  const profile = String(
    stage.profile_type ?? stage.terrain_type ?? stage.stage_type ?? "",
  ).toLowerCase();
  const combined = `${format} ${profile}`;

  if (format === "team_time_trial") {
    return {
      label: "Team Time Trial",
      shortLabel: "TTT",
      className: "border-purple-200 bg-purple-50 text-purple-700",
    };
  }

  if (isTimeTrialStage(stage)) {
    return {
      label: "Time Trial",
      shortLabel: "TT",
      className: "border-indigo-200 bg-indigo-50 text-indigo-700",
    };
  }

  if (
    combined.includes("mountain") ||
    combined.includes("climb") ||
    combined.includes("summit")
  ) {
    return {
      label: "Mountain",
      shortLabel: "M",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (
    combined.includes("hilly") ||
    combined.includes("hill") ||
    combined.includes("puncheur")
  ) {
    return {
      label: "Hilly",
      shortLabel: "H",
      className: "border-orange-200 bg-orange-50 text-orange-700",
    };
  }

  if (combined.includes("cobble")) {
    return {
      label: "Cobbles",
      shortLabel: "C",
      className: "border-stone-200 bg-stone-50 text-stone-700",
    };
  }

  if (combined.includes("sprint")) {
    return {
      label: "Sprint",
      shortLabel: "S",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  return {
    label: "Flat",
    shortLabel: "F",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  };
}

function getStageHeaderProfileSource(stage: JsonRecord): JsonRecord {
  const metadata = asRecord(stage.metadata);
  const routeProfile = asRecord(metadata.route_profile_v1);

  if (Object.keys(routeProfile).length > 0) {
    return routeProfile;
  }

  return stage;
}

function StageHeaderMiniProfile({
  stage,
  profileOverride,
}: {
  stage: JsonRecord;
  profileOverride: JsonRecord;
}) {
  const profile = profileOverride;
  const points = normalizeProfilePoints(profile, stage);

  if (points.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-500">
        Stage profile points are missing.
      </div>
    );
  }

  const width = 680;
  const height = 230;
  const padding = {
    top: 18,
    right: 18,
    bottom: 34,
    left: 46,
  };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const distanceKm =
    toFiniteNumberValue(profile.distance_km) ??
    toFiniteNumberValue(stage.distance_km) ??
    Math.max(...points.map((point) => point.km), 1);

  const maxElevationRaw = Math.max(...points.map((point) => point.elevation_m));
  const maxElevation = Math.max(
    500,
    Math.ceil((maxElevationRaw * 1.12) / 100) * 100,
  );

  const xForKm = (km: number) =>
    padding.left +
    (Math.max(0, Math.min(distanceKm, km)) / distanceKm) * innerWidth;

  const yForElevation = (elevation: number) =>
    padding.top +
    innerHeight -
    (Math.max(0, elevation) / maxElevation) * innerHeight;

  const coordinates = points.map((point) => ({
    x: xForKm(point.km),
    y: yForElevation(point.elevation_m),
    ...point,
  }));

  const linePath = coordinates.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;

    const previous = coordinates[index - 1];
    const controlX = (previous.x + point.x) / 2;

    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");

  const baselineY = height - padding.bottom;
  const areaPath = `${linePath} L ${
    coordinates[coordinates.length - 1].x
  } ${baselineY} L ${coordinates[0].x} ${baselineY} Z`;

  const elevationTicks = [0, 0.33, 0.66, 1].map(
    (ratio) => Math.round((maxElevation * ratio) / 100) * 100,
  );

  const distanceTicks = [0, 0.33, 0.66, 1].map((ratio) => ({
    km: distanceKm * ratio,
    x: xForKm(distanceKm * ratio),
  }));

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-56 w-full"
        role="img"
        aria-label="Stage profile preview"
      >
        <rect width={width} height={height} fill="#ffffff" />

        {elevationTicks.map((tick) => {
          const y = yForElevation(tick);

          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#64748b"
              >
                {tick} m
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="#fde68a" opacity="0.95" />
        <path
          d={linePath}
          fill="none"
          stroke="#334155"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />

        {distanceTicks.map((tick, index) => (
          <text
            key={`${tick.km}-${index}`}
            x={tick.x}
            y={height - 10}
            textAnchor={
              index === 0
                ? "start"
                : index === distanceTicks.length - 1
                  ? "end"
                  : "middle"
            }
            fontSize="11"
            fontWeight="700"
            fill="#334155"
          >
            {tick.km.toFixed(tick.km % 1 === 0 ? 0 : 1)} km
          </text>
        ))}
      </svg>
    </div>
  );
}

function RaceHeaderStageChip({
  stage,
  index,
  profile,
  profileLoading,
  profileError,
}: {
  stage: JsonRecord;
  index: number;
  profile: JsonRecord | null;
  profileLoading: boolean;
  profileError: string | null;
}) {
  const [hovered, setHovered] = useState(false);

  const stageNumber = String(stage.stage_number ?? index + 1);
  const kind = getStageHeaderProfileKind(stage);
  const title = `Stage ${stageNumber}: ${getStageProfileLabel(stage)} · ${
    getStageDistance(stage) || "Distance pending"
  }`;
  const hasProfileChart = profile
    ? normalizeProfilePoints(profile, stage).length >= 2
    : false;

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-xs font-bold text-slate-800 shadow-sm transition hover:border-yellow-400 hover:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-yellow-300"
        aria-label={title}
        title={title}
      >
        {stageNumber}
      </button>

      {hovered ? (
        <div className="pointer-events-none absolute right-0 top-10 z-[80] w-[44rem] rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Stage {stageNumber}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-950">
                {getStageDisplayName(stage, stageNumber)}
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {kind.label}
            </span>
          </div>

          <div className="mt-2 text-xs text-slate-600">
            <div className="truncate">
              <span className="font-semibold text-slate-700">Route:</span>{" "}
              {getStageRoute(stage)}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span>
                <span className="font-semibold text-slate-700">Profile:</span>{" "}
                {profile?.profile_type
                  ? titleFromSnake(String(profile.profile_type))
                  : getStageProfileLabel(stage)}
              </span>
              <span>
                <span className="font-semibold text-slate-700">Distance:</span>{" "}
                {profile?.distance_km
                  ? `${Number(profile.distance_km).toFixed(
                      Number(profile.distance_km) % 1 === 0 ? 0 : 1,
                    )} km`
                  : getStageDistance(stage) || "—"}
              </span>
            </div>
          </div>

          <div className="mt-3">
            {profileLoading && !hasProfileChart ? (
              <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-500">
                Loading stage profile…
              </div>
            ) : hasProfileChart && profile ? (
              <StageHeaderMiniProfile stage={stage} profileOverride={profile} />
            ) : (
              <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm font-semibold text-slate-500">
                {profileError
                  ? "Stage profile could not be loaded."
                  : "Stage profile data is not available yet."}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RaceHeaderStageStrip({
  stages,
  fallbackStageCount,
}: {
  stages: JsonRecord[];
  fallbackStageCount: number;
}) {
  const visibleStages = stages.length > 0 ? stages : [];
  const fallbackCount = Math.max(0, Number(fallbackStageCount) || 0);
  const stageIds = useMemo(
    () => visibleStages.map((stage) => String(stage.id ?? "")).filter(Boolean),
    [visibleStages],
  );
  const [profileByStageId, setProfileByStageId] = useState<
    Record<
      string,
      { profile: JsonRecord | null; loading: boolean; error: string | null }
    >
  >({});

  useEffect(() => {
    if (stageIds.length === 0) {
      setProfileByStageId({});
      return;
    }

    let cancelled = false;

    setProfileByStageId((current) => {
      const next = { ...current };

      stageIds.forEach((stageId) => {
        if (!next[stageId]) {
          next[stageId] = { profile: null, loading: true, error: null };
        }
      });

      return next;
    });

    stageIds.forEach((stageId) => {
      loadRaceStageProfileDetail(stageId)
        .then((result) => {
          if (cancelled) return;

          setProfileByStageId((current) => ({
            ...current,
            [stageId]: {
              profile: result?.has_profile ? result : null,
              loading: false,
              error: null,
            },
          }));
        })
        .catch((error) => {
          if (cancelled) return;

          setProfileByStageId((current) => ({
            ...current,
            [stageId]: {
              profile: null,
              loading: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to load stage profile.",
            },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [stageIds]);

  if (visibleStages.length === 0 && fallbackCount <= 0) return null;

  if (visibleStages.length === 0) {
    return (
      <div className="flex w-full items-center justify-end gap-2 overflow-visible text-xs">
        <span className="shrink-0 font-semibold uppercase tracking-wide text-slate-500">
          Stages:
        </span>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-xs font-bold text-slate-800 shadow-sm">
          {fallbackCount}
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-end gap-2 overflow-visible text-xs">
      <span className="shrink-0 font-semibold uppercase tracking-wide text-slate-500">
        Stages:
      </span>

      <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-visible">
        {visibleStages.map((stage, index) => {
          const stageId = String(stage.id ?? "");
          const profileState = stageId ? profileByStageId[stageId] : null;

          return (
            <RaceHeaderStageChip
              key={String(stage.id ?? stage.stage_number ?? index)}
              stage={stage}
              index={index}
              profile={profileState?.profile ?? null}
              profileLoading={profileState?.loading ?? false}
              profileError={profileState?.error ?? null}
            />
          );
        })}
      </div>
    </div>
  );
}

function RaceHeaderCard({
  race,
  raceClassCode,
  minRiders,
  maxRiders,
  raceStatus,
  currentGameDate,
  packageOpensOn,
  riderDeadlineOn,
  stageCount,
  stages,
  squadOptions,
  participatingClubId,
  canChangeSquad,
  squadChangeLoading,
  onParticipatingClubChange,
  onOpenRacePreview,
}: {
  race: unknown;
  raceClassCode: string;
  minRiders: number;
  maxRiders: number;
  raceStatus: string;
  currentGameDate?: string;
  packageOpensOn?: string;
  riderDeadlineOn?: string;
  stageCount: number;
  stages: JsonRecord[];
  squadOptions: RacePreparationSquadOption[];
  participatingClubId: UUID | null;
  canChangeSquad: boolean;
  squadChangeLoading: boolean;
  onParticipatingClubChange: (clubId: UUID) => void;
  onOpenRacePreview: (raceId: UUID) => void;
}) {
  const raceId = getText(race, "id");

  const firstSquadOption =
    squadOptions.find(
      (option) => option.club_type === "main" || !option.parent_club_id,
    ) ?? null;

  const developingSquadOption =
    squadOptions.find(
      (option) =>
        option.club_type === "developing" && Boolean(option.parent_club_id),
    ) ?? null;

  const hasDevelopingTeam = Boolean(developingSquadOption);

  const visibleSquadOptions = [firstSquadOption, developingSquadOption].filter(
    (option): option is RacePreparationSquadOption => Boolean(option),
  );

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,auto)_1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Selected race
          </div>

          <div className="mt-1 flex items-center gap-2">
            <CountryFlag code={getText(race, "country_code")} />
            <h2 className="truncate text-xl font-semibold text-slate-900">
              {getText(race, "name") || "Unnamed race"}
            </h2>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <InfoChip
              label="Race dates"
              value={formatGameDateRange(
                getText(race, "start_date"),
                getText(race, "end_date"),
              )}
            />
            <InfoChip label="Class" value={raceClassCode || "—"} />
            <InfoChip
              label="Riders"
              value={`${minRiders || "—"}–${maxRiders || "—"}`}
            />
            {raceId && (
              <button
                type="button"
                onClick={() => onOpenRacePreview(raceId)}
                className="inline-flex h-[38px] items-center rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                Open Race Page
              </button>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col items-end gap-3 lg:pt-2">
          {raceStatus === "missed_startlist" ? (
            <div className="flex w-full max-w-3xl items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              <span className="min-w-0 truncate">
                Your team missed the rider startlist and is not participating in
                this race.
              </span>
              <span className="shrink-0 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800 ring-1 ring-red-200">
                Not Participating
              </span>
            </div>
          ) : (
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                raceStatus,
              )}`}
            >
              {getRacePlanStatusLabel(raceStatus)}
            </span>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <InfoChip
            label="Current game date"
            value={formatFullGameDate(currentGameDate)}
            alignRight
          />
        </div>
      </div>

      <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
        <RaceHeaderStageStrip stages={stages} fallbackStageCount={stageCount} />
      </div>

      {hasDevelopingTeam && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Competing squad
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Rider selection comes from this squad. Staff, assets, equipment,
                supplies and finance remain shared by the club.
              </div>
            </div>

            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {visibleSquadOptions.map((option) => {
                const active = option.id === participatingClubId;

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!canChangeSquad || squadChangeLoading}
                    onClick={() => onParticipatingClubChange(option.id)}
                    className={[
                      "rounded-lg px-4 py-2 text-sm font-semibold transition",
                      active
                        ? "bg-yellow-400 text-slate-950 shadow-sm"
                        : "text-slate-600 hover:bg-slate-100",
                      !canChangeSquad || squadChangeLoading
                        ? "cursor-not-allowed opacity-60"
                        : "",
                    ].join(" ")}
                    title={option.name}
                  >
                    <span className="block">{option.label}</span>
                    <span className="block max-w-[180px] truncate text-[11px] font-medium opacity-75">
                      {option.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <InfoBox
          label="Race Plan opens"
          value={formatFullGameDate(packageOpensOn)}
        />
        <InfoBox
          label="Rider deadline"
          value={formatFullGameDate(riderDeadlineOn)}
        />
        <InfoBox label="Stages" value={String(stageCount)} />
      </div>
    </section>
  );
}

type BonusBreakdownRow = {
  sourceType: string;
  sourceLabel: string;
  effectKey: string;
  effectLabel: string;
  rawValueText: string;
  contributionPercent: number;
  contributionLabel: string;
};

const standardizedBonusDescriptions: Record<string, string> = {
  fatigue_control:
    "Reduces race fatigue pressure, travel fatigue, and fatigue floor effects.",
  recovery_support:
    "Improves daily recovery, recovery duration, and post-stage recovery.",
  health_protection:
    "Reduces injury risk, illness risk, and minor health problems.",
  mechanical_reliability:
    "Reduces mechanical problems, mechanical time loss, and equipment-related race issues.",
  race_support:
    "Improves feeding, team-car coverage, race logistics, and tactical support.",
};

const standardizedEffectKeyMap: Record<string, string[]> = {
  fatigue_control: [
    "tour_fatigue_reduction_pct",
    "one_day_fatigue_reduction_pct",
    "short_tour_fatigue_reduction_pct",
    "long_tour_fatigue_reduction_pct",
    "race_fatigue_protection_pct",
    "race_fatigue_reduction_pct",
    "fatigue_floor_reduction",
    "travel_comfort_pct",
  ],

  recovery_support: [
    "recovery_duration",
    "daily_recovery_bonus",
    "post_stage_recovery_pct",
    "post_stage_recovery_bonus_pct",
    "post_stage_recovery_support",
    "recovery_comfort_bonus_pct",
    "recovery_bonus",
  ],

  health_protection: [
    "injury_illness_risk",
    "minor_injury_risk_reduction_pct",
    "medical_response_pct",
    "medical_response_bonus_pct",
    "hydration_support_pct",
    "hydration_support_bonus_pct",
    "heat_hydration_support_pct",
  ],

  mechanical_reliability: [
    "mechanical_time_loss_reduction_pct",
    "mechanical_response_pct",
    "mechanical_response_bonus_pct",
    "pre_stage_readiness_pct",
    "pre_stage_equipment_readiness_pct",
    "spare_bike_response_pct",
    "spare_bike_response_bonus_pct",
    "wheel_change_support_pct",
    "equipment_condition_loss_reduction_pct",
    "repair_speed_pct",
    "repair_cost_reduction_pct",
    "mechanic_response_pct",
    "mechanic_response_during_races",
  ],

  race_support: [
    "race_support_coverage_pct",
    "race_support_quality_pct",
    "feeding_support_pct",
    "feeding_support_bonus_pct",
    "tactical_communication_pct",
    "tactical_support_pct",
    "incident_response_pct",
    "incident_support_pct",
    "crash_incident_response_pct",
    "race_day_logistics_pct",
    "logistics_bonus",
    "travel_morale_bonus",
  ],
};

const negativeRawMeansPositiveContribution = new Set([
  "tour_fatigue_reduction_pct",
  "one_day_fatigue_reduction_pct",
  "short_tour_fatigue_reduction_pct",
  "long_tour_fatigue_reduction_pct",
  "race_fatigue_protection_pct",
  "race_fatigue_reduction_pct",
  "fatigue_floor_reduction",
  "recovery_duration",
  "injury_illness_risk",
  "minor_injury_risk_reduction_pct",
  "mechanical_time_loss_reduction_pct",
  "equipment_condition_loss_reduction_pct",
  "repair_cost_reduction_pct",
]);

function RacePlanBonusPreview({
  standardizedBonus,
  exactBonusPreview,
}: {
  standardizedBonus: JsonRecord;
  exactBonusPreview: JsonRecord;
}) {
  const groups = toArray<JsonRecord>(standardizedBonus.groups);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);

  const breakdownByBonusKey = useMemo(
    () => buildStandardizedBreakdownMap(exactBonusPreview),
    [exactBonusPreview],
  );

  return (
    <RacePackageCard title="Race Plan Bonus Preview">
      <div className="space-y-3" onMouseLeave={() => setActiveGroupKey(null)}>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Standardized Race Bonus Percentages
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Race staff, race assets, and team policies are converted into these
            standardized race-engine percentage bonuses. Hover or click a card
            to see the source breakdown.
          </p>
        </div>

        {groups.length > 0 ? (
          <div className="grid gap-2">
            {groups.map((group) => {
              const bonusKey = String(group.bonus_key ?? group.key ?? "");
              const displayName = String(
                group.display_name ?? titleFromSnake(bonusKey),
              );

              const breakdown = getBreakdownForStandardizedGroup(
                group,
                breakdownByBonusKey,
              );

              const active = activeGroupKey === bonusKey;

              return (
                <StandardizedBonusCard
                  key={bonusKey || displayName}
                  group={group}
                  bonusKey={bonusKey}
                  displayName={displayName}
                  breakdown={breakdown}
                  active={active}
                  onOpen={() => setActiveGroupKey(bonusKey)}
                  onToggle={() =>
                    setActiveGroupKey((current) =>
                      current === bonusKey ? null : bonusKey,
                    )
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            No standardized race bonuses available yet. Refresh the quote after
            selecting race staff and race assets.
          </div>
        )}
      </div>
    </RacePackageCard>
  );
}

function StandardizedBonusCard({
  group,
  bonusKey,
  displayName,
  breakdown,
  active,
  onOpen,
  onToggle,
}: {
  group: JsonRecord;
  bonusKey: string;
  displayName: string;
  breakdown: BonusBreakdownRow[];
  active: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const percent = Number(group.percent ?? group.points ?? 0);
  const openAbove = bonusKey === "race_support";

  return (
    <div
      className={`relative ${active ? "z-50" : "z-0"}`}
      onMouseEnter={onOpen}
    >
      {active && openAbove ? (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-2">
          <BonusBreakdownPopover
            title={displayName}
            percent={percent}
            breakdown={breakdown}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        onFocus={onOpen}
        className={`w-full rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-200 ${
          active
            ? "border-emerald-300 bg-emerald-50/40"
            : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-900">
                {displayName}
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                details
              </span>
            </div>

            <div className="mt-1 text-xs leading-5 text-slate-500">
              {String(
                group.description ??
                  standardizedBonusDescriptions[bonusKey] ??
                  "Standardized race-engine support bonus.",
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-sm font-bold text-emerald-700">
              +{formatBonusPercent(percent)}%
            </div>
          </div>
        </div>
      </button>

      {active && !openAbove ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2">
          <BonusBreakdownPopover
            title={displayName}
            percent={percent}
            breakdown={breakdown}
          />
        </div>
      ) : null}
    </div>
  );
}

function BonusBreakdownPopover({
  title,
  percent,
  breakdown,
}: {
  title: string;
  percent: number;
  breakdown: BonusBreakdownRow[];
}) {
  const contributionTotal = breakdown.reduce(
    (sum, row) => sum + row.contributionPercent,
    0,
  );

  return (
    <div className="max-h-[360px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {title} breakdown
          </div>
          <div className="mt-1 text-slate-500">
            Helpful effects are converted into positive standardized
            contribution percentages.
          </div>
        </div>

        <div className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-700">
          +{formatBonusPercent(percent)}%
        </div>
      </div>

      {breakdown.length > 0 ? (
        <div className="space-y-2">
          {breakdown.map((row, index) => (
            <div
              key={`${row.sourceLabel}-${row.effectKey}-${index}`}
              className="rounded-xl bg-slate-50 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">
                    {row.sourceLabel}
                  </div>
                  <div className="mt-1 text-slate-600">{row.effectLabel}</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Raw effect: {row.rawValueText}
                  </div>
                </div>

                <div className="shrink-0 font-bold text-emerald-700">
                  {row.contributionLabel}
                </div>
              </div>
            </div>
          ))}

          <div className="border-t border-slate-200 pt-2">
            <div className="flex justify-between font-semibold text-slate-900">
              <span>Source contribution</span>
              <span>+{formatBonusPercent(contributionTotal)}%</span>
            </div>
            <div className="mt-1 flex justify-between font-semibold text-emerald-700">
              <span>Standardized total</span>
              <span>+{formatBonusPercent(percent)}%</span>
            </div>
            <div className="mt-2 text-[11px] leading-5 text-slate-500">
              If these two numbers differ later, the race engine cap or
              standardization rule has limited the final bonus.
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-50 p-3 text-slate-500">
          No detailed source rows are available for this bonus yet. Team Policy
          rows appear only when the current policy setup gives a non-zero bonus.
        </div>
      )}
    </div>
  );
}

function buildStandardizedBreakdownMap(
  exactBonusPreview: JsonRecord,
): Record<string, BonusBreakdownRow[]> {
  const result: Record<string, BonusBreakdownRow[]> = {};

  Object.keys(standardizedEffectKeyMap).forEach((key) => {
    result[key] = [];
  });

  const sourceGroups = [
    ...toArray<JsonRecord>(exactBonusPreview.staff),
    ...toArray<JsonRecord>(exactBonusPreview.assets),
    ...toArray<JsonRecord>(exactBonusPreview.policies),
  ];

  sourceGroups.forEach((sourceGroup) => {
    const sourceType = String(sourceGroup.source_type ?? "");
    const sourceLabel = String(
      sourceGroup.source_label ?? sourceGroup.source_key ?? "Bonus source",
    );

    toArray<JsonRecord>(sourceGroup.effects).forEach((effect) => {
      const effectKey = String(effect.effect_key ?? "");
      const effectLabel = String(effect.label ?? effectKey);
      const rawValueText = String(effect.value ?? "");

      if (!effectKey || !effectLabel || !rawValueText) return;

      const matchingBonusKeys = getStandardizedBonusKeysForEffect(effectKey);

      matchingBonusKeys.forEach((bonusKey) => {
        const contributionPercent = getStandardizedContributionPercent(
          effectKey,
          rawValueText,
        );

        if (contributionPercent <= 0) return;

        result[bonusKey] = [
          ...(result[bonusKey] ?? []),
          {
            sourceType,
            sourceLabel,
            effectKey,
            effectLabel: getContributionEffectLabel(effectKey, effectLabel),
            rawValueText,
            contributionPercent,
            contributionLabel: `+${formatBonusPercent(contributionPercent)}%`,
          },
        ];
      });
    });
  });

  Object.keys(result).forEach((bonusKey) => {
    result[bonusKey] = mergeBreakdownRows(result[bonusKey] ?? []);
  });

  return result;
}

function mergeBreakdownRows(rows: BonusBreakdownRow[]): BonusBreakdownRow[] {
  const grouped = new Map<string, BonusBreakdownRow & { count: number }>();

  rows.forEach((row) => {
    const sourceLabel = normalizeBreakdownSourceLabel(row.sourceLabel);
    const key = [sourceLabel, row.effectKey, row.effectLabel].join("|");

    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...row,
        sourceLabel,
        count: 1,
      });
      return;
    }

    grouped.set(key, {
      ...existing,
      contributionPercent:
        existing.contributionPercent + row.contributionPercent,
      contributionLabel: `+${formatBonusPercent(
        existing.contributionPercent + row.contributionPercent,
      )}%`,
      rawValueText:
        existing.count + 1 > 1
          ? `${existing.count + 1} sources`
          : existing.rawValueText,
      count: existing.count + 1,
    });
  });

  return Array.from(grouped.values()).map(({ count, ...row }) => row);
}

function normalizeBreakdownSourceLabel(sourceLabel: string): string {
  if (/^Team Car\s+\d+:/i.test(sourceLabel)) {
    return "Team Cars";
  }

  return sourceLabel;
}

function getStandardizedBonusKeysForEffect(effectKey: string): string[] {
  return Object.entries(standardizedEffectKeyMap)
    .filter(([, effectKeys]) => effectKeys.includes(effectKey))
    .map(([bonusKey]) => bonusKey);
}

function getStandardizedContributionPercent(
  effectKey: string,
  rawValueText: string,
): number {
  const rawValue = parseSignedNumericValue(rawValueText);

  if (!Number.isFinite(rawValue) || rawValue === 0) {
    return 0;
  }

  if (negativeRawMeansPositiveContribution.has(effectKey)) {
    return Math.abs(rawValue);
  }

  return Math.max(0, rawValue);
}

function parseSignedNumericValue(value: string): number {
  const normalized = value.replace("%", "").replace("+", "").trim();
  const numeric = Number(normalized);

  return Number.isFinite(numeric) ? numeric : 0;
}

function getContributionEffectLabel(
  effectKey: string,
  fallback: string,
): string {
  switch (effectKey) {
    case "recovery_duration":
      return "Recovery duration support";
    case "daily_recovery_bonus":
      return "Daily recovery support";
    case "fatigue_floor_reduction":
      return "Fatigue floor control";
    case "injury_illness_risk":
      return "Injury / illness protection";
    case "tour_fatigue_reduction_pct":
      return "Tour fatigue control";
    case "mechanical_time_loss_reduction_pct":
      return "Mechanical time-loss protection";
    case "minor_injury_risk_reduction_pct":
      return "Minor-injury protection";
    case "race_fatigue_protection_pct":
      return "Race fatigue control";
    default:
      return fallback;
  }
}

function getBreakdownForStandardizedGroup(
  group: JsonRecord,
  fallbackBreakdownByBonusKey: Record<string, BonusBreakdownRow[]>,
): BonusBreakdownRow[] {
  const directBreakdown = toArray<JsonRecord>(group.breakdown)
    .map((row) => normalizeBreakdownRow(row))
    .filter(Boolean) as BonusBreakdownRow[];

  if (directBreakdown.length > 0) {
    return directBreakdown;
  }

  const bonusKey = String(group.bonus_key ?? group.key ?? "");

  return fallbackBreakdownByBonusKey[bonusKey] ?? [];
}

function normalizeBreakdownRow(row: JsonRecord): BonusBreakdownRow | null {
  const effectKey = String(row.effect_key ?? row.key ?? "");
  const effectLabel = String(row.effect_label ?? row.label ?? effectKey);
  const rawValueText = String(row.raw_value ?? row.rawValue ?? row.value ?? "");
  const contributionRaw = String(
    row.contribution_percent ??
      row.contributionPercent ??
      row.percent ??
      row.points ??
      "",
  );

  const contributionPercent = parseSignedNumericValue(contributionRaw);

  if (!effectLabel || !Number.isFinite(contributionPercent)) {
    return null;
  }

  return {
    sourceType: String(row.source_type ?? ""),
    sourceLabel: String(row.source_label ?? row.source ?? "Bonus source"),
    effectKey,
    effectLabel,
    rawValueText: rawValueText || contributionRaw,
    contributionPercent: Math.abs(contributionPercent),
    contributionLabel: `+${formatBonusPercent(Math.abs(contributionPercent))}%`,
  };
}

function formatBonusPercent(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

type StageRiderRoleCode =
  | "team_leader_gc"
  | "sprinter"
  | "lead_out_rider"
  | "sprint_train_rider"
  | "climber"
  | "mountain_domestique"
  | "helper_domestique"
  | "breakaway_rider"
  | "breakaway_chaser"
  | "rouleur"
  | "protected_rider"
  | "free_role"
  | "time_trial_rider"
  | "team_time_trial_rider";

type StageRiderSupplyDraft = {
  bidons: number;
  gels: number;
  nutrition_packs: number;
  race_jersey_complete: boolean;
  rain_jacket: boolean;
};

type StageRainJacketMode = "none" | "all";

type StageTeamSupplyPlan = {
  bidonsPerRider: number;
  gelsPerRider: number;
  nutritionPacksPerRider: number;
  rainJacketMode: StageRainJacketMode;
};

type StageIndividualTacticPhaseCommand = {
  command: string;
  from_km: number;
  to_km: number;
  label: string;
};

type StageIndividualTacticsByRider = Record<
  string,
  Record<string, StageIndividualTacticPhaseCommand>
>;

type StagePlanDraft = {
  equipmentByRider: Record<string, string>;
  riderRolesByRider: Record<string, StageRiderRoleCode | string>;
  individualTacticsByRider: StageIndividualTacticsByRider;
  suppliesByRider: Record<string, StageRiderSupplyDraft>;
  teamTactic: {
    plan: string;
    notes: string;
  };
  lastSavedAt?: string | null;
};

const STAGE_PLAN_LOCK_HOURS_BEFORE_START = 3;
const DEFAULT_STAGE_RIDER_ROLE: StageRiderRoleCode = "free_role";

const TIME_TRIAL_STAGE_FORMATS = new Set([
  "prologue",
  "individual_time_trial",
  "team_time_trial",
]);

function isTimeTrialStage(stage?: { stage_format?: string | null } | null) {
  return Boolean(
    stage?.stage_format && TIME_TRIAL_STAGE_FORMATS.has(stage.stage_format),
  );
}

function isTeamTimeTrialStage(stage?: { stage_format?: string | null } | null) {
  return stage?.stage_format === "team_time_trial";
}

function getTimeTrialStageRole(
  stage?: { stage_format?: string | null } | null,
) {
  return isTeamTimeTrialStage(stage)
    ? "team_time_trial_rider"
    : "time_trial_rider";
}

function getTimeTrialStageRoleLabel(
  stage?: { stage_format?: string | null } | null,
) {
  return isTeamTimeTrialStage(stage)
    ? "Team Time Trial Rider"
    : "Time Trial Rider";
}

const STAGE_RIDER_ROLE_OPTIONS: Array<{
  value: StageRiderRoleCode;
  label: string;
  description: string;
}> = [
  {
    value: "team_leader_gc",
    label: "Team Leader (GC)",
    description:
      "Main protected rider for the general classification and the rider teammates should protect during key race moments.",
  },
  {
    value: "sprinter",
    label: "Sprinter",
    description:
      "Primary rider for flat sprint finishes and suitable intermediate sprint opportunities.",
  },
  {
    value: "climber",
    label: "Climber",
    description:
      "Primary rider for difficult climbs, mountain finishes and suitable KOM opportunities.",
  },
  {
    value: "helper_domestique",
    label: "Helper / Domestique",
    description:
      "General support rider who protects teammates, carries out team work and assists with positioning or pace control.",
  },
  {
    value: "breakaway_rider",
    label: "Breakaway Rider",
    description:
      "Rider selected to attack or join a breakaway when an individual phase instruction allows it.",
  },
  {
    value: "breakaway_chaser",
    label: "Breakaway Chaser",
    description:
      "Rider selected to help close dangerous breakaways and support peloton pursuit work.",
  },
  {
    value: "free_role",
    label: "Free Role",
    description:
      "Neutral role without a fixed team duty. The rider follows phase instructions and reacts to the race situation.",
  },
];

const STAGE_RIDER_ROLE_LABELS = {
  ...STAGE_RIDER_ROLE_OPTIONS.reduce(
    (acc, option) => {
      acc[option.value] = option.label;
      return acc;
    },
    {} as Record<string, string>,
  ),
  time_trial_rider: "Time Trial Rider",
  team_time_trial_rider: "Team Time Trial Rider",
};

const LEGACY_STAGE_RIDER_ROLE_MAP: Record<string, StageRiderRoleCode> = {
  lead_out_rider: "helper_domestique",
  sprint_train_rider: "helper_domestique",
  mountain_domestique: "helper_domestique",
  rouleur: "helper_domestique",
  protected_rider: "free_role",
};

const STAGE_TACTIC_PLAN_OPTIONS: Array<{
  value: string;
  label: string;
  description: string;
}> = [
  {
    value: "balanced",
    label: "Balanced",
    description:
      "Default all-round plan. The team rides with normal energy use, reacts to the race, and does not overcommit too early.",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    description:
      "Higher-rhythm plan. Riders attack, chase and position more actively, but the team will usually spend more stamina.",
  },
  {
    value: "sprint_control",
    label: "Sprint Control",
    description:
      "The team focuses on controlling the race for a sprint finish, protecting the sprinter, and organizing the sprint train.",
  },
  {
    value: "breakaway",
    label: "Breakaway Support",
    description:
      "The team gives more freedom to breakaway riders and spends less effort on pure sprint control unless the race situation changes.",
  },
  {
    value: "gc_protection",
    label: "GC Protection",
    description:
      "Main focus is keeping the Team Leader safe, protected and well-positioned while avoiding unnecessary risks and fatigue.",
  },
  {
    value: "climber_support",
    label: "Climber Support",
    description:
      "The team puts more support into climbs, mountain pacing and KOM/GC support on uphill sections.",
  },
];

const STAGE_TACTIC_PLAN_LABELS = STAGE_TACTIC_PLAN_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {} as Record<string, string>,
);

const TT_TACTIC_OPTIONS = [
  {
    value: "tt_balanced_pace",
    label: "Balanced Pace",
    description:
      "Even effort across the whole stage. Safe default with low blow-up risk.",
  },
  {
    value: "tt_fast_start",
    label: "Fast Start",
    description:
      "Hard first half, then hold the pace. Good for short prologues, risky for weaker TT riders.",
  },
  {
    value: "tt_negative_split",
    label: "Negative Split",
    description:
      "Controlled first half, stronger second half. Good for longer ITTs and riders with endurance.",
  },
  {
    value: "tt_all_out",
    label: "All-out Time Trial",
    description:
      "Maximum pace from the start. Fastest option but high fatigue and blow-up risk.",
  },
];

const TT_TACTIC_PLAN_LABELS = TT_TACTIC_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {} as Record<string, string>,
);

function getStageTacticPlanOptions(
  stage?: { stage_format?: string | null } | null,
) {
  return isTimeTrialStage(stage)
    ? TT_TACTIC_OPTIONS
    : STAGE_TACTIC_PLAN_OPTIONS;
}

function getStageTacticPlanLabels(
  stage?: { stage_format?: string | null } | null,
) {
  return isTimeTrialStage(stage)
    ? TT_TACTIC_PLAN_LABELS
    : STAGE_TACTIC_PLAN_LABELS;
}

function getDefaultStageTacticPlan(
  stage?: { stage_format?: string | null } | null,
) {
  return isTimeTrialStage(stage) ? "tt_balanced_pace" : "balanced";
}

function normalizeStageTacticPlan(
  value: unknown,
  stage?: { stage_format?: string | null } | null,
) {
  const savedPlan = String(value ?? "");
  const labels = getStageTacticPlanLabels(stage);

  return labels[savedPlan] ? savedPlan : getDefaultStageTacticPlan(stage);
}

function getStageRaceSituationFactors(
  stage?: { stage_format?: string | null } | null,
) {
  if (!isTimeTrialStage(stage)) {
    return STAGE_TACTIC_ENGINE_MODEL_V1.raceSituationFactors;
  }

  return [
    "weather",
    "terrain",
    "stage_profile",
    "fatigue",
    "stamina",
    "rider_morale",
    "rider_health",
    "race_plan_staff_bonuses",
    "race_plan_asset_bonuses",
    "tt_equipment_effect",
    "equipment_condition",
    "race_support",
    "fatigue_control",
    "recovery_support",
    "mechanical_reliability",
    "weather_wind_risk",
    "pacing_risk",
    ...(isTeamTimeTrialStage(stage)
      ? [
          "team_cohesion",
          "average_teamwork",
          "counting_rider_group",
          "dropped_rider_risk",
        ]
      : []),
  ];
}

/**
 * Stage tactic engine model v1.
 *
 * This is intentionally kept as structured data so the future race engine can
 * implement the same meanings server-side. The UI saves role/command codes per
 * stage; the race engine should map those codes to behavior, energy/stamina
 * costs, fatigue pressure, and action priorities using this model.
 *
 * Suggested engine interpretation:
 * - team tactic = base behavior for the whole team on the selected stage
 * - rider role = default behavior/priority for each rider
 * - individual phase command = optional override for one rider and one phase
 * - final action = team tactic base + rider role + phase command + rider stats
 */
const STAGE_TACTIC_ENGINE_MODEL_V1 = {
  version: "stage_tactics_engine_v1",
  phaseCount: 4,
  raceSituationFactors: [
    "weather",
    "terrain",
    "stage_profile",
    "fatigue",
    "stamina",
    "peloton_position",
    "attacks",
    "breakaways",
    "crashes",
    "injuries",
    "mechanicals",
    "rider_morale",
    "rider_health",
    "race_plan_staff_bonuses",
    "race_plan_asset_bonuses",
    "stage_race_supplies",
  ],
  teamTacticEffects: {
    balanced: {
      effort: "normal",
      staminaMultiplier: 1.0,
      fatigueMultiplier: 1.0,
      positioning: "normal",
      attackPriority: "normal",
      chasePriority: "normal",
      sprintSupport: "normal",
      risk: "normal",
    },
    aggressive: {
      effort: "high",
      staminaMultiplier: 1.12,
      fatigueMultiplier: 1.12,
      positioning: "front",
      attackPriority: "high",
      chasePriority: "high",
      sprintSupport: "normal",
      risk: "medium_high",
    },
    sprint_control: {
      effort: "controlled_high",
      staminaMultiplier: 1.08,
      fatigueMultiplier: 1.08,
      positioning: "front",
      attackPriority: "low",
      chasePriority: "high",
      sprintSupport: "high",
      risk: "medium",
    },
    breakaway: {
      effort: "selective",
      staminaMultiplier: 1.05,
      fatigueMultiplier: 1.05,
      positioning: "flexible",
      attackPriority: "high_for_breakaway_roles",
      chasePriority: "low_to_normal",
      sprintSupport: "low",
      risk: "medium_high",
    },
    gc_protection: {
      effort: "controlled",
      staminaMultiplier: 1.04,
      fatigueMultiplier: 1.04,
      positioning: "safe_front",
      attackPriority: "low_except_leader",
      chasePriority: "normal",
      sprintSupport: "low",
      risk: "low",
    },
    climber_support: {
      effort: "climb_focused",
      staminaMultiplier: 1.08,
      fatigueMultiplier: 1.1,
      positioning: "front_on_climbs",
      attackPriority: "high_on_climbs",
      chasePriority: "normal",
      sprintSupport: "low",
      risk: "medium",
    },
    tt_balanced_pace: {
      effort: "even",
      staminaMultiplier: 1.0,
      fatigueMultiplier: 1.0,
      pacingProfile: "steady_whole_stage",
      blowUpRisk: "low",
    },
    tt_fast_start: {
      effort: "front_loaded",
      staminaMultiplier: 1.08,
      fatigueMultiplier: 1.08,
      pacingProfile: "hard_before_split_hold_after_split",
      blowUpRisk: "medium_high",
    },
    tt_negative_split: {
      effort: "back_loaded",
      staminaMultiplier: 1.04,
      fatigueMultiplier: 1.04,
      pacingProfile: "controlled_before_split_hard_after_split",
      blowUpRisk: "medium",
    },
    tt_all_out: {
      effort: "maximum",
      staminaMultiplier: 1.16,
      fatigueMultiplier: 1.16,
      pacingProfile: "maximum_from_start",
      blowUpRisk: "high",
    },
  },
  riderRoleEffects: {
    team_leader_gc: {
      priority: "gc",
      protected: true,
      staminaMultiplier: 0.96,
      fatigueMultiplier: 0.96,
      attackIntent: "selective_key_moments",
      sprintIntent: "low",
      komIntent: "situational",
      supportTarget: "self",
    },
    sprinter: {
      priority: "sprints",
      protected: true,
      staminaMultiplier: 1.0,
      fatigueMultiplier: 1.0,
      attackIntent: "low",
      sprintIntent: "high_when_points_available",
      komIntent: "low",
      supportTarget: "self",
    },
    lead_out_rider: {
      priority: "sprint_support_final",
      protected: false,
      staminaMultiplier: 1.14,
      fatigueMultiplier: 1.14,
      attackIntent: "low",
      sprintIntent: "support_only",
      komIntent: "low",
      supportTarget: "sprinter",
    },
    sprint_train_rider: {
      priority: "sprint_support_setup",
      protected: false,
      staminaMultiplier: 1.1,
      fatigueMultiplier: 1.1,
      attackIntent: "low",
      sprintIntent: "support_only",
      komIntent: "low",
      supportTarget: "sprinter",
    },
    climber: {
      priority: "kom_and_climbs",
      protected: false,
      staminaMultiplier: 1.06,
      fatigueMultiplier: 1.08,
      attackIntent: "high_on_climbs",
      sprintIntent: "low",
      komIntent: "high_when_points_available",
      supportTarget: "self",
    },
    mountain_domestique: {
      priority: "climb_support",
      protected: false,
      staminaMultiplier: 1.12,
      fatigueMultiplier: 1.14,
      attackIntent: "low",
      sprintIntent: "low",
      komIntent: "support_only",
      supportTarget: "team_leader_or_climber",
    },
    helper_domestique: {
      priority: "general_support",
      protected: false,
      staminaMultiplier: 1.12,
      fatigueMultiplier: 1.12,
      attackIntent: "low",
      sprintIntent: "low",
      komIntent: "low",
      supportTarget: "protected_riders",
    },
    breakaway_rider: {
      priority: "breakaway",
      protected: false,
      staminaMultiplier: 1.16,
      fatigueMultiplier: 1.16,
      attackIntent: "high",
      sprintIntent: "situational",
      komIntent: "situational",
      supportTarget: "self",
    },
    breakaway_chaser: {
      priority: "chase",
      protected: false,
      staminaMultiplier: 1.14,
      fatigueMultiplier: 1.14,
      attackIntent: "low",
      sprintIntent: "low",
      komIntent: "low",
      supportTarget: "team",
    },
    rouleur: {
      priority: "tempo_control_wind_chase",
      protected: false,
      staminaMultiplier: 1.1,
      fatigueMultiplier: 1.1,
      attackIntent: "low_to_normal",
      sprintIntent: "low",
      komIntent: "low",
      supportTarget: "team",
    },
    protected_rider: {
      priority: "safe_finish_main_group",
      protected: true,
      staminaMultiplier: 0.94,
      fatigueMultiplier: 0.94,
      attackIntent: "none",
      sprintIntent: "none_unless_forced",
      komIntent: "none_unless_forced",
      supportTarget: "self",
    },
    free_role: {
      priority: "neutral",
      protected: false,
      staminaMultiplier: 1.0,
      fatigueMultiplier: 1.0,
      attackIntent: "normal_opportunistic",
      sprintIntent: "normal_if_suitable",
      komIntent: "normal_if_suitable",
      supportTarget: "self",
    },
    time_trial_rider: {
      priority: "individual_time_trial",
      protected: false,
      staminaMultiplier: 1.0,
      fatigueMultiplier: 1.0,
      attackIntent: "none",
      sprintIntent: "none",
      komIntent: "none",
      supportTarget: "self",
    },
    team_time_trial_rider: {
      priority: "team_time_trial",
      protected: false,
      staminaMultiplier: 1.0,
      fatigueMultiplier: 1.0,
      attackIntent: "none",
      sprintIntent: "none",
      komIntent: "none",
      supportTarget: "team",
    },
  },
  individualCommandEffects: {
    follow_team_plan: {
      overrideStrength: 0,
      staminaMultiplier: 1.0,
      fatigueMultiplier: 1.0,
      mainEffect: "use_team_tactic_and_rider_role",
    },
    protect_leader: {
      overrideStrength: 0.75,
      staminaMultiplier: 1.12,
      fatigueMultiplier: 1.12,
      mainEffect: "protect_leader_or_protected_rider",
    },
    conserve_energy: {
      overrideStrength: 0.65,
      staminaMultiplier: 0.88,
      fatigueMultiplier: 0.88,
      mainEffect: "reduce_work_and_stay_sheltered",
    },
    stay_near_front: {
      overrideStrength: 0.55,
      staminaMultiplier: 1.05,
      fatigueMultiplier: 1.05,
      mainEffect: "improve_positioning_and_safety",
    },
    control_tempo: {
      overrideStrength: 0.8,
      staminaMultiplier: 1.14,
      fatigueMultiplier: 1.14,
      mainEffect: "ride_front_and_control_speed",
    },
    chase_breakaway: {
      overrideStrength: 0.85,
      staminaMultiplier: 1.16,
      fatigueMultiplier: 1.16,
      mainEffect: "close_gap_to_breakaway",
    },
    attack: {
      overrideStrength: 0.9,
      staminaMultiplier: 1.18,
      fatigueMultiplier: 1.18,
      mainEffect: "try_to_attack_or_create_split",
    },
    join_breakaway: {
      overrideStrength: 0.9,
      staminaMultiplier: 1.18,
      fatigueMultiplier: 1.18,
      mainEffect: "try_to_enter_or_follow_breakaway",
    },
    lead_out: {
      overrideStrength: 0.8,
      staminaMultiplier: 1.16,
      fatigueMultiplier: 1.16,
      mainEffect: "support_sprinter_before_sprint",
    },
    sprint: {
      overrideStrength: 0.85,
      staminaMultiplier: 1.2,
      fatigueMultiplier: 1.2,
      mainEffect: "contest_sprint_points_or_finish",
    },
    climb_hard: {
      overrideStrength: 0.85,
      staminaMultiplier: 1.18,
      fatigueMultiplier: 1.2,
      mainEffect: "increase_effort_on_climbs_or_kom",
    },
    avoid_risks: {
      overrideStrength: 0.6,
      staminaMultiplier: 0.94,
      fatigueMultiplier: 0.94,
      mainEffect: "prioritize_safety_and_group_finish",
    },
    controlled: {
      overrideStrength: 0.7,
      staminaMultiplier: 0.9,
      fatigueMultiplier: 0.9,
      mainEffect: "safer_slower_lower_stamina_cost",
    },
    steady: {
      overrideStrength: 0.6,
      staminaMultiplier: 1.0,
      fatigueMultiplier: 1.0,
      mainEffect: "normal_time_trial_rhythm",
    },
    hard: {
      overrideStrength: 0.8,
      staminaMultiplier: 1.12,
      fatigueMultiplier: 1.12,
      mainEffect: "faster_with_higher_stamina_and_fatigue_cost",
    },
    maximum_effort: {
      overrideStrength: 0.95,
      staminaMultiplier: 1.22,
      fatigueMultiplier: 1.22,
      mainEffect: "fastest_with_high_blow_up_risk",
    },
  },
} as const;

type StageIndividualTacticOption = {
  value: string;
  label: string;
  description: string;
};

const ROAD_PHASE_1_TO_3_TACTIC_OPTIONS: StageIndividualTacticOption[] = [
  {
    value: "follow_team_plan",
    label: "Follow Stage Role",
    description:
      "Default command. The rider follows the selected stage role and reacts normally to the race situation.",
  },
  {
    value: "protect_leader",
    label: "Protect Leader",
    description:
      "Stay with and protect the Team Leader, helping with positioning and reducing unnecessary exposure.",
  },
  {
    value: "stay_near_front",
    label: "Stay Near Front",
    description:
      "Maintain a forward peloton position to improve safety and tactical reaction.",
  },
  {
    value: "conserve_energy",
    label: "Conserve Energy",
    description:
      "Stay sheltered and avoid unnecessary work to save stamina for later phases.",
  },
  {
    value: "control_tempo",
    label: "Control Tempo",
    description:
      "Work near the front to control the peloton speed and discourage attacks.",
  },
  {
    value: "chase_breakaway",
    label: "Chase Breakaway",
    description:
      "Help reduce the gap to a dangerous breakaway at an increased stamina cost.",
  },
  {
    value: "attack",
    label: "Attack",
    description:
      "Attempt an attacking move during this phase when the race situation permits it.",
  },
  {
    value: "join_breakaway",
    label: "Join Breakaway",
    description:
      "Attempt to follow or bridge to a forming breakaway during this phase.",
  },
  {
    value: "fight_sprint_points",
    label: "Fight for Sprint Points",
    description:
      "Contest an intermediate sprint located in this phase when the rider remains eligible.",
  },
  {
    value: "fight_kom_points",
    label: "Fight for KOM Points",
    description:
      "Contest a KOM gate located in this phase when the rider remains eligible.",
  },
  {
    value: "avoid_risks",
    label: "Avoid Risks",
    description:
      "Prioritize safety and group position rather than attacks, chases or point contests.",
  },
];

const ROAD_PHASE_4_TACTIC_OPTIONS: StageIndividualTacticOption[] = [
  {
    value: "follow_team_plan",
    label: "Follow Stage Role",
    description:
      "Default final-phase command. Follow the selected stage role and react to the finish situation.",
  },
  {
    value: "protect_leader",
    label: "Protect Leader",
    description:
      "Protect the Team Leader through the final part of the stage.",
  },
  {
    value: "stay_near_front",
    label: "Stay Near Front",
    description:
      "Hold a forward position before the finish or final decisive section.",
  },
  {
    value: "fight_sprint_points",
    label: "Fight for Sprint Points",
    description:
      "Contest an intermediate sprint that falls inside the final phase.",
  },
  {
    value: "fight_kom_points",
    label: "Fight for KOM Points",
    description:
      "Contest a KOM gate that falls inside the final phase.",
  },
  {
    value: "sprint_train_rider",
    label: "Sprint Train Rider",
    description:
      "Ride in the sprint train before the final lead-out, helping keep speed and position for the team sprinter.",
  },
  {
    value: "lead_out_rider",
    label: "Lead-out Rider",
    description:
      "Act as the final rider before the sprinter launches. Multiple train riders plus one lead-out improve the sprinter setup.",
  },
  {
    value: "final_sprint",
    label: "Final Sprint",
    description:
      "Contest the stage finish as the designated sprinter when a sprint finish is available.",
  },
  {
    value: "avoid_risks",
    label: "Avoid Risks",
    description:
      "Prioritize a safe finish rather than joining the final sprint battle.",
  },
];

const STAGE_INDIVIDUAL_TACTIC_OPTIONS: StageIndividualTacticOption[] = [
  ...ROAD_PHASE_1_TO_3_TACTIC_OPTIONS,
  ...ROAD_PHASE_4_TACTIC_OPTIONS.filter(
    (option) =>
      !ROAD_PHASE_1_TO_3_TACTIC_OPTIONS.some(
        (existing) => existing.value === option.value,
      ),
  ),
];

const STAGE_INDIVIDUAL_TACTIC_LABELS = STAGE_INDIVIDUAL_TACTIC_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {} as Record<string, string>,
);

const LEGACY_INDIVIDUAL_TACTIC_MAP: Record<string, string> = {
  lead_out: "lead_out_rider",
  sprint: "fight_sprint_points",
  climb_hard: "fight_kom_points",
};


const TT_PACING_OPTIONS = [
  {
    value: "follow_team_plan",
    label: "Follow Team Plan",
  },
  {
    value: "controlled",
    label: "Controlled",
  },
  {
    value: "steady",
    label: "Steady",
  },
  {
    value: "hard",
    label: "Hard",
  },
  {
    value: "maximum_effort",
    label: "Maximum Effort",
  },
];

const TT_PACING_LABELS = TT_PACING_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {} as Record<string, string>,
);

function getStageIndividualTacticOptions(
  stage?: { stage_format?: string | null } | null,
  phaseKey?: string,
) {
  if (isTimeTrialStage(stage)) return TT_PACING_OPTIONS;

  return phaseKey === "phase_4"
    ? ROAD_PHASE_4_TACTIC_OPTIONS
    : ROAD_PHASE_1_TO_3_TACTIC_OPTIONS;
}

function getStageIndividualTacticLabels(
  stage?: { stage_format?: string | null } | null,
) {
  return isTimeTrialStage(stage)
    ? TT_PACING_LABELS
    : STAGE_INDIVIDUAL_TACTIC_LABELS;
}

function getStagePlanKey(stage?: JsonRecord | null): string {
  if (!stage) return "";
  return String(stage.id ?? stage.stage_id ?? stage.stage_number ?? "");
}

function findSavedStagePlan(
  stagePlans: JsonRecord[],
  stage: JsonRecord | null,
): JsonRecord | null {
  if (!stage) return null;

  const stageId = String(stage.id ?? "");
  const stageNumber = String(stage.stage_number ?? "");

  return (
    stagePlans.find((plan) => {
      const planStageId = String(plan.stage_id ?? "");
      const planStageNumber = String(plan.stage_number ?? "");

      return (
        (stageId && planStageId && planStageId === stageId) ||
        (stageNumber && planStageNumber && planStageNumber === stageNumber)
      );
    }) ?? null
  );
}

function findStagePlanReadiness(
  readinessByStageKey: Record<string, StagePlanReadinessStage>,
  stage: JsonRecord | null,
): StagePlanReadinessStage | null {
  if (!stage) return null;

  const stageId = String(stage.id ?? stage.stage_id ?? "");
  const stageNumber = String(stage.stage_number ?? "");

  return (
    (stageId ? readinessByStageKey[stageId] : null) ??
    (stageNumber ? readinessByStageKey[stageNumber] : null) ??
    null
  );
}

function getStageDistanceNumber(stage?: JsonRecord | null): number {
  if (!stage) return 0;

  const direct = Number(stage.distance_km ?? stage.stage_distance_km);

  if (Number.isFinite(direct) && direct > 0) return direct;

  const metadata = asRecord(stage.metadata);
  const profile = asRecord(metadata.route_profile_v1);
  const fallback = Number(profile.distance_km);

  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

function formatKmRangeValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
}

function getStagePhaseRanges(stage?: JsonRecord | null) {
  const distance = getStageDistanceNumber(stage);
  const safeDistance = distance > 0 ? distance : 120;

  if (isTimeTrialStage(stage)) {
    const splitKm = Number((safeDistance / 2).toFixed(1));
    const finishKm = Number(safeDistance.toFixed(1));

    return [
      {
        key: "before_split",
        number: 1,
        fromKm: 0,
        toKm: splitKm,
        label: "Before split",
        rangeLabel: `${formatKmRangeValue(0)}–${formatKmRangeValue(
          splitKm,
        )} km`,
      },
      {
        key: "after_split",
        number: 2,
        fromKm: splitKm,
        toKm: finishKm,
        label: "After split",
        rangeLabel: `${formatKmRangeValue(splitKm)}–${formatKmRangeValue(
          finishKm,
        )} km`,
      },
    ];
  }

  const phaseLength = safeDistance / 4;

  return [0, 1, 2, 3].map((index) => {
    const from = index === 0 ? 0 : Number((phaseLength * index).toFixed(1));
    const to =
      index === 3
        ? Number(safeDistance.toFixed(1))
        : Number((phaseLength * (index + 1)).toFixed(1));

    return {
      key: `phase_${index + 1}`,
      number: index + 1,
      fromKm: from,
      toKm: to,
      label: `Phase ${index + 1}`,
      rangeLabel: `${formatKmRangeValue(from)}–${formatKmRangeValue(to)} km`,
    };
  });
}

function createDefaultIndividualTacticsForRider(
  stage?: JsonRecord | null,
): Record<string, StageIndividualTacticPhaseCommand> {
  return getStagePhaseRanges(stage).reduce(
    (acc, phase) => {
      acc[phase.key] = {
        command: "follow_team_plan",
        from_km: phase.fromKm,
        to_km: phase.toKm,
        label: `${phase.label}: ${phase.rangeLabel}`,
      };
      return acc;
    },
    {} as Record<string, StageIndividualTacticPhaseCommand>,
  );
}

function normalizeIndividualTacticsForRider(
  value: unknown,
  stage?: JsonRecord | null,
): Record<string, StageIndividualTacticPhaseCommand> {
  const saved = asRecord(value);
  const fallback = createDefaultIndividualTacticsForRider(stage);

  getStagePhaseRanges(stage).forEach((phase) => {
    const savedPhase = asRecord(saved[phase.key]);
    const rawSavedCommand = String(
      savedPhase.command ?? saved[phase.key] ?? "",
    );
    const savedCommand =
      LEGACY_INDIVIDUAL_TACTIC_MAP[rawSavedCommand] ?? rawSavedCommand;
    const allowedOptions = getStageIndividualTacticOptions(stage, phase.key);
    const command = allowedOptions.some(
      (option) => option.value === savedCommand,
    )
      ? savedCommand
      : "follow_team_plan";

    fallback[phase.key] = {
      command,
      from_km: phase.fromKm,
      to_km: phase.toKm,
      label: `${phase.label}: ${phase.rangeLabel}`,
    };
  });

  return fallback;
}

function normalizeRiderSupplyDraft(value: unknown): StageRiderSupplyDraft {
  const record = asRecord(value);

  return {
    bidons: Number(record.bidons ?? record.bidons_water_bottles ?? 2),
    gels: Number(record.gels ?? record.energy_gels ?? 2),
    nutrition_packs: Number(record.nutrition_packs ?? 1),
    race_jersey_complete: Boolean(
      record.race_jersey_complete ?? record.race_jersey ?? true,
    ),
    rain_jacket: Boolean(record.rain_jacket ?? record.rain_jackets ?? false),
  };
}

function normalizeStageRiderRole(
  value: unknown,
  stage?: { stage_format?: string | null } | null,
): StageRiderRoleCode | string {
  if (isTimeTrialStage(stage)) {
    return getTimeTrialStageRole(stage);
  }

  const savedRole = String(value ?? "");
  const normalizedRole = LEGACY_STAGE_RIDER_ROLE_MAP[savedRole] ?? savedRole;

  return STAGE_RIDER_ROLE_OPTIONS.some(
    (option) => option.value === normalizedRole,
  )
    ? normalizedRole
    : DEFAULT_STAGE_RIDER_ROLE;
}

function normalizeRiderRolesForStage(
  riders: JsonRecord[],
  riderRolesByRider: Record<string, StageRiderRoleCode | string>,
  stage?: { stage_format?: string | null } | null,
) {
  return riders.reduce<Record<string, StageRiderRoleCode | string>>(
    (acc, rider) => {
      const riderId = String(rider.id ?? "");
      if (!riderId) return acc;

      acc[riderId] = normalizeStageRiderRole(riderRolesByRider[riderId], stage);
      return acc;
    },
    {},
  );
}

function normalizeIndividualTacticsByRiderForStage(
  riders: JsonRecord[],
  individualTacticsByRider: StageIndividualTacticsByRider,
  stage?: JsonRecord | null,
): StageIndividualTacticsByRider {
  return riders.reduce<StageIndividualTacticsByRider>((acc, rider) => {
    const riderId = String(rider.id ?? "");
    if (!riderId) return acc;

    acc[riderId] = normalizeIndividualTacticsForRider(
      individualTacticsByRider[riderId],
      stage,
    );
    return acc;
  }, {});
}

function createStagePlanDraft({
  riders,
  equipmentPresetOptions,
  savedPlan,
  stage,
}: {
  riders: JsonRecord[];
  equipmentPresetOptions: EquipmentSetupPresetOption[];
  savedPlan?: JsonRecord | null;
  stage?: JsonRecord | null;
}): StagePlanDraft {
  const savedEquipment = asRecord(
    savedPlan?.rider_equipment_json ?? savedPlan?.equipment_json,
  );
  const savedRoles = asRecord(savedPlan?.rider_roles_json);
  const savedSupplies = asRecord(savedPlan?.rider_supplies_json);
  const savedTactic = asRecord(savedPlan?.team_tactic_json);
  const savedIndividualTactics = asRecord(
    savedPlan?.rider_individual_tactics_json,
  );
  const defaultPresetId = equipmentPresetOptions[0]?.id ?? "";

  const equipmentByRider: Record<string, string> = {};
  const riderRolesByRider: Record<string, StageRiderRoleCode | string> = {};
  const individualTacticsByRider: StageIndividualTacticsByRider = {};
  const suppliesByRider: Record<string, StageRiderSupplyDraft> = {};

  riders.forEach((rider) => {
    const riderId = String(rider.id ?? "");
    if (!riderId) return;

    equipmentByRider[riderId] = String(
      savedEquipment[riderId] ?? defaultPresetId,
    );
    riderRolesByRider[riderId] = normalizeStageRiderRole(
      savedRoles[riderId],
      stage,
    );
    individualTacticsByRider[riderId] = normalizeIndividualTacticsForRider(
      savedIndividualTactics[riderId],
      stage,
    );
    suppliesByRider[riderId] = normalizeRiderSupplyDraft(
      savedSupplies[riderId],
    );
  });

  return {
    equipmentByRider,
    riderRolesByRider,
    individualTacticsByRider,
    suppliesByRider,
    teamTactic: {
      plan: normalizeStageTacticPlan(
        savedTactic.plan ?? savedPlan?.team_strategy,
        stage,
      ),
      notes: String(savedTactic.notes ?? savedPlan?.tactical_notes ?? ""),
    },
    lastSavedAt: savedPlan?.last_saved_at
      ? String(savedPlan.last_saved_at)
      : null,
  };
}

function parseGameTimestamp(value: unknown): number | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const parsed = Date.parse(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function getStageStartTimestamp(stage: JsonRecord): number | null {
  const dateText = String(
    stage.stage_date ?? stage.date ?? stage.start_date ?? "",
  ).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;

  const hour = Number(
    stage.planned_start_hour_number ??
      stage.planned_start_hour ??
      stage.start_hour ??
      0,
  );
  const minute = Number(stage.planned_start_minute ?? stage.start_minute ?? 0);

  const safeHour = Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 0;
  const safeMinute = Number.isFinite(minute)
    ? Math.max(0, Math.min(59, minute))
    : 0;

  return Date.parse(
    `${dateText}T${String(safeHour).padStart(2, "0")}:${String(
      safeMinute,
    ).padStart(2, "0")}:00`,
  );
}

function formatGameTimestampLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";

  const date = new Date(value);
  const season = date.getUTCFullYear() - 1999;
  const weekday = date.toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
  const monthLabel = monthLabels[date.getUTCMonth()] ?? "—";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");

  return `S${season} · ${weekday} · ${monthLabel} ${day} · ${hour}:${minute}`;
}

function getStagePlanLockInfo({
  stage,
  currentGameTimestamp,
}: {
  stage: JsonRecord | null;
  currentGameTimestamp?: string;
}) {
  const baseLabel = `Locks ${STAGE_PLAN_LOCK_HOURS_BEFORE_START} hours before stage start`;

  if (!stage) {
    return {
      isLocked: false,
      lockLabel: baseLabel,
      lockMessage: "",
      statusLabel: "Open",
      statusTone: "open" as const,
      statusHint: "Select a stage to see the exact lock time.",
      lockAtLabel: "—",
      stageStartLabel: "—",
    };
  }

  const stageStartTs = getStageStartTimestamp(stage);
  const currentTs = parseGameTimestamp(currentGameTimestamp);

  if (stageStartTs === null || currentTs === null) {
    return {
      isLocked: false,
      lockLabel: baseLabel,
      lockMessage: "",
      statusLabel: "Open",
      statusTone: "open" as const,
      statusHint: "Exact lock timing is not available from the current data.",
      lockAtLabel: "—",
      stageStartLabel: "—",
    };
  }

  const lockTs =
    stageStartTs - STAGE_PLAN_LOCK_HOURS_BEFORE_START * 60 * 60 * 1000;
  const isLocked = currentTs >= lockTs;

  return {
    isLocked,
    lockLabel: baseLabel,
    lockAtLabel: formatGameTimestampLabel(lockTs),
    stageStartLabel: formatGameTimestampLabel(stageStartTs),
    statusLabel: isLocked ? "Locked" : "Open",
    statusTone: isLocked ? ("locked" as const) : ("open" as const),
    statusHint: isLocked
      ? "This stage plan is locked because the current game time is already at or after the stage lock time."
      : "This stage plan is still open and can be edited until the lock time is reached.",
    lockMessage: isLocked
      ? `Stage Plan locked. This stage starts in less than ${STAGE_PLAN_LOCK_HOURS_BEFORE_START} hours, so changes can no longer be saved.`
      : "",
  };
}

function StagePlansTab({
  target,
  packageSubmitted,
  raceId,
  selectedRiders,
  equipmentPresetOptions,
  supplyOptions,
  standardizedBonus,
  exactBonusPreview,
  hasSportDirectorAssigned,
  tacticalPlannerChoice,
  u23HeadCoachId,
  u23AutomationEnabled,
  selectedStageIdFromUrl,
  onOpenRacePreview,
}: {
  target: RacePreparationTarget | null;
  packageSubmitted: boolean;
  raceId: UUID | null;
  selectedRiders: JsonRecord[];
  equipmentPresetOptions: EquipmentSetupPresetOption[];
  supplyOptions: RaceSupplyOption[];
  standardizedBonus: JsonRecord;
  exactBonusPreview: JsonRecord;
  hasSportDirectorAssigned: boolean;
  tacticalPlannerChoice: RacePreparationTacticalPlannerChoice;
  u23HeadCoachId: UUID | null;
  u23AutomationEnabled: boolean;
  selectedStageIdFromUrl?: string | null;
  onOpenRacePreview: (raceId: UUID) => void;
}) {
  const stages = target?.stages ?? [];
  const stagePlans = target?.stage_plans ?? [];
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);
  const [stageDraftsByStageKey, setStageDraftsByStageKey] = useState<
    Record<string, StagePlanDraft>
  >({});
  const [savingStagePlan, setSavingStagePlan] = useState(false);
  const [stageSaveMessage, setStageSaveMessage] = useState<string | null>(null);
  const [stageSaveError, setStageSaveError] = useState<string | null>(null);
  const [stagePlanReadinessSummary, setStagePlanReadinessSummary] =
    useState<StagePlanReadinessSummary | null>(null);
  const [stagePlanReadinessStages, setStagePlanReadinessStages] = useState<
    StagePlanReadinessStage[]
  >([]);
  const [stagePlanReadinessLoading, setStagePlanReadinessLoading] =
    useState(false);
  const [sportDirectorLoading, setSportDirectorLoading] = useState(false);
  const [sportDirectorSuggestion, setSportDirectorSuggestion] =
    useState<SportDirectorSuggestionResponse | null>(null);
  const [u23AutomationDashboard, setU23AutomationDashboard] =
    useState<U23StagePlanAutomationDashboard | null>(null);
  const [u23AutomationDashboardLoading, setU23AutomationDashboardLoading] =
    useState(false);

  const selectedStage = stages[selectedStageIndex] ?? stages[0] ?? null;
  const selectedStageWeatherCanceled =
    isPreparationStageWeatherCanceled(selectedStage);
  const selectedStageWeatherRiskReason =
    getPreparationStageWeatherRiskReason(selectedStage);
  const targetRaceWeatherStatus = getWeatherCancellationStatusFromRace(
    target?.race,
  );
  const targetRaceAllWeatherCanceled = isRaceAllWeatherCanceledInPreparation(
    target?.race,
  );
  const selectedStageLockedByWeather =
    targetRaceAllWeatherCanceled || selectedStageWeatherCanceled;
  const isTTStage = isTimeTrialStage(selectedStage);
  const isTTTStage = selectedStage?.stage_format === "team_time_trial";
  const suppliesDisabledForTT = isTTStage;
  const selectedStageKey = getStagePlanKey(selectedStage);
  const u23Setting = asRecord(u23AutomationDashboard?.setting);
  const isU23ManagedRace =
    tacticalPlannerChoice === "u23_head_coach" ||
    Boolean(u23Setting.planner_staff_id) ||
    u23AutomationEnabled;
  const sportDirectorAutoFillDisabled =
    isU23ManagedRace ||
    !hasSportDirectorAssigned ||
    selectedStageLockedByWeather;
  const sportDirectorDisabledReason = targetRaceAllWeatherCanceled
    ? "This race was canceled due to weather."
    : selectedStageWeatherCanceled
      ? "This stage was canceled due to weather."
      : isU23ManagedRace
        ? "This Developing Team race is managed by the U23 Head Coach."
        : sportDirectorAutoFillDisabled
          ? "Assign a Sport Director in the Race Plan first."
          : undefined;
  const selectedSavedStagePlan = findSavedStagePlan(stagePlans, selectedStage);
  const racePreparationIdForStageReadiness = String(
    asRecord(target?.preparation).id ?? "",
  );
  const raceIdForStageReadiness = String(
    asRecord(target?.race).id ?? raceId ?? "",
  );

  const u23DashboardStages = toArray<U23StagePlanDashboardStage>(
    u23AutomationDashboard?.stages,
  );
  const selectedU23DashboardStage =
    u23DashboardStages.find((row) => {
      const stageId = String(asRecord(selectedStage).id ?? "");
      const stageNumber = getNumber(selectedStage, "stage_number");

      return (
        (stageId && String(row.stage_id ?? "") === stageId) ||
        (stageNumber > 0 && Number(row.stage_number ?? 0) === stageNumber)
      );
    }) ?? null;
  const selectedStageManagement = asRecord(
    selectedU23DashboardStage?.management,
  );
  const selectedStageManagementMode = String(
    selectedStageManagement.management_mode ?? "",
  );
  const selectedStageManagementSource = String(
    selectedStageManagement.source_type ?? "",
  );
  const selectedStageQualityScore =
    selectedStageManagement.decision_quality_score;
  const selectedStageQualityTier = getPlannerQualityTierLabel(
    selectedStageQualityScore,
  );
  const selectedStageBasedOnStageId = String(
    selectedStageManagement.based_on_stage_id ?? "",
  );
  const selectedStageBasedOnStageNumber = getNumber(
    stages.find(
      (stage) =>
        String(asRecord(stage).id ?? "") === selectedStageBasedOnStageId,
    ),
    "stage_number",
  );
  const u23PlannerStaffName = String(
    toArray<JsonRecord>(u23AutomationDashboard?.eligible_u23_head_coaches).find(
      (coach) =>
        String(coach.staff_id ?? coach.id ?? "") ===
        String(u23HeadCoachId ?? u23Setting.planner_staff_id ?? ""),
    )?.staff_name ?? "U23 Head Coach",
  );

  const u23GeneratedStageCount = u23DashboardStages.filter((row) => {
    const management = asRecord(row.management);

    return (
      Boolean(row.last_saved_at) &&
      String(management.management_mode ?? "") === "coach" &&
      String(management.source_type ?? "") === "u23_head_coach"
    );
  }).length;

  const u23ExistingManualStageCount = u23DashboardStages.filter((row) => {
    const management = asRecord(row.management);
    return String(management.management_mode ?? "") === "manual";
  }).length;

  const u23WeatherCancelledStageCount = stages.filter((stage) =>
    isPreparationStageWeatherCanceled(stage),
  ).length;

  const u23ScheduledStageCount = Math.max(
    stages.length -
      u23GeneratedStageCount -
      u23ExistingManualStageCount -
      u23WeatherCancelledStageCount,
    0,
  );

  const selectedU23StageHasSavedPlan = Boolean(
    selectedU23DashboardStage?.last_saved_at ??
      asRecord(selectedSavedStagePlan).last_saved_at,
  );

  const selectedU23StageStatusLabel =
    selectedStageManagementMode === "manual"
      ? "Existing manual plan · view only"
      : selectedStageManagementSource === "u23_head_coach" &&
          selectedU23StageHasSavedPlan
        ? "Coach plan"
        : "Scheduled";

  const selectedU23StageStatusHint =
    selectedStageManagementMode === "manual"
      ? "This older manual plan remains visible, but it cannot be changed while U23 automation is active."
      : selectedStageManagementSource === "u23_head_coach" &&
          selectedU23StageHasSavedPlan
        ? `${u23PlannerStaffName} generated and saved this Stage Plan automatically.`
        : getNumber(selectedStage, "stage_number") > 1
          ? `The U23 Head Coach will generate this plan after Stage ${Math.max(
              getNumber(selectedStage, "stage_number") - 1,
              1,
            )} finishes.`
          : "The U23 Head Coach will generate Stage 1 immediately after automation is activated.";

  const stagePlanControlsReadOnly = packageSubmitted && isU23ManagedRace;

  const stagePlanReadinessByStageKey = useMemo(() => {
    const next: Record<string, StagePlanReadinessStage> = {};

    stagePlanReadinessStages.forEach((row) => {
      if (row.stage_id) next[String(row.stage_id)] = row;
      if (row.stage_number) next[String(row.stage_number)] = row;
    });

    return next;
  }, [stagePlanReadinessStages]);

  const selectedStageReadiness = findStagePlanReadiness(
    stagePlanReadinessByStageKey,
    selectedStage,
  );

  const selectedDraft =
    (selectedStageKey && stageDraftsByStageKey[selectedStageKey]) ||
    createStagePlanDraft({
      riders: selectedRiders,
      equipmentPresetOptions,
      savedPlan: selectedSavedStagePlan,
      stage: selectedStage,
    });

  const lockInfo = getStagePlanLockInfo({
    stage: selectedStage,
    currentGameTimestamp: target?.current_game_timestamp,
  });

  const stageSaveDisabled =
    !packageSubmitted ||
    !selectedStage ||
    !selectedStageKey ||
    selectedStageLockedByWeather ||
    lockInfo.isLocked ||
    stagePlanControlsReadOnly ||
    savingStagePlan;

  async function loadU23AutomationDashboardForCurrentTarget() {
    if (!racePreparationIdForStageReadiness || !packageSubmitted) {
      setU23AutomationDashboard(null);
      return;
    }

    setU23AutomationDashboardLoading(true);

    try {
      const dashboard = await loadU23StagePlanAutomationDashboard(
        racePreparationIdForStageReadiness,
      );
      setU23AutomationDashboard(dashboard);
    } catch (error) {
      console.warn(
        "Could not load U23 Stage Plan automation dashboard:",
        error,
      );
      setU23AutomationDashboard(null);
    } finally {
      setU23AutomationDashboardLoading(false);
    }
  }

  async function loadStagePlanReadinessForCurrentTarget() {
    if (!racePreparationIdForStageReadiness || !packageSubmitted) {
      setStagePlanReadinessSummary(null);
      setStagePlanReadinessStages([]);
      return;
    }

    setStagePlanReadinessLoading(true);

    const { data, error } = await supabase.rpc(
      "get_race_stage_plan_readiness_ui_v1",
      {
        p_race_preparation_id: racePreparationIdForStageReadiness,
        p_race_id: raceIdForStageReadiness || null,
      },
    );

    if (error) {
      console.warn("Could not load stage plan readiness:", error.message);
      setStagePlanReadinessSummary(null);
      setStagePlanReadinessStages([]);
      setStagePlanReadinessLoading(false);
      return;
    }

    const payload = data as StagePlanReadinessUiResponse | null;

    setStagePlanReadinessSummary(
      Array.isArray(payload?.summary) ? (payload.summary[0] ?? null) : null,
    );
    setStagePlanReadinessStages(
      Array.isArray(payload?.stages) ? payload.stages : [],
    );
    setStagePlanReadinessLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadReadiness() {
      if (!racePreparationIdForStageReadiness || !packageSubmitted) {
        setStagePlanReadinessSummary(null);
        setStagePlanReadinessStages([]);
        return;
      }

      setStagePlanReadinessLoading(true);

      const { data, error } = await supabase.rpc(
        "get_race_stage_plan_readiness_ui_v1",
        {
          p_race_preparation_id: racePreparationIdForStageReadiness,
          p_race_id: raceIdForStageReadiness || null,
        },
      );

      if (cancelled) return;

      if (error) {
        console.warn("Could not load stage plan readiness:", error.message);
        setStagePlanReadinessSummary(null);
        setStagePlanReadinessStages([]);
        setStagePlanReadinessLoading(false);
        return;
      }

      const payload = data as StagePlanReadinessUiResponse | null;

      setStagePlanReadinessSummary(
        Array.isArray(payload?.summary) ? (payload.summary[0] ?? null) : null,
      );
      setStagePlanReadinessStages(
        Array.isArray(payload?.stages) ? payload.stages : [],
      );
      setStagePlanReadinessLoading(false);
    }

    void loadReadiness();

    return () => {
      cancelled = true;
    };
  }, [
    racePreparationIdForStageReadiness,
    raceIdForStageReadiness,
    packageSubmitted,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!racePreparationIdForStageReadiness || !packageSubmitted) {
        setU23AutomationDashboard(null);
        return;
      }

      setU23AutomationDashboardLoading(true);

      try {
        const dashboard = await loadU23StagePlanAutomationDashboard(
          racePreparationIdForStageReadiness,
        );

        if (!cancelled) {
          setU23AutomationDashboard(dashboard);
        }
      } catch (error) {
        console.warn(
          "Could not load U23 Stage Plan automation dashboard:",
          error,
        );

        if (!cancelled) {
          setU23AutomationDashboard(null);
        }
      } finally {
        if (!cancelled) {
          setU23AutomationDashboardLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [
    racePreparationIdForStageReadiness,
    packageSubmitted,
    tacticalPlannerChoice,
    u23AutomationEnabled,
  ]);

  useEffect(() => {
    if (!hasSportDirectorAssigned || isU23ManagedRace) {
      setSportDirectorSuggestion(null);
      setStageSaveError((current) =>
        current ===
        "A Sport Director must be assigned in the Race Plan before auto-fill can be used."
          ? null
          : current,
      );
    }
  }, [hasSportDirectorAssigned, isU23ManagedRace]);

  useEffect(() => {
    if (!selectedStageIdFromUrl) return;

    const index = stages.findIndex(
      (stage) => String(stage.id) === selectedStageIdFromUrl,
    );

    if (index >= 0) {
      setSelectedStageIndex(index);
    }
  }, [selectedStageIdFromUrl, stages]);

  useEffect(() => {
    const next: Record<string, StagePlanDraft> = {};

    stages.forEach((stage) => {
      const key = getStagePlanKey(stage);
      if (!key) return;

      next[key] = createStagePlanDraft({
        riders: selectedRiders,
        equipmentPresetOptions,
        savedPlan: findSavedStagePlan(stagePlans, stage),
        stage,
      });
    });

    setStageDraftsByStageKey(next);
    setStageSaveMessage(null);
    setStageSaveError(null);
    setSportDirectorSuggestion(null);
  }, [
    target?.preparation?.id,
    stages,
    stagePlans,
    selectedRiders,
    equipmentPresetOptions,
  ]);

  function updateSelectedStageDraft(
    updater: (current: StagePlanDraft) => StagePlanDraft,
  ) {
    if (!selectedStageKey) return;

    setStageDraftsByStageKey((prev) => {
      const current =
        prev[selectedStageKey] ??
        createStagePlanDraft({
          riders: selectedRiders,
          equipmentPresetOptions,
          savedPlan: selectedSavedStagePlan,
          stage: selectedStage,
        });

      return {
        ...prev,
        [selectedStageKey]: updater(current),
      };
    });

    setStageSaveMessage(null);
    setStageSaveError(null);
  }

  async function handleSaveStagePlan() {
    if (!target || !selectedStage || !selectedStageKey) return;

    const preparation = asRecord(target.preparation);
    const race = asRecord(target.race);
    const entry = asRecord(target.entry);
    const racePreparationId = String(preparation.id ?? "");
    const resolvedRaceId = String(race.id ?? raceId ?? "");
    const clubId = String(preparation.club_id ?? entry.club_id ?? "");
    const stageNumber = Number(
      selectedStage.stage_number ?? selectedStageIndex + 1,
    );
    const selectedStageId = String(selectedStage.id ?? "");

    if (!racePreparationId || !resolvedRaceId || !clubId || !stageNumber) {
      setStageSaveError(
        "Cannot save this stage plan because required IDs are missing.",
      );
      return;
    }

    if (targetRaceAllWeatherCanceled) {
      setStageSaveError(
        "This race was canceled due to weather, so Stage Plans are locked.",
      );
      return;
    }

    if (lockInfo.isLocked) {
      setStageSaveError(lockInfo.lockMessage);
      return;
    }

    if (selectedStageWeatherCanceled) {
      setStageSaveError(
        "This stage was canceled due to weather, so no Stage Plan can be saved.",
      );
      return;
    }

    if (stagePlanControlsReadOnly) {
      setStageSaveError(
        "This Stage Plan is managed by the U23 Head Coach and is view-only. Switch the Tactical Planner to Sport Director in the Race Plan before making manual changes.",
      );
      return;
    }

    setSavingStagePlan(true);
    setStageSaveMessage(null);
    setStageSaveError(null);

    try {
      const stagePhaseRanges = getStagePhaseRanges(selectedStage);
      const riderIndividualTacticsJson =
        normalizeIndividualTacticsByRiderForStage(
          selectedRiders,
          selectedDraft.individualTacticsByRider,
          selectedStage,
        );

      const result = await saveRaceStagePlan({
        club_id: clubId,
        race_preparation_id: racePreparationId,
        race_id: resolvedRaceId,
        stage_id: selectedStageId || null,
        stage_number: stageNumber,
        team_tactic_json: {
          plan: normalizeStageTacticPlan(
            selectedDraft.teamTactic.plan,
            selectedStage,
          ),
          engine_model_version: STAGE_TACTIC_ENGINE_MODEL_V1.version,
          race_situation_factors: getStageRaceSituationFactors(selectedStage),
          stage_phase_ranges: stagePhaseRanges,
          phase_count: stagePhaseRanges.length,
          is_time_trial_stage: isTTStage,
          is_team_time_trial_stage: isTTTStage,
        },
        rider_individual_tactics_json: riderIndividualTacticsJson,
        rider_roles_json: normalizeRiderRolesForStage(
          selectedRiders,
          selectedDraft.riderRolesByRider,
          selectedStage,
        ),
        rider_equipment_json: selectedDraft.equipmentByRider,
        rider_supplies_json: isTTStage ? {} : selectedDraft.suppliesByRider,
      });

      setStageDraftsByStageKey((prev) => ({
        ...prev,
        [selectedStageKey]: {
          ...selectedDraft,
          lastSavedAt:
            typeof result.last_saved_at === "string"
              ? result.last_saved_at
              : new Date().toISOString(),
        },
      }));

      setStageSaveMessage("Stage Plan saved for this stage.");
      await Promise.all([
        loadStagePlanReadinessForCurrentTarget(),
        loadU23AutomationDashboardForCurrentTarget(),
      ]);
    } catch (error) {
      setStageSaveError(
        error instanceof Error ? error.message : "Failed to save Stage Plan.",
      );
    } finally {
      setSavingStagePlan(false);
    }
  }

  async function handleAskSportDirector(
    section: SportDirectorSuggestionSection,
  ) {
    if (!target || !selectedStage || !selectedStageKey) return;

    if (!hasSportDirectorAssigned || isU23ManagedRace) {
      return;
    }

    const preparation = asRecord(target.preparation);
    const race = asRecord(target.race);
    const entry = asRecord(target.entry);
    const racePreparationId = String(preparation.id ?? "");
    const resolvedClubId = String(preparation.club_id ?? entry.club_id ?? "");
    const selectedStageId = String(selectedStage.id ?? "");

    if (!racePreparationId || !resolvedClubId || !selectedStageId) {
      setStageSaveError(
        "Cannot ask the Sport Director because required IDs are missing.",
      );
      return;
    }

    if (targetRaceAllWeatherCanceled) {
      setStageSaveError(
        "This race was canceled due to weather, so the Sport Director cannot create Stage Plans for it.",
      );
      return;
    }

    if (lockInfo.isLocked) {
      setStageSaveError(lockInfo.lockMessage);
      return;
    }

    if (selectedStageWeatherCanceled) {
      setStageSaveError(
        "This stage was canceled due to weather, so the Sport Director cannot create a Stage Plan for it.",
      );
      return;
    }

    setSportDirectorLoading(true);
    setSportDirectorSuggestion(null);
    setStageSaveMessage(null);
    setStageSaveError(null);

    try {
      const result = (await askSportDirectorForStagePlan({
        racePreparationId,
        stageId: selectedStageId,
        clubId: resolvedClubId,
      })) as SportDirectorSuggestionResponse;

      const resultRecord = asRecord(result);

      if (String(resultRecord.status ?? "") !== "ok") {
        setStageSaveError(
          String(
            resultRecord.message ??
              resultRecord.safe_frontend_label ??
              "Sport Director could not create a suggestion for this stage.",
          ),
        );
        return;
      }

      const suggestion = asRecord(resultRecord.suggestion);
      const suggestedRoles = asRecord(suggestion.rider_roles_json);
      const suggestedEquipment = asRecord(suggestion.rider_equipment_json);
      const suggestedSupplies = asRecord(suggestion.rider_supplies_json);
      const suggestedTeamTactic = asRecord(suggestion.team_tactic_json);
      const suggestedIndividualTactics = asRecord(
        suggestion.rider_individual_tactics_json,
      );

      updateSelectedStageDraft((current) => {
        const nextRolesByRider = { ...current.riderRolesByRider };
        const nextEquipmentByRider = { ...current.equipmentByRider };
        const nextSuppliesByRider = { ...current.suppliesByRider };
        const nextIndividualTacticsByRider = {
          ...current.individualTacticsByRider,
        };

        const roleHintsForEquipment = {
          ...current.riderRolesByRider,
          ...suggestedRoles,
        };

        const smartEquipmentSuggestion = buildSportDirectorEquipmentSuggestion({
          riders: selectedRiders,
          stage: selectedStage,
          equipmentPresetOptions,
          currentEquipmentByRider: current.equipmentByRider,
          suggestedRoles: roleHintsForEquipment,
          backendEquipment: suggestedEquipment,
        });

        selectedRiders.forEach((rider) => {
          const riderId = String(rider.id ?? "");
          if (!riderId) return;

          if (section === "team" && suggestedRoles[riderId] !== undefined) {
            nextRolesByRider[riderId] = normalizeStageRiderRole(
              suggestedRoles[riderId],
              selectedStage,
            );
          }

          if (
            section === "equipment" &&
            smartEquipmentSuggestion[riderId] !== undefined
          ) {
            nextEquipmentByRider[riderId] = String(
              smartEquipmentSuggestion[riderId],
            );
          }

          if (
            section === "supplies" &&
            suggestedSupplies[riderId] !== undefined
          ) {
            nextSuppliesByRider[riderId] = normalizeRiderSupplyDraft(
              suggestedSupplies[riderId],
            );
          }

          if (
            section === "individual" &&
            suggestedIndividualTactics[riderId] !== undefined
          ) {
            nextIndividualTacticsByRider[riderId] =
              normalizeIndividualTacticsForRider(
                suggestedIndividualTactics[riderId],
                selectedStage,
              );
          }
        });

        const nextDraft: StagePlanDraft = { ...current };

        if (section === "team") {
          nextDraft.riderRolesByRider = nextRolesByRider;
          nextDraft.teamTactic = {
            ...current.teamTactic,
            plan: normalizeStageTacticPlan(
              suggestedTeamTactic.plan ?? current.teamTactic.plan,
              selectedStage,
            ),
            notes: String(
              suggestedTeamTactic.notes ??
                current.teamTactic.notes ??
                "Auto-filled by Sport Director suggestion.",
            ),
          };
        }

        if (section === "equipment") {
          nextDraft.equipmentByRider = nextEquipmentByRider;
        }

        if (section === "supplies") {
          nextDraft.suppliesByRider = isTTStage ? {} : nextSuppliesByRider;
        }

        if (section === "individual") {
          nextDraft.individualTacticsByRider = nextIndividualTacticsByRider;
        }

        return nextDraft;
      });

      setSportDirectorSuggestion(result);
      setStageSaveMessage(
        section === "equipment"
          ? "Sport Director equipment suggestion applied. It now varies packages by stage profile, rider role, KOM/sprint balance and setup availability. Review it and click Save Stage Plan."
          : `Sport Director suggestion applied to ${titleFromSnake(
              section,
            ).toLowerCase()}. Review it and click Save Stage Plan.`,
      );
    } catch (error) {
      setStageSaveError(
        error instanceof Error
          ? error.message
          : "Failed to ask Sport Director for a stage plan.",
      );
    } finally {
      setSportDirectorLoading(false);
    }
  }

  if (!target?.has_target) {
    return <EmptyCard message="No accepted race selected." />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Stage Plans
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Select a stage below to review its profile, then configure
              equipment, team tactics and optional individual tactics for that
              stage.
            </p>
          </div>

          {raceId && (
            <button
              type="button"
              onClick={() => onOpenRacePreview(raceId)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open Race Page
            </button>
          )}
        </div>

        {selectedStage && (
          <SelectedStagePlanProfileCard stage={selectedStage} />
        )}

        {targetRaceWeatherStatus ? (
          <div className="mt-4">
            <WeatherCancellationPreparationNotice
              race={target?.race}
              stage={selectedStage}
            />
          </div>
        ) : null}

        {selectedStage &&
        selectedStageWeatherRiskReason &&
        !targetRaceAllWeatherCanceled ? (
          <WeatherCancellationRiskPreparationNotice stage={selectedStage} />
        ) : null}
      </section>

      {!packageSubmitted && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
          Submit the Race Plan first. Stage Plans become configurable after the
          rider deadline or after confirmed early submission.
        </div>
      )}

      {packageSubmitted &&
        !lockInfo.isLocked &&
        !targetRaceAllWeatherCanceled && (
          <div
            className={[
              "rounded-2xl border px-4 py-3 shadow-sm",
              isU23ManagedRace
                ? stagePlanReadinessToneClasses.green
                : stagePlanReadinessSummary
                  ? stagePlanReadinessToneClasses[
                      stagePlanReadinessSummary.ui_tone
                    ]
                  : stagePlanReadinessToneClasses.gray,
            ].join(" ")}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold">
                  {isU23ManagedRace
                    ? "U23 Head Coach Stage Plan schedule"
                    : stagePlanReadinessLoading
                      ? "Checking Stage Plans…"
                      : (stagePlanReadinessSummary?.readiness_label ??
                        "Stage Plan readiness")}
                </div>

                <div className="mt-1 text-sm opacity-90">
                  {isU23ManagedRace
                    ? "Stage 1 is generated immediately when automation is activated. Each later stage is generated after the previous stage finishes, using the latest results, fatigue, health, weather and race situation."
                    : (stagePlanReadinessSummary?.recommended_action ??
                      "Stage Plan readiness will appear after the Race Plan is submitted.")}
                </div>
              </div>

              {isU23ManagedRace ? (
                <div className="text-right text-xs font-semibold opacity-90">
                  <div>
                    Generated {u23GeneratedStageCount}/{stages.length} stages
                  </div>
                  {u23ScheduledStageCount > 0 ? (
                    <div>Scheduled {u23ScheduledStageCount}</div>
                  ) : null}
                  {u23ExistingManualStageCount > 0 ? (
                    <div>Existing manual {u23ExistingManualStageCount}</div>
                  ) : null}
                </div>
              ) : stagePlanReadinessSummary ? (
                <div className="text-right text-xs font-semibold opacity-90">
                  <div>
                    Saved {stagePlanReadinessSummary.saved_stage_plans}/
                    {stagePlanReadinessSummary.total_stage_plans} stages
                  </div>
                  {stagePlanReadinessSummary.missing_stage_plans > 0 && (
                    <div>
                      Missing {stagePlanReadinessSummary.missing_stage_plans}
                    </div>
                  )}
                  {stagePlanReadinessSummary.saved_without_supplies > 0 && (
                    <div>
                      No supplies{" "}
                      {stagePlanReadinessSummary.saved_without_supplies}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}

      {packageSubmitted && isU23ManagedRace ? (
        <div
          className={[
            "rounded-2xl border px-4 py-3 shadow-sm",
            selectedStageManagementMode === "manual"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold">
                {u23AutomationDashboardLoading
                  ? "Loading U23 Head Coach status…"
                  : selectedStageManagementMode === "manual"
                    ? "Existing manual plan"
                    : selectedStageManagementSource === "u23_head_coach"
                      ? "Managed by U23 Head Coach"
                      : "U23 Head Coach automation active"}
              </div>

              <div className="mt-1 text-sm leading-6 opacity-90">
                {selectedStageManagementMode === "manual"
                  ? "This older manual plan remains visible but is now view-only. The U23 Head Coach continues with the next eligible stage."
                  : selectedStageManagementSource === "u23_head_coach"
                    ? `${u23PlannerStaffName} generated this plan automatically.${
                        selectedStageBasedOnStageNumber > 0
                          ? ` It was adapted after Stage ${selectedStageBasedOnStageNumber}.`
                          : ""
                      }`
                    : "The coach will generate this stage when it becomes eligible."}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {selectedStageManagementSource === "u23_head_coach" &&
              selectedStageQualityScore !== undefined &&
              selectedStageQualityScore !== null ? (
                <span className="rounded-full border border-emerald-300 bg-white/70 px-2.5 py-1">
                  {selectedStageQualityTier} ·{" "}
                  {Math.round(
                    normalizeNumericValue(selectedStageQualityScore, 0),
                  )}
                </span>
              ) : null}

              <span className="rounded-full border border-current/20 bg-white/70 px-2.5 py-1">
                View only
              </span>

              <span className="rounded-full border border-current/20 bg-white/70 px-2.5 py-1">
                {u23AutomationEnabled || Boolean(u23Setting.is_enabled)
                  ? "Automation on"
                  : "Planner selected"}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {stagePlanControlsReadOnly ? (
        <div className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700 shadow-sm">
          <div className="font-semibold text-slate-900">
            Stage Plans are view-only
          </div>
          <div className="mt-1 leading-6">
            You can review every value selected by {u23PlannerStaffName}, but
            equipment, tactics, roles, supplies and Save actions are disabled.
            Switch the Tactical Planner to Sport Director in the Race Plan to
            manage Stage Plans manually.
          </div>
        </div>
      ) : null}

      <div
        className={[
          "rounded-2xl border px-4 py-3 shadow-sm",
          lockInfo.statusTone === "locked"
            ? "border-red-200 bg-red-50"
            : "border-emerald-200 bg-emerald-50",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-900">Stage Plan lock</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-700">
            Lock time: {lockInfo.lockAtLabel}
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-700">
            Stage start: {lockInfo.stageStartLabel}
          </span>
          <span className="text-slate-400">·</span>
          <span
            className={[
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
              lockInfo.statusTone === "locked"
                ? "bg-red-100 text-red-700"
                : "bg-emerald-100 text-emerald-700",
            ].join(" ")}
          >
            Status: {lockInfo.statusLabel}
          </span>
        </div>

        <div
          className={[
            "mt-1 text-sm",
            lockInfo.statusTone === "locked"
              ? "text-red-700"
              : "text-emerald-700",
          ].join(" ")}
        >
          {lockInfo.statusHint}
        </div>
      </div>

      <StageCardsScroller
        stages={stages}
        selectedStageIndex={selectedStageIndex}
        stagePlanReadinessByStageKey={stagePlanReadinessByStageKey}
        isU23ManagedRace={isU23ManagedRace}
        u23DashboardStages={u23DashboardStages}
        onSelectStage={(index) => {
          setSelectedStageIndex(index);
          setStageSaveMessage(null);
          setStageSaveError(null);
          setSportDirectorSuggestion(null);
        }}
      />

      {!lockInfo.isLocked && !targetRaceAllWeatherCanceled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="space-y-1 text-sm text-slate-600">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">
                Selected stage save
              </span>
              <span className="text-slate-400">·</span>
              <span>{lockInfo.lockLabel}</span>
              <span className="text-slate-400">·</span>
              <span>Lock time: {lockInfo.lockAtLabel}</span>
              <span className="text-slate-400">·</span>
              <span
                className={[
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                  lockInfo.statusTone === "locked"
                    ? "bg-red-100 text-red-700"
                    : "bg-emerald-100 text-emerald-700",
                ].join(" ")}
              >
                {lockInfo.statusLabel}
              </span>
              {selectedStageWeatherCanceled ? (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                  Stage canceled
                </span>
              ) : null}
              {isU23ManagedRace ? (
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {selectedU23StageStatusLabel}
                </span>
              ) : selectedStageReadiness ? (
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                    stagePlanReadinessBadgeClasses[
                      selectedStageReadiness.ui_tone
                    ],
                  ].join(" ")}
                >
                  {selectedStageReadiness.readiness_label}
                </span>
              ) : null}
            </div>
            <div>
              {selectedDraft.lastSavedAt ? (
                <span>
                  Last saved {formatTimestampLabel(selectedDraft.lastSavedAt)}
                </span>
              ) : (
                <span>Not saved yet</span>
              )}
            </div>
            {isU23ManagedRace ? (
              <div className="text-xs text-slate-500">
                {selectedU23StageStatusHint}
              </div>
            ) : selectedStageReadiness?.recommended_action ? (
              <div className="text-xs text-slate-500">
                {selectedStageReadiness.recommended_action}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSaveStagePlan()}
              disabled={stageSaveDisabled}
              className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {stagePlanControlsReadOnly
                ? "View only"
                : savingStagePlan
                  ? "Saving…"
                  : "Save Stage Plan"}
            </button>
          </div>
        </div>
      )}

      {stageSaveMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {stageSaveMessage}
        </div>
      )}

      {stageSaveError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {stageSaveError}
        </div>
      )}

      {sportDirectorSuggestion && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 shadow-sm">
          <div className="font-semibold">Sport Director suggestion applied</div>

          <div className="mt-1 text-indigo-800">
            {String(
              asRecord(sportDirectorSuggestion.sport_director).name ??
                "Sport Director",
            )}{" "}
            ·{" "}
            {titleFromSnake(
              String(
                asRecord(sportDirectorSuggestion.sport_director).quality ??
                  "quality_unknown",
              ),
            )}{" "}
            ·{" "}
            {Math.round(
              Number(
                asRecord(sportDirectorSuggestion.sport_director)
                  .accuracy_factor ?? 0,
              ) * 100,
            )}
            % confidence
          </div>

          <ul className="mt-3 list-disc space-y-1 pl-5 text-indigo-800">
            {toArray<string>(sportDirectorSuggestion.explanation).map(
              (line) => (
                <li key={line}>{line}</li>
              ),
            )}
          </ul>

          <div className="mt-3 text-xs font-medium text-indigo-700">
            This only fills the current form. Click Save Stage Plan to write it
            to the database.
          </div>
        </div>
      )}

      <section className="grid items-stretch gap-6 xl:grid-cols-2">
        <StageRiderEquipmentCard
          riders={selectedRiders}
          equipmentPresetOptions={equipmentPresetOptions}
          equipmentByRider={selectedDraft.equipmentByRider}
          onChange={(riderId, presetId) =>
            updateSelectedStageDraft((current) => ({
              ...current,
              equipmentByRider: {
                ...current.equipmentByRider,
                [riderId]: presetId,
              },
            }))
          }
          showSportDirectorAction={!isU23ManagedRace}
          onAskSportDirector={() => void handleAskSportDirector("equipment")}
          sportDirectorLoading={sportDirectorLoading}
          sportDirectorDisabled={sportDirectorAutoFillDisabled}
          sportDirectorDisabledReason={sportDirectorDisabledReason}
          onSave={() => void handleSaveStagePlan()}
          saveDisabled={stageSaveDisabled}
          saving={savingStagePlan}
          disabled={
            !packageSubmitted ||
            lockInfo.isLocked ||
            selectedStageLockedByWeather ||
            stagePlanControlsReadOnly
          }
        />

        <StageTeamTacticCard
          stage={selectedStage}
          riders={selectedRiders}
          value={selectedDraft.teamTactic}
          riderRolesByRider={selectedDraft.riderRolesByRider}
          onChange={(teamTactic) =>
            updateSelectedStageDraft((current) => ({
              ...current,
              teamTactic,
            }))
          }
          onRoleChange={(riderId, role) =>
            updateSelectedStageDraft((current) => ({
              ...current,
              riderRolesByRider: {
                ...current.riderRolesByRider,
                [riderId]: role,
              },
            }))
          }
          showSportDirectorAction={!isU23ManagedRace}
          onAskSportDirector={() => void handleAskSportDirector("team")}
          sportDirectorLoading={sportDirectorLoading}
          sportDirectorDisabled={sportDirectorAutoFillDisabled}
          sportDirectorDisabledReason={sportDirectorDisabledReason}
          onSave={() => void handleSaveStagePlan()}
          saveDisabled={stageSaveDisabled}
          saving={savingStagePlan}
          disabled={
            !packageSubmitted ||
            lockInfo.isLocked ||
            selectedStageLockedByWeather ||
            stagePlanControlsReadOnly
          }
        />
      </section>

      <StageIndividualTacticsCard
        stage={selectedStage}
        riders={selectedRiders}
        riderRolesByRider={selectedDraft.riderRolesByRider}
        individualTacticsByRider={selectedDraft.individualTacticsByRider}
        onChange={(riderId, phaseKey, command) =>
          updateSelectedStageDraft((current) => {
            const riderTactics =
              current.individualTacticsByRider[riderId] ??
              createDefaultIndividualTacticsForRider(selectedStage);

            const phase = getStagePhaseRanges(selectedStage).find(
              (item) => item.key === phaseKey,
            );

            return {
              ...current,
              individualTacticsByRider: {
                ...current.individualTacticsByRider,
                [riderId]: {
                  ...riderTactics,
                  [phaseKey]: {
                    command,
                    from_km:
                      phase?.fromKm ?? riderTactics[phaseKey]?.from_km ?? 0,
                    to_km: phase?.toKm ?? riderTactics[phaseKey]?.to_km ?? 0,
                    label: phase
                      ? `${phase.label}: ${phase.rangeLabel}`
                      : (riderTactics[phaseKey]?.label ?? phaseKey),
                  },
                },
              },
            };
          })
        }
        showSportDirectorAction={!isU23ManagedRace}
        onAskSportDirector={() => void handleAskSportDirector("individual")}
        sportDirectorLoading={sportDirectorLoading}
        sportDirectorDisabled={sportDirectorAutoFillDisabled}
        sportDirectorDisabledReason={sportDirectorDisabledReason}
        onSave={() => void handleSaveStagePlan()}
        saveDisabled={stageSaveDisabled}
        saving={savingStagePlan}
        disabled={
          !packageSubmitted ||
          lockInfo.isLocked ||
          selectedStageLockedByWeather ||
          stagePlanControlsReadOnly
        }
      />

      <section className="grid gap-6 xl:grid-cols-2">
        <StageRaceSuppliesCard
          stage={selectedStage}
          riders={selectedRiders}
          supplyOptions={supplyOptions}
          suppliesByRider={selectedDraft.suppliesByRider}
          onApplyTeamPlan={(teamPlan) =>
            updateSelectedStageDraft((current) => ({
              ...current,
              suppliesByRider: buildSuppliesByRiderFromTeamPlan(
                selectedRiders,
                teamPlan,
                selectedStage,
              ),
            }))
          }
          onSave={() => void handleSaveStagePlan()}
          saveDisabled={stageSaveDisabled || suppliesDisabledForTT}
          saving={savingStagePlan}
          disabled={
            !packageSubmitted ||
            lockInfo.isLocked ||
            selectedStageLockedByWeather ||
            suppliesDisabledForTT ||
            stagePlanControlsReadOnly
          }
        />

        <StageFinalCalculationCard
          stage={selectedStage}
          riders={selectedRiders}
          draft={selectedDraft}
          equipmentPresetOptions={equipmentPresetOptions}
          supplyOptions={supplyOptions}
          standardizedBonus={standardizedBonus}
          exactBonusPreview={exactBonusPreview}
          onSave={() => void handleSaveStagePlan()}
          saveDisabled={stageSaveDisabled}
          saving={savingStagePlan}
        />
      </section>
    </div>
  );
}

function formatTimestampLabel(value: string): string {
  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) return value;

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStageDisplayName(stage: JsonRecord, fallbackNumber: string) {
  return String(
    stage.stage_name ??
      stage.stage_title ??
      stage.name ??
      stage.route_label ??
      `Stage ${fallbackNumber}`,
  );
}

function getStageRoute(stage: JsonRecord) {
  const routeLabel = String(stage.route_label ?? "").trim();

  if (routeLabel) return routeLabel;

  const start = String(stage.start_city ?? "").trim();
  const finish = String(stage.finish_city ?? "").trim();

  if (start && finish && start !== finish) return `${start} → ${finish}`;
  if (start && finish && start === finish) return `${start} circuit`;

  return start || finish || "Route details pending";
}

function getStageStartTime(stage: JsonRecord) {
  const directLabel = String(stage.planned_start_time_label ?? "").trim();

  if (directLabel) return directLabel;

  const hour = Number(stage.planned_start_hour_number);
  const minute = Number(stage.planned_start_minute);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getStageProfileLabel(stage: JsonRecord) {
  const value = String(
    stage.profile_type ?? stage.terrain_type ?? stage.stage_type ?? "",
  ).trim();

  if (!value) return "Profile pending";

  return titleFromSnake(value);
}

function getStageDistance(stage: JsonRecord) {
  const distance = Number(stage.distance_km);

  if (!Number.isFinite(distance) || distance <= 0) return "";

  return `${distance.toFixed(distance % 1 === 0 ? 0 : 1)} km`;
}

function getStageFinishLabel(stage: JsonRecord) {
  const finishType = String(stage.finish_type ?? "").trim();
  const summit = Boolean(stage.is_summit_finish);

  if (summit) return "Summit finish";
  if (finishType) return titleFromSnake(finishType);

  return "Finish details pending";
}

function pickStageWeatherRecord(profile: JsonRecord | null, stage: JsonRecord) {
  const stageMetadata = asRecord(stage.metadata);
  const profileMetadata = asRecord(profile?.metadata);

  /**
   * Race Page uses race_stages.weather_snapshot.
   * Stage Plans previously only checked weather_json / weather_snapshot_json,
   * so generated weather existed but was invisible here.
   */
  const candidates = [
    asRecord(profile?.weather_snapshot),
    asRecord(profile?.weather_json),
    asRecord(profile?.weather_snapshot_json),
    asRecord(profile?.stage_weather_json),
    asRecord(profile?.weather),
    asRecord(profileMetadata.weather_snapshot),
    asRecord(profileMetadata.weather),
    asRecord(profileMetadata.stage_weather),

    asRecord(stage.weather_snapshot),
    asRecord(stage.weather_json),
    asRecord(stage.weather_snapshot_json),
    asRecord(stage.stage_weather_json),
    asRecord(stage.weather),
    asRecord(stageMetadata.weather_snapshot),
    asRecord(stageMetadata.weather),
    asRecord(stageMetadata.stage_weather),
  ];

  return (
    candidates.find((candidate) => Object.keys(candidate).length > 0) ?? {}
  );
}

function pickWeatherNumber(record: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function getWeatherConditionLabel(record: JsonRecord): string {
  const value = String(
    record.condition_label ??
      record.label ??
      record.name ??
      record.condition ??
      record.summary ??
      record.weather_summary ??
      record.weather ??
      "",
  ).trim();

  return value ? titleFromSnake(value) : "";
}

function getWeatherRainLabel(record: JsonRecord): string {
  const rainChance = pickWeatherNumber(record, [
    "rain_chance_pct",
    "rain_probability_pct",
    "precipitation_chance_pct",
    "precipitation_probability_pct",
    "chance_of_rain_pct",
  ]);

  if (rainChance !== null) {
    return `${Math.round(rainChance)}%`;
  }

  const rainMm = pickWeatherNumber(record, [
    "avg_precip_mm",
    "precip_mm",
    "precipitation_mm",
    "rain_mm",
    "avg_rain_mm",
  ]);

  if (rainMm !== null) {
    return rainMm === 0 ? "—" : `${rainMm.toFixed(1)} mm`;
  }

  return "—";
}

function getWeatherIcon(record: JsonRecord): string {
  const text = String(
    record.icon ??
      record.weather_icon ??
      record.condition_icon ??
      record.condition ??
      record.summary ??
      "",
  ).toLowerCase();

  if (text.includes("rain") || text.includes("shower")) return "🌧️";
  if (text.includes("storm") || text.includes("thunder")) return "⛈️";
  if (text.includes("cloud")) return "☁️";
  if (text.includes("wind")) return "💨";
  if (text.includes("snow")) return "❄️";
  if (text.includes("sun") || text.includes("clear")) return "☀️";

  return "🌤️";
}

function StageWeatherMiniCard({
  profile,
  stage,
}: {
  profile: JsonRecord | null;
  stage: JsonRecord;
}) {
  const weather = pickStageWeatherRecord(profile, stage);
  const temperature = pickWeatherNumber(weather, [
    "temperature_c",
    "temp_c",
    "avg_temperature_c",
    "average_temperature_c",
    "avg_temp_c",
    "average_temp_c",
    "temperature",
  ]);
  const minTemperature = pickWeatherNumber(weather, [
    "min_temperature_c",
    "avg_min_temp_c",
    "min_temp_c",
  ]);
  const maxTemperature = pickWeatherNumber(weather, [
    "max_temperature_c",
    "avg_max_temp_c",
    "max_temp_c",
  ]);
  const wind = pickWeatherNumber(weather, [
    "wind_kph",
    "wind_speed_kph",
    "wind_km_h",
    "wind_kmh",
    "avg_wind_kmh",
    "wind_speed",
    "wind",
  ]);
  const conditionLabel = getWeatherConditionLabel(weather);
  const rainLabel = getWeatherRainLabel(weather);

  const hasWeather =
    temperature !== null ||
    minTemperature !== null ||
    maxTemperature !== null ||
    wind !== null ||
    rainLabel !== "—" ||
    conditionLabel ||
    Object.keys(weather).length > 0;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span className="text-base">{getWeatherIcon(weather)}</span>
        Stage weather
      </div>

      {isPreparationStageWeatherCanceled(stage) ? (
        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800">
          Canceled:{" "}
          {getPreparationWeatherCancellationReasonLabel(
            getPreparationStageWeatherCancellationReason(stage),
          )}
        </div>
      ) : null}

      {hasWeather ? (
        <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
          <div>
            <div className="text-[11px] text-slate-400">Temp</div>
            <div className="font-semibold text-slate-900">
              {temperature !== null ? `${temperature.toFixed(1)}°C` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Wind</div>
            <div className="font-semibold text-slate-900">
              {wind !== null ? `${Math.round(wind)} km/h` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Rain</div>
            <div className="font-semibold text-slate-900">{rainLabel}</div>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-sm text-slate-500">
          Weather data not available for this stage yet.
        </div>
      )}
    </div>
  );
}

function SelectedStagePlanProfileCard({ stage }: { stage: JsonRecord }) {
  const [profile, setProfile] = useState<JsonRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stageId = String(stage.id ?? "");
  const stageNumber = String(stage.stage_number ?? "—");

  useEffect(() => {
    if (!stageId) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const result = await loadRaceStageProfileDetail(stageId);

        if (!cancelled) {
          setProfile(result);
        }
      } catch (error) {
        if (!cancelled) {
          setProfile(null);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to load stage profile.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [stageId]);

  const profileData = profile?.has_profile ? profile : null;

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-5 xl:grid-cols-[0.58fr_1.42fr]">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Selected stage profile
          </div>

          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            Stage {stageNumber}: {getStageDisplayName(stage, stageNumber)}
          </h3>

          <div className="mt-4 grid gap-2">
            <CompactStageInfo
              label="Date"
              value={formatFullStageDateTime(stage)}
            />
            <CompactStageInfo label="Route" value={getStageRoute(stage)} />
            <CompactStageInfo
              label="Profile"
              value={
                profileData?.profile_type
                  ? titleFromSnake(String(profileData.profile_type))
                  : getStageProfileLabel(stage)
              }
            />
            <CompactStageInfo
              label="Distance"
              value={
                profileData?.distance_km
                  ? `${Number(profileData.distance_km).toFixed(
                      Number(profileData.distance_km) % 1 === 0 ? 0 : 1,
                    )} km`
                  : getStageDistance(stage) || "—"
              }
            />
          </div>

          <StageWeatherMiniCard profile={profile} stage={stage} />
        </div>

        <div className="rounded-2xl bg-white p-4">
          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
              Loading stage profile…
            </div>
          ) : errorMessage ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : profileData ? (
            <StagePlanProfileChart profile={profileData} stage={stage} />
          ) : (
            <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
              Stage profile data is not available from the backend yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactStageInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

type StagePlanProfilePoint = {
  km: number;
  elevation_m: number;
};

type StagePlanProfileMarker = {
  km: number;
  type: string;
  label: string;
};

function toFiniteNumberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProfilePoints(profile: JsonRecord, stage: JsonRecord) {
  const direct = Array.isArray(profile.profile_points)
    ? profile.profile_points
    : [];

  const metadata = asRecord(stage.metadata);
  const routeProfile = asRecord(metadata.route_profile_v1);
  const fallback = Array.isArray(routeProfile.profile_points)
    ? routeProfile.profile_points
    : [];

  const source = direct.length > 0 ? direct : fallback;

  return source
    .map((raw): StagePlanProfilePoint | null => {
      const point = asRecord(raw);
      const km = toFiniteNumberValue(point.km);
      const elevation = toFiniteNumberValue(point.elevation_m);

      if (km === null || elevation === null) return null;

      return {
        km,
        elevation_m: elevation,
      };
    })
    .filter((point): point is StagePlanProfilePoint => point !== null)
    .sort((a, b) => a.km - b.km);
}

function isStagePlanTacticalMarkerType(type: string): boolean {
  const normalized = type.toUpperCase();

  return (
    normalized === "START" ||
    normalized === "FINISH" ||
    normalized === "KOM" ||
    normalized === "MOUNTAIN" ||
    normalized === "INTERMEDIATE_SPRINT" ||
    normalized === "BONUS_SPRINT" ||
    normalized === "SPRINT"
  );
}

function normalizeProfileMarkers(
  profile: JsonRecord,
  stage: JsonRecord,
  distanceKm: number,
) {
  const direct = Array.isArray(profile.route_markers)
    ? profile.route_markers
    : [];

  const stagePoints = Array.isArray(stage.points) ? stage.points : [];

  const fromProfile = direct
    .map((raw): StagePlanProfileMarker | null => {
      const marker = asRecord(raw);
      const km = toFiniteNumberValue(marker.km);

      if (km === null) return null;

      return {
        km,
        type: String(marker.type ?? marker.point_type ?? ""),
        label: getStagePlanMarkerLabel(marker),
      };
    })
    .filter((marker): marker is StagePlanProfileMarker => marker !== null)
    .filter((marker) => isStagePlanTacticalMarkerType(marker.type));

  const fromStagePoints = stagePoints
    .map((raw): StagePlanProfileMarker | null => {
      const point = asRecord(raw);
      const km = toFiniteNumberValue(point.km_from_start);

      if (km === null) return null;

      return {
        km,
        type: String(point.point_type ?? ""),
        label: getStagePlanMarkerLabel(point),
      };
    })
    .filter((marker): marker is StagePlanProfileMarker => marker !== null)
    .filter((marker) => isStagePlanTacticalMarkerType(marker.type));

  const merged = fromProfile.length > 0 ? fromProfile : fromStagePoints;

  const hasStart = merged.some((marker) => marker.km <= 0.5);
  const hasFinish = merged.some(
    (marker) => Math.abs(marker.km - distanceKm) <= 0.5,
  );

  return [
    ...(hasStart
      ? []
      : [{ km: 0, type: "START", label: "Start" } as StagePlanProfileMarker]),
    ...merged,
    ...(hasFinish
      ? []
      : [
          {
            km: distanceKm,
            type: "FINISH",
            label: "Finish",
          } as StagePlanProfileMarker,
        ]),
  ].sort((a, b) => a.km - b.km);
}

function getStagePlanMarkerLabel(marker: JsonRecord) {
  const type = String(marker.type ?? marker.point_type ?? "").toUpperCase();

  if (type === "START") return "Start";
  if (type === "FINISH") return "Finish";
  if (
    type === "INTERMEDIATE_SPRINT" ||
    type === "BONUS_SPRINT" ||
    type === "SPRINT"
  ) {
    return "Sprint";
  }

  if (type === "KOM" || type === "MOUNTAIN") {
    const category = String(
      marker.category ?? marker.kom_category ?? "",
    ).trim();
    return category ? `Cat ${category}` : "KOM";
  }

  return "Point";
}

function getMarkerColor(type: string) {
  const normalized = type.toUpperCase();

  if (normalized === "START") return "#64748b";
  if (normalized === "FINISH") return "#2563eb";
  if (normalized === "KOM" || normalized === "MOUNTAIN") return "#ef4444";
  if (
    normalized === "INTERMEDIATE_SPRINT" ||
    normalized === "BONUS_SPRINT" ||
    normalized === "SPRINT"
  ) {
    return "#22c55e";
  }

  return "#475569";
}

function StagePlanProfileChart({
  profile,
  stage,
}: {
  profile: JsonRecord;
  stage: JsonRecord;
}) {
  const points = normalizeProfilePoints(profile, stage);
  const distanceKm =
    toFiniteNumberValue(profile.distance_km) ??
    toFiniteNumberValue(stage.distance_km) ??
    Math.max(...points.map((point) => point.km), 1);

  if (points.length < 2) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
        Stage profile points are missing.
      </div>
    );
  }

  const width = 920;
  const height = 360;
  const padding = {
    top: 38,
    right: 24,
    bottom: 54,
    left: 58,
  };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const maxElevationRaw = Math.max(...points.map((point) => point.elevation_m));
  const maxElevation = Math.max(
    500,
    Math.ceil((maxElevationRaw * 1.12) / 100) * 100,
  );

  const xForKm = (km: number) =>
    padding.left +
    (Math.max(0, Math.min(distanceKm, km)) / distanceKm) * innerWidth;

  const yForElevation = (elevation: number) =>
    padding.top +
    innerHeight -
    (Math.max(0, elevation) / maxElevation) * innerHeight;

  const coordinates = points.map((point) => ({
    x: xForKm(point.km),
    y: yForElevation(point.elevation_m),
    ...point,
  }));

  const linePath = coordinates.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;

    const previous = coordinates[index - 1];
    const controlX = (previous.x + point.x) / 2;

    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");

  const areaPath = `${linePath} L ${
    coordinates[coordinates.length - 1].x
  } ${height - padding.bottom} L ${coordinates[0].x} ${
    height - padding.bottom
  } Z`;

  const markers = normalizeProfileMarkers(profile, stage, distanceKm);
  const elevationTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => Math.round((maxElevation * ratio) / 100) * 100,
  );

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[360px] w-full"
        role="img"
        aria-label="Stage profile chart"
      >
        <rect width={width} height={height} fill="#ffffff" />

        {elevationTicks.map((tick) => {
          const y = yForElevation(tick);

          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill="#64748b"
              >
                {tick} m
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="#fde68a" opacity="0.9" />
        <path
          d={linePath}
          fill="none"
          stroke="#334155"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {markers.map((marker, index) => {
          const x = xForKm(marker.km);
          const color = getMarkerColor(marker.type);

          return (
            <g key={`${marker.type}-${marker.km}-${index}`}>
              <line
                x1={x}
                x2={x}
                y1={padding.top}
                y2={height - padding.bottom}
                stroke={color}
                strokeWidth="2"
                strokeDasharray="4 4"
                opacity="0.75"
              />

              <rect
                x={x - 34}
                y={14}
                width="68"
                height="22"
                rx="11"
                fill={color}
              />

              <text
                x={x}
                y={29}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#ffffff"
              >
                {marker.label}
              </text>

              <text
                x={x}
                y={height - 18}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill="#334155"
              >
                {marker.km.toFixed(marker.km % 1 === 0 ? 0 : 1)} km
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StageCardsScroller({
  stages,
  selectedStageIndex,
  stagePlanReadinessByStageKey,
  isU23ManagedRace = false,
  u23DashboardStages = [],
  onSelectStage,
}: {
  stages: JsonRecord[];
  selectedStageIndex: number;
  stagePlanReadinessByStageKey?: Record<string, StagePlanReadinessStage>;
  isU23ManagedRace?: boolean;
  u23DashboardStages?: U23StagePlanDashboardStage[];
  onSelectStage: (index: number) => void;
}) {
  const stageSliderRef = React.useRef<HTMLDivElement | null>(null);

  function scrollStages(direction: "left" | "right"): void {
    const node = stageSliderRef.current;
    if (!node) return;

    node.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    });
  }

  function renderStageCard(stage: JsonRecord, compact = false) {
    const index = stages.findIndex(
      (item) => String(item.id) === String(stage.id),
    );
    const active = index === selectedStageIndex;
    const stageNumber = String(stage.stage_number ?? index + 1);
    const readiness = findStagePlanReadiness(
      stagePlanReadinessByStageKey ?? {},
      stage,
    );
    const u23Stage =
      u23DashboardStages.find((row) => {
        const stageId = String(stage.id ?? "");
        const rowStageId = String(row.stage_id ?? "");
        const rowStageNumber = Number(row.stage_number ?? 0);

        return (
          (stageId && rowStageId === stageId) ||
          rowStageNumber === Number(stage.stage_number ?? index + 1)
        );
      }) ?? null;
    const u23Management = asRecord(u23Stage?.management);
    const u23ManagementMode = String(
      u23Management.management_mode ?? "",
    );
    const u23ManagementSource = String(
      u23Management.source_type ?? "",
    );
    const u23HasSavedPlan = Boolean(u23Stage?.last_saved_at);
    const u23BadgeLabel =
      u23ManagementMode === "manual"
        ? "Manual plan"
        : u23ManagementSource === "u23_head_coach" && u23HasSavedPlan
          ? "Coach plan"
          : "Scheduled";
    const u23BadgeClasses =
      u23ManagementMode === "manual"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : u23ManagementSource === "u23_head_coach" && u23HasSavedPlan
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-100 text-slate-700";
    const u23StageHint =
      u23ManagementMode === "manual"
        ? "Existing manual plan · view only."
        : u23ManagementSource === "u23_head_coach" && u23HasSavedPlan
          ? "Generated automatically by the U23 Head Coach."
          : Number(stage.stage_number ?? index + 1) > 1
            ? `Generated after Stage ${Math.max(
                Number(stage.stage_number ?? index + 1) - 1,
                1,
              )} finishes.`
            : "Generated immediately when U23 automation is activated.";
    const weatherCanceled = isPreparationStageWeatherCanceled(stage);
    const weatherRiskReason = getPreparationStageWeatherRiskReason(stage);

    return (
      <button
        key={String(stage.id ?? stageNumber)}
        type="button"
        onClick={() => onSelectStage(index)}
        className={[
          compact
            ? "min-h-[92px] min-w-[220px] snap-start rounded-2xl border px-4 py-3 text-left transition"
            : "min-h-[92px] rounded-2xl border px-4 py-3 text-left transition",
          weatherCanceled
            ? "border-red-200 bg-red-50 text-red-950 shadow-sm"
            : active
              ? "border-yellow-200 bg-yellow-50 text-slate-950 shadow-sm"
              : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
        ].join(" ")}
      >
        <div className="text-sm font-medium text-slate-500">
          {formatCompactStageDateTime(stage)}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="truncate text-base font-semibold">
            Stage {stageNumber}
          </div>
          {isU23ManagedRace ? (
            <span
              className={[
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                u23BadgeClasses,
              ].join(" ")}
            >
              {u23BadgeLabel}
            </span>
          ) : readiness ? (
            <span
              className={[
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                stagePlanReadinessBadgeClasses[readiness.ui_tone],
              ].join(" ")}
            >
              {readiness.readiness_label}
            </span>
          ) : null}
        </div>

        <div className="mt-1 truncate text-xs opacity-80">
          {getStageRoute(stage)}
        </div>

        <div className="mt-1 text-xs opacity-75">
          {getStageProfileLabel(stage)} · {getStageDistance(stage) || "—"}
        </div>

        {weatherCanceled ? (
          <div className="mt-2 inline-flex rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-800">
            Canceled ·{" "}
            {getPreparationWeatherCancellationReasonLabel(
              getPreparationStageWeatherCancellationReason(stage),
            )}
          </div>
        ) : weatherRiskReason ? (
          <div className="mt-2 inline-flex rounded-full bg-orange-100 px-2 py-1 text-[11px] font-semibold text-orange-800">
            Weather cancellation likely
          </div>
        ) : isU23ManagedRace ? (
          <div className="mt-2 line-clamp-2 text-[11px] opacity-70">
            {u23StageHint}
          </div>
        ) : readiness?.recommended_action ? (
          <div className="mt-2 line-clamp-2 text-[11px] opacity-70">
            {readiness.recommended_action}
          </div>
        ) : null}
      </button>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        No stages found for this race.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Stages
        </div>

        {stages.length > 5 ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => scrollStages("left")}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ←
            </button>

            <button
              type="button"
              onClick={() => scrollStages("right")}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              →
            </button>
          </div>
        ) : null}
      </div>

      {stages.length <= 5 ? (
        <div
          className={[
            "grid gap-2",
            stages.length <= 1
              ? "grid-cols-1"
              : stages.length === 2
                ? "grid-cols-1 md:grid-cols-2"
                : stages.length === 3
                  ? "grid-cols-1 md:grid-cols-3"
                  : stages.length === 4
                    ? "grid-cols-1 md:grid-cols-4"
                    : "grid-cols-1 md:grid-cols-5",
          ].join(" ")}
        >
          {stages.map((stage) => renderStageCard(stage))}
        </div>
      ) : (
        <div
          ref={stageSliderRef}
          className="flex snap-x gap-2 overflow-x-auto scroll-smooth pb-1"
        >
          {stages.map((stage) => renderStageCard(stage, true))}
        </div>
      )}
    </div>
  );
}

function InfoTooltip({
  label = "Info",
  children,
  panelWidthClass = "w-[26rem]",
}: {
  label?: string;
  children: React.ReactNode;
  panelWidthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const pinTimerRef = React.useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pinTimerRef.current !== null) {
        window.clearTimeout(pinTimerRef.current);
      }
    };
  }, []);

  function startPinCountdown() {
    if (pinTimerRef.current !== null) {
      window.clearTimeout(pinTimerRef.current);
    }

    pinTimerRef.current = window.setTimeout(() => {
      setPinned(true);
      setOpen(true);
    }, 3000);
  }

  function stopPinCountdown() {
    if (pinTimerRef.current !== null) {
      window.clearTimeout(pinTimerRef.current);
      pinTimerRef.current = null;
    }
  }

  function handleMouseEnter() {
    setOpen(true);
    if (!pinned) {
      startPinCountdown();
    }
  }

  function handleMouseLeave() {
    stopPinCountdown();
    if (!pinned) {
      setOpen(false);
    }
  }

  function handleToggleClick() {
    if (open && pinned) {
      setPinned(false);
      setOpen(false);
      stopPinCountdown();
      return;
    }

    setOpen(true);
    setPinned(true);
    stopPinCountdown();
  }

  function handleClose() {
    setPinned(false);
    setOpen(false);
    stopPinCountdown();
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        aria-label={label}
        onClick={handleToggleClick}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-xs font-bold text-slate-500 shadow-sm hover:bg-slate-50"
      >
        i
      </button>

      {open && (
        <div
          className={`absolute right-0 top-full z-50 mt-2 ${panelWidthClass} rounded-2xl border border-slate-200 bg-white p-4 text-left text-xs leading-5 text-slate-600 shadow-xl`}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </div>
            {pinned ? (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ×
              </button>
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto pr-1">{children}</div>

          {!pinned && (
            <div className="mt-3 text-[11px] text-slate-400">
              Hover for 3 seconds or click to keep this help window open.
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function RoleExplanationTooltip({ stage }: { stage?: JsonRecord | null }) {
  const isTTStage = isTimeTrialStage(stage);

  if (isTTStage) {
    return (
      <InfoTooltip
        label="Time Trial tactic and rider role help"
        panelWidthClass="w-[30rem]"
      >
        <div className="text-sm font-semibold text-slate-900">
          Time Trial Tactic
        </div>
        <p className="mt-2">
          For Prologue, Individual Time Trial and Team Time Trial stages, normal
          road tactics are replaced by time-trial pacing plans.
        </p>
        <div className="mt-3 space-y-2">
          <div>
            <span className="font-semibold text-slate-900">Balanced Pace:</span>{" "}
            Even effort across the whole stage. Safe default with low blow-up
            risk.
          </div>
          <div>
            <span className="font-semibold text-slate-900">Fast Start:</span>{" "}
            Hard first half, then try to hold the pace. Useful for short
            prologues, but weaker TT riders may fade badly.
          </div>
          <div>
            <span className="font-semibold text-slate-900">
              Negative Split:
            </span>{" "}
            Controlled first half, stronger second half. Useful for longer ITTs
            and riders with strong endurance/recovery.
          </div>
          <div>
            <span className="font-semibold text-slate-900">
              All-out Time Trial:
            </span>{" "}
            Maximum effort from the start. Fastest on paper, but high fatigue
            and blow-up risk.
          </div>
        </div>

        {isTeamTimeTrialStage(stage) ? (
          <p className="mt-3">
            For TTT stages, the tactic applies to the whole team and affects
            team rhythm, cohesion, dropped-rider risk and the counting-rider
            group.
          </p>
        ) : null}

        <div className="mb-2 mt-4 text-sm font-semibold text-slate-900">
          Time Trial Roles
        </div>
        <p>Normal road roles are disabled on Prologue, ITT and TTT stages.</p>
        <div className="mt-3 space-y-2">
          <div>
            <span className="font-semibold text-slate-900">
              Prologue / ITT:
            </span>{" "}
            Every rider is treated as a Time Trial Rider.
          </div>
          <div>
            <span className="font-semibold text-slate-900">TTT:</span> Every
            rider is treated as a Team Time Trial Rider. The engine calculates
            counting riders, dropped riders, team cohesion, support work and
            official team time.
          </div>
        </div>
        <p className="mt-3">
          This avoids unrealistic roles such as Sprinter, Breakaway Rider or
          Lead-out Rider on time-trial stages.
        </p>
      </InfoTooltip>
    );
  }

  return (
    <InfoTooltip
      label="Team tactic and rider role help"
      panelWidthClass="w-[28rem]"
    >
      <div className="mb-3 text-sm font-semibold text-slate-900">
        Team tactic plans
      </div>
      <div className="space-y-2">
        {STAGE_TACTIC_PLAN_OPTIONS.map((option) => (
          <div key={option.value}>
            <span className="font-semibold text-slate-900">{option.label}</span>{" "}
            — {option.description}
          </div>
        ))}
      </div>

      <div className="mb-2 mt-4 text-sm font-semibold text-slate-900">
        Rider stage roles
      </div>
      <div className="space-y-2">
        {STAGE_RIDER_ROLE_OPTIONS.map((option) => (
          <div key={option.value}>
            <span className="font-semibold text-slate-900">{option.label}</span>{" "}
            — {option.description}
          </div>
        ))}
      </div>
    </InfoTooltip>
  );
}

function formatBonusPreviewLabel(key: string): string {
  return titleFromSnake(key.replace(/_pct$/, "").replace(/_bonus$/, ""));
}

function getPresetBonusPreview(preset?: EquipmentSetupPresetOption | null) {
  const preview = asRecord(preset?.bonus_preview);
  const weightedBonuses = asRecord(
    preset?.weighted_bonuses ?? preview.weighted_bonuses,
  );
  const selectedItems = preset?.selected_items ?? preview.selected_items;
  const caps = asRecord(preset?.caps ?? preview.caps);

  return {
    preview,
    weightedBonuses,
    selectedItems,
    caps,
  };
}

function EquipmentPresetTooltip({
  preset,
}: {
  preset?: EquipmentSetupPresetOption | null;
}) {
  const { weightedBonuses, selectedItems, caps } =
    getPresetBonusPreview(preset);
  const weightedEntries = Object.entries(weightedBonuses).filter(
    ([, value]) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric !== 0;
    },
  );

  const selectedItemEntries = Array.isArray(selectedItems)
    ? selectedItems.map((item, index) => [String(index + 1), item] as const)
    : Object.entries(asRecord(selectedItems));

  const capEntries = Object.entries(caps).filter(
    ([, value]) => value !== null && value !== undefined,
  );

  return (
    <InfoTooltip label="Equipment package bonus preview">
      <div className="text-sm font-semibold text-slate-900">
        {preset?.label ?? "Equipment package"}
      </div>

      <div className="mt-3">
        <div className="mb-1 font-semibold text-slate-700">
          Weighted bonus preview
        </div>
        {weightedEntries.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {weightedEntries.map(([key, value]) => {
              const numeric = Number(value);
              const sign = numeric >= 0 ? "+" : "";
              const isNegative = numeric < 0;

              return (
                <span
                  key={key}
                  className={[
                    "rounded-full px-2 py-0.5 font-semibold",
                    isNegative
                      ? "bg-rose-50 text-rose-700"
                      : "bg-emerald-50 text-emerald-700",
                  ].join(" ")}
                >
                  {formatBonusPreviewLabel(key)} {sign}
                  {formatBonusPercent(numeric)}%
                </span>
              );
            })}
          </div>
        ) : (
          <div className="text-slate-500">
            No weighted bonus preview available for this setup yet.
          </div>
        )}
      </div>

      {selectedItemEntries.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 font-semibold text-slate-700">
            Selected items
          </div>
          <div className="space-y-1">
            {selectedItemEntries.slice(0, 8).map(([key, raw]) => {
              const item = asRecord(raw);
              const label = String(
                item.display_name ??
                  item.name ??
                  item.catalog_name ??
                  raw ??
                  "",
              );
              return (
                <div key={key} className="flex justify-between gap-3">
                  <span className="text-slate-500">
                    {formatBonusPreviewLabel(key)}
                  </span>
                  <span className="max-w-[180px] truncate font-medium text-slate-800">
                    {label || "Selected"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {capEntries.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 font-semibold text-slate-700">Caps</div>
          <div className="space-y-1">
            {capEntries.slice(0, 6).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3">
                <span className="text-slate-500">
                  {formatBonusPreviewLabel(key)}
                </span>
                <span className="font-medium text-slate-800">
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </InfoTooltip>
  );
}

type EquipmentPresetCapacity = {
  maxAssignments: number | null;
  limitingItemLabel: string | null;
  itemCaps: Array<{
    key: string;
    label: string;
    available: number | null;
  }>;
};

function parseEquipmentCountFromLabel(value: unknown): number | null {
  if (typeof value !== "string") return null;

  const match = value.match(/\((\d+)\s*\/\s*(\d+)\)/);
  if (!match) return null;

  const available = Number(match[1]);
  const total = Number(match[2]);

  if (Number.isFinite(available)) return available;
  if (Number.isFinite(total)) return total;

  return null;
}

function getEquipmentItemAvailableCount(raw: unknown): number | null {
  const item = asRecord(raw);
  const metadata = asRecord(item.metadata);

  const direct = [
    item.available_count,
    item.quantity_available,
    item.available_quantity,
    item.available,
    item.usable_count,
    item.owned_count,
    item.total_owned,
    item.count,
    metadata.available_count,
    metadata.quantity_available,
    metadata.available,
    metadata.usable_count,
    metadata.owned_count,
  ];

  for (const value of direct) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.floor(numeric);
    }
  }

  const label = String(
    item.display_name ??
      item.name ??
      item.catalog_name ??
      item.label ??
      raw ??
      "",
  );

  return parseEquipmentCountFromLabel(label);
}

function getEquipmentItemLabel(raw: unknown, fallback: string): string {
  const item = asRecord(raw);

  return String(
    item.display_name ??
      item.name ??
      item.catalog_name ??
      item.label ??
      fallback,
  );
}

function getEquipmentPresetCapacity(
  preset?: EquipmentSetupPresetOption | null,
): EquipmentPresetCapacity {
  const directCapacity = firstNonEmptyRecord(
    asRecord(preset).setup_capacity,
    asRecord(preset).capacity,
    asRecord(preset).equipment_capacity,
  );

  const directMaxAssignments = Number(
    directCapacity.max_assignments ??
      directCapacity.maxAssignments ??
      directCapacity.capacity ??
      asRecord(preset).max_assignments,
  );

  if (Number.isFinite(directMaxAssignments) && directMaxAssignments >= 0) {
    const directCaps = toArray<JsonRecord>(
      directCapacity.item_caps ?? directCapacity.itemCaps,
    );

    return {
      maxAssignments: Math.floor(directMaxAssignments),
      limitingItemLabel:
        String(
          directCapacity.limiting_item_label ??
            directCapacity.limitingItemLabel ??
            asRecord(preset).limiting_item_label ??
            "",
        ) || null,
      itemCaps: directCaps.map((item, index) => ({
        key: String(item.equipment_category ?? item.key ?? index + 1),
        label: String(
          item.label ?? item.display_name ?? item.name ?? "Equipment",
        ),
        available: Number.isFinite(Number(item.available_count))
          ? Math.floor(Number(item.available_count))
          : null,
      })),
    };
  }

  const { selectedItems } = getPresetBonusPreview(preset);
  const selectedItemEntries = Array.isArray(selectedItems)
    ? selectedItems.map((item, index) => [String(index + 1), item] as const)
    : Object.entries(asRecord(selectedItems));

  const itemCaps = selectedItemEntries.flatMap(([key, raw]) => {
    const label = getEquipmentItemLabel(raw, formatBonusPreviewLabel(key));
    const available = getEquipmentItemAvailableCount(raw);

    if (available === null) return [];

    return [
      {
        key,
        label,
        available,
      },
    ];
  });

  if (itemCaps.length === 0) {
    return {
      maxAssignments: null,
      limitingItemLabel: null,
      itemCaps: [],
    };
  }

  const maxAssignments = Math.min(...itemCaps.map((item) => item.available));
  const limitingItem =
    itemCaps.find((item) => item.available === maxAssignments) ?? itemCaps[0];

  return {
    maxAssignments,
    limitingItemLabel: limitingItem?.label ?? null,
    itemCaps,
  };
}

function getEquipmentPresetAssignmentCounts(
  equipmentByRider: Record<string, string>,
): Record<string, number> {
  return Object.values(equipmentByRider).reduce<Record<string, number>>(
    (acc, presetId) => {
      if (!presetId) return acc;
      acc[presetId] = (acc[presetId] ?? 0) + 1;
      return acc;
    },
    {},
  );
}

function getEquipmentPresetAvailabilityLabel({
  preset,
  assignmentCount,
}: {
  preset: EquipmentSetupPresetOption;
  assignmentCount: number;
}) {
  const capacity = getEquipmentPresetCapacity(preset);

  if (capacity.maxAssignments === null) {
    return "";
  }

  const remaining = Math.max(capacity.maxAssignments - assignmentCount, 0);

  return `${remaining}/${capacity.maxAssignments} left`;
}

function isDefaultEquipmentPreset(
  preset?: EquipmentSetupPresetOption | null,
): boolean {
  if (!preset) return false;

  const record = asRecord(preset);

  return (
    record.is_default_setup === true ||
    record.is_virtual_default === true ||
    preset.id === "__default_race_setup__" ||
    preset.setup_name === "Default" ||
    preset.label === "Default"
  );
}

function getEquipmentCapacityConflicts({
  equipmentPresetOptions,
  equipmentByRider,
}: {
  equipmentPresetOptions: EquipmentSetupPresetOption[];
  equipmentByRider: Record<string, string>;
}) {
  const assignmentCounts = getEquipmentPresetAssignmentCounts(equipmentByRider);

  return equipmentPresetOptions.flatMap((preset) => {
    const capacity = getEquipmentPresetCapacity(preset);
    const count = assignmentCounts[preset.id] ?? 0;

    if (capacity.maxAssignments === null || count <= capacity.maxAssignments) {
      return [];
    }

    return [
      {
        presetId: preset.id,
        label: preset.label,
        assigned: count,
        maxAssignments: capacity.maxAssignments,
        limitingItemLabel: capacity.limitingItemLabel,
      },
    ];
  });
}

type SportDirectorEquipmentFocus = "climbing" | "flat" | "standard" | "tt";

type SportDirectorEquipmentPresetScore = {
  presetId: string;
  climbing: number;
  flat: number;
  standard: number;
  tt: number;
  label: string;
};

function getEquipmentPresetSearchText(
  preset?: EquipmentSetupPresetOption | null,
): string {
  if (!preset) return "";

  const record = asRecord(preset);
  const { weightedBonuses, selectedItems, caps } =
    getPresetBonusPreview(preset);

  const selectedText = Array.isArray(selectedItems)
    ? selectedItems.map((item) => JSON.stringify(item)).join(" ")
    : JSON.stringify(asRecord(selectedItems));

  return [
    preset.setup_name,
    preset.label,
    record.name,
    record.description,
    record.setup_type,
    record.preset_type,
    record.equipment_type,
    record.limiting_item_label,
    record.limiting_equipment_category,
    JSON.stringify(weightedBonuses),
    JSON.stringify(caps),
    selectedText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getEquipmentBonusScore(
  weightedBonuses: JsonRecord,
  positiveKeys: string[],
  negativeKeys: string[] = [],
): number {
  let score = 0;

  Object.entries(weightedBonuses).forEach(([rawKey, rawValue]) => {
    const key = rawKey.toLowerCase();
    const value = Number(rawValue);

    if (!Number.isFinite(value)) return;

    if (positiveKeys.some((candidate) => key.includes(candidate))) {
      score += Math.max(value, 0);
    }

    if (negativeKeys.some((candidate) => key.includes(candidate))) {
      score -= Math.max(value, 0);
    }
  });

  return score;
}

function getSportDirectorEquipmentPresetScores(
  equipmentPresetOptions: EquipmentSetupPresetOption[],
): SportDirectorEquipmentPresetScore[] {
  return equipmentPresetOptions.map((preset) => {
    const text = getEquipmentPresetSearchText(preset);
    const { weightedBonuses } = getPresetBonusPreview(preset);
    const defaultOrStandard =
      isDefaultEquipmentPreset(preset) ||
      /\b(default|standard|balanced|all[ -]?round|regular|normal)\b/i.test(
        text,
      );

    const climbingKeywordScore = [
      "climb",
      "climber",
      "climbing",
      "mountain",
      "lightweight",
      "light weight",
      "hill",
      "hilly",
      "puncheur",
    ].reduce((sum, key) => sum + (text.includes(key) ? 18 : 0), 0);

    const flatKeywordScore = [
      "flat",
      "aero",
      "aerodynamic",
      "sprint",
      "sprinter",
      "speed",
      "fast",
      "rouleur",
      "rolling",
    ].reduce((sum, key) => sum + (text.includes(key) ? 16 : 0), 0);

    const ttKeywordScore = [
      "time trial",
      "timetrial",
      "tt",
      "chrono",
      "tri",
    ].reduce((sum, key) => sum + (text.includes(key) ? 18 : 0), 0);

    const climbingBonusScore = getEquipmentBonusScore(weightedBonuses, [
      "climb",
      "mountain",
      "hill",
      "weight",
      "acceleration",
    ]);

    const flatBonusScore = getEquipmentBonusScore(weightedBonuses, [
      "flat",
      "sprint",
      "speed",
      "aero",
      "endurance",
      "resistance",
    ]);

    const ttBonusScore = getEquipmentBonusScore(weightedBonuses, [
      "time_trial",
      "timetrial",
      "tt",
      "aero",
      "speed",
    ]);

    return {
      presetId: preset.id,
      label: String(preset.label ?? preset.setup_name ?? "Equipment setup"),
      climbing: climbingKeywordScore + climbingBonusScore,
      flat: flatKeywordScore + flatBonusScore,
      tt: ttKeywordScore + ttBonusScore,
      standard: defaultOrStandard ? 35 : 5,
    };
  });
}

function getStageEquipmentProfile(stage?: JsonRecord | null) {
  const profileType = String(stage?.profile_type ?? "").toLowerCase();
  const terrainType = String(stage?.terrain_type ?? "").toLowerCase();
  const finishType = String(stage?.finish_type ?? "").toLowerCase();
  const stageFormat = String(stage?.stage_format ?? "").toLowerCase();
  const elevationGain = normalizeNumericValue(stage?.elevation_gain_m, 0);
  const komCount = normalizeNumericValue(stage?.kom_count, 0);
  const sprintCount = normalizeNumericValue(stage?.sprint_count, 0);

  const isTT = TIME_TRIAL_STAGE_FORMATS.has(stageFormat);
  const isMountain =
    profileType.includes("climb") ||
    profileType.includes("mountain") ||
    terrainType.includes("mountain") ||
    elevationGain >= 1500 ||
    komCount >= 2;
  const isPuncheur =
    profileType.includes("puncheur") ||
    profileType.includes("hilly") ||
    terrainType.includes("hilly") ||
    (!isMountain && (komCount > 0 || elevationGain >= 700));
  const isSprintOrFlatFinish =
    profileType.includes("sprint") ||
    profileType.includes("flat") ||
    terrainType.includes("flat") ||
    finishType.includes("flat") ||
    sprintCount >= 2;

  return {
    isTT,
    isMountain,
    isPuncheur,
    isSprintOrFlatFinish,
  };
}

function getRiderEquipmentFocus({
  rider,
  role,
  stage,
}: {
  rider: JsonRecord;
  role?: unknown;
  stage?: JsonRecord | null;
}): SportDirectorEquipmentFocus {
  const stageProfile = getStageEquipmentProfile(stage);
  const roleCode = String(role ?? "").toLowerCase();
  const riderLabel = getRiderRoleLabel(rider).toLowerCase();
  const riderText = `${roleCode} ${riderLabel}`;

  const isLeaderLike =
    riderText.includes("team_leader") ||
    riderText.includes("leader") ||
    riderText.includes("gc") ||
    riderText.includes("protected");

  const isClimberLike =
    riderText.includes("climber") ||
    riderText.includes("mountain") ||
    riderText.includes("kom") ||
    riderText.includes("puncheur");

  const isSprinterLike =
    riderText.includes("sprinter") ||
    riderText.includes("lead_out") ||
    riderText.includes("lead-out") ||
    riderText.includes("lead out") ||
    riderText.includes("sprint_train") ||
    riderText.includes("sprint train");

  const isLeadOutLike =
    riderText.includes("lead_out") ||
    riderText.includes("lead-out") ||
    riderText.includes("lead out") ||
    riderText.includes("sprint_train") ||
    riderText.includes("sprint train");

  const isRouleurLike =
    riderText.includes("rouleur") ||
    riderText.includes("breakaway") ||
    riderText.includes("chaser");

  const isHelperLike =
    riderText.includes("domestique") || riderText.includes("helper");

  const isMixedPuncheurSprintStage =
    stageProfile.isPuncheur &&
    stageProfile.isSprintOrFlatFinish &&
    !stageProfile.isMountain;

  if (stageProfile.isTT || roleCode.includes("time_trial")) {
    return "tt";
  }

  /*
   * Important Sport Director rule:
   * Mixed stages should not give every rider the same setup.
   * If a stage has a KOM / hilly middle and a flatter sprint or finish,
   * climbers and leaders should chase climbing advantages while sprinters
   * and sprint support should keep flatter / aero equipment.
   */
  if (isMixedPuncheurSprintStage) {
    if (isLeaderLike || isClimberLike) return "climbing";
    if (isSprinterLike || isLeadOutLike) return "flat";
    if (isRouleurLike) return "flat";
    if (isHelperLike) return "standard";
    return "standard";
  }

  if (stageProfile.isMountain) {
    if (isLeaderLike || isClimberLike) return "climbing";
    if (isSprinterLike || isLeadOutLike) return "standard";
    if (isRouleurLike) return "climbing";
    if (isHelperLike) return "standard";
    return "climbing";
  }

  if (stageProfile.isPuncheur) {
    if (isLeaderLike || isClimberLike || isRouleurLike) return "climbing";
    if (isSprinterLike || isLeadOutLike) {
      return stageProfile.isSprintOrFlatFinish ? "flat" : "standard";
    }
    return "standard";
  }

  if (stageProfile.isSprintOrFlatFinish) {
    if (isSprinterLike || isLeadOutLike || isRouleurLike) return "flat";
    if (isLeaderLike || isClimberLike) return "standard";
    return "flat";
  }

  if (isLeaderLike || isClimberLike) return "climbing";
  if (isSprinterLike || isLeadOutLike || isRouleurLike) return "flat";

  return "standard";
}

function getPresetScoreForFocus(
  score: SportDirectorEquipmentPresetScore,
  focus: SportDirectorEquipmentFocus,
  stage?: JsonRecord | null,
): number {
  const stageProfile = getStageEquipmentProfile(stage);

  if (focus === "tt") {
    return score.tt * 1.15 + score.flat * 0.25 + score.standard * 0.15;
  }

  if (focus === "climbing") {
    return score.climbing * 1.2 + score.standard * 0.25 + score.flat * 0.1;
  }

  if (focus === "flat") {
    return score.flat * 1.1 + score.standard * 0.25 + score.climbing * 0.08;
  }

  if (stageProfile.isPuncheur) {
    return score.standard * 0.8 + score.climbing * 0.45 + score.flat * 0.25;
  }

  return score.standard + Math.max(score.climbing, score.flat, score.tt) * 0.12;
}

function buildSportDirectorEquipmentSuggestion({
  riders,
  stage,
  equipmentPresetOptions,
  currentEquipmentByRider,
  suggestedRoles,
  backendEquipment,
}: {
  riders: JsonRecord[];
  stage?: JsonRecord | null;
  equipmentPresetOptions: EquipmentSetupPresetOption[];
  currentEquipmentByRider: Record<string, string>;
  suggestedRoles: JsonRecord;
  backendEquipment: JsonRecord;
}): Record<string, string> {
  const validPresetIds = new Set(
    equipmentPresetOptions.map((preset) => preset.id),
  );
  const scores = getSportDirectorEquipmentPresetScores(equipmentPresetOptions);
  const presetById = new Map(
    equipmentPresetOptions.map((preset) => [preset.id, preset]),
  );
  const plannedCounts: Record<string, number> = {};
  const result: Record<string, string> = {};

  const sortedRiders = [...riders].sort((a, b) => {
    const aRole = String(
      suggestedRoles[String(a.id ?? "")] ?? "",
    ).toLowerCase();
    const bRole = String(
      suggestedRoles[String(b.id ?? "")] ?? "",
    ).toLowerCase();
    const priority = (role: string) =>
      role.includes("leader") || role.includes("gc")
        ? 1
        : role.includes("climber") || role.includes("mountain")
          ? 2
          : role.includes("sprinter") || role.includes("lead")
            ? 3
            : 5;

    return priority(aRole) - priority(bRole);
  });

  const canUsePreset = (presetId: string) => {
    const preset = presetById.get(presetId);
    if (!preset) return false;

    const capacity = getEquipmentPresetCapacity(preset);
    if (capacity.maxAssignments === null) return true;

    return (plannedCounts[presetId] ?? 0) < capacity.maxAssignments;
  };

  const addUse = (presetId: string) => {
    plannedCounts[presetId] = (plannedCounts[presetId] ?? 0) + 1;
  };

  sortedRiders.forEach((rider) => {
    const riderId = String(rider.id ?? "");
    if (!riderId) return;

    const backendPresetId = String(backendEquipment[riderId] ?? "");
    if (
      backendPresetId &&
      validPresetIds.has(backendPresetId) &&
      canUsePreset(backendPresetId)
    ) {
      result[riderId] = backendPresetId;
      addUse(backendPresetId);
      return;
    }

    const focus = getRiderEquipmentFocus({
      rider,
      role: suggestedRoles[riderId],
      stage,
    });

    const currentPresetId = String(currentEquipmentByRider[riderId] ?? "");
    const ranked = scores
      .map((score) => ({
        presetId: score.presetId,
        score: getPresetScoreForFocus(score, focus, stage),
      }))
      .filter((candidate) => canUsePreset(candidate.presetId))
      .sort((a, b) => b.score - a.score);

    const bestPresetId = ranked[0]?.presetId;
    const currentStillUsable =
      currentPresetId &&
      validPresetIds.has(currentPresetId) &&
      canUsePreset(currentPresetId);

    /*
     * Important availability rule:
     * Do not leave a rider without equipment just because no perfect
     * climbing/flat/TT match was found. If at least one equipment setup
     * still has an available configuration slot, assign the best remaining
     * available setup. This keeps Sport Director suggestions practical while
     * still respecting per-setup capacity.
     */
    const anyAvailablePresetId = equipmentPresetOptions.find((preset) =>
      canUsePreset(preset.id),
    )?.id;

    const chosenPresetId =
      bestPresetId ||
      (currentStillUsable ? currentPresetId : "") ||
      anyAvailablePresetId ||
      "";

    if (chosenPresetId) {
      result[riderId] = chosenPresetId;
      addUse(chosenPresetId);
    }
  });

  return result;
}

function StageRiderEquipmentCard({
  riders,
  equipmentPresetOptions,
  equipmentByRider,
  onChange,
  showSportDirectorAction,
  onAskSportDirector,
  sportDirectorLoading,
  sportDirectorDisabled,
  sportDirectorDisabledReason,
  onSave,
  saveDisabled,
  saving,
  disabled,
}: {
  riders: JsonRecord[];
  equipmentPresetOptions: EquipmentSetupPresetOption[];
  equipmentByRider: Record<string, string>;
  onChange: (riderId: string, presetId: string) => void;
  showSportDirectorAction: boolean;
  onAskSportDirector: () => void;
  sportDirectorLoading: boolean;
  sportDirectorDisabled: boolean;
  sportDirectorDisabledReason?: string;
  onSave: () => void;
  saveDisabled: boolean;
  saving: boolean;
  disabled: boolean;
}) {
  const assignmentCounts = getEquipmentPresetAssignmentCounts(equipmentByRider);
  const capacityConflicts = getEquipmentCapacityConflicts({
    equipmentPresetOptions,
    equipmentByRider,
  });
  const equipmentSaveDisabled = saveDisabled || capacityConflicts.length > 0;

  return (
    <section className="flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            1. Rider Equipment Packages
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose one equipment package for each rider for this stage.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showSportDirectorAction ? (
            <button
              type="button"
              onClick={onAskSportDirector}
              disabled={
                disabled ||
                equipmentSaveDisabled ||
                sportDirectorDisabled ||
                sportDirectorLoading ||
                saving
              }
              title={sportDirectorDisabledReason}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {sportDirectorLoading ? "Preparing…" : "Ask Sport Director"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={equipmentSaveDisabled}
            className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <InfoTooltip label="Rider equipment package help">
            <div className="text-sm font-semibold text-slate-900">
              Equipment package preview
            </div>
            <p className="mt-2">
              Each rider can use one saved equipment setup for this stage. The
              dropdown also includes the Default Race Setup from the Equipment
              Overview page. The counter beside each setup shows how many times
              that setup can still be assigned based on the lowest available
              equipment item inside the setup.
            </p>
            <p className="mt-2">
              Example: if a setup contains a tire set with 1/1 available, the
              setup can only be assigned to one rider on the same stage.
            </p>
          </InfoTooltip>
        </div>
      </div>

      {capacityConflicts.length > 0 ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <div className="font-semibold">Equipment setup capacity problem</div>
          <div className="mt-1 space-y-1">
            {capacityConflicts.map((conflict) => (
              <div key={conflict.presetId}>
                {conflict.label}: assigned {conflict.assigned} time
                {conflict.assigned === 1 ? "" : "s"}, but only{" "}
                {conflict.maxAssignments} available
                {conflict.limitingItemLabel
                  ? ` because of ${conflict.limitingItemLabel}`
                  : ""}
                .
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex-1 space-y-3">
        {riders.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No riders found from the submitted Race Plan yet.
          </div>
        )}

        {riders.map((rider) => {
          const riderId = String(rider.id ?? "");
          const selectedPresetId = equipmentByRider[riderId] ?? "";
          const selectedPreset = equipmentPresetOptions.find(
            (option) => option.id === selectedPresetId,
          );
          const selectedCapacity = getEquipmentPresetCapacity(selectedPreset);
          const selectedAssignmentCount = selectedPresetId
            ? (assignmentCounts[selectedPresetId] ?? 0)
            : 0;
          const selectedIsOverCapacity =
            selectedCapacity.maxAssignments !== null &&
            selectedAssignmentCount > selectedCapacity.maxAssignments;

          return (
            <div
              key={riderId}
              className={[
                "grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_300px]",
                selectedIsOverCapacity
                  ? "border-red-200 bg-red-50/50"
                  : "border-slate-200 bg-white",
              ].join(" ")}
            >
              <div className="min-w-0">
                <div className="group relative inline-block max-w-full">
                  <span className="cursor-help truncate font-medium text-slate-900">
                    {getRiderDisplayName(rider)}
                  </span>

                  <RiderHoverCard rider={rider} />
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {getRiderRoleLabel(rider)}
                  </span>
                </div>

                {selectedIsOverCapacity ? (
                  <div className="mt-2 text-xs font-semibold text-red-700">
                    This setup is assigned more times than the available
                    equipment allows.
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedPresetId}
                  onChange={(event) => onChange(riderId, event.target.value)}
                  disabled={disabled || equipmentPresetOptions.length === 0}
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  {equipmentPresetOptions.length === 0 ? (
                    <option value="">No equipment setup presets found</option>
                  ) : (
                    equipmentPresetOptions.map((option) => {
                      const assignmentCount = assignmentCounts[option.id] ?? 0;
                      const capacity = getEquipmentPresetCapacity(option);
                      const remaining =
                        capacity.maxAssignments === null
                          ? null
                          : Math.max(
                              capacity.maxAssignments - assignmentCount,
                              0,
                            );
                      const isCurrent = option.id === selectedPresetId;
                      const unavailable =
                        !isCurrent && remaining !== null && remaining <= 0;

                      const availabilityLabel =
                        getEquipmentPresetAvailabilityLabel({
                          preset: option,
                          assignmentCount,
                        });

                      const optionLabel = [
                        isDefaultEquipmentPreset(option)
                          ? "Default"
                          : option.label,
                        availabilityLabel,
                        capacity.limitingItemLabel
                          ? `limit: ${capacity.limitingItemLabel}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      return (
                        <option
                          key={option.id}
                          value={option.id}
                          disabled={unavailable}
                        >
                          {optionLabel}
                        </option>
                      );
                    })
                  )}
                </select>

                <EquipmentPresetTooltip preset={selectedPreset} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
        The dropdown also includes the Default Race Setup from the Equipment
        Overview page. If a selected equipment setup is no longer available
        before a stage because one of its equipment items is broken, worn out,
        assigned, or otherwise unavailable, the race engine should automatically
        fall back to Default. If Default also cannot be used, the stage setup
        should be blocked with a clear equipment warning.
      </div>
    </section>
  );
}

const STAGE_SUPPLY_RULES: Record<
  string,
  {
    label: string;
    shortLabel: string;
    minPerRider: number;
    maxPerRider: number;
    defaultPerRider: number;
    useType: "consumable" | "durable";
    mandatory: boolean;
    durabilityText: string;
    positiveEffects: string[];
    negativeEffects: string[];
  }
> = {
  bidons_water_bottles: {
    label: "Bidons / Water Bottles",
    shortLabel: "Bidons",
    minPerRider: 1,
    maxPerRider: 10,
    defaultPerRider: 2,
    useType: "consumable",
    mandatory: false,
    durabilityText:
      "One-use consumable. Each bottle used in a stage is consumed.",
    positiveEffects: [
      "Hydration support: +0.2% stamina stability per bidon",
      "Fatigue control: -0.2% stage fatigue per bidon",
    ],
    negativeEffects: [
      "Below minimum: +1% fatigue risk",
      "No extra benefit after 10 bidons per rider",
    ],
  },
  energy_gels: {
    label: "Energy Gels",
    shortLabel: "Gels",
    minPerRider: 0,
    maxPerRider: 4,
    defaultPerRider: 2,
    useType: "consumable",
    mandatory: false,
    durabilityText: "One-use consumable. Each gel used in a stage is consumed.",
    positiveEffects: [
      "Energy boost: +0.5% stamina per gel",
      "Final effort support: +0.25% sprint/climb/attack efficiency per gel",
    ],
    negativeEffects: [
      "No gels: -1% final-phase stamina support",
      "No extra benefit after 4 gels per rider",
    ],
  },
  nutrition_packs: {
    label: "Nutrition Packs",
    shortLabel: "Nutrition",
    minPerRider: 0,
    maxPerRider: 2,
    defaultPerRider: 1,
    useType: "consumable",
    mandatory: false,
    durabilityText:
      "One-use consumable. Each nutrition pack used in a stage is consumed.",
    positiveEffects: [
      "Endurance support: +1% stamina stability per pack",
      "Recovery support: +0.5% post-stage recovery per pack",
    ],
    negativeEffects: [
      "No nutrition on long stages: +1% fatigue pressure",
      "No extra benefit after 2 packs per rider",
    ],
  },
  race_jersey_complete: {
    label: "Race Jersey Kit",
    shortLabel: "Jersey Kit",
    minPerRider: 1,
    maxPerRider: 1,
    defaultPerRider: 1,
    useType: "durable",
    mandatory: true,
    durabilityText:
      "Mandatory durable kit. One jersey kit is needed per rider and each kit has 10 stage uses.",
    positiveEffects: [
      "Race readiness: +0.5% setup readiness",
      "Comfort support: +0.25% fatigue control",
    ],
    negativeEffects: ["Missing jersey kit: blocks stage setup"],
  },
  rain_jackets: {
    label: "Rain Jackets",
    shortLabel: "Rain Jacket",
    minPerRider: 0,
    maxPerRider: 1,
    defaultPerRider: 0,
    useType: "durable",
    mandatory: false,
    durabilityText:
      "Automatic durable item. The team uses rain jackets for all riders when the stage is rainy or below 15°C. Each jacket has 25 stage uses.",
    positiveEffects: [
      "Bad-weather protection: sickness risk reduced in rain or cold below 15°C",
      "Cold/rain fatigue support: lower fatigue and illness exposure",
    ],
    negativeEffects: [
      "Missing jackets do not block the start",
      "No jacket in rain/cold: riders become more exposed to illness risk after repeated exposure",
    ],
  },
};

function clampStageSupplyValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.floor(value), min), max);
}

function getSupplyAvailableQuantity(
  supplyOptions: RaceSupplyOption[],
  supplyKey: string,
): number {
  const option = supplyOptions.find((row) => row.supply_key === supplyKey);
  return Number(option?.quantity_available ?? 0);
}

function getStageWeatherRisk(stage: JsonRecord | null) {
  const weather = stage ? pickStageWeatherRecord(null, stage) : {};
  const temperature = pickWeatherNumber(weather, [
    "temperature_c",
    "temp_c",
    "avg_temperature_c",
    "average_temperature_c",
    "avg_temp_c",
    "average_temp_c",
    "temperature",
  ]);
  const wind = pickWeatherNumber(weather, [
    "wind_kph",
    "wind_speed_kph",
    "wind_km_h",
    "wind_kmh",
    "avg_wind_kmh",
    "wind_speed",
    "wind",
  ]);
  const rainChance = pickWeatherNumber(weather, [
    "rain_chance_pct",
    "rain_probability_pct",
    "precipitation_chance_pct",
    "precipitation_probability_pct",
    "chance_of_rain_pct",
  ]);
  const precipitationMm = pickWeatherNumber(weather, [
    "avg_precip_mm",
    "precip_mm",
    "precipitation_mm",
    "rain_mm",
    "avg_rain_mm",
  ]);
  const rain = rainChance ?? precipitationMm;
  const text = String(
    weather.condition_label ??
      weather.label ??
      weather.name ??
      weather.condition ??
      weather.summary ??
      weather.weather_summary ??
      weather.weather ??
      weather.icon ??
      "",
  ).toLowerCase();

  const isRain =
    (rainChance !== null && rainChance >= 40) ||
    (precipitationMm !== null && precipitationMm >= 2);
  const isCold = temperature !== null && temperature < 15;
  const isWindy = wind !== null && wind >= 35;
  const textBad =
    text.includes("rain") ||
    text.includes("storm") ||
    text.includes("shower") ||
    text.includes("snow") ||
    text.includes("cold");

  const isBadWeather = isRain || isCold || (isCold && isWindy) || textBad;

  const rainJacketRequired = isRain || isCold || textBad;

  return {
    weather,
    temperature,
    wind,
    rain,
    isRain,
    isCold,
    isWindy,
    textBad,
    rainJacketRequired,
    isBadWeather,
    reason: isBadWeather
      ? [
          isRain ? "rain risk" : "",
          isCold ? "cold below 15°C" : "",
          isWindy ? "strong wind" : "",
          textBad ? "bad-weather condition text" : "",
        ]
          .filter(Boolean)
          .join(", ")
      : "no strong weather risk detected",
  };
}

function getStageTeamSupplyPlan({
  riders,
  suppliesByRider,
  stage,
}: {
  riders: JsonRecord[];
  suppliesByRider: Record<string, StageRiderSupplyDraft>;
  stage: JsonRecord | null;
}): StageTeamSupplyPlan {
  const firstRiderId = String(riders[0]?.id ?? "");
  const first =
    (firstRiderId && suppliesByRider[firstRiderId]) ||
    normalizeRiderSupplyDraft(null);

  const riderCount = riders.length;
  const jacketCount = riders.reduce((count, rider) => {
    const riderId = String(rider.id ?? "");
    return count + (suppliesByRider[riderId]?.rain_jacket ? 1 : 0);
  }, 0);

  const weatherRisk = getStageWeatherRisk(stage);

  let rainJacketMode: StageRainJacketMode = "none";
  if (
    riderCount > 0 &&
    (weatherRisk.rainJacketRequired || jacketCount === riderCount)
  ) {
    rainJacketMode = "all";
  }

  return {
    bidonsPerRider: clampStageSupplyValue(
      Number(first.bidons),
      STAGE_SUPPLY_RULES.bidons_water_bottles.minPerRider,
      STAGE_SUPPLY_RULES.bidons_water_bottles.maxPerRider,
    ),
    gelsPerRider: clampStageSupplyValue(
      Number(first.gels),
      STAGE_SUPPLY_RULES.energy_gels.minPerRider,
      STAGE_SUPPLY_RULES.energy_gels.maxPerRider,
    ),
    nutritionPacksPerRider: clampStageSupplyValue(
      Number(first.nutrition_packs),
      STAGE_SUPPLY_RULES.nutrition_packs.minPerRider,
      STAGE_SUPPLY_RULES.nutrition_packs.maxPerRider,
    ),
    rainJacketMode,
  };
}

function getStageSupplyNeeds(
  riders: JsonRecord[],
  plan: StageTeamSupplyPlan,
  stage: JsonRecord | null,
) {
  const riderCount = riders.length;
  const weatherRisk = getStageWeatherRisk(stage);
  const rainJacketCount =
    plan.rainJacketMode === "all" || weatherRisk.rainJacketRequired
      ? riderCount
      : 0;

  return {
    riderCount,
    bidons_water_bottles: riderCount * plan.bidonsPerRider,
    energy_gels: riderCount * plan.gelsPerRider,
    nutrition_packs: riderCount * plan.nutritionPacksPerRider,
    race_jersey_complete: riderCount,
    rain_jackets: rainJacketCount,
    weatherRisk,
  };
}

function buildSuppliesByRiderFromTeamPlan(
  riders: JsonRecord[],
  plan: StageTeamSupplyPlan,
  stage: JsonRecord | null,
): Record<string, StageRiderSupplyDraft> {
  const weatherRisk = getStageWeatherRisk(stage);
  const useRainJacket =
    plan.rainJacketMode === "all" || weatherRisk.rainJacketRequired;

  return riders.reduce<Record<string, StageRiderSupplyDraft>>((acc, rider) => {
    const riderId = String(rider.id ?? "");
    if (!riderId) return acc;

    acc[riderId] = {
      bidons: plan.bidonsPerRider,
      gels: plan.gelsPerRider,
      nutrition_packs: plan.nutritionPacksPerRider,
      race_jersey_complete: true,
      rain_jacket: useRainJacket,
    };

    return acc;
  }, {});
}

function StageSupplyNumberInput({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(clampStageSupplyValue(Number(event.target.value), min, max))
        }
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
      />
      <span className="mt-1 block text-xs text-slate-400">
        Min {min} / Max {max} per rider
      </span>
    </label>
  );
}

function StageSupplyRowInput({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="mt-0.5 text-xs text-slate-400">
          Min {min} / Max {max} per rider
        </div>
      </div>

      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(clampStageSupplyValue(Number(event.target.value), min, max))
        }
        className="h-10 w-24 shrink-0 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-900 disabled:bg-slate-100"
      />
    </label>
  );
}

function StageSupplyInventoryLine({
  label,
  needed,
  available,
  durable,
  durabilityText,
}: {
  label: string;
  needed: number;
  available: number;
  durable: boolean;
  durabilityText: string;
}) {
  const missing = needed > available;

  return (
    <div
      className={[
        "rounded-xl border px-3 py-2",
        missing ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div
          className={[
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            missing
              ? "bg-red-100 text-red-700"
              : "bg-emerald-100 text-emerald-700",
          ].join(" ")}
        >
          {needed} / {available || "—"}
        </div>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {durable ? durabilityText : "One-use consumable"}
      </div>
      {missing ? (
        <div className="mt-1 text-xs font-semibold text-red-700">
          Missing {needed - available}
        </div>
      ) : null}
    </div>
  );
}

function StageRaceSuppliesCard({
  stage,
  riders,
  supplyOptions,
  suppliesByRider,
  onApplyTeamPlan,
  onSave,
  saveDisabled,
  saving,
  disabled,
}: {
  stage: JsonRecord | null;
  riders: JsonRecord[];
  supplyOptions: RaceSupplyOption[];
  suppliesByRider: Record<string, StageRiderSupplyDraft>;
  onApplyTeamPlan: (teamPlan: StageTeamSupplyPlan) => void;
  onSave: () => void;
  saveDisabled: boolean;
  saving: boolean;
  disabled: boolean;
}) {
  const teamPlan = getStageTeamSupplyPlan({ riders, suppliesByRider, stage });
  const needs = getStageSupplyNeeds(riders, teamPlan, stage);
  const jerseyAvailable = getSupplyAvailableQuantity(
    supplyOptions,
    "race_jersey_complete",
  );
  const rainAvailable = getSupplyAvailableQuantity(
    supplyOptions,
    "rain_jackets",
  );
  const rainJacketSelected =
    teamPlan.rainJacketMode === "all" || needs.weatherRisk.rainJacketRequired;
  const suppliesDisabledForTT = isTimeTrialStage(stage);
  const suppliesInputDisabled = disabled || suppliesDisabledForTT;
  const jerseyMissing =
    !suppliesDisabledForTT && needs.race_jersey_complete > jerseyAvailable;
  const displayNeeds = suppliesDisabledForTT
    ? {
        ...needs,
        bidons_water_bottles: 0,
        energy_gels: 0,
        nutrition_packs: 0,
        race_jersey_complete: 0,
        rain_jackets: 0,
      }
    : needs;
  const rainJacketsMissing =
    !suppliesDisabledForTT && displayNeeds.rain_jackets > rainAvailable;

  function updatePlan(patch: Partial<StageTeamSupplyPlan>) {
    onApplyTeamPlan({
      ...teamPlan,
      ...patch,
      rainJacketMode: patch.rainJacketMode ?? teamPlan.rainJacketMode,
    });
  }

  return (
    <section
      className={[
        "rounded-2xl border p-5 shadow-sm",
        suppliesDisabledForTT
          ? "border-slate-200 bg-slate-50 text-slate-500"
          : "bg-white",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            4. Stage Race Supplies
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Team-level supply setup for this stage. Consumables are applied per
            rider; Race Jersey Kit is mandatory and Rain Jackets are a team-wide
            yes/no choice.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled || jerseyMissing || suppliesDisabledForTT}
            className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>

          <InfoTooltip
            label={
              suppliesDisabledForTT
                ? "Stage Supplies on Time Trials"
                : "Stage race supplies help"
            }
            panelWidthClass="w-[30rem]"
          >
            {suppliesDisabledForTT ? (
              <>
                <div className="text-sm font-semibold text-slate-900">
                  Stage Supplies on Time Trials
                </div>
                <p className="mt-2">
                  Stage supplies are disabled for Prologue, ITT and TTT stages.
                </p>
                <p className="mt-2">
                  Bidons, energy gels, nutrition packs and rain jackets do not
                  affect these short controlled efforts in v1.
                </p>
                <p className="mt-2">
                  Equipment, condition, race support, fatigue control and pacing
                  are still used in the final calculation.
                </p>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">
                  Supply rules and effects
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  These are simple stage-engine effects. The race engine should
                  use them as small modifiers, not guaranteed outcomes.
                </p>
                <div className="mt-3 space-y-3">
                  {Object.entries(STAGE_SUPPLY_RULES).map(([key, rule]) => (
                    <div
                      key={key}
                      className="rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {rule.label}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {rule.durabilityText}
                          </div>
                        </div>

                        <span
                          className={[
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            rule.useType === "durable"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-emerald-50 text-emerald-700",
                          ].join(" ")}
                        >
                          {rule.useType === "durable"
                            ? "durable"
                            : "consumable"}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3">
                        <div>
                          <div className="text-xs font-semibold text-emerald-700">
                            Positive
                          </div>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600">
                            {rule.positiveEffects.map((effect) => (
                              <li key={effect}>{effect}</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-red-700">
                            Negative / limits
                          </div>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600">
                            {rule.negativeEffects.map((effect) => (
                              <li key={effect}>{effect}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </InfoTooltip>
        </div>
      </div>

      {suppliesDisabledForTT ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
          Stage supplies are not used for Prologue, ITT or TTT stages. No
          bidons, gels, nutrition packs or rain jackets are consumed for this
          stage.
        </div>
      ) : null}

      {jerseyMissing ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          Race Jersey Kit is mandatory. You need{" "}
          {displayNeeds.race_jersey_complete}, but only {jerseyAvailable} are
          available. This blocks saving/starting the stage.
        </div>
      ) : null}

      {rainJacketsMissing ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          Rain jackets are needed because of {needs.weatherRisk.reason}, but
          only {rainAvailable} are available for {displayNeeds.rain_jackets}{" "}
          riders. The stage can still start, but riders are more exposed to
          illness risk.
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Stage supply setup
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Choose the per-rider consumables and team-wide reusable items for
              this selected stage.
            </p>
          </div>

          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
            {riders.length} riders selected
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Stage supplies
          </div>

          <StageSupplyRowInput
            label="Bidons"
            value={teamPlan.bidonsPerRider}
            min={STAGE_SUPPLY_RULES.bidons_water_bottles.minPerRider}
            max={STAGE_SUPPLY_RULES.bidons_water_bottles.maxPerRider}
            disabled={suppliesInputDisabled}
            onChange={(value) => updatePlan({ bidonsPerRider: value })}
          />

          <StageSupplyRowInput
            label="Energy Gels"
            value={teamPlan.gelsPerRider}
            min={STAGE_SUPPLY_RULES.energy_gels.minPerRider}
            max={STAGE_SUPPLY_RULES.energy_gels.maxPerRider}
            disabled={suppliesInputDisabled}
            onChange={(value) => updatePlan({ gelsPerRider: value })}
          />

          <StageSupplyRowInput
            label="Nutrition Packs"
            value={teamPlan.nutritionPacksPerRider}
            min={STAGE_SUPPLY_RULES.nutrition_packs.minPerRider}
            max={STAGE_SUPPLY_RULES.nutrition_packs.maxPerRider}
            disabled={suppliesInputDisabled}
            onChange={(value) => updatePlan({ nutritionPacksPerRider: value })}
          />

          <div
            className={[
              "rounded-xl border bg-white p-3",
              jerseyMissing ? "border-red-200" : "border-slate-200",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Race Jersey Kit
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Mandatory for all selected riders. Missing jersey kits block
                  the stage setup.
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  10 stage uses per kit.
                </div>
              </div>

              <span
                className={[
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                  jerseyMissing
                    ? "bg-red-100 text-red-700"
                    : "bg-emerald-100 text-emerald-700",
                ].join(" ")}
              >
                {displayNeeds.race_jersey_complete} needed
              </span>
            </div>
          </div>

          <div
            className={[
              "rounded-xl border bg-white p-3",
              rainJacketsMissing ? "border-amber-200" : "border-slate-200",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Rain Jackets
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Automatically used for all riders when the stage is rainy or
                  below 15°C.
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Weather: {needs.weatherRisk.reason}. Missing jackets do not
                  block the start, but increase illness exposure.
                </div>
              </div>

              <span
                className={[
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                  rainJacketsMissing
                    ? "bg-amber-100 text-amber-800"
                    : rainJacketSelected
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600",
                ].join(" ")}
              >
                {rainJacketSelected
                  ? `${displayNeeds.rain_jackets} auto-needed`
                  : "Not needed"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Stage stock check
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Needed for this stage compared with currently available club
              stock.
            </p>
          </div>

          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            Plan only
          </span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <StageSupplyInventoryLine
            label="Bidons / Water Bottles"
            needed={displayNeeds.bidons_water_bottles}
            available={getSupplyAvailableQuantity(
              supplyOptions,
              "bidons_water_bottles",
            )}
            durable={false}
            durabilityText=""
          />
          <StageSupplyInventoryLine
            label="Energy Gels"
            needed={displayNeeds.energy_gels}
            available={getSupplyAvailableQuantity(supplyOptions, "energy_gels")}
            durable={false}
            durabilityText=""
          />
          <StageSupplyInventoryLine
            label="Nutrition Packs"
            needed={displayNeeds.nutrition_packs}
            available={getSupplyAvailableQuantity(
              supplyOptions,
              "nutrition_packs",
            )}
            durable={false}
            durabilityText=""
          />
          <StageSupplyInventoryLine
            label="Race Jersey Kit"
            needed={displayNeeds.race_jersey_complete}
            available={jerseyAvailable}
            durable
            durabilityText="10 stage uses per jersey"
          />
          <StageSupplyInventoryLine
            label="Rain Jackets"
            needed={displayNeeds.rain_jackets}
            available={rainAvailable}
            durable
            durabilityText="25 stage uses per jacket"
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        Stage Plan save only stores the plan. Consumables and durable item usage
        are applied later by the race engine when the stage is processed.
      </div>
    </section>
  );
}

function getStagePlanRaceBonusRows(standardizedBonus: JsonRecord) {
  const groups = toArray<JsonRecord>(standardizedBonus.groups);

  if (groups.length > 0) {
    return groups.map((group) => {
      const bonusKey = String(group.bonus_key ?? group.key ?? "");
      return {
        key: bonusKey || String(group.display_name ?? "bonus"),
        label: String(group.display_name ?? titleFromSnake(bonusKey)),
        value: Number(group.percent ?? group.points ?? 0),
        description: String(
          group.description ??
            standardizedBonusDescriptions[bonusKey] ??
            "Race Plan bonus",
        ),
      };
    });
  }

  const totals = asRecord(standardizedBonus.totals);

  return Object.entries(totals).map(([key, value]) => ({
    key,
    label: titleFromSnake(key),
    value: Number(value),
    description: standardizedBonusDescriptions[key] ?? "Race Plan bonus",
  }));
}

function sumEquipmentWeightedBonuses(
  equipmentPresetOptions: EquipmentSetupPresetOption[],
  equipmentByRider: Record<string, string>,
) {
  return Object.values(equipmentByRider).reduce(
    (acc, presetId) => {
      const preset = equipmentPresetOptions.find(
        (option) => option.id === presetId,
      );
      const { weightedBonuses } = getPresetBonusPreview(preset);

      Object.values(weightedBonuses).forEach((value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return;
        if (numeric >= 0) acc.positive += numeric;
        if (numeric < 0) acc.negative += numeric;
      });

      return acc;
    },
    { positive: 0, negative: 0 },
  );
}

function getStageIndividualOverrideCount(draft: StagePlanDraft) {
  return Object.values(draft.individualTacticsByRider).reduce(
    (sum, riderPlan) => {
      return (
        sum +
        Object.values(riderPlan).filter(
          (phase) => phase.command !== "follow_team_plan",
        ).length
      );
    },
    0,
  );
}

function getStageRoleCounts(draft: StagePlanDraft) {
  return Object.values(draft.riderRolesByRider).reduce<Record<string, number>>(
    (acc, role) => {
      const label = STAGE_RIDER_ROLE_LABELS[String(role)] ?? String(role);
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    },
    {},
  );
}

function getAverageRiderSkill(
  riders: JsonRecord[],
  keys: string[],
): number | null {
  const values = riders.flatMap((rider) => {
    for (const key of keys) {
      const numeric = Number(rider[key] ?? rider[`${key}_skill`]);
      if (Number.isFinite(numeric)) return [numeric];
    }

    return [];
  });

  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getPacingRiskLabel(plan: string) {
  switch (plan) {
    case "tt_balanced_pace":
      return "Low";
    case "tt_fast_start":
      return "Medium-high";
    case "tt_negative_split":
      return "Medium";
    case "tt_all_out":
      return "High";
    default:
      return "Normal";
  }
}

function getDroppedRiderRiskLabel(
  teamworkAverage: number | null,
  plan: string,
) {
  if (plan === "tt_all_out") return "High";
  if (plan === "tt_fast_start") return "Medium-high";
  if (teamworkAverage !== null && teamworkAverage >= 75) return "Low";
  if (teamworkAverage !== null && teamworkAverage < 55) return "High";
  return "Medium";
}

function StageFinalCalculationCard({
  stage,
  riders,
  draft,
  equipmentPresetOptions,
  supplyOptions,
  standardizedBonus,
  exactBonusPreview,
  onSave,
  saveDisabled,
  saving,
}: {
  stage: JsonRecord | null;
  riders: JsonRecord[];
  draft: StagePlanDraft;
  equipmentPresetOptions: EquipmentSetupPresetOption[];
  supplyOptions: RaceSupplyOption[];
  standardizedBonus: JsonRecord;
  exactBonusPreview: JsonRecord;
  onSave: () => void;
  saveDisabled: boolean;
  saving: boolean;
}) {
  const isTTStage = isTimeTrialStage(stage);
  const isTTTStage = stage?.stage_format === "team_time_trial";
  const normalizedTeamPlan = normalizeStageTacticPlan(
    draft.teamTactic.plan,
    stage,
  );
  const teamPlan = getStageTeamSupplyPlan({
    riders,
    suppliesByRider: draft.suppliesByRider,
    stage,
  });
  const needs = getStageSupplyNeeds(riders, teamPlan, stage);
  const equipmentTotals = sumEquipmentWeightedBonuses(
    equipmentPresetOptions,
    draft.equipmentByRider,
  );
  const raceBonusRows = getStagePlanRaceBonusRows(standardizedBonus);
  const jacketSelected = needs.rain_jackets > 0;
  const jacketBenefitActive =
    jacketSelected && needs.weatherRisk.rainJacketRequired;
  const jerseyAvailable = getSupplyAvailableQuantity(
    supplyOptions,
    "race_jersey_complete",
  );
  const missingJerseys = isTTStage
    ? 0
    : Math.max(needs.race_jersey_complete - jerseyAvailable, 0);
  const racePlanBonusTotal = raceBonusRows.reduce(
    (sum, row) => sum + (Number.isFinite(row.value) ? row.value : 0),
    0,
  );
  const teamworkAverage = getAverageRiderSkill(riders, [
    "teamwork",
    "team_work",
  ]);
  const ttAverage = getAverageRiderSkill(riders, ["time_trial", "timetrial"]);
  const countingRiderCount =
    riders.length > 0 ? Math.max(1, Math.ceil(riders.length * 0.75)) : 0;

  void exactBonusPreview;

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            5. Final Stage Calculation
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isTTStage
              ? "Time-trial engine preview for equipment, support, fatigue, weather and pacing risk."
              : "Team-level engine preview for this exact stage setup: Race Plan bonuses, equipment, supplies, weather and risk factors."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled || missingJerseys > 0}
            className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>

          <InfoTooltip
            label="Final stage calculation help"
            panelWidthClass="w-[30rem]"
          >
            <div className="text-sm font-semibold text-slate-900">
              What this preview means
            </div>
            {isTTStage ? (
              <p className="mt-2">
                TT stages ignore supply consumption/effects in v1. The preview
                focuses on equipment, equipment condition, race support, fatigue
                control, recovery support, reliability, weather/wind and pacing
                risk.
              </p>
            ) : (
              <>
                <p className="mt-2">
                  This is a team-level preview. The race engine should combine
                  Race Plan staff/assets/policy bonuses, rider equipment, stage
                  supplies, team tactic, rider roles and individual commands.
                </p>
                <p className="mt-2">
                  Weather, crashes, mechanicals, fatigue, health and sickness
                  risk should be applied later by the race engine during stage
                  processing.
                </p>
              </>
            )}
          </InfoTooltip>
        </div>
      </div>

      {isTTStage ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <InfoBox
              label="TT equipment effect"
              value={`+${formatBonusPercent(
                equipmentTotals.positive,
              )} / ${formatBonusPercent(equipmentTotals.negative)}%`}
            />
            <InfoBox label="Equipment condition" value="Included" />
            <InfoBox
              label="Race support"
              value={`+${formatBonusPercent(racePlanBonusTotal)}%`}
            />
            <InfoBox label="Fatigue control" value="Included" />
            <InfoBox label="Recovery support" value="Included" />
            <InfoBox label="Mechanical reliability" value="Included" />
            <InfoBox
              label="Weather / wind risk"
              value={needs.weatherRisk.reason}
            />
            <InfoBox
              label="Pacing risk"
              value={getPacingRiskLabel(normalizedTeamPlan)}
            />
            <InfoBox
              label="Average TT skill"
              value={ttAverage !== null ? ttAverage.toFixed(0) : "—"}
            />
            {isTTTStage ? (
              <>
                <InfoBox label="Team cohesion" value="Included" />
                <InfoBox
                  label="Average teamwork"
                  value={
                    teamworkAverage !== null ? teamworkAverage.toFixed(0) : "—"
                  }
                />
                <InfoBox
                  label="Counting rider group"
                  value={
                    riders.length > 0
                      ? `${countingRiderCount}/${riders.length} riders`
                      : "—"
                  }
                />
                <InfoBox
                  label="Dropped rider risk"
                  value={getDroppedRiderRiskLabel(
                    teamworkAverage,
                    normalizedTeamPlan,
                  )}
                />
              </>
            ) : null}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-900">
              Time-trial factors
            </div>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              {getStageRaceSituationFactors(stage).map((factor) => (
                <div key={factor} className="rounded-lg bg-slate-50 px-3 py-2">
                  {titleFromSnake(factor)}
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Supply consumption and supply effects are not shown for TT stages
              because they are disabled for Prologue, ITT and TTT in v1.
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <InfoBox
              label="Race Plan bonus total"
              value={`+${formatBonusPercent(racePlanBonusTotal)}%`}
            />
            <InfoBox
              label="Equipment bonus direction"
              value={`+${formatBonusPercent(
                equipmentTotals.positive,
              )} / ${formatBonusPercent(equipmentTotals.negative)}%`}
            />
            <InfoBox
              label="Rain jacket effect"
              value={
                jacketBenefitActive
                  ? "-50% sickness risk / -1% efficiency"
                  : jacketSelected
                    ? "-1% efficiency"
                    : "Not active"
              }
            />
          </div>

          {missingJerseys > 0 ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              Missing mandatory Race Jersey Kit units: {missingJerseys}. This
              should block the final stage setup.
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">
                Race Plan bonuses
              </div>
              <div className="mt-3 space-y-2">
                {raceBonusRows.length > 0 ? (
                  raceBonusRows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">
                          {row.label}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.description}
                        </div>
                      </div>
                      <div className="font-bold text-emerald-700">
                        +{formatBonusPercent(row.value)}%
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    Race Plan bonus preview is not available yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">
                Stage supplies
              </div>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span>Bidons needed</span>
                  <strong>{needs.bidons_water_bottles}</strong>
                </div>
                <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span>Energy gels needed</span>
                  <strong>{needs.energy_gels}</strong>
                </div>
                <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span>Nutrition packs needed</span>
                  <strong>{needs.nutrition_packs}</strong>
                </div>
                <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span>Race jerseys needed</span>
                  <strong>{needs.race_jersey_complete}</strong>
                </div>
                <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span>Rain jackets needed</span>
                  <strong>{needs.rain_jackets}</strong>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                Jerseys: 10 stage uses each. Rain jackets: 25 stage uses each.
                Jackets reduce bad-weather sickness risk by 50%, but add -1%
                rider efficiency whenever used.
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function StageTeamTacticCard({
  stage,
  riders,
  value,
  riderRolesByRider,
  onChange,
  onRoleChange,
  showSportDirectorAction,
  onAskSportDirector,
  sportDirectorLoading,
  sportDirectorDisabled,
  sportDirectorDisabledReason,
  onSave,
  saveDisabled,
  saving,
  disabled,
}: {
  stage: JsonRecord | null;
  riders: JsonRecord[];
  value: { plan: string; notes: string };
  riderRolesByRider: Record<string, StageRiderRoleCode | string>;
  onChange: (next: { plan: string; notes: string }) => void;
  onRoleChange: (riderId: string, role: StageRiderRoleCode) => void;
  showSportDirectorAction: boolean;
  onAskSportDirector: () => void;
  sportDirectorLoading: boolean;
  sportDirectorDisabled: boolean;
  sportDirectorDisabledReason?: string;
  onSave: () => void;
  saveDisabled: boolean;
  saving: boolean;
  disabled: boolean;
}) {
  const isTTStage = isTimeTrialStage(stage);
  const isTTTStage = stage?.stage_format === "team_time_trial";
  const tacticOptions = getStageTacticPlanOptions(stage);
  const normalizedPlan = normalizeStageTacticPlan(value.plan, stage);
  const engineRoleLabel = isTTTStage
    ? "Team Time Trial Rider"
    : "Time Trial Rider";

  return (
    <section className="flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {isTTStage ? "2. Time Trial Pacing" : "2. Stage Roles"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isTTStage
              ? "Time-trial pacing plan and read-only engine roles for this selected stage."
              : "Choose one clear role for each rider. Detailed race orders are set below in Individual Tactics."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showSportDirectorAction ? (
            <button
              type="button"
              onClick={onAskSportDirector}
              disabled={
                disabled ||
                saveDisabled ||
                sportDirectorDisabled ||
                sportDirectorLoading ||
                saving
              }
              title={sportDirectorDisabledReason}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {sportDirectorLoading ? "Preparing…" : "Ask Sport Director"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
            className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <RoleExplanationTooltip stage={stage} />
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-4">
        {isTTStage ? (
          <div>
            <div className="mb-1">
              <label className="block text-sm font-medium text-slate-700">
                Pacing plan
              </label>
            </div>

            <select
              value={normalizedPlan}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  plan: event.target.value,
                  notes: "",
                })
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              {tacticOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <div className="mb-2 text-sm font-semibold text-slate-900">
            Rider stage roles
          </div>

          {isTTStage ? (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Normal road roles are disabled for Prologue, ITT and TTT stages.
            </div>
          ) : null}

          <div className="space-y-3">
            {riders.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No riders found from the submitted Race Plan yet.
              </div>
            )}

            {riders.map((rider) => {
              const riderId = String(rider.id ?? "");
              const role = String(
                riderRolesByRider[riderId] ?? DEFAULT_STAGE_RIDER_ROLE,
              ) as StageRiderRoleCode;

              if (isTTStage) {
                return (
                  <div
                    key={riderId}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                  >
                    <div className="group relative inline-block max-w-full">
                      <span className="cursor-help truncate font-semibold text-slate-900">
                        {getRiderDisplayName(rider)}
                      </span>
                      <RiderHoverCard rider={rider} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Engine role: {engineRoleLabel}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={riderId}
                  className="grid items-center gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_240px]"
                >
                  <div className="min-w-0">
                    <div className="group relative inline-block max-w-full">
                      <span className="cursor-help truncate font-medium text-slate-900">
                        {getRiderDisplayName(rider)}
                      </span>
                      <RiderHoverCard rider={rider} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Engine role: {STAGE_RIDER_ROLE_LABELS[role] ?? role}
                    </div>
                  </div>

                  <select
                    value={role}
                    disabled={disabled}
                    onChange={(event) =>
                      onRoleChange(
                        riderId,
                        event.target.value as StageRiderRoleCode,
                      )
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  >
                    {STAGE_RIDER_ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function StageIndividualTacticsCard({
  stage,
  riders,
  riderRolesByRider,
  individualTacticsByRider,
  onChange,
  showSportDirectorAction,
  onAskSportDirector,
  sportDirectorLoading,
  sportDirectorDisabled,
  sportDirectorDisabledReason,
  onSave,
  saveDisabled,
  saving,
  disabled,
}: {
  stage: JsonRecord | null;
  riders: JsonRecord[];
  riderRolesByRider: Record<string, StageRiderRoleCode | string>;
  individualTacticsByRider: StageIndividualTacticsByRider;
  onChange: (riderId: string, phaseKey: string, command: string) => void;
  showSportDirectorAction: boolean;
  onAskSportDirector: () => void;
  sportDirectorLoading: boolean;
  sportDirectorDisabled: boolean;
  sportDirectorDisabledReason?: string;
  onSave: () => void;
  saveDisabled: boolean;
  saving: boolean;
  disabled: boolean;
}) {
  const phases = getStagePhaseRanges(stage);
  const isTTStage = isTimeTrialStage(stage);
  const phaseGridTemplate = `250px repeat(${phases.length}, minmax(150px, 1fr))`;

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            3. Individual Tactics
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {isTTStage
              ? "Time-trial pacing is split into Before split and After split."
              : "Phases 1–3 contain general race orders. Phase 4 contains finish preparation, sprint-train and lead-out orders."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {showSportDirectorAction ? (
            <button
              type="button"
              onClick={onAskSportDirector}
              disabled={
                disabled ||
                saveDisabled ||
                sportDirectorDisabled ||
                sportDirectorLoading ||
                saving
              }
              title={sportDirectorDisabledReason}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {sportDirectorLoading ? "Preparing…" : "Ask Sport Director"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
            className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>

          <InfoTooltip
            label={
              isTTStage ? "Time Trial Pacing" : "Individual tactic commands"
            }
            panelWidthClass="w-[28rem]"
          >
            {isTTStage ? (
              <>
                <div className="text-sm font-semibold text-slate-900">
                  Time Trial Pacing
                </div>
                <p className="mt-2">
                  For time-trial stages, individual tactics are simplified into
                  two parts:
                </p>
                <div className="mt-3 space-y-2">
                  <div>
                    <span className="font-semibold text-slate-900">
                      Before split:
                    </span>{" "}
                    How hard the rider/team rides in the first half.
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">
                      After split:
                    </span>{" "}
                    How hard the rider/team rides in the second half.
                  </div>
                </div>
                <p className="mt-3">
                  Strong TT riders can handle Hard or Maximum Effort better.
                  Weaker or tired riders can start too hard, lose stamina before
                  the split, and fade in the second half.
                </p>
                <div className="mt-3 space-y-1">
                  <div>Controlled = safer and slower.</div>
                  <div>Steady = normal rhythm.</div>
                  <div>Hard = faster but more fatigue.</div>
                  <div>Maximum Effort = fastest but high blow-up risk.</div>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-900">
                  Individual tactic commands
                </div>
                <p className="mt-2">
                  These commands are optional. They override the general team
                  stage role only for this rider and only for the selected phase of
                  the stage. Phases 1–3 and Phase 4 intentionally use different command lists.
                </p>
                <div className="mt-3 space-y-2">
                  {STAGE_INDIVIDUAL_TACTIC_OPTIONS.map((option) => (
                    <div key={option.value}>
                      <span className="font-semibold text-slate-900">
                        {option.label}
                      </span>{" "}
                      — {option.description}
                    </div>
                  ))}
                </div>
              </>
            )}
          </InfoTooltip>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Do not forget to save this stage. These phase commands are saved only
        for the selected stage.
      </div>

      <div className="mt-4 overflow-x-auto">
        <div
          className="space-y-3"
          style={{ minWidth: isTTStage ? "650px" : "980px" }}
        >
          <div
            className="grid gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
            style={{ gridTemplateColumns: phaseGridTemplate }}
          >
            <div>Rider</div>
            {phases.map((phase) => (
              <div key={phase.key}>
                {phase.label}
                <span className="ml-1 normal-case text-slate-400">
                  {phase.rangeLabel}
                </span>
              </div>
            ))}
          </div>

          {riders.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No riders found from the submitted Race Plan yet.
            </div>
          )}

          {riders.map((rider) => {
            const riderId = String(rider.id ?? "");
            const riderTactics = normalizeIndividualTacticsForRider(
              individualTacticsByRider[riderId],
              stage,
            );
            const selectedStageRole = String(riderRolesByRider[riderId] ?? "");
            const selectedStageRoleLabel = selectedStageRole
              ? (STAGE_RIDER_ROLE_LABELS[
                  selectedStageRole as StageRiderRoleCode
                ] ?? titleFromSnake(selectedStageRole))
              : isTTStage
                ? getTimeTrialStageRoleLabel(stage)
                : getRiderRoleLabel(rider);
            const riderBaseRoleLabel = getRiderRoleLabel(rider);
            const individualTacticsRoleLine =
              riderBaseRoleLabel.toLowerCase() ===
              selectedStageRoleLabel.toLowerCase()
                ? riderBaseRoleLabel
                : `${riderBaseRoleLabel} - ${selectedStageRoleLabel}`;

            return (
              <div
                key={riderId}
                className="grid gap-2 rounded-xl border border-slate-200 p-3"
                style={{ gridTemplateColumns: phaseGridTemplate }}
              >
                <div className="min-w-0">
                  <div className="group relative inline-block max-w-full">
                    <span className="cursor-help truncate font-medium text-slate-900">
                      {getRiderDisplayName(rider)}
                    </span>
                    <RiderHoverCard rider={rider} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {individualTacticsRoleLine}
                  </div>
                </div>

                {phases.map((phase) => {
                  const phaseOptions = getStageIndividualTacticOptions(
                    stage,
                    phase.key,
                  );
                  const savedCommand =
                    riderTactics[phase.key]?.command ?? "follow_team_plan";
                  const command = phaseOptions.some(
                    (option) => option.value === savedCommand,
                  )
                    ? savedCommand
                    : "follow_team_plan";

                  return (
                    <select
                      key={`${riderId}-${phase.key}`}
                      value={command}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange(riderId, phase.key, event.target.value)
                      }
                      className="h-10 rounded-xl border border-slate-300 px-2 text-sm disabled:bg-slate-100"
                    >
                      {phaseOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function getRiderDisplayName(rider: JsonRecord) {
  const fullName = String(rider.full_name ?? rider.name ?? "").trim();
  if (fullName) return fullName;

  const firstName = String(rider.first_name ?? "").trim();
  const lastName = String(rider.last_name ?? "").trim();
  const combinedName = `${firstName} ${lastName}`.trim();

  return combinedName || "Unnamed rider";
}

function getRiderRoleLabel(rider: JsonRecord): string {
  return String(
    rider.role_label ??
      rider.assigned_role ??
      rider.specialty ??
      rider.rider_type ??
      "Rider",
  );
}

function getRiderAge(rider: JsonRecord): string {
  const directAge = Number(rider.age);

  if (Number.isFinite(directAge) && directAge > 0) {
    return String(Math.floor(directAge));
  }

  const birthDate = String(rider.birth_date ?? "").trim();
  const yearMatch = birthDate.match(/^(\d{4})-/);

  if (!yearMatch) return "—";

  const birthYear = Number(yearMatch[1]);
  if (!Number.isFinite(birthYear)) return "—";

  // Game dates use Season 1 = year 2000, so this is only a fallback.
  const estimatedAge = 2000 - birthYear;
  return estimatedAge > 0 ? String(estimatedAge) : "—";
}

function getRiderOverall(rider: JsonRecord): string {
  const value =
    rider.overall ??
    rider.overall_rating ??
    rider.rating ??
    rider.ovr ??
    rider.current_ability;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue.toFixed(0) : "—";
}

function getRiderSkillEntries(rider: JsonRecord) {
  const skills = [
    ["Flat", rider.flat],
    ["Hills", rider.hills ?? rider.hilly],
    ["Mountain", rider.mountain ?? rider.climbing],
    ["Sprint", rider.sprint],
    ["Time Trial", rider.time_trial ?? rider.tt],
    ["Stamina", rider.stamina],
    ["Recovery", rider.recovery],
    ["Downhill", rider.downhill],
    ["Cobbles", rider.cobbles],
  ];

  return skills
    .map(([label, value]) => ({
      label: String(label),
      value: Number(value),
    }))
    .filter((skill) => Number.isFinite(skill.value))
    .sort((a, b) => b.value - a.value);
}

function RiderHoverCard({ rider }: { rider: JsonRecord }) {
  const skills = getRiderSkillEntries(rider);
  const topSkillNames = new Set(skills.slice(0, 3).map((skill) => skill.label));
  const score = getRiderRaceScore(rider);

  return (
    <div className="pointer-events-none absolute left-0 top-full z-40 mt-2 hidden w-80 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl group-hover:block">
      <div className="font-semibold text-slate-900">
        {getRiderDisplayName(rider)}
      </div>

      <div className="mt-1 text-xs text-slate-500">
        Age {getRiderAge(rider)} · Overall {getRiderOverall(rider)} ·{" "}
        {getRiderRoleLabel(rider)}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Current race classifications
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <RiderRaceScorePopoverItem label="GC" value={score.position} />
          <RiderRaceScorePopoverItem label="Time" value={score.time} />
          <RiderRaceScorePopoverItem label="Points" value={score.points} />
          <RiderRaceScorePopoverItem
            label="Sprint"
            value={score.sprintPoints}
          />
          <RiderRaceScorePopoverItem label="KOM" value={score.mountainPoints} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {skills.length > 0 ? (
          skills.slice(0, 8).map((skill) => {
            const isTopSkill = topSkillNames.has(skill.label);

            return (
              <div
                key={skill.label}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1"
              >
                <span
                  className={
                    isTopSkill
                      ? "font-semibold text-slate-900"
                      : "text-slate-500"
                  }
                >
                  {skill.label}
                </span>
                <span
                  className={
                    isTopSkill
                      ? "font-bold text-slate-900"
                      : "font-medium text-slate-700"
                  }
                >
                  {skill.value.toFixed(0)}
                </span>
              </div>
            );
          })
        ) : (
          <div className="col-span-2 text-slate-500">
            Rider skill details are not available yet.
          </div>
        )}
      </div>
    </div>
  );
}

function RiderRaceScorePopoverItem({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white px-2 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">
        {String(value ?? "—")}
      </span>
    </div>
  );
}

function getRiderRaceScore(rider: JsonRecord) {
  const position =
    rider.gc_position ??
    rider.general_position ??
    rider.race_position ??
    rider.standing_position ??
    rider.tour_position ??
    null;

  const time =
    rider.gc_time_gap ??
    rider.general_time_gap ??
    rider.time_gap ??
    rider.race_time_gap ??
    null;

  const points =
    rider.points ??
    rider.points_score ??
    rider.race_points ??
    rider.classification_points ??
    0;

  const sprintPoints =
    rider.sprint_points ??
    rider.green_points ??
    rider.points_classification_points ??
    0;

  const mountainPoints =
    rider.mountain_points ??
    rider.kom_points ??
    rider.climbing_points ??
    rider.mountain_classification_points ??
    0;

  return {
    position:
      position === null || position === undefined || position === ""
        ? "—"
        : String(position),
    time:
      time === null || time === undefined || time === "" ? "—" : String(time),
    points: Number.isFinite(Number(points)) ? Number(points) : 0,
    sprintPoints: Number.isFinite(Number(sprintPoints))
      ? Number(sprintPoints)
      : 0,
    mountainPoints: Number.isFinite(Number(mountainPoints))
      ? Number(mountainPoints)
      : 0,
  };
}

function RiderRaceScoreLine({ rider }: { rider: JsonRecord }) {
  const score = getRiderRaceScore(rider);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span>
        GC:{" "}
        <strong className="font-semibold text-slate-700">
          {score.position}
        </strong>
      </span>

      <span className="text-slate-300">|</span>

      <span>
        Time:{" "}
        <strong className="font-semibold text-slate-700">{score.time}</strong>
      </span>

      <span className="text-slate-300">|</span>

      <span>
        Points:{" "}
        <strong className="font-semibold text-slate-700">{score.points}</strong>
      </span>

      <span className="text-slate-300">|</span>

      <span>
        Sprint:{" "}
        <strong className="font-semibold text-slate-700">
          {score.sprintPoints}
        </strong>
      </span>

      <span className="text-slate-300">|</span>

      <span>
        KOM:{" "}
        <strong className="font-semibold text-slate-700">
          {score.mountainPoints}
        </strong>
      </span>
    </div>
  );
}

function TabButton({
  label,
  active,
  disabled = false,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-6 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "bg-yellow-400 text-slate-950"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function InfoChip({
  label,
  value,
  alignRight = false,
}: {
  label: string;
  value: string;
  alignRight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm ${
        alignRight ? "text-right" : ""
      }`}
    >
      <span className="text-xs text-slate-500">{label}: </span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function RacePackageCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function getRaceSharpnessToneClass(tone?: string | null): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "danger":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "info":
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
  }
}

function getRaceSharpnessInlineClass(tone?: string | null): string {
  switch (tone) {
    case "success":
      return "text-emerald-700";
    case "warning":
      return "text-amber-700";
    case "danger":
      return "text-rose-700";
    case "info":
    default:
      return "text-sky-700";
  }
}

function RaceSharpnessInlineText({
  sharpness,
}: {
  sharpness?: RiderRaceSharpnessUiRow | null;
}) {
  if (!sharpness) return null;

  const percent = Math.max(
    0,
    Math.min(
      100,
      Math.round(normalizeNumericValue(sharpness.race_sharpness_percent, 50)),
    ),
  );

  return (
    <span
      className={`shrink-0 text-xs font-semibold ${getRaceSharpnessInlineClass(sharpness.badge_tone)}`}
    >
      Race Sharpness: {percent}/100 · {sharpness.race_sharpness_label}
    </span>
  );
}

function RaceSharpnessDetailBox({
  sharpness,
}: {
  sharpness: RiderRaceSharpnessUiRow;
}) {
  const percent = Math.max(
    0,
    Math.min(
      100,
      Math.round(normalizeNumericValue(sharpness.race_sharpness_percent, 50)),
    ),
  );
  const raceDaysLast14 = normalizeNumericValue(sharpness.race_days_last_14, 0);
  const raceDaysLast30 = normalizeNumericValue(sharpness.race_days_last_30, 0);
  const toneClass = getRaceSharpnessToneClass(sharpness.badge_tone);

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
            Race Sharpness
          </div>
          <div className="mt-0.5 text-sm font-bold">
            {percent}/100 · {sharpness.race_sharpness_label}
          </div>
        </div>
        <div className="text-right text-[11px] font-semibold opacity-80">
          {raceDaysLast14} / 14d
          <br />
          {raceDaysLast30} / 30d
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70">
        <div
          className="h-full rounded-full bg-current"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] leading-relaxed opacity-85">
        {sharpness.race_sharpness_message}
      </div>
      <div className="mt-2 rounded-lg bg-white/60 px-2 py-1.5 text-[11px] leading-relaxed opacity-90">
        Race sharpness improves rhythm, but it does not cancel heavy fatigue.
        Race-start freshness is calculated from both values.
      </div>
    </div>
  );
}

function RiderSelectionCard({
  option,
  selected,
  canEdit,
  currentGameDate,
  raceSharpness,
  blockedReason,
  medicalUnavailableReason,
  onToggle,
}: {
  option: RacePreparationSelectableData["riders"][number];
  selected: boolean;
  canEdit: boolean;
  currentGameDate?: string;
  raceSharpness?: RiderRaceSharpnessUiRow | null;
  blockedReason?: string | null;
  medicalUnavailableReason?: string | null;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rider = asRecord(option.rider);
  const blocked = Boolean(blockedReason);
  const medicallyUnavailable = Boolean(medicalUnavailableReason);
  const selectable = canEdit && !blocked && !medicallyUnavailable;
  const availabilityStatus = getRiderAvailabilityStatus(rider);
  const availabilityLabel = formatAvailabilityStatusLabel(availabilityStatus);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!canEdit || medicallyUnavailable}
        aria-disabled={blocked || medicallyUnavailable}
        onClick={(event) => {
          if (blocked || medicallyUnavailable) {
            event.preventDefault();
            return;
          }

          onToggle();
        }}
        className={`w-full rounded-xl border p-4 text-left transition disabled:cursor-not-allowed ${
          medicallyUnavailable
            ? "border-red-200 bg-slate-100 opacity-70 grayscale"
            : blocked
              ? "cursor-not-allowed border-amber-200 bg-amber-50/70 opacity-80"
              : selected
                ? "border-blue-400 bg-blue-50"
                : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className={`inline-block rounded-md px-1 py-0.5 font-semibold ${
              medicallyUnavailable ? "text-slate-500" : "text-slate-900"
            }`}
            onMouseEnter={() => {
              if (selectable) setOpen(true);
            }}
            onMouseLeave={() => setOpen(false)}
            onFocus={() => {
              if (selectable) setOpen(true);
            }}
            onBlur={() => setOpen(false)}
            tabIndex={selectable ? 0 : -1}
          >
            {getRiderName(option.rider)}
          </div>

          {medicallyUnavailable ? (
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-100 text-sm font-black text-red-700"
              title={medicalUnavailableReason ?? "Rider unavailable"}
              aria-label={medicalUnavailableReason ?? "Rider unavailable"}
            >
              ✕
            </span>
          ) : null}
        </div>

        {medicallyUnavailable ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Role: {String(option.assigned_role ?? "—")}</span>
              <span>·</span>
              <span>Availability: {availabilityLabel}</span>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-800">
              {medicalUnavailableReason}
            </div>

            <div className="text-[11px] leading-relaxed text-slate-500">
              This rider is medically unavailable, so race sharpness and
              freshness preview are hidden and the rider cannot be selected.
            </div>
          </div>
        ) : blockedReason ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
            {blockedReason}
          </div>
        ) : (
          <>
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>Role: {String(option.assigned_role ?? "—")}</span>
              <RaceSharpnessInlineText sharpness={raceSharpness} />
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Fatigue: {String(rider.fatigue ?? "—")} · Availability:{" "}
              {availabilityLabel}
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Starting freshness combines fatigue and race sharpness. High
              fatigue can lower the red bar even when sharpness is good.
            </div>
          </>
        )}
      </button>

      {selectable && open ? (
        <div
          className="absolute left-4 top-[54px] z-50"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <RiderInfoPopover
            option={option}
            currentGameDate={currentGameDate}
            raceSharpness={raceSharpness}
          />
        </div>
      ) : null}
    </div>
  );
}

function RiderInfoPopover({
  option,
  currentGameDate,
  raceSharpness,
}: {
  option: RacePreparationSelectableData["riders"][number];
  currentGameDate?: string;
  raceSharpness?: RiderRaceSharpnessUiRow | null;
}) {
  const rider = asRecord(option.rider);
  const countryCode = getRiderCountryCode(rider);
  const ageLabel = getRiderAgeLabel(rider, currentGameDate);
  const topSkills = getTopRiderSkills(rider);

  return (
    <div className="w-[360px] max-w-[calc(100vw-3rem)] rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-xl">
      <div className="flex items-start gap-3">
        <CountryFlag code={countryCode} />

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">
            {getRiderName(option.rider)}
          </div>

          <div className="mt-1 text-slate-500">
            {String(option.assigned_role ?? "Rider")}
            {ageLabel ? ` · ${ageLabel}` : ""}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <RiderPopupMetric
          label="Fatigue"
          value={String(rider.fatigue ?? "—")}
        />
        <RiderPopupMetric
          label="Fitness"
          value={String(
            rider.fitness ??
              rider.fitness_level ??
              rider.form ??
              rider.condition ??
              "—",
          )}
        />
        <RiderPopupMetric
          label="Availability"
          value={String(rider.availability_status ?? "fit")}
        />
      </div>

      {raceSharpness ? (
        <div className="mt-3">
          <RaceSharpnessDetailBox sharpness={raceSharpness} />
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
        <span className="font-semibold text-slate-800">
          Race-start freshness:
        </span>{" "}
        fatigue lowers the red bar, race sharpness helps it, and the minimum
        starting freshness is 50/100.
      </div>

      <div className="mt-4">
        <div className="mb-2 font-semibold text-slate-900">Key skills</div>

        {topSkills.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {topSkills.map((skill) => (
              <div
                key={skill.key}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
              >
                <span className="text-slate-600">{skill.label}</span>
                <span className="font-bold text-slate-900">{skill.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 p-3 text-slate-500">
            No detailed skill data available.
          </div>
        )}
      </div>
    </div>
  );
}

function RiderPopupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 truncate font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function CostLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: unknown;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        strong ? "text-base font-bold text-slate-900" : "text-slate-700"
      }`}
    >
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border bg-white p-6 text-sm text-slate-600 shadow-sm">
      {message}
    </div>
  );
}

function RacePreviewModal({
  raceId,
  onClose,
}: {
  raceId: UUID;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 p-3 sm:p-4">
      <div className="mx-auto flex h-[calc(100vh-1.5rem)] w-full max-w-[min(1680px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl bg-slate-100 shadow-2xl sm:h-[calc(100vh-2rem)]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="font-semibold text-slate-900">Race Page Preview</div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <RaceDetailPage raceIdOverride={raceId} onBack={onClose} />
        </div>
      </div>
    </div>
  );
}
