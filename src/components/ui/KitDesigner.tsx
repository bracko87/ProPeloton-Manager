/**
 * src/components/ui/KitDesigner.tsx
 *
 * KitDesigner
 * UI for designing and persisting team kits (jerseys).
 *
 * Purpose:
 * - Provide controls to edit jersey pattern, colors, sponsor text and number.
 * - Preview changes live using JerseyPreview.
 * - Load and save the "Home" kit for the provided team via Supabase upsert.
 * - Start with the team's applied identity colors automatically.
 *
 * Notes:
 * - Added new KitDesigner component with controls for:
 *   pattern (solid/stripes/hoops/sash)
 *   primary/secondary/sleeve/collar/trim/number colors
 *   sponsor text + shirt number
 *   save button (explicit confirmation action)
 * - Connected KitDesigner to Supabase team_kits:
 *   loads Home kit for the current team if present
 *   saves via upsert on (team_id, name)
 *   shows helpful message if team_kits table is not created yet
 */

import React, { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import JerseyPreview, { JerseyConfig, JerseyPattern } from './JerseyPreview'

/**
 * makeDefaultConfig
 * Create sensible jersey defaults using the team's identity colors.
 */
const makeDefaultConfig = (primary: string, secondary: string): JerseyConfig => ({
  primaryColor: primary,
  secondaryColor: secondary,
  sleeveColor: '#f8fafc',
  collarColor: '#111827',
  trimColor: '#cbd5e1',
  pattern: 'stripes',
  sponsorText: 'YOUR CLUB',
  number: '10',
  numberColor: '#ffffff',
})

/**
 * KitDesigner
 * Main component exported for the kit design UI.
 */
export function KitDesigner({
  supabase,
  teamId,
  primaryColor,
  secondaryColor,
}: {
  supabase: SupabaseClient
  teamId: string
  primaryColor: string
  secondaryColor: string
}): JSX.Element {
  const [name, setName] = useState('Home')
  const [config, setConfig] = useState<JerseyConfig>(
    makeDefaultConfig(primaryColor, secondaryColor),
  )
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  /**
   * keep jersey defaults in sync with team identity when those props change
   */
  useEffect(() => {
    setConfig(prev => ({ ...prev, primaryColor, secondaryColor }))
  }, [primaryColor, secondaryColor])

  /**
   * update
   * Helper to update a single config key.
   */
  function update<K extends keyof JerseyConfig>(key: K, value: JerseyConfig[K]): void {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const canSave = useMemo(() => {
    return name.trim().length > 0 && !saving
  }, [name, saving])

  /**
   * loadKit
   * Loads the Home kit for the team if present. Shows a user-friendly message
   * when the team_kits table does not exist yet.
   */
  useEffect(() => {
    let active = true

    async function loadKit(): Promise<void> {
      setLoading(true)
      setMessage(null)

      const { data, error } = await supabase
        .from('team_kits')
        .select('name, config')
        .eq('team_id', teamId)
        .eq('name', 'Home')
        .maybeSingle<{ name: string; config: JerseyConfig }>()

      if (!active) return

      if (error) {
        setMessage('Team kits table not ready yet. You can still preview and try saving.')
        setLoading(false)
        return
      }

      if (data) {
        setName(data.name)
        setConfig(data.config)
      }

      setLoading(false)
    }

    void loadKit()

    return () => {
      active = false
    }
  }, [supabase, teamId])

  /**
   * saveKit
   * Persists the kit via upsert on (team_id, name).
   */
  async function saveKit(): Promise<void> {
    setSaving(true)
    setMessage(null)

    const { error } = await supabase.from('team_kits').upsert(
      {
        team_id: teamId,
        name: name.trim(),
        config,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'team_id,name',
      },
    )

    setSaving(false)
    setMessage(error ? error.message : 'Kit saved.')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <form
        onSubmit={e => {
          e.preventDefault()
          void saveKit()
        }}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kit name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-slate-500"
            placeholder="Home"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Pattern</label>
          <select
            value={config.pattern}
            onChange={e => update('pattern', e.target.value as JerseyPattern)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          >
            <option value="solid">Solid</option>
            <option value="stripes">Stripes</option>
            <option value="hoops">Hoops</option>
            <option value="sash">Sash</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Primary
            <input
              type="color"
              value={config.primaryColor}
              onChange={e => update('primaryColor', e.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Secondary
            <input
              type="color"
              value={config.secondaryColor}
              onChange={e => update('secondaryColor', e.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Sleeves
            <input
              type="color"
              value={config.sleeveColor}
              onChange={e => update('sleeveColor', e.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Collar
            <input
              type="color"
              value={config.collarColor}
              onChange={e => update('collarColor', e.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Trim
            <input
              type="color"
              value={config.trimColor}
              onChange={e => update('trimColor', e.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Number
            <input
              type="color"
              value={config.numberColor}
              onChange={e => update('numberColor', e.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            />
          </label>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Sponsor text</label>
          <input
            value={config.sponsorText ?? ''}
            onChange={e => update('sponsorText', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            placeholder="YOUR CLUB"
            maxLength={18}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Shirt number</label>
          <input
            value={config.number ?? ''}
            onChange={e => update('number', e.target.value.replace(/\D/g, '').slice(0, 2))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            placeholder="10"
          />
        </div>

        <button
          type="submit"
          disabled={!canSave}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : loading ? 'Loading…' : 'Save kit'}
        </button>

        {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-700">Live preview</div>
            <div className="text-xs text-slate-500">How your kit will appear in-game</div>
          </div>
          <div className="text-xs text-slate-400">Name: {name}</div>
        </div>

        <div className="flex items-center justify-center">
          <JerseyPreview config={config} />
        </div>
      </div>
    </div>
  )
}

export default KitDesigner