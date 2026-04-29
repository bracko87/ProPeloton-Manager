/**
 * @file Utility helpers for parsing, normalizing and formatting in-game dates
 * for the finance dashboard and any other views that work with game seasons.
 *
 * The game calendar is mapped onto real UTC dates by offsetting the year with
 * {@link GAME_YEAR_OFFSET}, so we can safely use native Date arithmetic while
 * keeping a clean game-centric API.
 */

export type GameDateParts = {
  /** Game season number (1-based). */
  season: number
  /** Game month number within the season (1–12). */
  month: number
  /** Game day number within the month (1–31). */
  day: number
  /** Optional game hour (0–23). */
  hour?: number | null
  /** Optional game minute (0–59). */
  minute?: number | null
}

/**
 * Internal year offset that anchors the game calendar on a real UTC year.
 * Season 1 maps to year GAME_YEAR_OFFSET + 1, etc.
 */
const GAME_YEAR_OFFSET = 1999

/**
 * Narrowing helper to check for plain record-like objects.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Attempts to coerce the first non-nullish, non-undefined value in the
 * provided list into an integer. Returns null if all candidates fail.
 */
function toInt(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return Math.trunc(v)
    }

    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.trim())
      if (Number.isFinite(n)) {
        return Math.trunc(n)
      }
    }
  }

  return null
}

/**
 * Pads a number to at least two digits with a leading zero.
 */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Light heuristic to check whether a string starts like an ISO date
 * (e.g. "2024-05-01" or "2024-05-01T10:30:00Z").
 */
function looksLikeIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(text.trim())
}

/**
 * Parses an ISO-like date string into {@link GameDateParts}, mapping from
 * real UTC date to game season/month/day using {@link GAME_YEAR_OFFSET}.
 *
 * If currentSeason is provided, this also rejects impossible future seasons.
 * Example: if the current game is Season 1, "2026-03-01" would become
 * Season 27, which is probably a real-life timestamp leaking into the game UI.
 */
function parseIsoGameDate(
  text: string,
  currentSeason?: number | null
): GameDateParts | null {
  if (!looksLikeIsoDate(text)) return null

  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return null

  const season = d.getUTCFullYear() - GAME_YEAR_OFFSET
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()

  if (season <= 0 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  /**
   * Safety guard:
   * If the current game is Season 1, a date like 2026-03-01 would become Season 27.
   * That is almost certainly a real-life date leaking into game UI.
   */
  if (
    typeof currentSeason === 'number' &&
    Number.isFinite(currentSeason) &&
    season > currentSeason + 1
  ) {
    return null
  }

  const hasTime = /[T\s]\d{2}:\d{2}/.test(text)

  return {
    season,
    month,
    day,
    hour: hasTime ? d.getUTCHours() : null,
    minute: hasTime ? d.getUTCMinutes() : null,
  }
}

/**
 * Parses human-readable game date labels such as:
 * "Season 2 Month 3 Day 5 14:30".
 */
function parseSeasonText(text: string): GameDateParts | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const seasonMatch = trimmed.match(/season\s+(\d+)/i)
  const monthMatch = trimmed.match(/month\s+(\d+)/i)
  const dayMatch = trimmed.match(/day\s+(\d+)/i)
  const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})/)

  if (!seasonMatch || !monthMatch || !dayMatch) return null

  const season = Number(seasonMatch[1])
  const month = Number(monthMatch[1])
  const day = Number(dayMatch[1])

  if (!season || !month || !day) return null

  return {
    season,
    month,
    day,
    hour: timeMatch ? Number(timeMatch[1]) : null,
    minute: timeMatch ? Number(timeMatch[2]) : null,
  }
}

/**
 * Attempts to resolve game date parts directly from a flat record where
 * fields may use different naming conventions (snake_case, camelCase, etc.).
 */
function resolveDirectParts(candidate: Record<string, unknown>): GameDateParts | null {
  const season = toInt(
    candidate.season,
    candidate.game_season,
    candidate.in_game_season,
    candidate.season_number,
    candidate.gameSeason,
    candidate.inGameSeason
  )

  const month = toInt(
    candidate.month,
    candidate.game_month,
    candidate.in_game_month,
    candidate.month_number,
    candidate.gameMonth,
    candidate.inGameMonth
  )

  const day = toInt(
    candidate.day,
    candidate.game_day,
    candidate.in_game_day,
    candidate.day_number,
    candidate.gameDay,
    candidate.inGameDay
  )

  const hour = toInt(
    candidate.hour,
    candidate.game_hour,
    candidate.in_game_hour,
    candidate.hour_number,
    candidate.gameHour,
    candidate.inGameHour
  )

  const minute = toInt(
    candidate.minute,
    candidate.game_minute,
    candidate.in_game_minute,
    candidate.minute_number,
    candidate.gameMinute,
    candidate.inGameMinute
  )

  if (!season || !month || !day) return null

  return {
    season,
    month,
    day,
    hour,
    minute,
  }
}

/**
 * Tries to extract {@link GameDateParts} from a variety of shapes that may
 * come from Supabase rows, nested JSON payloads or plain strings.
 *
 * It:
 * - handles raw ISO strings or "Season X Month Y Day Z" labels;
 * - rejects likely real-life ISO timestamps when currentSeason is provided;
 * - looks at common label fields like `in_game_date_label`;
 * - falls back to direct numeric fields (season/month/day/hour/minute);
 * - finally recurses into common nested keys like `metadata` or `payload`.
 */
export function resolveGameDate(
  candidate: unknown,
  depth = 0,
  currentSeason?: number | null
): GameDateParts | null {
  if (depth > 4) return null

  if (typeof candidate === 'string') {
    return parseIsoGameDate(candidate, currentSeason) ?? parseSeasonText(candidate)
  }

  if (!isRecord(candidate)) return null

  const directTextCandidates = [
    candidate.in_game_date_label,
    candidate.game_date_label,
    candidate.inGameDateLabel,
    candidate.in_game_date,
    candidate.game_date,
    candidate.gameDate,
    candidate.source_game_date,
    candidate.sourceGameDate,
  ]

  for (const value of directTextCandidates) {
    if (typeof value === 'string') {
      const parsed = resolveGameDate(value, depth + 1, currentSeason)
      if (parsed) return parsed
    }

    if (isRecord(value)) {
      const parsed = resolveGameDate(value, depth + 1, currentSeason)
      if (parsed) return parsed
    }
  }

  const directParts = resolveDirectParts(candidate)
  if (directParts) return directParts

  const nestedKeys = [
    'metadata',
    'details',
    'payload',
    'game_date',
    'in_game_date',
    'gameDate',
    'source_game_date',
    'sourceGameDate',
  ]

  for (const key of nestedKeys) {
    const nested = candidate[key]
    if (nested !== undefined && nested !== null && nested !== candidate) {
      const parsed = resolveGameDate(nested, depth + 1, currentSeason)
      if (parsed) return parsed
    }
  }

  return null
}

/**
 * Formats normalized {@link GameDateParts} into a short label like:
 * "05/03, Season 2" or, with time, "05/03, Season 2, 14:30".
 */
export function formatGameDate(parts: GameDateParts | null, includeTime = false): string {
  if (!parts) return '—'

  const base = `${pad2(parts.day)}/${pad2(parts.month)}, Season ${parts.season}`

  if (
    includeTime &&
    typeof parts.hour === 'number' &&
    typeof parts.minute === 'number'
  ) {
    return `${base}, ${pad2(parts.hour)}:${pad2(parts.minute)}`
  }

  return base
}

/**
 * Formats a range between two arbitrary values that can be resolved via
 * {@link resolveGameDate}, for example:
 * "01/03 → 30/03, Season 2".
 */
export function formatGameDateRange(start: unknown, end: unknown): string {
  const s = resolveGameDate(start)
  const e = resolveGameDate(end)

  if (!s || !e) return '—'

  if (s.season === e.season) {
    return `${pad2(s.day)}/${pad2(s.month)} → ${pad2(e.day)}/${pad2(e.month)}, Season ${s.season}`
  }

  return `${formatGameDate(s)} → ${formatGameDate(e)}`
}

/**
 * Converts {@link GameDateParts} into a sortable numeric value (UTC ms since
 * epoch), which can be used for comparisons or ordering.
 */
export function getGameDateValue(parts: GameDateParts | null): number {
  if (!parts) return 0

  return Date.UTC(
    GAME_YEAR_OFFSET + parts.season,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    0,
    0
  )
}

/**
 * Returns a stable key representing a game month, e.g. "S2-M03".
 * Useful for grouping finance rows by game month.
 */
export function getGameMonthKey(parts: GameDateParts | null): string {
  if (!parts) return 'unknown'
  return `S${parts.season}-M${pad2(parts.month)}`
}

/**
 * Turns a month key from {@link getGameMonthKey} into a human-friendly label,
 * e.g. "Month 3, Season 2".
 */
export function formatGameMonthLabel(monthKey: string): string {
  const match = monthKey.match(/^S(\d+)-M(\d+)$/)

  if (!match) return 'Unknown game month'

  return `Month ${Number(match[2])}, Season ${Number(match[1])}`
}

/**
 * Adds a number of game days to a {@link GameDateParts} value, returning a
 * new normalized date using UTC-safe Date arithmetic.
 */
export function addGameDays(parts: GameDateParts, days: number): GameDateParts {
  const d = new Date(
    Date.UTC(
      GAME_YEAR_OFFSET + parts.season,
      parts.month - 1,
      parts.day,
      parts.hour ?? 0,
      parts.minute ?? 0,
      0,
      0
    )
  )

  d.setUTCDate(d.getUTCDate() + days)

  return {
    season: d.getUTCFullYear() - GAME_YEAR_OFFSET,
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  }
}

/**
 * Adds a number of game months to a {@link GameDateParts} value, returning a
 * new normalized date.
 */
export function addGameMonths(parts: GameDateParts, months: number): GameDateParts {
  const d = new Date(
    Date.UTC(
      GAME_YEAR_OFFSET + parts.season,
      parts.month - 1,
      parts.day,
      parts.hour ?? 0,
      parts.minute ?? 0,
      0,
      0
    )
  )

  d.setUTCMonth(d.getUTCMonth() + months)

  return {
    season: d.getUTCFullYear() - GAME_YEAR_OFFSET,
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  }
}

/**
 * Given a period end (any value understood by {@link resolveGameDate}),
 * returns a label for the end of the *next* game month, formatted via
 * {@link formatGameDate}. If parsing fails, returns "—".
 */
export function getNextGameMonthEndLabel(periodEnd: unknown): string {
  const end = resolveGameDate(periodEnd)
  if (!end) return '—'

  // Use "day 0" of the following month index to get the last day
  // of the month we are interested in, then map back to game parts.
  const d = new Date(
    Date.UTC(GAME_YEAR_OFFSET + end.season, end.month + 1, 0, 12, 0, 0, 0)
  )

  return formatGameDate({
    season: d.getUTCFullYear() - GAME_YEAR_OFFSET,
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  })
}