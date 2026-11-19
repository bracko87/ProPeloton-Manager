/**
 * ProPeloton Manager desktop downloads, directly after the public homepage videos.
 * The packages use the same online game, account and server as browser play.
 * Linux/Windows artifacts are from the verified desktop-v0.1.0 GitHub prerelease.
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownToLine, Gamepad2, Monitor, Terminal } from 'lucide-react'
import rpmIconBase64 from '../../../desktop/assets/rpm-original-user-icon.webp.b64'

export const WINDOWS_DESKTOP_URL =
  'https://github.com/bracko87/ProPeloton-Manager/releases/download/desktop-v0.1.0/ProPelotonManager-Setup-0.1.0-x64.exe'
export const LINUX_DESKTOP_URL =
  'https://github.com/bracko87/ProPeloton-Manager/releases/download/desktop-v0.1.0/ProPelotonManager-0.1.0-x86_64.AppImage'

const COPY: Record<string, {
  eyebrow: string
  title: string
  description: string
  windows: string
  linux: string
  steam: string
  coming: string
  note: string
  unsigned: string
}> = {
  en: {
    eyebrow: 'PLAY ON YOUR COMPUTER',
    title: 'ProPeloton Manager on Desktop',
    description: 'Play in your browser or install the same online cycling manager game on your computer. Your club, riders, races and Premium status stay connected.',
    windows: 'Download for Windows',
    linux: 'Download for Linux',
    steam: 'Steam',
    coming: 'Coming soon',
    note: 'Free online multiplayer · Internet connection required',
    unsigned: 'Early desktop preview: unsigned installer. Windows may display a SmartScreen warning.',
  },
  de: {
    eyebrow: 'AUF DEM COMPUTER SPIELEN',
    title: 'ProPeloton Manager für Desktop',
    description: 'Spiele im Browser oder installiere dasselbe Online-Radsport-Managerspiel auf deinem Computer. Verein, Fahrer, Rennen und Premium-Status bleiben verbunden.',
    windows: 'Für Windows herunterladen',
    linux: 'Für Linux herunterladen',
    steam: 'Steam',
    coming: 'Demnächst',
    note: 'Kostenloser Online-Mehrspielermodus · Internet erforderlich',
    unsigned: 'Desktop-Testversion: Installer ohne Signatur. Windows kann eine SmartScreen-Warnung anzeigen.',
  },
  'sr-latn': {
    eyebrow: 'IGRAJ NA RAČUNARU',
    title: 'ProPeloton Manager za računar',
    description: 'Igraj u pregledaču ili instaliraj istu onlajn biciklističku menadžersku igru. Klub, biciklisti, trke i Premium status ostaju povezani.',
    windows: 'Preuzmi za Windows',
    linux: 'Preuzmi za Linux',
    steam: 'Steam',
    coming: 'Uskoro',
    note: 'Besplatna onlajn igra · Potreban je internet',
    unsigned: 'Rana test verzija: instalacija nije digitalno potpisana. Windows može prikazati upozorenje.',
  },
  hr: {
    eyebrow: 'IGRAJTE NA RAČUNALU',
    title: 'ProPeloton Manager za računalo',
    description: 'Igrajte u pregledniku ili instalirajte istu online biciklističku menadžersku igru. Klub, vozači, utrke i Premium status ostaju povezani.',
    windows: 'Preuzmi za Windows',
    linux: 'Preuzmi za Linux',
    steam: 'Steam',
    coming: 'Uskoro',
    note: 'Besplatna online igra · Potreban je internet',
    unsigned: 'Rana testna verzija: instalacijski program nije digitalno potpisan. Windows može prikazati upozorenje.',
  },
  es: {
    eyebrow: 'JUEGA EN TU ORDENADOR',
    title: 'ProPeloton Manager para escritorio',
    description: 'Juega en el navegador o instala el mismo juego de gestión ciclista en línea. Tu club, ciclistas, carreras y estado Premium permanecen conectados.',
    windows: 'Descargar para Windows',
    linux: 'Descargar para Linux',
    steam: 'Steam',
    coming: 'Próximamente',
    note: 'Multijugador en línea gratuito · Requiere internet',
    unsigned: 'Versión preliminar: instalador sin firma digital. Windows puede mostrar una advertencia SmartScreen.',
  },
  fr: {
    eyebrow: 'JOUEZ SUR ORDINATEUR',
    title: 'ProPeloton Manager sur ordinateur',
    description: 'Jouez dans le navigateur ou installez le même jeu de gestion cycliste en ligne. Votre club, vos coureurs, vos courses et votre statut Premium restent liés.',
    windows: 'Télécharger pour Windows',
    linux: 'Télécharger pour Linux',
    steam: 'Steam',
    coming: 'Bientôt',
    note: 'Multijoueur en ligne gratuit · Connexion Internet requise',
    unsigned: 'Version préliminaire : programme non signé. Windows peut afficher une alerte SmartScreen.',
  },
  it: {
    eyebrow: 'GIOCA SUL COMPUTER',
    title: 'ProPeloton Manager per desktop',
    description: 'Gioca nel browser o installa lo stesso gioco di ciclismo manageriale online. Club, corridori, gare e stato Premium restano collegati.',
    windows: 'Scarica per Windows',
    linux: 'Scarica per Linux',
    steam: 'Steam',
    coming: 'Prossimamente',
    note: 'Multiplayer online gratuito · Connessione Internet richiesta',
    unsigned: 'Versione preliminare: installer non firmato. Windows potrebbe mostrare un avviso SmartScreen.',
  },
  ru: {
    eyebrow: 'ИГРАЙТЕ НА КОМПЬЮТЕРЕ',
    title: 'ProPeloton Manager для ПК',
    description: 'Играйте в браузере или установите ту же сетевую игру о веломенеджменте. Клуб, гонщики, заезды и статус Premium остаются общими.',
    windows: 'Скачать для Windows',
    linux: 'Скачать для Linux',
    steam: 'Steam',
    coming: 'Скоро',
    note: 'Бесплатная многопользовательская игра · Требуется интернет',
    unsigned: 'Ранняя версия: установщик без цифровой подписи. Windows может показать предупреждение SmartScreen.',
  },
}

export default function HomeDesktopDownloads(): JSX.Element {
  const { i18n } = useTranslation()
  const language = (i18n.resolvedLanguage || i18n.language || 'en').toLowerCase()
  const lang = language.startsWith('sr') ? 'sr-latn' : language.split('-')[0]
  const copy = COPY[lang] || COPY.en

  return (
    <section
      id="desktop-downloads"
      aria-labelledby="ppm-desktop-download-title"
      className="relative isolate overflow-hidden border-y border-yellow-400/20 bg-[#081224] py-14 text-white sm:py-20"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_30%,rgba(250,204,21,0.11),transparent_55%)]" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        <div className="flex items-start gap-5 sm:gap-7">
          <div className="hidden shrink-0 overflow-hidden rounded-2xl border border-yellow-400/25 bg-black p-1.5 shadow-xl sm:block">
            <img
              src={`data:image/webp;base64,${rpmIconBase64.trim()}`}
              width={114}
              height={114}
              alt="ProPeloton Manager RPM desktop application logo"
              loading="lazy"
              className="h-28 w-28 rounded-xl object-contain"
            />
          </div>
          <div className="min-w-0 max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.19em] text-yellow-400">
              {copy.eyebrow}
            </p>
            <h2 id="ppm-desktop-download-title" className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {copy.title}
            </h2>
            <p className="mt-4 text-base leading-7 text-white/75">{copy.description}</p>
            <p className="mt-4 text-sm font-medium text-yellow-100/80">{copy.note}</p>
            <p className="mt-3 text-xs leading-5 text-white/50">{copy.unsigned}</p>
          </div>
        </div>
        <div className="grid gap-3" aria-label={copy.title}>
          <a
            href={WINDOWS_DESKTOP_URL}
            className="flex min-h-14 items-center gap-4 rounded-xl border border-yellow-300/30 bg-yellow-400 px-5 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg transition hover:bg-yellow-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-300"
            aria-label={copy.windows}
          >
            <Monitor size={23} aria-hidden="true" />
            <span className="flex-1">{copy.windows}</span>
            <ArrowDownToLine size={20} aria-hidden="true" />
          </a>
          <a
            href={LINUX_DESKTOP_URL}
            className="flex min-h-14 items-center gap-4 rounded-xl border border-white/20 bg-white px-5 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-300"
            aria-label={copy.linux}
          >
            <Terminal size={23} aria-hidden="true" />
            <span className="flex-1">{copy.linux}</span>
            <ArrowDownToLine size={20} aria-hidden="true" />
          </a>
          <div
            aria-disabled="true"
            className="flex min-h-12 items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/50"
          >
            <Gamepad2 size={22} aria-hidden="true" />
            <span className="flex-1">{copy.steam}</span>
            <span>{copy.coming}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
