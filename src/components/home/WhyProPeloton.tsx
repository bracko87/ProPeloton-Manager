/** Compact, database-checked homepage differentiators. */
import React from 'react'
import { useTranslation } from 'react-i18next'

const FEATURE_KEYS = ["management","squads","staff","training","growth","calendar","preparation","tiers","equipment","assets","finance","sponsors","operations","transfers","national","academy","replay","progression"] as const

const METRICS = [
  { value: '593', key: 'races' },
  { value: '170', key: 'equipment' },
  { value: '11', key: 'staff' },
] as const

export default function WhyProPeloton(): JSX.Element {
  const { t } = useTranslation('home')
  return (
    <section aria-labelledby="ppm-why-title" className="border-b border-slate-200 bg-slate-100 py-12 text-slate-900 sm:py-14">
      <div className="mx-auto max-w-[1510px] px-6 sm:px-10 lg:px-12">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end lg:gap-10">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">{t('why.eyebrow')}</p>
            <h2 id="ppm-why-title" className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('why.title')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">{t('why.subtitle')}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-5" aria-label={t('why.eyebrow')}>
            {METRICS.map(metric => (
              <div key={metric.key} className="min-w-0 border-l-2 border-amber-400 pl-3 sm:pl-4">
                <div className="text-2xl font-semibold tabular-nums text-slate-950 sm:text-3xl">{metric.value}</div>
                <div className="mt-1 text-xs leading-4 text-slate-600">{t(`why.${metric.key}`)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FEATURE_KEYS.map(key => (
            <div key={key} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <h3 className="text-sm font-semibold leading-5 text-slate-900">{t(`why.features.${key}.title`)}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">{t(`why.features.${key}.description`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
