/**
 * Overview.tsx
 * Redesigned dashboard overview page for ProPeloton-style club management.
 * v26: keeps race flags fixed and aligns overview income/expenses with Finance Overview statement rows.
 *
 * Notes:
 * - Built for HashRouter links (`#/dashboard/...`).
 * - Dashboard data is loaded from Supabase RPC: `get_dashboard_overview`.
 * - Uses silent background refresh to avoid page flicker.
 * - Integrates with sponsor dashboard RPC to pull the signed main sponsor logo
 *   into the overview "Main Sponsor" panel when available.
 */

import React from "react";
import TutorialOverlay from "../../components/tutorial/TutorialOverlay";
import TutorialTargetFrame from "../../components/tutorial/TutorialTargetFrame";
import { supabase } from "../../lib/supabase";
import {
  menuTutorialSteps,
  menuWelcomeTutorial,
  overviewTutorialSteps,
  overviewWelcomeTutorial,
} from "../../lib/tutorials";
import {
  getTutorialProgress,
  saveTutorialProgress,
} from "../../lib/tutorialProgress";

type AlertLevel = "danger" | "warning" | "info" | "success";
type FeedLevel =
  | "finance"
  | "training"
  | "infrastructure"
  | "medical"
  | "inbox"
  | "sponsor"
  | "system";

type AlertItem = {
  id: string;
  label: string;
  level: AlertLevel;
  href?: string;
};

type KpiItem = {
  label: string;
  value: string;
  hint: string;
  trend?: string;
};

type OperationMetric = {
  label: string;
  value: string;
};

type OperationItem = {
  id: string;
  title: string;
  status: string;
  summary: string;
  href?: string;
  metrics: OperationMetric[];
  subtitle?: string;
  statusLabel?: string;
};

type SquadPulse = {
  fitness: number;
  morale: number;
  readiness: number;
  form: string;
  availableRiders: number;
  injured: number;
  sick: number;
  notFullyFit: number;
  expiringContracts: number;
};

type ScheduleItem = {
  id: string;
  dateLabel: string;
  title: string;
  subtitle: string;
  countryCode?: string | null;
  href?: string;
};

type FeedItem = {
  id: string;
  level: FeedLevel;
  title: string;
  subtitle: string;
  timeLabel: string;
  href?: string;
};

type DayRaceItem = {
  id: string;
  title: string;
  subtitle: string;
  timeLabel?: string;
  countryCode?: string | null;
  href?: string;
};

type NewsItem = {
  id: string;
  title: string;
  subtitle: string;
  timeLabel: string;
  href?: string;
  detail?: string;
  expandedText?: string;
  sourceType?: string;
  relatedType?: string;
  relatedHref?: string;
};

type TransactionSummaryItem = {
  id: string;
  type: string;
  label: string;
  amount: number;
};

type FinancePeriodSummary = {
  weeklyOperatingIncome: number;
  weeklyOperatingExpense: number;
  monthlyOperatingIncome: number;
  monthlyOperatingExpense: number;
  seasonOperatingIncome: number;
  seasonOperatingExpense: number;
};

type FinanceHealth = FinancePeriodSummary & {
  balance: number;
  weeklyNet: number;
  sponsorIncome: number;
  recurringPolicyCost: number;
  nextTripForecast: number;
  latestTransactionLabel: string;
  latestTransactionAmount: number;
  topOperatingIncomes: TransactionSummaryItem[];
  topOperatingExpenses: TransactionSummaryItem[];
  debtMovements: TransactionSummaryItem[];
};

type EmergencyDebtHealth = {
  rescuesUsed: number;
  rescueLimit: number;
  outstandingPrincipal: number;
  nextRepaymentAmount: number;
  nextRepaymentDateLabel: string;
  liquidationRisk: string;
  totalEmergencyLoanDisbursed: number;
  totalPrincipalRepaid: number;
  totalInterestPaid: number;
};

type QuickActionItem = {
  id: string;
  label: string;
  href: string;
  accent: string;
};

type MainSponsor = {
  name: string;
  logoUrl?: string;
  subtitle?: string;
  href?: string;
  isActive?: boolean;
};

type OverviewSeasonSnapshot = {
  races: number;
  stages: number;
  internationalPoints: number;
  wins: number;
  podiums: number;
  top10s: number;
  jerseys: number;
  bestGc: number | null;
};

const EMPTY_SEASON_SNAPSHOT: OverviewSeasonSnapshot = {
  races: 0,
  stages: 0,
  internationalPoints: 0,
  wins: 0,
  podiums: 0,
  top10s: 0,
  jerseys: 0,
  bestGc: null,
};

type DashboardOverviewData = {
  club: {
    id?: string;
    name: string;
    handle: string;
    countryCode: string;
    tier: string;
    division: string;
    seasonLabel: string;
    dateLabel: string;
    weatherLabel: string;
    rankLabel: string;
    inboxUnread: number;
    notificationsUnread: number;
  };
  alerts: AlertItem[];
  kpis: KpiItem[];
  operations: OperationItem[];
  squadPulse: SquadPulse;
  schedule: ScheduleItem[];
  dayRaces: DayRaceItem[];
  news: NewsItem[];
  feed: FeedItem[];
  finance: FinanceHealth;
  emergencyDebt: EmergencyDebtHealth;
  quickActions: QuickActionItem[];
  mainSponsor: MainSponsor;
};

type OverviewNextRaceRow = {
  riderId: string;
  riderName: string;
  role: string | null;
  raceSharpness: number | null;
  raceSharpnessLabel: string | null;
};

type OverviewLastRaceRow = {
  riderId: string;
  riderName: string;
  role: string | null;
  position: number | null;
  resultLabel: string;
  points: number;
};

type OverviewRaceBase = {
  squadLabel: string;
  raceId: string | null;
  raceName: string | null;
  raceCategory: string | null;
  raceCountryCode: string | null;
  stageDate: string | null;
  stageLabel: string | null;
  routeLabel: string | null;
  stageCount: number;
};

type OverviewNextTeamRace = OverviewRaceBase & {
  rows: OverviewNextRaceRow[];
};

type OverviewLastTeamRace = OverviewRaceBase & {
  rows: OverviewLastRaceRow[];
};

type OverviewTeamRaceHub = {
  lastTeamRace: OverviewLastTeamRace | null;
  nextTeamRace: OverviewNextTeamRace | null;
};

type OverviewRaceWorldData = {
  upcomingSchedule: ScheduleItem[];
  todayRaces: DayRaceItem[];
  worldNews: NewsItem[];
};

const EMPTY_RACE_WORLD_DATA: OverviewRaceWorldData = {
  upcomingSchedule: [],
  todayRaces: [],
  worldNews: [],
};

/**
 * SponsorKindForOverview
 * Narrowed sponsor kind union used for sponsor dashboard integration in overview.
 */
type SponsorKindForOverview = "main" | "secondary" | "technical";

/**
 * SignedSponsorForOverview
 * Minimal shape of a signed sponsor as returned by sponsor_get_dashboard,
 * restricted to fields needed by the overview page.
 */
interface SignedSponsorForOverview {
  sponsor_kind?: SponsorKindForOverview | string;
  logo_url?: string | null;
  metadata?: Record<string, unknown> | null;
  name?: string | null;
  status?: string | null;
}

/**
 * SponsorDashboardForOverview
 * Minimal shape of the sponsor dashboard payload needed by the overview page.
 */
interface SponsorDashboardForOverview {
  club_id?: string | null;
  signed_sponsors?: SignedSponsorForOverview[];
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const DEBT_TRANSACTION_TYPES = new Set([
  "emergency_loan_disbursement",
  "emergency_loan_principal_repayment",
]);

const REAL_EXPENSE_TRANSACTION_TYPES = new Set(["emergency_loan_interest"]);

const transactionTypeLabels: Record<string, string> = {
  emergency_loan_disbursement: "Emergency Loan",
  emergency_loan_principal_repayment: "Loan Principal",
  emergency_loan_interest: "Loan Interest",
  rider_salary_payday: "Rider Salary",
  staff_salary_payday: "Staff Salary",
  sponsor_contract_payment: "Sponsor",
  tax_withholding: "Tax",
  new_club_bonus: "Bonus",
};

/**
 * isDebtTransaction
 * Returns true for transaction types that are debt balance movements and should
 * not be mixed into operating income or operating costs.
 */
function isDebtTransaction(type: string): boolean {
  return DEBT_TRANSACTION_TYPES.has(type);
}

/**
 * shouldCountAsOperatingIncome
 * Counts real operating income while excluding loan disbursements.
 */
function shouldCountAsOperatingIncome(type: string, amount: number): boolean {
  if (isDebtTransaction(type)) return false;
  return amount > 0;
}

/**
 * shouldCountAsOperatingExpense
 * Counts real operating expenses while excluding loan principal repayment.
 * Emergency loan interest is a true expense and must remain in costs.
 */
function shouldCountAsOperatingExpense(type: string, amount: number): boolean {
  if (REAL_EXPENSE_TRANSACTION_TYPES.has(type)) return true;
  if (isDebtTransaction(type)) return false;
  return amount < 0;
}

/**
 * getTransactionTypeLabel
 * Returns a friendly label for known finance transaction types.
 */
function getTransactionTypeLabel(type: string, fallback?: string) {
  return transactionTypeLabels[type] || fallback || type.replace(/_/g, " ");
}

/**
 * formatCurrency
 * Formats a number as a USD currency string without decimals.
 */
function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

/**
 * formatSignedCurrency
 * Formats a number as a signed USD string, prefixing + for positive values.
 */
function formatSignedCurrency(value: number) {
  if (value > 0) return `+${formatCurrency(value)}`;
  if (value < 0) return `-${formatCurrency(Math.abs(value))}`;
  return formatCurrency(0);
}

/**
 * cn
 * Simple conditional class name joiner.
 */
function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/**
 * asArray
 * Safe helper to coerce an unknown value into an array of T.
 */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * asObject
 * Safe helper to coerce an unknown value into an object of type T with fallback.
 */
function asObject<T>(value: unknown, fallback: T): T {
  return value && typeof value === "object" ? (value as T) : fallback;
}

/**
 * asString
 * Safe helper to coerce an unknown value into a string with fallback.
 */
function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * asBoolean
 * Safe helper to coerce an unknown value into a boolean with fallback.
 */
function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * asNumber
 * Safe helper to coerce numbers or numeric strings into a number.
 */
function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const normalized = value.trim().replace(/[$€£,\s]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

/**
 * pickFinanceTotal
 * Uses an explicit non-zero total when supplied, otherwise falls back to a
 * transaction-derived total. This prevents the overview card from showing $0
 * when an optional overview RPC returns empty zero placeholders while the main
 * dashboard/finance payload still contains real transaction activity.
 */
function pickFinanceTotal(
  supplied: unknown,
  transactionTotal: number,
  finalFallback = 0,
): number {
  const parsed = asNumber(supplied, Number.NaN);

  if (Number.isFinite(parsed) && parsed !== 0) return parsed;
  if (Number.isFinite(transactionTotal) && transactionTotal !== 0) {
    return transactionTotal;
  }
  if (Number.isFinite(parsed)) return parsed;

  return finalFallback;
}

/**
 * stableStringify
 * Deterministic JSON stringify used for shallow change detection.
 */
function stableStringify(value: unknown) {
  return JSON.stringify(value);
}

/**
 * getMetadataValueFromObject
 * Returns a trimmed string value from a loose metadata object if present; otherwise null.
 */
function getMetadataValueFromObject(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * resolveMainSponsorLogoUrlFromDashboard
 * Extracts the best-guess logo URL for a signed main sponsor coming from the
 * sponsor dashboard payload, preferring direct logo_url and falling back to
 * metadata.logo_url when set.
 */
function resolveMainSponsorLogoUrlFromDashboard(
  signedSponsor: SignedSponsorForOverview | null | undefined,
): string | null {
  if (!signedSponsor) return null;

  const direct =
    typeof signedSponsor.logo_url === "string" ? signedSponsor.logo_url : null;
  const metaLogo = getMetadataValueFromObject(
    signedSponsor.metadata ?? null,
    "logo_url",
  );
  const finalUrl = direct || metaLogo;

  if (!finalUrl || finalUrl.trim().length === 0) return null;
  return finalUrl;
}

/**
 * formatGameDateShort
 * Converts an in-game ISO date like 2000-07-03 into 03/07, Season 1.
 */
function formatGameDateShort(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "";

  const year = Number(match[1]);
  const month = match[2];
  const day = match[3];
  const season = year - 1999;

  if (!Number.isFinite(year) || season < 1) return "";
  return `${day}/${month}, Season ${season}`;
}

/**
 * normalizeTransactionType
 * Ensures transaction type checks are consistent.
 */
function normalizeTransactionType(value: unknown): string {
  return asString(value).trim().toLowerCase();
}

/**
 * normalizeFinanceTransactionRows
 * Normalizes loose transaction rows into a consistent typed shape.
 */
function normalizeFinanceTransactionRows(
  value: unknown,
): TransactionSummaryItem[] {
  return asArray<Record<string, unknown>>(value)
    .map((row, index) => {
      const type = normalizeTransactionType(
        row.type ?? row.transaction_type ?? row.kind,
      );
      const rawLabel = asString(row.label ?? row.title ?? row.name);
      const amount = asNumber(
        row.amount ??
          row.amount_cash ??
          row.cash_amount ??
          row.netAmount ??
          row.net_amount ??
          row.total ??
          row.total_amount ??
          row.value ??
          row.delta ??
          row.cash_delta ??
          row.signed_amount,
        0,
      );

      if (!type && !rawLabel) return null;

      return {
        id: asString(
          row.id ?? row.transaction_id,
          `${type || "transaction"}:${index}`,
        ),
        type,
        label: getTransactionTypeLabel(type, rawLabel),
        amount,
      };
    })
    .filter((row): row is TransactionSummaryItem => Boolean(row));
}

/**
 * buildOperatingTransactionSummary
 * Builds frontend operating finance summaries from raw transaction rows.
 *
 * Important:
 * - Emergency loan disbursement is excluded from income.
 * - Emergency loan principal repayment is excluded from costs.
 * - Emergency loan interest remains a real operating expense.
 * - Displayed amounts keep their real signed value.
 */
function buildOperatingTransactionSummary(rows: TransactionSummaryItem[]) {
  const topOperatingIncomes = rows
    .filter((row) => shouldCountAsOperatingIncome(row.type, row.amount))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5);

  const topOperatingExpenses = rows
    .filter((row) => shouldCountAsOperatingExpense(row.type, row.amount))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5);

  const debtMovements = rows
    .filter((row) => isDebtTransaction(row.type))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5);

  return {
    monthlyOperatingIncome: topOperatingIncomes.reduce(
      (sum, row) => sum + row.amount,
      0,
    ),
    monthlyOperatingExpense: topOperatingExpenses.reduce(
      (sum, row) => sum + row.amount,
      0,
    ),
    topOperatingIncomes,
    topOperatingExpenses,
    debtMovements,
  };
}

/**
 * normalizeFinanceHealth
 * Normalizes finance payload and applies loan-aware operating transaction rules.
 */
function normalizeFinanceHealth(
  value: unknown,
  fallbackTransactions?: unknown,
): FinanceHealth {
  const safe = asObject<Record<string, unknown>>(value, {});

  const rawTransactions =
    safe.monthlyTransactions ??
    safe.monthly_transactions ??
    safe.statementRows ??
    safe.statement_rows ??
    safe.transactions ??
    fallbackTransactions ??
    [];

  const transactionRows = normalizeFinanceTransactionRows(rawTransactions);
  const summary = buildOperatingTransactionSummary(transactionRows);

  const suppliedTopIncomes = normalizeFinanceTransactionRows(
    safe.topOperatingIncomes ??
      safe.top_operating_incomes ??
      safe.topIncomes ??
      safe.top_incomes,
  ).filter((row) => shouldCountAsOperatingIncome(row.type, row.amount));

  const suppliedTopExpenses = normalizeFinanceTransactionRows(
    safe.topOperatingExpenses ??
      safe.top_operating_expenses ??
      safe.topCosts ??
      safe.top_costs ??
      safe.topExpenses ??
      safe.top_expenses,
  ).filter((row) => shouldCountAsOperatingExpense(row.type, row.amount));

  const suppliedDebtMovements = normalizeFinanceTransactionRows(
    safe.debtMovements ??
      safe.debt_movements ??
      safe.debtItems ??
      safe.debt_items,
  ).filter((row) => isDebtTransaction(row.type));

  const suppliedMonthlyIncome =
    safe.monthlyOperatingIncome ?? safe.monthly_operating_income;
  const suppliedMonthlyExpense =
    safe.monthlyOperatingExpense ?? safe.monthly_operating_expense;

  const monthlyOperatingIncome = pickFinanceTotal(
    suppliedMonthlyIncome,
    summary.monthlyOperatingIncome,
    asNumber(safe.sponsorIncome ?? safe.sponsor_income, 0),
  );

  const monthlyOperatingExpense = pickFinanceTotal(
    suppliedMonthlyExpense,
    summary.monthlyOperatingExpense,
    0,
  );

  return {
    balance: asNumber(safe.balance, 0),
    weeklyNet: asNumber(safe.weeklyNet ?? safe.weekly_net, 0),
    sponsorIncome: asNumber(safe.sponsorIncome ?? safe.sponsor_income, 0),
    recurringPolicyCost: asNumber(
      safe.recurringPolicyCost ?? safe.recurring_policy_cost,
      0,
    ),
    nextTripForecast: asNumber(
      safe.nextTripForecast ?? safe.next_trip_forecast,
      0,
    ),
    latestTransactionLabel: asString(
      safe.latestTransactionLabel ?? safe.latest_transaction_label,
      "No transactions",
    ),
    latestTransactionAmount: asNumber(
      safe.latestTransactionAmount ?? safe.latest_transaction_amount,
      0,
    ),
    weeklyOperatingIncome: pickFinanceTotal(
      safe.weeklyOperatingIncome ?? safe.weekly_operating_income,
      0,
      Math.round(monthlyOperatingIncome / 4),
    ),
    weeklyOperatingExpense: pickFinanceTotal(
      safe.weeklyOperatingExpense ?? safe.weekly_operating_expense,
      0,
      Math.round(monthlyOperatingExpense / 4),
    ),
    monthlyOperatingIncome,
    monthlyOperatingExpense,
    seasonOperatingIncome: pickFinanceTotal(
      safe.seasonOperatingIncome ?? safe.season_operating_income,
      0,
      monthlyOperatingIncome,
    ),
    seasonOperatingExpense: pickFinanceTotal(
      safe.seasonOperatingExpense ?? safe.season_operating_expense,
      0,
      monthlyOperatingExpense,
    ),
    topOperatingIncomes:
      suppliedTopIncomes.length > 0
        ? suppliedTopIncomes
        : summary.topOperatingIncomes,
    topOperatingExpenses:
      suppliedTopExpenses.length > 0
        ? suppliedTopExpenses
        : summary.topOperatingExpenses,
    debtMovements:
      suppliedDebtMovements.length > 0
        ? suppliedDebtMovements
        : summary.debtMovements,
  };
}

type OverviewFinanceStatementRow = Record<string, unknown>;

function extractFinanceStatementRows(
  value: unknown,
): OverviewFinanceStatementRow[] {
  if (Array.isArray(value)) return value as OverviewFinanceStatementRow[];

  const safe = asObject<Record<string, unknown>>(value, {});

  return asArray<OverviewFinanceStatementRow>(
    safe.rows ??
      safe.data ??
      safe.transactions ??
      safe.statementRows ??
      safe.statement_rows ??
      safe.items,
  );
}

function getFinanceStatementDate(
  row: OverviewFinanceStatementRow,
): Date | null {
  const raw = asString(
    row.occurred_at ?? row.transaction_date ?? row.date ?? row.created_at,
    "",
  );

  if (!raw) return null;

  const value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseFinanceGameDateValue(value: unknown): Date | null {
  if (!value) return null;

  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    const nestedDate = parseFinanceGameDateValue(
      record.game_date ?? record.in_game_date ?? record.date,
    );
    if (nestedDate) return nestedDate;

    const season = asNumber(record.season, 0);
    const month = asNumber(record.month, 0);
    const day = asNumber(record.day, 0);

    if (season > 0 && month > 0 && day > 0) {
      return new Date(Date.UTC(1999 + season, month - 1, day, 0, 0, 0, 0));
    }
  }

  return null;
}

function getFinanceStatementGameDate(
  row: OverviewFinanceStatementRow,
): Date | null {
  const metadata = asObject<Record<string, unknown>>(row.metadata, {});

  return (
    parseFinanceGameDateValue(row.game_date) ??
    parseFinanceGameDateValue(metadata.game_date) ??
    parseFinanceGameDateValue(metadata.in_game_date) ??
    parseFinanceGameDateValue(metadata.submitted_on_game_date) ??
    parseFinanceGameDateValue(metadata.due_game_date) ??
    parseFinanceGameDateValue(metadata.started_game_date) ??
    parseFinanceGameDateValue(metadata.complete_game_date) ??
    null
  );
}

function getFinanceStatementType(row: OverviewFinanceStatementRow): string {
  return normalizeTransactionType(row.type ?? row.transaction_type ?? row.kind);
}

function getFinanceStatementSignedAmount(
  row: OverviewFinanceStatementRow,
): number {
  const hasNetAmount = row.net_amount !== null && row.net_amount !== undefined;

  const amount = asNumber(
    hasNetAmount
      ? row.net_amount
      : (row.amount ??
          row.amount_cash ??
          row.cash_amount ??
          row.total_amount ??
          row.signed_amount ??
          row.value),
    0,
  );

  const direction = asString(row.direction, "").toLowerCase();

  if (!hasNetAmount && direction === "expense" && amount > 0) {
    return -amount;
  }

  if (!hasNetAmount && direction === "income" && amount < 0) {
    return Math.abs(amount);
  }

  return amount;
}

function isDateInInclusiveRange(date: Date, start: Date, end: Date): boolean {
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function buildFinancePeriodSummaryFromStatementRows(
  rows: OverviewFinanceStatementRow[],
  seasonYear: number,
): Partial<FinancePeriodSummary> | null {
  const datedRows = rows
    .map((row) => ({
      row,
      date: getFinanceStatementDate(row),
      gameDate: getFinanceStatementGameDate(row),
    }))
    .filter(
      (
        item,
      ): item is {
        row: OverviewFinanceStatementRow;
        date: Date;
        gameDate: Date | null;
      } => Boolean(item.date),
    );

  if (datedRows.length === 0) return null;

  const latestDateMs = Math.max(
    ...datedRows.map((item) => item.date.getTime()),
  );
  if (!Number.isFinite(latestDateMs)) return null;

  const end = new Date(latestDateMs);
  end.setUTCHours(23, 59, 59, 999);

  const weekStart = new Date(end.getTime());
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  weekStart.setUTCHours(0, 0, 0, 0);

  const monthStart = new Date(end.getTime());
  monthStart.setUTCDate(monthStart.getUTCDate() - 29);
  monthStart.setUTCHours(0, 0, 0, 0);

  const seasonStart = new Date(Date.UTC(seasonYear, 0, 1, 0, 0, 0, 0));
  const seasonEnd = new Date(Date.UTC(seasonYear, 11, 31, 23, 59, 59, 999));

  const totalsFor = (
    start: Date | null,
    rangeEnd: Date | null,
    dateSelector: (item: {
      row: OverviewFinanceStatementRow;
      date: Date;
      gameDate: Date | null;
    }) => Date | null,
  ) => {
    let income = 0;
    let expenses = 0;

    for (const item of datedRows) {
      const selectedDate = dateSelector(item);
      if (!selectedDate) continue;

      if (
        start &&
        rangeEnd &&
        !isDateInInclusiveRange(selectedDate, start, rangeEnd)
      ) {
        continue;
      }

      const type = getFinanceStatementType(item.row);
      const amount = getFinanceStatementSignedAmount(item.row);

      if (shouldCountAsOperatingIncome(type, amount)) {
        income += amount;
      }

      if (shouldCountAsOperatingExpense(type, amount)) {
        expenses += Math.abs(amount);
      }
    }

    return { income, expenses };
  };

  const week = totalsFor(weekStart, end, (item) => item.date);
  const month = totalsFor(monthStart, end, (item) => item.date);

  let season = totalsFor(
    seasonStart,
    seasonEnd,
    (item) => item.gameDate ?? null,
  );

  if (season.income === 0 && season.expenses === 0) {
    season = totalsFor(null, null, (item) => item.date);
  }

  const values = [
    week.income,
    week.expenses,
    month.income,
    month.expenses,
    season.income,
    season.expenses,
  ];

  if (!values.some((value) => Math.abs(value) > 0)) return null;

  return {
    weeklyOperatingIncome: week.income,
    weeklyOperatingExpense: week.expenses,
    monthlyOperatingIncome: month.income,
    monthlyOperatingExpense: month.expenses,
    seasonOperatingIncome: season.income,
    seasonOperatingExpense: season.expenses,
  };
}

async function loadOverviewFinanceStatementPeriodSummary(
  mainClubId: string | null,
  seasonYear: number,
): Promise<Partial<FinancePeriodSummary> | null> {
  if (!mainClubId) return null;

  const statementSources: Array<{
    functionName: string;
    args: Record<string, unknown>;
  }> = [
    {
      functionName: "finance_get_club_statement_v2",
      args: {
        p_club_id: mainClubId,
        p_limit: 10000,
        p_before: "2100-01-01T00:00:00+00:00",
      },
    },
    {
      functionName: "finance_get_club_statement_admin",
      args: {
        p_club_id: mainClubId,
        p_limit: 10000,
        p_before: "2100-01-01T00:00:00+00:00",
      },
    },
    {
      functionName: "finance_get_club_statement",
      args: {
        p_club_id: mainClubId,
        p_limit: 10000,
        p_before: "2100-01-01T00:00:00+00:00",
      },
    },
  ];

  for (const source of statementSources) {
    try {
      const { data, error } = await supabase.rpc(
        source.functionName,
        source.args,
      );

      if (error) {
        console.warn(
          `Could not load overview finance statement from ${source.functionName}:`,
          error.message,
        );
        continue;
      }

      const rows = extractFinanceStatementRows(data);
      const summary = buildFinancePeriodSummaryFromStatementRows(
        rows,
        seasonYear,
      );

      if (summary) {
        return summary;
      }
    } catch (err) {
      console.warn(
        `Overview finance statement lookup failed for ${source.functionName}:`,
        err,
      );
    }
  }

  return null;
}

/**
 * normalizeEmergencyDebt
 * Normalizes emergency-loan debt data from either top-level payload or finance payload.
 */
function normalizeEmergencyDebt(
  value: unknown,
  financeSafe: Record<string, unknown>,
): EmergencyDebtHealth {
  const safe = asObject<Record<string, unknown>>(
    value ??
      financeSafe.emergencyDebt ??
      financeSafe.emergency_debt ??
      financeSafe.debt ??
      {},
    {},
  );

  const rescuesUsed = asNumber(
    safe.rescuesUsed ??
      safe.rescues_used ??
      safe.emergencyRescueCount ??
      safe.emergency_rescue_count ??
      financeSafe.rescuesUsed ??
      financeSafe.rescues_used ??
      financeSafe.emergencyRescueCount ??
      financeSafe.emergency_rescue_count,
    0,
  );

  const rescueLimit = asNumber(
    safe.rescueLimit ??
      safe.rescue_limit ??
      safe.maxRescues ??
      safe.max_rescues ??
      financeSafe.rescueLimit ??
      financeSafe.rescue_limit ??
      financeSafe.maxRescues ??
      financeSafe.max_rescues,
    3,
  );

  const outstandingPrincipal = asNumber(
    safe.outstandingPrincipal ??
      safe.outstanding_principal ??
      safe.activeOutstandingPrincipal ??
      safe.active_outstanding_principal ??
      financeSafe.outstandingPrincipal ??
      financeSafe.outstanding_principal ??
      financeSafe.activeOutstandingPrincipal ??
      financeSafe.active_outstanding_principal,
    0,
  );

  const nextRepaymentAmount = asNumber(
    safe.nextRepaymentAmount ??
      safe.next_repayment_amount ??
      safe.actualWeeklyDueOptionB ??
      safe.actual_weekly_due_option_b ??
      safe.weeklyDue ??
      safe.weekly_due ??
      financeSafe.nextRepaymentAmount ??
      financeSafe.next_repayment_amount ??
      financeSafe.actualWeeklyDueOptionB ??
      financeSafe.actual_weekly_due_option_b,
    0,
  );

  const nextRepaymentDateRaw = asString(
    safe.nextRepaymentDate ??
      safe.next_repayment_date ??
      safe.nextUnprocessedDueGameDate ??
      safe.next_unprocessed_due_game_date ??
      financeSafe.nextRepaymentDate ??
      financeSafe.next_repayment_date ??
      financeSafe.nextUnprocessedDueGameDate ??
      financeSafe.next_unprocessed_due_game_date,
    "",
  );

  const nextRepaymentDateLabel =
    asString(
      safe.nextRepaymentDateLabel ??
        safe.next_repayment_date_label ??
        financeSafe.nextRepaymentDateLabel ??
        financeSafe.next_repayment_date_label,
      "",
    ) ||
    formatGameDateShort(nextRepaymentDateRaw) ||
    "No repayment scheduled";

  const totalEmergencyLoanDisbursed = asNumber(
    safe.totalEmergencyLoanDisbursed ??
      safe.total_emergency_loan_disbursed ??
      safe.emergencyLoanDisbursed ??
      safe.emergency_loan_disbursed ??
      financeSafe.totalEmergencyLoanDisbursed ??
      financeSafe.total_emergency_loan_disbursed,
    outstandingPrincipal,
  );

  const totalPrincipalRepaid = asNumber(
    safe.totalPrincipalRepaid ??
      safe.total_principal_repaid ??
      safe.principalRepaid ??
      safe.principal_repaid ??
      financeSafe.totalPrincipalRepaid ??
      financeSafe.total_principal_repaid,
    0,
  );

  const totalInterestPaid = asNumber(
    safe.totalInterestPaid ??
      safe.total_interest_paid ??
      safe.interestPaid ??
      safe.interest_paid ??
      financeSafe.totalInterestPaid ??
      financeSafe.total_interest_paid,
    0,
  );

  const liquidationRisk =
    asString(
      safe.liquidationRisk ??
        safe.liquidation_risk ??
        financeSafe.liquidationRisk ??
        financeSafe.liquidation_risk,
      "",
    ) ||
    (outstandingPrincipal > 0 && rescuesUsed >= 2
      ? "High"
      : outstandingPrincipal > 0
        ? "Medium"
        : "Low");

  return {
    rescuesUsed,
    rescueLimit,
    outstandingPrincipal,
    nextRepaymentAmount,
    nextRepaymentDateLabel,
    liquidationRisk,
    totalEmergencyLoanDisbursed,
    totalPrincipalRepaid,
    totalInterestPaid,
  };
}

/**
 * buildDebtMovementsFromEmergencyDebt
 * Creates debt movement rows for the Emergency Debt card when the RPC sends
 * aggregated debt totals instead of transaction rows.
 */
function buildDebtMovementsFromEmergencyDebt(
  debt: EmergencyDebtHealth,
  financeDebtMovements: TransactionSummaryItem[],
): TransactionSummaryItem[] {
  if (financeDebtMovements.length > 0) return financeDebtMovements;

  const rows: TransactionSummaryItem[] = [];

  if (debt.totalEmergencyLoanDisbursed !== 0) {
    rows.push({
      id: "emergency_loan_disbursement",
      type: "emergency_loan_disbursement",
      label: transactionTypeLabels.emergency_loan_disbursement,
      amount: Math.abs(debt.totalEmergencyLoanDisbursed),
    });
  }

  if (debt.totalPrincipalRepaid !== 0) {
    rows.push({
      id: "emergency_loan_principal_repayment",
      type: "emergency_loan_principal_repayment",
      label: transactionTypeLabels.emergency_loan_principal_repayment,
      amount:
        debt.totalPrincipalRepaid > 0
          ? -Math.abs(debt.totalPrincipalRepaid)
          : debt.totalPrincipalRepaid,
    });
  }

  if (debt.totalInterestPaid !== 0) {
    rows.push({
      id: "emergency_loan_interest",
      type: "emergency_loan_interest",
      label: transactionTypeLabels.emergency_loan_interest,
      amount:
        debt.totalInterestPaid > 0
          ? -Math.abs(debt.totalInterestPaid)
          : debt.totalInterestPaid,
    });
  }

  return rows;
}

/**
 * normalizeMainSponsor
 * Normalizes a loose main sponsor-like value into the MainSponsor type.
 */
function normalizeMainSponsor(
  value: unknown,
  fallbackIsActive = false,
): MainSponsor {
  const safe = asObject<Record<string, unknown>>(value, {});
  const metadata = asObject<Record<string, unknown>>(safe.metadata, {});
  const branding = asObject<Record<string, unknown>>(safe.branding, {});

  const name =
    asString(safe.name) ||
    asString(safe.companyName) ||
    asString(safe.company_name) ||
    asString(metadata.company_name) ||
    "Main Sponsor";

  const logoUrl =
    asString(safe.logoUrl) ||
    asString(safe.logo_url) ||
    asString(safe.logo) ||
    asString(safe.imageUrl) ||
    asString(safe.image_url) ||
    asString(safe.company_logo_url) ||
    asString(safe.companyLogoUrl) ||
    asString(metadata.logo_url) ||
    asString(metadata.logoUrl) ||
    asString(branding.logo_url) ||
    asString(branding.logoUrl);

  const subtitle =
    asString(safe.subtitle) ||
    (logoUrl ? "Signed main sponsor deal" : "No main sponsor deal signed yet.");

  const href = asString(safe.href, "#/dashboard/finance");
  const status = asString(safe.status).toLowerCase();
  const isSignedByStatus =
    status === "signed" ||
    status === "active" ||
    status === "running" ||
    status === "current";

  const isActive = asBoolean(
    safe.isActive,
    asBoolean(
      safe.is_active,
      asBoolean(
        safe.isSigned,
        asBoolean(
          safe.signed,
          Boolean(logoUrl) || isSignedByStatus || fallbackIsActive,
        ),
      ),
    ),
  );

  return {
    name,
    logoUrl,
    subtitle,
    href,
    isActive,
  };
}

function normalizeDashboardPayload(payload: unknown): DashboardOverviewData {
  const safe = asObject<Record<string, unknown>>(payload, {});
  const financeSafe = asObject<Record<string, unknown>>(safe.finance, {});

  const fallbackMainSponsor =
    safe.mainSponsor ??
    safe.main_sponsor ??
    safe.mainSponsorCompany ??
    safe.main_sponsor_company ??
    safe.sponsor ??
    safe.primarySponsor;

  const finance = normalizeFinanceHealth(
    safe.finance,
    safe.transactions ?? safe.statementRows ?? safe.statement_rows,
  );

  const emergencyDebt = normalizeEmergencyDebt(
    safe.emergencyDebt ?? safe.emergency_debt ?? safe.debt,
    financeSafe,
  );

  const mainSponsorSignedHint =
    asBoolean(safe.mainSponsorSigned) ||
    asBoolean(safe.main_sponsor_signed) ||
    asBoolean(safe.hasMainSponsor) ||
    asBoolean(safe.has_main_sponsor) ||
    asBoolean(financeSafe.mainSponsorSigned) ||
    asBoolean(financeSafe.main_sponsor_signed) ||
    asBoolean(financeSafe.hasMainSponsor) ||
    asBoolean(financeSafe.has_main_sponsor) ||
    asBoolean(financeSafe.mainSponsorActive) ||
    asBoolean(financeSafe.main_sponsor_active);

  return {
    club: asObject(safe.club, {
      id: "",
      name: "Club",
      handle: "Manager",
      countryCode: "",
      tier: "",
      division: "",
      seasonLabel: "Season 1",
      dateLabel: "",
      weatherLabel: "",
      rankLabel: "-",
      inboxUnread: 0,
      notificationsUnread: 0,
    }),
    alerts: asArray<AlertItem>(safe.alerts),
    kpis: asArray<KpiItem>(safe.kpis),
    operations: asArray<OperationItem>(safe.operations),
    squadPulse: asObject(safe.squadPulse, {
      fitness: 0,
      morale: 0,
      readiness: 0,
      form: "+0",
      availableRiders: 0,
      injured: 0,
      sick: 0,
      notFullyFit: 0,
      expiringContracts: 0,
    }),
    schedule: asArray<ScheduleItem>(safe.schedule),
    dayRaces: asArray<DayRaceItem>(safe.dayRaces),
    news: asArray<NewsItem>(safe.news),
    feed: asArray<FeedItem>(safe.feed),
    finance,
    emergencyDebt,
    quickActions: asArray<QuickActionItem>(safe.quickActions),
    mainSponsor: normalizeMainSponsor(
      fallbackMainSponsor ??
        financeSafe.mainSponsor ??
        financeSafe.main_sponsor,
      mainSponsorSignedHint,
    ),
  };
}

/**
 * getSeasonYearFromOverview
 * Converts "Season 1" into DB season_year 2000, "Season 2" into 2001, etc.
 */
function getSeasonYearFromOverview(data: DashboardOverviewData): number {
  const seasonText = `${data.club.seasonLabel} ${data.club.dateLabel}`;
  const match = /season\s*(\d+)/i.exec(seasonText);
  const seasonNumber = match ? Number(match[1]) : 1;

  return Number.isFinite(seasonNumber) && seasonNumber > 0
    ? 1999 + seasonNumber
    : 2000;
}

/**
 * countryCodeToFlagEmoji
 * Converts an ISO alpha-2 country code into a flag emoji.
 */
function countryCodeToFlagEmoji(countryCode?: string | null): string {
  const code = (countryCode ?? "").trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) return "";

  return Array.from(code)
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function inferCountryCodeFromRaceTitle(title?: string | null): string | null {
  const value = (title ?? "").toLowerCase();

  if (!value) return null;
  if (value.includes("black river gorges") || value.includes("mauritius"))
    return "MU";
  if (value.includes("guadeloupe")) return "GP";
  if (value.includes("namib")) return "NA";
  if (value.includes("faso")) return "BF";
  if (value.includes("israel") || value.includes("tel aviv")) return "IL";
  if (
    value.includes("dalmaciji") ||
    value.includes("dalmacija") ||
    value.includes("cro tour") ||
    value.includes("croatia")
  )
    return "HR";
  if (
    value.includes("perth") ||
    value.includes("hamilton to auckland") ||
    value.includes("victoria")
  )
    return "AU";
  if (value.includes("cape winelands") || value.includes("stellenbosch"))
    return "ZA";
  if (value.includes("zanzibar")) return "TZ";
  if (value.includes("fuerteventura")) return "ES";
  if (value.includes("aruba")) return "AW";
  if (value.includes("kingston") || value.includes("kings avenue")) return "JM";
  if (value.includes("veneto") || value.includes("giro del veneto"))
    return "IT";
  if (value.includes("montenegro")) return "ME";
  if (value.includes("guatemala")) return "GT";
  if (value.includes("rio")) return "BR";

  return null;
}

/**
 * formatShortOverviewDate
 * Converts 2000-11-02 into Nov 02 for compact race strips.
 */
function formatShortOverviewDate(value?: string | null): string {
  if (!value) return "—";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;

  const monthIndex = Number(match[2]) - 1;
  const day = match[3];
  const months = [
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

  return `${months[monthIndex] ?? match[2]} ${day}`;
}

/**
 * normalizeOverviewRaceBase
 * Shared race metadata normalizer for squad-dashboard last/next race blocks.
 */
function normalizeOverviewRaceBase(
  value: Record<string, unknown>,
  squadLabel: string,
): OverviewRaceBase {
  return {
    squadLabel,
    raceId: asString(value.raceId ?? value.race_id, "") || null,
    raceName: asString(value.raceName ?? value.race_name, "") || null,
    raceCategory:
      asString(value.raceCategory ?? value.race_category, "") || null,
    raceCountryCode:
      asString(value.raceCountryCode ?? value.race_country_code, "") || null,
    stageDate: asString(value.stageDate ?? value.stage_date, "") || null,
    stageLabel: asString(value.stageLabel ?? value.stage_label, "") || null,
    routeLabel: asString(value.routeLabel ?? value.route_label, "") || null,
    stageCount: asNumber(value.stageCount ?? value.stage_count, 0),
  };
}

/**
 * normalizeOverviewNextRace
 * Converts the squad dashboard RPC payload into a compact next race widget payload.
 */
function normalizeOverviewNextRace(
  payload: unknown,
  squadLabel: string,
): OverviewNextTeamRace | null {
  const safePayload = Array.isArray(payload) ? payload[0] : payload;
  const safe = asObject<Record<string, unknown>>(safePayload, {});
  const nextRace = asObject<Record<string, unknown>>(
    safe.nextRaceSelection ?? safe.next_race_selection ?? {},
    {},
  );
  const rows = asArray<Record<string, unknown>>(nextRace.rows).map(
    (row, index) => ({
      riderId: asString(row.riderId ?? row.rider_id, `next-rider:${index}`),
      riderName: asString(row.riderName ?? row.rider_name, "Unnamed rider"),
      role: asString(row.role, "") || null,
      raceSharpness:
        row.raceSharpness === null || row.raceSharpness === undefined
          ? null
          : asNumber(row.raceSharpness ?? row.race_sharpness, 0),
      raceSharpnessLabel:
        asString(row.raceSharpnessLabel ?? row.race_sharpness_label, "") ||
        null,
    }),
  );

  const base = normalizeOverviewRaceBase(nextRace, squadLabel);

  if (!base.raceName && rows.length === 0) return null;

  return {
    ...base,
    rows,
  };
}

/**
 * normalizeOverviewLastRace
 * Converts the squad dashboard RPC payload into a compact last race widget payload.
 */
function normalizeOverviewLastRace(
  payload: unknown,
  squadLabel: string,
): OverviewLastTeamRace | null {
  const safePayload = Array.isArray(payload) ? payload[0] : payload;
  const safe = asObject<Record<string, unknown>>(safePayload, {});
  const lastRace = asObject<Record<string, unknown>>(
    safe.lastTeamRace ?? safe.last_team_race ?? {},
    {},
  );
  const rows = asArray<Record<string, unknown>>(lastRace.rows).map(
    (row, index) => ({
      riderId: asString(row.riderId ?? row.rider_id, `last-rider:${index}`),
      riderName: asString(row.riderName ?? row.rider_name, "Unnamed rider"),
      role: asString(row.role, "") || null,
      position:
        row.position === null || row.position === undefined
          ? null
          : asNumber(row.position ?? row.finish_position, 0),
      resultLabel:
        asString(row.resultLabel ?? row.result_label, "") ||
        formatOrdinal(asNumber(row.position ?? row.finish_position, 0)),
      points: asNumber(
        row.points ?? row.international_points ?? row.rider_points,
        0,
      ),
    }),
  );

  const base = normalizeOverviewRaceBase(lastRace, squadLabel);

  if (!base.raceName && rows.length === 0) return null;

  return {
    ...base,
    rows,
  };
}

/**
 * loadOverviewTeamRaceHub
 * Loads the latest completed race and earliest submitted race selection across
 * first squad and developing squads.
 */
async function loadCurrentGameDateOnly(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("get_current_game_date_date");

    if (error) {
      console.warn(
        "Could not load current game date for overview race hub:",
        error.message,
      );
      return null;
    }

    return asString(data, "") || null;
  } catch (err) {
    console.warn("Current game date lookup failed for overview race hub:", err);
    return null;
  }
}

function compareDateOnly(left?: string | null, right?: string | null): number {
  const leftTime = left ? Date.parse(`${left}T00:00:00`) : Number.NaN;
  const rightTime = right ? Date.parse(`${right}T00:00:00`) : Number.NaN;

  if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
  if (!Number.isFinite(leftTime)) return -1;
  if (!Number.isFinite(rightTime)) return 1;

  return leftTime - rightTime;
}

function isDateAfter(left?: string | null, right?: string | null): boolean {
  return compareDateOnly(left, right) > 0;
}

function isDateBefore(left?: string | null, right?: string | null): boolean {
  return compareDateOnly(left, right) < 0;
}

function normalizeRaceStatusForOverview(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function isFinishedRaceStatusForOverview(value?: string | null): boolean {
  const normalized = normalizeRaceStatusForOverview(value);

  return (
    normalized === "completed" ||
    normalized === "archived" ||
    normalized === "finished" ||
    normalized === "race_finished" ||
    normalized === "race_completed"
  );
}

function isActiveOrClosedRaceStatusForOverview(value?: string | null): boolean {
  const normalized = normalizeRaceStatusForOverview(value);

  return (
    normalized === "active" ||
    normalized === "running" ||
    normalized === "started" ||
    normalized === "live" ||
    normalized === "completed" ||
    normalized === "archived" ||
    normalized === "finished" ||
    normalized === "race_finished" ||
    normalized === "race_completed" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  );
}

function isSubmittedRacePreparationStatus(value?: string | null): boolean {
  const normalized = (value ?? "").trim().toLowerCase();

  return (
    normalized === "submitted" ||
    normalized === "finalised" ||
    normalized === "finalized" ||
    normalized === "locked"
  );
}

function buildOverviewRaceFromRaceRow(
  race: Record<string, unknown>,
  squadLabel: string,
  dateKey: "start_date" | "end_date",
): OverviewRaceBase {
  const raceId = asString(race.id, "") || null;
  const raceName = asString(race.name ?? race.short_name, "") || null;
  const stageCount = asNumber(race.stage_count, 0);

  return {
    squadLabel,
    raceId,
    raceName,
    raceCategory: asString(race.category, "") || null,
    raceCountryCode: asString(race.country_code, "") || null,
    stageDate: asString(race[dateKey], "") || null,
    stageLabel:
      stageCount && stageCount > 1 ? `${stageCount} stages` : "One-day race",
    routeLabel: null,
    stageCount,
  };
}

/**
 * loadOverviewTeamRaceHub
 * Loads race hub cards with strict timeline rules:
 * - Next Team Race = first accepted/submitted race whose race start date is after the current game date.
 *   Current-day active races are not considered next.
 * - Last Team Race = latest finished full race whose race end date is before the current game date
 *   and where the first team or developing team has persisted results.
 */
async function loadOverviewTeamRaceHub(
  mainClubId: string | null,
  seasonYear: number,
): Promise<OverviewTeamRaceHub> {
  void seasonYear;

  const emptyHub: OverviewTeamRaceHub = {
    lastTeamRace: null,
    nextTeamRace: null,
  };

  if (!mainClubId) return emptyHub;

  const currentGameDate = await loadCurrentGameDateOnly();

  if (!currentGameDate) {
    return emptyHub;
  }

  const candidateClubs: Array<{ id: string; label: string }> = [
    { id: mainClubId, label: "First Squad" },
  ];

  try {
    const { data: developingClubs, error: developingError } = await supabase
      .from("clubs")
      .select("id, name")
      .eq("parent_club_id", mainClubId)
      .eq("club_type", "developing");

    if (developingError) {
      console.warn(
        "Could not load developing club for overview race hub:",
        developingError.message,
      );
    } else {
      for (const club of asArray<Record<string, unknown>>(developingClubs)) {
        const id = asString(club.id);
        if (id) {
          candidateClubs.push({
            id,
            label: asString(club.name, "Developing Team"),
          });
        }
      }
    }
  } catch (err) {
    console.warn("Developing club lookup failed for overview race hub:", err);
  }

  const clubIds = candidateClubs.map((club) => club.id).filter(Boolean);
  const clubLabelById = new Map(
    candidateClubs.map((club) => [club.id, club.label]),
  );

  if (clubIds.length === 0) return emptyHub;

  try {
    const { data: entryData, error: entryError } = await supabase
      .from("race_team_entries")
      .select("id, race_id, club_id, status")
      .in("club_id", clubIds)
      .eq("status", "accepted");

    if (entryError) {
      console.warn(
        "Could not load accepted race entries for overview race hub:",
        entryError.message,
      );
      return emptyHub;
    }

    const entries = asArray<Record<string, unknown>>(entryData);
    const raceIds = Array.from(
      new Set(
        entries.map((entry) => asString(entry.race_id, "")).filter(Boolean),
      ),
    );

    if (raceIds.length === 0) return emptyHub;

    const [
      { data: preparationData, error: preparationError },
      { data: raceData, error: raceError },
    ] = await Promise.all([
      supabase
        .from("race_preparations")
        .select("id, race_id, club_id, status, startlist_status")
        .in("club_id", clubIds)
        .in("race_id", raceIds),
      supabase
        .from("races")
        .select(
          "id, name, short_name, category, country_code, start_date, end_date, stage_count, is_stage_race, status",
        )
        .in("id", raceIds),
    ]);

    if (preparationError) {
      console.warn(
        "Could not load race preparations for overview race hub:",
        preparationError.message,
      );
    }

    if (raceError) {
      console.warn(
        "Could not load races for overview race hub:",
        raceError.message,
      );
      return emptyHub;
    }

    const preparations = asArray<Record<string, unknown>>(preparationData);
    const races = asArray<Record<string, unknown>>(raceData);
    const raceById = new Map(
      races.map((race) => [asString(race.id, ""), race]),
    );
    const preparationByClubRace = new Map(
      preparations.map((preparation) => [
        `${asString(preparation.club_id, "")}:${asString(preparation.race_id, "")}`,
        preparation,
      ]),
    );

    const submittedEntries = entries.filter((entry) => {
      const prep = preparationByClubRace.get(
        `${asString(entry.club_id, "")}:${asString(entry.race_id, "")}`,
      );

      return Boolean(
        prep &&
        (isSubmittedRacePreparationStatus(asString(prep.status, "")) ||
          isSubmittedRacePreparationStatus(
            asString(prep.startlist_status, ""),
          )),
      );
    });

    const nextEntries = submittedEntries
      .map((entry) => {
        const race = raceById.get(asString(entry.race_id, ""));
        const clubId = asString(entry.club_id, "");

        if (!race) return null;
        if (!isDateAfter(asString(race.start_date, ""), currentGameDate))
          return null;
        if (isActiveOrClosedRaceStatusForOverview(asString(race.status, "")))
          return null;

        return {
          entry,
          race,
          clubId,
          startDate: asString(race.start_date, ""),
        };
      })
      .filter(
        (
          item,
        ): item is {
          entry: Record<string, unknown>;
          race: Record<string, unknown>;
          clubId: string;
          startDate: string;
        } => Boolean(item),
      )
      .sort((left, right) => compareDateOnly(left.startDate, right.startDate));

    const finishedCandidateEntries = entries
      .map((entry) => {
        const race = raceById.get(asString(entry.race_id, ""));
        const clubId = asString(entry.club_id, "");

        if (!race) return null;

        const endDate = asString(race.end_date ?? race.start_date, "");
        const status = asString(race.status, "");
        const isFinishedByStatus = isFinishedRaceStatusForOverview(status);
        const isBeforeToday = isDateBefore(endDate, currentGameDate);

        if (!isFinishedByStatus && !isBeforeToday) return null;
        if (!isBeforeToday && !isFinishedByStatus) return null;

        return {
          entry,
          race,
          clubId,
          endDate,
        };
      })
      .filter(
        (
          item,
        ): item is {
          entry: Record<string, unknown>;
          race: Record<string, unknown>;
          clubId: string;
          endDate: string;
        } => Boolean(item),
      );

    let raceIdsWithTeamResults = new Set<string>();

    if (finishedCandidateEntries.length > 0) {
      try {
        const { data: resultData, error: resultError } = await supabase
          .from("race_stage_results")
          .select("race_id, team_id")
          .in(
            "race_id",
            Array.from(
              new Set(
                finishedCandidateEntries
                  .map((item) => asString(item.race.id, ""))
                  .filter(Boolean),
              ),
            ),
          )
          .in("team_id", clubIds);

        if (resultError) {
          console.warn(
            "Could not verify team results for overview last race:",
            resultError.message,
          );
        } else {
          raceIdsWithTeamResults = new Set(
            asArray<Record<string, unknown>>(resultData)
              .map((row) => asString(row.race_id, ""))
              .filter(Boolean),
          );
        }
      } catch (err) {
        console.warn("Team result lookup failed for overview last race:", err);
      }
    }

    const lastEntries = finishedCandidateEntries
      .filter(
        (item) =>
          raceIdsWithTeamResults.size === 0 ||
          raceIdsWithTeamResults.has(asString(item.race.id, "")),
      )
      .sort((left, right) => compareDateOnly(right.endDate, left.endDate));

    const nextTeamRace = nextEntries[0]
      ? {
          ...buildOverviewRaceFromRaceRow(
            nextEntries[0].race,
            clubLabelById.get(nextEntries[0].clubId) ?? "Team",
            "start_date",
          ),
          rows: [],
        }
      : null;

    const lastTeamRace = lastEntries[0]
      ? {
          ...buildOverviewRaceFromRaceRow(
            lastEntries[0].race,
            clubLabelById.get(lastEntries[0].clubId) ?? "Team",
            "end_date",
          ),
          rows: [],
        }
      : null;

    return {
      lastTeamRace,
      nextTeamRace,
    };
  } catch (err) {
    console.warn("Overview team race hub direct lookup failed:", err);
    return emptyHub;
  }
}

/**
 * normalizeOverviewRaceWorldData
 * Converts the overview race-world RPC into frontend rows.
 */
function normalizeOverviewRaceWorldData(value: unknown): OverviewRaceWorldData {
  const safe = asObject<Record<string, unknown>>(value, {});

  const upcomingSchedule = asArray<Record<string, unknown>>(
    safe.upcomingSchedule ?? safe.upcoming_schedule,
  ).map((row, index) => {
    const title = asString(row.title, "Upcoming race");
    const subtitle = asString(row.subtitle, "");
    const countryCode =
      asString(
        row.countryCode ??
          row.country_code ??
          row.raceCountryCode ??
          row.race_country_code ??
          row.country_iso2 ??
          row.country,
        "",
      ) || inferCountryCodeFromRaceTitle(`${title} ${subtitle}`);

    return {
      id: asString(row.id, `upcoming:${index}`),
      dateLabel: asString(row.dateLabel ?? row.date_label, ""),
      title,
      subtitle,
      countryCode: countryCode || null,
      href: asString(row.href, "") || undefined,
    };
  });

  const todayRaces = asArray<Record<string, unknown>>(
    safe.todayRaces ?? safe.today_races,
  ).map((row, index) => {
    const title = asString(row.title, "Race");
    const subtitle = asString(row.subtitle, "");
    const countryCode =
      asString(
        row.countryCode ??
          row.country_code ??
          row.raceCountryCode ??
          row.race_country_code ??
          row.country_iso2 ??
          row.country,
        "",
      ) || inferCountryCodeFromRaceTitle(`${title} ${subtitle}`);

    return {
      id: asString(row.id, `today:${index}`),
      title,
      subtitle,
      timeLabel: asString(row.timeLabel ?? row.time_label, ""),
      countryCode: countryCode || null,
      href: asString(row.href, "") || undefined,
    };
  });

  const worldNews = asArray<Record<string, unknown>>(
    safe.worldNews ?? safe.world_news,
  ).map((row, index) => ({
    id: asString(row.id, `world-news:${index}`),
    title: asString(row.title, "World news"),
    subtitle: asString(row.subtitle, ""),
    timeLabel: asString(row.timeLabel ?? row.time_label, ""),
    href: asString(row.href, "") || undefined,
    detail: asString(
      row.detail ?? row.details ?? row.long_text ?? row.longText,
      "",
    ),
    expandedText: asString(
      row.expandedText ?? row.expanded_text ?? row.description ?? row.body,
      "",
    ),
    sourceType: asString(row.sourceType ?? row.source_type ?? row.type, ""),
    relatedType: asString(
      row.relatedType ?? row.related_type ?? row.entity_type,
      "",
    ),
    relatedHref: asString(
      row.relatedHref ?? row.related_href ?? row.related_url,
      "",
    ),
  }));

  return {
    upcomingSchedule,
    todayRaces,
    worldNews,
  };
}

/**
 * loadOverviewRaceWorldData
 * Loads real accepted upcoming races, current-day races, and generated world news.
 *
 * This removes the old mock-like schedule fallback from the overview.
 */
async function loadOverviewRaceWorldData(
  mainClubId: string | null,
  seasonYear: number,
): Promise<OverviewRaceWorldData> {
  if (!mainClubId) return EMPTY_RACE_WORLD_DATA;

  try {
    const { data, error } = await supabase.rpc("get_overview_race_world_v1", {
      p_club_id: mainClubId,
      p_season_year: seasonYear,
    });

    if (error) {
      console.warn("Could not load overview race world data:", error.message);
      return EMPTY_RACE_WORLD_DATA;
    }

    return normalizeOverviewRaceWorldData(data);
  } catch (err) {
    console.warn("Overview race world lookup failed:", err);
    return EMPTY_RACE_WORLD_DATA;
  }
}

function normalizeOverviewActiveOperations(value: unknown): OperationItem[] {
  const rows = Array.isArray(value) ? value : [];

  return rows.map((entry, index) => {
    const row = asObject<Record<string, unknown>>(entry, {});
    const title = asString(row.title ?? row.name, "Active operation");
    const subtitle = asString(
      row.subtitle ?? row.summary ?? row.description,
      "",
    );
    const statusLabel = asString(
      row.statusLabel ?? row.status_label ?? row.status,
      "",
    );

    const rawMetrics = asArray<Record<string, unknown>>(row.metrics);
    const metrics = rawMetrics.map((metric, metricIndex) => ({
      label: asString(metric.label, `Metric ${metricIndex + 1}`),
      value: asString(metric.value, "—"),
    }));

    return {
      id: asString(row.id, `operation:${index}`),
      title,
      subtitle,
      statusLabel,
      status: statusLabel || asString(row.status, "Active"),
      summary: subtitle,
      href: asString(row.href ?? row.action_url, "") || undefined,
      metrics,
    };
  });
}

function mergeOverviewOperations(
  existing: OperationItem[],
  loaded: OperationItem[],
): OperationItem[] {
  const merged: OperationItem[] = [];
  const seen = new Set<string>();

  [...loaded, ...existing].forEach((item, index) => {
    const key =
      item.id || `${item.title}:${item.subtitle ?? item.summary}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });

  return merged;
}

async function loadOverviewActiveOperations(
  mainClubId: string | null,
): Promise<OperationItem[]> {
  if (!mainClubId) return [];

  try {
    const { data, error } = await supabase.rpc(
      "get_overview_active_operations_v1",
      {
        p_club_id: mainClubId,
      },
    );

    if (error) {
      console.warn("Could not load overview active operations:", error.message);
      return [];
    }

    return normalizeOverviewActiveOperations(data);
  } catch (err) {
    console.warn("Overview active operations lookup failed:", err);
    return [];
  }
}

function normalizeFinancePeriodSummary(
  value: unknown,
): Partial<FinancePeriodSummary> | null {
  const safe = asObject<Record<string, unknown>>(value, {});
  if (Object.keys(safe).length === 0) return null;

  const summary: Partial<FinancePeriodSummary> = {
    weeklyOperatingIncome: asNumber(
      safe.weeklyOperatingIncome ??
        safe.weekly_operating_income ??
        safe.weekIncome ??
        safe.week_income,
      Number.NaN,
    ),
    weeklyOperatingExpense: asNumber(
      safe.weeklyOperatingExpense ??
        safe.weekly_operating_expense ??
        safe.weekExpense ??
        safe.week_expense,
      Number.NaN,
    ),
    monthlyOperatingIncome: asNumber(
      safe.monthlyOperatingIncome ??
        safe.monthly_operating_income ??
        safe.monthIncome ??
        safe.month_income,
      Number.NaN,
    ),
    monthlyOperatingExpense: asNumber(
      safe.monthlyOperatingExpense ??
        safe.monthly_operating_expense ??
        safe.monthExpense ??
        safe.month_expense,
      Number.NaN,
    ),
    seasonOperatingIncome: asNumber(
      safe.seasonOperatingIncome ??
        safe.season_operating_income ??
        safe.seasonIncome ??
        safe.season_income,
      Number.NaN,
    ),
    seasonOperatingExpense: asNumber(
      safe.seasonOperatingExpense ??
        safe.season_operating_expense ??
        safe.seasonExpense ??
        safe.season_expense,
      Number.NaN,
    ),
  };

  const cleaned = Object.fromEntries(
    Object.entries(summary).filter(([, value]) => Number.isFinite(value)),
  ) as Partial<FinancePeriodSummary>;

  const values = Object.values(cleaned).filter((value) =>
    Number.isFinite(value),
  );
  const hasNonZeroValue = values.some((value) => Math.abs(Number(value)) > 0);

  // Ignore all-zero period summaries because they usually mean the optional
  // overview period RPC returned placeholder values. The card should then keep
  // the transaction/dashboard-derived finance totals instead of showing $0.
  if (!hasNonZeroValue) return null;

  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

function mergeFinancePeriodSummary(
  finance: FinanceHealth,
  summary: Partial<FinancePeriodSummary> | null,
): FinanceHealth {
  if (!summary) return finance;

  return {
    ...finance,
    weeklyOperatingIncome:
      summary.weeklyOperatingIncome ?? finance.weeklyOperatingIncome,
    weeklyOperatingExpense:
      summary.weeklyOperatingExpense ?? finance.weeklyOperatingExpense,
    monthlyOperatingIncome:
      summary.monthlyOperatingIncome ?? finance.monthlyOperatingIncome,
    monthlyOperatingExpense:
      summary.monthlyOperatingExpense ?? finance.monthlyOperatingExpense,
    seasonOperatingIncome:
      summary.seasonOperatingIncome ?? finance.seasonOperatingIncome,
    seasonOperatingExpense:
      summary.seasonOperatingExpense ?? finance.seasonOperatingExpense,
  };
}

async function loadOverviewFinancePeriodSummary(
  mainClubId: string | null,
  _seasonYear: number,
): Promise<Partial<FinancePeriodSummary> | null> {
  if (!mainClubId) return null;

  try {
    const { data, error } = await supabase.rpc(
      "get_overview_finance_period_summary_v1",
      {
        p_club_id: mainClubId,
        p_before: "2100-01-01T00:00:00+00:00",
        p_limit: 10000,
      },
    );

    if (!error && data) {
      return normalizeFinancePeriodSummary(data);
    }

    if (error) {
      console.warn(
        "Could not load overview finance period summary:",
        error.message,
      );
    }
  } catch (err) {
    console.warn("Overview finance period summary lookup failed:", err);
  }

  return null;
}

function normalizeOverviewAttentionItems(value: unknown): AlertItem[] {
  return asArray<Record<string, unknown>>(value).map((row, index) => {
    const rawLevel = asString(row.level, "info").toLowerCase();
    const level: AlertLevel =
      rawLevel === "danger" || rawLevel === "warning" || rawLevel === "success"
        ? rawLevel
        : "info";

    return {
      id: asString(row.id, `attention:${index}`),
      label: asString(row.label ?? row.title, "Attention item"),
      level,
      href: asString(row.href ?? row.action_url, "") || undefined,
    };
  });
}

function mergeOverviewAlerts(
  primary: AlertItem[],
  secondary: AlertItem[],
): AlertItem[] {
  const seen = new Set<string>();
  const merged: AlertItem[] = [];

  for (const item of [...secondary, ...primary]) {
    const key = `${item.href ?? ""}:${item.label}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function buildAttentionAlertsFromFeed(feed: FeedItem[]): AlertItem[] {
  const actionKeywords = [
    "test attention",
    "race application",
    "deadline",
    "needs review",
    "needs attention",
    "contract",
    "sick",
    "injured",
    "repair",
    "condition low",
    "supplies low",
    "scout",
    "report completed",
  ];

  return feed
    .filter((item) => {
      const searchable = `${item.title} ${item.subtitle}`.toLowerCase();
      return actionKeywords.some((keyword) => searchable.includes(keyword));
    })
    .map((item) => ({
      id: `feed-attention:${item.id}`,
      label: item.title,
      level:
        item.level === "danger"
          ? "danger"
          : item.level === "warning"
            ? "warning"
            : "info",
      href: item.href,
    }));
}

async function loadOverviewAttentionItems(
  mainClubId: string | null,
): Promise<AlertItem[]> {
  if (!mainClubId) return [];

  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    const { data, error } = await supabase.rpc(
      "get_overview_attention_items_v1",
      {
        p_club_id: mainClubId,
        p_user_id: userId,
        p_limit: 100,
      },
    );

    if (error) {
      console.warn("Could not load overview attention items:", error.message);
      return [];
    }

    return normalizeOverviewAttentionItems(data);
  } catch (err) {
    console.warn("Overview attention lookup failed:", err);
    return [];
  }
}


const OVERVIEW_OPENED_ATTENTION_STORAGE_KEY =
  "ppm:overview-opened-attention-keys-v1";

const OVERVIEW_ATTENTION_DISMISSED_EVENT =
  "ppm:overview-attention-dismissed-v1";

/**
 * normalizeOverviewAttentionMatchValue
 * Produces a stable text fingerprint used to match Overview attention bubbles
 * with Notification Center items even when they come from different RPCs.
 */
function normalizeOverviewAttentionMatchValue(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/#/g, "")
    .replace(/['"`´’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * normalizeOverviewAttentionHref
 * Normalizes HashRouter and regular dashboard URLs to the same key.
 */
function normalizeOverviewAttentionHref(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  let normalized = raw;

  if (normalized.startsWith("#")) {
    normalized = normalized.slice(1);
  }

  try {
    if (/^https?:\/\//i.test(normalized)) {
      const url = new URL(normalized);
      normalized = `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // Keep original normalized value.
  }

  normalized = normalized.replace(/^#/, "");

  if (normalized.startsWith("/#")) {
    normalized = normalized.slice(2);
  }

  normalized = normalized.replace(/\/+$/, "");

  return normalizeOverviewAttentionMatchValue(normalized);
}

/**
 * getOverviewAttentionTopic
 * Groups text into the same broad action type used by both notifications and
 * Overview attention bubbles.
 */
function getOverviewAttentionTopic(text: string): string | null {
  if (!text) return null;
  if (text.includes("stage plan")) return "stage_plan";
  if (text.includes("race plan")) return "race_plan";
  if (text.includes("race result") || text.includes("stage result")) return "race_result";
  if (text.includes("race application") || text.includes("application")) return "race_application";
  if (text.includes("contract")) return "contract";
  if (text.includes("equipment") || text.includes("repair")) return "equipment";
  if (text.includes("scout")) return "scouting";
  if (text.includes("finance") || text.includes("loan")) return "finance";
  if (text.includes("sick") || text.includes("injured") || text.includes("health")) return "health";
  return null;
}

/**
 * buildOverviewAttentionSemanticKey
 * Creates a looser matching key like:
 *   semantic:race_plan:darwin top end classic
 * so notification titles and attention labels can match even with slightly
 * different wording.
 */
function buildOverviewAttentionSemanticKey(value: unknown): string | null {
  const normalized = normalizeOverviewAttentionMatchValue(value);
  const topic = getOverviewAttentionTopic(normalized);
  if (!topic) return null;

  let subject = normalized
    .replace(/\brace plan\b/g, " ")
    .replace(/\bstage plan\b/g, " ")
    .replace(/\brace result(s)?\b/g, " ")
    .replace(/\bstage result(s)?\b/g, " ")
    .replace(/\brace application\b/g, " ")
    .replace(/\b(open|opened|deadline|reminder|soon|missing|review|available|submitted|locked|lock|today|for|the|a|an|is|are|has|have|stage|race|plan|results?|classic|tour)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Avoid category-wide keys. The subject must contain a real race/stage/event name.
  if (!subject || subject.length < 6 || subject.split(" ").length < 2) return null;

  return `semantic:${topic}:${subject}`;
}

function isSpecificOverviewAttentionHrefKey(value: string): boolean {
  // Generic routes like /dashboard/race-preparation should not match every
  // race-plan notification. Only hrefs with a UUID are considered unique enough.
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value);
}

/**
 * getAttentionDismissalKeysFromAlert
 * Generates every key by which an attention bubble may be dismissed.
 */
function getAttentionDismissalKeysFromAlert(alert: AlertItem): string[] {
  const keys = new Set<string>();

  const exactKey = getAttentionItemKey(alert);
  if (exactKey) keys.add(exactKey);

  const attentionId = getPersistableAttentionItemId(alert);
  if (attentionId) {
    keys.add(`id:${normalizeOverviewAttentionMatchValue(attentionId)}`);
  }

  const hrefKey = normalizeOverviewAttentionHref(alert.href);
  if (hrefKey && isSpecificOverviewAttentionHrefKey(hrefKey)) keys.add(`href:${hrefKey}`);

  const labelKey = normalizeOverviewAttentionMatchValue(alert.label);
  if (labelKey && labelKey.length >= 8) keys.add(`label:${labelKey}`);

  const semanticKey = buildOverviewAttentionSemanticKey(alert.label);
  if (semanticKey) keys.add(semanticKey);

  return Array.from(keys);
}

/**
 * isAttentionItemDismissed
 * Checks whether any persisted notification/attention key matches this bubble.
 */
function isAttentionItemDismissed(
  alert: AlertItem,
  openedKeys: Set<string>,
): boolean {
  return getAttentionDismissalKeysFromAlert(alert).some((key) =>
    openedKeys.has(key),
  );
}

/**
 * doAttentionDismissalKeysOverlap
 * Used for immediate local removal after opening a bubble.
 */
function doAttentionDismissalKeysOverlap(
  alert: AlertItem,
  dismissalKeys: Set<string>,
): boolean {
  return getAttentionDismissalKeysFromAlert(alert).some((key) =>
    dismissalKeys.has(key),
  );
}

function getAttentionItemKey(alert: AlertItem): string {
  return `${alert.id || ""}:${alert.href || ""}:${alert.label || ""}`
    .trim()
    .toLowerCase();
}

function readOpenedAttentionKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = window.localStorage.getItem(
      OVERVIEW_OPENED_ATTENTION_STORAGE_KEY,
    );
    const values = raw ? JSON.parse(raw) : [];

    return new Set(
      Array.isArray(values)
        ? values.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function persistOpenedAttentionKeys(keys: Set<string>) {
  if (typeof window === "undefined") return;

  try {
    const values = Array.from(keys).slice(-250);
    window.localStorage.setItem(
      OVERVIEW_OPENED_ATTENTION_STORAGE_KEY,
      JSON.stringify(values),
    );
    window.dispatchEvent(new CustomEvent(OVERVIEW_ATTENTION_DISMISSED_EVENT));
  } catch {
    // Local persistence is only a UI convenience. Ignore storage errors.
  }
}

function getPersistableAttentionItemId(alert: AlertItem): string | null {
  const cleanId = alert.id
    .replace(/^feed-attention:/, "")
    .replace(/^attention:/, "")
    .trim();

  if (!cleanId || cleanId.includes(":")) return null;

  return cleanId;
}

async function markOverviewAttentionItemOpened(
  alert: AlertItem,
  mainClubId: string | null,
): Promise<void> {
  const attentionId = getPersistableAttentionItemId(alert);
  let userId: string | null = null;

  try {
    const { data: userData } = await supabase.auth.getUser();
    userId = userData.user?.id ?? null;
  } catch {
    userId = null;
  }

  const rpcAttempts: Array<{
    functionName: string;
    args: Record<string, unknown>;
  }> = [
    {
      functionName: "mark_overview_attention_item_opened_v1",
      args: {
        p_attention_id: attentionId,
        p_notification_id: attentionId,
        p_club_id: mainClubId,
        p_user_id: userId,
        p_href: alert.href ?? null,
        p_label: alert.label,
      },
    },
    {
      functionName: "dismiss_overview_attention_item_v1",
      args: {
        p_attention_id: attentionId,
        p_club_id: mainClubId,
        p_user_id: userId,
      },
    },
    {
      functionName: "mark_game_notification_read_v1",
      args: {
        p_notification_id: attentionId,
        p_user_id: userId,
      },
    },
    {
      functionName: "mark_notification_read_v1",
      args: {
        p_notification_id: attentionId,
        p_user_id: userId,
      },
    },
  ];

  for (const attempt of rpcAttempts) {
    try {
      const { error } = await supabase.rpc(attempt.functionName, attempt.args);
      if (!error) return;
    } catch {
      // Try the next known notification/attention write shape.
    }
  }

  if (!attentionId) return;

  const now = new Date().toISOString();
  const updateAttempts: Record<string, unknown>[] = [
    {
      read_at: now,
      opened_at: now,
      dismissed_at: now,
      is_read: true,
      status: "read",
    },
    { read_at: now, is_read: true },
    { opened_at: now, status: "read" },
    { dismissed_at: now, status: "dismissed" },
    { status: "read" },
    { is_read: true },
  ];
  const tableNames = ["game_notifications", "notifications", "user_notifications"];

  for (const tableName of tableNames) {
    for (const patch of updateAttempts) {
      try {
        const { error } = await supabase
          .from(tableName)
          .update(patch)
          .eq("id", attentionId);

        if (!error) return;
      } catch {
        // Continue trying the remaining table/column combinations.
      }
    }
  }
}


type OverviewNotificationMatchRow = {
  user_notification_id?: number | string | null;
  notification_id?: number | string | null;
  id?: number | string | null;
  title?: string | null;
  message?: string | null;
  type_code?: string | null;
  source?: string | null;
  preference_group?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  action_url?: string | null;
  href?: string | null;
  target_url?: string | null;
  route?: string | null;
  url?: string | null;
};

function getOverviewNotificationMetadataValues(
  row: OverviewNotificationMatchRow,
): string[] {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : null;
  if (!metadata) return [];

  const keys = [
    "attention_key",
    "attentionKey",
    "race_id",
    "raceId",
    "stage_id",
    "stageId",
    "related_id",
    "relatedId",
    "target_id",
    "targetId",
  ];

  return keys
    .map((key) => metadata[key])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function getOverviewNotificationActionUrl(row: OverviewNotificationMatchRow): string | null {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : null;
  const metadataUrl = metadata
    ? (metadata.action_url ?? metadata.actionUrl ?? metadata.href ?? metadata.target_url ?? metadata.targetUrl)
    : null;

  const value =
    row.action_url ??
    row.href ??
    row.target_url ??
    row.route ??
    row.url ??
    metadataUrl ??
    null;

  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getOverviewNotificationDismissalKeysFromRow(
  row: OverviewNotificationMatchRow,
): string[] {
  const keys = new Set<string>();
  const actionUrl = getOverviewNotificationActionUrl(row);
  const hrefKey = normalizeOverviewAttentionHref(actionUrl);
  if (hrefKey && isSpecificOverviewAttentionHrefKey(hrefKey)) keys.add(`href:${hrefKey}`);

  for (const rawId of [
    row.user_notification_id,
    row.notification_id,
    row.id,
    ...getOverviewNotificationMetadataValues(row),
  ]) {
    const idKey = normalizeOverviewAttentionMatchValue(rawId);
    if (idKey) keys.add(`id:${idKey}`);
  }

  // Only title/message are specific enough for cross-dismissal.
  // Do not use type_code/source/preference_group, because they are category-wide.
  for (const rawText of [
    row.title,
    row.message,
    `${row.title ?? ""} ${row.message ?? ""}`,
  ]) {
    const labelKey = normalizeOverviewAttentionMatchValue(rawText);
    if (labelKey && labelKey.length >= 8) keys.add(`label:${labelKey}`);

    const semanticKey = buildOverviewAttentionSemanticKey(rawText);
    if (semanticKey) keys.add(semanticKey);
  }

  return Array.from(keys);
}

function doOverviewAttentionKeyListsOverlap(
  left: Iterable<string>,
  right: Iterable<string>,
): boolean {
  const rightSet = right instanceof Set ? right : new Set(right);
  for (const key of left) {
    if (rightSet.has(key)) return true;
  }
  return false;
}

async function markMatchingUnreadNotificationsReadForAttention(
  alert: AlertItem,
): Promise<number> {
  const attentionKeys = getAttentionDismissalKeysFromAlert(alert);
  if (attentionKeys.length === 0) return 0;

  try {
    const { data, error } = await supabase.rpc("get_my_notifications", {
      p_status: "unread",
      p_page: 1,
      p_page_size: 500,
    });

    if (error) {
      console.warn("Could not load unread notifications for attention sync:", error.message);
      return 0;
    }

    const rows = asArray<OverviewNotificationMatchRow>(data);
    let markedCount = 0;

    for (const row of rows) {
      const notificationKeys = getOverviewNotificationDismissalKeysFromRow(row);
      if (!doOverviewAttentionKeyListsOverlap(attentionKeys, notificationKeys)) continue;

      const userNotificationId = row.user_notification_id;
      if (userNotificationId === null || userNotificationId === undefined) continue;

      const { data: marked, error: markError } = await supabase.rpc(
        "mark_my_notification_read",
        {
          p_user_notification_id: userNotificationId,
        },
      );

      if (markError) {
        console.warn("Could not mark matching notification read:", markError.message);
        continue;
      }

      if (marked === true) markedCount += 1;
    }

    return markedCount;
  } catch (err) {
    console.warn("Attention-to-notification sync failed:", err);
    return 0;
  }
}

function normalizeOverviewSquadPulse(value: unknown): SquadPulse | null {
  const safe = asObject<Record<string, unknown>>(value, {});
  if (Object.keys(safe).length === 0) return null;

  return {
    fitness: asNumber(safe.fitness, 0),
    morale: asNumber(safe.morale, 0),
    readiness: asNumber(safe.readiness, 0),
    form: asString(safe.form, "+0"),
    availableRiders: asNumber(safe.availableRiders ?? safe.available_riders, 0),
    injured: asNumber(safe.injured, 0),
    sick: asNumber(safe.sick, 0),
    notFullyFit: asNumber(safe.notFullyFit ?? safe.not_fully_fit, 0),
    expiringContracts: asNumber(
      safe.expiringContracts ?? safe.expiring_contracts,
      0,
    ),
  };
}

async function loadOverviewSquadPulse(
  mainClubId: string | null,
): Promise<SquadPulse | null> {
  if (!mainClubId) return null;

  try {
    const { data, error } = await supabase.rpc("get_overview_squad_pulse_v1", {
      p_club_id: mainClubId,
    });

    if (error) {
      console.warn("Could not load overview squad pulse:", error.message);
      return null;
    }

    return normalizeOverviewSquadPulse(data);
  } catch (err) {
    console.warn("Overview squad pulse lookup failed:", err);
    return null;
  }
}

function normalizeOverviewSeasonSnapshot(
  value: unknown,
): OverviewSeasonSnapshot {
  const safe = asObject<Record<string, unknown>>(value, {});

  return {
    races: asNumber(safe.races, 0),
    stages: asNumber(safe.stages, 0),
    internationalPoints: asNumber(
      safe.internationalPoints ?? safe.international_points,
      0,
    ),
    wins: asNumber(safe.wins, 0),
    podiums: asNumber(safe.podiums, 0),
    top10s: asNumber(safe.top10s ?? safe.top10, 0),
    jerseys: asNumber(safe.jerseys, 0),
    bestGc:
      safe.bestGc === null || safe.best_gc === null
        ? null
        : asNumber(safe.bestGc ?? safe.best_gc, 0) || null,
  };
}

async function loadOverviewSeasonSnapshot(
  mainClubId: string | null,
  seasonYear: number,
): Promise<OverviewSeasonSnapshot> {
  if (!mainClubId) return EMPTY_SEASON_SNAPSHOT;

  try {
    const { data, error } = await supabase.rpc(
      "get_overview_season_snapshot_v1",
      {
        p_club_id: mainClubId,
        p_season_year: seasonYear,
      },
    );

    if (error) {
      console.warn("Could not load overview season snapshot:", error.message);
      return EMPTY_SEASON_SNAPSHOT;
    }

    return normalizeOverviewSeasonSnapshot(data);
  } catch (err) {
    console.warn("Overview season snapshot lookup failed:", err);
    return EMPTY_SEASON_SNAPSHOT;
  }
}

/**
 * getAlertClasses
 * Returns Tailwind classes for the soft alert card surface.
 */
function getAlertClasses(level: AlertLevel) {
  switch (level) {
    case "danger":
      return "border-red-200 bg-red-50 text-red-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "info":
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
  }
}

function getAlertIconClasses(level: AlertLevel) {
  switch (level) {
    case "danger":
      return "bg-red-600 text-white shadow-red-100";
    case "warning":
      return "bg-amber-500 text-white shadow-amber-100";
    case "success":
      return "bg-emerald-600 text-white shadow-emerald-100";
    case "info":
    default:
      return "bg-sky-600 text-white shadow-sky-100";
  }
}

function getAlertBadgeClasses(level: AlertLevel) {
  switch (level) {
    case "danger":
      return "bg-red-100 text-red-700";
    case "warning":
      return "bg-amber-100 text-amber-800";
    case "success":
      return "bg-emerald-100 text-emerald-700";
    case "info":
    default:
      return "bg-sky-100 text-sky-700";
  }
}

function getAlertIcon(level: AlertLevel) {
  switch (level) {
    case "danger":
      return "!";
    case "warning":
      return "⏱";
    case "success":
      return "✓";
    case "info":
    default:
      return "i";
  }
}

function getAlertLevelLabel(level: AlertLevel) {
  switch (level) {
    case "danger":
      return "Urgent";
    case "warning":
      return "Soon";
    case "success":
      return "Done";
    case "info":
    default:
      return "Info";
  }
}

function splitAttentionLabel(label: string): { title: string; detail: string | null } {
  const normalized = label.trim().replace(/\s+/g, " ");
  const separatorIndex = normalized.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return {
      title: normalized || "Attention item",
      detail: null,
    };
  }

  return {
    title: normalized.slice(0, separatorIndex).trim(),
    detail: normalized.slice(separatorIndex + 1).trim() || null,
  };
}

function getAttentionActionLabel(label: string) {
  const value = label.toLowerCase();

  if (value.includes("stage plan")) return "Stage plan";
  if (value.includes("race plan")) return "Race plan";
  if (value.includes("application")) return "Race application";
  if (value.includes("contract")) return "Contract";
  if (value.includes("equipment") || value.includes("repair")) return "Equipment";
  if (value.includes("scout")) return "Scouting";
  if (value.includes("finance") || value.includes("loan")) return "Finance";
  if (value.includes("sick") || value.includes("injured") || value.includes("health")) {
    return "Health";
  }

  return "Review";
}

function getAlertDotClasses(level: AlertLevel) {
  switch (level) {
    case "danger":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    case "success":
      return "bg-emerald-500";
    case "info":
    default:
      return "bg-sky-500";
  }
}

function getAlertCompactBorderClasses(level: AlertLevel) {
  switch (level) {
    case "danger":
      return "border-l-red-400";
    case "warning":
      return "border-l-amber-400";
    case "success":
      return "border-l-emerald-400";
    case "info":
    default:
      return "border-l-sky-400";
  }
}

function getAlertBubbleClasses(level: AlertLevel) {
  switch (level) {
    case "danger":
      return "border-red-200 bg-red-50 text-red-700 shadow-red-100/70";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800 shadow-amber-100/70";
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-emerald-100/70";
    case "info":
    default:
      return "border-sky-200 bg-sky-50 text-sky-700 shadow-sky-100/70";
  }
}

function getAlertBubbleIconClasses(level: AlertLevel) {
  switch (level) {
    case "danger":
      return "bg-red-600 text-white ring-red-100";
    case "warning":
      return "bg-amber-500 text-white ring-amber-100";
    case "success":
      return "bg-emerald-600 text-white ring-emerald-100";
    case "info":
    default:
      return "bg-sky-600 text-white ring-sky-100";
  }
}

function AttentionBubbleItem({
  alert,
  onOpen,
}: {
  alert: AlertItem;
  onOpen?: (alert: AlertItem) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const { title, detail } = splitAttentionLabel(alert.label);
  const displayTitle = detail ?? title;
  const contextLabel = detail ? title : "Click to expand";
  const actionLabel = getAttentionActionLabel(alert.label);
  const levelLabel = getAlertLevelLabel(alert.level);

  const handleOpenClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();

    onOpen?.(alert);

    if (alert.href) {
      window.location.href = alert.href;
    }
  };

  return (
    <div
      className={cn(
        "relative h-11 shrink-0 snap-start transition-[width] duration-200 ease-out",
        expanded ? "w-[326px]" : "w-[178px]",
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        title={alert.label}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "group flex h-11 w-full items-center overflow-hidden rounded-full border text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2",
          expanded ? "px-2.5 pr-20" : "px-2.5 pr-3",
          getAlertBubbleClasses(alert.level),
        )}
      >
        <span
          className={cn(
            "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black ring-4",
            getAlertBubbleIconClasses(alert.level),
          )}
        >
          {getAlertIcon(alert.level)}
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-white bg-current" />
        </span>

        <span className="ml-2 min-w-0 flex-1">
          <span className="block truncate text-xs font-black leading-4 text-slate-950">
            {actionLabel}
          </span>
          <span className="block truncate text-[10px] font-semibold leading-3 text-slate-500">
            {expanded ? contextLabel : displayTitle}
          </span>
        </span>
      </button>

      {expanded ? (
        <div className="pointer-events-none absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          <span className="rounded-full bg-white/80 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-500 shadow-sm ring-1 ring-slate-200">
            {levelLabel}
          </span>
          {alert.href ? (
            <a
              href={alert.href}
              title={`Open ${actionLabel}`}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-black text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-950 hover:text-white"
              onClick={handleOpenClick}
            >
              →
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AttentionBubbleSlider({
  alerts,
  onOpen,
}: {
  alerts: AlertItem[];
  onOpen?: (alert: AlertItem) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="inline-flex h-10 items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 text-xs font-semibold text-emerald-700">
        All clear — no urgent tasks right now.
      </div>
    );
  }

  return (
    <div className="flex w-full snap-x snap-mandatory items-center gap-2 overflow-x-auto overscroll-x-contain scroll-smooth px-1 pb-1 [scrollbar-width:thin]">
      {alerts.map((alert) => (
        <AttentionBubbleItem key={alert.id} alert={alert} onOpen={onOpen} />
      ))}
    </div>
  );
}


/**
 * getFeedAccent
 * Returns Tailwind background classes for a feed item icon.
 */
function getFeedAccent(level: FeedLevel) {
  switch (level) {
    case "finance":
      return "bg-emerald-500";
    case "training":
      return "bg-violet-500";
    case "infrastructure":
      return "bg-cyan-600";
    case "medical":
      return "bg-red-500";
    case "inbox":
      return "bg-rose-500";
    case "sponsor":
      return "bg-yellow-500";
    case "system":
    default:
      return "bg-slate-500";
  }
}

/**
 * getFeedIcon
 * Returns a simple text icon for a feed item.
 */
function getFeedIcon(level: FeedLevel) {
  switch (level) {
    case "finance":
      return "€";
    case "training":
      return "TC";
    case "infrastructure":
      return "IF";
    case "medical":
      return "+";
    case "inbox":
      return "IN";
    case "sponsor":
      return "SP";
    case "system":
    default:
      return "•";
  }
}

/**
 * getRiskTextClass
 * Returns text color class for liquidation risk.
 */
function getRiskTextClass(risk: string) {
  const normalized = risk.trim().toLowerCase();

  if (normalized === "high" || normalized === "critical") return "text-red-600";
  if (normalized === "medium" || normalized === "moderate")
    return "text-yellow-600";
  if (normalized === "low") return "text-emerald-600";

  return "text-slate-900";
}

/**
 * formatNextRepayment
 * Formats next repayment amount and game date.
 */
function formatNextRepayment(debt: EmergencyDebtHealth) {
  const hasAmount = debt.nextRepaymentAmount > 0;
  const hasDate =
    debt.nextRepaymentDateLabel &&
    debt.nextRepaymentDateLabel !== "No repayment scheduled";

  if (hasAmount && hasDate) {
    return `${formatCurrency(debt.nextRepaymentAmount)} on ${debt.nextRepaymentDateLabel}`;
  }

  if (hasAmount) return formatCurrency(debt.nextRepaymentAmount);
  if (hasDate) return debt.nextRepaymentDateLabel;

  return "No repayment scheduled";
}

/**
 * Card
 * Basic rounded card wrapper with border and shadow.
 */
function Card({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * SectionTitle
 * Standard section title with optional subtitle.
 */
function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * SectionEmptyState
 * Generic empty state panel for a section.
 */
function SectionEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{description}</div>
    </div>
  );
}

/**
 * KpiCard
 * Shows a single KPI metric.
 */
function KpiCard({ item }: { item: KpiItem }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {item.label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{item.value}</div>
      <div className="mt-2 text-sm text-slate-500">{item.hint}</div>
      {item.trend ? (
        <div className="mt-3 text-xs font-medium text-slate-700">
          {item.trend}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * ProgressMetric
 * Horizontal progress indicator used for squad metrics.
 */
function ProgressMetric({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full", colorClass)}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * SmallStat
 * Compact statistic row used across cards.
 */
function SmallStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span
        className={cn(
          "text-right text-sm font-semibold text-slate-900",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * TransactionSummaryRow
 * Compact row for top incomes, costs, and debt movement display.
 */
function TransactionSummaryRow({ item }: { item: TransactionSummaryItem }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="min-w-0 truncate text-sm text-slate-600">
        {item.label}
      </span>
      <span
        className={cn(
          "whitespace-nowrap text-sm font-semibold",
          item.amount >= 0 ? "text-emerald-600" : "text-red-600",
        )}
      >
        {formatSignedCurrency(item.amount)}
      </span>
    </div>
  );
}

/**
 * OperationCard
 * Card for a single active operation.
 */
function OperationCard({ item }: { item: OperationItem }) {
  const hasMetrics = Array.isArray(item.metrics) && item.metrics.length > 0;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-900">
            {item.title}
          </div>
          <div className="mt-1 text-sm text-slate-500">{item.summary}</div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {item.status}
        </span>
      </div>

      {hasMetrics ? (
        <div className="mt-4 space-y-2">
          {item.metrics.map((metric) => (
            <div
              key={metric.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-slate-500">{metric.label}</span>
              <span className="font-medium text-slate-900">{metric.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
          No detailed metrics available.
        </div>
      )}

      {item.href ? (
        <a
          href={item.href}
          className="mt-4 inline-flex items-center text-sm font-semibold text-slate-900 hover:text-yellow-600"
        >
          Open
        </a>
      ) : null}
    </Card>
  );
}

/**
 * ScheduleRow
 * Row for an upcoming schedule entry.
 */
function ScheduleRow({ item }: { item: ScheduleItem }) {
  const content = (
    <div className="flex items-start gap-4 rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
      <div className="min-w-[72px] rounded-lg bg-slate-100 px-3 py-2 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Date
        </div>
        <div className="mt-1 text-sm font-bold text-slate-900">
          {item.dateLabel}
        </div>
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
        <div className="mt-1 text-sm text-slate-500">{item.subtitle}</div>
      </div>
    </div>
  );

  return item.href ? <a href={item.href}>{content}</a> : content;
}

/**
 * DayRaceRow
 * Row for races happening on the current game day.
 */
function DayRaceRow({ item }: { item: DayRaceItem }) {
  const content = (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
        <div className="mt-1 text-sm text-slate-500">{item.subtitle}</div>
      </div>
      {item.timeLabel ? (
        <div className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
          {item.timeLabel}
        </div>
      ) : null}
    </div>
  );

  return item.href ? <a href={item.href}>{content}</a> : content;
}

/**
 * NewsRow
 * Row for a single news item.
 */
function NewsRow({ item }: { item: NewsItem }) {
  const content = (
    <div className="rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
        <div className="whitespace-nowrap text-xs text-slate-400">
          {item.timeLabel}
        </div>
      </div>
      <div className="mt-1 text-sm text-slate-500">{item.subtitle}</div>
    </div>
  );

  return item.href ? <a href={item.href}>{content}</a> : content;
}

/**
 * FeedRow
 * Row for a single activity feed item.
 */
function FeedRow({ item }: { item: FeedItem }) {
  const content = (
    <div className="flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white",
          getFeedAccent(item.level),
        )}
      >
        {getFeedIcon(item.level)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">
            {item.title}
          </div>
          <div className="whitespace-nowrap text-xs text-slate-400">
            {item.timeLabel}
          </div>
        </div>
        <div className="mt-1 text-sm text-slate-500">{item.subtitle}</div>
      </div>
    </div>
  );

  return item.href ? <a href={item.href}>{content}</a> : content;
}

/**
 * QuickAction
 * Gradient tile linking to a primary management area.
 */
function QuickAction({ item }: { item: QuickActionItem }) {
  return (
    <a
      href={item.href}
      className={cn(
        "group relative min-h-[92px] overflow-hidden rounded-2xl bg-gradient-to-br px-4 py-4 text-white shadow-sm transition hover:-translate-y-0.5",
        item.accent,
      )}
    >
      <div className="text-sm font-semibold">{item.label}</div>
      <div className="mt-1 text-xs text-white/80">Open</div>
      <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/10 transition group-hover:scale-110" />
    </a>
  );
}

/**
 * MainSponsorPanel
 * Visual panel that shows the main sponsor logo or a meaningful empty state.
 * Fixed-height container so the card size does not change, while the logo
 * stretches to use much more of the available space.
 */
function MainSponsorPanel({ sponsor }: { sponsor: MainSponsor }) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [sponsor.logoUrl]);

  const hasLogo = Boolean(sponsor.logoUrl) && !failed;
  const hasSignedSponsor = Boolean(sponsor.isActive || sponsor.logoUrl);
  const initials = (sponsor.name || "MS")
    .split(" ")
    .map((part) => part.trim()[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="h-[220px] rounded-2xl border border-slate-200 bg-slate-50 p-3">
      {hasLogo ? (
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-white">
          <img
            src={sponsor.logoUrl}
            alt={sponsor.name || "Main Sponsor"}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain p-1"
          />
        </div>
      ) : hasSignedSponsor ? (
        <div className="flex h-full w-full items-center justify-center rounded-xl bg-white">
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-slate-300 bg-white text-xl font-bold text-slate-700">
            {initials}
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-xl bg-white text-center">
          <div>
            <div className="text-base font-semibold text-slate-700">
              No Main Sponsor signed
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Please visit Sponsor Page.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * EmergencyDebtCard
 * Dedicated emergency-loan card so loan disbursement and principal repayment
 * are not mixed into operating income/costs.
 */
function EmergencyDebtCard({
  debt,
  debtMovements,
}: {
  debt: EmergencyDebtHealth;
  debtMovements: TransactionSummaryItem[];
}) {
  const visibleDebtMovements = buildDebtMovementsFromEmergencyDebt(
    debt,
    debtMovements,
  );

  return (
    <Card className="p-5">
      <SectionTitle
        title="Emergency Debt"
        subtitle="Emergency loans, principal balance, repayment pressure, and liquidation risk."
      />

      <div className="mt-5 space-y-3">
        <SmallStat
          label="Rescues used"
          value={`${debt.rescuesUsed} / ${debt.rescueLimit}`}
          valueClassName={
            debt.rescuesUsed >= debt.rescueLimit ? "text-red-600" : ""
          }
        />
        <SmallStat
          label="Outstanding principal"
          value={formatCurrency(debt.outstandingPrincipal)}
          valueClassName={
            debt.outstandingPrincipal > 0 ? "text-red-600" : "text-emerald-600"
          }
        />
        <SmallStat label="Next repayment" value={formatNextRepayment(debt)} />
        <SmallStat
          label="Liquidation risk"
          value={debt.liquidationRisk}
          valueClassName={getRiskTextClass(debt.liquidationRisk)}
        />
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Debt Movement
        </div>

        {visibleDebtMovements.length > 0 ? (
          <div className="mt-3 space-y-2">
            {visibleDebtMovements.map((item) => (
              <TransactionSummaryRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
            No emergency loan movement found.
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * EmptyState
 * Generic centered empty state component.
 */
function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{subtitle}</div>
    </div>
  );
}

/**
 * safeCountryCode
 * Returns a safe lowercase ISO country code for flag images.
 */
function safeCountryCode(countryCode?: string | null) {
  const code = countryCode?.trim().toLowerCase();

  if (!code || !/^[a-z]{2}$/.test(code)) return null;

  return code;
}

/**
 * getCountryFlagUrl
 * Returns a flag CDN URL for a country code.
 */
function getCountryFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`;
}

/**
 * CountryFlag
 * Small flag image with graceful placeholder fallback.
 */
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
        className={cn(
          "inline-flex h-4 w-6 shrink-0 items-center justify-center rounded-sm border border-gray-200 bg-white text-[13px] leading-none",
          className,
        )}
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

/**
 * RacePreviewStrip
 * Same visual style used on squad pages for last/next race previews.
 */
function RacePreviewStrip({
  raceName,
  raceCountryCode,
  raceCategory,
  stageDate,
  stageLabel,
  routeLabel,
  stageCount,
  emptyLabel = "No race found yet",
  href,
  compactDetails = false,
}: {
  raceName?: string | null;
  raceCountryCode?: string | null;
  raceCategory?: string | null;
  stageDate?: string | null;
  stageLabel?: string | null;
  routeLabel?: string | null;
  stageCount?: number | null;
  emptyLabel?: string;
  href?: string;
  compactDetails?: boolean;
}) {
  if (!raceName) {
    return (
      <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const resolvedCountryCode =
    raceCountryCode || inferCountryCodeFromRaceTitle(raceName);
  const details = compactDetails
    ? []
    : [
        stageLabel,
        stageCount && stageCount > 1 ? `${stageCount} stages` : null,
        routeLabel,
      ].filter((value): value is string => Boolean(value));

  const content = (
    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm transition hover:bg-white">
      <div className="w-[68px] shrink-0 whitespace-nowrap text-xs font-semibold text-slate-900">
        {stageDate ? formatShortOverviewDate(stageDate) : "—"}
      </div>

      {resolvedCountryCode ? (
        <div className="h-7 w-px shrink-0 bg-emerald-400" />
      ) : null}

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <CountryFlag countryCode={resolvedCountryCode} />

        <div
          className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-slate-900"
          title={raceName ?? undefined}
        >
          {raceName}
        </div>

        {raceCategory ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {raceCategory}
          </span>
        ) : null}

        {details.length > 0 ? (
          <span className="min-w-0 truncate text-xs text-slate-500">
            · {details.join(" · ")}
          </span>
        ) : null}
      </div>
    </div>
  );

  return href ? <a href={href}>{content}</a> : content;
}

/**
 * CompactRaceStrip
 * Backward-compatible wrapper for existing schedule/day-race rows.
 */
function CompactRaceStrip({
  dateLabel,
  countryCode,
  title,
  category,
  details,
  href,
}: {
  dateLabel?: string | null;
  countryCode?: string | null;
  title: string;
  category?: string | null;
  details?: string | null;
  href?: string;
}) {
  const resolvedCountryCode =
    countryCode || inferCountryCodeFromRaceTitle(title);

  const content = (
    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm transition hover:bg-white">
      <div className="w-[68px] shrink-0 whitespace-nowrap text-xs font-semibold text-slate-900">
        {dateLabel || "—"}
      </div>

      {resolvedCountryCode ? (
        <div className="h-7 w-px shrink-0 bg-emerald-400" />
      ) : null}

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <CountryFlag countryCode={resolvedCountryCode} />

        <div
          className="min-w-0 flex-1 truncate font-semibold text-slate-900"
          title={title}
        >
          {title}
        </div>

        {category ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            {category}
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

  return href ? <a href={href}>{content}</a> : content;
}

type OverviewNewsListItem = {
  id: string;
  title: string;
  subtitle: string;
  timeLabel: string;
  href?: string;
  level?: AlertLevel | FeedLevel | "world";
  sourceLabel: "Team" | "World";
  expandedText: string;
  linkLabel?: string;
};

/**
 * getOverviewGameTimeLabel
 * Keeps overview news on in-game time when the RPC only sends real timestamps.
 */
const OVERVIEW_MONTH_MAP: Record<string, string> = {
  january: "Jan",
  february: "Feb",
  march: "Mar",
  april: "Apr",
  may: "May",
  june: "Jun",
  july: "Jul",
  august: "Aug",
  september: "Sep",
  october: "Oct",
  november: "Nov",
  december: "Dec",
};

function getOverviewShortCurrentDateLabel(
  currentGameDateLabel: string,
): string {
  const raw = (currentGameDateLabel ?? "").trim();

  if (!raw || raw.toLowerCase() === "current game date") return "Today";

  const monthMatch =
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i.exec(
      raw,
    );
  if (!monthMatch) return raw;

  const monthName = monthMatch[0].replace(/\s+\d{1,2}.*/, "");
  const day = monthMatch[1].padStart(2, "0");

  return `${OVERVIEW_MONTH_MAP[monthName.toLowerCase()] ?? monthName.slice(0, 3)} ${day}`;
}

function getOverviewCurrentGameDateTimeLabel(
  currentGameDateLabel: string,
): string {
  // News Board should never display real-world timestamps.
  // Current game-day team items are always labelled with the current in-game day.
  void currentGameDateLabel;
  return "Today";
}

function looksLikeRealTimestampLabel(raw: string): boolean {
  const value = raw.trim();

  if (!value) return true;
  if (/^today$/i.test(value)) return true;
  if (/\b202\d\b/.test(value)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true;
  if (/^\d{4}-\d{2}-\d{2}t/i.test(value)) return true;
  if (
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{1,2}:\d{2}$/i.test(
      value,
    )
  )
    return true;
  if (
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+202\d/i.test(
      value,
    )
  )
    return true;

  return false;
}

function getOverviewGameTimeLabel(
  rawTimeLabel: string | undefined,
  currentGameDateLabel: string,
) {
  const raw = (rawTimeLabel ?? "").trim();
  const currentShort = getOverviewShortCurrentDateLabel(currentGameDateLabel);

  if (!raw || raw.toLowerCase() === "current game date") return "Today";
  if (/season\s+\d+/i.test(raw)) return raw;

  const shortRaw = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? formatShortOverviewDate(raw)
    : raw;

  // Anything created/published on the current in-game date should read Today.
  // Real-world timestamps from notifications are also converted to Today.
  if (raw.toLowerCase() === "today") return "Today";
  if (
    currentShort !== "Today" &&
    shortRaw.toLowerCase() === currentShort.toLowerCase()
  )
    return "Today";
  if (looksLikeRealTimestampLabel(raw)) return "Today";

  return shortRaw;
}

/**
 * normalizeDashboardHref
 * Keeps overview links inside the game dashboard. World-news rows must not point
 * to external articles; they should point to the related team, rider, or competition page.
 */
function normalizeDashboardHref(value: string | undefined): string | undefined {
  const raw = (value ?? "").trim();
  if (!raw) return undefined;

  if (raw.startsWith("#/dashboard/")) return raw;
  if (raw.startsWith("/dashboard/")) return raw;
  if (raw.startsWith("dashboard/")) return `/${raw}`;

  return undefined;
}

/**
 * getNewsLinkLabel
 * Uses the linked game entity to explain what the button opens.
 */
function getNewsLinkLabel(
  href: string | undefined,
  sourceLabel: "Team" | "World",
) {
  const target = (href ?? "").toLowerCase();

  if (!target) return undefined;
  if (target.includes("/team-profile/")) return "Open team profile";
  if (target.includes("/my-riders/") || target.includes("/external-riders/")) {
    return "Open rider profile";
  }
  if (target.includes("/races/") || target.includes("raceid="))
    return "Open competition page";
  if (target.includes("/team-ranking") || target.includes("/statistics")) {
    return "Open competition page";
  }

  return sourceLabel === "World" ? "Open related page" : "Open related page";
}

/**
 * buildTeamNewsExpandedText
 * Provides richer expanded copy for team-management messages.
 */
function buildTeamNewsExpandedText(title: string, subtitle: string) {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes("race plan open")) {
    return `${subtitle} This is a team-management item: the race plan window is active, so it is a good moment to review the race profile, pick the correct riders, attach staff, assign vehicles/assets, and check supplies before the deadline.`;
  }

  if (normalizedTitle.includes("stage plans open")) {
    return `${subtitle} Stage planning is now available. Check each stage separately, because rider roles, tactics, and leader protection can be different from stage to stage.`;
  }

  if (normalizedTitle.includes("stage plan missing")) {
    return `${subtitle} This is an action item. A stage plan is missing or has not been saved yet, so the team could enter the race stage without clear roles or tactics if you do not finish it.`;
  }

  if (
    normalizedTitle.includes("locks soon") ||
    normalizedTitle.includes("deadline")
  ) {
    return `${subtitle} This is a deadline warning. Review the related page now, because after the lock time the game should no longer allow normal edits.`;
  }

  return `${subtitle} This is a team update from your club dashboard. Open the related page if you want to inspect the item and decide whether action is needed.`;
}

function prettifyOverviewRaceType(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "road race";

  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseTodayInPelotonSubtitle(subtitle: string) {
  const parts = subtitle
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    raceClass: parts[0] ?? "",
    stageLabel: parts.find((part) => /^stage\s+\d+/i.test(part)) ?? "",
    raceType:
      parts.find(
        (part) =>
          /road|time|trial|flat|hilly|mountain|race/i.test(part) &&
          !/^stage\s+\d+/i.test(part),
      ) ?? "",
  };
}

function buildWorldNewsSubtitle(item: NewsItem) {
  const title = item.title || "";
  const subtitle = item.subtitle || "";

  if (!title.toLowerCase().includes("today in the peloton")) return subtitle;

  const parsed = parseTodayInPelotonSubtitle(subtitle);
  const lowerSubtitle = subtitle.toLowerCase();
  const oneDayClassMatch = /one[- ]day race:?\s*([0-9][.][0-9a-z]+)/i.exec(
    subtitle,
  );
  const classOnlyMatch =
    /(?:current game-day race:)?\s*([0-9][.][0-9a-z]+)/i.exec(subtitle);
  const raceClass =
    parsed.raceClass || oneDayClassMatch?.[1] || classOnlyMatch?.[1] || "";

  if (lowerSubtitle.includes("one-day") || lowerSubtitle.includes("one day")) {
    return `A one-day${raceClass ? ` ${raceClass}` : ""} race is scheduled on the current game day.`;
  }

  const stageText = parsed.stageLabel || "A stage";
  const classText = raceClass ? ` of this ${raceClass} race` : "";
  const typeText = parsed.raceType
    ? ` Race type: ${prettifyOverviewRaceType(parsed.raceType)}.`
    : "";

  return `${stageText}${classText} is scheduled on the current game day.${typeText}`;
}

/**
 * buildWorldNewsExpandedText
 * Provides richer expanded copy for world peloton headlines.
 */
function buildWorldNewsExpandedText(item: NewsItem) {
  const title = item.title || "World news";
  const subtitle = item.subtitle || "A new world-peloton update is available.";
  const extra = item.expandedText || item.detail;
  const normalizedTitle = title.toLowerCase();

  if (extra) return `${subtitle} ${extra}`;

  if (
    normalizedTitle.includes("stage result") ||
    normalizedTitle.includes("takes the stage")
  ) {
    return `${subtitle} This world-news item is generated from published in-game stage results. It is available for races your team joined and for races your team did not join, and it links only to the related competition page.`;
  }

  if (normalizedTitle.includes("world rider ranking")) {
    return `${subtitle} This world-news item is based on the international-points ranking. It highlights a rider who is currently important in the season standings and links to the rider profile when available.`;
  }

  if (normalizedTitle.includes("team ranking")) {
    return `${subtitle} This world-news item is based on the team ranking table. It highlights a strong team performance and links to the team profile when available.`;
  }

  if (normalizedTitle.includes("today in the peloton")) {
    const readableSubtitle = buildWorldNewsSubtitle(item);
    return `${readableSubtitle} Open the competition page for the route, profile, participating teams, live/replay access, and published results when the stage is completed.`;
  }

  return `${subtitle} This is a world-peloton update generated from in-game race, rider, team, or competition data. It should link only to the related in-game page.`;
}

/**
 * buildTeamNewsItems
 * Team news = attention items + existing activity feed.
 */
function buildTeamNewsItems(
  alerts: AlertItem[],
  feed: FeedItem[],
  currentGameDateLabel: string,
): OverviewNewsListItem[] {
  const alertItems: OverviewNewsListItem[] = alerts.map((alert) => {
    const href = normalizeDashboardHref(alert.href);

    return {
      id: `alert:${alert.id}`,
      title: alert.label,
      subtitle: "Action may be required from your team management dashboard.",
      timeLabel: getOverviewCurrentGameDateTimeLabel(currentGameDateLabel),
      href,
      level: alert.level,
      sourceLabel: "Team",
      expandedText: buildTeamNewsExpandedText(
        alert.label,
        "Action may be required from your team management dashboard.",
      ),
      linkLabel: getNewsLinkLabel(href, "Team"),
    };
  });

  const feedItems: OverviewNewsListItem[] = feed.map((item) => {
    const href = normalizeDashboardHref(item.href);

    return {
      id: `feed:${item.id}`,
      title: item.title,
      subtitle: buildWorldNewsSubtitle(item),
      timeLabel: getOverviewGameTimeLabel(item.timeLabel, currentGameDateLabel),
      href,
      level: item.level,
      sourceLabel: "Team",
      expandedText: buildTeamNewsExpandedText(item.title, item.subtitle),
      linkLabel: getNewsLinkLabel(href, "Team"),
    };
  });

  return [...alertItems, ...feedItems];
}

/**
 * buildWorldNewsItems
 * World news must come from real race-world/news data, not schedule fallbacks.
 * External links are deliberately ignored; only internal game pages are allowed.
 */
function buildWorldNewsItems(
  news: NewsItem[],
  currentGameDateLabel: string,
): OverviewNewsListItem[] {
  return news.map((item) => {
    const href = normalizeDashboardHref(item.relatedHref || item.href);

    return {
      id: `world:${item.id}`,
      title: item.title,
      subtitle: buildWorldNewsSubtitle(item),
      timeLabel: getOverviewGameTimeLabel(item.timeLabel, currentGameDateLabel),
      href,
      level: "world" as const,
      sourceLabel: "World",
      expandedText: buildWorldNewsExpandedText(item),
      linkLabel: getNewsLinkLabel(href, "World"),
    };
  });
}

type OverviewNewsSortableItem = OverviewNewsListItem & {
  dateSortValue: number;
  sourceOrder: number;
  priorityScore: number;
};

const OVERVIEW_NEWS_MONTH_SORT: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function getOverviewNewsDateSortValue(
  timeLabel: string | undefined,
  currentGameDateLabel: string,
): number {
  const raw = (timeLabel ?? "").trim();
  const currentShort = getOverviewShortCurrentDateLabel(currentGameDateLabel);

  const normalized = !raw || raw.toLowerCase() === "today" ? currentShort : raw;

  const match =
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$/i.exec(
      normalized,
    );

  if (match) {
    const month =
      OVERVIEW_NEWS_MONTH_SORT[match[1].slice(0, 3).toLowerCase()] ?? 0;
    const day = Number(match[2]);

    if (month > 0 && Number.isFinite(day)) {
      return month * 100 + day;
    }
  }

  // Current-day/team news without a parseable label should stay above dated archive items.
  return 9999;
}

function normalizeOverviewNewsKeyText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[#,:;.!?()\[\]]+/g, " ")
    .replace(/\bx\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRaceNameFromOverviewNewsTitle(title: string): string | null {
  const raw = title.trim();

  const raceTodayMatch = /^race today:\s*(.+)$/i.exec(raw);
  if (raceTodayMatch?.[1]) return raceTodayMatch[1].trim();

  const raceResultsMatch = /^race results:\s*(.+)$/i.exec(raw);
  if (raceResultsMatch?.[1]) return raceResultsMatch[1].trim();

  const stageResultMatch = /^stage result:\s*(.+?)\s+stage\s+\d+\b/i.exec(raw);
  if (stageResultMatch?.[1]) return stageResultMatch[1].trim();

  return null;
}

function getOverviewNewsDedupeKey(item: OverviewNewsListItem): string {
  const normalizedTitle = normalizeOverviewNewsKeyText(item.title);
  const normalizedDate = normalizeOverviewNewsKeyText(item.timeLabel);
  const raceName = extractRaceNameFromOverviewNewsTitle(item.title);

  if (raceName) {
    return `race-event:${normalizedDate}:${normalizeOverviewNewsKeyText(raceName)}`;
  }

  if (normalizedTitle.startsWith("asset ordered")) {
    return `asset-ordered:${normalizedDate}:${normalizedTitle}`;
  }

  if (normalizedTitle.startsWith("race plan open")) {
    return `race-plan-open:${normalizedDate}:${normalizedTitle}`;
  }

  return `title:${normalizedDate}:${normalizedTitle}`;
}

function getOverviewNewsPriorityScore(item: OverviewNewsListItem): number {
  const title = item.title.toLowerCase();
  const subtitle = item.subtitle.toLowerCase();

  let score = 0;

  if (title.includes("stage result")) score += 100;
  if (title.includes("race results")) score += 95;
  if (title.includes("asset ordered") || title.includes("asset delivery"))
    score += 85;
  if (title.includes("stage plan missing") || title.includes("locks soon"))
    score += 80;
  if (title.includes("race today")) score += 65;
  if (title.includes("race plan open")) score += 45;
  if (title.includes("ranking")) score += 20;

  // Prefer the real feed/news item over a generic alert fallback when both describe the same thing.
  if (
    subtitle.includes(
      "action may be required from your team management dashboard",
    )
  )
    score -= 80;
  if (
    subtitle.includes("has been ordered") ||
    subtitle.includes("delivery is planned")
  )
    score += 70;
  if (subtitle.includes("results are available")) score += 60;
  if (item.href) score += 5;

  score += Math.min(30, item.subtitle.length / 8);

  return score;
}

function buildSortedDedupedNewsBoardItems(
  teamItems: OverviewNewsListItem[],
  worldItems: OverviewNewsListItem[],
  currentGameDateLabel: string,
  maxItems = 7,
) {
  const candidates: OverviewNewsSortableItem[] = [
    ...teamItems,
    ...worldItems,
  ].map((item, sourceOrder) => ({
    ...item,
    dateSortValue: getOverviewNewsDateSortValue(
      item.timeLabel,
      currentGameDateLabel,
    ),
    sourceOrder,
    priorityScore: getOverviewNewsPriorityScore(item),
  }));

  const byKey = new Map<string, OverviewNewsSortableItem>();

  candidates.forEach((item) => {
    const key = getOverviewNewsDedupeKey(item);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, item);
      return;
    }

    const itemScore = item.priorityScore + item.subtitle.length * 0.01;
    const existingScore =
      existing.priorityScore + existing.subtitle.length * 0.01;

    if (itemScore > existingScore) {
      byKey.set(key, item);
    }
  });

  return [...byKey.values()]
    .sort((left, right) => {
      if (right.dateSortValue !== left.dateSortValue) {
        return right.dateSortValue - left.dateSortValue;
      }

      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return left.sourceOrder - right.sourceOrder;
    })
    .slice(0, maxItems);
}

/**
 * NewsCommandCenter
 * Newsletter-style panel. Team news combines alerts and activity feed; world news uses game/news data.
 */
function NewsCommandCenter({
  alerts,
  feed,
  news,
  currentGameDateLabel,
}: {
  alerts: AlertItem[];
  feed: FeedItem[];
  news: NewsItem[];
  currentGameDateLabel: string;
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const teamNewsItems = buildTeamNewsItems(alerts, feed, currentGameDateLabel);
  const worldNewsItems = buildWorldNewsItems(news, currentGameDateLabel);
  const combinedItems = buildSortedDedupedNewsBoardItems(
    teamNewsItems,
    worldNewsItems,
    currentGameDateLabel,
    7,
  );

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle
            title="News Board"
            subtitle="Latest team and world news. Click a row to expand it."
          />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {combinedItems.length}/7
          </span>
        </div>
      </div>

      <div className="p-5">
        {combinedItems.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {combinedItems.map((item) => {
              const isExpanded = expandedId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="block w-full px-1 py-3 text-left transition hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-950">
                          {item.title}
                        </span>
                        {!isExpanded ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                              item.sourceLabel === "World"
                                ? "bg-indigo-50 text-indigo-600"
                                : "bg-emerald-50 text-emerald-600",
                            )}
                          >
                            {item.sourceLabel}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={cn(
                          "mt-1 text-sm leading-6 text-slate-500",
                          isExpanded ? "" : "line-clamp-2",
                        )}
                      >
                        {isExpanded ? item.expandedText : item.subtitle}
                      </div>
                      {isExpanded ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
                              item.sourceLabel === "World"
                                ? "bg-indigo-50 text-indigo-700"
                                : "bg-emerald-50 text-emerald-700",
                            )}
                          >
                            {item.sourceLabel} news
                          </span>

                          {item.href && item.linkLabel ? (
                            <button
                              type="button"
                              className="inline-flex rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-bold text-yellow-800 transition hover:bg-yellow-200"
                              onClick={(event) => {
                                event.stopPropagation();
                                const href = item.href ?? "";
                                if (!href) return;
                                window.location.hash = href.startsWith("#")
                                  ? href.replace(/^#/, "")
                                  : href.startsWith("/dashboard")
                                    ? href
                                    : href.replace(/^#?\//, "/");
                              }}
                            >
                              {item.linkLabel}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0 whitespace-nowrap rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                      {item.timeLabel}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No news yet"
            subtitle="Team updates, race results, ranking headlines, and world peloton news will appear here."
          />
        )}
      </div>
    </Card>
  );
}

/**
 * LastTeamRaceCard
 * Shows the latest completed race for either first squad or developing squad.
 */
function LastTeamRaceCard({
  race,
  loading,
}: {
  race: OverviewLastTeamRace | null;
  loading: boolean;
}) {
  return (
    <Card className="p-5">
      <SectionTitle
        title="Last Team Race"
        subtitle="Latest finished full race involving your first team or developing team."
      />

      {loading && !race?.raceName ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Loading latest finished full race...
        </div>
      ) : race?.raceName ? (
        <RacePreviewStrip
          raceName={race.raceName}
          raceCountryCode={race.raceCountryCode}
          raceCategory={race.raceCategory}
          stageDate={race.stageDate}
          stageLabel={race.stageLabel}
          routeLabel={null}
          stageCount={race.stageCount}
          href={race.raceId ? `#/dashboard/races/${race.raceId}` : undefined}
          compactDetails
        />
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No finished full race found for the first team or developing team yet.
        </div>
      )}
    </Card>
  );
}

/**
 * NextTeamRaceCard
 * Shows the next submitted race plan and selected riders.
 */
function NextTeamRaceCard({
  race,
  loading,
}: {
  race: OverviewNextTeamRace | null;
  loading: boolean;
}) {
  return (
    <Card className="p-5">
      <SectionTitle
        title="Next Team Race"
        subtitle="Next submitted race that has not started yet."
      />

      {loading && !race?.raceName ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Loading next submitted race plan...
        </div>
      ) : race?.raceName ? (
        <RacePreviewStrip
          raceName={race.raceName}
          raceCountryCode={race.raceCountryCode}
          raceCategory={race.raceCategory}
          stageDate={race.stageDate}
          stageLabel={race.stageLabel}
          routeLabel={null}
          stageCount={race.stageCount}
          href={race.raceId ? `#/dashboard/races/${race.raceId}` : undefined}
          compactDetails
        />
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No upcoming submitted race found for the first team or developing team
          yet.
        </div>
      )}
    </Card>
  );
}

/**
 * UpcomingRaceScheduleCard
 * Shows the next five schedule items in compact race-strip style.
 */
function UpcomingRaceScheduleCard({ schedule }: { schedule: ScheduleItem[] }) {
  return (
    <Card className="p-5">
      <SectionTitle
        title="Upcoming Schedule"
        subtitle="Next five accepted races, race deadlines, and club milestones."
      />

      {schedule.length > 0 ? (
        <div className="mt-5 space-y-3">
          {schedule.slice(0, 5).map((item) => (
            <CompactRaceStrip
              key={item.id}
              dateLabel={item.dateLabel}
              countryCode={item.countryCode}
              title={item.title}
              details={item.subtitle}
              href={item.href}
            />
          ))}
        </div>
      ) : (
        <SectionEmptyState
          title="No upcoming events"
          description="There are no accepted races, camps, deadlines, or infrastructure milestones in the current overview window."
        />
      )}
    </Card>
  );
}

/**
 * TodayRaceCard
 * Shows all races happening on the current in-game day.
 */
function TodayRaceCard({
  dateLabel,
  races,
}: {
  dateLabel: string;
  races: DayRaceItem[];
}) {
  return (
    <Card className="p-5">
      <SectionTitle
        title="This Day Races"
        subtitle={
          dateLabel
            ? `Races happening on ${dateLabel}.`
            : "Races happening on the current game day."
        }
      />

      {races.length > 0 ? (
        <div className="mt-5 space-y-3">
          {races.map((item) => (
            <CompactRaceStrip
              key={item.id}
              dateLabel={item.timeLabel || dateLabel}
              countryCode={item.countryCode}
              title={item.title}
              details={item.subtitle}
              href={item.href}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState
            title="No races on this date"
            subtitle="There are no race events scheduled for the current game day."
          />
        </div>
      )}
    </Card>
  );
}

/**
 * CompactSquadPulseCard
 * Right-rail version of squad pulse: fitness focus plus one-row status values.
 */
function CompactSquadPulseCard({ pulse }: { pulse: SquadPulse }) {
  const rowItems = [
    ["Form", pulse.form],
    ["Available", pulse.availableRiders],
    ["Injured", pulse.injured],
    ["Sick", pulse.sick],
    ["Not fully fit", pulse.notFullyFit],
    ["Contracts", pulse.expiringContracts],
  ] as Array<[string, React.ReactNode]>;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Squad Pulse"
        subtitle="Fitness and immediate squad status."
      />

      <div className="mt-4">
        <ProgressMetric
          label="Fitness"
          value={pulse.fitness}
          colorClass="bg-blue-500"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rowItems.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-slate-100 py-2 last:border-b-0"
          >
            <span className="text-slate-500">{label}</span>
            <span className="font-bold text-slate-950">{value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * CompactOperationsCard
 * Right-rail version of active operations without large boxes.
 */
function CompactOperationsCard({
  operations,
}: {
  operations: OperationItem[];
}) {
  return (
    <Card className="p-5">
      <SectionTitle
        title="Active Operations"
        subtitle="Current jobs and running processes."
      />

      {operations.length > 0 ? (
        <div className="mt-4 divide-y divide-slate-100">
          {operations.slice(0, 6).map((item) => (
            <a
              key={item.id}
              href={item.href ?? "#/dashboard"}
              className="block py-3 transition hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-950">
                    {item.title}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {item.subtitle}
                  </div>
                </div>
                {item.statusLabel ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                    {item.statusLabel}
                  </span>
                ) : null}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-sm text-slate-500">
          Nothing happening at the moment.
        </div>
      )}
    </Card>
  );
}

function SeasonSnapshotCard({ stats }: { stats: OverviewSeasonSnapshot }) {
  const items = [
    {
      label: "Races this season",
      value: stats.races,
      cardClass: "border-sky-100 bg-sky-50/70",
      valueClass: "text-sky-700",
    },
    {
      label: "Stages raced",
      value: stats.stages,
      cardClass: "border-indigo-100 bg-indigo-50/70",
      valueClass: "text-indigo-700",
    },
    {
      label: "International points",
      value: stats.internationalPoints,
      cardClass: "border-emerald-100 bg-emerald-50/70",
      valueClass: "text-emerald-700",
    },
    {
      label: "Wins",
      value: stats.wins,
      cardClass: "border-amber-100 bg-amber-50/70",
      valueClass: "text-amber-700",
    },
    {
      label: "Podiums",
      value: stats.podiums,
      cardClass: "border-fuchsia-100 bg-fuchsia-50/70",
      valueClass: "text-fuchsia-700",
    },
    {
      label: "Top 10 results",
      value: stats.top10s,
      cardClass: "border-violet-100 bg-violet-50/70",
      valueClass: "text-violet-700",
    },
    {
      label: "Jerseys",
      value: stats.jerseys,
      cardClass: "border-rose-100 bg-rose-50/70",
      valueClass: "text-rose-700",
    },
    {
      label: "Best GC",
      value: stats.bestGc ? `${stats.bestGc}.` : "—",
      cardClass: "border-cyan-100 bg-cyan-50/70",
      valueClass: "text-cyan-700",
    },
  ];

  return (
    <Card className="p-5">
      <div>
        <h3 className="text-base font-normal text-slate-900">
          Season Snapshot
        </h3>
        <p className="mt-1 text-sm font-normal text-slate-500">
          Current season results, points, podiums, jerseys, and race volume.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className={`rounded-2xl border px-4 py-4 ${item.cardClass}`}
          >
            <div className="text-[10px] font-normal uppercase tracking-[0.16em] text-slate-500">
              {item.label}
            </div>
            <div
              className={`mt-2 text-2xl font-light tabular-nums ${item.valueClass}`}
              style={{ fontWeight: 300 }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

type FinancePeriodKey = "weekly" | "monthly" | "season";

function getFinancePeriodValues(
  finance: FinanceHealth,
  period: FinancePeriodKey,
) {
  switch (period) {
    case "weekly":
      return {
        label: "Weekly",
        income: finance.weeklyOperatingIncome,
        expenses: finance.weeklyOperatingExpense,
      };
    case "season":
      return {
        label: "Season",
        income: finance.seasonOperatingIncome,
        expenses: finance.seasonOperatingExpense,
      };
    case "monthly":
    default:
      return {
        label: "Monthly",
        income: finance.monthlyOperatingIncome,
        expenses: finance.monthlyOperatingExpense,
      };
  }
}

/**
 * IncomeExpenseCard
 * Replaces the emergency debt card with a simple income/expense pie style view.
 */
function IncomeExpenseCard({ finance }: { finance: FinanceHealth }) {
  const [period, setPeriod] = React.useState<FinancePeriodKey>("monthly");

  const periodConfig = getFinancePeriodValues(finance, period);

  const income = Math.max(0, periodConfig.income);
  const expenses = Math.abs(periodConfig.expenses);
  const total = Math.max(1, income + expenses);
  const incomePct = Math.round((income / total) * 100);
  const expensePct = 100 - incomePct;
  const net = income - expenses;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-950">
            Income & Expenses
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {periodConfig.label} operating balance from real in-game finance
            transactions.
          </p>
        </div>

        <div className="shrink-0 rounded-full bg-slate-100 p-1">
          {(["weekly", "monthly", "season"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPeriod(option)}
              className={cn(
                "rounded-full px-2.5 py-1.5 text-[11px] font-bold transition",
                period === option
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              {option === "weekly"
                ? "Week"
                : option === "monthly"
                  ? "Month"
                  : "Season"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="h-36 w-36 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(#10b981 0 ${incomePct}%, #ef4444 ${incomePct}% 100%)`,
          }}
        >
          <div className="flex h-full w-full items-center justify-center rounded-full p-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-center shadow-inner">
              <div>
                <div className="text-[10px] font-medium uppercase text-slate-500">
                  Net
                </div>
                <div
                  className={cn(
                    "text-sm font-normal",
                    net >= 0 ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {formatSignedCurrency(net)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <SmallStat
            label={`Income ${incomePct}%`}
            value={formatCurrency(income)}
            valueClassName="text-emerald-600"
          />
          <SmallStat
            label={`Expenses ${expensePct}%`}
            value={formatCurrency(expenses)}
            valueClassName="text-red-600"
          />
          <SmallStat
            label="Final balance"
            value={formatSignedCurrency(net)}
            valueClassName={net >= 0 ? "text-emerald-600" : "text-red-600"}
          />
        </div>
      </div>
    </Card>
  );
}

/**
 * KpiSection
 * Moved lower on the page so it no longer dominates the top of the overview.
 */
function KpiSection({ items }: { items: KpiItem[] }) {
  if (items.length === 0) return null;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Club Snapshot"
        subtitle="Finance, points, roster, morale, and ranking metrics."
      />
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </div>
    </Card>
  );
}

/**
 * DashboardSkeleton
 * Skeleton layout while the overview data is loading.
 */
function DashboardSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 space-y-6 xl:col-span-8">
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
        </div>
        <div className="col-span-12 space-y-6 xl:col-span-4">
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
        </div>
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

/**
 * OverviewPage
 * Top-level dashboard overview page component.
 */
export default function OverviewPage() {
  const [data, setData] = React.useState<DashboardOverviewData | null>(null);
  const [raceHub, setRaceHub] = React.useState<OverviewTeamRaceHub>({
    lastTeamRace: null,
    nextTeamRace: null,
  });
  const [raceWorld, setRaceWorld] = React.useState<OverviewRaceWorldData>(
    EMPTY_RACE_WORLD_DATA,
  );
  const [attentionAlerts, setAttentionAlerts] = React.useState<AlertItem[]>([]);
  const [openedAttentionKeys, setOpenedAttentionKeys] = React.useState<Set<string>>(
    () => readOpenedAttentionKeys(),
  );
  const [squadPulseOverride, setSquadPulseOverride] =
    React.useState<SquadPulse | null>(null);
  const [seasonSnapshot, setSeasonSnapshot] =
    React.useState<OverviewSeasonSnapshot>(EMPTY_SEASON_SNAPSHOT);
  const [raceHubLoading, setRaceHubLoading] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tutorialLoading, setTutorialLoading] = React.useState(true);
  const [tutorialMode, setTutorialMode] = React.useState<
    "closed" | "invite" | "steps"
  >("closed");
  const [tutorialStepIndex, setTutorialStepIndex] = React.useState(0);
  const [menuTutorialLoading, setMenuTutorialLoading] = React.useState(true);
  const [menuTutorialMode, setMenuTutorialMode] = React.useState<
    "closed" | "invite" | "steps"
  >("closed");
  const [menuTutorialStepIndex, setMenuTutorialStepIndex] = React.useState(0);

  const dataRef = React.useRef<DashboardOverviewData | null>(null);

  React.useEffect(() => {
    dataRef.current = data;
  }, [data]);

  React.useEffect(() => {
    const refreshOpenedAttentionKeys = () => {
      setOpenedAttentionKeys(readOpenedAttentionKeys());
    };

    window.addEventListener("storage", refreshOpenedAttentionKeys);
    window.addEventListener("focus", refreshOpenedAttentionKeys);
    window.addEventListener(
      OVERVIEW_ATTENTION_DISMISSED_EVENT,
      refreshOpenedAttentionKeys,
    );

    return () => {
      window.removeEventListener("storage", refreshOpenedAttentionKeys);
      window.removeEventListener("focus", refreshOpenedAttentionKeys);
      window.removeEventListener(
        OVERVIEW_ATTENTION_DISMISSED_EVENT,
        refreshOpenedAttentionKeys,
      );
    };
  }, []);

  React.useEffect(() => {
    let alive = true;

    async function loadOverviewTutorialProgress() {
      setTutorialLoading(true);

      const autoStartMenuTutorial =
        window.sessionStorage.getItem("ppm:auto-start-tutorial") === "menu";

      if (autoStartMenuTutorial) {
        if (!alive) return;

        setTutorialMode("closed");
        setTutorialLoading(false);
        return;
      }

      const progress = await getTutorialProgress("overview");

      if (!alive) return;

      if (!progress || progress.status === "not_started") {
        setTutorialMode("invite");
      } else if (progress.status === "started") {
        const savedStepIndex = overviewTutorialSteps.findIndex(
          (step) => step.key === progress.last_step_key,
        );

        setTutorialStepIndex(savedStepIndex >= 0 ? savedStepIndex : 0);
        setTutorialMode("steps");
      } else {
        setTutorialMode("closed");
      }

      setTutorialLoading(false);
    }

    loadOverviewTutorialProgress();

    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    let alive = true;

    async function loadMenuTutorialProgress() {
      setMenuTutorialLoading(true);

      const autoStartTutorial =
        window.sessionStorage.getItem("ppm:auto-start-tutorial") === "menu";

      if (autoStartTutorial) {
        window.sessionStorage.removeItem("ppm:auto-start-tutorial");

        const firstStep = menuTutorialSteps[0];

        await saveTutorialProgress("menu", "started", firstStep?.key ?? null);

        if (!alive) return;

        setMenuTutorialStepIndex(0);
        setMenuTutorialMode("steps");
        setMenuTutorialLoading(false);
        return;
      }

      const progress = await getTutorialProgress("menu");

      if (!alive) return;

      if (progress?.status === "started") {
        const savedStepIndex = menuTutorialSteps.findIndex(
          (step) => step.key === progress.last_step_key,
        );

        setMenuTutorialStepIndex(savedStepIndex >= 0 ? savedStepIndex : 0);
        setMenuTutorialMode("steps");
      } else {
        setMenuTutorialMode("closed");
      }

      setMenuTutorialLoading(false);
    }

    void loadMenuTutorialProgress();

    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    let inFlight = false;

    /**
     * loadDashboard
     * Loads the main dashboard overview and enriches it with main sponsor logo
     * information from the sponsor dashboard when available.
     */
    async function loadDashboard(options?: { silent?: boolean }) {
      if (inFlight) return;
      inFlight = true;

      const silent = options?.silent === true;
      const hasVisibleData = !!dataRef.current;

      try {
        if (!silent && !hasVisibleData) {
          setLoading(true);
        } else if (silent) {
          setRefreshing(true);
        }

        if (!silent && !hasVisibleData) {
          setError(null);
        }

        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "get_dashboard_overview",
        );

        if (rpcError) {
          // eslint-disable-next-line no-console
          console.error("Dashboard RPC error", rpcError);
          throw new Error(
            [
              rpcError.message,
              rpcError.details,
              rpcError.hint,
              rpcError.code ? `code=${rpcError.code}` : null,
            ]
              .filter(Boolean)
              .join(" | "),
          );
        }

        if (!rpcData) {
          throw new Error("Dashboard payload is empty.");
        }

        let normalized = normalizeDashboardPayload(rpcData);

        // Try to enrich main sponsor with the signed main sponsor logo from the sponsor dashboard.
        try {
          const clubId =
            normalized.club.id && normalized.club.id.trim().length > 0
              ? normalized.club.id
              : null;

          const { data: sponsorData, error: sponsorError } = await supabase.rpc(
            "sponsor_get_dashboard",
            {
              p_club_id: clubId,
            },
          );

          if (sponsorError) {
            // eslint-disable-next-line no-console
            console.error("Sponsor dashboard RPC error", sponsorError);
          } else if (sponsorData) {
            const dashboard = sponsorData as SponsorDashboardForOverview;
            const sponsorClubId = asString(dashboard.club_id);

            if (sponsorClubId && !normalized.club.id) {
              normalized = {
                ...normalized,
                club: {
                  ...normalized.club,
                  id: sponsorClubId,
                },
              };
            }

            const signedMain = Array.isArray(dashboard.signed_sponsors)
              ? dashboard.signed_sponsors.find(
                  (s) =>
                    (s.sponsor_kind ?? "").toString().toLowerCase() === "main",
                )
              : undefined;

            if (signedMain) {
              const logoUrl =
                resolveMainSponsorLogoUrlFromDashboard(signedMain);
              const signedStatus = (signedMain.status ?? "")
                .toString()
                .toLowerCase();
              const isSignedByStatus =
                signedStatus === "signed" ||
                signedStatus === "active" ||
                signedStatus === "running" ||
                signedStatus === "current";

              normalized = {
                ...normalized,
                mainSponsor: {
                  ...normalized.mainSponsor,
                  name: signedMain.name || normalized.mainSponsor.name,
                  logoUrl: logoUrl || normalized.mainSponsor.logoUrl,
                  isActive: Boolean(logoUrl) || isSignedByStatus || true,
                  subtitle:
                    normalized.mainSponsor.subtitle &&
                    normalized.mainSponsor.subtitle !==
                      "No main sponsor deal signed yet."
                      ? normalized.mainSponsor.subtitle
                      : "Signed main sponsor deal",
                },
              };
            }
          }
        } catch (sponsorErr) {
          // Sponsor integration is non-critical for the overview; log and continue.
          // eslint-disable-next-line no-console
          console.error("Sponsor dashboard enrichment failed", sponsorErr);
        }

        try {
          const mainClubIdForOperations =
            normalized.club.id && normalized.club.id.trim().length > 0
              ? normalized.club.id
              : null;
          const loadedOperations = await loadOverviewActiveOperations(
            mainClubIdForOperations,
          );

          if (loadedOperations.length > 0) {
            normalized = {
              ...normalized,
              operations: mergeOverviewOperations(
                normalized.operations,
                loadedOperations,
              ),
            };
          }
        } catch (operationErr) {
          console.error("Active operations enrichment failed", operationErr);
        }

        try {
          const mainClubIdForFinance =
            normalized.club.id && normalized.club.id.trim().length > 0
              ? normalized.club.id
              : null;
          const seasonYearForFinance = getSeasonYearFromOverview(normalized);
          const loadedFinancePeriods =
            (await loadOverviewFinanceStatementPeriodSummary(
              mainClubIdForFinance,
              seasonYearForFinance,
            )) ??
            (await loadOverviewFinancePeriodSummary(
              mainClubIdForFinance,
              seasonYearForFinance,
            ));

          if (loadedFinancePeriods) {
            normalized = {
              ...normalized,
              finance: mergeFinancePeriodSummary(
                normalized.finance,
                loadedFinancePeriods,
              ),
            };
          }
        } catch (financeErr) {
          console.error("Finance period enrichment failed", financeErr);
        }

        const nextSerialized = stableStringify(normalized);
        const currentSerialized = stableStringify(dataRef.current);

        if (alive) {
          if (nextSerialized !== currentSerialized) {
            setData(normalized);
          }
          setError(null);
        }

        if (alive) {
          setRaceHubLoading(true);
          const mainClubId =
            normalized.club.id && normalized.club.id.trim().length > 0
              ? normalized.club.id
              : null;
          const seasonYear = getSeasonYearFromOverview(normalized);

          const [
            loadedRaceHub,
            loadedRaceWorld,
            loadedAttentionAlerts,
            loadedSquadPulse,
            loadedSeasonSnapshot,
          ] = await Promise.all([
            loadOverviewTeamRaceHub(mainClubId, seasonYear),
            loadOverviewRaceWorldData(mainClubId, seasonYear),
            loadOverviewAttentionItems(mainClubId),
            loadOverviewSquadPulse(mainClubId),
            loadOverviewSeasonSnapshot(mainClubId, seasonYear),
          ]);

          if (alive) {
            setRaceHub(loadedRaceHub);
            setRaceWorld(loadedRaceWorld);
            setAttentionAlerts(loadedAttentionAlerts);
            setSquadPulseOverride(loadedSquadPulse);
            setSeasonSnapshot(loadedSeasonSnapshot);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Dashboard load failed", err);

        if (alive && !hasVisibleData) {
          setError(
            err instanceof Error ? err.message : "Failed to load dashboard.",
          );
        }
      } finally {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
          setRaceHubLoading(false);
        }
        inFlight = false;
      }
    }

    void loadDashboard();

    const interval = window.setInterval(() => {
      void loadDashboard({ silent: true });
    }, 30000);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  async function handleStartOverviewTutorial() {
    const firstStep = overviewTutorialSteps[0];

    await saveTutorialProgress("overview", "started", firstStep?.key ?? null);

    setTutorialStepIndex(0);
    setTutorialMode("steps");
  }

  async function handleSkipOverviewTutorial() {
    const tutorialKeys = [
      "overview",
      "squad",
      "training",
      "equipment",
      "facilities",
      "calendar",
      "race-detail",
      "race-preparation",
      "team-ranking",
      "statistics",
      "transfers",
      "finance",
      "menu",
    ] as const;

    await Promise.all(
      tutorialKeys.map((tutorialKey) =>
        saveTutorialProgress(tutorialKey, "skipped", null),
      ),
    );

    setTutorialMode("closed");
  }

  async function handleNextOverviewTutorialStep() {
    const currentStep = overviewTutorialSteps[tutorialStepIndex];
    const isLastStep = tutorialStepIndex >= overviewTutorialSteps.length - 1;

    if (!isLastStep) {
      const nextIndex = tutorialStepIndex + 1;
      const nextStep = overviewTutorialSteps[nextIndex];

      await saveTutorialProgress("overview", "started", nextStep.key);

      setTutorialStepIndex(nextIndex);
      return;
    }

    await saveTutorialProgress(
      "overview",
      "completed",
      currentStep?.key ?? null,
    );

    window.sessionStorage.setItem("ppm:auto-start-tutorial", "squad");
    window.location.hash = "#/dashboard/squad";
  }

  async function handleFinishOverviewTutorialForNow() {
    const currentStep = overviewTutorialSteps[tutorialStepIndex];

    await saveTutorialProgress(
      "overview",
      "completed",
      currentStep?.key ?? null,
    );

    setTutorialMode("closed");
  }

  async function handleCloseOverviewTutorial() {
    const currentStep = overviewTutorialSteps[tutorialStepIndex];

    if (tutorialMode === "invite") {
      await saveTutorialProgress("overview", "skipped", null);
      setTutorialMode("closed");
      return;
    }

    if (tutorialMode === "steps") {
      await saveTutorialProgress(
        "overview",
        "started",
        currentStep?.key ?? null,
      );
    }

    setTutorialMode("closed");
  }

  async function handleStartMenuTutorial() {
    const firstStep = menuTutorialSteps[0];

    await saveTutorialProgress("menu", "started", firstStep?.key ?? null);

    setMenuTutorialStepIndex(0);
    setMenuTutorialMode("steps");
  }

  async function handleSkipMenuTutorial() {
    await saveTutorialProgress("menu", "skipped", null);
    setMenuTutorialMode("closed");
  }

  async function handleNextMenuTutorialStep() {
    const currentStep = menuTutorialSteps[menuTutorialStepIndex];
    const isLastStep = menuTutorialStepIndex >= menuTutorialSteps.length - 1;

    if (!isLastStep) {
      const nextIndex = menuTutorialStepIndex + 1;
      const nextStep = menuTutorialSteps[nextIndex];

      await saveTutorialProgress("menu", "started", nextStep.key);

      setMenuTutorialStepIndex(nextIndex);
      return;
    }

    await saveTutorialProgress("menu", "completed", currentStep?.key ?? null);
    setMenuTutorialMode("closed");
  }

  async function handleCloseMenuTutorial() {
    const currentStep = menuTutorialSteps[menuTutorialStepIndex];

    await saveTutorialProgress("menu", "started", currentStep?.key ?? null);

    setMenuTutorialMode("closed");
  }

  const handleOpenAttentionItem = React.useCallback(
    (alert: AlertItem) => {
      const key = getAttentionItemKey(alert);
      const clubId =
        data?.club.id && data.club.id.trim().length > 0 ? data.club.id : null;

      const dismissalKeys = new Set(getAttentionDismissalKeysFromAlert(alert));
      dismissalKeys.add(key);

      setOpenedAttentionKeys((current) => {
        const next = new Set(current);
        dismissalKeys.forEach((dismissalKey) => next.add(dismissalKey));
        persistOpenedAttentionKeys(next);
        return next;
      });

      setAttentionAlerts((current) =>
        current.filter((item) => !doAttentionDismissalKeysOverlap(item, dismissalKeys)),
      );

      setData((current) => {
        if (!current) return current;

        return {
          ...current,
          alerts: current.alerts.filter(
            (item) => !doAttentionDismissalKeysOverlap(item, dismissalKeys),
          ),
        };
      });

      void markOverviewAttentionItemOpened(alert, clubId);
      void markMatchingUnreadNotificationsReadForAttention(alert).then((markedCount) => {
        if (markedCount <= 0) return;

        setData((current) => {
          if (!current) return current;

          return {
            ...current,
            club: {
              ...current.club,
              notificationsUnread: Math.max(
                0,
                current.club.notificationsUnread - markedCount,
              ),
            },
          };
        });
      });
    },
    [data?.club.id],
  );

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="w-full space-y-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <div className="text-sm font-medium text-red-700">
            Failed to load dashboard
          </div>
          <div className="mt-1 text-sm text-red-600">
            {error ?? "Unknown error"}
          </div>
        </div>
      </div>
    );
  }

  const attentionItems = mergeOverviewAlerts(data.alerts, attentionAlerts).filter(
    (item) => !isAttentionItemDismissed(item, openedAttentionKeys),
  );
  const visibleSquadPulse = squadPulseOverride ?? data.squadPulse;

  return (
    <div className="w-full space-y-6">
      {/* Attention bubbles: single-row horizontal slider with fixed-size collapsed and expanded chips. */}
      <Card className="overflow-hidden border-slate-200/80 bg-white/95 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white shadow-sm">
                !
                {attentionItems.length > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-black text-white">
                    {attentionItems.length}
                  </span>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-950">Attention</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    Bubble tray
                  </span>
                  {refreshing ? (
                    <span className="h-2 w-2 rounded-full bg-sky-500" title="Refreshing" />
                  ) : null}
                </div>
                <p className="mt-0.5 hidden text-[11px] text-slate-500 sm:block">
                  All bubbles stay in one horizontal slider row. Scroll sideways, then click a bubble to reveal status and the open shortcut.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <a
                href="#/dashboard/inbox"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white"
              >
                Inbox
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-700">
                  {data.club.inboxUnread}
                </span>
              </a>
              <a
                href="#/dashboard/notifications"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white"
              >
                Notifications
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-black text-slate-700">
                  {data.club.notificationsUnread}
                </span>
              </a>
            </div>
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <AttentionBubbleSlider alerts={attentionItems} onOpen={handleOpenAttentionItem} />
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 space-y-6 xl:col-span-8">
            {/* Main top-left area: newsletter instead of operations */}
            <NewsCommandCenter
              alerts={attentionItems}
              feed={data.feed}
              news={
                raceWorld.worldNews.length > 0 ? raceWorld.worldNews : data.news
              }
              currentGameDateLabel={data.club.dateLabel}
            />

            <Card className="p-5">
              <SectionTitle
                title="Squad Pulse"
                subtitle="Readiness, morale, health, and contract pressure."
              />

              <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-5">
                  <ProgressMetric
                    label="Fitness"
                    value={visibleSquadPulse.fitness}
                    colorClass="bg-blue-500"
                  />
                  <ProgressMetric
                    label="Morale"
                    value={visibleSquadPulse.morale}
                    colorClass="bg-emerald-500"
                  />
                  <ProgressMetric
                    label="Readiness"
                    value={visibleSquadPulse.readiness}
                    colorClass="bg-violet-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SmallStat
                    label="Form"
                    value={visibleSquadPulse.form}
                    valueClassName="text-emerald-600"
                  />
                  <SmallStat
                    label="Available Riders"
                    value={visibleSquadPulse.availableRiders}
                  />
                  <SmallStat
                    label="Injured"
                    value={visibleSquadPulse.injured}
                    valueClassName={
                      visibleSquadPulse.injured > 0 ? "text-red-600" : ""
                    }
                  />
                  <SmallStat
                    label="Sick"
                    value={visibleSquadPulse.sick}
                    valueClassName={
                      visibleSquadPulse.sick > 0 ? "text-red-600" : ""
                    }
                  />
                  <SmallStat
                    label="Not Fully Fit"
                    value={visibleSquadPulse.notFullyFit}
                    valueClassName={
                      visibleSquadPulse.notFullyFit > 0 ? "text-yellow-600" : ""
                    }
                  />
                  <SmallStat
                    label="Expiring Contracts"
                    value={visibleSquadPulse.expiringContracts}
                    valueClassName={
                      visibleSquadPulse.expiringContracts > 0
                        ? "text-yellow-600"
                        : ""
                    }
                  />
                </div>
              </div>
            </Card>

            <UpcomingRaceScheduleCard schedule={raceWorld.upcomingSchedule} />

            <TodayRaceCard
              dateLabel={data.club.dateLabel}
              races={raceWorld.todayRaces}
            />
          </div>

          <div className="col-span-12 space-y-6 xl:col-span-4">
            {/* Main right-side replacement for Activity Feed */}
            <NextTeamRaceCard
              race={raceHub.nextTeamRace}
              loading={raceHubLoading}
            />
            <LastTeamRaceCard
              race={raceHub.lastTeamRace}
              loading={raceHubLoading}
            />

            <Card className="p-5">
              <SectionTitle
                title="Main Sponsor"
                subtitle="Primary sponsor branding and active partnership."
              />
              <div className="mt-5">
                <MainSponsorPanel sponsor={data.mainSponsor} />
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle
                title="Finance Health"
                subtitle="Cash position, recurring cost pressure, and next forecasted spend."
              />

              <div className="mt-5 space-y-3">
                <SmallStat
                  label="Balance"
                  value={formatCurrency(data.finance.balance)}
                />
                <SmallStat
                  label="Weekly Net"
                  value={formatSignedCurrency(data.finance.weeklyNet)}
                  valueClassName={
                    data.finance.weeklyNet >= 0
                      ? "text-emerald-600"
                      : "text-red-600"
                  }
                />
                <SmallStat
                  label="Sponsor Income"
                  value={formatCurrency(data.finance.sponsorIncome)}
                />
                <SmallStat
                  label="Recurring Policy Cost"
                  value={formatCurrency(data.finance.recurringPolicyCost)}
                />
                <SmallStat
                  label="Next Trip Forecast"
                  value={formatCurrency(data.finance.nextTripForecast)}
                />
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Latest Major Transaction
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {data.finance.latestTransactionLabel}
                </div>
                <div
                  className={cn(
                    "mt-1 text-sm font-bold",
                    data.finance.latestTransactionAmount >= 0
                      ? "text-emerald-600"
                      : "text-red-600",
                  )}
                >
                  {formatSignedCurrency(data.finance.latestTransactionAmount)}
                </div>
              </div>
            </Card>

            <IncomeExpenseCard finance={data.finance} />

            <CompactOperationsCard operations={data.operations} />
          </div>
        </div>

        <SeasonSnapshotCard stats={seasonSnapshot} />
      </div>

      {!tutorialLoading && tutorialMode === "invite" ? (
        <TutorialOverlay
          open
          variant="invite"
          title={overviewWelcomeTutorial.title}
          body={overviewWelcomeTutorial.body}
          primaryAction={overviewWelcomeTutorial.primaryAction}
          secondaryAction={overviewWelcomeTutorial.secondaryAction}
          onPrimary={handleStartOverviewTutorial}
          onSecondary={handleSkipOverviewTutorial}
          onClose={handleCloseOverviewTutorial}
        />
      ) : null}

      {!tutorialLoading && tutorialMode === "steps" ? (
        <TutorialOverlay
          open
          variant="panel"
          title={overviewTutorialSteps[tutorialStepIndex].title}
          body={overviewTutorialSteps[tutorialStepIndex].body}
          stepLabel={`${tutorialStepIndex + 1}/${overviewTutorialSteps.length}`}
          primaryAction={
            overviewTutorialSteps[tutorialStepIndex].primaryAction ?? "Next"
          }
          secondaryAction={
            tutorialStepIndex === overviewTutorialSteps.length - 1
              ? overviewTutorialSteps[tutorialStepIndex].secondaryAction
              : "Skip tutorial"
          }
          onPrimary={handleNextOverviewTutorialStep}
          onSecondary={
            tutorialStepIndex === overviewTutorialSteps.length - 1
              ? handleFinishOverviewTutorialForNow
              : handleSkipOverviewTutorial
          }
          onClose={handleCloseOverviewTutorial}
        />
      ) : null}

      {!menuTutorialLoading && menuTutorialMode === "invite" ? (
        <TutorialOverlay
          open
          variant="invite"
          title={menuWelcomeTutorial.title}
          body={menuWelcomeTutorial.body}
          primaryAction={menuWelcomeTutorial.primaryAction}
          secondaryAction={menuWelcomeTutorial.secondaryAction}
          onPrimary={handleStartMenuTutorial}
          onSecondary={handleSkipMenuTutorial}
          onClose={handleSkipMenuTutorial}
        />
      ) : null}

      {!menuTutorialLoading && menuTutorialMode === "steps" ? (
        <>
          <TutorialTargetFrame
            target={menuTutorialSteps[menuTutorialStepIndex].target}
          />

          <TutorialOverlay
            open
            variant="panel"
            title={menuTutorialSteps[menuTutorialStepIndex].title}
            body={menuTutorialSteps[menuTutorialStepIndex].body}
            stepLabel={`${menuTutorialStepIndex + 1}/${menuTutorialSteps.length}`}
            primaryAction={
              menuTutorialSteps[menuTutorialStepIndex].primaryAction ?? "Next"
            }
            onPrimary={handleNextMenuTutorialStep}
            onClose={handleCloseMenuTutorial}
          />
        </>
      ) : null}
    </div>
  );
}
