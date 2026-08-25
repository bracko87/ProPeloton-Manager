/**
 * src/components/riders/RiderProfileModal.tsx
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import enSharedRiderModal from '../../i18n/locales/en/sharedRiderModal.json'
import srSharedRiderModal from '../../i18n/locales/sr-Latn/sharedRiderModal.json'

type RiderProfileRenderVariant = 'modal' | 'page'

type RiderProfileModalProps = {
  rider: {
    id?: string
    display_name?: string
    country_code?: string | null
    role?: string | null
    overall?: number | null
    potential?: number | null
    sprint?: number | null
    climbing?: number | null
    time_trial?: number | null
    endurance?: number | null
    flat?: number | null
    recovery?: number | null
    resistance?: number | null
    race_iq?: number | null
    teamwork?: number | null
    morale?: number | null
    birth_date?: string | null
    market_value?: number | null
    salary?: number | null
    contract_expires_season?: number | null
    availability_status?: string | null
    fatigue?: number | null
    image_url?: string | null
    club_id?: string | null
    club_name?: string | null
    club_country_code?: string | null
    club_tier?: string | null
    club_is_ai?: boolean | null
    club_is_active?: boolean | null
    age_years?: number | null
    season_points_overall?: number
    season_points_sprint?: number
    season_points_climbing?: number
  } | null
  isOpen: boolean
  onClose: () => void
  onOpenTeamProfile: () => void
  isRiderScouted: boolean
  setIsRiderScouted: React.Dispatch<React.SetStateAction<boolean>>
  showRiderHistory: boolean
  setShowRiderHistory: React.Dispatch<React.SetStateAction<boolean>>
  countryNameByCode: Map<string, string>
  variant?: RiderProfileRenderVariant
  backButtonLabel?: string
}

const namespace = 'sharedRiderModal'

if (!i18n.hasResourceBundle('en', namespace)) {
  i18n.addResourceBundle('en', namespace, enSharedRiderModal, true, true)
}

if (!i18n.hasResourceBundle('sr-Latn', namespace)) {
  i18n.addResourceBundle('sr-Latn', namespace, srSharedRiderModal, true, true)
}

function intlLocale(language: string | undefined): string {
  return language?.startsWith('sr') ? 'sr-Latn-RS' : 'en-US'
}

function formatCurrency(
  value: number | null | undefined,
  language: string | undefined,
): string {
  if (value == null || Number.isNaN(value)) return '—'

  return new Intl.NumberFormat(intlLocale(language), {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function getCountryName(
  countryCode: string | null | undefined,
  countryNameByCode: Map<string, string>,
  language: string | undefined,
  unknownLabel: string,
): string {
  if (!countryCode) return unknownLabel

  const code = countryCode.toUpperCase()

  try {
    const localized = new Intl.DisplayNames([intlLocale(language)], {
      type: 'region',
    }).of(code)

    if (localized) return localized
  } catch {
    // Fall through to the supplied country map / ISO code.
  }

  return countryNameByCode.get(code) || code
}

function normalizedToken(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

export default function RiderProfileModal({
  rider,
  isOpen,
  onClose,
  onOpenTeamProfile,
  isRiderScouted,
  setIsRiderScouted,
  showRiderHistory,
  setShowRiderHistory,
  countryNameByCode,
  variant = 'modal',
  backButtonLabel,
}: RiderProfileModalProps): JSX.Element | null {
  const { t, i18n: activeI18n } = useTranslation(namespace)

  if (!isOpen || !rider) return null

  const language = activeI18n.resolvedLanguage ?? activeI18n.language
  const isPage = variant === 'page'
  const resolvedBackButtonLabel =
    !backButtonLabel || backButtonLabel === 'Back'
      ? t('common.back')
      : backButtonLabel

  const roleToken = normalizedToken(rider.role)
  const roleKeys: Record<string, string> = {
    sprinter: 'roles.sprinter',
    climber: 'roles.climber',
    timetrialist: 'roles.timeTrialist',
    tt: 'roles.timeTrialist',
    gc: 'roles.gc',
    gcrider: 'roles.gc',
    puncheur: 'roles.puncheur',
    rouleur: 'roles.rouleur',
    domestique: 'roles.domestique',
    allrounder: 'roles.allRounder',
  }

  const availabilityToken = normalizedToken(rider.availability_status)
  const availabilityKeys: Record<string, string> = {
    fit: 'availability.fit',
    available: 'availability.fit',
    notfullyfit: 'availability.notFullyFit',
    injured: 'availability.injured',
    injury: 'availability.injured',
    sick: 'availability.sick',
    illness: 'availability.sick',
  }

  const displayedRole = roleKeys[roleToken]
    ? t(roleKeys[roleToken])
    : rider.role || '—'

  const displayedAvailability = availabilityKeys[availabilityToken]
    ? t(availabilityKeys[availabilityToken])
    : rider.availability_status || '—'

  const stats = [
    { key: 'skills.ovr', value: rider.overall },
    { key: 'skills.pot', value: rider.potential },
    { key: 'skills.sprint', value: rider.sprint },
    { key: 'skills.climbing', value: rider.climbing },
    { key: 'skills.tt', value: rider.time_trial },
    { key: 'skills.endurance', value: rider.endurance },
    { key: 'skills.flat', value: rider.flat },
    { key: 'skills.recovery', value: rider.recovery },
    { key: 'skills.resistance', value: rider.resistance },
    { key: 'skills.raceIq', value: rider.race_iq },
    { key: 'skills.teamwork', value: rider.teamwork },
    { key: 'skills.morale', value: rider.morale },
  ]

  return (
    <div
      className={
        isPage
          ? 'min-h-full w-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4'
      }
    >
      <div
        className={
          isPage
            ? 'mx-auto w-full max-w-5xl rounded-xl border border-gray-200 bg-white shadow-lg'
            : 'w-full max-w-4xl rounded-xl bg-white shadow-2xl'
        }
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              {rider.display_name || t('common.unknownRider')}
            </h3>
            <div className="mt-1 text-sm text-gray-500">
              {displayedRole} • {t('common.age', { age: rider.age_years ?? '—' })} •{' '}
              {getCountryName(
                rider.country_code,
                countryNameByCode,
                language,
                t('common.unknown'),
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {isPage ? resolvedBackButtonLabel : t('common.close')}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 px-6 py-5 lg:grid-cols-[260px_1fr]">
          <div>
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
              {rider.image_url ? (
                <img
                  src={rider.image_url}
                  alt={rider.display_name || t('common.rider')}
                  className="h-72 w-full object-cover"
                />
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-gray-400">
                  {t('common.noImage')}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">{t('common.club')}</span>{' '}
                <span className="font-medium text-gray-900">
                  {rider.club_name || t('common.noClub')}
                </span>
              </div>

              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">{t('common.marketValue')}</span>{' '}
                <span className="font-medium text-gray-900">
                  {formatCurrency(rider.market_value, language)}
                </span>
              </div>

              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">{t('common.salary')}</span>{' '}
                <span className="font-medium text-gray-900">
                  {formatCurrency(rider.salary, language)}
                </span>
              </div>

              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">{t('common.availability')}</span>{' '}
                <span className="font-medium text-gray-900">
                  {displayedAvailability}
                </span>
              </div>

              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">{t('common.contractSeason')}</span>{' '}
                <span className="font-medium text-gray-900">
                  {rider.contract_expires_season ?? '—'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {stats.map(stat => (
                <div key={stat.key} className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">{t(stat.key)}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {stat.value ?? '—'}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">{t('common.seasonPoints')}</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {rider.season_points_overall ?? 0}
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">{t('common.sprintPoints')}</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {rider.season_points_sprint ?? 0}
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">{t('common.climbingPoints')}</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {rider.season_points_climbing ?? 0}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsRiderScouted(prev => !prev)}
                className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-300"
              >
                {isRiderScouted
                  ? t('common.unmarkScouted')
                  : t('common.markScouted')}
              </button>

              <button
                type="button"
                onClick={() => setShowRiderHistory(prev => !prev)}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {showRiderHistory
                  ? t('common.hideHistory')
                  : t('common.showHistory')}
              </button>

              <button
                type="button"
                onClick={onOpenTeamProfile}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('common.openTeam')}
              </button>
            </div>

            {showRiderHistory ? (
              <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                {t('common.historyPlaceholder')}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
