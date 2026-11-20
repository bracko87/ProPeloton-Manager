/** Public homepage's understated final call to action. */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export default function CTA(): JSX.Element {
  const { t } = useTranslation('home')

  return (
    <div className="mx-auto max-w-4xl px-6 py-4 text-center">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {t('cta.title')}
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">
        {t('cta.body')}
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/register"
          className="rounded-lg bg-yellow-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-yellow-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
        >
          {t('cta.createClub')}
        </Link>
        <Link
          to="/login"
          className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-800 transition hover:border-amber-400 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
        >
          {t('cta.signIn')}
        </Link>
      </div>
    </div>
  )
}
