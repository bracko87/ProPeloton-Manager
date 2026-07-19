/**
 * ClubHistory.tsx
 * Full club honours archive for the authenticated user's main club.
 *
 * Current backend source:
 * - get_my_club_id()
 * - clubs
 * - get_club_top_historical_results_v1(p_club_id, p_limit)
 *
 * Current scope:
 * - One-day results
 * - Stage results
 *
 * Deferred until an authoritative classification source is confirmed:
 * - Final GC
 * - Points classification
 * - Mountain classification
 * - Youth classification
 */

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type ClubInfo = {
  id: string;
  name: string;
  countryCode: string;
  logoPath: string | null;
  createdGameDate: string | null;
  clubTier: string;
  parentClubId: string | null;
};

type ClubHonourRow = {
  id: string;
  achievementId: string;
  seasonYear: number;
  seasonLabel: string;
  dateLabel: string;
  resultDate: string;
  raceId: string;
  stageId: string;
  raceName: string;
  raceCountryCode: string;
  raceCategory: string;
  achievementType: string;
  achievementLabel: string;
  riderId: string;
  riderName: string;
  resultPosition: number;
  prestigeScore: number;
  href: string;
};

type ResultFilter = "all" | "wins" | "podiums" | "top10";
type AchievementFilter = "all" | "one_day_result" | "stage_result";

const RESULTS_PER_PAGE = 20;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function countryCodeToFlagEmoji(countryCode?: string | null): string {
  const code = (countryCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";

  return Array.from(code)
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}


function safeCountryCode(countryCode?: string | null): string {
  const code = (countryCode ?? "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : "";
}

function getCountryFlagUrl(countryCode: string): string {
  return `https://flagcdn.com/24x18/${countryCode}.png`;
}

function CountryFlag({
  countryCode,
  className = "",
}: {
  countryCode?: string | null;
  className?: string;
}) {
  const safeCode = safeCountryCode(countryCode);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
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

  if (!safeCode) {
    return (
      <span
        className={placeholderClassName}
        title="Unknown country"
        aria-label="Unknown country"
      />
    );
  }

  if (hasError) {
    const emoji = countryCodeToFlagEmoji(safeCode);

    return (
      <span
        className={[
          "inline-flex h-4 w-6 shrink-0 items-center justify-center rounded-sm border border-gray-200 bg-white text-[13px] leading-none",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        title={safeCode.toUpperCase()}
        aria-label={safeCode.toUpperCase()}
      >
        {emoji || safeCode.toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={getCountryFlagUrl(safeCode)}
      alt={safeCode.toUpperCase()}
      title={safeCode.toUpperCase()}
      className={imageClassName}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

function normalizeHonours(value: unknown): ClubHonourRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw, index) => {
    const row = raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};

    return {
      id: asString(row.id ?? row.achievement_id, `honour:${index}`),
      achievementId: asString(row.achievement_id ?? row.id, `honour:${index}`),
      seasonYear: asNumber(row.season_year, 2000),
      seasonLabel: asString(row.season_label, "Season 1"),
      dateLabel: asString(row.date_label, ""),
      resultDate: asString(row.result_date, ""),
      raceId: asString(row.race_id, ""),
      stageId: asString(row.stage_id, ""),
      raceName: asString(row.race_name, "Race"),
      raceCountryCode: asString(row.race_country_code, ""),
      raceCategory: asString(row.race_category, ""),
      achievementType: asString(row.achievement_type, ""),
      achievementLabel: asString(row.achievement_label, "Result"),
      riderId: asString(row.rider_id, ""),
      riderName: asString(row.rider_name, ""),
      resultPosition: asNumber(
        row.result_position ?? row.position,
        0,
      ),
      prestigeScore: asNumber(row.prestige_score, 0),
      href:
        asString(row.href ?? row.race_href, "") ||
        (asString(row.race_id, "")
          ? `#/dashboard/races/${asString(row.race_id)}`
          : ""),
    };
  });
}

function formatFullDate(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function HonourRow({ item }: { item: ClubHonourRow }) {
  const details = `${item.achievementLabel}${
    item.riderName ? ` · ${item.riderName}` : ""
  }`;

  const content = (
    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm transition hover:bg-white">
      <div className="w-[68px] shrink-0 whitespace-nowrap text-xs font-semibold text-slate-900">
        {item.dateLabel || formatFullDate(item.resultDate)}
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
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {item.raceCategory}
          </span>
        ) : null}

        {details ? (
          <span className="min-w-0 truncate text-xs text-slate-500">
            · {details}
          </span>
        ) : null}
      </div>
    </div>
  );

  return item.href ? <a href={item.href}>{content}</a> : content;
}

export default function ClubHistoryPage() {
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [honours, setHonours] = useState<ClubHonourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [seasonFilter, setSeasonFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [achievementFilter, setAchievementFilter] =
    useState<AchievementFilter>("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { data: clubIdData, error: clubIdError } = await supabase.rpc(
          "get_my_club_id",
        );

        if (clubIdError) throw clubIdError;

        const clubId = asString(clubIdData, "");
        if (!clubId) throw new Error("No club could be resolved.");

        const { data: resolvedClubData, error: resolvedClubError } =
          await supabase
            .from("clubs")
            .select(
              "id, name, country_code, logo_path, created_game_date, club_tier, parent_club_id",
            )
            .eq("id", clubId)
            .single();

        if (resolvedClubError) throw resolvedClubError;

        const resolvedClubRow =
          resolvedClubData as Record<string, unknown>;
        const parentClubId =
          asString(resolvedClubRow.parent_club_id, "") || null;
        const historyClubId = parentClubId || clubId;

        const [{ data: clubData, error: clubError }, honoursResponse] =
          await Promise.all([
            supabase
              .from("clubs")
              .select(
                "id, name, country_code, logo_path, created_game_date, club_tier, parent_club_id",
              )
              .eq("id", historyClubId)
              .single(),
            supabase.rpc("get_club_top_historical_results_v1", {
              p_club_id: historyClubId,
              p_limit: 100,
            }),
          ]);

        if (clubError) throw clubError;
        if (honoursResponse.error) throw honoursResponse.error;

        if (!mounted) return;

        const clubRow = clubData as Record<string, unknown>;

        setClub({
          id: asString(clubRow.id, historyClubId),
          name: asString(clubRow.name, "Club"),
          countryCode: asString(clubRow.country_code, ""),
          logoPath: asString(clubRow.logo_path, "") || null,
          createdGameDate: asString(clubRow.created_game_date, "") || null,
          clubTier: asString(clubRow.club_tier, ""),
          parentClubId: asString(clubRow.parent_club_id, "") || null,
        });
        setHonours(normalizeHonours(honoursResponse.data));
      } catch (err) {
        console.error("Could not load club history:", err);
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Club history could not be loaded.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const seasons = useMemo(
    () =>
      Array.from(
        new Set(honours.map((item) => item.seasonLabel).filter(Boolean)),
      ).sort((left, right) => right.localeCompare(left, undefined, {
        numeric: true,
      })),
    [honours],
  );

  const filteredHonours = useMemo(() => {
    const query = search.trim().toLowerCase();

    return honours.filter((item) => {
      if (seasonFilter !== "all" && item.seasonLabel !== seasonFilter) {
        return false;
      }

      if (
        achievementFilter !== "all" &&
        item.achievementType !== achievementFilter
      ) {
        return false;
      }

      if (resultFilter === "wins" && item.resultPosition !== 1) return false;
      if (
        resultFilter === "podiums" &&
        (item.resultPosition < 1 || item.resultPosition > 3)
      ) {
        return false;
      }
      if (
        resultFilter === "top10" &&
        (item.resultPosition < 1 || item.resultPosition > 10)
      ) {
        return false;
      }

      if (
        query &&
        !`${item.raceName} ${item.riderName} ${item.achievementLabel}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }

      return true;
    });
  }, [
    honours,
    seasonFilter,
    resultFilter,
    achievementFilter,
    search,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredHonours.length / RESULTS_PER_PAGE),
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [seasonFilter, resultFilter, achievementFilter, search]);

  React.useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedHonours = useMemo(() => {
    const start = (currentPage - 1) * RESULTS_PER_PAGE;
    return filteredHonours.slice(start, start + RESULTS_PER_PAGE);
  }, [filteredHonours, currentPage]);

  const groupedBySeason = useMemo(() => {
    const groups = new Map<string, ClubHonourRow[]>();

    for (const item of paginatedHonours) {
      const existing = groups.get(item.seasonLabel) ?? [];
      existing.push(item);
      groups.set(item.seasonLabel, existing);
    }

    return Array.from(groups.entries()).sort(([left], [right]) =>
      right.localeCompare(left, undefined, { numeric: true }),
    );
  }, [paginatedHonours]);

  const wins = honours.filter((item) => item.resultPosition === 1).length;
  const podiums = honours.filter(
    (item) => item.resultPosition >= 1 && item.resultPosition <= 3,
  ).length;
  const oneDayWins = honours.filter(
    (item) =>
      item.resultPosition === 1 && item.achievementType === "one_day_result",
  ).length;
  const stageWins = honours.filter(
    (item) =>
      item.resultPosition === 1 && item.achievementType === "stage_result",
  ).length;

  if (loading) {
    return (
      <div className="space-y-5 p-6">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-2xl bg-slate-200"
            />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-slate-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <div className="font-bold">Club history could not be loaded</div>
          <div className="mt-1">{error}</div>
        </div>
      </div>
    );
  }

  const clubFlag = countryCodeToFlagEmoji(club?.countryCode);

  return (
    <div className="space-y-6 p-6">
      <div>
        <a
          href="#/dashboard/overview"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          aria-label="Back to Overview"
        >
          <span aria-hidden="true">←</span>
          Back
        </a>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {club?.logoPath ? (
              <img
                src={club.logoPath}
                alt=""
                className="h-16 w-16 rounded-xl border border-slate-200 object-contain p-1"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-2xl">
                {clubFlag || "🏆"}
              </div>
            )}

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Club History
              </div>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                {club?.name ?? "Club"}
              </h1>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                {clubFlag ? (
                  <span>
                    {clubFlag} {club?.countryCode}
                  </span>
                ) : null}
                {club?.clubTier ? <span>{club.clubTier}</span> : null}
                {club?.createdGameDate ? (
                  <span>Founded {formatFullDate(club.createdGameDate)}</span>
                ) : null}
              </div>
            </div>
          </div>

        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total honours"
          value={honours.length}
          hint="Persisted top-10 one-day and stage results"
        />
        <StatCard label="Victories" value={wins} hint="Race and stage wins" />
        <StatCard label="Podiums" value={podiums} hint="First, second or third" />
        <StatCard
          label="Win breakdown"
          value={`${oneDayWins} / ${stageWins}`}
          hint="One-day wins / stage wins"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Results archive</h2>
          <p className="mt-1 text-sm text-slate-500">
            All currently supported club honours, grouped by season.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search race or rider"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
          />

          <select
            value={seasonFilter}
            onChange={(event) => {
              setSeasonFilter(event.target.value);
              setCurrentPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="all">All seasons</option>
            {seasons.map((season) => (
              <option key={season} value={season}>
                {season}
              </option>
            ))}
          </select>

          <select
            value={achievementFilter}
            onChange={(event) => {
              setAchievementFilter(event.target.value as AchievementFilter);
              setCurrentPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="all">All result types</option>
            <option value="one_day_result">One-day results</option>
            <option value="stage_result">Stage results</option>
          </select>

          <select
            value={resultFilter}
            onChange={(event) => {
              setResultFilter(event.target.value as ResultFilter);
              setCurrentPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="all">All top-10 results</option>
            <option value="wins">Victories only</option>
            <option value="podiums">Podiums only</option>
            <option value="top10">Top 10</option>
          </select>
        </div>

        <div className="mt-5 space-y-6">
          {groupedBySeason.length > 0 ? (
            groupedBySeason.map(([season, rows]) => (
              <div key={season}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">{season}</h3>
                  <span className="text-xs text-slate-500">
                    {rows.length} result{rows.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="space-y-2">
                  {rows.map((item) => (
                    <HonourRow key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              No club honours match the selected filters.
            </div>
          )}
        </div>

        {filteredHonours.length > 0 ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="text-sm text-slate-500">
              Showing{" "}
              <span className="font-semibold text-slate-700">
                {(currentPage - 1) * RESULTS_PER_PAGE + 1}
              </span>
              {"–"}
              <span className="font-semibold text-slate-700">
                {Math.min(
                  currentPage * RESULTS_PER_PAGE,
                  filteredHonours.length,
                )}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-700">
                {filteredHonours.length}
              </span>{" "}
              results
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((page) => Math.max(1, page - 1))
                }
                disabled={currentPage === 1}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <span className="min-w-[90px] text-center text-sm font-semibold text-slate-700">
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
                disabled={currentPage === totalPages}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Final GC, points, mountain and youth-classification honours will be
        added after their authoritative persisted result source is confirmed.
      </section>
    </div>
  );
}
