/**
 * src/features/squad/utils/formatters.ts
 *
 * Shared formatting helpers for squad-related pages and modals.
 *
 * Purpose:
 * - Keep display formatting logic out of page components.
 * - Reuse consistent labels/currency/date-adjacent text formatting
 *   across Squad.tsx and DevelopingTeam.tsx.
 */

/**
 * getCountryName
 * Return a localized country display name from a 2-letter code.
 */
export function getCountryName(countryCode?: string) {
  const code = countryCode?.trim().toUpperCase()

  if (!code) return 'Unknown'

  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * getFlagImageUrl
 * Helper to return a 24x18 flag image URL using flagcdn.
 */
export function getFlagImageUrl(countryCode?: string) {
  const code = countryCode?.trim().toLowerCase()

  if (!code || !/^[a-z]{2}$/.test(code)) return null

  return `https://flagcdn.com/24x18/${code}.png`
}

/**
 * formatMoney
 * Format a raw money amount with a dollar sign or dash.
 */
export function formatMoney(n?: number | null) {
  if (n == null) return '—'
  return `$${new Intl.NumberFormat('de-DE').format(n)}`
}

/**
 * formatWeeklySalary
 * Format weekly salary values like $12,000/week.
 */
export function formatWeeklySalary(n?: number | null) {
  if (n == null) return '—'
  return `${formatMoney(n)}/week`
}

/**
 * getSeasonWage
 * Convert weekly salary to full season wage using 52 weeks.
 */
export function getSeasonWage(weeklySalary?: number | null) {
  if (weeklySalary == null) return null
  return weeklySalary * 52
}

/**
 * formatSalary
 * Localized salary display or dash.
 */
export function formatSalary(value?: number | null) {
  if (value === null || value === undefined) return '—'

  const amount = new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 0,
  }).format(value)

  return `$${amount}/week`
}

/**
 * formatPlainMoney
 * Number formatting without currency suffix/prefix composition logic.
 */
export function formatPlainMoney(value?: number | null) {
  if (value === null || value === undefined) return '—'

  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * formatHealthCaseCode
 * Convert snake_case case codes into readable labels.
 *
 * Example:
 * - muscle_strain => Muscle Strain
 */
export function formatHealthCaseCode(caseCode?: string | null) {
  if (!caseCode) return null

  return caseCode
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * formatSeverityLabel
 * Capitalize severity labels for display.
 */
export function formatSeverityLabel(severity?: string | null) {
  if (!severity) return null
  return severity.charAt(0).toUpperCase() + severity.slice(1)
}

/**
 * formatCaseStageLabel
 * Normalize health case status labels for display.
 */
export function formatCaseStageLabel(caseStatus?: string | null) {
  if (!caseStatus) return null

  if (caseStatus === 'active') return 'Active'
  if (caseStatus === 'recovering') return 'Recovering'
  if (caseStatus === 'resolved') return 'Resolved'

  return caseStatus.charAt(0).toUpperCase() + caseStatus.slice(1)
}

/**
 * formatBlockFlag
 * Convert boolean block flags into UI labels.
 */
export function formatBlockFlag(value?: boolean | null) {
  return value ? 'Blocked' : 'Allowed'
}

/**
 * formatUnavailableReason
 * Normalize rider unavailable reason labels for display.
 */
export function formatUnavailableReason(reason?: string | null) {
  if (!reason) return null

  const normalized = reason.trim().toLowerCase()

  if (normalized === 'injury') return 'Injury'
  if (normalized === 'sickness') return 'Sickness'

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}
