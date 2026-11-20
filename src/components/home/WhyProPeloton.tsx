/** Compact homepage feature links; paid-access explanations live on detail pages only. */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { FEATURE_KEYS } from './featureCatalog'

const METRICS = [
  { value: '593', key: 'races' },
  { value: '170', key: 'equipment' },
  { value: '11', key: 'staff' },
] as const

export default function WhyProPeloton(): JSX.Element {
  const { t } = useTranslation('home')

  return (
    <section id="why-propeloton" aria-labelledby="ppm-why-title"
      className="border-y border-yellow-400/15 bg-[#071426] py-12 text-white sm:py-14">
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

        <div className="mt-7 grid items-stretch gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FEATURE_KEYS.map(key => (
            <Link key={key} to={`/features/${key}`}
              aria-label={`${t('why.page.moreInfo')}: ${t(`why.features.${key}.title`)}`}
              className="group relative flex min-h-[74px] overflow-hidden rounded-xl border border-white/15 bg-[linear-gradient(130deg,rgba(25,47,78,.94),rgba(8,25,47,.94))] px-4 py-2.5 pr-12 text-left text-white shadow-[0_8px_24px_rgba(0,0,0,.15)] transition-colors hover:border-yellow-400/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400">
              <span className="relative z-10 block min-w-0 self-center pr-2 transition-opacity duration-200 group-hover:opacity-95">
                <span className="block text-sm font-semibold leading-5">{t(`why.features.${key}.title`)}</span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-300">{t(`why.features.${key}.description`)}</span>
              </span>
              <span aria-hidden="true"
                className="absolute inset-y-0 right-0 z-20 flex w-10 flex-col items-center justify-center gap-1 overflow-hidden border-l border-white/10 bg-white/5 text-slate-200 transition-[width,background-color,color] duration-300 ease-out group-hover:w-[42%] group-hover:border-yellow-300 group-hover:bg-yellow-400 group-hover:text-slate-950 group-focus-visible:w-[42%] group-focus-visible:bg-yellow-400 group-focus-visible:text-slate-950">
                <ArrowRight size={19} className="shrink-0 transition-transform duration-300 group-hover:scale-125 group-focus-visible:scale-125" />
                <span className="max-w-full whitespace-nowrap text-center text-[11px] font-semibold opacity-0 transition-opacity delay-100 duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                  {t('why.page.moreInfo')}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
