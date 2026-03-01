/**
 * StatCard.tsx
 * Reusable statistic card used across the UI.
 */

import React from 'react'

/**
 * StatCardProps
 * Props for StatCard.
 */
interface StatCardProps {
  label: string
  value: string | number
  description?: string
}

/**
 * StatCard
 * Compact card showing a primary value and label.
 */
export default function StatCard({ label, value, description }: StatCardProps) {
  return (
    <div className="bg-white shadow-sm rounded-md p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
      {description && <div className="text-sm text-gray-500 mt-2">{description}</div>}
    </div>
  )
}
