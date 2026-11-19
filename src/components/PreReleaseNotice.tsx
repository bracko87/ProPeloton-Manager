/**
 * Public prelaunch notice. Registration stays open while the Season 1
 * clock is frozen; the official release is scheduled for 1 December 2026.
 */
import React from 'react'
import { useTranslation } from 'react-i18next'

type Copy = { title: string; description: string; accounts: string }

const COPY: Record<string, Copy> = {
  en: {
    title: "Official launch — 1 December 2026",
    description: "Registration is open. ProPeloton Manager is reset to Season 1, January 1. The game is paused until 1 December 2026 at 07:00 (German time).",
    accounts: "Your account and team identity are preserved. Free Premium is available now; the seven-day trial countdown starts at launch. Paid subscriptions are unchanged.",
  },
  de: {
    title: "Offizieller Start — 1. Dezember 2026",
    description: "Die Registrierung ist geöffnet. ProPeloton Manager wurde auf Saison 1, 1. Januar, zurückgesetzt. Bis zum 1. Dezember 2026 um 07:00 Uhr (deutscher Zeit) bleibt das Spiel pausiert.",
    accounts: "Dein Konto und dein Team bleiben erhalten. Kostenloses Premium ist jetzt verfügbar; die 7-tägige Testphase beginnt am Starttag. Bezahlte Abonnements bleiben unverändert.",
  },
  "sr-latn": {
    title: "Zvanični početak — 1. decembar 2026.",
    description: "Registracija je otvorena. ProPeloton Manager je vraćen na sezonu 1, 1. januar. Igra je pauzirana do 1. decembra 2026. u 07:00 po nemačkom vremenu.",
    accounts: "Tvoj nalog i identitet tima ostaju sačuvani. Besplatan Premium je dostupan sada; odbrojavanje probnih sedam dana počinje na dan izlaska. Plaćene pretplate ostaju nepromenjene.",
  },
  hr: {
    title: "Službeni početak — 1. prosinca 2026.",
    description: "Registracija je otvorena. ProPeloton Manager vraćen je na sezonu 1, 1. siječnja. Igra je pauzirana do 1. prosinca 2026. u 07:00 po njemačkom vremenu.",
    accounts: "Vaš račun i identitet ekipe ostaju sačuvani. Besplatni Premium dostupan je sada; sedmodnevno probno razdoblje počinje na dan izlaska. Plaćene pretplate ostaju nepromijenjene.",
  },
  es: {
    title: "Lanzamiento oficial — 1 de diciembre de 2026",
    description: "El registro está abierto. ProPeloton Manager se ha reiniciado en la temporada 1, 1 de enero. El juego estará pausado hasta el 1 de diciembre de 2026 a las 07:00 (hora de Alemania).",
    accounts: "Tu cuenta y la identidad de tu equipo se conservan. Premium gratis ya está disponible; los siete días de prueba empiezan a contar desde el lanzamiento. Las suscripciones pagadas no cambian.",
  },
  fr: {
    title: "Lancement officiel — 1er décembre 2026",
    description: "Les inscriptions sont ouvertes. ProPeloton Manager a été réinitialisé à la saison 1, le 1er janvier. Le jeu reste en pause jusqu’au 1er décembre 2026 à 07 h 00 (heure allemande).",
    accounts: "Votre compte et l’identité de votre équipe sont conservés. Premium est disponible gratuitement dès maintenant ; les sept jours d’essai commencent au lancement. Les abonnements payants restent inchangés.",
  },
  it: {
    title: "Lancio ufficiale — 1 dicembre 2026",
    description: "Le registrazioni sono aperte. ProPeloton Manager è stato riportato alla stagione 1, 1 gennaio. Il gioco resterà in pausa fino al 1 dicembre 2026 alle 07:00 (ora tedesca).",
    accounts: "Il tuo account e l’identità della squadra restano invariati. Premium gratuito è già disponibile; i sette giorni di prova iniziano al lancio. Gli abbonamenti a pagamento non cambiano.",
  },
  ru: {
    title: "Официальный запуск — 1 декабря 2026 года",
    description: "Регистрация открыта. ProPeloton Manager возвращён к первому сезону, 1 января. Игра приостановлена до 1 декабря 2026 года, 07:00 по германскому времени.",
    accounts: "Ваша учётная запись и команда сохраняются. Бесплатный Premium уже доступен; отсчёт семи дней пробного периода начнётся в день запуска. Платные подписки не меняются.",
  },
}

/** Shared translated launch copy for the homepage dialog and signup notice. */
export function getPreReleaseNoticeCopy(language: string): Copy {
  const normalized = (language || 'en').toLowerCase()
  const key = normalized.startsWith('sr') ? 'sr-latn' : normalized.split('-')[0]
  return COPY[key] || COPY.en
}

export default function PreReleaseNotice({
  variant = 'light',
}: {
  variant?: 'light' | 'dark'
}): JSX.Element {
  const { i18n } = useTranslation()
  const copy = getPreReleaseNoticeCopy(i18n.resolvedLanguage || i18n.language || 'en')
  const dark = variant === 'dark'

  return (
    <aside
      role="note"
      aria-label={copy.title}
      className={
        dark
          ? 'rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-sm leading-6 text-yellow-50'
          : 'rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950'
      }
      data-testid="pre-release-reset-notice"
    >
      <p className="font-bold">{copy.title}</p>
      <p className="mt-1">{copy.description}</p>
      <p className="mt-1 font-medium">{copy.accounts}</p>
    </aside>
  )
}
