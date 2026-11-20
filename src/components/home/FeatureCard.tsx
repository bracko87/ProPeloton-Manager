/**
 * FeatureCard.tsx
 * Small reusable card to present a product feature.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'

/**
 * FeatureCardProps
 * Props for FeatureCard component.
 */
interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

const HOMEPAGE_FEATURE_TRANSLATIONS: Record<
  string,
  { titleKey: string; descriptionKey: string }
> = {
  'Deep Squad Management': {
    titleKey: 'features.squadTitle',
    descriptionKey: 'features.squadDescription',
  },
  'Tactical Races': {
    titleKey: 'features.racesTitle',
    descriptionKey: 'features.racesDescription',
  },
  'Market & Transfers': {
    titleKey: 'features.marketTitle',
    descriptionKey: 'features.marketDescription',
  },
}

/**
 * FeatureCard
 * Displays a single feature with icon, title and description.
 * Known homepage feature cards use the existing home translation resource;
 * unknown/custom cards continue rendering the supplied text unchanged.
 */
export default function FeatureCard({ icon, title, description }: FeatureCardProps) {
  const { t } = useTranslation('home')
  const translation = HOMEPAGE_FEATURE_TRANSLATIONS[title]
  const displayTitle = translation ? t(translation.titleKey) : title
  const displayDescription = translation ? t(translation.descriptionKey) : description

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-yellow-400/25 bg-[linear-gradient(130deg,rgba(24,46,77,.92),rgba(8,25,46,.92))] p-7 shadow-[0_15px_35px_rgba(0,0,0,.26)] transition duration-300 hover:-translate-y-1 hover:border-yellow-400/70 hover:shadow-[0_9px_28px_rgba(250,204,21,.14)]">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-yellow-400/35 bg-yellow-400/10 text-yellow-300">{icon}</div>
        <div>
          <h4 className="text-lg font-extrabold text-white">{displayTitle}</h4>
          <p className="mt-2 text-sm leading-6 text-slate-200">{displayDescription}</p>
        </div>
      </div>
    </div>
  )
}
