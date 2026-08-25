/**
 * src/components/dashboard/BugReportButton.tsx
 *
 * Small bug report button used in dashboard UI. Opens a modal where users can
 * describe an issue, attach an optional screenshot and submit a report stored
 * in the `bug_reports` table via Supabase.
 */

import React, { useState } from 'react'
import { Bug, X, ImagePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

interface BugReportButtonProps {
  collapsed?: boolean
  currentPageLabel: string
  currentPath: string
}

type Severity = 'low' | 'medium' | 'high'
type BugType = 'ui' | 'gameplay' | 'performance' | 'data' | 'other'

const SCREENSHOT_BUCKET = 'bug-report-screenshots'
const MAX_SCREENSHOT_SIZE_MB = 5

function createReportId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `bug-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export default function BugReportButton({
  collapsed = false,
  currentPageLabel,
  currentPath,
}: BugReportButtonProps): JSX.Element {
  const { t } = useTranslation('navigation')
  const [open, setOpen] = useState(false)
  const [bugType, setBugType] = useState<BugType>('ui')
  const [severity, setSeverity] = useState<Severity>('medium')
  const [description, setDescription] = useState('')
  const [expectedResult, setExpectedResult] = useState('')
  const [actualResult, setActualResult] = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function resetForm(): void {
    setBugType('ui')
    setSeverity('medium')
    setDescription('')
    setExpectedResult('')
    setActualResult('')
    setStepsToReproduce('')
    setScreenshotFile(null)
    setError(null)
  }

  async function uploadScreenshot(userId: string | null, reportId: string) {
    if (!screenshotFile) {
      return { screenshotPath: null, screenshotUrl: null }
    }

    const isImage = screenshotFile.type.startsWith('image/')
    const maxBytes = MAX_SCREENSHOT_SIZE_MB * 1024 * 1024

    if (!isImage) {
      throw new Error(t('bugReport.imageRequired'))
    }

    if (screenshotFile.size > maxBytes) {
      throw new Error(
        t('bugReport.imageTooLarge', { size: MAX_SCREENSHOT_SIZE_MB }),
      )
    }

    const safeName = sanitizeFileName(screenshotFile.name)
    const ownerSegment = userId ?? 'anonymous'
    const filePath = `${ownerSegment}/${reportId}/${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(filePath, screenshotFile, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(uploadError.message)
    }

    const { data: publicUrlData } = supabase.storage
      .from(SCREENSHOT_BUCKET)
      .getPublicUrl(filePath)

    return {
      screenshotPath: filePath,
      screenshotUrl: publicUrlData.publicUrl ?? null,
    }
  }

  async function submitReport(): Promise<void> {
    if (!description.trim()) {
      setError(t('bugReport.describeRequired'))
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      const reportId = createReportId()
      const { screenshotPath, screenshotUrl } = await uploadScreenshot(
        user?.id ?? null,
        reportId,
      )

      const payload = {
        id: reportId,
        user_id: user?.id ?? null,
        page_label: currentPageLabel,
        page_path: currentPath,
        page_url: typeof window !== 'undefined' ? window.location.href : null,
        bug_type: bugType,
        description: description.trim(),
        expected_result: expectedResult.trim() || null,
        actual_result: actualResult.trim() || null,
        steps_to_reproduce: stepsToReproduce.trim() || null,
        severity,
        browser: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        viewport:
          typeof window !== 'undefined'
            ? `${window.innerWidth}x${window.innerHeight}`
            : null,
        screenshot_path: screenshotPath,
        screenshot_url: screenshotUrl,
        reported_from: 'sidebar',
        status: 'open',
      }

      const { error: insertError } = await supabase
        .from('bug_reports')
        .insert(payload)

      if (insertError) {
        throw new Error(insertError.message)
      }

      resetForm()
      setSuccess(true)
      setOpen(false)

      window.setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bugReport.sendFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        aria-label={t('bugReport.button')}
        className={`w-full rounded-md border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 ${
          collapsed
            ? 'flex items-center justify-center px-3 py-3'
            : 'flex items-start gap-3 px-3 py-3'
        }`}
      >
        <Bug size={16} className="mt-0.5 flex-shrink-0 text-yellow-400" />

        {!collapsed && (
          <div className="min-w-0 text-left">
            <div className="text-sm font-semibold leading-tight">
              {t('bugReport.button')}
            </div>
            <div className="mt-1 text-xs text-white/60 leading-tight">
              {t('bugReport.currentPage', { page: currentPageLabel })}
            </div>
          </div>
        )}
      </button>

      {!collapsed && success && (
        <div className="text-xs text-green-400">{t('bugReport.sent')}</div>
      )}

      {!collapsed && error && !open && (
        <div className="text-xs text-red-400">{error}</div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-[#11161d] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-lg font-semibold">{t('bugReport.title')}</div>
                <div className="text-sm text-white/60">{t('bugReport.subtitle')}</div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label={t('bugReport.close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                <div>
                  <span className="text-white/50">{t('bugReport.page')}</span>{' '}
                  <span className="font-medium">{currentPageLabel}</span>
                </div>
                <div className="mt-1 break-all text-white/70">{currentPath}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">{t('bugReport.bugType')}</label>
                  <select
                    value={bugType}
                    onChange={e => setBugType(e.target.value as BugType)}
                    className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                  >
                    <option value="ui">{t('bugReport.uiLayout')}</option>
                    <option value="gameplay">{t('bugReport.gameplayLogic')}</option>
                    <option value="performance">{t('bugReport.performance')}</option>
                    <option value="data">{t('bugReport.dataNumbers')}</option>
                    <option value="other">{t('bugReport.other')}</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">{t('bugReport.severity')}</label>
                  <select
                    value={severity}
                    onChange={e => setSeverity(e.target.value as Severity)}
                    className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                  >
                    <option value="low">{t('bugReport.low')}</option>
                    <option value="medium">{t('bugReport.medium')}</option>
                    <option value="high">{t('bugReport.high')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">{t('bugReport.whatHappened')}</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={5}
                  placeholder={t('bugReport.descriptionPlaceholder')}
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">{t('bugReport.expectedResult')}</label>
                <textarea
                  value={expectedResult}
                  onChange={e => setExpectedResult(e.target.value)}
                  rows={3}
                  placeholder={t('bugReport.expectedPlaceholder')}
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">{t('bugReport.actualResult')}</label>
                <textarea
                  value={actualResult}
                  onChange={e => setActualResult(e.target.value)}
                  rows={3}
                  placeholder={t('bugReport.actualPlaceholder')}
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">{t('bugReport.steps')}</label>
                <textarea
                  value={stepsToReproduce}
                  onChange={e => setStepsToReproduce(e.target.value)}
                  rows={4}
                  placeholder={t('bugReport.stepsPlaceholder')}
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">{t('bugReport.screenshot')}</label>

                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-white/15 bg-[#0b0f14] px-3 py-3 text-sm text-white/80 hover:border-yellow-400/60">
                  <ImagePlus size={16} className="text-yellow-400" />
                  <span className="truncate">
                    {screenshotFile
                      ? screenshotFile.name
                      : t('bugReport.chooseImage', { size: MAX_SCREENSHOT_SIZE_MB })}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null
                      setScreenshotFile(file)
                    }}
                  />
                </label>

                {screenshotFile && (
                  <button
                    type="button"
                    onClick={() => setScreenshotFile(null)}
                    className="mt-2 text-xs text-white/60 hover:text-white"
                  >
                    {t('bugReport.removeScreenshot')}
                  </button>
                )}
              </div>

              {error && <div className="text-sm text-red-400">{error}</div>}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/5"
              >
                {t('bugReport.cancel')}
              </button>

              <button
                type="button"
                onClick={() => {
                  void submitReport()
                }}
                disabled={submitting}
                className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? t('bugReport.sending') : t('bugReport.send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
