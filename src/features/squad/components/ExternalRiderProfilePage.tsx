import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { supabase } from "../../../lib/supabase";
import RiderShortlistButton from "../../../pages/dashboard/transfers/RiderShortlistButton";

import type { RiderDetails } from "../types";

import {
  formatShortGameDate,
  getAgeFromBirthDate,
  getContractExpiryUi,
  getDaysRemaining,
} from "../utils/dates";

import { getCountryName } from "../utils/formatters";

import {
  getDefaultRiderAvailabilityStatus,
  getRiderImageUrl,
} from "../utils/rider-ui";

type ExternalRiderProfileTab = "overview" | "history";

type PremiumStatusRow = {
  is_premium: boolean;
  stripe_status?: string | null;
  access_until?: string | null;
};

type RiderSkillViewMode = "basic" | "modern";

const RIDER_SKILL_VIEW_MODE_STORAGE_KEY = "ppm:rider-profile.skill-attributes-view-mode";

function getStoredRiderSkillViewMode(): RiderSkillViewMode {
  if (typeof window === "undefined") return "modern";

  try {
    const storedValue = window.localStorage.getItem(RIDER_SKILL_VIEW_MODE_STORAGE_KEY);
    return storedValue === "basic" || storedValue === "modern" ? storedValue : "modern";
  } catch {
    return "modern";
  }
}

function saveStoredRiderSkillViewMode(mode: RiderSkillViewMode) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(RIDER_SKILL_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors. The in-page state still changes.
  }
}

type RiderCareerHistoryRow = {
  season: number | null;
  season_label: string;
  club_id: string | null;
  team_name: string;
  points: number;
  is_current_season: boolean;
};

type ClubDisplayNameRow = {
  club_id: string;
  display_name: string | null;
  original_name: string | null;
  full_display_name: string | null;
};

type RiderSeasonOverview = {
  points: number;
  podiums: number;
  jerseys: number;
};

type RiderSeasonStatsBox = {
  races: number;
  wins: number;
  podiums: number;
  top10: number;
  points: number;
};

type CurrentRiderTeamInfo = {
  clubId: string | null;
  teamName: string;
  logoUrl: string | null;
};

type RiderRecentRaceRow = {
  race_id?: string | null;
  race_name: string;
  race_country_code?: string | null;
  race_category?: string | null;
  race_start_date?: string | null;
  race_end_date?: string | null;
  race_date: string | null;
  stage_count?: number | null;
  route_label?: string | null;
  finish_position: number | null;
  ci_points?: number | null;
  result_source?: string | null;
};

type RiderCareerHonourRow = {
  id: string;
  dateLabel: string;
  raceId: string;
  raceName: string;
  raceCountryCode: string | null;
  raceCategory: string | null;
  achievementLabel: string;
};

type ActiveTransferListing = {
  id: string;
  rider_id: string;
  seller_club_id: string;
  asking_price: number;
  listed_on_game_date: string | null;
  expires_on_game_date: string | null;
  status: string;
};

type ActiveFreeAgentRow = {
  id: string;
  rider_id: string;
  expires_on_game_date: string | null;
  status: string;
};

type ActivePremiumBidRow = {
  id: string;
  status: string;
  ai_decision: string | null;
  offer_amount_cash: number | null;
  counteroffer_amount_cash: number | null;
  expires_on_game_date: string | null;
};

type PremiumTransferBidQuote = {
  success?: boolean;
  can_submit?: boolean;
  rider_id?: string;
  buyer_club_id?: string;
  seller_club_id?: string;
  market_value?: number | string | null;
  offer_amount?: number | string | null;
  selling_club_stance?: string | null;
  offer_strength?: string | null;
  predicted_public_outcome?: string | null;
  counteroffer_amount_cash?: number | string | null;
  reasons?: string[] | null;
};

type PremiumTransferBidModalState = {
  riderId: string;
  riderName: string;
  buyerClubId: string;
  marketValue: number;
};

type ExternalProfileGameStateRow = {
  season_number: number;
  month_number: number;
  day_number: number;
  hour_number: number;
  minute_number: number;
};

type AvailableScoutStaffRow = {
  scout_staff_id: string;
  scout_name: string;
  role_type: string;
  expertise: number;
  experience: number;
  potential: number;
  leadership: number;
  efficiency: number;
  loyalty: number;
  scouting_level: number;
  precision_score: number | string;
  speed_score: number | string;
  precision_tier: "basic" | "solid" | "strong" | "elite" | string;
  estimated_duration_hours: number;
  free_reports_per_day: number;
  free_reports_used_today: number;
  free_reports_left_today: number;
  next_report_coin_cost: number;
  wallet_balance: number;
  on_active_course: boolean;
  can_scout: boolean;
  blocking_reason: string | null;
  has_active_scouting_task?: boolean;
  active_scouting_task_label?: string | null;
};

type ActiveScoutTaskRow = {
  id: string;
  club_id: string;
  rider_id: string;
  scout_staff_id: string;
  status: string;
  precision_score: number | string | null;
  precision_tier: string | null;
  duration_hours: number | null;
  is_paid: boolean | null;
  coin_cost: number | null;
  free_reports_used_before: number | null;
  started_at_game_ts: string | null;
  completes_at_game_ts: string | null;
  created_at: string | null;
  updated_at: string | null;
  scout_staff_name?: string | null;
  scout_name?: string | null;
};

type SecureMetricValue = {
  label?: string | null;
  exact?: number | string | null;
};

type SecureAvailabilityValue = {
  status?: string | null;
  unavailable_until?: string | null;
  reason?: string | null;
};

type SecureScoutReportData = {
  precisionScore?: number;
  precisionTier?: "basic" | "solid" | "strong" | "elite";
  overall?: SecureMetricValue;
  potential?: SecureMetricValue;
  fatigue?: SecureMetricValue;
  availability?: SecureAvailabilityValue;
  attributes?: Record<string, SecureMetricValue>;
};

type ExternalRiderSecureProfilePayload = {
  riderId: string;
  clubId: string;
  gameDate: string;
  isOwnRider: boolean;
  hasScout: boolean;
  canScout: boolean;
  usedToday: number;
  dailyLimit: number;
  remainingToday: number;
  statusMessage: string;
  profile: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    countryCode: string | null;
    role: string | null;
    birthDate: string | null;
    imageUrl: string | null;
    contractExpiresAt: string | null;
    contractExpiresSeason: number | string | null;
    marketValue: number | null;
    salary: number | null;
  };
  publicView: {
    overall?: SecureMetricValue;
    potential?: SecureMetricValue;
    fatigue?: SecureMetricValue;
    availability?: SecureAvailabilityValue;
    attributes?: Record<string, SecureMetricValue>;
  };
  scoutReport: null | {
    reportId: string;
    precisionScore?: number;
    precisionTier?: "basic" | "solid" | "strong" | "elite";
    scoutedOnGameDate?: string | null;
    createdAt?: string | null;
    report?: SecureScoutReportData | null;
  };
};

type ExternalRiderMarketMode =
  | "general"
  | "transfer_list"
  | "free_agent"
  | "scouting";

type ExternalRiderProfilePageProps = {
  riderId?: string;
  gameDate?: string | null;
  marketMode?: ExternalRiderMarketMode;
  onBack?: () => void;
  onOpenFreeAgentNegotiation?: (payload: {
    riderId: string;
    riderName: string;
    freeAgentId: string;
    expiresOnGameDate: string | null;
  }) => void;
};

const ACTIVE_TRANSFER_LISTING_STATUSES = ["listed", "active", "open"] as const;
const ACTIVE_FREE_AGENT_STATUSES = ["available", "open"] as const;

function normalizeNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeGameDateInput(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.includes("T") ? trimmed.slice(0, 10) : trimmed;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      normalizeGameDateInput(record.game_date) ??
      normalizeGameDateInput(record.current_game_date) ??
      normalizeGameDateInput(record.date) ??
      null
    );
  }

  return null;
}

function parseGameTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const utcDate = new Date(`${normalized}Z`);

  if (!Number.isNaN(utcDate.getTime())) return utcDate;

  const localDate = new Date(normalized);
  return Number.isNaN(localDate.getTime()) ? null : localDate;
}

function formatGameTimestampAsSeasonLabel(
  value: string | null | undefined,
  locale: string,
  seasonLabel: (seasonNumber: number) => string,
): string {
  if (!value) return "—";

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(`${normalized}Z`);

  if (Number.isNaN(parsed.getTime())) return value;

  const seasonNumber = parsed.getUTCFullYear() - 1999;
  const month = parsed.toLocaleString(locale, {
    month: "short",
    timeZone: "UTC",
  });
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const hour = String(parsed.getUTCHours()).padStart(2, "0");
  const minute = String(parsed.getUTCMinutes()).padStart(2, "0");

  return `${seasonLabel(seasonNumber)} - ${month} ${day} ${hour}:${minute}`;
}

function safeCountryCode(countryCode?: string | null) {
  const code = countryCode?.trim().toLowerCase();

  if (!code || !/^[a-z]{2}$/.test(code)) return null;

  return code;
}

function getCountryFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`;
}

function CountryFlag({
  countryCode,
  className = "",
}: {
  countryCode?: string | null;
  className?: string;
}) {
  const safeCode = safeCountryCode(countryCode);
  const countryName = getCountryName(safeCode?.toUpperCase());
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [safeCode]);

  const imageClassName = [
    "h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const placeholderClassName = [
    "inline-block h-4 w-6 shrink-0 rounded-sm border border-gray-200 bg-gray-100",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!safeCode || hasError) {
    return (
      <span
        className={placeholderClassName}
        title={countryName}
        aria-label={countryName}
      />
    );
  }

  return (
    <img
      src={getCountryFlagUrl(safeCode)}
      alt={countryName}
      title={countryName}
      className={imageClassName}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

function formatRecentRaceDateRange(race: RiderRecentRaceRow): string {
  const start = race.race_start_date ?? race.race_date;
  const end = race.race_end_date ?? race.race_date;

  if (!start && !end) return "—";
  if (!start) return formatShortGameDate(end);
  if (!end || start === end) return formatShortGameDate(start);

  return `${formatShortGameDate(start)} · ${formatShortGameDate(end)}`;
}

function getRecentRaceMetaLabel(
  race: RiderRecentRaceRow,
  stagesLabel: (count: number) => string,
): string {
  const parts = [
    race.race_category ?? null,
    race.stage_count && race.stage_count > 1
      ? stagesLabel(race.stage_count)
      : null,
    race.route_label ?? null,
  ].filter((value): value is string => Boolean(value && value.trim()));

  return parts.join(" · ");
}

function SectionCard({
  title,
  subtitle,
  children,
  className = "",
  headerAction,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg bg-white p-4 shadow ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          {subtitle ? (
            <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
          ) : null}
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {children}
    </div>
  );
}

function PremiumLockedPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { t } = useTranslation("riderProfile");

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          {t("common.premium")}
        </span>
        <span aria-hidden="true" className="text-sm text-slate-500">
          🔒
        </span>
      </div>

      <div className="mt-3 text-base font-semibold text-slate-900">{title}</div>
      <div className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
        {description}
      </div>

      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") {
            window.location.hash = "#/dashboard/pro";
          }
        }}
        className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
      >
        {t("common.unlockPremium")}
      </button>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="text-sm text-slate-500">{label}</div>
      <div
        className={`text-right text-sm font-medium text-slate-800 ${valueClassName}`}
      >
        {value}
      </div>
    </div>
  );
}

function getSkillAccentSoft(attributeKey: string) {
  switch (attributeKey) {
    case "sprint":
      return "rgba(245, 158, 11, 0.18)";
    case "climbing":
      return "rgba(16, 185, 129, 0.18)";
    case "time_trial":
      return "rgba(59, 130, 246, 0.18)";
    case "endurance":
      return "rgba(139, 92, 246, 0.18)";
    case "flat":
      return "rgba(6, 182, 212, 0.18)";
    case "recovery":
      return "rgba(34, 197, 94, 0.18)";
    case "resistance":
      return "rgba(239, 68, 68, 0.18)";
    case "race_iq":
      return "rgba(99, 102, 241, 0.18)";
    case "teamwork":
      return "rgba(236, 72, 153, 0.18)";
    case "morale":
      return "rgba(234, 179, 8, 0.18)";
    default:
      return "rgba(148, 163, 184, 0.18)";
  }
}

function ExternalAttributeModernRow({
  label,
  attributeKey,
  valueLabel,
  percent,
}: {
  label: string;
  attributeKey: string;
  valueLabel: string;
  percent: number;
}) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const accent = getSkillAccentSoft(attributeKey);

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${Math.max(12, safePercent)}%`,
          background: `linear-gradient(90deg, ${accent} 0%, ${accent} 88%, rgba(255,255,255,0) 100%)`,
        }}
      />

      <div className="relative flex items-center justify-between gap-4">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        <div className="shrink-0 text-right text-base font-semibold text-slate-900">
          {valueLabel}
        </div>
      </div>
    </div>
  );
}

async function loadClubHistoryDisplayNameMap(
  clubIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const uniqueClubIds = Array.from(
    new Set(
      clubIds
        .map((clubId) => normalizeString(clubId))
        .filter((clubId): clubId is string => Boolean(clubId)),
    ),
  );

  if (uniqueClubIds.length === 0) return new Map();

  try {
    const { data, error } = await supabase.rpc("get_club_display_names_v1", {
      p_club_ids: uniqueClubIds,
    });

    if (error) throw error;

    const rows = (Array.isArray(data) ? data : []) as ClubDisplayNameRow[];

    return rows.reduce<Map<string, string>>((acc, row) => {
      const clubId = normalizeString(row.club_id);
      if (!clubId) return acc;

      const label =
        normalizeString(row.full_display_name) ??
        normalizeString(row.display_name);

      if (label) {
        acc.set(clubId, label);
      }

      return acc;
    }, new Map());
  } catch (error) {
    console.warn("Could not load club history display names:", error);
    return new Map();
  }
}

async function hydrateRiderCareerHistoryTeamNames(
  rows: RiderCareerHistoryRow[],
): Promise<RiderCareerHistoryRow[]> {
  const displayNameByClubId = await loadClubHistoryDisplayNameMap(
    rows.map((row) => row.club_id),
  );

  if (displayNameByClubId.size === 0) return rows;

  return rows.map((row) => {
    if (!row.club_id) return row;

    const displayName = displayNameByClubId.get(row.club_id);
    if (!displayName) return row;

    return {
      ...row,
      team_name: displayName,
    };
  });
}

async function fetchRiderCareerHistoryById(
  riderId: string,
): Promise<RiderCareerHistoryRow[]> {
  function normalizeRows(rows: any[]): RiderCareerHistoryRow[] {
    const normalized = rows
      .map((row) => {
        const seasonValueRaw =
          row.season ??
          row.season_number ??
          row.season_id ??
          row.year ??
          row.current_season ??
          null;

        const seasonValue =
          typeof seasonValueRaw === "number"
            ? seasonValueRaw
            : typeof seasonValueRaw === "string" && seasonValueRaw.trim() !== ""
              ? Number(seasonValueRaw)
              : null;

        const seasonLabel =
          row.season_label ??
          row.season_name ??
          (seasonValue !== null && Number.isFinite(seasonValue)
            ? `Season ${seasonValue}`
            : "Unknown season");

        const pointsRaw =
          row.points ??
          row.season_points ??
          row.total_points ??
          row.rider_points ??
          row.points_total ??
          row.current_points ??
          0;

        const points =
          typeof pointsRaw === "number"
            ? pointsRaw
            : typeof pointsRaw === "string" && pointsRaw.trim() !== ""
              ? Number(pointsRaw)
              : 0;

        const isCurrentSeason = Boolean(
          row.is_current_season ??
          row.is_current ??
          row.current_season_flag ??
          row.is_current_team ??
          false,
        );

        const clubId =
          normalizeString(row.club_id) ??
          normalizeString(row.team_id) ??
          normalizeString(row.current_club_id) ??
          normalizeString(row.current_team_id) ??
          normalizeString(row.squad_id) ??
          null;

        return {
          season:
            seasonValue !== null && Number.isFinite(seasonValue)
              ? seasonValue
              : null,
          season_label: seasonLabel,
          club_id: clubId,
          team_name:
            row.team_name ??
            row.club_name ??
            row.team_label ??
            row.club_label ??
            row.squad_name ??
            row.club_display_name ??
            row.team ??
            "Unknown team",
          points: Number.isFinite(points) ? points : 0,
          is_current_season: isCurrentSeason,
        } as RiderCareerHistoryRow;
      })
      .filter((row) => row.team_name || row.season_label);

    return normalized.sort((a, b) => {
      if (a.is_current_season !== b.is_current_season) {
        return a.is_current_season ? -1 : 1;
      }

      const aSeason = a.season ?? -1;
      const bSeason = b.season ?? -1;
      if (aSeason !== bSeason) return bSeason - aSeason;
      return a.team_name.localeCompare(b.team_name);
    });
  }

  try {
    const { data, error } = await supabase.rpc("get_external_rider_career_history_premium_v1", {
      p_rider_id: riderId,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      return await hydrateRiderCareerHistoryTeamNames(normalizeRows(data));
    }
  } catch {
    // fallback below
  }

  const tableCandidates = [
    "v_rider_career_history",
    "rider_career_history",
    "v_rider_season_history",
    "rider_season_history",
    "v_rider_history",
  ];

  for (const tableName of tableCandidates) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("rider_id", riderId)
        .order("season", { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        return await hydrateRiderCareerHistoryTeamNames(normalizeRows(data));
      }
    } catch {
      // try next source
    }
  }

  return [];
}

async function fetchRiderSeasonOverviewById(
  riderId: string,
): Promise<RiderSeasonOverview> {
  const normalizeRow = (row: any): RiderSeasonOverview => ({
    points: normalizeNumber(
      row.international_points ??
        row.season_points_overall ??
        row.points ??
        row.season_points ??
        row.total_points,
      0,
    ),
    podiums: normalizeNumber(
      row.podiums ?? row.podium_count ?? row.podium_finishes,
      0,
    ),
    jerseys: normalizeNumber(
      row.jerseys ?? row.jersey_count ?? row.special_jerseys,
      0,
    ),
  });

  try {
    const { data, error } = await supabase
      .from("rider_statistics_page_international_v1")
      .select(
        "international_points, season_points_overall, podiums, jerseys",
      )
      .eq("rider_id", riderId)
      .eq("season_year", 2000)
      .maybeSingle();

    if (!error && data) return normalizeRow(data);
  } catch {
    // fallback below
  }

  try {
    const { data, error } = await supabase.rpc("get_rider_season_overview", {
      p_rider_id: riderId,
    });

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) return normalizeRow(row);
    }
  } catch {
    // fallback below
  }

  const tableCandidates = [
    "v_rider_season_overview",
    "rider_season_stats",
    "v_rider_stats_current_season",
    "rider_season_summary",
  ];

  for (const tableName of tableCandidates) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("rider_id", riderId)
        .limit(1)
        .maybeSingle();

      if (!error && data) return normalizeRow(data);
    } catch {
      // try next source
    }
  }

  return { points: 0, podiums: 0, jerseys: 0 };
}

async function fetchRiderSeasonStatsById(
  riderId: string,
): Promise<RiderSeasonStatsBox> {
  const normalizeRow = (row: any): RiderSeasonStatsBox => ({
    races: normalizeNumber(row.races ?? row.races_count ?? row.total_races, 0),
    wins: normalizeNumber(
      row.wins ?? row.win_count ?? row.victories ?? row.stage_wins,
      0,
    ),
    podiums: normalizeNumber(
      row.podiums ?? row.podium_count ?? row.podium_finishes,
      0,
    ),
    top10: normalizeNumber(row.top10 ?? row.top_10 ?? row.top_ten_count, 0),
    points: normalizeNumber(
      row.international_points ??
        row.season_points_overall ??
        row.points ??
        row.season_points ??
        row.total_points,
      0,
    ),
  });

  try {
    const { data, error } = await supabase
      .from("rider_statistics_page_international_v1")
      .select(
        "international_points, season_points_overall, stage_wins, podiums",
      )
      .eq("rider_id", riderId)
      .eq("season_year", 2000)
      .maybeSingle();

    if (!error && data) {
      const normalized = normalizeRow(data);
      return {
        ...normalized,
        races: 0,
        top10: 0,
      };
    }
  } catch {
    // fallback below
  }

  try {
    const { data, error } = await supabase.rpc("get_rider_season_stats_box", {
      p_rider_id: riderId,
    });

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) return normalizeRow(row);
    }
  } catch {
    // fallback below
  }

  const tableCandidates = [
    "v_rider_season_stats_box",
    "rider_season_stats",
    "v_rider_stats_current_season",
    "rider_season_summary",
  ];

  for (const tableName of tableCandidates) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("rider_id", riderId)
        .limit(1)
        .maybeSingle();

      if (!error && data) return normalizeRow(data);
    } catch {
      // try next source
    }
  }

  return { races: 0, wins: 0, podiums: 0, top10: 0, points: 0 };
}

async function fetchRiderLastFiveRacesById(
  riderId: string,
): Promise<RiderRecentRaceRow[]> {
  const normalizeRows = (rows: any[]): RiderRecentRaceRow[] =>
    rows
      .map((row) => ({
        race_id: normalizeString(row.race_id ?? row.id) ?? null,
        race_name:
          normalizeString(row.race_name) ??
          normalizeString(row.event_name) ??
          normalizeString(row.race_label) ??
          normalizeString(row.stage_name) ??
          "Unknown race",
        race_country_code:
          normalizeString(row.race_country_code) ??
          normalizeString(row.country_code) ??
          normalizeString(row.country) ??
          null,
        race_category:
          normalizeString(row.race_category) ??
          normalizeString(row.category) ??
          null,
        race_start_date:
          normalizeString(row.race_start_date) ??
          normalizeString(row.start_date) ??
          null,
        race_end_date:
          normalizeString(row.race_end_date) ??
          normalizeString(row.end_date) ??
          null,
        race_date:
          normalizeString(row.race_date) ??
          normalizeString(row.event_date) ??
          normalizeString(row.date) ??
          null,
        stage_count: normalizeNullableNumber(row.stage_count),
        route_label:
          normalizeString(row.route_label) ??
          normalizeString(row.route) ??
          null,
        finish_position:
          normalizeNumber(
            row.finish_position ??
              row.position ??
              row.final_position ??
              row.result_position,
            0,
          ) || null,
        ci_points: normalizeNullableNumber(
          row.ci_points ?? row.uci_points ?? row.international_points,
        ),
        result_source: normalizeString(row.result_source),
      }))
      .slice(0, 5);

  try {
    const { data, error } = await supabase.rpc("get_external_rider_last_five_races_premium_v1", {
      p_rider_id: riderId,
      p_limit: 5,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      return normalizeRows(data);
    }
  } catch {
    // fallback below
  }

  const tableCandidates = [
    "v_rider_recent_results",
    "rider_race_results",
    "race_results",
    "v_rider_results",
  ];

  for (const tableName of tableCandidates) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("rider_id", riderId)
        .order("race_date", { ascending: false })
        .limit(5);

      if (!error && Array.isArray(data) && data.length > 0) {
        return normalizeRows(data);
      }
    } catch {
      // try next source
    }
  }

  return [];
}

async function fetchRiderCareerHonoursById(
  riderId: string,
): Promise<RiderCareerHonourRow[]> {
  const { data, error } = await supabase.rpc(
    "get_rider_top_historical_results_v1",
    {
      p_rider_id: riderId,
      p_limit: 5,
    },
  );

  if (error) throw error;

  return (Array.isArray(data) ? data : []).map(
    (row: Record<string, unknown>, index): RiderCareerHonourRow => ({
      id: normalizeString(row.id ?? row.achievement_id) ?? `honour:${index}`,
      dateLabel: normalizeString(row.date_label) ?? "—",
      raceId: normalizeString(row.race_id) ?? "",
      raceName: normalizeString(row.race_name) ?? "Unknown race",
      raceCountryCode: normalizeString(row.race_country_code),
      raceCategory: normalizeString(row.race_category),
      achievementLabel:
        normalizeString(row.achievement_label) ?? "Career result",
    }),
  );
}

function RiderCareerHonoursCard({
  rows,
  loading,
  raceLinkState,
}: {
  rows: RiderCareerHonourRow[];
  loading: boolean;
  raceLinkState: Record<string, unknown>;
}) {
  const { t } = useTranslation("riderProfile");
  const [expanded, setExpanded] = useState(false);

  return (
    <SectionCard
      title={t("history.careerHonours")}
      subtitle={t("history.careerHonoursSubtitle")}
      headerAction={
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          aria-expanded={expanded}
        >
          {expanded ? t("common.collapse") : t("common.expand")}
          <span
            aria-hidden="true"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ⌄
          </span>
        </button>
      }
    >
      {!expanded ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t("history.honoursCollapsed")}
        </div>
      ) : loading ? (
        <div className="text-sm text-slate-500">
          {t("history.loadingHonours")}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t("history.noHonours")}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((item) => {
            const raceName = item.raceName === "Unknown race" ? t("external.unknownRace") : item.raceName;
            const achievementLabel = item.achievementLabel === "Career result" ? t("external.careerResult") : item.achievementLabel;

            return (
              <Link
                key={item.id}
                to={`/dashboard/races/${item.raceId}`}
                state={raceLinkState}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm transition hover:bg-white"
              >
                <div className="w-[58px] shrink-0 whitespace-nowrap text-xs font-semibold text-slate-900">
                  {item.dateLabel}
                </div>
                <div className="h-7 w-px shrink-0 bg-emerald-400" />
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <CountryFlag countryCode={item.raceCountryCode} />
                  <div
                    className="min-w-0 flex-1 truncate font-semibold text-slate-900"
                    title={raceName}
                  >
                    {raceName}
                  </div>
                  {item.raceCategory ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      {item.raceCategory}
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate text-xs text-slate-500">
                    · {achievementLabel}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

async function fetchActiveTransferListing(
  riderId: string,
): Promise<ActiveTransferListing | null> {
  const { data, error } = await supabase
    .from("rider_transfer_listings")
    .select(
      "id, rider_id, seller_club_id, asking_price, listed_on_game_date, expires_on_game_date, status",
    )
    .eq("rider_id", riderId)
    .in("status", [...ACTIVE_TRANSFER_LISTING_STATUSES])
    .order("listed_on_game_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ActiveTransferListing | null;
}

async function fetchActiveFreeAgent(
  riderId: string,
): Promise<ActiveFreeAgentRow | null> {
  const { data, error } = await supabase
    .from("rider_free_agents")
    .select("id, rider_id, expires_on_game_date, status")
    .eq("rider_id", riderId)
    .in("status", [...ACTIVE_FREE_AGENT_STATUSES])
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ActiveFreeAgentRow | null;
}

async function fetchScoutStaffNameById(
  staffId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("club_staff")
      .select("staff_name")
      .eq("id", staffId)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return normalizeString(data?.staff_name) ?? null;
  } catch {
    return null;
  }
}

async function fetchActiveScoutTaskForRider(
  riderId: string,
  clubId?: string | null,
): Promise<ActiveScoutTaskRow | null> {
  let query = supabase
    .from("rider_scout_tasks")
    .select(
      "id, club_id, rider_id, scout_staff_id, status, precision_score, precision_tier, duration_hours, is_paid, coin_cost, free_reports_used_before, started_at_game_ts, completes_at_game_ts, created_at, updated_at",
    )
    .eq("rider_id", riderId)
    .in("status", ["queued", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (clubId) {
    query = query.eq("club_id", clubId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const scoutStaffName = await fetchScoutStaffNameById(data.scout_staff_id);

  return {
    ...(data as ActiveScoutTaskRow),
    scout_staff_name: scoutStaffName,
    scout_name: scoutStaffName,
  };
}

function buildRiderDetailsFromSecureProfile(
  payload: ExternalRiderSecureProfilePayload,
): RiderDetails {
  const profile = payload.profile as Record<string, unknown>;

  return {
    id: normalizeString(profile.id) ?? "",
    country_code:
      normalizeString(profile.countryCode) ??
      normalizeString(profile.country_code) ??
      null,
    first_name:
      normalizeString(profile.firstName) ??
      normalizeString(profile.first_name) ??
      null,
    last_name:
      normalizeString(profile.lastName) ??
      normalizeString(profile.last_name) ??
      null,
    display_name:
      normalizeString(profile.displayName) ??
      normalizeString(profile.display_name) ??
      null,
    role: normalizeString(profile.role) ?? "",
    sprint: 0,
    climbing: 0,
    time_trial: 0,
    endurance: 0,
    flat: 0,
    recovery: 0,
    resistance: 0,
    race_iq: 0,
    teamwork: 0,
    morale: 0,
    potential: 0,
    fatigue: 0,
    overall: 0,
    birth_date:
      normalizeString(profile.birthDate) ??
      normalizeString(profile.birth_date) ??
      null,
    image_url:
      normalizeString(profile.imageUrl) ??
      normalizeString(profile.image_url) ??
      null,
    salary: normalizeNumber(profile.salary, 0),
    contract_expires_at:
      normalizeString(profile.contractExpiresAt) ??
      normalizeString(profile.contract_expires_at) ??
      null,
    contract_expires_season:
      profile.contractExpiresSeason ?? profile.contract_expires_season ?? null,
    market_value: normalizeNumber(
      profile.marketValue ?? profile.market_value,
      0,
    ),
    asking_price: 0,
    asking_price_manual: null,
    availability_status: getDefaultRiderAvailabilityStatus(),
    unavailable_until: null,
    unavailable_reason: null,
    age_years:
      normalizeNullableNumber(profile.ageYears) ??
      normalizeNullableNumber(profile.age_years),
  } as RiderDetails;
}

function getSecureMetricLabel(value?: SecureMetricValue | null): string {
  const label = normalizeString(value?.label);
  if (label) return label;

  if (value?.exact !== null && value?.exact !== undefined) {
    return String(value.exact);
  }

  return "—";
}

function getAttributeRangeLabel(value: unknown): string {
  const numericValue = normalizeNullableNumber(value);
  if (numericValue === null) return "—";

  const clamped = Math.max(0, Math.min(100, numericValue));
  const start = Math.min(80, Math.floor(clamped / 20) * 20);
  const end = Math.min(100, start + 20);

  return `${start}-${end}`;
}

function getPublicRangeLabel(value?: SecureMetricValue | null): string {
  const label = normalizeString(value?.label);
  if (label && label.includes("-")) return label;

  const numeric =
    normalizeNullableNumber(value?.exact) ?? normalizeNullableNumber(label);

  return numeric === null ? "—" : getAttributeRangeLabel(numeric);
}

function getSecureOverallLabel(
  payload: ExternalRiderSecureProfilePayload | null,
): string {
  const scoutedValue = payload?.scoutReport?.report?.overall ?? null;
  const publicValue = payload?.publicView?.overall ?? null;

  if (payload?.scoutReport) {
    return getSecureMetricLabel(scoutedValue);
  }

  return getPublicRangeLabel(publicValue);
}

function getPotentialTierKey(value: unknown): string | null {
  const numeric = normalizeNullableNumber(value);
  if (numeric == null) return null;

  if (numeric < 20) return "external.veryLow";
  if (numeric < 40) return "external.low";
  if (numeric < 60) return "external.medium";
  if (numeric < 80) return "external.high";
  return "external.elite";
}

function getSecureFatigueLabel(
  payload: ExternalRiderSecureProfilePayload | null,
): string {
  return getSecureMetricLabel(
    payload?.scoutReport?.report?.fatigue ??
      payload?.publicView?.fatigue ??
      null,
  );
}

function getSecureAttributeLabel(
  payload: ExternalRiderSecureProfilePayload | null,
  attributeKey: string,
): string {
  if (!payload?.scoutReport) {
    return "-";
  }

  const scoutedValue =
    payload?.scoutReport?.report?.attributes?.[attributeKey] ?? null;
  return getSecureMetricLabel(scoutedValue) === "—"
    ? "-"
    : getSecureMetricLabel(scoutedValue);
}

function getSecureAttributePercent(
  payload: ExternalRiderSecureProfilePayload | null,
  attributeKey: string,
): number {
  if (!payload?.scoutReport) return 0;

  const scoutedValue = payload?.scoutReport?.report?.attributes?.[attributeKey] ?? null;
  const exactValue = normalizeNullableNumber(scoutedValue?.exact);
  if (exactValue !== null) return Math.max(0, Math.min(100, exactValue));

  const label = normalizeString(scoutedValue?.label);
  if (!label) return 0;

  const rangeMatch = label.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    return Math.max(0, Math.min(100, (Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2));
  }

  const numericLabel = normalizeNullableNumber(label);
  return numericLabel === null ? 0 : Math.max(0, Math.min(100, numericLabel));
}

function getSecureAvailabilityValue(
  payload: ExternalRiderSecureProfilePayload | null,
  field: keyof SecureAvailabilityValue,
): string | null {
  const scopedValue =
    payload?.scoutReport?.report?.availability?.[field] ??
    payload?.publicView?.availability?.[field] ??
    null;

  return normalizeString(scopedValue);
}

function isOfficeLevelScoutBlock(blockingReason?: string | null): boolean {
  const normalized = normalizeString(blockingReason)?.toLowerCase() ?? "";
  return normalized.includes("office") && normalized.includes("level");
}

function getEffectiveScoutCanStart(
  scout?: AvailableScoutStaffRow | null,
): boolean {
  if (!scout) return false;
  if (scout.on_active_course) return false;
  if (scout.can_scout) return true;
  if (isOfficeLevelScoutBlock(scout.blocking_reason)) return true;
  return false;
}

function getEffectiveScoutBlockingReason(
  scout: AvailableScoutStaffRow | null | undefined,
  activeCourseFallback: string,
  cannotStartFallback: string,
): string | null {
  if (!scout) return null;

  if (scout.on_active_course) {
    return normalizeString(scout.blocking_reason) ?? activeCourseFallback;
  }

  if (scout.can_scout) return null;
  if (isOfficeLevelScoutBlock(scout.blocking_reason)) return null;

  return normalizeString(scout.blocking_reason) ?? cannotStartFallback;
}

async function fetchCurrentRiderTeamById(
  riderId: string,
): Promise<CurrentRiderTeamInfo | null> {
  try {
    const { data, error } = await supabase.rpc(
      "get_external_rider_current_team_v1",
      { p_rider_id: riderId },
    );

    if (!error) {
      const rawPayload = Array.isArray(data) ? data[0] : data;
      const payload =
        rawPayload && typeof rawPayload === "object"
          ? (rawPayload as Record<string, unknown>)
          : null;

      const nestedTeam =
        payload?.team && typeof payload.team === "object"
          ? (payload.team as Record<string, unknown>)
          : null;

      const clubId =
        normalizeString(
          payload?.club_id ??
            payload?.team_id ??
            payload?.current_club_id ??
            payload?.current_team_id ??
            nestedTeam?.id ??
            nestedTeam?.club_id,
        ) ?? null;

      const teamName =
        normalizeString(
          payload?.team_name ??
            payload?.club_name ??
            payload?.current_team_name ??
            payload?.current_club_name ??
            payload?.display_name ??
            nestedTeam?.name ??
            nestedTeam?.team_name ??
            nestedTeam?.club_name,
        ) ?? null;

      const logoUrl =
        normalizeString(
          payload?.logo_url ??
            payload?.club_logo_url ??
            payload?.team_logo_url ??
            nestedTeam?.logo_url ??
            nestedTeam?.logo_path,
        ) ?? null;

      if (
        payload &&
        payload.success !== false &&
        payload.found !== false &&
        (clubId || teamName)
      ) {
        return {
          clubId,
          teamName: teamName ?? "Current Team",
          logoUrl,
        };
      }
    }
  } catch (error) {
    console.warn(
      "Current-team RPC failed for external rider; using direct fallback:",
      error,
    );
  }

  try {
    const { data: riderRow, error: riderError } = await supabase
      .from("riders")
      .select("club_id")
      .eq("id", riderId)
      .maybeSingle();

    if (riderError) throw riderError;

    const clubId = normalizeString(riderRow?.club_id);
    if (!clubId) return null;

    const { data: clubRow, error: clubError } = await supabase
      .from("clubs")
      .select("id, name, logo_path")
      .eq("id", clubId)
      .maybeSingle();

    if (clubError) throw clubError;
    if (!clubRow) return null;

    return {
      clubId,
      teamName: normalizeString(clubRow.name) ?? "Current Team",
      logoUrl: normalizeString(clubRow.logo_path),
    };
  } catch (error) {
    console.warn(
      "Direct current-team lookup failed for external rider:",
      error,
    );
    return null;
  }
}

async function fetchActivePremiumBidForRider(
  riderId: string,
  buyerClubId: string | null | undefined,
): Promise<ActivePremiumBidRow | null> {
  if (!riderId || !buyerClubId) return null;

  const { data, error } = await supabase.rpc(
    "get_active_unsolicited_transfer_bid_for_rider_v1",
    {
      p_rider_id: riderId,
      p_buyer_club_id: buyerClubId,
    },
  );

  if (error) throw error;

  const payload = data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;

  if (!payload || payload.success === false || payload.has_active_bid !== true) {
    return null;
  }

  const bid = payload.bid && typeof payload.bid === "object"
    ? (payload.bid as Record<string, unknown>)
    : null;

  if (!bid) return null;

  return {
    id: normalizeString(bid.id) ?? "",
    status: normalizeString(bid.status) ?? "active",
    ai_decision: normalizeString(bid.ai_decision),
    offer_amount_cash: normalizeNullableNumber(bid.offer_amount_cash),
    counteroffer_amount_cash: normalizeNullableNumber(bid.counteroffer_amount_cash),
    expires_on_game_date: normalizeString(bid.expires_on_game_date),
  };
}

function titleCaseFromSnake(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ExternalRiderProfilePage({
  riderId: riderIdProp,
  gameDate: gameDateProp,
  marketMode = "general",
  onBack,
  onOpenFreeAgentNegotiation,
}: ExternalRiderProfilePageProps) {
  const { t, i18n } = useTranslation("riderProfile");
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ riderId: string }>();
  const locale = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("sr")
    ? "sr-Latn-RS"
    : "en-US";

  const resolvedRiderId = riderIdProp ?? params.riderId ?? "";
  const effectiveOnBack = onBack ?? (() => navigate(-1));
  const defaultTab: ExternalRiderProfileTab = "overview";

  const [resolvedGameDate, setResolvedGameDate] = useState<string | null>(
    normalizeGameDateInput(gameDateProp),
  );
  const [gameDateLoading, setGameDateLoading] = useState<boolean>(
    gameDateProp === undefined,
  );

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [selectedRider, setSelectedRider] = useState<RiderDetails | null>(null);
  const [currentTeamInfo, setCurrentTeamInfo] = useState<CurrentRiderTeamInfo | null>(null);
  const [currentTeamLoading, setCurrentTeamLoading] = useState(false);
  const [secureProfile, setSecureProfile] = useState<ExternalRiderSecureProfilePayload | null>(null);
  const [activeTab, setActiveTab] = useState<ExternalRiderProfileTab>(defaultTab);
  const [skillViewMode, setSkillViewMode] = useState<RiderSkillViewMode>(() =>
    getStoredRiderSkillViewMode(),
  );

  const [seasonOverview, setSeasonOverview] = useState<RiderSeasonOverview>({ points: 0, podiums: 0, jerseys: 0 });
  const [seasonStats, setSeasonStats] = useState<RiderSeasonStatsBox>({ races: 0, wins: 0, podiums: 0, top10: 0, points: 0 });
  const [recentRaces, setRecentRaces] = useState<RiderRecentRaceRow[]>([]);
  const [careerHonours, setCareerHonours] = useState<RiderCareerHonourRow[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const [marketLoading, setMarketLoading] = useState(false);
  const [activeTransferListing, setActiveTransferListing] = useState<ActiveTransferListing | null>(null);
  const [activeFreeAgent, setActiveFreeAgent] = useState<ActiveFreeAgentRow | null>(null);
  const [activePremiumBid, setActivePremiumBid] = useState<ActivePremiumBidRow | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketActionMessage, setMarketActionMessage] = useState<string | null>(null);

  const [scoutActionMessage, setScoutActionMessage] = useState<string | null>(null);
  const [scoutTaskLoading, setScoutTaskLoading] = useState(false);
  const [scoutTaskError, setScoutTaskError] = useState<string | null>(null);
  const [activeScoutTask, setActiveScoutTask] = useState<ActiveScoutTaskRow | null>(null);

  const [scoutPickerOpen, setScoutPickerOpen] = useState(false);
  const [availableScouts, setAvailableScouts] = useState<AvailableScoutStaffRow[]>([]);
  const [availableScoutsLoading, setAvailableScoutsLoading] = useState(false);
  const [availableScoutsError, setAvailableScoutsError] = useState<string | null>(null);
  const [selectedScoutStaffId, setSelectedScoutStaffId] = useState<string>("");
  const [scoutSubmitLoading, setScoutSubmitLoading] = useState(false);

  const [freeAgentActionLoading, setFreeAgentActionLoading] = useState(false);
  const [freeAgentActionError, setFreeAgentActionError] = useState<string | null>(null);

  const [offerModal, setOfferModal] = useState<{
    listingId: string;
    sellerClubId: string;
    sellerClubName: string | null;
    riderId: string;
    riderName: string;
    askingPrice: number;
  } | null>(null);
  const [offerDraftPrice, setOfferDraftPrice] = useState("");
  const [offerModalMessage, setOfferModalMessage] = useState<string | null>(null);
  const [offerSubmitting, setOfferSubmitting] = useState(false);

  const [premiumBidModal, setPremiumBidModal] = useState<PremiumTransferBidModalState | null>(null);
  const [premiumBidDraftPrice, setPremiumBidDraftPrice] = useState("");
  const [premiumBidQuote, setPremiumBidQuote] = useState<PremiumTransferBidQuote | null>(null);
  const [premiumBidQuoteLoading, setPremiumBidQuoteLoading] = useState(false);
  const [premiumBidSubmitting, setPremiumBidSubmitting] = useState(false);
  const [premiumBidMessage, setPremiumBidMessage] = useState<string | null>(null);

  const [isPremium, setIsPremium] = useState(false);
  const [premiumStatusLoading, setPremiumStatusLoading] = useState(true);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<RiderCareerHistoryRow[]>([]);
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPremiumStatus() {
      setPremiumStatusLoading(true);

      try {
        const { data, error } = await supabase.rpc("get_my_premium_status");
        if (error) throw error;

        const row = (Array.isArray(data) ? data[0] : data) as PremiumStatusRow | null;

        if (!mounted) return;
        setIsPremium(Boolean(row?.is_premium));
      } catch (error) {
        console.error("Failed to load Premium status for external rider profile:", error);
        if (!mounted) return;
        setIsPremium(false);
      } finally {
        if (!mounted) return;
        setPremiumStatusLoading(false);
      }
    }

    function handlePremiumStatusChanged() {
      void loadPremiumStatus();
    }

    void loadPremiumStatus();

    if (typeof window !== "undefined") {
      window.addEventListener("premium-status-changed", handlePremiumStatusChanged);
    }

    return () => {
      mounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("premium-status-changed", handlePremiumStatusChanged);
      }
    };
  }, []);

  useEffect(() => {
    if (gameDateProp !== undefined) {
      setResolvedGameDate(normalizeGameDateInput(gameDateProp));
      setGameDateLoading(false);
      return;
    }

    let mounted = true;

    async function loadGameDate() {
      setGameDateLoading(true);

      try {
        const { data, error } = await supabase.rpc("get_current_game_date");
        if (error) throw error;
        if (!mounted) return;
        setResolvedGameDate(normalizeGameDateInput(data));
      } catch (error) {
        console.error("Failed to load current game date for external rider profile:", error);
        if (!mounted) return;
        setResolvedGameDate(null);
      } finally {
        if (!mounted) return;
        setGameDateLoading(false);
      }
    }

    void loadGameDate();

    return () => {
      mounted = false;
    };
  }, [gameDateProp]);

  useEffect(() => {
    let mounted = true;

    async function loadRider() {
      setProfileLoading(true);
      setProfileError(null);
      setSelectedRider(null);
      setCurrentTeamInfo(null);
      setCurrentTeamLoading(false);
      setSecureProfile(null);
      setSeasonOverview({ points: 0, podiums: 0, jerseys: 0 });
      setSeasonStats({ races: 0, wins: 0, podiums: 0, top10: 0, points: 0 });
      setRecentRaces([]);
      setActiveTransferListing(null);
      setActiveFreeAgent(null);
      setActivePremiumBid(null);
      setMarketError(null);
      setMarketActionMessage(null);
      setScoutActionMessage(null);
      setScoutTaskLoading(false);
      setScoutTaskError(null);
      setActiveScoutTask(null);
      setScoutPickerOpen(false);
      setAvailableScouts([]);
      setAvailableScoutsLoading(false);
      setAvailableScoutsError(null);
      setSelectedScoutStaffId("");
      setScoutSubmitLoading(false);
      setFreeAgentActionLoading(false);
      setFreeAgentActionError(null);
      setOfferModal(null);
      setOfferDraftPrice("");
      setOfferModalMessage(null);
      setOfferSubmitting(false);
      setPremiumBidModal(null);
      setPremiumBidDraftPrice("");
      setPremiumBidQuote(null);
      setPremiumBidQuoteLoading(false);
      setPremiumBidSubmitting(false);
      setPremiumBidMessage(null);
      setHistoryRows([]);
      setHistoryError(null);
      setActiveTab(defaultTab);

      if (!resolvedRiderId) {
        setProfileError(t("wrapper.missingId"));
        setProfileLoading(false);
        return;
      }

      try {
        const [secureProfileResult, gameDatePartsResult] = await Promise.all([
          supabase.rpc("get_external_rider_profile", { p_rider_id: resolvedRiderId }),
          supabase.rpc("get_current_game_date_parts"),
        ]);

        if (secureProfileResult.error) throw secureProfileResult.error;

        const nextSecureProfile = secureProfileResult.data as ExternalRiderSecureProfilePayload | null;

        if (!nextSecureProfile || !nextSecureProfile.profile) {
          throw new Error(t("wrapper.loadFailed"));
        }

        if (!mounted) return;

        setSecureProfile(nextSecureProfile);
        setSelectedRider(buildRiderDetailsFromSecureProfile(nextSecureProfile));

        if (gameDatePartsResult.error) throw gameDatePartsResult.error;

        const gameDateParts = Array.isArray(gameDatePartsResult.data)
          ? gameDatePartsResult.data[0]
          : gameDatePartsResult.data;
        const gameStateRecord =
          gameDateParts && typeof gameDateParts === "object"
            ? (gameDateParts as Record<string, unknown>)
            : null;
        const seasonFromParts = normalizeNumber(
          gameStateRecord?.season_number ?? gameStateRecord?.season ?? gameStateRecord?.current_season,
          0,
        );
        const normalizedResolvedDate = normalizeGameDateInput(
          gameStateRecord?.game_date ?? gameStateRecord?.current_game_date ?? resolvedGameDate,
        );
        const seasonFromDate = normalizedResolvedDate
          ? Math.max(1, Number(normalizedResolvedDate.slice(0, 4)) - 1999)
          : 1;

        setCurrentSeasonNumber(seasonFromParts > 0 ? seasonFromParts : seasonFromDate);
      } catch (e: any) {
        if (!mounted) return;
        setProfileError(e?.message ?? t("wrapper.loadFailed"));
      } finally {
        if (!mounted) return;
        setProfileLoading(false);
      }
    }

    void loadRider();

    return () => {
      mounted = false;
    };
  }, [resolvedRiderId, t]);

  useEffect(() => {
    let mounted = true;

    async function loadOverviewExtras() {
      if (!selectedRider?.id || premiumStatusLoading) return;
      setOverviewLoading(true);

      try {
        const [overviewData, statsData] = await Promise.all([
          fetchRiderSeasonOverviewById(selectedRider.id),
          fetchRiderSeasonStatsById(selectedRider.id),
        ]);

        let racesData: RiderRecentRaceRow[] = [];
        let honoursData: RiderCareerHonourRow[] = [];

        if (isPremium) {
          [racesData, honoursData] = await Promise.all([
            fetchRiderLastFiveRacesById(selectedRider.id),
            fetchRiderCareerHonoursById(selectedRider.id),
          ]);
        }

        if (!mounted) return;
        setSeasonOverview(overviewData);
        setSeasonStats(statsData);
        setRecentRaces(racesData);
        setCareerHonours(honoursData);
      } catch {
        if (!mounted) return;
        setSeasonOverview({ points: 0, podiums: 0, jerseys: 0 });
        setSeasonStats({ races: 0, wins: 0, podiums: 0, top10: 0, points: 0 });
        setRecentRaces([]);
        setCareerHonours([]);
      } finally {
        if (!mounted) return;
        setOverviewLoading(false);
      }
    }

    void loadOverviewExtras();

    return () => {
      mounted = false;
    };
  }, [isPremium, premiumStatusLoading, selectedRider?.id]);

  useEffect(() => {
    let mounted = true;

    async function loadMarketData() {
      if (!selectedRider?.id) return;
      setMarketLoading(true);
      setMarketError(null);

      try {
        const [listing, freeAgent, premiumBid] = await Promise.all([
          fetchActiveTransferListing(selectedRider.id),
          fetchActiveFreeAgent(selectedRider.id),
          fetchActivePremiumBidForRider(selectedRider.id, secureProfile?.clubId),
        ]);

        if (!mounted) return;
        setActiveTransferListing(listing);
        setActiveFreeAgent(freeAgent);
        setActivePremiumBid(premiumBid);
      } catch (e: any) {
        if (!mounted) return;
        setMarketError(e?.message ?? t("external.loadingMarket"));
        setActiveTransferListing(null);
        setActiveFreeAgent(null);
        setActivePremiumBid(null);
      } finally {
        if (!mounted) return;
        setMarketLoading(false);
      }
    }

    void loadMarketData();

    return () => {
      mounted = false;
    };
  }, [selectedRider?.id, secureProfile?.clubId, t]);

  useEffect(() => {
    let mounted = true;

    async function loadScoutTask() {
      if (!selectedRider?.id) return;

      await supabase.rpc("complete_due_rider_scout_tasks");

      try {
        setScoutTaskLoading(true);
        setScoutTaskError(null);
        const nextTask = await fetchActiveScoutTaskForRider(
          selectedRider.id,
          normalizeString(secureProfile?.clubId),
        );
        if (!mounted) return;
        setActiveScoutTask(nextTask);
      } catch (error: any) {
        if (!mounted) return;
        setActiveScoutTask(null);
        setScoutTaskError(error?.message ?? t("scouting.taskLoadFailed"));
      } finally {
        if (!mounted) return;
        setScoutTaskLoading(false);
      }
    }

    void loadScoutTask();

    return () => {
      mounted = false;
    };
  }, [selectedRider?.id, secureProfile?.clubId, t]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      if (activeTab !== "history" || !selectedRider?.id || premiumStatusLoading || !isPremium) {
        setHistoryRows([]);
        setHistoryError(null);
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const rows = await fetchRiderCareerHistoryById(selectedRider.id);
        if (!mounted) return;
        setHistoryRows(rows);
      } catch (e: any) {
        if (!mounted) return;
        setHistoryError(e?.message ?? t("external.loadingCareer"));
        setHistoryRows([]);
      } finally {
        if (!mounted) return;
        setHistoryLoading(false);
      }
    }

    void loadHistory();

    return () => {
      mounted = false;
    };
  }, [activeTab, isPremium, premiumStatusLoading, selectedRider?.id, t]);

  const statsAge =
    typeof (selectedRider as { age_years?: unknown } | null)?.age_years === "number"
      ? ((selectedRider as { age_years?: number }).age_years ?? null)
      : null;

  useEffect(() => {
    let mounted = true;

    async function loadCurrentTeam() {
      if (!selectedRider?.id) {
        setCurrentTeamInfo(null);
        setCurrentTeamLoading(false);
        return;
      }

      setCurrentTeamLoading(true);

      try {
        const nextTeamInfo = await fetchCurrentRiderTeamById(selectedRider.id);
        if (!mounted) return;
        setCurrentTeamInfo(nextTeamInfo);
      } catch (error) {
        console.error("Failed to load current team for external rider profile:", error);
        if (!mounted) return;
        setCurrentTeamInfo(null);
      } finally {
        if (!mounted) return;
        setCurrentTeamLoading(false);
      }
    }

    void loadCurrentTeam();

    return () => {
      mounted = false;
    };
  }, [selectedRider?.id]);

  const profileAge = getAgeFromBirthDate(selectedRider?.birth_date, resolvedGameDate) ?? statsAge;

  const contractExpiryUi = getContractExpiryUi(
    selectedRider?.contract_expires_at,
    resolvedGameDate,
    selectedRider?.contract_expires_season,
  );

  const transferDaysRemaining = activeTransferListing?.expires_on_game_date
    ? getDaysRemaining(activeTransferListing.expires_on_game_date, resolvedGameDate)
    : null;

  const transferTimeLabel = !activeTransferListing
    ? t("external.notListedLower")
    : activeTransferListing.expires_on_game_date
      ? transferDaysRemaining === null
        ? t("external.listedUntil", { date: formatShortGameDate(activeTransferListing.expires_on_game_date) })
        : transferDaysRemaining <= 0
          ? t("external.endsToday", { date: formatShortGameDate(activeTransferListing.expires_on_game_date) })
          : t(transferDaysRemaining === 1 ? "external.dayLeft" : "external.daysLeft", { count: transferDaysRemaining })
      : t("external.listedNoExpiry");

  const freeAgentDaysRemaining = activeFreeAgent?.expires_on_game_date
    ? getDaysRemaining(activeFreeAgent.expires_on_game_date, resolvedGameDate)
    : null;

  const freeAgentTimeLabel = !activeFreeAgent
    ? t("external.notFreeAgent")
    : activeFreeAgent.expires_on_game_date
      ? freeAgentDaysRemaining === null
        ? t("external.availableUntil", { date: formatShortGameDate(activeFreeAgent.expires_on_game_date) })
        : freeAgentDaysRemaining <= 0
          ? t("external.endsToday", { date: formatShortGameDate(activeFreeAgent.expires_on_game_date) })
          : t(freeAgentDaysRemaining === 1 ? "external.dayLeft" : "external.daysLeft", { count: freeAgentDaysRemaining })
      : t("external.availableNoExpiry");

  const marketStatusLabel = activeFreeAgent
    ? t("external.freeAgent")
    : activeTransferListing
      ? t("external.transferListed")
      : marketMode === "scouting"
        ? t("external.scoutingTarget")
        : t("external.notListed");

  const riderName =
    [normalizeString(selectedRider?.first_name), normalizeString(selectedRider?.last_name)]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    normalizeString(selectedRider?.display_name) ||
    t("common.rider");

  const effectiveIsScouted = Boolean(secureProfile?.scoutReport);
  const visibleOverallValue = getSecureOverallLabel(secureProfile);
  const canUseModernSkillView = Boolean(secureProfile?.isOwnRider);
  const effectiveSkillViewMode: RiderSkillViewMode = canUseModernSkillView ? skillViewMode : "basic";

  const securePotentialText = useMemo(() => {
    if (!secureProfile?.scoutReport) return t("external.hiddenPotential");
    const exactValue = normalizeNullableNumber(secureProfile.scoutReport.report?.potential?.exact);
    if (exactValue !== null) {
      const key = getPotentialTierKey(exactValue);
      return key ? t(key) : "—";
    }
    return t("external.scoutedPotential");
  }, [secureProfile, t]);

  useEffect(() => {
    if (!canUseModernSkillView && skillViewMode !== "basic") {
      setSkillViewMode("basic");
    }
  }, [canUseModernSkillView, skillViewMode]);

  const selectedScoutOption = useMemo(
    () => availableScouts.find((row) => row.scout_staff_id === selectedScoutStaffId) ?? null,
    [availableScouts, selectedScoutStaffId],
  );

  const selectedScoutEffectiveBlockingReason = useMemo(
    () => getEffectiveScoutBlockingReason(
      selectedScoutOption,
      t("scouting.activeCourse"),
      t("scouting.cannotStart"),
    ),
    [selectedScoutOption, t],
  );

  const shouldShowScoutButton = !secureProfile?.isOwnRider && !activeScoutTask;
  const scoutButtonLabel = secureProfile?.scoutReport
    ? t("external.scoutRiderAgain")
    : t("external.scoutRider");

  const shouldShowPremiumOfferButton = Boolean(
    selectedRider?.id &&
      secureProfile?.clubId &&
      !secureProfile?.isOwnRider &&
      !activeTransferListing &&
      !activeFreeAgent &&
      !activePremiumBid,
  );

  const currentTeamDisplayName =
    currentTeamInfo?.teamName === "Current Team"
      ? t("external.currentTeamFallback")
      : currentTeamInfo?.teamName ?? "—";
  const currentTeamLogoUrl = currentTeamInfo?.logoUrl ?? null;

  const tabButtonClass = (tab: ExternalRiderProfileTab) =>
    `border-b-2 px-4 py-3 text-sm font-medium transition ${
      activeTab === tab
        ? "border-yellow-500 text-slate-900"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  function handleSkillViewModeChange(nextMode: RiderSkillViewMode) {
    setSkillViewMode(nextMode);
    saveStoredRiderSkillViewMode(nextMode);
  }

  const displayHistoryRows = useMemo(() => {
    const currentHistoryRow = historyRows.find((row) => row.is_current_season);

    const effectiveSeasonNumber =
      currentSeasonNumber && currentSeasonNumber > 0
        ? currentSeasonNumber
        : resolvedGameDate
          ? Math.max(1, Number(resolvedGameDate.slice(0, 4)) - 1999)
          : 1;

    const currentSeasonRow = {
      season: effectiveSeasonNumber,
      season_label: t("external.seasonLabel", { number: effectiveSeasonNumber }),
      club_id:
        currentHistoryRow?.club_id ??
        currentTeamInfo?.clubId ??
        selectedRider?.club_id ??
        null,
      team_name:
        currentHistoryRow?.team_name ??
        currentTeamInfo?.teamName ??
        selectedRider?.club_name ??
        selectedRider?.team_name ??
        t("external.currentTeamFallback"),
      points: seasonOverview.points,
      is_current_season: true,
    };

    const filteredRows = historyRows.filter((row) => {
      if (row.is_current_season) return false;
      if (row.season != null && row.season === currentSeasonRow.season) {
        if (row.club_id && currentSeasonRow.club_id) {
          return row.club_id !== currentSeasonRow.club_id;
        }
        return row.team_name !== currentSeasonRow.team_name;
      }
      return true;
    });

    return [currentSeasonRow, ...filteredRows];
  }, [
    currentSeasonNumber,
    currentTeamInfo,
    historyRows,
    resolvedGameDate,
    seasonOverview.points,
    selectedRider,
    t,
  ]);

  const skillRows = useMemo(() => [
    { label: t("skills.sprint"), key: "sprint" },
    { label: t("skills.climbing"), key: "climbing" },
    { label: t("skills.timeTrial"), key: "time_trial" },
    { label: t("skills.endurance"), key: "endurance" },
    { label: t("skills.flat"), key: "flat" },
    { label: t("skills.recovery"), key: "recovery" },
    { label: t("skills.resistance"), key: "resistance" },
    { label: t("skills.raceIq"), key: "race_iq" },
    { label: t("skills.teamwork"), key: "teamwork" },
    { label: t("skills.morale"), key: "morale" },
  ], [t]);

  const skillColumns = useMemo(() => {
    const midpoint = Math.ceil(skillRows.length / 2);
    return [skillRows.slice(0, midpoint), skillRows.slice(midpoint)];
  }, [skillRows]);

  async function refreshSecureProfile(targetRiderId: string) {
    const { data, error } = await supabase.rpc("get_external_rider_profile", {
      p_rider_id: targetRiderId,
    });

    if (error) throw error;

    const nextSecureProfile = data as ExternalRiderSecureProfilePayload | null;

    if (!nextSecureProfile || !nextSecureProfile.profile) {
      throw new Error(t("wrapper.loadFailed"));
    }

    setSecureProfile(nextSecureProfile);
    setSelectedRider(buildRiderDetailsFromSecureProfile(nextSecureProfile));
  }

  async function refreshActiveScoutTask(
    targetRiderId: string,
    targetClubId?: string | null,
  ) {
    const nextTask = await fetchActiveScoutTaskForRider(targetRiderId, targetClubId);
    setActiveScoutTask(nextTask);
  }

  function formatTransferAmount(value: number | null | undefined) {
    if (value == null || Number.isNaN(value)) return "—";
    const roundedToThousand = Math.round(Number(value) / 1000) * 1000;
    return `$${roundedToThousand.toLocaleString(locale)}`;
  }

  function formatCurrencyInput(value: string) {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return "";
    return `$${Number(digits).toLocaleString(locale)}`;
  }

  function parseCurrencyInput(value: string) {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return null;
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizePremiumBidQuote(data: unknown): PremiumTransferBidQuote | null {
    if (!data || typeof data !== "object") return null;
    return data as PremiumTransferBidQuote;
  }

  function getPremiumBidQuoteNumber(
    value: number | string | null | undefined,
  ): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function formatPremiumBidStatusLabel(value?: string | null): string {
    const normalized = String(value || "").toLowerCase();
    const knownStatuses = new Set([
      "strongly_not_interested",
      "not_interested",
      "unlikely_to_sell",
      "not_available",
      "too_low",
      "serious_but_short",
      "very_strong",
      "exceptional",
      "likely_rejected",
      "likely_counteroffer",
      "may_be_accepted",
      "blocked",
      "not_submitted",
      "no_offer",
    ]);

    if (knownStatuses.has(normalized)) {
      return t(`premiumBid.statuses.${normalized}`);
    }

    return value ? titleCaseFromSnake(value) : "—";
  }

  function getPremiumBidToneClass(value?: string | null): string {
    const normalized = String(value || "").toLowerCase();

    if (normalized === "exceptional" || normalized === "very_strong" || normalized === "may_be_accepted") {
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    }

    if (normalized === "serious_but_short" || normalized === "likely_counteroffer") {
      return "border-amber-200 bg-amber-50 text-amber-800";
    }

    if (normalized === "too_low" || normalized === "likely_rejected" || normalized === "not_available" || normalized === "blocked") {
      return "border-rose-200 bg-rose-50 text-rose-700";
    }

    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  async function loadPremiumBidQuote(nextOfferAmount?: number | null) {
    if (!premiumBidModal) return;

    const offerAmount = nextOfferAmount ?? parseCurrencyInput(premiumBidDraftPrice) ?? null;

    try {
      setPremiumBidQuoteLoading(true);
      setPremiumBidMessage(null);

      const { data, error } = await supabase.rpc("quote_unsolicited_ai_transfer_bid_v2", {
        p_rider_id: premiumBidModal.riderId,
        p_buyer_club_id: premiumBidModal.buyerClubId,
        p_offer_amount_cash: offerAmount,
      });

      if (error) throw error;
      setPremiumBidQuote(normalizePremiumBidQuote(data));
    } catch (error: any) {
      setPremiumBidQuote(null);
      setPremiumBidMessage(error?.message ?? t("premiumBid.quoteFailed"));
    } finally {
      setPremiumBidQuoteLoading(false);
    }
  }

  async function openPremiumBidModal() {
    if (!selectedRider?.id) return;

    const buyerClubId = normalizeString(secureProfile?.clubId);
    if (!buyerClubId) {
      setMarketActionMessage(t("market.primaryClubUnavailable"));
      return;
    }

    const marketValue = Math.max(
      normalizeNumber(selectedRider.market_value, 0),
      normalizeNumber(secureProfile?.profile?.marketValue, 0),
      0,
    );
    const startingOffer = Math.max(Math.round(marketValue * 3), 100000);

    setPremiumBidModal({ riderId: selectedRider.id, riderName, buyerClubId, marketValue });
    setPremiumBidDraftPrice(formatCurrencyInput(String(startingOffer)));
    setPremiumBidQuote(null);
    setPremiumBidMessage(null);
    setPremiumBidSubmitting(false);

    try {
      setPremiumBidQuoteLoading(true);
      const { data, error } = await supabase.rpc("quote_unsolicited_ai_transfer_bid_v2", {
        p_rider_id: selectedRider.id,
        p_buyer_club_id: buyerClubId,
        p_offer_amount_cash: startingOffer,
      });
      if (error) throw error;
      setPremiumBidQuote(normalizePremiumBidQuote(data));
    } catch (error: any) {
      setPremiumBidQuote(null);
      setPremiumBidMessage(error?.message ?? t("premiumBid.quoteFailed"));
    } finally {
      setPremiumBidQuoteLoading(false);
    }
  }

  async function handleSubmitPremiumBidFromProfile() {
    if (!premiumBidModal) return;

    const offeredPrice = parseCurrencyInput(premiumBidDraftPrice);

    if (!offeredPrice || offeredPrice <= 0) {
      setPremiumBidMessage(t("market.validOffer"));
      return;
    }

    if (premiumBidQuote?.can_submit === false) {
      setPremiumBidMessage(t("premiumBid.notAvailable"));
      return;
    }

    try {
      setPremiumBidSubmitting(true);
      setPremiumBidMessage(null);

      const { data, error } = await supabase.rpc("submit_unsolicited_ai_transfer_bid_v1", {
        p_rider_id: premiumBidModal.riderId,
        p_buyer_club_id: premiumBidModal.buyerClubId,
        p_offer_amount_cash: offeredPrice,
      });

      if (error) throw error;

      const result = data && typeof data === "object" ? (data as Record<string, any>) : {};
      const status = normalizeString(result.status);
      const aiDecision = normalizeString(result.ai_decision);
      const bidId = normalizeString(result.bid_id);
      const counterofferAmount = getPremiumBidQuoteNumber(result.counteroffer_amount_cash);

      if (status === "accepted_pending_confirmation" && aiDecision === "accepted") {
        if (!bidId) throw new Error(t("premiumBid.acceptedMissingId"));

        const { data: confirmData, error: confirmError } = await supabase.rpc(
          "confirm_unsolicited_ai_transfer_bid_v1",
          { p_bid_id: bidId },
        );

        if (confirmError) throw confirmError;

        const confirmResult =
          confirmData && typeof confirmData === "object"
            ? (confirmData as Record<string, any>)
            : {};
        const negotiationId = normalizeString(confirmResult.negotiation_id);

        setPremiumBidModal(null);
        setPremiumBidDraftPrice("");
        setPremiumBidQuote(null);
        setPremiumBidMessage(null);
        setMarketActionMessage(
          t("premiumBid.accepted", { amount: formatTransferAmount(offeredPrice) }),
        );

        if (negotiationId) {
          navigate(`/dashboard/transfers/negotiations/${negotiationId}`);
        }
        return;
      }

      if (status === "countered" || aiDecision === "counteroffer") {
        setPremiumBidMessage(
          counterofferAmount
            ? t("premiumBid.counterAmount", { amount: formatTransferAmount(counterofferAmount) })
            : t("premiumBid.counter"),
        );
        if (counterofferAmount) {
          setPremiumBidDraftPrice(formatCurrencyInput(String(counterofferAmount)));
        }
        await loadPremiumBidQuote(counterofferAmount ?? offeredPrice);
        return;
      }

      if (status === "rejected" || aiDecision === "rejected_low_offer" || aiDecision === "hard_rejected") {
        setPremiumBidMessage(normalizeString(result.message) ?? t("premiumBid.rejected"));
        await loadPremiumBidQuote(offeredPrice);
        return;
      }

      setPremiumBidMessage(normalizeString(result.message) ?? t("premiumBid.submitted"));
      await loadPremiumBidQuote(offeredPrice);
    } catch (error: any) {
      setPremiumBidMessage(error?.message ?? t("premiumBid.failed"));
    } finally {
      setPremiumBidSubmitting(false);
    }
  }

  async function fetchClubNameById(clubId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc("get_club_display_names_v1", {
        p_club_ids: [clubId],
      });
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as ClubDisplayNameRow | undefined) : null;
      return normalizeString(row?.display_name) ?? normalizeString(row?.full_display_name) ?? null;
    } catch {
      try {
        const { data, error } = await supabase
          .from("clubs")
          .select("name")
          .eq("id", clubId)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return normalizeString(data?.name) ?? null;
      } catch {
        return null;
      }
    }
  }

  async function openTransferOfferModal(listing: ActiveTransferListing) {
    const sellerClubName = await fetchClubNameById(listing.seller_club_id);

    setOfferModal({
      listingId: listing.id,
      sellerClubId: listing.seller_club_id,
      sellerClubName,
      riderId: selectedRider?.id ?? "",
      riderName,
      askingPrice: listing.asking_price,
    });

    setOfferDraftPrice(formatTransferAmount(listing.asking_price));
    setOfferModalMessage(null);
    setOfferSubmitting(false);
  }

  async function handleOpenScoutPicker() {
    if (!selectedRider?.id || availableScoutsLoading) return;

    try {
      setAvailableScoutsLoading(true);
      setAvailableScoutsError(null);
      setScoutActionMessage(null);

      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user?.id) throw new Error(t("scouting.signIn"));

      const { data, error } = await supabase.rpc("get_available_scout_staff_for_rider", {
        p_rider_id: selectedRider.id,
        p_requesting_user_id: user.id,
      });

      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as AvailableScoutStaffRow[];
      setAvailableScouts(rows);
      setSelectedScoutStaffId(
        rows.find((row) => getEffectiveScoutCanStart(row))?.scout_staff_id ??
          rows[0]?.scout_staff_id ??
          "",
      );
      setScoutPickerOpen(true);
    } catch (error: any) {
      setAvailableScouts([]);
      setSelectedScoutStaffId("");
      setAvailableScoutsError(error?.message ?? t("scouting.loadFailed"));
      setScoutPickerOpen(true);
    } finally {
      setAvailableScoutsLoading(false);
    }
  }

  async function handleSubmitScoutTask() {
    if (!selectedRider?.id) return;

    if (!selectedScoutOption) {
      setAvailableScoutsError(t("scouting.chooseScout"));
      return;
    }

    const effectiveBlockingReason = getEffectiveScoutBlockingReason(
      selectedScoutOption,
      t("scouting.activeCourse"),
      t("scouting.cannotStart"),
    );
    if (effectiveBlockingReason) {
      setAvailableScoutsError(effectiveBlockingReason);
      return;
    }

    try {
      setScoutSubmitLoading(true);
      setAvailableScoutsError(null);
      setScoutActionMessage(null);
      setScoutTaskError(null);

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) throw new Error(t("scouting.signIn"));

      const { data, error } = await supabase.rpc("start_rider_scout_task_v1", {
        p_rider_id: selectedRider.id,
        p_scout_staff_id: selectedScoutOption.scout_staff_id,
        p_requesting_user_id: user.id,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      const durationHours = normalizeNumber(
        result?.duration_hours ?? selectedScoutOption.estimated_duration_hours,
        selectedScoutOption.estimated_duration_hours,
      );
      const isPaid = Boolean(
        result?.is_paid ?? (selectedScoutOption.next_report_coin_cost ?? 0) > 0,
      );
      const coinCost = normalizeNumber(
        result?.coin_cost ?? selectedScoutOption.next_report_coin_cost,
        0,
      );

      setScoutPickerOpen(false);

      const taskMessage = t(
        durationHours === 1 ? "scouting.scoutTaskStarted" : "scouting.scoutTaskStartedPlural",
        { name: selectedScoutOption.scout_name, hours: durationHours },
      );
      setScoutActionMessage(
        isPaid ? `${taskMessage} ${t("scouting.reportUsesCoins", { coins: coinCost })}` : taskMessage,
      );

      await refreshActiveScoutTask(selectedRider.id, normalizeString(secureProfile?.clubId));
      await refreshSecureProfile(selectedRider.id);
    } catch (error: any) {
      setAvailableScoutsError(error?.message ?? t("scouting.startFailed"));
    } finally {
      setScoutSubmitLoading(false);
    }
  }

  async function handleSubmitTransferOfferFromProfile() {
    if (!offerModal) return;

    const offeredPrice = parseCurrencyInput(offerDraftPrice);

    if (!offeredPrice || offeredPrice <= 0) {
      setOfferModalMessage(t("market.validOffer"));
      return;
    }

    const myPrimaryClubId = normalizeString(secureProfile?.clubId);
    if (!myPrimaryClubId) {
      setOfferModalMessage(t("market.primaryClubUnavailable"));
      return;
    }

    try {
      setOfferSubmitting(true);
      setOfferModalMessage(null);

      const { data: existingOffer, error: existingOfferError } = await supabase
        .from("rider_transfer_offers")
        .select("id, status")
        .eq("listing_id", offerModal.listingId)
        .eq("buyer_club_id", myPrimaryClubId)
        .in("status", ["open", "club_accepted", "accepted"])
        .limit(1)
        .maybeSingle();

      if (existingOfferError) throw existingOfferError;

      if (existingOffer) {
        throw new Error(t("market.alreadyOffer", { rider: offerModal.riderName }));
      }

      const { data, error } = await supabase.rpc("submit_rider_transfer_offer", {
        p_listing_id: offerModal.listingId,
        p_buyer_club_id: myPrimaryClubId,
        p_offered_price: offeredPrice,
      });

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;

      setOfferModal(null);
      setOfferDraftPrice("");
      setOfferModalMessage(null);

      if (result?.status === "club_accepted" || result?.status === "accepted") {
        setMarketActionMessage(
          t("market.offerAccepted", { amount: formatTransferAmount(offeredPrice) }),
        );
      } else {
        setMarketActionMessage(
          t("market.offerSent", { amount: formatTransferAmount(offeredPrice) }),
        );
      }

      await refreshSecureProfile(offerModal.riderId);
    } catch (error: any) {
      setOfferModalMessage(error?.message ?? t("market.submitFailed"));
    } finally {
      setOfferSubmitting(false);
    }
  }

  function handleNegotiateWithFreeAgent() {
    try {
      setFreeAgentActionLoading(true);
      setFreeAgentActionError(null);

      const freeAgentId = activeFreeAgent?.id;
      const riderId = selectedRider?.id;

      if (!freeAgentId) throw new Error(t("market.freeAgentIdMissing"));
      if (!riderId) throw new Error(t("market.riderIdMissing"));

      if (onOpenFreeAgentNegotiation) {
        onOpenFreeAgentNegotiation({
          riderId,
          riderName,
          freeAgentId,
          expiresOnGameDate: activeFreeAgent?.expires_on_game_date ?? null,
        });
        setFreeAgentActionLoading(false);
        return;
      }

      const returnTo = `${location.pathname}${location.search || ""}`;

      navigate(
        `/dashboard/transfers/free-agent-negotiations/new?freeAgentId=${encodeURIComponent(
          freeAgentId,
        )}&riderId=${encodeURIComponent(riderId)}&returnTo=${encodeURIComponent(returnTo)}`,
      );
    } catch (err: any) {
      setFreeAgentActionError(err?.message || t("market.draftFailed"));
      setFreeAgentActionLoading(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={effectiveOnBack}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          {t("common.back")}
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-yellow-500 bg-yellow-400 p-6 shadow">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-3xl font-semibold tracking-tight text-slate-950">
              {selectedRider ? riderName : t("external.title")}
            </h2>

            {selectedRider ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  <CountryFlag countryCode={selectedRider.country_code} />
                  <span>{getCountryName(selectedRider.country_code)}</span>
                </span>

                <span className="rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  {selectedRider.role || "—"}
                </span>

                <span className="rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  {t("external.age", { age: profileAge ?? "—" })}
                </span>

                <span className="rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  {t("skills.ovr")} {visibleOverallValue}
                </span>

                {effectiveIsScouted ? (
                  <span className="rounded-full border border-violet-700/20 bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-800">
                    {t("external.scouted")}
                  </span>
                ) : null}

                {activeFreeAgent ? (
                  <span className="rounded-full border border-blue-700/20 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-800">
                    {t("external.freeAgent")}
                  </span>
                ) : activeTransferListing ? (
                  <span className="rounded-full border border-emerald-700/20 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800">
                    {t("external.transferListed")}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="w-full lg:max-w-xl">
            <div className="flex items-center justify-end rounded-2xl px-2">
              {[
                { label: t("common.points"), value: seasonOverview.points },
                { label: t("common.podiums"), value: seasonOverview.podiums },
                { label: t("common.jerseys"), value: seasonOverview.jerseys },
              ].map((item, index) => (
                <React.Fragment key={item.label}>
                  {index > 0 ? <div className="mx-6 h-12 w-px bg-black/25" /> : null}
                  <div className="min-w-[120px] text-center">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/80">
                      {item.label}
                    </div>
                    <div className="mt-2 text-4xl font-semibold leading-none text-slate-950">
                      {item.value}
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => setActiveTab("overview")} className={tabButtonClass("overview")}>
            {t("tabs.overview")}
          </button>

          {shouldShowScoutButton ? (
            <button
              type="button"
              onClick={() => void handleOpenScoutPicker()}
              disabled={availableScoutsLoading || scoutTaskLoading}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                availableScoutsLoading || scoutTaskLoading
                  ? "cursor-not-allowed border-transparent text-slate-400"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {availableScoutsLoading
                ? t("external.loadingScouts")
                : scoutTaskLoading
                  ? t("external.checkingScoutTasks")
                  : scoutButtonLabel}
            </button>
          ) : null}

          {selectedRider?.id && secureProfile?.clubId && !secureProfile?.isOwnRider ? (
            <div className="px-1 py-1.5">
              <RiderShortlistButton
                clubId={secureProfile.clubId}
                riderId={selectedRider.id}
                riderName={riderName}
                sourceType={
                  activeTransferListing
                    ? "transfer_list"
                    : activeFreeAgent
                      ? "free_agent"
                      : marketMode === "scouting"
                        ? "scouting"
                        : "external_profile"
                }
                sourceId={activeTransferListing?.id ?? activeFreeAgent?.id ?? null}
                compact
              />
            </div>
          ) : null}

          {activeTransferListing ? (
            <button
              type="button"
              onClick={() => void openTransferOfferModal(activeTransferListing)}
              className="border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              {t("market.transferOffer")}
            </button>
          ) : null}

          {activeFreeAgent ? (
            <button
              type="button"
              onClick={handleNegotiateWithFreeAgent}
              disabled={freeAgentActionLoading}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                freeAgentActionLoading
                  ? "cursor-not-allowed border-transparent text-slate-400"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {freeAgentActionLoading
                ? t("external.openingNegotiation")
                : t("external.negotiateFreeAgent")}
            </button>
          ) : null}

          {shouldShowPremiumOfferButton ? (
            <button
              type="button"
              onClick={() => void openPremiumBidModal()}
              disabled={premiumBidQuoteLoading || premiumBidSubmitting}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                premiumBidQuoteLoading || premiumBidSubmitting
                  ? "cursor-not-allowed border-transparent text-slate-400"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {premiumBidQuoteLoading
                ? t("external.checkingPremiumOffer")
                : t("premiumBid.title")}
            </button>
          ) : activePremiumBid && !activeTransferListing && !activeFreeAgent ? (
            <button
              type="button"
              disabled
              title={t("external.premiumOfferActiveTitle")}
              className="cursor-not-allowed border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-400"
            >
              {t("external.premiumOfferActive")}
            </button>
          ) : null}

          <button type="button" onClick={() => setActiveTab("history")} className={tabButtonClass("history")}>
            <span>{t("tabs.history")}</span>
            {!premiumStatusLoading && !isPremium ? (
              <span aria-hidden="true" className="ml-1 text-xs text-slate-400">🔒</span>
            ) : null}
          </button>
        </div>
      </div>

      {marketLoading ? <div className="mb-4 text-sm text-slate-500">{t("external.loadingMarket")}</div> : null}

      {marketError ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{marketError}</div>
      ) : null}

      {marketActionMessage ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{marketActionMessage}</div>
      ) : null}

      {scoutActionMessage ? (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{scoutActionMessage}</div>
      ) : null}

      {scoutTaskError ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{scoutTaskError}</div>
      ) : null}

      {freeAgentActionError ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{freeAgentActionError}</div>
      ) : null}

      {profileLoading || gameDateLoading ? (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-slate-600">{t("wrapper.loading")}</div>
        </div>
      ) : profileError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4">
          <div className="text-sm font-medium text-rose-700">{t("wrapper.couldNotLoad")}</div>
          <div className="mt-1 text-sm text-rose-600">{profileError}</div>
        </div>
      ) : !selectedRider ? (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-slate-600">{t("wrapper.riderNotFound")}</div>
        </div>
      ) : (
        <>
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <SectionCard title={t("external.image")}>
                  <div className="flex h-[340px] items-center justify-center rounded-lg bg-slate-100 p-4">
                    <img
                      src={getRiderImageUrl(selectedRider.image_url)}
                      alt={selectedRider.display_name ?? riderName}
                      className="h-full w-full object-contain"
                    />
                  </div>
                </SectionCard>

                <SectionCard title={t("external.seasonStats")} subtitle={t("external.seasonStatsSubtitle")}>
                  {overviewLoading ? (
                    <div className="text-sm text-slate-500">{t("external.loadingStats")}</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      <DetailRow label={t("common.races")} value={seasonStats.races} />
                      <DetailRow label={t("common.wins")} value={seasonStats.wins} />
                      <DetailRow label={t("common.podiums")} value={seasonStats.podiums} />
                      <DetailRow label={t("common.top10")} value={seasonStats.top10} />
                      <DetailRow label={t("common.points")} value={seasonStats.points} />
                      <DetailRow label={t("common.jerseys")} value={seasonOverview.jerseys} />
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="space-y-4">
                <SectionCard title={t("external.basicInformation")}>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="divide-y divide-slate-100">
                      <DetailRow
                        label={t("common.country")}
                        value={
                          <span className="inline-flex items-center gap-2">
                            <CountryFlag countryCode={selectedRider.country_code} />
                            <span>{getCountryName(selectedRider.country_code)}</span>
                          </span>
                        }
                      />
                      <DetailRow label={t("common.role")} value={selectedRider.role || "—"} />
                      <DetailRow label={t("common.age")} value={profileAge ?? "—"} />
                      <DetailRow label={t("common.overall")} value={visibleOverallValue} />
                      {effectiveIsScouted ? (
                        <DetailRow label={t("common.potential")} value={securePotentialText} />
                      ) : null}
                      <DetailRow
                        label={t("external.contractEnd")}
                        value={contractExpiryUi.label}
                        valueClassName={contractExpiryUi.valueClassName}
                      />
                    </div>

                    <div className="border-t border-slate-300 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                      {currentTeamLoading ? (
                        <div className="text-sm text-slate-500">{t("external.loadingTeam")}</div>
                      ) : (
                        <div>
                          <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 pb-3">
                            <span className="text-sm text-slate-500">{t("external.currentTeam")}</span>
                            <span className="text-base font-semibold text-slate-900">{currentTeamDisplayName}</span>
                          </div>
                          {currentTeamLogoUrl ? (
                            <div className="mt-5 flex min-h-[130px] items-center justify-start">
                              <img src={currentTeamLogoUrl} alt={currentTeamDisplayName} className="max-h-36 max-w-[280px] object-contain" />
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title={t("skills.skillAttributes")}
                  subtitle={effectiveIsScouted ? t("skills.scoutedRanges") : t("skills.hiddenUntilScouted")}
                  headerAction={
                    canUseModernSkillView ? (
                      <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-slate-50 p-1">
                        {(["basic", "modern"] as RiderSkillViewMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => handleSkillViewModeChange(mode)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                              skillViewMode === mode
                                ? "bg-slate-900 text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            {mode === "basic" ? t("skills.basicView") : t("skills.modernView")}
                          </button>
                        ))}
                      </div>
                    ) : null
                  }
                >
                  {effectiveSkillViewMode === "basic" ? (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      {skillColumns.map((column, columnIndex) => (
                        <div key={columnIndex} className="divide-y divide-slate-100">
                          {column.map((item) => (
                            <DetailRow
                              key={item.key}
                              label={item.label}
                              value={getSecureAttributeLabel(secureProfile, item.key)}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {skillRows.map((item) => (
                        <ExternalAttributeModernRow
                          key={item.key}
                          label={item.label}
                          attributeKey={item.key}
                          valueLabel={getSecureAttributeLabel(secureProfile, item.key)}
                          percent={getSecureAttributePercent(secureProfile, item.key)}
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>

                {effectiveIsScouted ? (
                  <SectionCard title={t("external.availabilityMedical")}>
                    <div className="divide-y divide-slate-100">
                      <DetailRow
                        label={t("external.availability")}
                        value={getSecureAvailabilityValue(secureProfile, "status") ?? "—"}
                      />
                      <DetailRow
                        label={t("external.unavailableUntil")}
                        value={
                          getSecureAvailabilityValue(secureProfile, "unavailable_until")
                            ? formatShortGameDate(
                                getSecureAvailabilityValue(secureProfile, "unavailable_until") as string,
                              )
                            : "—"
                        }
                      />
                      <DetailRow
                        label={t("external.medicalReason")}
                        value={getSecureAvailabilityValue(secureProfile, "reason") ?? "—"}
                      />
                      <DetailRow label={t("external.fatigue")} value={getSecureFatigueLabel(secureProfile)} />
                    </div>
                  </SectionCard>
                ) : null}

                <SectionCard title={t("external.lastFiveRaces")} subtitle={t("external.lastFiveSubtitle")}>
                  {premiumStatusLoading ? (
                    <div className="text-sm text-slate-500">{t("common.checkingPremium")}</div>
                  ) : !isPremium ? (
                    <PremiumLockedPanel
                      title={t("external.premiumRaceHistory")}
                      description={t("external.premiumRaceHistoryDescription")}
                    />
                  ) : overviewLoading ? (
                    <div className="text-sm text-slate-500">{t("external.loadingRecentRaces")}</div>
                  ) : recentRaces.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {t("external.noRecentRaces")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentRaces.map((race, index) => {
                        const raceMetaLabel = getRecentRaceMetaLabel(
                          race,
                          (count) => t("external.stages", { count }),
                        );
                        const raceLinkState = {
                          returnTo: `${location.pathname}${location.search}${location.hash}`,
                          returnScrollY: typeof window !== "undefined" ? window.scrollY : 0,
                          returnScrollX: typeof window !== "undefined" ? window.scrollX : 0,
                          returnLabel: t("external.backToProfile"),
                        };
                        const displayedRaceName = race.race_name === "Unknown race" ? t("external.unknownRace") : race.race_name;

                        return (
                          <div
                            key={`${race.race_id ?? race.race_name}-${race.race_date ?? index}`}
                            className="grid grid-cols-[72px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                          >
                            <div className="whitespace-pre-line text-center text-xs font-semibold leading-tight text-slate-900">
                              {formatRecentRaceDateRange(race).replace(" · ", "\n")}
                            </div>
                            <div className="min-w-0 border-l border-emerald-400 pl-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <CountryFlag countryCode={race.race_country_code} />
                                {race.race_id ? (
                                  <Link
                                    to={`/dashboard/races/${race.race_id}`}
                                    state={raceLinkState}
                                    className="truncate text-sm font-semibold text-slate-900 hover:text-yellow-600 hover:underline"
                                  >
                                    {displayedRaceName}
                                  </Link>
                                ) : (
                                  <span className="truncate text-sm font-semibold text-slate-900">{displayedRaceName}</span>
                                )}
                                {race.race_category ? (
                                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                    {race.race_category}
                                  </span>
                                ) : null}
                                {raceMetaLabel ? (
                                  <span className="truncate text-xs text-slate-500">
                                    · {raceMetaLabel.replace(race.race_category ?? "", "").replace(/^\s*·\s*/, "")}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="border-l border-slate-300 pl-4 text-right text-[10px] uppercase tracking-[0.18em] text-slate-500">
                              {t("common.position")} {" "}
                              <span className="text-xs normal-case tracking-normal text-slate-900">
                                {race.finish_position == null ? "—" : race.finish_position}
                              </span>
                            </div>
                            <div className="border-l border-slate-300 pl-4 text-right text-[10px] uppercase tracking-[0.18em] text-slate-500">
                              {t("common.uciPoints")} {" "}
                              <span className="text-xs normal-case tracking-normal text-slate-900">{race.ci_points ?? 0}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            premiumStatusLoading ? (
              <div className="rounded-lg border border-slate-200 bg-white px-5 py-5 text-sm text-slate-500 shadow">
                {t("common.checkingPremium")}
              </div>
            ) : !isPremium ? (
              <PremiumLockedPanel
                title={t("external.premiumHistory")}
                description={t("external.premiumHistoryDescription")}
              />
            ) : (
              <div className="space-y-4">
                <SectionCard title={t("tabs.history")} subtitle={t("external.historySubtitle")}>
                  {historyLoading ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {t("external.loadingCareer")}
                    </div>
                  ) : historyError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{historyError}</div>
                  ) : currentTeamLoading ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {t("external.loadingCurrentTeam")}
                    </div>
                  ) : displayHistoryRows.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {t("external.noCareer")}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-slate-500">
                            <th className="py-3 pr-4">{t("history.season")}</th>
                            <th className="py-3 pr-4">{t("history.team")}</th>
                            <th className="py-3 text-right">{t("history.points")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayHistoryRows.map((row, index) => {
                            const displayedSeason = row.season != null
                              ? t("external.seasonLabel", { number: row.season })
                              : row.season_label === "Unknown season"
                                ? t("external.unknownSeason")
                                : row.season_label;
                            const displayedTeam = row.team_name === "Unknown team"
                              ? t("external.unknownTeam")
                              : row.team_name === "Current Team"
                                ? t("external.currentTeamFallback")
                                : row.team_name;

                            return (
                              <tr
                                key={`${row.season_label}-${row.team_name}-${index}`}
                                className="border-b border-slate-100 last:border-0"
                              >
                                <td className="py-3 pr-4 font-medium text-slate-800">
                                  <div className="flex items-center gap-2">
                                    <span>{displayedSeason}</span>
                                    {row.is_current_season ? (
                                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">
                                        {t("history.current")}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="py-3 pr-4 text-slate-700">{displayedTeam}</td>
                                <td className="py-3 text-right font-semibold text-slate-900">{row.points}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>

                <RiderCareerHonoursCard
                  rows={careerHonours}
                  loading={overviewLoading}
                  raceLinkState={{
                    returnTo: `${location.pathname}${location.search}${location.hash}`,
                    returnScrollY: typeof window !== "undefined" ? window.scrollY : 0,
                    returnScrollX: typeof window !== "undefined" ? window.scrollX : 0,
                    returnLabel: t("external.backToProfile"),
                  }}
                />
              </div>
            )
          )}
        </>
      )}

      {scoutPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t("scouting.chooseTitle")}</h3>
                <div className="mt-1 text-sm text-gray-600">
                  {t("scouting.chooseSubtitle", { rider: riderName })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setScoutPickerOpen(false);
                  setAvailableScoutsError(null);
                  setScoutSubmitLoading(false);
                }}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("common.close")}
              </button>
            </div>

            {availableScoutsError ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{availableScoutsError}</div>
            ) : null}

            {availableScoutsLoading ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                {t("scouting.loadingAvailable")}
              </div>
            ) : availableScouts.length === 0 ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                {t("scouting.noneAvailable")}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">{t("scouting.selectScout")}</label>
                  <select
                    value={selectedScoutStaffId}
                    onChange={(e) => {
                      setSelectedScoutStaffId(e.target.value);
                      setAvailableScoutsError(null);
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">{t("scouting.chooseOption")}</option>
                    {availableScouts.map((scout) => {
                      const busy = Boolean(scout.has_active_scouting_task);
                      return (
                        <option key={scout.scout_staff_id} value={scout.scout_staff_id} disabled={busy}>
                          {scout.scout_name}{busy ? ` — ${t("scouting.busy")}` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {selectedScoutOption ? (
                  <div
                    className={`rounded-xl border bg-white p-4 ${
                      getEffectiveScoutCanStart(selectedScoutOption) ? "border-blue-400" : "border-gray-200"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-slate-900">{selectedScoutOption.scout_name}</div>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {t("scouting.reportQuality")} {" "}
                            {t(`scouting.tiers.${normalizeString(selectedScoutOption.precision_tier)?.toLowerCase() || "unknown"}`, {
                              defaultValue: titleCaseFromSnake(selectedScoutOption.precision_tier || "unknown"),
                            })}
                          </span>
                          {!getEffectiveScoutCanStart(selectedScoutOption) ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                              {t("common.unavailable")}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 md:grid-cols-3">
                          <div><span className="font-semibold">{t("scouting.expertise")}</span> {selectedScoutOption.expertise}</div>
                          <div><span className="font-semibold">{t("scouting.experience")}</span> {selectedScoutOption.experience}</div>
                          <div><span className="font-semibold">{t("scouting.potential")}</span> {selectedScoutOption.potential}</div>
                          <div><span className="font-semibold">{t("scouting.leadership")}</span> {selectedScoutOption.leadership}</div>
                          <div><span className="font-semibold">{t("scouting.efficiency")}</span> {selectedScoutOption.efficiency}</div>
                          <div><span className="font-semibold">{t("scouting.loyalty")}</span> {selectedScoutOption.loyalty}</div>
                        </div>
                      </div>

                      <div className="w-full shrink-0 space-y-2 lg:w-[290px]">
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">{t("scouting.estimatedDuration")}</span> {" "}
                          {t(selectedScoutOption.estimated_duration_hours === 1 ? "scouting.inGameHour" : "scouting.inGameHours", {
                            count: selectedScoutOption.estimated_duration_hours,
                          })}
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">{t("scouting.freeReports")}</span> {" "}
                          {normalizeNumber(selectedScoutOption.free_reports_left_today, 0)} / {normalizeNumber(selectedScoutOption.free_reports_per_day, 1)}
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">{t("scouting.wallet")}</span> {" "}
                          {t(normalizeNumber(selectedScoutOption.wallet_balance, 0) === 1 ? "common.oneCoin" : "common.coins", {
                            count: normalizeNumber(selectedScoutOption.wallet_balance, 0),
                          })}
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">{t("scouting.nextCost")}</span> {" "}
                          {normalizeNumber(selectedScoutOption.next_report_coin_cost, 0) > 0
                            ? t(normalizeNumber(selectedScoutOption.next_report_coin_cost, 0) === 1 ? "common.oneCoin" : "common.coins", {
                                count: normalizeNumber(selectedScoutOption.next_report_coin_cost, 0),
                              })
                            : t("common.free")}
                        </div>
                        {selectedScoutEffectiveBlockingReason ? (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                            {selectedScoutEffectiveBlockingReason}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {selectedScoutOption && normalizeNumber(selectedScoutOption.next_report_coin_cost, 0) > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {t("scouting.usedFree")} {" "}
                <span className="font-semibold">
                  {t(normalizeNumber(selectedScoutOption.next_report_coin_cost, 0) === 1 ? "common.oneCoin" : "common.coins", {
                    count: normalizeNumber(selectedScoutOption.next_report_coin_cost, 0),
                  })}
                </span>. {t("scouting.youHave")} {" "}
                <span className="font-semibold">
                  {t(normalizeNumber(selectedScoutOption.wallet_balance, 0) === 1 ? "common.oneCoin" : "common.coins", {
                    count: normalizeNumber(selectedScoutOption.wallet_balance, 0),
                  })}
                </span>.
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              {t("scouting.rules")}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setScoutPickerOpen(false);
                  setAvailableScoutsError(null);
                  setScoutSubmitLoading(false);
                }}
                className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>

              <button
                type="button"
                disabled={!selectedScoutOption || Boolean(selectedScoutEffectiveBlockingReason) || scoutSubmitLoading}
                onClick={() => void handleSubmitScoutTask()}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  !selectedScoutOption || Boolean(selectedScoutEffectiveBlockingReason) || scoutSubmitLoading
                    ? "cursor-not-allowed bg-gray-200 text-gray-500"
                    : "bg-yellow-400 text-black hover:bg-yellow-300"
                }`}
              >
                {scoutSubmitLoading ? t("scouting.starting") : t("scouting.start")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {premiumBidModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">{t("premiumBid.title")}</h3>

            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <div><span className="font-semibold text-gray-900">{t("common.rider")}:</span> {premiumBidModal.riderName}</div>
              <div><span className="font-semibold text-gray-900">{t("premiumBid.marketValue")}</span> {formatTransferAmount(premiumBidModal.marketValue)}</div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">{t("premiumBid.offer")}</label>
              <input
                type="text"
                inputMode="numeric"
                value={premiumBidDraftPrice}
                onChange={(e) => {
                  setPremiumBidDraftPrice(formatCurrencyInput(e.target.value));
                  setPremiumBidMessage(null);
                }}
                placeholder="$5,000,000"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
            </div>

            {premiumStatusLoading ? (
              <div className="mt-4 text-sm text-slate-500">{t("common.checkingPremium")}</div>
            ) : !isPremium ? (
              <div className="mt-4">
                <PremiumLockedPanel
                  title={t("premiumBid.intelligence")}
                  description={t("premiumBid.intelligenceDescription")}
                />
              </div>
            ) : premiumBidQuote ? (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className={`rounded-lg border px-3 py-2 text-sm ${getPremiumBidToneClass(premiumBidQuote.selling_club_stance)}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{t("premiumBid.clubStance")}</div>
                  <div className="mt-1 font-semibold">{formatPremiumBidStatusLabel(premiumBidQuote.selling_club_stance)}</div>
                </div>
                <div className={`rounded-lg border px-3 py-2 text-sm ${getPremiumBidToneClass(premiumBidQuote.offer_strength)}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{t("premiumBid.offerStrength")}</div>
                  <div className="mt-1 font-semibold">{formatPremiumBidStatusLabel(premiumBidQuote.offer_strength)}</div>
                </div>
                <div className={`rounded-lg border px-3 py-2 text-sm ${getPremiumBidToneClass(premiumBidQuote.predicted_public_outcome)}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{t("premiumBid.predictedResult")}</div>
                  <div className="mt-1 font-semibold">{formatPremiumBidStatusLabel(premiumBidQuote.predicted_public_outcome)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("premiumBid.aiCounter")}</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {premiumBidQuote.counteroffer_amount_cash
                      ? formatTransferAmount(getPremiumBidQuoteNumber(premiumBidQuote.counteroffer_amount_cash))
                      : "—"}
                  </div>
                </div>
              </div>
            ) : null}

            {isPremium && premiumBidQuote?.reasons?.length ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {premiumBidQuote.reasons.slice(0, 3).map((reason) => <div key={reason}>• {reason}</div>)}
              </div>
            ) : null}

            {premiumBidMessage ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{premiumBidMessage}</div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPremiumBidModal(null);
                  setPremiumBidDraftPrice("");
                  setPremiumBidQuote(null);
                  setPremiumBidMessage(null);
                  setPremiumBidSubmitting(false);
                  setPremiumBidQuoteLoading(false);
                }}
                className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>

              {isPremium ? (
                <button
                  type="button"
                  disabled={premiumBidQuoteLoading || premiumBidSubmitting}
                  onClick={() => void loadPremiumBidQuote()}
                  className={`rounded-md border px-4 py-2 text-sm font-medium ${
                    premiumBidQuoteLoading || premiumBidSubmitting
                      ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {premiumBidQuoteLoading ? t("premiumBid.checking") : t("premiumBid.refreshQuote")}
                </button>
              ) : null}

              <button
                type="button"
                disabled={premiumBidSubmitting || premiumBidQuoteLoading || premiumBidQuote?.can_submit === false}
                onClick={() => void handleSubmitPremiumBidFromProfile()}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  premiumBidSubmitting || premiumBidQuoteLoading || premiumBidQuote?.can_submit === false
                    ? "cursor-not-allowed bg-gray-200 text-gray-500"
                    : "bg-yellow-400 text-black hover:bg-yellow-300"
                }`}
              >
                {premiumBidSubmitting ? t("market.submitting") : t("premiumBid.submit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {offerModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">{t("market.transferOffer")}</h3>

            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <div><span className="font-semibold text-gray-900">{t("common.rider")}:</span> {offerModal.riderName}</div>
              <div><span className="font-semibold text-gray-900">{t("market.seller")}</span> {offerModal.sellerClubName ?? t("common.unknownClub")}</div>
              <div><span className="font-semibold text-gray-900">{t("market.askingPrice")}</span> {formatTransferAmount(offerModal.askingPrice)}</div>
            </div>

            {offerModalMessage ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{offerModalMessage}</div>
            ) : null}

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">{t("market.yourOffer")}</label>
              <input
                type="text"
                inputMode="numeric"
                value={offerDraftPrice}
                onChange={(e) => setOfferDraftPrice(formatCurrencyInput(e.target.value))}
                placeholder="$128,000"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOfferModal(null);
                  setOfferDraftPrice("");
                  setOfferModalMessage(null);
                  setOfferSubmitting(false);
                }}
                className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("common.cancel")}
              </button>

              <button
                type="button"
                disabled={offerSubmitting}
                onClick={() => void handleSubmitTransferOfferFromProfile()}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  offerSubmitting
                    ? "cursor-not-allowed bg-gray-200 text-gray-500"
                    : "bg-yellow-400 text-black hover:bg-yellow-300"
                }`}
              >
                {offerSubmitting ? t("market.submitting") : t("market.submitOffer")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
