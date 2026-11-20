/** Public, interactive ranking panel reusing the same view as the game ranking page. */
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Activity, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type RankingEntry = { id: string; name: string; points: number }
type Competition = {
  id: string
  field: 'club_tier' | 'tier2_division' | 'tier3_division'
  value: string
  labelKey: string
}
const COMPETITIONS: Competition[] = [
  { id: 'world', field: 'club_tier', value: 'world', labelKey: 'hero.competitionWorld' },
  { id: 'pro-west', field: 'tier2_division', value: 'PRO_WEST', labelKey: 'hero.competitionProWest' },
  { id: 'pro-east', field: 'tier2_division', value: 'PRO_EAST', labelKey: 'hero.competitionProEast' },
  { id: 'cont-europe', field: 'tier3_division', value: 'CONTINENTAL_EUROPE', labelKey: 'hero.competitionContEurope' },
  { id: 'cont-america', field: 'tier3_division', value: 'CONTINENTAL_AMERICA', labelKey: 'hero.competitionContAmerica' },
  { id: 'cont-asia', field: 'tier3_division', value: 'CONTINENTAL_ASIA', labelKey: 'hero.competitionContAsia' },
  { id: 'cont-africa', field: 'tier3_division', value: 'CONTINENTAL_AFRICA', labelKey: 'hero.competitionContAfrica' },
  { id: 'cont-oceania', field: 'tier3_division', value: 'CONTINENTAL_OCEANIA', labelKey: 'hero.competitionContOceania' },
]

export default function HomeLiveRanking({
  seasonNumber,
  preLaunch,
  locale,
}: {
  seasonNumber: number
  preLaunch: boolean
  locale: string
}): JSX.Element {
  const { t } = useTranslation('home')
  const [competitionId, setCompetitionId] = useState('world')
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const competition = COMPETITIONS.find(item => item.id === competitionId) || COMPETITIONS[0]
    setStatus('loading')
    setRanking([])
    listRef.current?.scrollTo({ top: 0 })

    const load = async () => {
      let query = supabase
        .from('team_rankings_view')
        .select('id, name, season_points')
      // Honour the division selection. No invented team names, ranks or points.
      if (competition.id === 'world') {
        query = query.in('club_tier', ['world', 'worldteam', 'WORLD', 'WORLDTEAM'])
      } else {
        query = query.eq(competition.field, competition.value)
      }
      const { data, error } = await query
        .order('season_points', { ascending: false })
        .order('name', { ascending: true })
        .limit(25)
      if (cancelled) return
      if (error || !data?.length) {
        if (error) console.warn('Could not load public team rankings:', error.message)
        setStatus('empty')
        return
      }
      setRanking(data.map(row => ({
        id: String(row.id),
        name: String(row.name),
        points: Number(row.season_points) || 0,
      })))
      setStatus('ready')
    }
    void load()
    return () => { cancelled = true }
  }, [competitionId])

  return (
    <aside className="ppm-glass ppm-ranking-panel mt-8 w-full rounded-2xl p-4 sm:max-w-[450px] sm:p-5 lg:absolute lg:bottom-14 lg:right-10 lg:top-9 lg:mt-0 lg:flex lg:w-[410px] lg:flex-col xl:w-[450px]"
      aria-label={t('hero.liveRankings')}>
      <style>{`
        .ppm-cinematic .ppm-ranking-panel {
          border:1px solid rgba(250,204,21,.62);
          background:linear-gradient(130deg,rgba(17,36,61,.93),rgba(5,16,32,.90));
          box-shadow:0 0 0 1px rgba(250,204,21,.25),0 0 31px rgba(250,204,21,.23),0 24px 60px rgba(0,0,0,.53);
        }
        .ppm-cinematic .ppm-rank-scroll {scrollbar-width:thin;scrollbar-color:#facc15 rgba(255,255,255,.08);overscroll-behavior:contain;}
        .ppm-cinematic .ppm-rank-scroll::-webkit-scrollbar {width:6px;}
        .ppm-cinematic .ppm-rank-scroll::-webkit-scrollbar-thumb {background:#eab308;border-radius:99px;}
      `}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-3">
        <div className="flex items-center gap-2">
          <Activity size={21} className="text-yellow-400" aria-hidden="true" />
          <h2 className="text-lg font-black uppercase italic tracking-wide text-white">{t('hero.liveRankings')}</h2>
        </div>
        <span className="flex items-center gap-2 rounded-lg border border-white/20 bg-[#061426]/70 px-3 py-2 text-[11px] font-bold text-white">
          <span className={`ppm-live-dot h-2.5 w-2.5 rounded-full ${preLaunch ? 'bg-amber-400' : 'bg-green-400'}`} aria-hidden="true" />
          {t('hero.season')} {seasonNumber} · {t(preLaunch ? 'hero.statusPrelaunch' : 'hero.statusActive')}
        </span>
      </div>
      <label htmlFor="ppm-ranking-competition" className="mt-3 block text-xs font-semibold uppercase tracking-wide text-yellow-300">
        {t('hero.competitionLabel')}
      </label>
      <select id="ppm-ranking-competition" value={competitionId}
        onChange={event => setCompetitionId(event.target.value)}
        className="mt-2 w-full rounded-xl border border-yellow-400/35 bg-[#09192f] px-3 py-2.5 text-sm font-bold text-white focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30">
        {COMPETITIONS.map(item => <option key={item.id} value={item.id}>{t(item.labelKey)}</option>)}
      </select>
      <div className="mt-3 flex items-center justify-between border-b border-white/15 pb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-300">
        <span>{t('hero.teamColumn')}</span><span>{t('hero.pointsAbbrev')}</span>
      </div>
      <div ref={listRef} className="ppm-rank-scroll mt-2 min-h-[215px] max-h-[340px] flex-1 overflow-y-auto pr-2 lg:max-h-none"
        role="region" tabIndex={0} aria-label={t('hero.rankingScrollLabel')}>
        {status === 'ready' && ranking.map((entry, index) => (
          <div key={entry.id} className={`flex min-h-[38px] items-center gap-2.5 rounded-lg border-b border-white/10 px-2 text-xs transition hover:bg-yellow-400/10 sm:text-sm ${index === 0 ? 'bg-yellow-400/10' : ''}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-black ${index === 0 ? 'bg-yellow-400 text-[#071426]' : index === 1 ? 'bg-slate-300 text-[#071426]' : index === 2 ? 'bg-amber-700 text-white' : 'bg-white/10 text-white'}`}>{index+1}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-white" title={entry.name}>{entry.name}</span>
            <span className="shrink-0 font-bold tabular-nums text-slate-100">{entry.points.toLocaleString(locale)}</span>
          </div>
        ))}
        {status !== 'ready' && (
          <div className="flex min-h-[215px] items-center justify-center text-center text-sm leading-6 text-slate-200">
            {status === 'loading' ? t('hero.rankingsLoading') : t('hero.rankingsEmpty')}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/15 pt-3">
        <span className="text-xs font-semibold text-slate-300">{t('hero.rankingCount', { count: ranking.length, total: 25 })}</span>
        <Link to="/dashboard/team-ranking" className="inline-flex items-center gap-1 text-xs font-bold text-yellow-300 transition hover:text-yellow-200">
          {t('hero.rankingsViewAll')} <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </aside>
  )
}
