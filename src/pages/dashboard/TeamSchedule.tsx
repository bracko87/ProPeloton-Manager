/**
 * TeamSchedule.tsx
 * Training schedule and preparation UI template.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'

function formatWeekdayRange(locale: string, endDayOffset: number): string {
  const monday = new Date(Date.UTC(2024, 0, 1))
  const endDay = new Date(Date.UTC(2024, 0, 1 + endDayOffset))
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })

  return `${formatter.format(monday)}–${formatter.format(endDay)}`
}

/**
 * TeamSchedulePage
 * Shows training blocks and recovery schedules (placeholders for backend data).
 */
export default function TeamSchedulePage() {
  const { t, i18n } = useTranslation('training')
  const locale = i18n.resolvedLanguage?.startsWith('sr')
    ? 'sr-Latn-RS'
    : i18n.resolvedLanguage || 'en-US'

  const blocks = [
    {
      id: 1,
      title: t('focus.endurance'),
      intensity: t('intensity.normal'),
      days: formatWeekdayRange(locale, 4),
    },
    {
      id: 2,
      title: t('focus.sprint'),
      intensity: t('intensity.hard'),
      days: formatWeekdayRange(locale, 2),
    },
  ]

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">{t('page.title')}</h2>

      <div className="grid grid-cols-2 gap-4 w-full">
        {blocks.map(block => (
          <div key={block.id} className="bg-white rounded-lg p-4 shadow">
            <div className="font-semibold">{block.title}</div>
            <div className="text-sm text-gray-500 mt-2">
              {t('regular.intensity')}: {block.intensity}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {t('common.day', { day: block.days })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
