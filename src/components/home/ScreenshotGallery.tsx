/**
 * ScreenshotGallery.tsx
 * Homepage screenshot gallery with pagination controls and image popup.
 */

import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

type ScreenshotItem = {
  src: string
  index: number
}

const SCREENSHOT_URLS = [
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Overview%201.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Overview%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Assets%20Page.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Infrastracture%20page%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Infrastracture%20page%203.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Infrastracture%20Page.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Calendar%201.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Calendar%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/calendar%203.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Equipment%20Page%201.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Equipment%20Page%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Equipment%20Page%203.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Equipment%20Page%204.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Equipment%20Page%205.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Equipment%20Page%206.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Equipment%20Page%207.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Equipment%20Page%208.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Finance%20Page%201.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Finance%20Page%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Finance%20Page%203.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Finance%20Page%204.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Finance%20Page%205.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Finance%20page%206.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Race%20detail%201.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Race%20Detail%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Race%20Detais%203.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Race%20preparatiomn%203.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Race%20preparation%201.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Race%20preparation%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Race%20preparation%204.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Race%20Preparation%205.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Rider%20profile%201.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Rider%20Profile%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Rider%20profile%203.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Rider%20Profile%204.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Rider%20profile%205.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Squad%20Page%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Squad%20Page.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Statistic%20Page%201.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Statistic%20Page%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Team%20ranking%20Page%201.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Team%20Ranking%20Page%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Team%20Ranking%20Page%203.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Transfer%20Page%201.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Transfer%20Page%202.jpg',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Transfer%20page%203.jpg',
]

const SCREENSHOTS: ScreenshotItem[] = SCREENSHOT_URLS.map((src, index) => ({
  src,
  index: index + 1,
}))

const PAGE_SIZE = 6

export default function ScreenshotGallery(): JSX.Element {
  const { t } = useTranslation('home')
  const [page, setPage] = useState(0)
  const [selectedScreenshot, setSelectedScreenshot] = useState<ScreenshotItem | null>(null)

  const totalPages = Math.max(1, Math.ceil(SCREENSHOTS.length / PAGE_SIZE))

  const visibleScreenshots = useMemo(() => {
    const start = page * PAGE_SIZE
    return SCREENSHOTS.slice(start, start + PAGE_SIZE)
  }, [page])

  function screenshotAlt(item: ScreenshotItem): string {
    return `${t('screenshots.title')} ${item.index}`
  }

  function goPrevious() {
    setPage((currentPage) => {
      if (currentPage <= 0) return totalPages - 1
      return currentPage - 1
    })
  }

  function goNext() {
    setPage((currentPage) => {
      if (currentPage >= totalPages - 1) return 0
      return currentPage + 1
    })
  }

  function closePopup() {
    setSelectedScreenshot(null)
  }

  return (
    <section className="relative w-full overflow-hidden border-y border-white/15 bg-[#0a1730] py-16">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <img
          src="https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/ea527ef7-6896-413d-9d69-df332b440fd0.jpg"
          alt=""
          className="h-full w-full object-cover"
          style={{
            opacity: 0.08,
            WebkitMaskImage:
              'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0) 100%)',
            maskImage:
              'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0) 100%)',
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1730]/20 via-[#0a1730]/55 to-[#0a1730]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-white">{t('screenshots.title')}</h3>

            <p className="mt-2 max-w-2xl text-sm text-white/70">
              {t('screenshots.subtitle')}
            </p>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrevious}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:border-yellow-400 hover:text-yellow-400"
                aria-label={t('screenshots.previous')}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>

              <button
                type="button"
                onClick={goNext}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:border-yellow-400 hover:text-yellow-400"
                aria-label={t('screenshots.next')}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleScreenshots.map((img) => (
            <button
              key={img.src}
              type="button"
              onClick={() => setSelectedScreenshot(img)}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/5 text-left shadow transition hover:border-yellow-400/70"
            >
              <img
                src={img.src}
                alt={screenshotAlt(img)}
                className="h-56 w-full object-cover transition-transform duration-300 hover:scale-105"
                loading="lazy"
              />
            </button>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            {Array.from({ length: totalPages }).map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setPage(index)}
                className={[
                  'h-2.5 rounded-full transition-all',
                  index === page
                    ? 'w-8 bg-yellow-400'
                    : 'w-2.5 bg-white/30 hover:bg-white/60',
                ].join(' ')}
                aria-label={t('screenshots.openPage', { page: index + 1 })}
              />
            ))}
          </div>
        )}
      </div>

      {selectedScreenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-0"
          role="dialog"
          aria-modal="true"
          onClick={closePopup}
        >
          <button
            type="button"
            onClick={closePopup}
            className="absolute right-5 top-5 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xl font-bold text-white shadow-lg hover:border-yellow-400 hover:text-yellow-400"
            aria-label={t('screenshots.close')}
          >
            ✕
          </button>

          <div
            className="flex h-screen w-screen items-center justify-center p-4 sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={selectedScreenshot.src}
              alt={screenshotAlt(selectedScreenshot)}
              className="max-h-[96vh] max-w-[98vw] object-contain"
            />
          </div>
        </div>
      )}
    </section>
  )
}
