/**
 * Two owner-provided ProPeloton Manager YouTube videos on the public homepage.
 * Uses privacy-enhanced YouTube embeds and a direct-link fallback.
 * Mirrors the two-card Tennis Legacy video showcase without changing the game.
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, PlayCircle } from 'lucide-react'

const VIDEOS = [
  { id: 'o308u_ZBFMM', number: 1 },
  { id: 'VGtD3jkmhzU', number: 2 },
] as const

const COPY: Record<string, { eyebrow: string; title: string; description: string; watch: string; video: string }> = {
  en: {
    eyebrow: 'VIDEOS',
    title: 'Watch ProPeloton Manager in action',
    description: 'Explore the cycling management game through these two videos.',
    watch: 'Watch on YouTube',
    video: 'Video',
  },
  de: {
    eyebrow: 'VIDEOS',
    title: 'ProPeloton Manager in Aktion',
    description: 'Entdecke das Radsport-Managementspiel in diesen beiden Videos.',
    watch: 'Auf YouTube ansehen',
    video: 'Video',
  },
  'sr-latn': {
    eyebrow: 'VIDEO-SNIMCI',
    title: 'Pogledajte ProPeloton Manager u akciji',
    description: 'Upoznajte biciklističku menadžersku igru kroz ova dva video-snimka.',
    watch: 'Pogledajte na YouTube-u',
    video: 'Video',
  },
  hr: {
    eyebrow: 'VIDEOZAPISI',
    title: 'Pogledajte ProPeloton Manager u akciji',
    description: 'Upoznajte biciklističku menadžersku igru kroz ova dva videozapisa.',
    watch: 'Pogledajte na YouTubeu',
    video: 'Video',
  },
  es: {
    eyebrow: 'VÍDEOS',
    title: 'Descubre ProPeloton Manager en acción',
    description: 'Conoce este juego de gestión ciclista en estos dos vídeos.',
    watch: 'Ver en YouTube',
    video: 'Vídeo',
  },
  fr: {
    eyebrow: 'VIDÉOS',
    title: 'Découvrez ProPeloton Manager en action',
    description: 'Découvrez ce jeu de gestion cycliste à travers ces deux vidéos.',
    watch: 'Voir sur YouTube',
    video: 'Vidéo',
  },
  it: {
    eyebrow: 'VIDEO',
    title: 'Guarda ProPeloton Manager in azione',
    description: 'Scopri questo gioco di gestione ciclistica attraverso due video.',
    watch: 'Guarda su YouTube',
    video: 'Video',
  },
  ru: {
    eyebrow: 'ВИДЕО',
    title: 'Посмотрите ProPeloton Manager в действии',
    description: 'Познакомьтесь с игрой о веломенеджменте в этих двух видео.',
    watch: 'Смотреть на YouTube',
    video: 'Видео',
  },
}

export default function HomeVideoShowcase(): JSX.Element {
  const { i18n } = useTranslation()
  const language = (i18n.resolvedLanguage || i18n.language || 'en').toLowerCase()
  const key = language.startsWith('sr') ? 'sr-latn' : language.split('-')[0]
  const copy = COPY[key] || COPY.en

  return (
    <section
      id="home-videos"
      aria-labelledby="ppm-home-videos-title"
      className="border-y border-yellow-400/15 bg-[#071426] py-14 sm:py-16"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-7 max-w-3xl">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-yellow-400">
            <PlayCircle aria-hidden="true" size={18} />
            {copy.eyebrow}
          </div>
          <h2 id="ppm-home-videos-title" className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {copy.title}
          </h2>
          <p className="mt-3 text-base leading-7 text-white/70">{copy.description}</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {VIDEOS.map(video => (
            <article
              key={video.id}
              className="min-w-0 overflow-hidden rounded-2xl border border-yellow-400/25 bg-[#132941]/80 shadow-[0_16px_42px_rgba(0,0,0,.30)] transition duration-300 hover:-translate-y-1 hover:border-yellow-400/65"
            >
              <div className="relative aspect-video w-full bg-[#040d1c]">
                <iframe
                  className="absolute inset-0 h-full w-full"
                  src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0`}
                  title={`ProPeloton Manager — ${copy.video} ${video.number}`}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <h3 className="text-base font-semibold text-white">
                  ProPeloton Manager — {copy.video} {video.number}
                </h3>
                <a
                  href={`https://www.youtube.com/watch?v=${video.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-yellow-300 underline-offset-4 hover:text-yellow-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
                >
                  {copy.watch} <ExternalLink size={15} aria-hidden="true" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
