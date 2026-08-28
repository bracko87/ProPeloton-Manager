/**
 * MyProfile.tsx
 * Full profile page with persistent profile data and password reset email flow.
 *
 * Birthday rule:
 * - Birthday is saved once during registration.
 * - Birthday is read-only on My Profile.
 * - Birthday is not included in the save payload.
 *
 * Password rule:
 * - Password changes are completed through Supabase Auth email verification.
 * - The page sends a reset-password email to the authenticated account email.
 * - The user then lands on /#/reset-password and chooses a new password.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthProvider'
import { supabase } from '../lib/supabase'
import { changeApplicationLanguage, getApplicationLanguage } from '../i18n'
import {
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  type SupportedLanguage,
} from '../i18n/languages'

type ProfileRow = {
  id: string
  username: string
  email: string
  first_name: string | null
  last_name: string | null
  city: string | null
  country: string | null
  preferred_language: string | null
  birthday_month: number | null
  birthday_day: number | null
  birthday_year: number | null
  birthday_locked: boolean
  birthday_set_at: string | null
  has_created_club: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

type ProfileForm = {
  username: string
  email: string
  firstName: string
  lastName: string
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

function formatBirthday(
  profile: ProfileRow | null,
  locale: string,
  notSetLabel: string,
): string {
  if (!profile?.birthday_month || !profile?.birthday_day) {
    return notSetLabel
  }

  const displayYear = profile.birthday_year ?? 2000
  const date = new Date(
    Date.UTC(displayYear, profile.birthday_month - 1, profile.birthday_day),
  )

  return new Intl.DateTimeFormat(
    locale,
    profile.birthday_year
      ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
      : { day: 'numeric', month: 'long', timeZone: 'UTC' },
  ).format(date)
}

/**
 * The app uses HashRouter, so the reset page must be opened as:
 * https://domain.com/#/reset-password
 */
function getPasswordResetRedirectUrl(): string {
  return `${window.location.origin}/#/reset-password`
}

export default function MyProfilePage(): JSX.Element {
  const { t, i18n } = useTranslation('accountPages')
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false)
  const [savingLanguage, setSavingLanguage] = useState(false)

  const [profile, setProfile] = useState<ProfileRow | null>(null)

  const [form, setForm] = useState<ProfileForm>({
    username: '',
    email: user?.email || '',
    firstName: '',
    lastName: '',
    city: '',
    country: '',
  })

  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const locale = i18n.resolvedLanguage ?? i18n.language
  const currentLanguage: SupportedLanguage = isSupportedLanguage(locale)
    ? locale
    : getApplicationLanguage()

  const birthdayLabel = useMemo(
    () => formatBirthday(profile, locale, t('profile.notSet')),
    [locale, profile, t],
  )

  const accountEmail = useMemo(() => {
    return (user?.email || profile?.email || form.email || '').trim()
  }, [form.email, profile?.email, user?.email])

  const isDirty = useMemo(() => {
    if (!profile) {
      return (
        form.username.trim() !== '' ||
        form.firstName.trim() !== '' ||
        form.lastName.trim() !== '' ||
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
          city,
          country,
          preferred_language,
          birthday_month,
          birthday_day,
          birthday_year,
          birthday_locked,
          birthday_set_at,
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
        throw new Error(t('profile.emailRequired'))
      }

      const normalizedUsername = normalizeUsername(form.username)

      if (normalizedUsername.length < 3 || normalizedUsername.length > 24) {
        throw new Error(t('profile.displayNameLength'))
      }

      if (nextEmail !== currentEmail) {
        const { error: authError } = await supabase.auth.updateUser({ email: nextEmail })
        if (authError) throw authError
      }

      const payload = {
        id: user.id,
        username: normalizedUsername,
        email: nextEmail,
        first_name: form.firstName.trim() || null,
        last_name: form.lastName.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        preferred_language: profile?.preferred_language && isSupportedLanguage(profile.preferred_language)
          ? profile.preferred_language
          : currentLanguage,
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
          city,
          country,
          preferred_language,
          birthday_month,
          birthday_day,
          birthday_year,
          birthday_locked,
          birthday_set_at,
          has_created_club,
          last_login_at,
          created_at,
          updated_at
        `)
        .single()

      if (profileError) {
        throw profileError
      }

      const savedRow = savedProfile as ProfileRow

      setProfile(savedRow)
      setForm(prev => ({
        ...prev,
        username: savedRow.username || prev.username,
        email: savedRow.email || prev.email,
        firstName: savedRow.first_name || '',
        lastName: savedRow.last_name || '',
        city: savedRow.city || '',
        country: savedRow.country || '',
      }))

      setSuccessMessage(
        nextEmail !== currentEmail
          ? t('profile.savedEmail')
          : t('profile.saved'),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : t('profile.saveFailed')
      setErrorMessage(message)
    } finally {
      setSavingProfile(false)
    }
  }


  async function handleLanguageChange(language: SupportedLanguage) {
    if (!user?.id || savingLanguage || language === currentLanguage) return

    setSavingLanguage(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: language })
        .eq('id', user.id)

      if (error) throw error

      await changeApplicationLanguage(language)
      setProfile(prev => prev ? { ...prev, preferred_language: language } : prev)

      const languageDefinition = SUPPORTED_LANGUAGES.find(option => option.code === language)
      setSuccessMessage(
        i18n.t('profile.languageSaved', {
          ns: 'accountPages',
          language: languageDefinition?.label ?? language,
        }),
      )
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Profile language update error:', err)
      setErrorMessage(t('profile.languageSaveFailed'))
    } finally {
      setSavingLanguage(false)
    }
  }

  async function handleSendPasswordReset(e: React.FormEvent) {
    e.preventDefault()

    setSendingPasswordReset(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      if (!accountEmail) {
        throw new Error(t('profile.resetEmailMissing'))
      }

      const { error } = await supabase.auth.resetPasswordForEmail(accountEmail, {
        redirectTo: getPasswordResetRedirectUrl(),
      })

      if (error) {
        throw error
      }

      setSuccessMessage(t('profile.resetSent', { email: accountEmail }))
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Profile password reset request error:', err)

      setErrorMessage(t('profile.resetFailed'))
    } finally {
      setSendingPasswordReset(false)
    }
  }

  if (loading) {
    return (
      <div className="w-full h-full min-h-[calc(100vh-7rem)] flex items-center justify-center">
        <div className="text-sm text-gray-600">{t('profile.loading')}</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{t('profile.title')}</h2>
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

        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="border border-gray-200 rounded p-4">
            <h3 className="text-base font-semibold mb-4">{t('profile.details')}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <div className="text-sm font-medium mb-1">{t('profile.displayName')}</div>
                <input
                  value={form.username}
                  onChange={e => updateForm('username', e.target.value)}
                  onBlur={() => updateForm('username', normalizeUsername(form.username))}
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder={t('profile.displayNamePlaceholder')}
                  autoComplete="nickname"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {t('profile.displayNameHelp')}
                </div>
              </label>

              <label className="block">
                <div className="text-sm font-medium mb-1">{t('profile.email')}</div>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => updateForm('email', e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder={t('profile.emailPlaceholder')}
                  autoComplete="email"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {t('profile.emailHelp')}
                </div>
              </label>

              <label className="block">
                <div className="text-sm font-medium mb-1">{t('profile.firstName')}</div>
                <input
                  value={form.firstName}
                  onChange={e => updateForm('firstName', e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder={t('profile.firstNamePlaceholder')}
                  autoComplete="given-name"
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium mb-1">{t('profile.lastName')}</div>
                <input
                  value={form.lastName}
                  onChange={e => updateForm('lastName', e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder={t('profile.lastNamePlaceholder')}
                  autoComplete="family-name"
                />
              </label>

              <div className="block">
                <div className="text-sm font-medium mb-1">{t('profile.birthday')}</div>
                <div className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                  {birthdayLabel}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {t('profile.birthdayHelp')}
                </div>
              </div>

              <label className="block">
                <div className="text-sm font-medium mb-1">{t('profile.city')}</div>
                <input
                  value={form.city}
                  onChange={e => updateForm('city', e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder={t('profile.city')}
                  autoComplete="address-level2"
                />
              </label>

              <label className="block md:col-span-2">
                <div className="text-sm font-medium mb-1">{t('profile.country')}</div>
                <input
                  value={form.country}
                  onChange={e => updateForm('country', e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded"
                  placeholder={t('profile.country')}
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
                {savingProfile ? t('profile.saving') : t('profile.save')}
              </button>
            </div>
          </div>
        </form>


        <div className="mt-6 border border-gray-200 rounded p-4">
          <h3 className="text-base font-semibold">{t('profile.languageTitle')}</h3>
          <p className="mt-1 text-sm text-gray-600">
            {t('profile.languageDescription')}
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            {SUPPORTED_LANGUAGES.map(language => {
              const active = currentLanguage === language.code

              return (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => void handleLanguageChange(language.code)}
                  disabled={savingLanguage || active}
                  aria-pressed={active}
                  className={[
                    'inline-flex min-w-[150px] items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition',
                    active
                      ? 'border-yellow-400 bg-yellow-50 text-gray-950 ring-1 ring-yellow-300'
                      : 'border-gray-300 bg-white text-gray-800 hover:border-yellow-300 hover:bg-yellow-50',
                    savingLanguage ? 'cursor-wait opacity-70' : '',
                  ].join(' ')}
                >
                  <span className="text-xl" aria-hidden="true">{language.flag}</span>
                  <span>{language.label}</span>
                  {active ? (
                    <span className="ml-auto text-xs font-medium text-green-700">
                      {t('profile.languageActive')}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="mt-3 text-xs text-gray-500">
            {savingLanguage ? t('profile.languageSaving') : t('profile.languageAccountHelp')}
          </div>
        </div>

        <form onSubmit={handleSendPasswordReset} className="mt-6 space-y-6">
          <div className="border border-gray-200 rounded p-4">
            <h3 className="text-base font-semibold mb-2">{t('profile.changePassword')}</h3>

            <p className="text-sm text-gray-600">
              {t('profile.passwordDescription')}
            </p>

            <div className="mt-4 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
              {accountEmail || t('profile.noEmail')}
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={sendingPasswordReset || !accountEmail}
                className="inline-flex items-center rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {sendingPasswordReset ? t('profile.sendingEmail') : t('profile.sendPasswordEmail')}
              </button>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              {t('profile.passwordHelp')}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
