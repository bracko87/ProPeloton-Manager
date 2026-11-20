/**
 * CTA.tsx
 * Final call-to-action block encouraging users to sign up.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Trophy } from 'lucide-react'

/**
 * CTA
 * Prominent call-to-action with supporting text.
 */
export default function CTA() {
  const { t } = useTranslation('home')

  return (
    <div className="mx-auto max-w-5xl rounded-[2rem] border border-yellow-400/35 bg-[#10243f]/75 px-6 py-14 text-center shadow-[0_0_55px_rgba(250,204,21,.12)] backdrop-blur-xl sm:px-12">
      <div className="mb-5 inline-flex items-center gap-3 rounded-full border border-yellow-400/35 bg-yellow-400/10 px-4 py-2 text-yellow-300">
        <Trophy />
        <span className="font-medium">{t('cta.badge')}</span>
      </div>

      <h3 className="text-3xl font-black italic tracking-tight text-white sm:text-4xl">{t('cta.title')}</h3>
      <p className="mt-3 text-white/85">{t('cta.body')}</p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <Link to="/register" className="rounded-xl bg-yellow-400 px-7 py-3 font-extrabold text-[#071426] shadow-[0_0_27px_rgba(250,204,21,.35)] transition hover:-translate-y-0.5 hover:bg-yellow-300">
          {t('cta.createClub')}
        </Link>
        <Link to="/login" className="rounded-xl border border-white/25 bg-white/5 px-7 py-3 font-semibold text-white transition hover:border-yellow-400/60 hover:bg-white/10">
          {t('cta.signIn')}
        </Link>
      </div>
    </div>
  )
}
