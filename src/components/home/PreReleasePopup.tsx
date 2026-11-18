/**
 * Homepage-only pre-release popup. The detailed notice is also displayed
 * inline on login/register pages, so people can review it before signup.
 * A dismissal lasts for this browser tab/session, not across future visits.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, MessageCircle, X } from 'lucide-react'
import PreReleaseNotice from '../PreReleaseNotice'

const DISCORD_URL = 'https://discord.gg/BpgqTXsjAW'
const DISMISSED_KEY = 'ppm-prelaunch-reset-popup-dismissed-v1'

const COPY: Record<string, { title: string; discord: string; continue: string; close: string }> = {
  en: {
    title: 'Important information before you play',
    discord: 'Join our Discord',
    continue: 'Continue to website',
    close: 'Close pre-release notice',
  },
  de: {
    title: 'Wichtige Informationen vor dem Spielen',
    discord: 'Unserem Discord beitreten',
    continue: 'Weiter zur Website',
    close: 'Hinweis schließen',
  },
  'sr-latn': {
    title: 'Važno obaveštenje pre igranja',
    discord: 'Pridružite se Discord kanalu',
    continue: 'Nastavi na sajt',
    close: 'Zatvori obaveštenje',
  },
  hr: {
    title: 'Važna obavijest prije igranja',
    discord: 'Pridružite se Discordu',
    continue: 'Nastavi na stranicu',
    close: 'Zatvori obavijest',
  },
  es: {
    title: 'Información importante antes de jugar',
    discord: 'Únete a nuestro Discord',
    continue: 'Continuar al sitio web',
    close: 'Cerrar aviso',
  },
  fr: {
    title: 'Informations importantes avant de jouer',
    discord: 'Rejoindre notre Discord',
    continue: 'Continuer vers le site',
    close: 'Fermer l’avis',
  },
  it: {
    title: 'Informazioni importanti prima di giocare',
    discord: 'Unisciti al nostro Discord',
    continue: 'Continua al sito',
    close: 'Chiudi avviso',
  },
  ru: {
    title: 'Важная информация перед игрой',
    discord: 'Присоединиться к Discord',
    continue: 'Перейти на сайт',
    close: 'Закрыть уведомление',
  },
}

function isNotDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) !== '1'
  } catch {
    return true
  }
}

export default function PreReleasePopup(): JSX.Element | null {
  const { i18n } = useTranslation()
  const language = (i18n.resolvedLanguage || i18n.language || 'en').toLowerCase()
  const key = language.startsWith('sr') ? 'sr-latn' : language.split('-')[0]
  const copy = COPY[key] || COPY.en
  const [open, setOpen] = useState(isNotDismissed)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  function dismiss(): void {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Browsers that block storage can still close the popup.
    }
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open])

  function handleTab(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab') return
    const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href]',
    )
    if (!elements?.length) return
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-[#020817]/85 px-4 py-6 backdrop-blur-sm"
      onMouseDown={event => {
        if (event.target === event.currentTarget) dismiss()
      }}
      data-testid="pre-release-reset-popup-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ppm-pre-release-popup-title"
        onKeyDown={handleTab}
        className="relative my-auto w-full max-w-2xl rounded-2xl border border-yellow-400/35 bg-[#0c1c36] p-5 text-white shadow-2xl sm:p-7"
        data-testid="pre-release-reset-popup"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          aria-label={copy.close}
          className="absolute right-3 top-3 rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400 sm:right-4 sm:top-4"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className="mb-5 flex items-center gap-3 pr-10">
          <Info className="shrink-0 text-yellow-400" size={24} aria-hidden="true" />
          <h2 id="ppm-pre-release-popup-title" className="text-xl font-bold sm:text-2xl">
            {copy.title}
          </h2>
        </div>

        <PreReleaseNotice variant="dark" />

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-indigo-300/50 bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
          >
            <MessageCircle size={18} aria-hidden="true" />
            {copy.discord}
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
          >
            {copy.continue}
          </button>
        </div>
      </div>
    </div>
  )
}
