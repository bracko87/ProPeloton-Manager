/**
 * src/components/dashboard/BugReportButton.tsx
 *
 * Small bug report button used in dashboard UI. Opens a modal where users can
 * describe an issue, pick severity and submit a report stored in the
 * `bug_reports` table via Supabase.
 */

import React, { useState } from 'react'
import { Bug, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * BugReportButtonProps
 *
 * Props for the BugReportButton component.
 */
interface BugReportButtonProps {
  collapsed?: boolean
  currentPageLabel: string
  currentPath: string
}

/**
 * BugReportButton
 *
 * Render a compact button (or full row) that opens a modal for submitting a
 * bug report. Reports are inserted into the `bug_reports` table with basic
 * metadata (user, page, browser, viewport).
 *
 * @param collapsed - When true show compact icon-only version
 * @param currentPageLabel - Human readable label for the current page
 * @param currentPath - Internal path for the current page
 * @returns JSX.Element
 */
export default function BugReportButton({
  collapsed = false,
  currentPageLabel,
  currentPath,
}: BugReportButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  /**
   * submitReport
   *
   * Validate input and insert a bug report row into Supabase.
   */
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

      const payload = {
        user_id: user?.id ?? null,
        page_label: currentPageLabel,
        page_path: currentPath,
        page_url: typeof window !== 'undefined' ? window.location.href : null,
        description: description.trim(),
        severity,
        browser: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        viewport:
          typeof window !== 'undefined'
            ? `${window.innerWidth}x${window.innerHeight}`
            : null,
        reported_from: 'sidebar',
      }

      const { error: insertError } = await supabase.from('bug_reports').insert(payload)

      if (insertError) {
        throw insertError
      }

      setDescription('')
      setSeverity('medium')
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
          collapsed ? 'flex items-center justify-center px-3 py-3' : 'flex items-start gap-3 px-3 py-3'
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

      {!collapsed && success && <div className="text-xs text-green-400">Bug report sent. Thank you.</div>}

      {!collapsed && error && !open && <div className="text-xs text-red-400">{error}</div>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#11161d] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-lg font-semibold">Report a bug</div>
                <div className="text-sm text-white/60">Help us fix issues faster.</div>
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

              <div>
                <label className="mb-2 block text-sm font-medium">Severity</label>
                <select
                  value={severity}
                  onChange={e => setSeverity(e.target.value as 'low' | 'medium' | 'high')}
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">What happened?</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={6}
                  placeholder="Describe the issue, what you expected, and how to reproduce it..."
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-yellow-400"
                />
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