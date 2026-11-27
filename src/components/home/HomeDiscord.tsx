/** Full-width official community banner, matching the Tennis Legacy Discord treatment. */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, MessageCircle } from 'lucide-react'

export default function HomeDiscord({ inviteUrl }: { inviteUrl: string }): JSX.Element {
  const { t } = useTranslation('home')
  return (
    <section id="discord" aria-labelledby="ppm-discord-title"
      className="w-full bg-[linear-gradient(115deg,#4752c4_0%,#5865f2_65%,#4752c4_100%)] py-10 text-white sm:py-16">
      <div className="mx-auto grid max-w-[1510px] grid-cols-1 items-center gap-4 px-6 sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-6 sm:px-10 lg:grid-cols-[72px_minmax(0,1fr)_auto] lg:px-12">
        <span aria-hidden="true" className="grid h-[72px] w-[72px] place-items-center rounded-2xl border border-white/30 bg-white/15 text-white">
          <MessageCircle size={38} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white">{t('discordCommunity.eyebrow')}</p>
          <h2 id="ppm-discord-title" className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-4xl">{t('discordCommunity.title')}</h2>
          <p className="mt-2 max-w-[720px] text-base leading-relaxed text-white">{t('discordCommunity.description')}</p>
        </div>
        <a href={inviteUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-3 rounded-lg bg-white px-5 py-3.5 text-center text-sm font-bold leading-relaxed text-[#3944b6] transition-colors hover:bg-[#eef0ff] hover:text-[#283493] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:col-start-2 sm:w-fit lg:col-start-3 lg:row-start-1">
          {t('discordCommunity.join')} <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}
