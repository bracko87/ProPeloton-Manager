/**
 * MyProfile.tsx
 * Full profile page with persistent profile + password update.
 *
 * Fixes:
 * 1) Removed all display_name references from frontend queries/types.
 * 2) "Display Name" edits/saves to `profiles.username`.
 * 3) Profile Details stays on top, Change Password stays below.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthProvider'
import { supabase } from '../lib/supabase'

type ProfileRow = {
  id: string
  username: string
  email: string
  first_name: string | null
  last_name: string | null
  birthday: string | null
  city: string | null
  country: string | null
  has_created_club: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

type ProfileForm = {
  // "Display Name" input maps to username column
  username: string
  email: string
  firstName: string
  lastName: string
  birthday: string
  city: string
  country: string
}

function normalizeUsername(input: string): string {
  const trimmed = input.trim()
  const cleaned = trimmed
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')

  return cleaned.slice(0, 24)
}

function buildFallbackUsername(email: string): string {
  const base = (email.split('@')[0] || `user_${Math.random().toString(36).slice(2, 8)}`).trim()
  return normalizeUsername(base) || `user_${Math.random().toString(36).slice(2, 8)}`
}

export default function MyProfilePage(): JSX.Element {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const [profile, setProfile] = useState<ProfileRow | null>(null)

  const [form, setForm] = useState<ProfileForm>({
    username: '',
    email: user?.email || '',
    firstName: '',
    lastName: '',
    birthday: '',
    city: '',
    country: '',
  })

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const isDirty = useMemo(() => {
    if (!profile) {
      return (
        form.username.trim() !== '' ||
        form.firstName.trim() !== '' ||
        form.lastName.trim() !== '' ||
        form.birthday.trim() !== '' ||
        form.city.trim() !== '' ||
        form.country.trim() !== '' ||
        form.email.trim() !== (user?.email || '')
      )
    }

    return (
      form.username !== (profile.username || '') ||
      form.email !== (profile.email || user?.email || '') ||
      form.firstName !== (profile.first_name || '') ||
      form.lastName !== (profile.last_name || '') ||
      form.birthday !== (profile.birthday || '') ||
      form.city !== (profile.city || '') ||
      form.country !== (profile.country || '')
    )
  }, [form, profile, user?.email])

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage('')
      setSuccessMessage('')

      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          username,
          email,
          first_name,
          last_name,
          birthday,
          city,
          country,
          has_created_club,
          last_login_at,
          created_at,
          updated_at
        `)
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        setErrorMessage(error.message)
        setLoading(false)
        return
      }

      const row = (data as ProfileRow | null) ?? null
      setProfile(row)

      const initialEmail = row?.email || user.email || ''
      setForm({
        username: row?.username || buildFallbackUsername(initialEmail),
        email: initialEmail,
        firstName: row?.first_name || '',
        lastName: row?.last_name || '',
        birthday: row?.birthday || '',
        city: row?.city || '',
        country: row?.country || '',
      })

      setLoading(false)
    }

    void loadProfile()
  }, [user?.id, user?.email])

  function updateForm<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!user?.id) return

    setSavingProfile(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const nextEmail = form.email.trim()
      const currentEmail = user.email || profile?.email || ''

      if (!nextEmail) {
        throw new Error('Email is required.')
      }

      const normalizedUsername = normalizeUsername(form.username)

      if (normalizedUsername.length < 3 || normalizedUsername.length > 24) {
        throw new Error('Display Name must be between 3 and 24 characters.')
      }

      // Update auth email if changed
      if (nextEmail !== currentEmail) {
        const { error: authError } = await supabase.auth.updateUser({ email: nextEmail })
        if (authError) throw authError
      }

      // Save profile data
      const payload = {
        id: user.id,
        username: normalizedUsername,
        email: nextEmail,
        first_name: form.firstName.trim() || null,
        last_name: form.lastName.trim() || null,
        birthday: form.birthday || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
      }

      const { data: savedProfile, error: profileError } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select(`
          id,
          username,
          email,
          first_name,
          last_name,
          birthday,
          city,
          country,
          has_created_club,
          last_login_at,
          created_at,
          updated_at
        `)
        .single()

      if (profileError) {
        throw profileError
      }

      setProfile(savedProfile as ProfileRow)
      setForm(prev => ({ ...prev, username: (savedProfile as ProfileRow).username }))

      setSuccessMessage(
        nextEmail !== currentEmail
          ? 'Profile saved. If email confirmation is enabled, please confirm your new email address.'
          : 'Profile saved successfully.'
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile.'
      setErrorMessage(message)
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()

    setSavingPassword(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      if (!newPassword || !confirmPassword) {
        throw new Error('Please fill in both password fields.')
      }

      if (newPassword !== confirmPassword) {
        throw new Error('New password and confirmation do not match.')
      }

      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long.')
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setNewPassword('')
      setConfirmPassword('')
      setSuccessMessage('Password updated successfully.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update password.'
      setErrorMessage(message)
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="w-full h-full min-h-[calc(100vh-7rem)] flex items-center justify-center">
        <div className="text-sm text-gray-600">Loading profile...</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">My Profile</h2>
      </div>

      <div className="bg-white rounded shadow border border-gray-200 flex-1 overflow-y-auto p-6">
        {(successMessage || errorMessage) && (
          <div className="mb-5">
            {successMessage && (
              <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 mb-3">
                {successMessage}
              </div>
            )}

            {errorMessage && (
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}
          </div>
        )}

        <div className="w-full">
          <form onSubmit={handleSaveProfile} className="space-y-6">
            <div className="border border-gray-200 rounded p-4">
              <h3 className="text-base font-semibold mb-4">Profile Details</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-sm font-medium mb-1">Display Name</div>
                  <input
                    value={form.username}
                    onChange={e => updateForm('username', e.target.value)}
                    onBlur={() => updateForm('username', normalizeUsername(form.username))}
                    className="w-full border border-gray-300 px-3 py-2 rounded"
                    placeholder="Display name"
                    autoComplete="nickname"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    3–24 chars. Letters/numbers/underscore only (spaces become underscores).
                  </div>
                </label>

                <label className="block">
                  <div className="text-sm font-medium mb-1">Email</div>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => updateForm('email', e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 rounded"
                    placeholder="Email address"
                    autoComplete="email"
                  />
                </label>

                <label className="block">
                  <div className="text-sm font-medium mb-1">First Name</div>
                  <input
                    value={form.firstName}
                    onChange={e => updateForm('firstName', e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 rounded"
                    placeholder="First name"
                    autoComplete="given-name"
                  />
                </label>

                <label className="block">
                  <div className="text-sm font-medium mb-1">Last Name</div>
                  <input
                    value={form.lastName}
                    onChange={e => updateForm('lastName', e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 rounded"
                    placeholder="Last name"
                    autoComplete="family-name"
                  />
                </label>

                <label className="block">
                  <div className="text-sm font-medium mb-1">Birthday</div>
                  <input
                    type="date"
                    value={form.birthday}
                    onChange={e => updateForm('birthday', e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 rounded"
                  />
                </label>

                <label className="block">
                  <div className="text-sm font-medium mb-1">City</div>
                  <input
                    value={form.city}
                    onChange={e => updateForm('city', e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 rounded"
                    placeholder="City"
                    autoComplete="address-level2"
                  />
                </label>

                <label className="block md:col-span-2">
                  <div className="text-sm font-medium mb-1">Country</div>
                  <input
                    value={form.country}
                    onChange={e => updateForm('country', e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 rounded"
                    placeholder="Country"
                    autoComplete="country-name"
                  />
                </label>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={savingProfile || !isDirty}
                  className="inline-flex items-center rounded bg-yellow-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="w-full mt-6">
          <div className="border border-gray-200 rounded p-4">
            <h3 className="text-base font-semibold mb-4">Change Password</h3>

            <form onSubmit={handleChangePassword} className="space-y-4 max-w-xl">
              <label className="block">
                <div className="text-sm font-medium mb-1">New Password</div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium mb-1">Confirm New Password</div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
              </label>

              <button
                type="submit"
                disabled={savingPassword}
                className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>

        <div className="h-10" />
      </div>
    </div>
  )
}