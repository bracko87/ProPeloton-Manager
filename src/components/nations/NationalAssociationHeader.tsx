import React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import NationalAssociationTabs from './NationalAssociationTabs'

export type NationalAssociationHeaderData = {
  country_code?: string | null
  association_name?: string | null
  is_member?: boolean
  association_status?: string | null
  coach?: {
    club_name?: string | null
    user_id?: string | null
  } | null
}

type Props = {
  association?: NationalAssociationHeaderData | null
  isCoach?: boolean
  loading?: boolean
  onRefresh?: () => void
}

function flagUrl(code?: string | null): string | null {
  const normalized = code?.trim().toLowerCase()
  return normalized && /^[a-z]{2}$/.test(normalized)
    ? `https://flagcdn.com/w80/${normalized}.png`
    : null
}

export default function NationalAssociationHeader({
  association,
  isCoach = false,
  loading = false,
  onRefresh,
}: Props): JSX.Element {
  const { t } = useTranslation('nations')
  const countryFlag = flagUrl(association?.country_code)

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
        {countryFlag ? (
          <img
            src={countryFlag}
            alt={association?.country_code ?? t('common.country')}
            className="mt-0.5 h-9 w-14 rounded border border-slate-200 object-cover"
          />
        ) : (
          <div className="mt-0.5 flex h-9 w-14 items-center justify-center rounded border border-slate-200 bg-white text-xs font-semibold text-slate-500">
            {association?.country_code ?? '—'}
          </div>
        )}

        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            {association?.association_name ??
              (association?.country_code
                ? t('association.countryTitle', { country: association.country_code })
                : t('association.title'))}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{t('association.subtitle')}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {association?.is_member ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                {t('association.userStatus.member')}
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {t('association.userStatus.notMember')}
              </span>
            )}

            {isCoach ? (
              <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-900">
                {t('association.userStatus.nationalCoach')}
              </span>
            ) : association?.coach?.club_name ? (
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                {t('association.userStatus.coach', { coach: association.coach.club_name })}
              </span>
            ) : null}

            {association?.association_status ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {t(`status.${association.association_status}`, {
                  defaultValue: association.association_status,
                })}
              </span>
            ) : null}
          </div>

        </div>
      </div>

        <div className="flex max-w-full flex-col items-start gap-2 self-start">
          <NationalAssociationTabs isCoach={isCoach} />
          {onRefresh ? (
            <div className="flex w-full justify-start">
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {loading ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
                {t('common.refresh')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
