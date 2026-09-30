import React, { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

type CustomizationData = {
  available: boolean
  reason?: string
  association_id?: string
  country_code?: string
  season_number?: number
  can_edit?: boolean
  flag_url?: string | null
  logo_url?: string | null
  custom_logo_url?: string | null
  jersey_url?: string | null
  custom_jersey_url?: string | null
  default_jersey_url?: string | null
  change_count?: number
  free_change_limit?: number
  free_changes_remaining?: number
  next_change_cost?: number
  coin_balance?: number
}

const GENERIC_KITS = Array.from({ length: 18 }, (_, index) =>
  `https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/AI%20Teams%20Kits/Genkit${index + 1}.png`,
)

const MAX_FILE_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])

function validateImage(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return 'type'
  if (file.size > MAX_FILE_BYTES) return 'size'
  return null
}

async function uploadPublicImage(
  associationId: string,
  kind: 'logo' | 'jersey',
  file: File,
): Promise<{ url: string; path: string }> {
  const extension =
    file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
        ? 'webp'
        : 'jpg'
  const objectPath = `national-associations/${associationId}/${kind}-${Date.now()}.${extension}`

  const { error } = await supabase.storage.from('club-logos').upload(objectPath, file, {
    contentType: file.type,
    upsert: false,
  })

  if (error) throw error

  const { data } = supabase.storage.from('club-logos').getPublicUrl(objectPath)
  return { url: data.publicUrl, path: objectPath }
}

export default function NationalAssociationCustomization(): JSX.Element {
  const { t } = useTranslation('nations')
  const [data, setData] = useState<CustomizationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [jerseyPreview, setJerseyPreview] = useState<string | null>(null)
  const [jerseyFile, setJerseyFile] = useState<File | null>(null)
  const [selectedGenericKit, setSelectedGenericKit] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    const { data: result, error: rpcError } = await supabase.rpc(
      'get_my_national_association_customization_v1',
    )

    if (rpcError) {
      setError(rpcError.message)
      setData(null)
    } else {
      setData((result ?? null) as CustomizationData | null)
    }

    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const effectiveLogo = logoPreview ?? data?.logo_url ?? data?.flag_url ?? null
  const effectiveJersey =
    jerseyPreview ?? selectedGenericKit ?? data?.jersey_url ?? data?.default_jersey_url ?? null

  const pricingLabel = useMemo(() => {
    if (!data) return ''
    const remaining = data.free_changes_remaining ?? 0
    if (remaining > 0) {
      return t('association.customization.freeRemaining', { count: remaining })
    }
    return t('association.customization.paidNext', { coins: data.next_change_cost ?? 2 })
  }, [data, t])

  const applyLogo = async (reset = false): Promise<void> => {
    if (!data?.association_id || !data.can_edit) return

    let uploadedPath: string | null = null

    try {
      setBusy('logo')
      setError(null)
      setMessage(null)

      let logoUrl: string | null = null

      if (!reset) {
        if (!logoFile) {
          setError(t('association.customization.chooseLogo'))
          return
        }
        const uploaded = await uploadPublicImage(data.association_id, 'logo', logoFile)
        logoUrl = uploaded.url
        uploadedPath = uploaded.path
      }

      const { data: result, error: rpcError } = await supabase.rpc(
        'save_my_national_association_logo_v1',
        { p_logo_url: logoUrl },
      )
      if (rpcError) throw rpcError

      setData((result ?? null) as CustomizationData | null)
      setLogoFile(null)
      setLogoPreview(null)
      window.dispatchEvent(new Event('coin-balance-changed'))
      setMessage(
        reset
          ? t('association.customization.logoReset')
          : t('association.customization.logoSaved'),
      )
    } catch (caught: any) {
      if (uploadedPath) {
        await supabase.storage.from('club-logos').remove([uploadedPath])
      }
      setError(caught?.message ?? t('association.errors.action'))
    } finally {
      setBusy(null)
    }
  }

  const applyJersey = async (reset = false): Promise<void> => {
    if (!data?.association_id || !data.can_edit) return

    let uploadedPath: string | null = null

    try {
      setBusy('jersey')
      setError(null)
      setMessage(null)

      let jerseyUrl: string | null = null

      if (!reset) {
        if (jerseyFile) {
          const uploaded = await uploadPublicImage(data.association_id, 'jersey', jerseyFile)
          jerseyUrl = uploaded.url
          uploadedPath = uploaded.path
        } else if (selectedGenericKit) {
          jerseyUrl = selectedGenericKit
        } else {
          setError(t('association.customization.chooseJersey'))
          return
        }
      }

      const { data: result, error: rpcError } = await supabase.rpc(
        'save_my_national_association_jersey_v1',
        { p_jersey_url: jerseyUrl },
      )
      if (rpcError) throw rpcError

      setData((result ?? null) as CustomizationData | null)
      setJerseyFile(null)
      setJerseyPreview(null)
      setSelectedGenericKit(null)
      window.dispatchEvent(new Event('coin-balance-changed'))
      setMessage(
        reset
          ? t('association.customization.jerseyReset')
          : t('association.customization.jerseySaved'),
      )
    } catch (caught: any) {
      if (uploadedPath) {
        await supabase.storage.from('club-logos').remove([uploadedPath])
      }
      setError(caught?.message ?? t('association.errors.action'))
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <section className="rounded bg-white p-5 shadow">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('association.customization.loading')}
        </div>
      </section>
    )
  }

  if (!data?.available) {
    return <></>
  }

  return (
    <section className="overflow-hidden rounded bg-white shadow">
      <div className="border-b border-slate-200 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('association.customization.eyebrow')}
        </div>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">
          {t('association.customization.title')}
        </h3>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
          {t('association.customization.description')}
        </p>
      </div>

      <div className="grid gap-px bg-slate-200 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('association.customization.flagTitle')}
          </div>
          <div className="mt-4 flex min-h-[170px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-5">
            {data.flag_url ? (
              <img
                src={data.flag_url}
                alt={data.country_code ?? 'Flag'}
                className="max-h-28 max-w-full rounded border border-slate-200 object-contain"
              />
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {t('association.customization.flagLocked')}
          </p>
        </div>

        <div className="bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('association.customization.logoTitle')}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t('association.customization.logoHelp')}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
              {pricingLabel}
            </span>
          </div>

          <div className="mt-4 flex min-h-[190px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-5">
            {effectiveLogo ? (
              <img
                src={effectiveLogo}
                alt={t('association.customization.logoTitle')}
                className="max-h-36 max-w-full object-contain"
              />
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <label
              className={[
                'rounded border px-3 py-2 text-sm font-semibold',
                data.can_edit
                  ? 'cursor-pointer border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400',
              ].join(' ')}
            >
              {t('association.customization.uploadLogo')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={!data.can_edit}
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0] ?? null
                  event.target.value = ''
                  if (!file) return
                  const validation = validateImage(file)
                  if (validation) {
                    setError(
                      validation === 'size'
                        ? t('association.customization.fileTooLarge')
                        : t('association.customization.fileType'),
                    )
                    return
                  }
                  setLogoFile(file)
                  setLogoPreview(URL.createObjectURL(file))
                  setError(null)
                }}
              />
            </label>

            <button
              type="button"
              disabled={!data.can_edit || !logoFile || busy !== null}
              onClick={() => void applyLogo(false)}
              className="rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === 'logo' ? t('association.customization.saving') : t('association.customization.applyLogo')}
            </button>

            <button
              type="button"
              disabled={!data.can_edit || !data.custom_logo_url || busy !== null}
              onClick={() => void applyLogo(true)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('association.customization.useFlag')}
            </button>
          </div>
        </div>

        <div className="bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('association.customization.jerseyTitle')}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t('association.customization.jerseyHelp')}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
              {pricingLabel}
            </span>
          </div>

          <div className="mt-4 flex min-h-[190px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-5">
            {effectiveJersey ? (
              <img
                src={effectiveJersey}
                alt={t('association.customization.jerseyTitle')}
                className="max-h-40 max-w-full object-contain"
              />
            ) : null}
          </div>

          <div className="mt-4">
            <div className="text-xs font-semibold text-slate-600">
              {t('association.customization.genericKits')}
            </div>
            <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-2">
              {GENERIC_KITS.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  disabled={!data.can_edit}
                  onClick={() => {
                    setSelectedGenericKit(url)
                    setJerseyFile(null)
                    setJerseyPreview(null)
                  }}
                  className={[
                    'h-16 w-16 shrink-0 rounded border bg-white p-1',
                    selectedGenericKit === url
                      ? 'border-yellow-500 ring-2 ring-yellow-200'
                      : 'border-slate-200',
                    !data.can_edit ? 'cursor-not-allowed opacity-50' : 'hover:border-yellow-400',
                  ].join(' ')}
                  aria-label={t('association.customization.genericKitNumber', { number: index + 1 })}
                >
                  <img src={url} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <label
              className={[
                'rounded border px-3 py-2 text-sm font-semibold',
                data.can_edit
                  ? 'cursor-pointer border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400',
              ].join(' ')}
            >
              {t('association.customization.uploadJersey')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={!data.can_edit}
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0] ?? null
                  event.target.value = ''
                  if (!file) return
                  const validation = validateImage(file)
                  if (validation) {
                    setError(
                      validation === 'size'
                        ? t('association.customization.fileTooLarge')
                        : t('association.customization.fileType'),
                    )
                    return
                  }
                  setJerseyFile(file)
                  setJerseyPreview(URL.createObjectURL(file))
                  setSelectedGenericKit(null)
                  setError(null)
                }}
              />
            </label>

            <button
              type="button"
              disabled={
                !data.can_edit ||
                (!jerseyFile && !selectedGenericKit) ||
                busy !== null
              }
              onClick={() => void applyJersey(false)}
              className="rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === 'jersey' ? t('association.customization.saving') : t('association.customization.applyJersey')}
            </button>

            <button
              type="button"
              disabled={!data.can_edit || !data.custom_jersey_url || busy !== null}
              onClick={() => void applyJersey(true)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('association.customization.useDefaultJersey')}
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-600">
            {data.can_edit
              ? t('association.customization.pricing', {
                  used: data.change_count ?? 0,
                  free: data.free_change_limit ?? 3,
                  coins: 2,
                })
              : t('association.customization.coachOnly')}
          </div>
          <div className="font-semibold text-slate-700">
            {t('association.customization.balance', { balance: data.coin_balance ?? 0 })}
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}
      </div>
    </section>
  )
}
