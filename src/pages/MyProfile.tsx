/**
 * MyProfile.tsx
 * Full profile page with persistent profile + password update.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthProvider'
import { supabase } from '../lib/supabase'

type ProfileRow = {
  id: string
  username: string
  email: string
  display_name: string | null
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
  displayName: string
  email: string
  firstName: string
  lastName: string
  birthday: string
  city: string
  country: string
}

function buildFallbackUsername(email: string, displayName: string): string {
  const base =
    displayName.trim() ||
    email.split('@')[0] ||
    `user_${Math.random().toString(36).slice(2, 8)}`

  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  const safe = cleaned || `user_${Math.random().toString(36).slice(2, 8)}`
  return safe.slice(0, 24)
}

export default function MyProfilePage(): JSX.Element {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const [profile, setProfile] = useState<ProfileRow | null>(null)

  const [form, setForm] = useState<ProfileForm>({
    displayName: '',
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
        form.displayName.trim() !== '' ||
        form.firstName.trim() !== '' ||
        form.lastName.trim() !== '' ||
        form.birthday.trim() !== '' ||
        form.city.trim() !== '' ||
        form.country.trim() !== '' ||
        form.email.trim() !== (user?.email || '')
      )
    }

    return (
      form.displayName !== (profile.display_name || '') ||
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
          display_name,
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

      setProfile(data as ProfileRow | null)
      setForm({
        displayName: data?.display_name || '',
        email: data?.email || user.email || '',
        firstName: data?.first_name || '',
        lastName: data?.last_name || '',
        birthday: data?.birthday || '',
        city: data?.city || '',
        country: data?.country || '',
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

      if (form.displayName.trim().length === 0) {
        throw new Error('Display Name is required.')
      }

      // 1) Update auth email if changed
      if (nextEmail !== currentEmail) {
        const { error: authError } = await supabase.auth.updateUser({
          email: nextEmail,
        })

        if (authError) {
          throw authError
        }
      }

      // 2) Persist profile data
      const username =
        profile?.username || buildFallbackUsername(nextEmail, form.displayName)

      const payload = {
        id: user.id,
        username,
        email: nextEmail,
        display_name: form.displayName.trim(),
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
          display_name,
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

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        throw error
      }

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

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div>
                <h3 className="text-base font-semibold mb-4">Profile Details</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block">
                    <div className="text-sm font-medium mb-1">Display Name</div>
                    <input
                      value={form.displayName}
                      onChange={e => updateForm('displayName', e.target.value)}
                      className="w-full border border-gray-300 px-3 py-2 rounded"
                      placeholder="Display name"
                    />
                  </label>

                  <label className="block">
                    <div className="text-sm font-medium mb-1">Email</div>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => updateForm('email', e.target.value)}
                      className="w-full border border-gray-300 px-3 py-2 rounded"
                      placeholder="Email address"
                    />
                  </label>

                  <label className="block">
                    <div className="text-sm font-medium mb-1">First Name</div>
                    <input
                      value={form.firstName}
                      onChange={e => updateForm('firstName', e.target.value)}
                      className="w-full border border-gray-300 px-3 py-2 rounded"
                      placeholder="First name"
                    />
                  </label>

                  <label className="block">
                    <div className="text-sm font-medium mb-1">Last Name</div>
                    <input
                      value={form.lastName}
                      onChange={e => updateForm('lastName', e.target.value)}
                      className="w-full border border-gray-300 px-3 py-2 rounded"
                      placeholder="Last name"
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
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <div className="text-sm font-medium mb-1">Country</div>
                    <input
                      value={form.country}
                      onChange={e => updateForm('country', e.target.value)}
                      className="w-full border border-gray-300 px-3 py-2 rounded"
                      placeholder="Country"
                    />
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingProfile || !isDirty}
                  className="inline-flex items-center rounded bg-yellow-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>

          <div className="xl:col-span-1">
            <div className="border border-gray-200 rounded p-4">
              <h3 className="text-base font-semibold mb-4">Change Password</h3>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <label className="block">
                  <div className="text-sm font-medium mb-1">New Password</div>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 rounded"
                    placeholder="Minimum 8 characters"
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
        </div>
      </div>
    </div>
  )
}