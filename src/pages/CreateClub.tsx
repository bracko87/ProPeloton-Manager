/**
 * CreateClub.tsx
 * Premium team/club creation page with live badge preview.
 *
 * Note: Logo upload should persist to Supabase storage in production.
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import TeamBadgePreview from '../components/ui/TeamBadgePreview'

/**
 * CreateClubPage
 * Club creation form with crest preview reacting to colors and logo.
 */
export default function CreateClubPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    country: 'United States',
    primary: '#FFC400',
    secondary: '#111827',
    motto: ''
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  function updateField(key: string, value: string) {
    setForm({ ...form, [key]: value })
  }

  /**
   * handleUpload
   * Placeholder for file upload — in production, file must be uploaded to Supabase storage.
   */
  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setLogoPreview(url)
    // NOTE: Do not persist locally in production. Upload to Supabase and store returned URL.
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // In production: create club record in Supabase and redirect to dashboard
    navigate('/dashboard/overview')
  }

  const countries = ['United States', 'France', 'Spain', 'Italy', 'Belgium', 'Netherlands', 'Germany']

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center p-6">
      <div className="max-w-5xl w-full grid grid-cols-2 gap-8">
        <div className="bg-white rounded-lg p-6 shadow-lg">
          <h2 className="text-2xl font-bold">Create Your Club</h2>
          <p className="text-sm text-gray-600 mt-2">Design your club identity and enter the ProPeloton world.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Club Name</label>
              <input
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                placeholder="e.g. Horizon Racing"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Club Country</label>
              <select
                value={form.country}
                onChange={e => updateField('country', e.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2"
              >
                {countries.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Primary Color</label>
                <input
                  type="color"
                  value={form.primary}
                  onChange={e => updateField('primary', e.target.value)}
                  className="mt-2 w-16 h-10 p-0 border rounded"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Secondary Color</label>
                <input
                  type="color"
                  value={form.secondary}
                  onChange={e => updateField('secondary', e.target.value)}
                  className="mt-2 w-16 h-10 p-0 border rounded"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Logo Upload</label>
              <input type="file" accept="image/*" onChange={handleUpload} className="mt-2" />
              <div className="text-xs text-gray-500 mt-1">In production, logo files are uploaded to Supabase storage.</div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Club Motto (optional)</label>
              <input
                value={form.motto}
                onChange={e => updateField('motto', e.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2"
                placeholder="e.g. Ride as one"
              />
            </div>

            <div className="flex items-center gap-4 mt-4">
              <button type="submit" className="bg-yellow-400 px-6 py-2 rounded-md font-semibold">
                Create Club
              </button>
              <button type="button" onClick={() => {}} className="px-4 py-2 rounded-md border border-gray-300">Cancel</button>
            </div>
          </form>
        </div>

        <div className="flex flex-col items-center justify-center">
          <div className="mb-6 text-white">
            <h3 className="text-xl font-semibold">Club Preview</h3>
            <p className="text-sm text-white/70 mt-1">Live preview reacts to selected colors and logo.</p>
          </div>

          <TeamBadgePreview
            name={form.name || 'My Club'}
            primary={form.primary}
            secondary={form.secondary}
            motto={form.motto}
            logoSrc={logoPreview}
          />
        </div>
      </div>
    </div>
  )
}
