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
    <div className="max-w-4xl mx-auto px-6 text-center">
      <div className="inline-flex items-center gap-3 bg-black/20 text-yellow-300 px-4 py-2 rounded-full mb-4">
        <Trophy />
        <span className="font-medium">{t('cta.badge')}</span>
      </div>

      <h3 className="text-3xl font-bold text-white">{t('cta.title')}</h3>
      <p className="mt-3 text-white/85">{t('cta.body')}</p>

      <div className="mt-6 flex items-center justify-center gap-4">
        <Link to="/register" className="bg-yellow-400 text-black px-6 py-3 rounded-md font-semibold">
          {t('cta.createClub')}
        </Link>
        <Link to="/login" className="px-6 py-3 rounded-md border border-white/20 text-white/90 hover:bg-white/5">
          {t('cta.signIn')}
        </Link>
      </div>
    </div>
  )
}
