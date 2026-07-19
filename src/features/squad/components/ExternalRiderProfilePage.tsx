import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { supabase } from "../../../lib/supabase";

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

function formatGameTimestampAsSeasonLabel(value?: string | null): string {
  if (!value) return "—";

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(`${normalized}Z`);

  if (Number.isNaN(parsed.getTime())) return value;

  const seasonNumber = parsed.getUTCFullYear() - 1999;
  const month = parsed.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const hour = String(parsed.getUTCHours()).padStart(2, "0");
  const minute = String(parsed.getUTCMinutes()).padStart(2, "0");

  return `Season ${seasonNumber} - ${month} ${day} ${hour}:${minute}`;
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

function getRecentRaceMetaLabel(race: RiderRecentRaceRow): string {
  const parts = [
    race.race_category ?? null,
    race.stage_count && race.stage_count > 1
      ? `${race.stage_count} stages`
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
    const { data, error } = await supabase.rpc("get_rider_career_history", {
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
    const { data, error } = await supabase.rpc("get_rider_last_five_races", {
      p_rider_id: riderId,
      p_limit: 5,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      return await hydrateRiderCareerHistoryTeamNames(normalizeRows(data));
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
        return await hydrateRiderCareerHistoryTeamNames(normalizeRows(data));
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
  const [expanded, setExpanded] = useState(false);

  return (
    <SectionCard
      title="Career Honours"
      subtitle="The five greatest results across the rider's whole career"
      headerAction={
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          aria-expanded={expanded}
        >
          {expanded ? "Collapse" : "Expand"}
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
          Career honours are collapsed. Select Expand to view the rider's top five career results.
        </div>
      ) : loading ? (
        <div className="text-sm text-slate-500">
          Loading career honours…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No career honours found for this rider yet.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((item) => (
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
                  title={item.raceName}
                >
                  {item.raceName}
                </div>
                {item.raceCategory ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    {item.raceCategory}
                  </span>
                ) : null}
                <span className="min-w-0 truncate text-xs text-slate-500">
                  · {item.achievementLabel}
                </span>
              </div>
            </Link>
          ))}
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

function getPotentialTierName(value: unknown): string {
  const numeric = normalizeNullableNumber(value);
  if (numeric == null) return "—";

  if (numeric < 20) return "Very Low";
  if (numeric < 40) return "Low";
  if (numeric < 60) return "Medium";
  if (numeric < 80) return "High";
  return "Elite";
}

function getSecurePotentialText(
  payload: ExternalRiderSecureProfilePayload | null,
): string {
  const scoutedPotential = payload?.scoutReport?.report?.potential ?? null;

  if (!payload?.scoutReport) {
    return "Hidden until scouted";
  }

  const exactValue = normalizeNullableNumber(scoutedPotential?.exact);
  if (exactValue !== null) {
    return getPotentialTierName(exactValue);
  }

  return "Scouted";
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

function formatScoutPrecisionTier(value?: string | null): string {
  const normalized = normalizeString(value);
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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
  scout?: AvailableScoutStaffRow | null,
): string | null {
  if (!scout) return null;

  if (scout.on_active_course) {
    return (
      normalizeString(scout.blocking_reason) ??
      "This scout is already on an active course."
    );
  }

  if (scout.can_scout) return null;
  if (isOfficeLevelScoutBlock(scout.blocking_reason)) return null;

  return (
    normalizeString(scout.blocking_reason) ??
    "This scout cannot start a report right now."
  );
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


export default function ExternalRiderProfilePage({
  riderId: riderIdProp,
  gameDate: gameDateProp,
  marketMode = "general",
  onBack,
  onOpenFreeAgentNegotiation,
}: ExternalRiderProfilePageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ riderId: string }>();

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
  const [currentTeamInfo, setCurrentTeamInfo] =
    useState<CurrentRiderTeamInfo | null>(null);
  const [currentTeamLoading, setCurrentTeamLoading] = useState(false);
  const [secureProfile, setSecureProfile] =
    useState<ExternalRiderSecureProfilePayload | null>(null);
  const [activeTab, setActiveTab] =
    useState<ExternalRiderProfileTab>(defaultTab);
  const [skillViewMode, setSkillViewMode] = useState<RiderSkillViewMode>(() =>
    getStoredRiderSkillViewMode(),
  );

  const [seasonOverview, setSeasonOverview] = useState<RiderSeasonOverview>({
    points: 0,
    podiums: 0,
    jerseys: 0,
  });
  const [seasonStats, setSeasonStats] = useState<RiderSeasonStatsBox>({
    races: 0,
    wins: 0,
    podiums: 0,
    top10: 0,
    points: 0,
  });
  const [recentRaces, setRecentRaces] = useState<RiderRecentRaceRow[]>([]);
  const [careerHonours, setCareerHonours] = useState<RiderCareerHonourRow[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const [marketLoading, setMarketLoading] = useState(false);
  const [activeTransferListing, setActiveTransferListing] =
    useState<ActiveTransferListing | null>(null);
  const [activeFreeAgent, setActiveFreeAgent] =
    useState<ActiveFreeAgentRow | null>(null);
  const [activePremiumBid, setActivePremiumBid] =
    useState<ActivePremiumBidRow | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketActionMessage, setMarketActionMessage] = useState<string | null>(
    null,
  );

  const [scoutActionMessage, setScoutActionMessage] = useState<string | null>(
    null,
  );
  const [scoutTaskLoading, setScoutTaskLoading] = useState(false);
  const [scoutTaskError, setScoutTaskError] = useState<string | null>(null);
  const [activeScoutTask, setActiveScoutTask] =
    useState<ActiveScoutTaskRow | null>(null);

  const [scoutPickerOpen, setScoutPickerOpen] = useState(false);
  const [availableScouts, setAvailableScouts] = useState<
    AvailableScoutStaffRow[]
  >([]);
  const [availableScoutsLoading, setAvailableScoutsLoading] = useState(false);
  const [availableScoutsError, setAvailableScoutsError] = useState<
    string | null
  >(null);
  const [selectedScoutStaffId, setSelectedScoutStaffId] = useState<string>("");
  const [scoutSubmitLoading, setScoutSubmitLoading] = useState(false);

  const [freeAgentActionLoading, setFreeAgentActionLoading] = useState(false);
  const [freeAgentActionError, setFreeAgentActionError] = useState<
    string | null
  >(null);

  const [offerModal, setOfferModal] = useState<{
    listingId: string;
    sellerClubId: string;
    sellerClubName: string | null;
    riderId: string;
    riderName: string;
    askingPrice: number;
  } | null>(null);
  const [offerDraftPrice, setOfferDraftPrice] = useState("");
  const [offerModalMessage, setOfferModalMessage] = useState<string | null>(
    null,
  );
  const [offerSubmitting, setOfferSubmitting] = useState(false);

  const [premiumBidModal, setPremiumBidModal] =
    useState<PremiumTransferBidModalState | null>(null);
  const [premiumBidDraftPrice, setPremiumBidDraftPrice] = useState("");
  const [premiumBidQuote, setPremiumBidQuote] =
    useState<PremiumTransferBidQuote | null>(null);
  const [premiumBidQuoteLoading, setPremiumBidQuoteLoading] = useState(false);
  const [premiumBidSubmitting, setPremiumBidSubmitting] = useState(false);
  const [premiumBidMessage, setPremiumBidMessage] = useState<string | null>(
    null,
  );

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<RiderCareerHistoryRow[]>([]);
  const [currentSeasonNumber, setCurrentSeasonNumber] = useState<number | null>(
    null,
  );

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
        console.error(
          "Failed to load current game date for external rider profile:",
          error,
        );
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
        setProfileError("Missing rider id.");
        setProfileLoading(false);
        return;
      }

      try {
        const [secureProfileResult, gameDatePartsResult] = await Promise.all([
          supabase.rpc("get_external_rider_profile", {
            p_rider_id: resolvedRiderId,
          }),
          supabase.rpc("get_current_game_date_parts"),
        ]);

        if (secureProfileResult.error) throw secureProfileResult.error;

        const nextSecureProfile =
          secureProfileResult.data as ExternalRiderSecureProfilePayload | null;

        if (!nextSecureProfile) {
          throw new Error("Secure rider profile could not be loaded.");
        }

        if (!nextSecureProfile?.profile) {
          throw new Error(
            "Secure rider profile payload is missing profile data.",
          );
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
          gameStateRecord?.season_number ??
            gameStateRecord?.season ??
            gameStateRecord?.current_season,
          0,
        );

        const normalizedResolvedDate = normalizeGameDateInput(
          gameStateRecord?.game_date ??
            gameStateRecord?.current_game_date ??
            resolvedGameDate,
        );

        const seasonFromDate = normalizedResolvedDate
          ? Math.max(1, Number(normalizedResolvedDate.slice(0, 4)) - 1999)
          : 1;

        setCurrentSeasonNumber(
          seasonFromParts > 0 ? seasonFromParts : seasonFromDate,
        );
      } catch (e: any) {
        if (!mounted) return;
        setProfileError(e?.message ?? "Failed to load rider profile.");
      } finally {
        if (!mounted) return;
        setProfileLoading(false);
      }
    }

    void loadRider();

    return () => {
      mounted = false;
    };
  }, [resolvedRiderId]);

  useEffect(() => {
    let mounted = true;

    async function loadOverviewExtras() {
      if (!selectedRider?.id) return;
      setOverviewLoading(true);

      try {
        const [overviewData, statsData, racesData, honoursData] =
          await Promise.all([
            fetchRiderSeasonOverviewById(selectedRider.id),
            fetchRiderSeasonStatsById(selectedRider.id),
            fetchRiderLastFiveRacesById(selectedRider.id),
            fetchRiderCareerHonoursById(selectedRider.id),
          ]);

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
  }, [selectedRider?.id]);

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
        setMarketError(e?.message ?? "Could not load rider market data.");
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
  }, [selectedRider?.id, secureProfile?.clubId]);

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
        setScoutTaskError(error?.message ?? "Could not load scout task.");
      } finally {
        if (!mounted) return;
        setScoutTaskLoading(false);
      }
    }

    void loadScoutTask();

    return () => {
      mounted = false;
    };
  }, [selectedRider?.id, secureProfile?.clubId]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      if (activeTab !== "history" || !selectedRider?.id) return;

      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const rows = await fetchRiderCareerHistoryById(selectedRider.id);
        if (!mounted) return;
        setHistoryRows(rows);
      } catch (e: any) {
        if (!mounted) return;
        setHistoryError(e?.message ?? "Could not load rider history.");
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
  }, [activeTab, selectedRider?.id]);

  const statsAge =
    typeof (selectedRider as { age_years?: unknown } | null)?.age_years ===
    "number"
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
        console.error(
          "Failed to load current team for external rider profile:",
          error,
        );
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

  const profileAge =
    getAgeFromBirthDate(selectedRider?.birth_date, resolvedGameDate) ??
    statsAge;

  const contractExpiryUi = getContractExpiryUi(
    selectedRider?.contract_expires_at,
    resolvedGameDate,
    selectedRider?.contract_expires_season,
  );

  const transferDaysRemaining = activeTransferListing?.expires_on_game_date
    ? getDaysRemaining(
        activeTransferListing.expires_on_game_date,
        resolvedGameDate,
      )
    : null;

  const transferTimeLabel = !activeTransferListing
    ? "Not listed"
    : activeTransferListing.expires_on_game_date
      ? transferDaysRemaining === null
        ? `Listed until ${formatShortGameDate(activeTransferListing.expires_on_game_date)}`
        : transferDaysRemaining <= 0
          ? `Ends today (${formatShortGameDate(activeTransferListing.expires_on_game_date)})`
          : `${transferDaysRemaining} day${transferDaysRemaining === 1 ? "" : "s"} left`
      : "Listed with no expiry";

  const freeAgentDaysRemaining = activeFreeAgent?.expires_on_game_date
    ? getDaysRemaining(activeFreeAgent.expires_on_game_date, resolvedGameDate)
    : null;

  const freeAgentTimeLabel = !activeFreeAgent
    ? "Not a free agent"
    : activeFreeAgent.expires_on_game_date
      ? freeAgentDaysRemaining === null
        ? `Available until ${formatShortGameDate(activeFreeAgent.expires_on_game_date)}`
        : freeAgentDaysRemaining <= 0
          ? `Ends today (${formatShortGameDate(activeFreeAgent.expires_on_game_date)})`
          : `${freeAgentDaysRemaining} day${freeAgentDaysRemaining === 1 ? "" : "s"} left`
      : "Available with no expiry";

  const marketStatusLabel = activeFreeAgent
    ? "Free Agent"
    : activeTransferListing
      ? "Transfer Listed"
      : marketMode === "scouting"
        ? "Scouting Target"
        : "Not Listed";

  const riderName =
    [
      normalizeString(selectedRider?.first_name),
      normalizeString(selectedRider?.last_name),
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    normalizeString(selectedRider?.display_name) ||
    "Rider";

  const effectiveIsScouted = Boolean(secureProfile?.scoutReport);
  const visibleOverallValue = getSecureOverallLabel(secureProfile);
  const canUseModernSkillView = Boolean(secureProfile?.isOwnRider);
  const effectiveSkillViewMode: RiderSkillViewMode = canUseModernSkillView
    ? skillViewMode
    : "basic";

  useEffect(() => {
    if (!canUseModernSkillView && skillViewMode !== "basic") {
      setSkillViewMode("basic");
    }
  }, [canUseModernSkillView, skillViewMode]);

  const selectedScoutOption = useMemo(
    () =>
      availableScouts.find(
        (row) => row.scout_staff_id === selectedScoutStaffId,
      ) ?? null,
    [availableScouts, selectedScoutStaffId],
  );

  const selectedScoutEffectiveBlockingReason = useMemo(
    () => getEffectiveScoutBlockingReason(selectedScoutOption),
    [selectedScoutOption],
  );

  const shouldShowScoutButton = !secureProfile?.isOwnRider && !activeScoutTask;
  const scoutButtonLabel = secureProfile?.scoutReport
    ? "Scout Rider Again"
    : "Scout Rider";

  const shouldShowPremiumOfferButton = Boolean(
    selectedRider?.id &&
      secureProfile?.clubId &&
      !secureProfile?.isOwnRider &&
      !activeTransferListing &&
      !activeFreeAgent &&
      !activePremiumBid,
  );

  const currentTeamDisplayName = currentTeamInfo?.teamName ?? "—";
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
      season_label: `Season ${effectiveSeasonNumber}`,
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
        "Current Team",
      points: seasonOverview.points,
      is_current_season: true,
    };

    const filteredRows = historyRows.filter((row) => {
      if (currentSeasonRow == null) return true;
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
  ]);

  const skillRows = [
    { label: "Sprint", key: "sprint" },
    { label: "Climbing", key: "climbing" },
    { label: "Time Trial", key: "time_trial" },
    { label: "Endurance", key: "endurance" },
    { label: "Flat", key: "flat" },
    { label: "Recovery", key: "recovery" },
    { label: "Resistance", key: "resistance" },
    { label: "Race IQ", key: "race_iq" },
    { label: "Teamwork", key: "teamwork" },
    { label: "Morale", key: "morale" },
  ];

  const skillColumns = useMemo(() => {
    const midpoint = Math.ceil(skillRows.length / 2);
    return [skillRows.slice(0, midpoint), skillRows.slice(midpoint)];
  }, []);

  async function refreshSecureProfile(targetRiderId: string) {
    const { data, error } = await supabase.rpc("get_external_rider_profile", {
      p_rider_id: targetRiderId,
    });

    if (error) throw error;

    const nextSecureProfile = data as ExternalRiderSecureProfilePayload | null;

    if (!nextSecureProfile || !nextSecureProfile.profile) {
      throw new Error("Secure rider profile could not be loaded.");
    }

    setSecureProfile(nextSecureProfile);
    setSelectedRider(buildRiderDetailsFromSecureProfile(nextSecureProfile));
  }

  async function refreshActiveScoutTask(
    targetRiderId: string,
    targetClubId?: string | null,
  ) {
    const nextTask = await fetchActiveScoutTaskForRider(
      targetRiderId,
      targetClubId,
    );
    setActiveScoutTask(nextTask);
  }

  function formatTransferAmount(value: number | null | undefined) {
    if (value == null || Number.isNaN(value)) return "—";
    const roundedToThousand = Math.round(Number(value) / 1000) * 1000;
    return `$${roundedToThousand.toLocaleString("en-US")}`;
  }

  function formatCurrencyInput(value: string) {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return "";
    return `$${Number(digits).toLocaleString("en-US")}`;
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
    switch (String(value || "").toLowerCase()) {
      case "strongly_not_interested":
        return "Strongly not interested";
      case "not_interested":
        return "Not interested";
      case "unlikely_to_sell":
        return "Unlikely to sell";
      case "not_available":
        return "Not available";
      case "too_low":
        return "Too low";
      case "serious_but_short":
        return "Serious, but short";
      case "very_strong":
        return "Very strong";
      case "exceptional":
        return "Exceptional";
      case "likely_rejected":
        return "Likely rejected";
      case "likely_counteroffer":
        return "Likely counteroffer";
      case "may_be_accepted":
        return "May be accepted";
      case "blocked":
        return "Blocked";
      case "not_submitted":
        return "Not submitted";
      case "no_offer":
        return "No offer yet";
      default:
        return value ? titleCaseFromSnake(value) : "—";
    }
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

    const offerAmount =
      nextOfferAmount ?? parseCurrencyInput(premiumBidDraftPrice) ?? null;

    try {
      setPremiumBidQuoteLoading(true);
      setPremiumBidMessage(null);

      const { data, error } = await supabase.rpc(
        "quote_unsolicited_ai_transfer_bid_v1",
        {
          p_rider_id: premiumBidModal.riderId,
          p_buyer_club_id: premiumBidModal.buyerClubId,
          p_offer_amount_cash: offerAmount,
        },
      );

      if (error) throw error;

      setPremiumBidQuote(normalizePremiumBidQuote(data));
    } catch (error: any) {
      setPremiumBidQuote(null);
      setPremiumBidMessage(
        error?.message ?? "Could not quote this premium offer.",
      );
    } finally {
      setPremiumBidQuoteLoading(false);
    }
  }

  async function openPremiumBidModal() {
    if (!selectedRider?.id) return;

    const buyerClubId = normalizeString(secureProfile?.clubId);
    if (!buyerClubId) {
      setMarketActionMessage("Your primary club is not available.");
      return;
    }

    const marketValue = Math.max(
      normalizeNumber(selectedRider.market_value, 0),
      normalizeNumber(secureProfile?.profile?.marketValue, 0),
      0,
    );
    const startingOffer = Math.max(Math.round(marketValue * 3), 100000);

    setPremiumBidModal({
      riderId: selectedRider.id,
      riderName,
      buyerClubId,
      marketValue,
    });
    setPremiumBidDraftPrice(formatCurrencyInput(String(startingOffer)));
    setPremiumBidQuote(null);
    setPremiumBidMessage(null);
    setPremiumBidSubmitting(false);

    try {
      setPremiumBidQuoteLoading(true);

      const { data, error } = await supabase.rpc(
        "quote_unsolicited_ai_transfer_bid_v1",
        {
          p_rider_id: selectedRider.id,
          p_buyer_club_id: buyerClubId,
          p_offer_amount_cash: startingOffer,
        },
      );

      if (error) throw error;

      setPremiumBidQuote(normalizePremiumBidQuote(data));
    } catch (error: any) {
      setPremiumBidQuote(null);
      setPremiumBidMessage(
        error?.message ?? "Could not quote this premium offer.",
      );
    } finally {
      setPremiumBidQuoteLoading(false);
    }
  }

  async function handleSubmitPremiumBidFromProfile() {
    if (!premiumBidModal) return;

    const offeredPrice = parseCurrencyInput(premiumBidDraftPrice);

    if (!offeredPrice || offeredPrice <= 0) {
      setPremiumBidMessage("Please enter a valid offer amount.");
      return;
    }

    if (premiumBidQuote?.can_submit === false) {
      setPremiumBidMessage("This rider is not available for a premium bid right now.");
      return;
    }

    try {
      setPremiumBidSubmitting(true);
      setPremiumBidMessage(null);

      const { data, error } = await supabase.rpc(
        "submit_unsolicited_ai_transfer_bid_v1",
        {
          p_rider_id: premiumBidModal.riderId,
          p_buyer_club_id: premiumBidModal.buyerClubId,
          p_offer_amount_cash: offeredPrice,
        },
      );

      if (error) throw error;

      const result = data && typeof data === "object" ? (data as Record<string, any>) : {};
      const status = normalizeString(result.status);
      const aiDecision = normalizeString(result.ai_decision);
      const bidId = normalizeString(result.bid_id);
      const counterofferAmount = getPremiumBidQuoteNumber(
        result.counteroffer_amount_cash,
      );

      if (status === "accepted_pending_confirmation" && aiDecision === "accepted") {
        if (!bidId) throw new Error("Accepted premium bid is missing bid id.");

        const { data: confirmData, error: confirmError } = await supabase.rpc(
          "confirm_unsolicited_ai_transfer_bid_v1",
          {
            p_bid_id: bidId,
          },
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
          `Premium offer of ${formatTransferAmount(
            offeredPrice,
          )} was accepted by the AI club. Continue rider contract negotiation.`,
        );

        if (negotiationId) {
          navigate(`/dashboard/transfers/negotiations/${negotiationId}`);
        }

        return;
      }

      if (status === "countered" || aiDecision === "counteroffer") {
        setPremiumBidMessage(
          counterofferAmount
            ? `The AI club wants ${formatTransferAmount(
                counterofferAmount,
              )}. You can close this modal and submit a new premium offer at that amount.`
            : "The AI club sent a counteroffer.",
        );
        if (counterofferAmount) {
          setPremiumBidDraftPrice(formatCurrencyInput(String(counterofferAmount)));
        }
        await loadPremiumBidQuote(counterofferAmount ?? offeredPrice);
        return;
      }

      if (status === "rejected" || aiDecision === "rejected_low_offer" || aiDecision === "hard_rejected") {
        setPremiumBidMessage(
          normalizeString(result.message) ??
            "The AI club rejected this premium offer.",
        );
        await loadPremiumBidQuote(offeredPrice);
        return;
      }

      setPremiumBidMessage(
        normalizeString(result.message) ?? "Premium bid submitted.",
      );
      await loadPremiumBidQuote(offeredPrice);
    } catch (error: any) {
      setPremiumBidMessage(
        error?.message ?? "Failed to submit premium offer.",
      );
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

      return (
        normalizeString(row?.display_name) ??
        normalizeString(row?.full_display_name) ??
        null
      );
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

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user?.id)
        throw new Error("You must be signed in to start scouting.");

      const { data, error } = await supabase.rpc(
        "get_available_scout_staff_for_rider",
        {
          p_rider_id: selectedRider.id,
          p_requesting_user_id: user.id,
        },
      );

      if (error) throw error;

      const rows = (
        Array.isArray(data) ? data : []
      ) as AvailableScoutStaffRow[];

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
      setAvailableScoutsError(
        error?.message ?? "Could not load available scouts.",
      );
      setScoutPickerOpen(true);
    } finally {
      setAvailableScoutsLoading(false);
    }
  }

  async function handleSubmitScoutTask() {
    if (!selectedRider?.id) return;

    if (!selectedScoutOption) {
      setAvailableScoutsError("Please choose a scout.");
      return;
    }

    const effectiveBlockingReason =
      getEffectiveScoutBlockingReason(selectedScoutOption);
    if (effectiveBlockingReason) {
      setAvailableScoutsError(effectiveBlockingReason);
      return;
    }

    try {
      setScoutSubmitLoading(true);
      setAvailableScoutsError(null);
      setScoutActionMessage(null);
      setScoutTaskError(null);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user?.id)
        throw new Error("You must be signed in to start scouting.");

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

      setScoutActionMessage(
        isPaid
          ? `Scout task started with ${selectedScoutOption.scout_name}. Estimated duration: ${durationHours} in-game hour${
              durationHours === 1 ? "" : "s"
            }. This report uses ${coinCost} coin${coinCost === 1 ? "" : "s"}.`
          : `Scout task started with ${selectedScoutOption.scout_name}. Estimated duration: ${durationHours} in-game hour${
              durationHours === 1 ? "" : "s"
            }.`,
      );

      await refreshActiveScoutTask(
        selectedRider.id,
        normalizeString(secureProfile?.clubId),
      );
      await refreshSecureProfile(selectedRider.id);
    } catch (error: any) {
      setAvailableScoutsError(
        error?.message ?? "Failed to start scouting task.",
      );
    } finally {
      setScoutSubmitLoading(false);
    }
  }

  async function handleSubmitTransferOfferFromProfile() {
    if (!offerModal) return;

    const offeredPrice = parseCurrencyInput(offerDraftPrice);

    if (!offeredPrice || offeredPrice <= 0) {
      setOfferModalMessage("Please enter a valid offer amount.");
      return;
    }

    const myPrimaryClubId = normalizeString(secureProfile?.clubId);
    if (!myPrimaryClubId) {
      setOfferModalMessage("Your primary club is not available.");
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
        throw new Error(
          `You already have an active offer for ${offerModal.riderName}.`,
        );
      }

      const { data, error } = await supabase.rpc(
        "submit_rider_transfer_offer",
        {
          p_listing_id: offerModal.listingId,
          p_buyer_club_id: myPrimaryClubId,
          p_offered_price: offeredPrice,
        },
      );

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;

      setOfferModal(null);
      setOfferDraftPrice("");
      setOfferModalMessage(null);

      if (result?.status === "club_accepted" || result?.status === "accepted") {
        setMarketActionMessage(
          `Your offer of ${formatTransferAmount(
            offeredPrice,
          )} was accepted. Check Transfers to continue rider negotiation.`,
        );
      } else {
        setMarketActionMessage(
          `Your offer of ${formatTransferAmount(offeredPrice)} was sent successfully.`,
        );
      }

      await refreshSecureProfile(offerModal.riderId);
    } catch (error: any) {
      setOfferModalMessage(
        error?.message ?? "Failed to submit transfer offer.",
      );
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

      if (!freeAgentId) {
        throw new Error("Free agent id is missing.");
      }

      if (!riderId) {
        throw new Error("Rider id is missing.");
      }

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
      setFreeAgentActionError(
        err?.message || "Failed to open free-agent draft.",
      );
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
          ← Back
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-yellow-500 bg-yellow-400 p-6 shadow">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-3xl font-semibold tracking-tight text-slate-950">
              {selectedRider ? riderName : "Rider Profile"}
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
                  Age {profileAge ?? "—"}
                </span>

                <span className="rounded-full border border-yellow-600/25 bg-white/55 px-3 py-1.5 text-sm font-bold text-slate-950">
                  OVR {visibleOverallValue}
                </span>

                {effectiveIsScouted ? (
                  <span className="rounded-full border border-violet-700/20 bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-800">
                    Scouted
                  </span>
                ) : null}

                {activeFreeAgent ? (
                  <span className="rounded-full border border-blue-700/20 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-800">
                    Free Agent
                  </span>
                ) : activeTransferListing ? (
                  <span className="rounded-full border border-emerald-700/20 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-800">
                    Transfer Listed
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="w-full lg:max-w-xl">
            <div className="flex items-center justify-end rounded-2xl px-2">
              {[
                { label: "Points", value: seasonOverview.points },
                { label: "Podiums", value: seasonOverview.podiums },
                { label: "Jerseys", value: seasonOverview.jerseys },
              ].map((item, index) => (
                <React.Fragment key={item.label}>
                  {index > 0 ? (
                    <div className="mx-6 h-12 w-px bg-black/25" />
                  ) : null}

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
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={tabButtonClass("overview")}
          >
            Overview
          </button>
          {shouldShowScoutButton ? (
            <button
              type="button"
              onClick={() => {
                void handleOpenScoutPicker();
              }}
              disabled={availableScoutsLoading || scoutTaskLoading}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                availableScoutsLoading || scoutTaskLoading
                  ? "cursor-not-allowed border-transparent text-slate-400"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {availableScoutsLoading
                ? "Loading scouts…"
                : scoutTaskLoading
                  ? "Checking scout tasks…"
                  : scoutButtonLabel}
            </button>
          ) : null}

          {activeTransferListing ? (
            <button
              type="button"
              onClick={() => {
                void openTransferOfferModal(activeTransferListing);
              }}
              className="border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Make Transfer Offer
            </button>
          ) : null}

          {activeFreeAgent ? (
            <button
              type="button"
              onClick={() => {
                handleNegotiateWithFreeAgent();
              }}
              disabled={freeAgentActionLoading}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                freeAgentActionLoading
                  ? "cursor-not-allowed border-transparent text-slate-400"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {freeAgentActionLoading
                ? "Opening negotiation..."
                : "Negotiate with Free Agent"}
            </button>
          ) : null}

          {shouldShowPremiumOfferButton ? (
            <button
              type="button"
              onClick={() => {
                void openPremiumBidModal();
              }}
              disabled={premiumBidQuoteLoading || premiumBidSubmitting}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                premiumBidQuoteLoading || premiumBidSubmitting
                  ? "cursor-not-allowed border-transparent text-slate-400"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {premiumBidQuoteLoading
                ? "Checking premium offer..."
                : "Make Premium Offer"}
            </button>
          ) : activePremiumBid && !activeTransferListing && !activeFreeAgent ? (
            <button
              type="button"
              disabled
              title="You already have an active premium offer or negotiation for this rider."
              className="cursor-not-allowed border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-400"
            >
              Premium Offer Active
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={tabButtonClass("history")}
          >
            History
          </button>
        </div>
      </div>

      {marketLoading ? (
        <div className="mb-4 text-sm text-slate-500">Loading rider market data…</div>
      ) : null}

      {marketError ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {marketError}
        </div>
      ) : null}

      {marketActionMessage ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {marketActionMessage}
        </div>
      ) : null}

      {profileLoading || gameDateLoading ? (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-slate-600">Loading rider profile…</div>
        </div>
      ) : profileError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4">
          <div className="text-sm font-medium text-rose-700">
            Could not load rider profile
          </div>
          <div className="mt-1 text-sm text-rose-600">{profileError}</div>
        </div>
      ) : !selectedRider ? (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-slate-600">Rider not found.</div>
        </div>
      ) : (
        <>
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <SectionCard title="Rider Image">
                  <div className="flex h-[340px] items-center justify-center rounded-lg bg-slate-100 p-4">
                    <img
                      src={getRiderImageUrl(selectedRider.image_url)}
                      alt={selectedRider.display_name ?? riderName}
                      className="h-full w-full object-contain"
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Season Stats"
                  subtitle="Main season numbers"
                >
                  {overviewLoading ? (
                    <div className="text-sm text-slate-500">
                      Loading season stats…
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      <DetailRow label="Races" value={seasonStats.races} />
                      <DetailRow label="Wins" value={seasonStats.wins} />
                      <DetailRow label="Podiums" value={seasonStats.podiums} />
                      <DetailRow label="Top 10" value={seasonStats.top10} />
                      <DetailRow label="Points" value={seasonStats.points} />
                      <DetailRow
                        label="Jerseys"
                        value={seasonOverview.jerseys}
                      />
                    </div>
                  )}
                </SectionCard>

              </div>

              <div className="space-y-4">
                <SectionCard title="Basic Information">
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="divide-y divide-slate-100">
                      <DetailRow
                        label="Country"
                        value={
                          <span className="inline-flex items-center gap-2">
                            <CountryFlag
                              countryCode={selectedRider.country_code}
                            />
                            <span>
                              {getCountryName(selectedRider.country_code)}
                            </span>
                          </span>
                        }
                      />
                      <DetailRow
                        label="Role"
                        value={selectedRider.role || "—"}
                      />
                      <DetailRow label="Age" value={profileAge ?? "—"} />
                      <DetailRow label="Overall" value={visibleOverallValue} />
                      {effectiveIsScouted ? (
                        <DetailRow
                          label="Potential"
                          value={getSecurePotentialText(secureProfile)}
                        />
                      ) : null}
                      <DetailRow
                        label="Contract End"
                        value={contractExpiryUi.label}
                        valueClassName={contractExpiryUi.valueClassName}
                      />
                    </div>

                    <div className="border-t border-slate-300 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                      {currentTeamLoading ? (
                        <div className="text-sm text-slate-500">Loading team…</div>
                      ) : (
                        <div>
                          <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 pb-3">
                            <span className="text-sm text-slate-500">
                              Current Team:
                            </span>
                            <span className="text-base font-semibold text-slate-900">
                              {currentTeamDisplayName}
                            </span>
                          </div>

                          {currentTeamLogoUrl ? (
                            <div className="mt-5 flex min-h-[130px] items-center justify-start">
                              <img
                                src={currentTeamLogoUrl}
                                alt={currentTeamDisplayName}
                                className="max-h-36 max-w-[280px] object-contain"
                              />
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Skill Attributes"
                  subtitle={
                    effectiveIsScouted
                      ? "Scouted report ranges are shown below. Better scouts provide narrower and more reliable ranges."
                      : "Skill attributes are hidden until the rider is scouted."
                  }
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
                            {mode === "basic" ? "Basic view" : "Modern view"}
                          </button>
                        ))}
                      </div>
                    ) : null
                  }
                >
                  {effectiveSkillViewMode === "basic" ? (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      {skillColumns.map((column, columnIndex) => (
                        <div
                          key={columnIndex}
                          className="divide-y divide-slate-100"
                        >
                          {column.map((item) => (
                            <DetailRow
                              key={item.label}
                              label={item.label}
                              value={getSecureAttributeLabel(
                                secureProfile,
                                item.key,
                              )}
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
                  <SectionCard title="Availability & Medical">
                    <div className="divide-y divide-slate-100">
                      <DetailRow
                        label="Availability"
                        value={
                          getSecureAvailabilityValue(secureProfile, "status") ??
                          "—"
                        }
                      />
                      <DetailRow
                        label="Unavailable Until"
                        value={
                          getSecureAvailabilityValue(
                            secureProfile,
                            "unavailable_until",
                          )
                            ? formatShortGameDate(
                                getSecureAvailabilityValue(
                                  secureProfile,
                                  "unavailable_until",
                                ) as string,
                              )
                            : "—"
                        }
                      />
                      <DetailRow
                        label="Medical / Reason"
                        value={
                          getSecureAvailabilityValue(secureProfile, "reason") ??
                          "—"
                        }
                      />
                      <DetailRow
                        label="Fatigue"
                        value={getSecureFatigueLabel(secureProfile)}
                      />
                    </div>
                  </SectionCard>
                ) : null}

                <SectionCard
                  title="Last 5 Races"
                  subtitle="Finished races only · final race position shown"
                >
                  {overviewLoading ? (
                    <div className="text-sm text-slate-500">
                      Loading recent races…
                    </div>
                  ) : recentRaces.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      No recent race results found for this rider.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentRaces.map((race, index) => {
                        const raceMetaLabel = getRecentRaceMetaLabel(race);
                        const raceLinkState = {
                          returnTo: `${location.pathname}${location.search}${location.hash}`,
                          returnScrollY:
                            typeof window !== "undefined" ? window.scrollY : 0,
                          returnScrollX:
                            typeof window !== "undefined" ? window.scrollX : 0,
                          returnLabel: "Back to rider profile",
                        };

                        return (
                          <div
                            key={`${race.race_id ?? race.race_name}-${race.race_date ?? index}`}
                            className="grid grid-cols-[72px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                          >
                            <div className="whitespace-pre-line text-center text-xs font-semibold leading-tight text-slate-900">
                              {formatRecentRaceDateRange(race).replace(
                                " · ",
                                "\n",
                              )}
                            </div>

                            <div className="min-w-0 border-l border-emerald-400 pl-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <CountryFlag
                                  countryCode={race.race_country_code}
                                />

                                {race.race_id ? (
                                  <Link
                                    to={`/dashboard/races/${race.race_id}`}
                                    state={raceLinkState}
                                    className="truncate text-sm font-semibold text-slate-900 hover:text-yellow-600 hover:underline"
                                  >
                                    {race.race_name}
                                  </Link>
                                ) : (
                                  <span className="truncate text-sm font-semibold text-slate-900">
                                    {race.race_name}
                                  </span>
                                )}

                                {race.race_category ? (
                                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                    {race.race_category}
                                  </span>
                                ) : null}

                                {raceMetaLabel ? (
                                  <span className="truncate text-xs text-slate-500">
                                    ·{" "}
                                    {raceMetaLabel
                                      .replace(race.race_category ?? "", "")
                                      .replace(/^\s*·\s*/, "")}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="border-l border-slate-300 pl-4 text-right text-[10px] uppercase tracking-[0.18em] text-slate-500">
                              Position:{" "}
                              <span className="text-xs normal-case tracking-normal text-slate-900">
                                {race.finish_position == null
                                  ? "—"
                                  : race.finish_position}
                              </span>
                            </div>

                            <div className="border-l border-slate-300 pl-4 text-right text-[10px] uppercase tracking-[0.18em] text-slate-500">
                              UCI points:{" "}
                              <span className="text-xs normal-case tracking-normal text-slate-900">
                                {race.ci_points ?? 0}
                              </span>
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
            <div className="space-y-4">
              <SectionCard
                title="History"
                subtitle="Current season plus previous teams and points per season"
              >
              {historyLoading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Loading career history…
                </div>
              ) : historyError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {historyError}
                </div>
              ) : currentTeamLoading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Loading current team…
                </div>
              ) : displayHistoryRows.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  No career history data found for this rider yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-3 pr-4">Season</th>
                        <th className="py-3 pr-4">Team</th>
                        <th className="py-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayHistoryRows.map((row, index) => (
                        <tr
                          key={`${row.season_label}-${row.team_name}-${index}`}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-800">
                            <div className="flex items-center gap-2">
                              <span>{row.season_label}</span>
                              {row.is_current_season ? (
                                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">
                                  Current
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-slate-700">
                            {row.team_name}
                          </td>
                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.points}
                          </td>
                        </tr>
                      ))}
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
                  returnScrollY:
                    typeof window !== "undefined" ? window.scrollY : 0,
                  returnScrollX:
                    typeof window !== "undefined" ? window.scrollX : 0,
                  returnLabel: "Back to rider profile",
                }}
              />
            </div>
          )}
        </>
      )}

      {scoutPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Choose Scout
                </h3>
                <div className="mt-1 text-sm text-gray-600">
                  Select which scout will handle this report for {riderName}.
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
                Close
              </button>
            </div>

            {availableScoutsError ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {availableScoutsError}
              </div>
            ) : null}

            {availableScoutsLoading ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                Loading available scouts…
              </div>
            ) : availableScouts.length === 0 ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                No available scouts found for this rider.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Select scout
                  </label>

                  <select
                    value={selectedScoutStaffId}
                    onChange={(e) => {
                      setSelectedScoutStaffId(e.target.value);
                      setAvailableScoutsError(null);
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">Choose a scout...</option>
                    {availableScouts.map((scout) => {
                      const busy = Boolean(scout.has_active_scouting_task);

                      return (
                        <option
                          key={scout.scout_staff_id}
                          value={scout.scout_staff_id}
                          disabled={busy}
                        >
                          {scout.scout_name}
                          {busy ? " — busy" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {selectedScoutOption ? (
                  <div
                    className={`rounded-xl border bg-white p-4 ${
                      getEffectiveScoutCanStart(selectedScoutOption)
                        ? "border-blue-400"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-slate-900">
                            {selectedScoutOption.scout_name}
                          </div>

                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Report quality:{" "}
                            {formatScoutPrecisionTier(
                              selectedScoutOption.precision_tier,
                            )}
                          </span>

                          {!getEffectiveScoutCanStart(selectedScoutOption) ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                              Unavailable
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 md:grid-cols-3">
                          <div>
                            <span className="font-semibold">Expertise:</span>{" "}
                            {selectedScoutOption.expertise}
                          </div>
                          <div>
                            <span className="font-semibold">Experience:</span>{" "}
                            {selectedScoutOption.experience}
                          </div>
                          <div>
                            <span className="font-semibold">Potential:</span>{" "}
                            {selectedScoutOption.potential}
                          </div>
                          <div>
                            <span className="font-semibold">Leadership:</span>{" "}
                            {selectedScoutOption.leadership}
                          </div>
                          <div>
                            <span className="font-semibold">Efficiency:</span>{" "}
                            {selectedScoutOption.efficiency}
                          </div>
                          <div>
                            <span className="font-semibold">Loyalty:</span>{" "}
                            {selectedScoutOption.loyalty}
                          </div>
                        </div>
                      </div>

                      <div className="w-full shrink-0 space-y-2 lg:w-[290px]">
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">
                            Estimated duration:
                          </span>{" "}
                          {selectedScoutOption.estimated_duration_hours} in-game
                          hour
                          {selectedScoutOption.estimated_duration_hours === 1
                            ? ""
                            : "s"}
                        </div>

                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">
                            Free reports left today:
                          </span>{" "}
                          {normalizeNumber(
                            selectedScoutOption.free_reports_left_today,
                            0,
                          )}{" "}
                          /{" "}
                          {normalizeNumber(
                            selectedScoutOption.free_reports_per_day,
                            1,
                          )}
                        </div>

                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">
                            Wallet balance:
                          </span>{" "}
                          {normalizeNumber(
                            selectedScoutOption.wallet_balance,
                            0,
                          )}{" "}
                          coin
                          {normalizeNumber(
                            selectedScoutOption.wallet_balance,
                            0,
                          ) === 1
                            ? ""
                            : "s"}
                        </div>

                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">
                            Next report coin cost:
                          </span>{" "}
                          {normalizeNumber(
                            selectedScoutOption.next_report_coin_cost,
                            0,
                          )}
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

            {selectedScoutOption &&
            normalizeNumber(selectedScoutOption.next_report_coin_cost, 0) >
              0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This scout has no free reports left today. Starting this
                scouting task will cost{" "}
                <span className="font-semibold">
                  {normalizeNumber(
                    selectedScoutOption.next_report_coin_cost,
                    0,
                  )}{" "}
                  coin
                </span>
                . You currently have{" "}
                <span className="font-semibold">
                  {normalizeNumber(selectedScoutOption.wallet_balance, 0)} coin
                </span>
                .
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Each scout includes 1 free report per in-game day. Additional
              reports cost 1 coin.
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
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  !selectedScoutOption ||
                  Boolean(selectedScoutEffectiveBlockingReason) ||
                  scoutSubmitLoading
                }
                onClick={() => {
                  void handleSubmitScoutTask();
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  !selectedScoutOption ||
                  Boolean(selectedScoutEffectiveBlockingReason) ||
                  scoutSubmitLoading
                    ? "cursor-not-allowed bg-gray-200 text-gray-500"
                    : "bg-yellow-400 text-black hover:bg-yellow-300"
                }`}
              >
                {scoutSubmitLoading ? "Starting..." : "Start Scouting"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {premiumBidModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Make Premium Offer
            </h3>


            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <div>
                <span className="font-semibold text-gray-900">Rider:</span>{" "}
                {premiumBidModal.riderName}
              </div>
              <div>
                <span className="font-semibold text-gray-900">
                  Market value:
                </span>{" "}
                {formatTransferAmount(premiumBidModal.marketValue)}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Premium Offer
              </label>
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

            {premiumBidQuote ? (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className={`rounded-lg border px-3 py-2 text-sm ${getPremiumBidToneClass(premiumBidQuote.selling_club_stance)}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    Club stance
                  </div>
                  <div className="mt-1 font-semibold">
                    {formatPremiumBidStatusLabel(premiumBidQuote.selling_club_stance)}
                  </div>
                </div>

                <div className={`rounded-lg border px-3 py-2 text-sm ${getPremiumBidToneClass(premiumBidQuote.offer_strength)}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    Offer strength
                  </div>
                  <div className="mt-1 font-semibold">
                    {formatPremiumBidStatusLabel(premiumBidQuote.offer_strength)}
                  </div>
                </div>

                <div className={`rounded-lg border px-3 py-2 text-sm ${getPremiumBidToneClass(premiumBidQuote.predicted_public_outcome)}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    Predicted result
                  </div>
                  <div className="mt-1 font-semibold">
                    {formatPremiumBidStatusLabel(premiumBidQuote.predicted_public_outcome)}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    AI counter
                  </div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {premiumBidQuote.counteroffer_amount_cash
                      ? formatTransferAmount(
                          getPremiumBidQuoteNumber(
                            premiumBidQuote.counteroffer_amount_cash,
                          ),
                        )
                      : "—"}
                  </div>
                </div>
              </div>
            ) : null}

            {premiumBidQuote?.reasons?.length ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {premiumBidQuote.reasons.slice(0, 3).map((reason) => (
                  <div key={reason}>• {reason}</div>
                ))}
              </div>
            ) : null}

            {premiumBidMessage ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {premiumBidMessage}
              </div>
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
                Cancel
              </button>

              <button
                type="button"
                disabled={premiumBidQuoteLoading || premiumBidSubmitting}
                onClick={() => {
                  void loadPremiumBidQuote();
                }}
                className={`rounded-md border px-4 py-2 text-sm font-medium ${
                  premiumBidQuoteLoading || premiumBidSubmitting
                    ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {premiumBidQuoteLoading ? "Checking..." : "Refresh Quote"}
              </button>

              <button
                type="button"
                disabled={
                  premiumBidSubmitting ||
                  premiumBidQuoteLoading ||
                  premiumBidQuote?.can_submit === false
                }
                onClick={() => {
                  void handleSubmitPremiumBidFromProfile();
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  premiumBidSubmitting ||
                  premiumBidQuoteLoading ||
                  premiumBidQuote?.can_submit === false
                    ? "cursor-not-allowed bg-gray-200 text-gray-500"
                    : "bg-yellow-400 text-black hover:bg-yellow-300"
                }`}
              >
                {premiumBidSubmitting ? "Submitting..." : "Submit Premium Offer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {offerModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Make Transfer Offer
            </h3>

            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <div>
                <span className="font-semibold text-gray-900">Rider:</span>{" "}
                {offerModal.riderName}
              </div>
              <div>
                <span className="font-semibold text-gray-900">Seller:</span>{" "}
                {offerModal.sellerClubName ?? "Unknown club"}
              </div>
              <div>
                <span className="font-semibold text-gray-900">
                  Asking price:
                </span>{" "}
                {formatTransferAmount(offerModal.askingPrice)}
              </div>
            </div>

            {offerModalMessage ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {offerModalMessage}
              </div>
            ) : null}

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Your Offer
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={offerDraftPrice}
                onChange={(e) =>
                  setOfferDraftPrice(formatCurrencyInput(e.target.value))
                }
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
                Cancel
              </button>

              <button
                type="button"
                disabled={offerSubmitting}
                onClick={() => {
                  void handleSubmitTransferOfferFromProfile();
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  offerSubmitting
                    ? "cursor-not-allowed bg-gray-200 text-gray-500"
                    : "bg-yellow-400 text-black hover:bg-yellow-300"
                }`}
              >
                {offerSubmitting ? "Submitting..." : "Submit Offer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
