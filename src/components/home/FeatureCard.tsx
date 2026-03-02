/**
 * FeatureCard.tsx
 * Small reusable card to present a product feature.
 */

import React from 'react'
import { Icon as LucideIcon } from 'lucide-react'

/**
 * FeatureCardProps
 * Props for FeatureCard component.
 */
interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

/**
 * FeatureCard
 * Displays a single feature with icon, title and description.
 */
export default function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="bg-white/5 rounded-lg p-5">
      <div className="flex items-start gap-4">
        <div className="text-yellow-400">{icon}</div>
        <div>
          <h4 className="font-semibold text-white">{title}</h4>
          <p className="mt-1 text-sm text-white/70">{description}</p>
        </div>
      </div>
    </div>
  )
}
