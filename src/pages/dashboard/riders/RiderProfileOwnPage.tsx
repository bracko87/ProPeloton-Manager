/**
 * RiderProfileOwnPage.tsx
 *
 * Full-page route wrapper for the existing squad rider profile UI.
 * - Loads current game date from the backend and passes it to the profile UI.
 * - Reuses RiderProfileModal in full-page mode.
 * - Closes with a back action via navigate(-1).
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import RiderProfileModal from '../../../features/squad/components/RiderProfileModal'
import { supabase } from '../../../lib/supabase'
import { normalizeGameDateValue } from '../../../features/squad/utils/dates'

export default function RiderProfileOwnPage() {
  const { riderId } = useParams<{ riderId: string }>()
  const navigate = useNavigate()
  const [gameDate, setGameDate] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadGameDate() {
      const { data, error } = await supabase.rpc('get_current_game_date')
      if (!mounted || error) return
      setGameDate(normalizeGameDateValue(data))
    }

    void loadGameDate()

    return () => {
      mounted = false
    }
  }, [])

  if (!riderId) {
    return (
      <div className="space-y-3 p-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Back
        </button>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Missing rider id.
        </div>
      </div>
    )
  }

  return (
    <RiderProfileModal
      open
      onClose={() => navigate(-1)}
      riderId={riderId}
      gameDate={gameDate}
      currentTeamType="first"
      variant="page"
      backButtonLabel="← Back"
    />
  )
}