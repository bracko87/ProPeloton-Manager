/**
 * src/pages/dashboard/Staff.tsx
 *
 * Staff page (dashboard/staff)
 *
 * Live v1:
 * - Resolves the user's main club
 * - Loads active staff from public.club_staff
 * - Loads infrastructure state from public.club_infrastructure
 * - Reads Developing Team unlock status for top navigation
 * - Reads current game date from backend
 * - Always shows the 5 core role slots
 * - Missing roles render as vacancies
 * - Facility levels can mark roles as Limited
 * - Release Staff is live via public.release_club_staff(...)
 * - Extend Contract is live via:
 *   - public.staff_get_contract_extension_quote(...)
 *   - public.extend_club_staff_contract(...)
 * - All popups use blurred background
 * - Release confirmation uses custom modal instead of window.confirm
 * - Extend Contract cancel returns to the staff detail window
 * - Staff detail modal shows 6 staff attributes
 * - Staff Course button restored with UI preview modal
 * - Active staff courses load and display on cards/detail modal
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { supabase } from '../../lib/supabase'

type StaffRole =
  | 'head_coach'
  | 'team_doctor'
  | 'mechanic'
  | 'sport_director'
  | 'scout_analyst'

type StaffCategory =
  | 'performance'
  | 'medical_technical'
  | 'tactical_recruitment'

type StaffStatus = 'active' | 'vacant' | 'limited'

type ClubRow = {
  id: string
  club_type: string | null
  parent_club_id: string | null
  deleted_at: string | null
  name?: string | null
}

type ClubStaffRow = {
  id: string
  club_id: string
  role_type: StaffRole
  specialization: string | null
  team_scope: 'first_team' | 'u23' | 'all'
  staff_name: string
  country_code: string | null
  expertise: number
  experience: number
  potential: number
  leadership: number
  efficiency: number
  loyalty: number
  salary_weekly: number
  contract_expires_at: string | null
  is_active: boolean
  notes: Record<string, unknown> | null
}

type ClubInfrastructureRow = {
  club_id: string
  hq_level: number
  training_center_level: number
  medical_center_level: number
  scouting_level: number
  youth_academy_level: number
  mechanics_workshop_level: number
}

type DevelopingTeamStatusRow = {
  is_purchased: boolean
  developing_club_id?: string | null
  main_club_id?: string | null
}

type StaffStat = {
  label: string
  value: number
}

type StaffActiveCourse = {
  id: string
  code: string
  title: string
  focusLabel: string
  startedGameDate: string
  completesOnGameDate: string
  durationDays: number
  costCash: number
  status: string
}

type ActiveStaffCourseRow = {
  course_id: string
  staff_id: string
  course_code: string
  course_title: string
  focus_label: string
  status: string
  started_game_date: string
  completes_on_game_date: string
  duration_days: number
  cost_cash: number
}

type RecentStaffCourseResultRow = {
  course_id: string
  staff_id: string
  staff_name: string
  role_type: string
  course_code: string
  course_title: string
  focus_label: string
  completed_game_date: string | null
  expertise_gain: number
  experience_gain: number
  potential_gain: number
  leadership_gain: number
  efficiency_gain: number
  loyalty_gain: number
}

type StaffMember = {
  id: string
  name: string
  countryCode: string
  specialization: string
  salaryWeekly: number
  contractExpiresAt: string | null
  contractPrimaryLabel: string
  contractSecondaryLabel: string
  teamScope: 'first_team' | 'u23' | 'all'
  stats: StaffStat[]
  effects: string[]
  activeCourse: StaffActiveCourse | null
}

type StaffSlot = {
  role: StaffRole
  roleLabel: string
  category: StaffCategory
  status: StaffStatus
  statusLabel: string
  member: StaffMember | null
  warning?: string | null
  vacancyNote?: string
  futureNote?: string
}

type StaffCapacityInfo = {
  supportedCount: number
  totalCount: number
  unsupportedRoleLabels: string[]
}

type ExtendContractQuoteRow = {
  staff_id: string
  staff_name: string
  role_type: string
  current_salary_weekly: number
  requested_salary_weekly: number
  minimum_acceptable_salary_weekly: number
  requested_raise_percent: number
  target_contract_expires_at: string
  target_season_number: number
}

type StaffCourseRow = {
  id: string
  club_id: string
  staff_id: string
  course_code: string
  course_title: string
  focus_label: string
  status: string
  started_game_date: string
  completes_on_game_date: string
  duration_days: number
  cost_cash: number
  expertise_gain: number
  experience_gain: number
  potential_gain: number
  leadership_gain: number
  efficiency_gain: number
  loyalty_gain: number
  metadata: Record<string, unknown> | null
}

type CourseOption = {
  code: string
  title: string
  description: string
  durationDays: number
  costCash: number
  focusLabel: string
}

function TopNav({ hasDevelopingTeam }: { hasDevelopingTeam: boolean }) {
  const location = useLocation()
  const isActive = (path: string) => location.pathname === path

  return (
    <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 className="mb-2 text-xl font-semibold">Staff</h2>
        <div className="text-sm text-gray-500">
          Coaches, doctors, scouts and contracts management.
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
        <a
          href="#/dashboard/squad"
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            isActive('/dashboard/squad')
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          First Squad
        </a>

        {hasDevelopingTeam ? (
          <a
            href="#/dashboard/developing-team"
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              isActive('/dashboard/developing-team')
                ? 'bg-yellow-400 text-black'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Developing Team
          </a>
        ) : (
          <span
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-gray-400"
            title="Unlock Developing Team in Preferences first."
            aria-disabled="true"
          >
            <span>Developing Team</span>
            <span aria-hidden="true">🔒</span>
          </span>
        )}

        <a
          href="#/dashboard/staff"
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            isActive('/dashboard/staff')
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Staff
        </a>
      </div>
    </div>
  )
}

function normalizeRpcSingle<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T) ?? null
  }

  return (value as T) ?? null
}

function normalizeGameDateValue(value: unknown): string | null {
  if (!value) return null

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const first = value[0]

    if (typeof first === 'string') return first

    if (first && typeof first === 'object') {
      const row = first as Record<string, unknown>

      if (typeof row.get_current_game_date_date === 'string') {
        return row.get_current_game_date_date
      }

      if (typeof row.current_game_date === 'string') {
        return row.current_game_date
      }

      if (typeof row.game_date === 'string') {
        return row.game_date
      }
    }
  }

  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>

    if (typeof row.get_current_game_date_date === 'string') {
      return row.get_current_game_date_date
    }

    if (typeof row.current_game_date === 'string') {
      return row.current_game_date
    }

    if (typeof row.game_date === 'string') {
      return row.game_date
    }
  }

  return null
}

function parseIsoDateUtc(value: string | null | undefined) {
  if (!value) return null

  const parts = value.split('-').map(Number)
  if (parts.length !== 3) return null

  const [year, month, day] = parts
  if (!year || !month || !day) return null

  return new Date(Date.UTC(year, month - 1, day))
}

function getSeasonNumberFromDate(value: string | null | undefined) {
  const date = parseIsoDateUtc(value)
  if (!date) return null
  return date.getUTCFullYear() - 1999
}

function formatGameDateShort(value: string | null | undefined) {
  const date = parseIsoDateUtc(value)
  if (!date) return 'No contract date'

  const shortLabel = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })

  const seasonNumber = getSeasonNumberFromDate(value)

  return `Season ${seasonNumber ?? '?'} - ${shortLabel}`
}

function getDaysRemaining(dateValue: string | null | undefined, currentGameDate: string | null) {
  const target = parseIsoDateUtc(dateValue)
  const current = parseIsoDateUtc(currentGameDate)

  if (!target || !current) return null

  const diffMs = target.getTime() - current.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function formatContractUi(dateValue: string | null, currentGameDate: string | null) {
  if (!dateValue) {
    return {
      primary: 'No contract date',
      secondary: '',
    }
  }

  const primary = formatGameDateShort(dateValue)
  const daysRemaining = getDaysRemaining(dateValue, currentGameDate)

  let secondary = ''

  if (daysRemaining !== null) {
    if (daysRemaining < 0) {
      secondary = 'Expired'
    } else if (daysRemaining === 0) {
      secondary = 'Expires today'
    } else if (daysRemaining === 1) {
      secondary = '1 day left'
    } else {
      secondary = `${daysRemaining} days left`
    }
  }

  return {
    primary,
    secondary,
  }
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString('de-DE')}`
}

function getStaffReleaseCost(salaryWeekly: number) {
  return Math.max(0, salaryWeekly * 6)
}

function getStatusClasses(status: StaffStatus) {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700'
    case 'limited':
      return 'bg-yellow-100 text-yellow-700'
    case 'vacant':
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

function getCountryFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

function safeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode || countryCode.length !== 2) return 'rs'
  return countryCode.toLowerCase()
}

function buildCourseOptions(role: StaffRole): CourseOption[] {
  if (role === 'head_coach') {
    return [
      {
        code: 'coach_elite_methodology',
        title: 'Elite Methodology Course',
        description: 'Improves training structure and overall rider progression quality.',
        durationDays: 21,
        costCash: 8000,
        focusLabel: 'Training + Development',
      },
      {
        code: 'coach_recovery_planning',
        title: 'Recovery Planning Seminar',
        description: 'Focus on load balancing, fatigue prevention and micro-cycle planning.',
        durationDays: 14,
        costCash: 5500,
        focusLabel: 'Recovery Planning',
      },
      {
        code: 'coach_youth_programme',
        title: 'Youth Development Programme',
        description: 'Specialised course for improving work with young and developing riders.',
        durationDays: 28,
        costCash: 9000,
        focusLabel: 'Youth Development',
      },
    ]
  }

  if (role === 'team_doctor') {
    return [
      {
        code: 'doctor_sports_medicine',
        title: 'Sports Medicine Course',
        description: 'Improves diagnosis quality and athlete-specific treatment decisions.',
        durationDays: 21,
        costCash: 8500,
        focusLabel: 'Diagnosis + Recovery',
      },
      {
        code: 'doctor_prevention_lab',
        title: 'Injury Prevention Lab',
        description: 'Focuses on risk screening and preventive protocols.',
        durationDays: 14,
        costCash: 6000,
        focusLabel: 'Prevention',
      },
      {
        code: 'doctor_rehab_acceleration',
        title: 'Rehab Acceleration Programme',
        description: 'Advanced rehab planning for shorter return timelines.',
        durationDays: 28,
        costCash: 9500,
        focusLabel: 'Recovery Speed',
      },
    ]
  }

  if (role === 'mechanic') {
    return [
      {
        code: 'mechanic_tt_setup',
        title: 'Time Trial Setup Course',
        description: 'Advanced aerodynamic fitting and TT position optimisation.',
        durationDays: 18,
        costCash: 7000,
        focusLabel: 'Setup',
      },
      {
        code: 'mechanic_reliability',
        title: 'Reliability Workshop',
        description: 'Improves equipment consistency and race-day reliability.',
        durationDays: 14,
        costCash: 5200,
        focusLabel: 'Reliability',
      },
      {
        code: 'mechanic_weather_adaptation',
        title: 'Weather Adaptation Training',
        description: 'Focuses on technical support in wet and mixed conditions.',
        durationDays: 16,
        costCash: 5800,
        focusLabel: 'Conditions Support',
      },
    ]
  }

  if (role === 'sport_director') {
    return [
      {
        code: 'director_tactics',
        title: 'Race Tactics Seminar',
        description: 'Improves tactical calls, pacing plans and race management decisions.',
        durationDays: 18,
        costCash: 7200,
        focusLabel: 'Tactics',
      },
      {
        code: 'director_leadership',
        title: 'Leadership Intensive',
        description: 'Strengthens motivation, leadership and intra-team communication.',
        durationDays: 14,
        costCash: 5000,
        focusLabel: 'Leadership',
      },
      {
        code: 'director_stage_strategy',
        title: 'Stage Strategy Programme',
        description: 'Specialized tactical planning for stage races and GC support.',
        durationDays: 24,
        costCash: 8600,
        focusLabel: 'Stage Strategy',
      },
    ]
  }

  return [
    {
      code: 'scout_evaluation',
      title: 'Evaluation Accuracy Course',
      description: 'Improves rider assessment and report quality.',
      durationDays: 18,
      costCash: 6200,
      focusLabel: 'Evaluation',
    },
    {
      code: 'scout_networking',
      title: 'Scouting Network Camp',
      description: 'Builds connections and improves talent identification coverage.',
      durationDays: 20,
      costCash: 6800,
      focusLabel: 'Network',
    },
    {
      code: 'scout_data_analysis',
      title: 'Performance Data Analysis',
      description: 'Improves analytical review of riders and race preparation reports.',
      durationDays: 16,
      costCash: 5900,
      focusLabel: 'Accuracy + Analysis',
    },
  ]
}

function SummaryCard({
  label,
  value,
  subtext,
}: {
  label: string
  value: string
  subtext?: string
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-gray-900">{value}</div>
      {subtext ? <div className="mt-1 text-xs text-gray-500">{subtext}</div> : null}
    </div>
  )
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  )
}

function StaffRoleCard({
  slot,
  onOpen,
}: {
  slot: StaffSlot
  onOpen: (slot: StaffSlot) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(slot)}
      className="w-full rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-gray-200 hover:shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">{slot.roleLabel}</div>
          <div className="mt-1 text-xs text-gray-500">
            {slot.member ? slot.member.specialization : 'No staff member assigned'}
          </div>
        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClasses(slot.status)}`}
        >
          {slot.statusLabel}
        </span>
      </div>

      <div className="mt-4">
        {slot.member ? (
          <>
            <div className="flex items-center gap-3">
              <img
                src={getCountryFlagUrl(safeCountryCode(slot.member.countryCode))}
                alt={slot.member.countryCode}
                className="h-4 w-6 rounded-sm border border-gray-200 object-cover"
              />
              <div className="text-sm font-medium text-gray-800">{slot.member.name}</div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {slot.member.stats.slice(0, 3).map((stat) => (
                <div key={stat.label} className="rounded-lg bg-gray-50 p-2">
                  <div className="text-[11px] text-gray-500">{stat.label}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{stat.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-start justify-between gap-4 text-xs text-gray-500">
              <span>{formatCurrency(slot.member.salaryWeekly)}/week</span>
              <div className="text-right">
                <div>{slot.member.contractPrimaryLabel}</div>
                {slot.member.contractSecondaryLabel ? (
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {slot.member.contractSecondaryLabel}
                  </div>
                ) : null}
              </div>
            </div>

            {slot.member.activeCourse ? (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                <div className="text-xs font-medium text-blue-900">On Course</div>
                <div className="mt-1 text-xs text-blue-800">{slot.member.activeCourse.title}</div>
                <div className="mt-1 text-[11px] text-blue-700">
                  Completes: {formatGameDateShort(slot.member.activeCourse.completesOnGameDate)}
                </div>
              </div>
            ) : null}

            <div className="mt-3 space-y-1">
              {slot.member.effects.slice(0, 2).map((effect) => (
                <div key={effect} className="text-xs text-gray-600">
                  • {effect}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
              {slot.vacancyNote || 'No staff member assigned to this role.'}
            </div>

            {slot.futureNote ? (
              <div className="mt-3 text-xs text-gray-500">Future: {slot.futureNote}</div>
            ) : null}
          </>
        )}
      </div>

      {slot.warning ? (
        <div className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
          {slot.warning}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">
          {slot.member ? 'View details' : 'Open role'}
        </span>
        <span className="text-sm font-semibold text-gray-400">→</span>
      </div>
    </button>
  )
}

function StaffDetailModal({
  slot,
  onClose,
  onRequestRelease,
  onRequestExtend,
  onRequestCourse,
}: {
  slot: StaffSlot | null
  onClose: () => void
  onRequestRelease: (slot: StaffSlot) => void
  onRequestExtend: (slot: StaffSlot) => void
  onRequestCourse: (slot: StaffSlot) => void
}) {
  if (!slot) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-5">
          <div>
            <div className="text-lg font-semibold text-gray-900">{slot.roleLabel}</div>
            <div className="mt-1 text-sm text-gray-500">
              {slot.member ? slot.member.specialization : 'Vacant position'}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="p-5">
          {slot.member ? (
            <>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
                <div className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={getCountryFlagUrl(safeCountryCode(slot.member.countryCode))}
                      alt={slot.member.countryCode}
                      className="h-5 w-7 rounded-sm border border-gray-200 object-cover"
                    />
                    <div>
                      <div className="font-semibold text-gray-900">{slot.member.name}</div>
                      <div className="text-sm text-gray-500">
                        Scope: {slot.member.teamScope.replace('_', ' ')}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="text-xs text-gray-500">Weekly Wage</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {formatCurrency(slot.member.salaryWeekly)}
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="text-xs text-gray-500">Contract</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {slot.member.contractPrimaryLabel}
                      </div>
                      {slot.member.contractSecondaryLabel ? (
                        <div className="mt-1 text-xs text-gray-500">
                          {slot.member.contractSecondaryLabel}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {slot.member.activeCourse ? (
                    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                      <div className="text-sm font-semibold text-blue-900">Current Course</div>
                      <div className="mt-2 text-sm text-blue-800">
                        {slot.member.activeCourse.title}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-blue-700">
                        <div>Focus: {slot.member.activeCourse.focusLabel}</div>
                        <div>Duration: {slot.member.activeCourse.durationDays} days</div>
                        <div>
                          Completion:{' '}
                          {formatGameDateShort(slot.member.activeCourse.completesOnGameDate)}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-blue-700">
                        This course cannot be canceled once booked. Staff bonuses from this role
                        are paused until completion.
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <div className="text-sm font-semibold text-gray-900">Active Effects</div>
                    <div className="mt-2 space-y-2">
                      {slot.member.effects.map((effect) => (
                        <div
                          key={effect}
                          className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                        >
                          {effect}
                        </div>
                      ))}
                    </div>
                  </div>

                  {slot.warning ? (
                    <div className="mt-4 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
                      {slot.warning}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-gray-100 p-4">
                  <div className="text-sm font-semibold text-gray-900">Staff Attributes</div>
                  <div className="mt-3 space-y-2">
                    {slot.member.stats.map((stat) => (
                      <div
                        key={stat.label}
                        className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                      >
                        <span className="text-sm text-gray-600">{stat.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onRequestExtend(slot)}
                  className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-300"
                >
                  Extend Contract
                </button>

                <button
                  type="button"
                  onClick={() => onRequestCourse(slot)}
                  disabled={Boolean(slot.member.activeCourse)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    slot.member.activeCourse
                      ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {slot.member.activeCourse ? 'Course In Progress' : 'Send on Course'}
                </button>

                <button
                  type="button"
                  onClick={() => onRequestRelease(slot)}
                  className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Release
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5">
                <div className="text-sm font-semibold text-gray-900">Vacancy</div>
                <div className="mt-2 text-sm text-gray-500">
                  {slot.vacancyNote || 'This role currently has no assigned staff member.'}
                </div>

                {slot.futureNote ? (
                  <div className="mt-3 text-sm text-gray-500">
                    Planned function: {slot.futureNote}
                  </div>
                ) : null}

                {slot.warning ? (
                  <div className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
                    {slot.warning}
                  </div>
                ) : null}

                <div className="mt-5">
                  <a
                    href="#/dashboard/transfers?tab=staff"
                    className="inline-flex rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-300"
                  >
                    Find Staff
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ReleaseConfirmModal({
  slot,
  loading,
  onCancel,
  onConfirm,
}: {
  slot: StaffSlot | null
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!slot?.member) return null

  const releaseCost = getStaffReleaseCost(slot.member.salaryWeekly)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="text-lg font-semibold text-gray-900">Release Staff</div>
          <div className="mt-1 text-sm text-gray-500">
            Confirm this staff decision before continuing.
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <div className="text-sm font-medium text-red-800">
              You are about to release <span className="font-semibold">{slot.member.name}</span>
            </div>
            <div className="mt-1 text-sm text-red-700">Role: {slot.roleLabel}</div>
            <div className="mt-1 text-sm text-red-700">
              Weekly wage: {formatCurrency(slot.member.salaryWeekly)}
            </div>
            <div className="mt-1 text-sm font-semibold text-red-800">
              Release compensation (6 weeks): {formatCurrency(releaseCost)}
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            This will make the role vacant immediately. Staff bonuses from this role will stop until
            you sign a replacement.
          </div>

          <div className="mt-2 text-sm text-gray-600">
            The club will pay a one-time release compensation equal to 6 weeks of salary.
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                loading
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                loading
                  ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                  : 'bg-red-600 text-white hover:bg-red-500'
              }`}
            >
              {loading ? 'Releasing...' : 'Confirm Release'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExtendContractModal({
  slot,
  currentGameDate,
  seasons,
  setSeasons,
  quote,
  loading,
  submitting,
  salaryInput,
  setSalaryInput,
  error,
  onCancel,
  onConfirm,
}: {
  slot: StaffSlot | null
  currentGameDate: string | null
  seasons: 1 | 2
  setSeasons: (value: 1 | 2) => void
  quote: ExtendContractQuoteRow | null
  loading: boolean
  submitting: boolean
  salaryInput: string
  setSalaryInput: (value: string) => void
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!slot?.member) return null

  const targetContractUi = formatContractUi(
    quote?.target_contract_expires_at ?? null,
    currentGameDate
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="text-lg font-semibold text-gray-900">Extend Contract</div>
          <div className="mt-1 text-sm text-gray-500">
            Negotiate a new staff deal for {slot.member.name}.
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs text-gray-500">Current Salary</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {formatCurrency(slot.member.salaryWeekly)}/week
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs text-gray-500">Current Contract</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {slot.member.contractPrimaryLabel}
              </div>
              {slot.member.contractSecondaryLabel ? (
                <div className="mt-1 text-xs text-gray-500">
                  {slot.member.contractSecondaryLabel}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <div className="text-sm font-semibold text-gray-900">Extension Length</div>
            <div className="mt-3 inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setSeasons(1)}
                disabled={loading || submitting}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  seasons === 1
                    ? 'bg-yellow-400 text-black'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                1 Season
              </button>

              <button
                type="button"
                onClick={() => setSeasons(2)}
                disabled={loading || submitting}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  seasons === 2
                    ? 'bg-yellow-400 text-black'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                2 Seasons
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
            {loading ? (
              <div className="text-sm text-gray-500">Loading contract quote...</div>
            ) : quote ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs text-gray-500">Requested Salary</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(quote.requested_salary_weekly)}/week
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Raise request: {quote.requested_raise_percent}%
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Minimum Acceptable</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(quote.minimum_acceptable_salary_weekly)}/week
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500">New Contract Target</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {targetContractUi.primary}
                  </div>
                  {targetContractUi.secondary ? (
                    <div className="mt-1 text-xs text-gray-500">{targetContractUi.secondary}</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No quote available.</div>
            )}
          </div>

          <div className="mt-5">
            <label className="block text-sm font-semibold text-gray-900">Your Salary Offer</label>
            <div className="mt-2 flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2">
              <span className="mr-2 text-sm text-gray-500">$</span>
              <input
                type="number"
                min={0}
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                disabled={loading || submitting}
                className="w-full bg-transparent text-sm text-gray-900 outline-none"
                placeholder="Enter weekly salary"
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                submitting
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading || submitting || !salaryInput.trim()}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                loading || submitting || !salaryInput.trim()
                  ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                  : 'bg-yellow-400 text-black hover:bg-yellow-300'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit Offer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StaffCourseModal({
  slot,
  startingCourseCode,
  error,
  onCancel,
  onStartCourse,
}: {
  slot: StaffSlot | null
  startingCourseCode: string | null
  error: string | null
  onCancel: () => void
  onStartCourse: (courseCode: string) => void
}) {
  if (!slot?.member) return null

  const courseOptions = buildCourseOptions(slot.role)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="text-lg font-semibold text-gray-900">Staff Course</div>
          <div className="mt-1 text-sm text-gray-500">
            Plan development work for {slot.member.name}.
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="text-sm font-medium text-blue-900">Live course start</div>
            <div className="mt-1 text-sm text-blue-800">
              Starting a course creates a real staff course entry. Stat gains apply when the
              backend completion processor finishes the course. Courses cannot be canceled once
              booked. Staff bonuses from this role are paused until the course is completed.
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courseOptions.map((option) => (
              <div
                key={option.code}
                className="rounded-xl border border-gray-100 bg-gray-50 p-4"
              >
                <div className="text-sm font-semibold text-gray-900">{option.title}</div>
                <div className="mt-2 text-sm text-gray-600">{option.description}</div>

                <div className="mt-4 space-y-1 text-xs text-gray-500">
                  <div>Focus: {option.focusLabel}</div>
                  <div>Duration: {option.durationDays} days</div>
                  <div>Cost: {formatCurrency(option.costCash)}</div>
                </div>

                <button
                  type="button"
                  onClick={() => onStartCourse(option.code)}
                  disabled={startingCourseCode !== null}
                  className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium transition ${
                    startingCourseCode !== null
                      ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                      : 'bg-yellow-400 text-black hover:bg-yellow-300'
                  }`}
                >
                  {startingCourseCode === option.code ? 'Starting...' : 'Start Course'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={startingCourseCode !== null}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                startingCourseCode !== null
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Back to Staff
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function resolveMainClub(rows: ClubRow[]) {
  if (!rows.length) return null

  const exactMain = rows.find(
    (club) =>
      club.deleted_at == null &&
      club.parent_club_id == null &&
      club.club_type !== 'developing'
  )

  if (exactMain) return exactMain

  const fallbackNonDeveloping = rows.find(
    (club) => club.deleted_at == null && club.club_type !== 'developing'
  )

  if (fallbackNonDeveloping) return fallbackNonDeveloping

  return rows.find((club) => club.deleted_at == null) || null
}

function buildEffects(role: StaffRole, row: ClubStaffRow): string[] {
  if (role === 'head_coach') {
    const trainingBonus = Math.max(3, Math.floor(row.expertise / 10))
    const devBonus = Math.max(2, Math.floor(row.efficiency / 15))
    const overloadReduction = Math.max(3, Math.floor(row.experience / 14))

    const focusText = row.specialization
      ? `${row.specialization} training efficiency`
      : 'training efficiency'

    return [
      `+${trainingBonus}% ${focusText}`,
      `+${devBonus}% development support`,
      `-${overloadReduction}% overload risk`,
    ]
  }

  if (role === 'team_doctor') {
    const riskReduction = Math.max(4, Math.floor(row.expertise / 10))
    const recoveryReduction = Math.max(4, Math.floor(row.efficiency / 12))
    const dailyRecovery = Math.max(1, Math.floor(row.experience / 30))

    return [
      `-${riskReduction}% injury and sickness risk`,
      `-${recoveryReduction}% recovery duration`,
      `+${dailyRecovery} daily recovery`,
    ]
  }

  if (role === 'mechanic') {
    const setupBonus = Math.max(2, Math.floor(row.expertise / 15))
    const reliabilityBonus = Math.max(2, Math.floor(row.efficiency / 18))

    return [
      `+${setupBonus}% setup quality`,
      `-${reliabilityBonus}% mechanical issue risk`,
      'Future: weather and terrain setup bonuses',
    ]
  }

  if (role === 'sport_director') {
    const tacticsBonus = Math.max(2, Math.floor(row.expertise / 15))
    const moraleStability = Math.max(1, Math.floor(row.leadership / 20))

    return [
      `+${tacticsBonus}% tactical support`,
      `+${moraleStability}% morale stability`,
      'Future: smarter leader/domestique execution',
    ]
  }

  const scoutingBonus = Math.max(2, Math.floor(row.expertise / 15))
  const prospectBonus = Math.max(2, Math.floor(row.experience / 18))

  return [
    `+${scoutingBonus}% scouting accuracy`,
    `+${prospectBonus}% prospect visibility`,
    'Future: transfer intelligence and youth reports',
  ]
}

function mapStats(role: StaffRole, row: ClubStaffRow): StaffStat[] {
  if (role === 'head_coach') {
    return [
      { label: 'Training', value: row.expertise },
      { label: 'Recovery Planning', value: row.efficiency },
      { label: 'Youth Development', value: row.potential },
      { label: 'Experience', value: row.experience },
      { label: 'Leadership', value: row.leadership },
      { label: 'Loyalty', value: row.loyalty },
    ]
  }

  if (role === 'team_doctor') {
    return [
      { label: 'Recovery', value: row.expertise },
      { label: 'Prevention', value: row.efficiency },
      { label: 'Diagnosis', value: row.experience },
      { label: 'Potential', value: row.potential },
      { label: 'Leadership', value: row.leadership },
      { label: 'Loyalty', value: row.loyalty },
    ]
  }

  if (role === 'mechanic') {
    return [
      { label: 'Setup', value: row.expertise },
      { label: 'Reliability', value: row.efficiency },
      { label: 'Innovation', value: row.potential },
      { label: 'Experience', value: row.experience },
      { label: 'Discipline', value: row.leadership },
      { label: 'Loyalty', value: row.loyalty },
    ]
  }

  if (role === 'sport_director') {
    return [
      { label: 'Tactics', value: row.expertise },
      { label: 'Motivation', value: row.leadership },
      { label: 'Organization', value: row.efficiency },
      { label: 'Experience', value: row.experience },
      { label: 'Long-Term Vision', value: row.potential },
      { label: 'Loyalty', value: row.loyalty },
    ]
  }

  return [
    { label: 'Evaluation', value: row.expertise },
    { label: 'Network', value: row.experience },
    { label: 'Accuracy', value: row.efficiency },
    { label: 'Prospect Sense', value: row.potential },
    { label: 'Communication', value: row.leadership },
    { label: 'Loyalty', value: row.loyalty },
  ]
}

function getBaseSlots(): StaffSlot[] {
  return [
    {
      role: 'head_coach',
      roleLabel: 'Head Coach',
      category: 'performance',
      status: 'vacant',
      statusLabel: 'Vacant',
      member: null,
      vacancyNote:
        'No head coach assigned. Training quality and rider development are reduced.',
    },
    {
      role: 'team_doctor',
      roleLabel: 'Team Doctor',
      category: 'medical_technical',
      status: 'vacant',
      statusLabel: 'Vacant',
      member: null,
      vacancyNote:
        'No team doctor assigned. Recovery quality and medical prevention are reduced.',
    },
    {
      role: 'mechanic',
      roleLabel: 'Mechanic',
      category: 'medical_technical',
      status: 'vacant',
      statusLabel: 'Vacant',
      member: null,
      vacancyNote:
        'No mechanic employed. Mechanical reliability and race setup support are not covered.',
      futureNote:
        'TT setup, cobble durability, wet-weather reliability, mechanical incident reduction',
    },
    {
      role: 'sport_director',
      roleLabel: 'Sport Director',
      category: 'tactical_recruitment',
      status: 'vacant',
      statusLabel: 'Vacant',
      member: null,
      vacancyNote:
        'No sport director assigned. Tactical organization and leadership support are reduced.',
      futureNote:
        'Domestique coordination, stage tactics, leadout execution, energy saving',
    },
    {
      role: 'scout_analyst',
      roleLabel: 'Scout / Analyst',
      category: 'tactical_recruitment',
      status: 'vacant',
      statusLabel: 'Vacant',
      member: null,
      vacancyNote:
        'No scouting coverage. Youth discovery and transfer visibility are reduced.',
      futureNote:
        'Transfer scouting, youth reports, hidden stat visibility, race prep intelligence',
    },
  ]
}

function buildStaffSlotsFromRows(
  staffRows: ClubStaffRow[],
  infrastructure: ClubInfrastructureRow | null,
  currentGameDate: string | null,
  activeCourseByStaffId: Map<string, StaffActiveCourse>
): StaffSlot[] {
  const slots = getBaseSlots()

  for (const row of staffRows) {
    const slot = slots.find((s) => s.role === row.role_type)
    if (!slot) continue

    const contractUi = formatContractUi(row.contract_expires_at, currentGameDate)

    slot.member = {
      id: row.id,
      name: row.staff_name,
      countryCode: row.country_code || 'RS',
      specialization: row.specialization || 'General',
      salaryWeekly: row.salary_weekly,
      contractExpiresAt: row.contract_expires_at,
      contractPrimaryLabel: contractUi.primary,
      contractSecondaryLabel: contractUi.secondary,
      teamScope: row.team_scope,
      stats: mapStats(row.role_type, row),
      effects: buildEffects(row.role_type, row),
      activeCourse: activeCourseByStaffId.get(row.id) ?? null,
    }

    slot.status = 'active'
    slot.statusLabel = 'Active'
  }

  return applyInfrastructureWarnings(slots, infrastructure)
}

function applyInfrastructureWarnings(
  slots: StaffSlot[],
  infrastructure: ClubInfrastructureRow | null
) {
  return slots.map((slot) => {
    if (!infrastructure) return slot

    if (slot.role === 'head_coach' && infrastructure.training_center_level <= 0) {
      return {
        ...slot,
        status: slot.member ? ('limited' as const) : slot.status,
        statusLabel: slot.member ? 'Limited' : slot.statusLabel,
        warning: 'Training Center Lv 0 caps part of the coach bonus.',
      }
    }

    if (slot.role === 'team_doctor' && infrastructure.medical_center_level <= 0) {
      return {
        ...slot,
        status: slot.member ? ('limited' as const) : slot.status,
        statusLabel: slot.member ? 'Limited' : slot.statusLabel,
        warning: 'Medical Center Lv 0 caps part of the doctor bonus.',
      }
    }

    if (slot.role === 'mechanic' && infrastructure.mechanics_workshop_level <= 0) {
      return {
        ...slot,
        status: slot.member ? ('limited' as const) : slot.status,
        statusLabel: slot.member ? 'Limited' : slot.statusLabel,
        warning: 'Mechanics Workshop Lv 0 caps technical support and setup quality.',
      }
    }

    if (slot.role === 'scout_analyst' && infrastructure.scouting_level <= 0) {
      return {
        ...slot,
        status: slot.member ? ('limited' as const) : slot.status,
        statusLabel: slot.member ? 'Limited' : slot.statusLabel,
        warning: 'Scouting Office Lv 0 caps scouting and analyst effectiveness.',
      }
    }

    return slot
  })
}

function getStaffCapacityInfo(infrastructure: ClubInfrastructureRow | null): StaffCapacityInfo {
  const checks: Array<{ label: string; supported: boolean }> = [
    {
      label: 'Head Coach',
      supported: (infrastructure?.training_center_level ?? 0) > 0,
    },
    {
      label: 'Team Doctor',
      supported: (infrastructure?.medical_center_level ?? 0) > 0,
    },
    {
      label: 'Mechanic',
      supported: (infrastructure?.mechanics_workshop_level ?? 0) > 0,
    },
    {
      label: 'Sport Director',
      supported: (infrastructure?.hq_level ?? 0) > 0,
    },
    {
      label: 'Scout / Analyst',
      supported: (infrastructure?.scouting_level ?? 0) > 0,
    },
  ]

  const unsupportedRoleLabels = checks
    .filter((item) => !item.supported)
    .map((item) => item.label)

  return {
    supportedCount: checks.filter((item) => item.supported).length,
    totalCount: checks.length,
    unsupportedRoleLabels,
  }
}

function formatCourseGains(row: RecentStaffCourseResultRow) {
  const gains: string[] = []

  if (row.expertise_gain) gains.push(`+${row.expertise_gain} Expertise`)
  if (row.experience_gain) gains.push(`+${row.experience_gain} Experience`)
  if (row.potential_gain) gains.push(`+${row.potential_gain} Potential`)
  if (row.leadership_gain) gains.push(`+${row.leadership_gain} Leadership`)
  if (row.efficiency_gain) gains.push(`+${row.efficiency_gain} Efficiency`)
  if (row.loyalty_gain) gains.push(`+${row.loyalty_gain} Loyalty`)

  return gains
}

export default function StaffPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clubName, setClubName] = useState<string | null>(null)
  const [clubId, setClubId] = useState<string | null>(null)
  const [hasDevelopingTeam, setHasDevelopingTeam] = useState(false)
  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)

  const [staffRows, setStaffRows] = useState<ClubStaffRow[]>([])
  const [activeCourseRows, setActiveCourseRows] = useState<ActiveStaffCourseRow[]>([])
  const [recentCourseResults, setRecentCourseResults] = useState<RecentStaffCourseResultRow[]>([])
  const [infrastructure, setInfrastructure] = useState<ClubInfrastructureRow | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<StaffSlot | null>(null)
  const [releaseConfirmSlot, setReleaseConfirmSlot] = useState<StaffSlot | null>(null)
  const [pageMessage, setPageMessage] = useState<string | null>(null)
  const [releaseLoadingId, setReleaseLoadingId] = useState<string | null>(null)

  const [extendContractSlot, setExtendContractSlot] = useState<StaffSlot | null>(null)
  const [extendContractSeasons, setExtendContractSeasons] = useState<1 | 2>(1)
  const [extendQuote, setExtendQuote] = useState<ExtendContractQuoteRow | null>(null)
  const [extendQuoteLoading, setExtendQuoteLoading] = useState(false)
  const [extendSubmitLoading, setExtendSubmitLoading] = useState(false)
  const [extendContractSalary, setExtendContractSalary] = useState('')
  const [extendContractError, setExtendContractError] = useState<string | null>(null)

  const [courseSlot, setCourseSlot] = useState<StaffSlot | null>(null)
  const [courseStartLoadingCode, setCourseStartLoadingCode] = useState<string | null>(null)
  const [courseError, setCourseError] = useState<string | null>(null)

  async function reloadStaffPage(targetClubId: string) {
    const [
      staffResult,
      infraResult,
      gameDateResult,
      activeCoursesResult,
      recentCourseResultsResult,
    ] = await Promise.all([
      supabase
        .from('club_staff')
        .select(`
          id,
          club_id,
          role_type,
          specialization,
          team_scope,
          staff_name,
          country_code,
          expertise,
          experience,
          potential,
          leadership,
          efficiency,
          loyalty,
          salary_weekly,
          contract_expires_at,
          is_active,
          notes
        `)
        .eq('club_id', targetClubId)
        .eq('is_active', true),
      supabase
        .from('club_infrastructure')
        .select(`
          club_id,
          hq_level,
          training_center_level,
          medical_center_level,
          scouting_level,
          youth_academy_level,
          mechanics_workshop_level
        `)
        .eq('club_id', targetClubId)
        .maybeSingle(),
      supabase.rpc('get_current_game_date_date'),
      supabase.rpc('get_club_active_staff_courses', {
        p_club_id: targetClubId,
      }),
      supabase.rpc('get_club_recent_staff_course_results', {
        p_club_id: targetClubId,
        p_limit: 6,
      }),
    ])

    if (staffResult.error) throw staffResult.error
    if (infraResult.error) throw infraResult.error
    if (gameDateResult.error) throw gameDateResult.error
    if (activeCoursesResult.error) throw activeCoursesResult.error
    if (recentCourseResultsResult.error) throw recentCourseResultsResult.error

    const nextStaffRows = (staffResult.data || []) as ClubStaffRow[]
    const nextInfrastructure = (infraResult.data as ClubInfrastructureRow | null) || null
    const nextGameDate = normalizeGameDateValue(gameDateResult.data)
    const nextActiveCourseRows = Array.isArray(activeCoursesResult.data)
      ? (activeCoursesResult.data as ActiveStaffCourseRow[])
      : []
    const nextRecentCourseResults = Array.isArray(recentCourseResultsResult.data)
      ? (recentCourseResultsResult.data as RecentStaffCourseResultRow[])
      : []

    setStaffRows(nextStaffRows)
    setInfrastructure(nextInfrastructure)
    setCurrentGameDate(nextGameDate)
    setActiveCourseRows(nextActiveCourseRows)
    setRecentCourseResults(nextRecentCourseResults)

    return {
      staffRows: nextStaffRows,
      infrastructure: nextInfrastructure,
      currentGameDate: nextGameDate,
      activeCourseRows: nextActiveCourseRows,
      recentCourseResults: nextRecentCourseResults,
    }
  }

  useEffect(() => {
    let mounted = true

    async function loadStaffPage() {
      try {
        setLoading(true)
        setError(null)

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError
        if (!user) throw new Error('User not found.')

        const { data: clubsData, error: clubsError } = await supabase
          .from('clubs')
          .select('id, club_type, parent_club_id, deleted_at, name')
          .eq('owner_user_id', user.id)
          .is('deleted_at', null)

        if (clubsError) throw clubsError

        const resolvedClub = resolveMainClub((clubsData || []) as ClubRow[])
        if (!resolvedClub) throw new Error('Main club not found.')

        const { data: developingStatusData, error: developingStatusError } = await supabase.rpc(
          'get_developing_team_status'
        )

        if (!mounted) return

        setClubName(resolvedClub.name || null)
        setClubId(resolvedClub.id)

        if (developingStatusError) {
          setHasDevelopingTeam(false)
        } else {
          const normalizedDevStatus = Array.isArray(developingStatusData)
            ? developingStatusData[0]
            : developingStatusData

          setHasDevelopingTeam(
            ((normalizedDevStatus ?? null) as DevelopingTeamStatusRow | null)?.is_purchased ?? false
          )
        }

        await reloadStaffPage(resolvedClub.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load staff page.'
        if (!mounted) return
        setError(message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadStaffPage()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadExtendQuote() {
      if (!extendContractSlot?.member) return

      try {
        setExtendQuoteLoading(true)
        setExtendContractError(null)

        const { data, error: quoteError } = await supabase.rpc('staff_get_contract_extension_quote', {
          p_staff_id: extendContractSlot.member.id,
          p_seasons: extendContractSeasons,
        })

        if (cancelled) return

        if (quoteError) throw quoteError

        const normalizedQuote = normalizeRpcSingle<ExtendContractQuoteRow>(data)
        setExtendQuote(normalizedQuote)
        setExtendContractSalary(
          normalizedQuote?.requested_salary_weekly != null
            ? String(normalizedQuote.requested_salary_weekly)
            : ''
        )
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load extension quote.'
        setExtendQuote(null)
        setExtendContractSalary('')
        setExtendContractError(message)
      } finally {
        if (!cancelled) setExtendQuoteLoading(false)
      }
    }

    void loadExtendQuote()

    return () => {
      cancelled = true
    }
  }, [extendContractSlot, extendContractSeasons])

  async function confirmReleaseStaff() {
    if (!releaseConfirmSlot?.member || !clubId) return

    try {
      setReleaseLoadingId(releaseConfirmSlot.member.id)
      setPageMessage(null)

      const releaseCost = getStaffReleaseCost(releaseConfirmSlot.member.salaryWeekly)

      const { error: releaseError } = await supabase.rpc('release_club_staff', {
        p_staff_id: releaseConfirmSlot.member.id,
      })

      if (releaseError) throw releaseError

      await reloadStaffPage(clubId)

      const releasedName = releaseConfirmSlot.member.name
      const releasedRole = releaseConfirmSlot.roleLabel

      setReleaseConfirmSlot(null)
      setSelectedSlot(null)
      setPageMessage(
        `${releasedName} was released from ${releasedRole}. Release compensation paid: ${formatCurrency(
          releaseCost
        )}.`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to release staff member.'
      setPageMessage(message)
    } finally {
      setReleaseLoadingId(null)
    }
  }

  async function confirmExtendContract() {
    if (!extendContractSlot?.member || !clubId) return

    const targetRole = extendContractSlot.role
    const targetStaffId = extendContractSlot.member.id
    const parsedSalary = Number(extendContractSalary)

    if (!Number.isFinite(parsedSalary) || parsedSalary <= 0) {
      setExtendContractError('Please enter a valid weekly salary.')
      return
    }

    try {
      setExtendSubmitLoading(true)
      setExtendContractError(null)
      setPageMessage(null)

      const { data, error: extendError } = await supabase.rpc('extend_club_staff_contract', {
        p_staff_id: targetStaffId,
        p_seasons: extendContractSeasons,
        p_salary_weekly: parsedSalary,
      })

      if (extendError) throw extendError

      const result = normalizeRpcSingle<{
        staff_name: string
        new_salary_weekly: number
        new_contract_expires_at: string
        new_season_number: number
      }>(data)

      const refreshedPage = await reloadStaffPage(clubId)

      const refreshedActiveCourseByStaffId = new Map<string, StaffActiveCourse>()
      for (const row of refreshedPage.activeCourseRows) {
        refreshedActiveCourseByStaffId.set(row.staff_id, {
          id: row.course_id,
          code: row.course_code,
          title: row.course_title,
          focusLabel: row.focus_label,
          startedGameDate: row.started_game_date,
          completesOnGameDate: row.completes_on_game_date,
          durationDays: row.duration_days,
          costCash: row.cost_cash,
          status: row.status,
        })
      }

      const refreshedSlots = buildStaffSlotsFromRows(
        refreshedPage.staffRows,
        refreshedPage.infrastructure,
        refreshedPage.currentGameDate,
        refreshedActiveCourseByStaffId
      )

      const refreshedSlot =
        refreshedSlots.find(
          (slot) => slot.role === targetRole && slot.member?.id === targetStaffId
        ) ??
        refreshedSlots.find((slot) => slot.role === targetRole) ??
        null

      setExtendContractSlot(null)
      setExtendQuote(null)
      setExtendContractSalary('')
      setExtendContractError(null)
      setSelectedSlot(refreshedSlot)

      if (result) {
        setPageMessage(
          `${result.staff_name} agreed a new deal at ${formatCurrency(
            result.new_salary_weekly
          )}/week until Season ${result.new_season_number}.`
        )
      } else {
        setPageMessage('Staff contract extended successfully.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extend staff contract.'
      setExtendContractError(message)
    } finally {
      setExtendSubmitLoading(false)
    }
  }

  async function confirmStartCourse(courseCode: string) {
    if (!courseSlot?.member || !clubId) return

    const previousSlot = courseSlot
    const targetRole = previousSlot.role
    const targetStaffId = previousSlot.member.id

    try {
      setCourseStartLoadingCode(courseCode)
      setCourseError(null)
      setPageMessage(null)

      const { data, error } = await supabase.rpc('start_staff_course', {
        p_staff_id: targetStaffId,
        p_course_code: courseCode,
      })

      if (error) throw error

      const result = normalizeRpcSingle<{
        course_title: string
        completes_on_game_date: string
      }>(data)

      const refreshedPage = await reloadStaffPage(clubId)

      const refreshedActiveCourseMap = new Map<string, StaffActiveCourse>()
      for (const row of refreshedPage.activeCourseRows) {
        refreshedActiveCourseMap.set(row.staff_id, {
          id: row.course_id,
          code: row.course_code,
          title: row.course_title,
          focusLabel: row.focus_label,
          startedGameDate: row.started_game_date,
          completesOnGameDate: row.completes_on_game_date,
          durationDays: row.duration_days,
          costCash: row.cost_cash,
          status: row.status,
        })
      }

      const refreshedSlots = buildStaffSlotsFromRows(
        refreshedPage.staffRows,
        refreshedPage.infrastructure,
        refreshedPage.currentGameDate,
        refreshedActiveCourseMap
      )

      const refreshedSlot =
        refreshedSlots.find(
          (slot) => slot.role === targetRole && slot.member?.id === targetStaffId
        ) ??
        refreshedSlots.find((slot) => slot.role === targetRole) ??
        null

      setCourseSlot(null)
      setSelectedSlot(refreshedSlot)

      if (result) {
        setPageMessage(
          `${previousSlot.member.name} started ${result.course_title}. Completion target ${formatGameDateShort(
            result.completes_on_game_date
          )}.`
        )
      } else {
        setPageMessage(`${previousSlot.member.name} started a staff course.`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start staff course.'
      setCourseError(message)
    } finally {
      setCourseStartLoadingCode(null)
    }
  }

  function openReleaseFlow(slot: StaffSlot) {
    setSelectedSlot(null)
    setReleaseConfirmSlot(slot)
  }

  function openExtendFlow(slot: StaffSlot) {
    setSelectedSlot(null)
    setExtendContractSlot(slot)
    setExtendContractSeasons(1)
    setExtendQuote(null)
    setExtendContractSalary('')
    setExtendContractError(null)
  }

  function openCourseFlow(slot: StaffSlot) {
    setSelectedSlot(null)
    setCourseError(null)
    setCourseStartLoadingCode(null)
    setCourseSlot(slot)
  }

  const activeCourseByStaffId = useMemo(() => {
    const map = new Map<string, StaffActiveCourse>()

    for (const row of activeCourseRows) {
      map.set(row.staff_id, {
        id: row.course_id,
        code: row.course_code,
        title: row.course_title,
        focusLabel: row.focus_label,
        startedGameDate: row.started_game_date,
        completesOnGameDate: row.completes_on_game_date,
        durationDays: row.duration_days,
        costCash: row.cost_cash,
        status: row.status,
      })
    }

    return map
  }, [activeCourseRows])

  const staffSlots = useMemo(
    () => buildStaffSlotsFromRows(staffRows, infrastructure, currentGameDate, activeCourseByStaffId),
    [staffRows, infrastructure, currentGameDate, activeCourseByStaffId]
  )

  const performanceSlots = useMemo(
    () => staffSlots.filter((slot) => slot.category === 'performance'),
    [staffSlots]
  )

  const medicalTechnicalSlots = useMemo(
    () => staffSlots.filter((slot) => slot.category === 'medical_technical'),
    [staffSlots]
  )

  const tacticalRecruitmentSlots = useMemo(
    () => staffSlots.filter((slot) => slot.category === 'tactical_recruitment'),
    [staffSlots]
  )

  const weeklyWages = useMemo(
    () =>
      staffSlots.reduce((sum, slot) => {
        if (!slot.member) return sum
        return sum + slot.member.salaryWeekly
      }, 0),
    [staffSlots]
  )

  const vacancyCount = useMemo(
    () => staffSlots.filter((slot) => !slot.member).length,
    [staffSlots]
  )

  const warningsCount = useMemo(
    () => staffSlots.filter((slot) => Boolean(slot.warning)).length,
    [staffSlots]
  )

  const hiredStaffCount = useMemo(
    () => staffSlots.filter((slot) => slot.member !== null).length,
    [staffSlots]
  )

  const staffCapacityInfo = useMemo(() => getStaffCapacityInfo(infrastructure), [infrastructure])

  const staffCapacitySubtext = useMemo(() => {
    if (staffCapacityInfo.unsupportedRoleLabels.length === 0) {
      return 'All core staff roles are fully supported by infrastructure'
    }

    if (hiredStaffCount > staffCapacityInfo.supportedCount) {
      return `Over supported capacity by ${hiredStaffCount - staffCapacityInfo.supportedCount} staff`
    }

    return `${staffCapacityInfo.unsupportedRoleLabels.length} role(s) limited by infrastructure`
  }, [hiredStaffCount, staffCapacityInfo])

  if (loading) {
    return (
      <div className="w-full">
        <TopNav hasDevelopingTeam={hasDevelopingTeam} />
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="text-sm text-gray-500">Loading staff...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full">
        <TopNav hasDevelopingTeam={hasDevelopingTeam} />
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="text-sm text-red-600">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <TopNav hasDevelopingTeam={hasDevelopingTeam} />

      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-base font-semibold text-gray-800">Team Staff</div>
            <div className="mt-1 text-sm text-gray-500">
              Manage coaches, medical staff, technical staff and recruitment roles.
            </div>
            {clubName ? <div className="mt-1 text-xs text-gray-400">{clubName}</div> : null}
          </div>

          <div className="text-xs text-gray-500">
            Staff should amplify training, recovery, preparation and consistency — not replace rider
            quality.
          </div>
        </div>

        {pageMessage ? (
          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            {pageMessage}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Weekly Staff Wages"
            value={formatCurrency(weeklyWages)}
            subtext="Hook this into payroll later"
          />
          <SummaryCard
            label="Open Roles"
            value={String(vacancyCount)}
            subtext="Vacant roles reduce support quality"
          />
          <SummaryCard
            label="Staff Capacity"
            value={`${hiredStaffCount}/${staffCapacityInfo.supportedCount}`}
            subtext={staffCapacitySubtext}
          />
          <SummaryCard
            label="Warnings"
            value={String(warningsCount)}
            subtext="Facility level can cap some staff effects"
          />
        </div>

        {recentCourseResults.length > 0 ? (
          <div className="mt-8">
            <SectionTitle
              title="Recent Course Results"
              subtitle="Completed staff development courses and applied stat gains."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recentCourseResults.map((result) => {
                const gains = formatCourseGains(result)

                return (
                  <div
                    key={result.course_id}
                    className="rounded-xl border border-green-100 bg-green-50 p-4"
                  >
                    <div className="text-sm font-semibold text-green-900">{result.course_title}</div>
                    <div className="mt-1 text-sm text-green-800">{result.staff_name}</div>
                    <div className="mt-1 text-xs text-green-700">Focus: {result.focus_label}</div>
                    <div className="mt-1 text-xs text-green-700">
                      Completed: {formatGameDateShort(result.completed_game_date)}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {gains.map((gain) => (
                        <span
                          key={gain}
                          className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-green-800"
                        >
                          {gain}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-8">
          <SectionTitle
            title="Performance Staff"
            subtitle="Training, progression, training camps and long-term rider development."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {performanceSlots.map((slot) => (
              <StaffRoleCard key={slot.role} slot={slot} onOpen={setSelectedSlot} />
            ))}
          </div>
        </div>

        <div className="mt-8">
          <SectionTitle
            title="Medical & Technical"
            subtitle="Recovery, injury prevention, reliability and equipment support."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {medicalTechnicalSlots.map((slot) => (
              <StaffRoleCard key={slot.role} slot={slot} onOpen={setSelectedSlot} />
            ))}
          </div>
        </div>

        <div className="mt-8">
          <SectionTitle
            title="Tactical & Recruitment"
            subtitle="Race direction, team coordination, scouting and transfer intelligence."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tacticalRecruitmentSlots.map((slot) => (
              <StaffRoleCard key={slot.role} slot={slot} onOpen={setSelectedSlot} />
            ))}
          </div>
        </div>
      </div>

      <StaffDetailModal
        slot={selectedSlot}
        onClose={() => setSelectedSlot(null)}
        onRequestRelease={openReleaseFlow}
        onRequestExtend={openExtendFlow}
        onRequestCourse={openCourseFlow}
      />

      <ReleaseConfirmModal
        slot={releaseConfirmSlot}
        loading={
          releaseConfirmSlot?.member != null &&
          releaseLoadingId === releaseConfirmSlot.member.id
        }
        onCancel={() => {
          if (releaseLoadingId) return
          const previousSlot = releaseConfirmSlot
          setReleaseConfirmSlot(null)
          if (previousSlot) {
            setSelectedSlot(previousSlot)
          }
        }}
        onConfirm={confirmReleaseStaff}
      />

      <ExtendContractModal
        slot={extendContractSlot}
        currentGameDate={currentGameDate}
        seasons={extendContractSeasons}
        setSeasons={setExtendContractSeasons}
        quote={extendQuote}
        loading={extendQuoteLoading}
        submitting={extendSubmitLoading}
        salaryInput={extendContractSalary}
        setSalaryInput={setExtendContractSalary}
        error={extendContractError}
        onCancel={() => {
          if (extendSubmitLoading) return
          const previousSlot = extendContractSlot
          setExtendContractSlot(null)
          setExtendQuote(null)
          setExtendContractSalary('')
          setExtendContractError(null)
          if (previousSlot) {
            setSelectedSlot(previousSlot)
          }
        }}
        onConfirm={confirmExtendContract}
      />

      <StaffCourseModal
        slot={courseSlot}
        startingCourseCode={courseStartLoadingCode}
        error={courseError}
        onStartCourse={confirmStartCourse}
        onCancel={() => {
          if (courseStartLoadingCode) return
          const previousSlot = courseSlot
          setCourseSlot(null)
          setCourseError(null)
          if (previousSlot) {
            setSelectedSlot(previousSlot)
          }
        }}
      />
    </div>
  )
}