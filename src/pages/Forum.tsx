/**
 * Forum.tsx
 * Community page with Discord notice / placeholder.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'

const DISCORD_INVITE_URL = 'https://discord.gg/BpgqTXsjAW'

/**
 * ForumPage
 * Shows a notice that all community discussions will be handled on Discord.
 */
export default function ForumPage(): JSX.Element {
  const { t } = useTranslation('common')

  return (
    <div className="w-full">
      <h2 className="mb-4 text-xl font-semibold">{t('forum.title')}</h2>

      <div className="space-y-4">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 shadow">
          <p className="text-sm font-semibold text-gray-900">
            {t('forum.movingTitle')}
          </p>
          <p className="mt-2 text-sm text-gray-700">
            {t('forum.movingText')}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            {t('forum.joinHint')}
          </p>
        </div>

        <div className="overflow-hidden rounded-xl bg-indigo-600 shadow">
          <div className="flex flex-col gap-4 p-6 text-white md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                {t('forum.community')}
              </p>
              <h3 className="mt-1 text-2xl font-bold">{t('forum.joinTitle')}</h3>
              <p className="mt-2 text-sm text-indigo-100">
                {t('forum.joinText')}
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 md:items-end">
              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
              >
                {t('forum.join')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
