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
    <div className="bg-white/5 rounded-lg p-5">
      <div className="flex items-start gap-4">
        <div className="text-yellow-400">{icon}</div>
        <div>
          <h4 className="font-semibold text-white">{displayTitle}</h4>
          <p className="mt-1 text-sm text-white/70">{displayDescription}</p>
        </div>
      </div>
    </div>
  )
}
