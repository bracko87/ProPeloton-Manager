import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type PremiumFeatureLockProps = {
  title: string
  description: string
  className?: string
}

export type PremiumFeatureLoadingProps = {
  className?: string
}

export type PremiumFeatureGateProps = PremiumFeatureLockProps & {
  isPremium: boolean
  loading?: boolean
  children: ReactNode
}

export function openPremiumPage(): void {
  window.location.hash = '#/dashboard/pro'
}

export function PremiumFeatureLock({
  title,
  description,
  className = '',
}: PremiumFeatureLockProps): JSX.Element {
  const { t } = useTranslation('navigation')

  return (
    <div
      className={[
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex min-h-[112px] flex-col justify-center gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
              <span aria-hidden="true">🔒</span>
              {t('header.premium')}
            </span>

            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-500">
            {description}
          </p>
        </div>

        <button
          type="button"
          onClick={openPremiumPage}
          className="shrink-0 self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 sm:self-auto"
        >
          {t('premiumFeature.unlock')}
        </button>
      </div>
    </div>
  )
}

export function PremiumFeatureLoading({
  className = '',
}: PremiumFeatureLoadingProps): JSX.Element {
  return (
    <div
      className={[
        'rounded-xl border border-slate-200 bg-white p-4 shadow-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex min-h-[80px] animate-pulse items-center gap-3">
        <div className="h-7 w-20 rounded-full bg-slate-100" />

        <div className="min-w-0 flex-1">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="mt-2 h-3 w-64 max-w-full rounded bg-slate-50" />
        </div>
      </div>
    </div>
  )
}

export function PremiumFeatureGate({
  isPremium,
  loading = false,
  title,
  description,
  className = '',
  children,
}: PremiumFeatureGateProps): JSX.Element {
  if (loading) {
    return <PremiumFeatureLoading className={className} />
  }

  if (isPremium) {
    return <>{children}</>
  }

  return (
    <PremiumFeatureLock
      title={title}
      description={description}
      className={className}
    />
  )
}

export default PremiumFeatureLock
