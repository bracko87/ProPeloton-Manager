import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { estimateRiderPower, type RiderPowerSkills } from '../../lib/riderPower'

/**
 * Shared read-only physique/power card. Does not write to or feed any race engine.
 * Power is revealed only if caller supplies legitimately visible exact rider skills.
 */
export default function RiderPowerProfile({
  riderId,
  skills,
  scoutingRestricted = false,
}: {
  riderId: string
  skills: RiderPowerSkills | null
  scoutingRestricted?: boolean
}): JSX.Element {
  const { t } = useTranslation('riderProfile')
  const [physique, setPhysique] = useState<{ height_cm: number; weight_kg: number } | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  useEffect(() => {
    let active = true
    setPhysique(null)
    if (!riderId) return () => { active = false }
    void supabase.rpc('get_rider_physiques_v1', { p_rider_ids: [riderId] })
      .then(({ data, error }) => {
        if (!active || error) return
        const row = (Array.isArray(data) ? data[0] : null) as { height_cm: number; weight_kg: number } | null
        if (row && Number.isFinite(row.height_cm) && Number.isFinite(row.weight_kg)) setPhysique(row)
      })
    return () => { active = false }
  }, [riderId])

  const power = useMemo(
    () => estimateRiderPower(skills, physique?.weight_kg),
    [skills?.sprint, skills?.climbing, skills?.time_trial, skills?.endurance, skills?.flat, skills?.resistance, physique?.weight_kg],
  )

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{t('powerProfile.title')}</h2>
        <button type="button" aria-expanded={infoOpen} aria-label={t('powerProfile.helpTitle')}
          onClick={() => setInfoOpen(open => !open)}
          className="rounded-full border border-slate-200 px-2.5 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          ⓘ
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{t('powerProfile.summary')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          [t('powerProfile.height'), physique ? `${physique.height_cm} cm` : '—'],
          [t('powerProfile.weight'), physique ? `${physique.weight_kg} kg` : '—'],
          [t('powerProfile.ftp'), power ? `${power.ftp} W` : '—'],
          [t('powerProfile.wkg'), power ? `${power.wPerKg.toFixed(2)} W/kg` : '—'],
        ] as [string, string][]).map(([label, value]) =>
          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{value}</div>
          </div>
        )}
      </div>
      {power ? (
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          {([
            [t('powerProfile.fiveSeconds'), power.fiveSeconds],
            [t('powerProfile.oneMinute'), power.oneMinute],
            [t('powerProfile.fiveMinutes'), power.fiveMinutes],
          ] as [string, number][]).map(([label, watts]) =>
            <div key={label} className="flex justify-between gap-3 rounded-md border border-slate-100 px-3 py-2">
              <span className="text-slate-600">{label}</span>
              <strong className="tabular-nums text-slate-900">{watts} W</strong>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-amber-700">
          {t(scoutingRestricted ? 'powerProfile.scoutingHidden' : 'powerProfile.unavailable')}
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-600">{t('powerProfile.transferMeaning')}</p>
      {infoOpen && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-slate-800">
          <strong>{t('powerProfile.helpTitle')}</strong>
          <p className="mt-1">{t('powerProfile.helpText')}</p>
          <p className="mt-2">{t('powerProfile.engineNote')}</p>
        </div>
      )}
    </section>
  )
}
