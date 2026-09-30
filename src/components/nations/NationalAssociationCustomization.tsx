import React, { useEffect, useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

type CustomizationData = {
  available: boolean
  reason?: string
  association_id?: string
  country_code?: string
  season_number?: number
  can_edit?: boolean
  jersey_url?: string | null
  custom_jersey_url?: string | null
  default_jersey_url?: string | null
  change_count?: number
  free_change_limit?: number
  free_changes_remaining?: number
  next_change_cost?: number
  coin_balance?: number
}

const MAX_FILE_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])

function validateImage(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return 'type'
  if (file.size > MAX_FILE_BYTES) return 'size'
  return null
}

async function uploadPublicImage(
  associationId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  const extension =
    file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
        ? 'webp'
        : 'jpg'
  const objectPath = `national-associations/${associationId}/jersey-${Date.now()}.${extension}`

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [jerseyPreview, setJerseyPreview] = useState<string | null>(null)
  const [jerseyFile, setJerseyFile] = useState<File | null>(null)
  const [promptCopied, setPromptCopied] = useState(false)

  const jerseyCreationPrompt = `Create a professional front-facing cycling jersey product mockup for ProPeloton Manager.

Jersey type: National Team jersey
Country / team name: [ENTER COUNTRY OR TEAM NAME]
Primary color: [ENTER PRIMARY COLOR]
Secondary color: [ENTER SECONDARY COLOR]
Accent color: [OPTIONAL ACCENT COLOR]
Motifs / symbols: [ENTER NATIONAL OR TEAM MOTIFS]
Optional text: [ENTER TEXT OR WRITE NONE]
Logos: [USE ONLY LOGOS I PROVIDE, OTHERWISE NO BRAND LOGOS]

Image requirements:
- square 1:1 image, preferably 1536 × 1536 px
- pure white (#FFFFFF) background
- one jersey only, centered and front-facing
- full jersey visible from collar to bottom hem and both sleeves fully visible
- jersey should occupy about 75–85% of the image height, with even white margins
- realistic cycling jersey shape, fabric texture, collar and centered zipper
- symmetrical product-photo presentation
- no mannequin, no person, no hanger, no scenery, no shadows outside the jersey
- do not crop any part of the jersey
- no text outside the jersey
- keep the design clean enough to remain readable when displayed as a small in-game team jersey

Generate only the finished jersey image.`

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

  const effectiveJersey =
    data?.jersey_url ?? data?.default_jersey_url ?? null


  const applyJersey = async (): Promise<void> => {
    if (!data?.association_id || !data.can_edit || !jerseyFile) return

    let uploadedPath: string | null = null

    try {
      setBusy(true)
      setError(null)
      setMessage(null)

      const uploaded = await uploadPublicImage(data.association_id, jerseyFile)
      uploadedPath = uploaded.path

      const { data: result, error: rpcError } = await supabase.rpc(
        'save_my_national_association_jersey_v1',
        { p_jersey_url: uploaded.url },
      )
      if (rpcError) throw rpcError

      const nextData = (result ?? null) as CustomizationData | null
      setData(nextData)
      setJerseyFile(null)
      setJerseyPreview(null)
      window.dispatchEvent(new Event('coin-balance-changed'))
      const remaining = nextData?.free_changes_remaining ?? 0
      setMessage(
        remaining > 0
          ? `${t('association.customization.jerseySaved')} ${remaining} free change${remaining === 1 ? '' : 's'} remaining.`
          : `${t('association.customization.jerseySaved')} Future jersey changes cost ${nextData?.next_change_cost ?? 2} Coins.`,
      )
    } catch (caught: any) {
      if (uploadedPath) {
        await supabase.storage.from('club-logos').remove([uploadedPath])
      }
      setError(caught?.message ?? t('association.errors.action'))
    } finally {
      setBusy(false)
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
          {t('association.customization.jerseyTitle')}
        </h3>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
          Upload your own National Team jersey. Until you save one, the automatically assigned default jersey remains in use.
        </p>
      </div>

      <div className="grid gap-px bg-slate-200 lg:grid-cols-2">
        <div className="bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Current National Team jersey
          </div>
          <div className="mt-4 flex min-h-[260px] items-center justify-center rounded-lg border border-slate-200 bg-white p-6">
            {effectiveJersey ? (
              <img
                src={effectiveJersey}
                alt={t('association.customization.jerseyTitle')}
                className="max-h-56 max-w-full object-contain"
              />
            ) : null}
          </div>
        </div>

        <div className="bg-white p-5">
          <div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Upload new jersey
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Upload your own National Team jersey image. The currently assigned default jersey remains in use until you save a custom one.
              </p>
            </div>
          </div>

          <div className="mt-4 flex min-h-[190px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-5">
            {jerseyPreview ? (
              <img
                src={jerseyPreview}
                alt="New National Team jersey preview"
                className="max-h-40 max-w-full object-contain"
              />
            ) : (
              <div className="max-w-sm text-center text-sm leading-6 text-slate-500">
                Select a PNG, JPG or WEBP image up to 2 MB. A preview will appear here before you apply it.
              </div>
            )}
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
                  setError(null)
                }}
              />
            </label>

            <button
              type="button"
              disabled={!data.can_edit || !jerseyFile || busy}
              onClick={() => void applyJersey()}
              className="rounded bg-yellow-400 px-3 py-2 text-sm font-semibold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? t('association.customization.saving') : t('association.customization.applyJersey')}
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Create a jersey with ChatGPT
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Copy this prompt, replace the bracketed fields with your colors, country/team name and motifs, then paste it into ChatGPT image generation.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(jerseyCreationPrompt)
                  setPromptCopied(true)
                  window.setTimeout(() => setPromptCopied(false), 1800)
                }}
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {promptCopied ? 'Copied' : 'Copy prompt'}
              </button>
            </div>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-3 text-[11px] leading-5 text-slate-600">
              {jerseyCreationPrompt}
            </pre>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-600">
            {data.can_edit
              ? `${data.change_count ?? 0} jersey changes used this Season. The first ${data.free_change_limit ?? 3} changes are free; every later jersey change costs 2 Coins.`
              : 'Customization is visible to all Association members, but only the elected National Coach can change the jersey.'}
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
