/** Compact game differentiators, with accessible single-open feature details. */
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'

const FEATURE_KEYS = [
  'management', 'squads', 'staff', 'training', 'growth', 'calendar',
  'preparation', 'tiers', 'equipment', 'assets', 'finance', 'sponsors',
  'operations', 'transfers', 'national', 'academy', 'replay', 'progression',
] as const

const METRICS = [
  { value: '593', key: 'races' },
  { value: '170', key: 'equipment' },
  { value: '11', key: 'staff' },
] as const

export default function WhyProPeloton(): JSX.Element {
  const { t } = useTranslation('home')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  return (
    <section
      aria-labelledby="ppm-why-title"
      className="border-y border-yellow-400/15 bg-[#071426] py-12 text-white sm:py-14"
    >
      <div className="mx-auto max-w-[1510px] px-6 sm:px-10 lg:px-12">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end lg:gap-10">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-300">{t('why.eyebrow')}</p>
            <h2 id="ppm-why-title" className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{t('why.title')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-200 sm:text-base">{t('why.subtitle')}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-5" aria-label={t('why.eyebrow')}>
            {METRICS.map(metric => (
              <div key={metric.key} className="min-w-0 border-l-2 border-yellow-400/65 pl-3 sm:pl-4">
                <div className="text-2xl font-semibold tabular-nums text-white sm:text-3xl">{metric.value}</div>
                <div className="mt-1 text-xs leading-4 text-slate-300">{t(`why.${metric.key}`)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FEATURE_KEYS.map(key => {
            const open = expandedKey === key
            const label = t(`why.features.${key}.title`)
            const detailsId = `ppm-why-details-${key}`

            return (
              <div
                key={key}
                className={`rounded-xl border bg-[linear-gradient(130deg,rgba(25,47,78,.94),rgba(8,25,47,.94))] px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,.15)] transition-colors ${open ? 'border-yellow-400/50' : 'border-white/15 hover:border-white/35'}`}
              >
                <button
                  type="button"
                  className="relative block w-full cursor-pointer pr-6 text-left focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
                  onClick={() => setExpandedKey(open ? null : key)}
                  aria-expanded={open}
                  aria-controls={detailsId}
                  aria-label={`${open ? t('why.hideDetails') : t('why.showDetails')}: ${label}`}
                >
                  <span className="block text-sm font-semibold leading-5 text-white">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-300">{t(`why.features.${key}.description`)}</span>
                  <ChevronDown
                    size={17}
                    aria-hidden="true"
                    className={`absolute right-0 top-0.5 text-slate-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                <div
                  id={detailsId}
                  hidden={!open}
                  className="mt-3 border-t border-white/15 pt-3 text-sm leading-6 text-slate-200"
                >
                  {t(`why.features.${key}.details`)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
