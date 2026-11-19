/**
 * Homepage-only pre-release popup. The detailed notice is also displayed
 * inline on login/register pages, so people can review it before signup.
 * A dismissal lasts for this browser tab/session, not across future visits.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, ExternalLink, MessageCircle, ShieldCheck, X } from 'lucide-react'
import { getPreReleaseNoticeCopy } from '../PreReleaseNotice'

const DISCORD_URL = 'https://discord.gg/BpgqTXsjAW'
const DISMISSED_KEY = 'ppm-prelaunch-launch-popup-dismissed-v2'

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
  const notice = getPreReleaseNoticeCopy(language)
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
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-[#020817]/80 px-4 py-5 backdrop-blur-[3px] sm:py-10"
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
        aria-describedby="ppm-pre-release-popup-description"
        onKeyDown={handleTab}
        className="relative my-auto max-h-[calc(100dvh-2.5rem)] w-full max-w-[650px] overflow-y-auto rounded-3xl border border-slate-200 bg-white text-slate-950 shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
        data-testid="pre-release-reset-popup"
      >
        <div className="relative overflow-hidden bg-[#0a1730] px-6 pb-7 pt-8 text-white sm:px-9 sm:pb-9 sm:pt-10">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-yellow-400" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-yellow-400/10 blur-3xl" aria-hidden="true" />
          <button
            ref={closeRef}
            type="button"
            onClick={dismiss}
            aria-label={copy.close}
            className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
          >
            <X size={19} aria-hidden="true" />
          </button>

          <div className="relative pr-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1.5 text-xs font-bold tracking-wide text-yellow-300">
              <CalendarDays size={15} aria-hidden="true" />
              ProPeloton Manager
            </div>
            <h2
              id="ppm-pre-release-popup-title"
              className="max-w-[540px] text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl"
            >
              {notice.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
              {copy.title}
            </p>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-9 sm:py-8">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <CalendarDays size={22} aria-hidden="true" />
            </span>
            <p id="ppm-pre-release-popup-description" className="pt-0.5 text-sm leading-7 text-slate-700 sm:text-base">
              {notice.description}
            </p>
          </div>

          <div className="h-px bg-slate-200" aria-hidden="true" />

          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <p className="pt-0.5 text-sm leading-7 text-slate-700 sm:text-base">
              {notice.accounts}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-9">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500"
          >
            <MessageCircle size={18} aria-hidden="true" />
            {copy.discord}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-yellow-400 px-6 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-yellow-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500"
          >
            {copy.continue}
          </button>
        </div>
      </div>
    </div>
  )
}
