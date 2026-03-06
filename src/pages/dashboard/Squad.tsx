/**
 * Squad.tsx
 * Squad management page: roster list + rider cards (Supabase).
 *
 * Expects a Supabase view `club_roster` with:
 * club_id, rider_id, display_name, assigned_role, age_years, overall
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type RiderRole =
  | 'Leader'
  | 'Sprinter'
  | 'Climber'
  | 'TT'
  | 'Domestique'
  | 'Breakaway'
  | 'All-rounder'

type ClubRosterRow = {
  club_id: string
  rider_id: string
  display_name: string
  assigned_role: RiderRole
  age_years: number
  overall: number
}

export default function SquadPage() {
  const [clubId, setClubId] = useState<string | null>(null)
  const [rows, setRows] = useState<ClubRosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const riders = useMemo(
    () =>
      rows.map((r, idx) => ({
        rowNo: idx + 1,
        id: r.rider_id,
        name: r.display_name,
        role: r.assigned_role,
        age: r.age_years,
        fitness: r.overall,
      })),
    [rows]
  )

  useEffect(() => {
    let isMounted = true

    async function loadClubIdAndRoster() {
      setLoading(true)
      setError(null)

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser()
        if (authErr) throw authErr

        const userId = authData.user?.id
        if (!userId) throw new Error('Not authenticated.')

        const { data: club, error: clubErr } = await supabase
          .from('clubs')
          .select('id')
          .eq('owner_user_id', userId)
          .single()

        if (clubErr) throw clubErr
        if (!club?.id) throw new Error('No club found for this user.')

        if (!isMounted) return
        setClubId(club.id)

        const { data: roster, error: rosterErr } = await supabase
          .from('club_roster')
          .select('club_id, rider_id, display_name, assigned_role, age_years, overall')
          .eq('club_id', club.id)
          .order('overall', { ascending: false })

        if (rosterErr) throw rosterErr

        if (!isMounted) return
        setRows((roster ?? []) as ClubRosterRow[])
      } catch (e: any) {
        if (!isMounted) return
        setError(e?.message ?? 'Failed to load squad.')
      } finally {
        if (!isMounted) return
        setLoading(false)
      }
    }

    loadClubIdAndRoster()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">Squad</h2>

      {loading && (
        <div className="bg-white rounded-lg p-4 shadow w-full text-sm text-gray-600">
          Loading squad…
        </div>
      )}

      {!loading && error && (
        <div className="bg-white rounded-lg p-4 shadow w-full">
          <div className="text-sm text-red-600 font-medium">Could not load squad</div>
          <div className="text-sm text-gray-600 mt-1">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="bg-white rounded-lg p-4 shadow w-full">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-500">
                Club: <span className="font-medium text-gray-700">{clubId ?? '—'}</span>
              </div>
              <div className="text-sm text-gray-500">
                Riders: <span className="font-medium text-gray-700">{riders.length}</span>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="p-2">#</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Age</th>
                  <th className="p-2">Overall</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {riders.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.rowNo}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{r.role}</td>
                    <td className="p-2">{r.age}</td>
                    <td className="p-2">{r.fitness}%</td>
                    <td className="p-2 text-right">
                      <button className="text-sm text-yellow-500 font-medium">View</button>
                    </td>
                  </tr>
                ))}

                {riders.length === 0 && (
                  <tr className="border-t">
                    <td className="p-2 text-gray-500" colSpan={6}>
                      No riders found for this club yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 w-full">
            {riders.map((r) => (
              <div key={r.id} className="bg-white p-4 rounded-lg shadow">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-bold">
                    R
                  </div>
                  <div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-sm text-gray-500">
                      {r.role} • {r.age}y
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-gray-500">Overall</div>
                  <div className="mt-1 text-lg font-bold">{r.fitness}%</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}