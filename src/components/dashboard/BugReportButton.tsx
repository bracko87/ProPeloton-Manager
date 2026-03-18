/**
 * src/components/dashboard/BugReportButton.tsx
 *
 * Small bug report button used in dashboard UI. Opens a modal where users can
 * describe an issue, attach an optional screenshot and submit a report stored
 * in the `bug_reports` table via Supabase.
 */

import React, { useState } from 'react'
import { Bug, X, ImagePlus } from 'lucide-react'
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
}: BugReportButtonProps) {
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
      throw new Error('Screenshot must be an image file.')
    }

    if (screenshotFile.size > maxBytes) {
      throw new Error(`Screenshot must be smaller than ${MAX_SCREENSHOT_SIZE_MB} MB.`)
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
      setError('Please describe the issue.')
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
        reportId
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
      setError(err instanceof Error ? err.message : 'Failed to send bug report.')
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
        className={`w-full rounded-md border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 ${
          collapsed
            ? 'flex items-center justify-center px-3 py-3'
            : 'flex items-start gap-3 px-3 py-3'
        }`}
      >
        <Bug size={16} className="mt-0.5 flex-shrink-0 text-yellow-400" />

        {!collapsed && (
          <div className="min-w-0 text-left">
            <div className="text-sm font-semibold leading-tight">Report bug</div>
            <div className="mt-1 text-xs text-white/60 leading-tight">
              Current page: {currentPageLabel}
            </div>
          </div>
        )}
      </button>

      {!collapsed && success && (
        <div className="text-xs text-green-400">Bug report sent. Thank you.</div>
      )}

      {!collapsed && error && !open && (
        <div className="text-xs text-red-400">{error}</div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-[#11161d] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-lg font-semibold">Report a bug</div>
                <div className="text-sm text-white/60">
                  Help us fix issues faster.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                <div>
                  <span className="text-white/50">Page:</span>{' '}
                  <span className="font-medium">{currentPageLabel}</span>
                </div>
                <div className="mt-1 break-all text-white/70">{currentPath}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">Bug type</label>
                  <select
                    value={bugType}
                    onChange={e => setBugType(e.target.value as BugType)}
                    className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                  >
                    <option value="ui">UI / Layout</option>
                    <option value="gameplay">Gameplay / Logic</option>
                    <option value="performance">Performance</option>
                    <option value="data">Data / Numbers</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Severity</label>
                  <select
                    value={severity}
                    onChange={e => setSeverity(e.target.value as Severity)}
                    className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">What happened?</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Describe the issue clearly..."
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Expected result
                </label>
                <textarea
                  value={expectedResult}
                  onChange={e => setExpectedResult(e.target.value)}
                  rows={3}
                  placeholder="What should have happened?"
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Actual result</label>
                <textarea
                  value={actualResult}
                  onChange={e => setActualResult(e.target.value)}
                  rows={3}
                  placeholder="What happened instead?"
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Steps to reproduce
                </label>
                <textarea
                  value={stepsToReproduce}
                  onChange={e => setStepsToReproduce(e.target.value)}
                  rows={4}
                  placeholder="1. Go to...
2. Click...
3. See problem..."
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Screenshot (optional)
                </label>

                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-white/15 bg-[#0b0f14] px-3 py-3 text-sm text-white/80 hover:border-yellow-400/60">
                  <ImagePlus size={16} className="text-yellow-400" />
                  <span className="truncate">
                    {screenshotFile
                      ? screenshotFile.name
                      : `Choose image file (max ${MAX_SCREENSHOT_SIZE_MB} MB)`}
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
                    Remove screenshot
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
                Cancel
              </button>

              <button
                type="button"
                onClick={submitReport}
                disabled={submitting}
                className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? 'Sending...' : 'Send report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
