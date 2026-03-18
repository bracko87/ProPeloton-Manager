/**
 * src/components/dashboard/ReportPlayerButton.tsx
 *
 * Button + modal used to report a player or club. Mirrors the BugReportButton UX
 * but collects report fields tied to a reported user/team and inserts a row
 * into the player_reports table via Supabase.
 */

import React, { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * ReportPlayerButtonProps
 * Props for the ReportPlayerButton component.
 */
export type ReportPlayerButtonProps = {
  reportedUserId: string
  reportedClubId: string | null
  reportedClubName: string
  reportedDisplayName: string
  currentPageLabel: string
  currentPath: string
  reporterClubId?: string | null
}

/**
 * ReportPlayerButton
 *
 * Button that opens a modal to report a player or team. Submits the report to
 * the `player_reports` table (create this table in your DB with appropriate
 * columns) and provides small inline success/error states.
 *
 * @param props - Component props described by ReportPlayerButtonProps
 */
export default function ReportPlayerButton({
  reportedUserId,
  reportedClubId,
  reportedClubName,
  reportedDisplayName,
  currentPageLabel,
  currentPath,
  reporterClubId = null,
}: ReportPlayerButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<'abuse' | 'cheating' | 'spam' | 'other'>('abuse')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checkingExisting, setCheckingExisting] = useState(true)
  const [alreadyReported, setAlreadyReported] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)

  useEffect(() => {
    let cancelled = false

    async function checkExistingReport(): Promise<void> {
      try {
        setCheckingExisting(true)
        setError(null)

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) {
          throw userError
        }

        if (!user?.id || !reportedUserId) {
          if (!cancelled) {
            setAlreadyReported(false)
          }
          return
        }

        const { data, error: queryError } = await supabase
          .from('player_reports')
          .select('id')
          .eq('reported_user_id', reportedUserId)
          .is('reviewed_at', null)
          .limit(1)

        if (queryError) {
          throw queryError
        }

        if (!cancelled) {
          setAlreadyReported((data ?? []).length > 0)
        }
      } catch (err) {
        if (!cancelled) {
          setAlreadyReported(false)
          setError(err instanceof Error ? err.message : 'Failed to check existing report.')
        }
      } finally {
        if (!cancelled) {
          setCheckingExisting(false)
        }
      }
    }

    void checkExistingReport()

    return () => {
      cancelled = true
    }
  }, [reportedUserId])

  function createReportId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }

    return `report-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  async function uploadEvidence(userId: string, reportId: string): Promise<string | null> {
    if (!evidenceFile) {
      return null
    }

    if (!evidenceFile.type.startsWith('image/')) {
      throw new Error('Please upload an image file.')
    }

    const maxFileSize = 5 * 1024 * 1024
    if (evidenceFile.size > maxFileSize) {
      throw new Error('Screenshot must be 5 MB or smaller.')
    }

    const fileName = `${Date.now()}-${sanitizeFileName(evidenceFile.name)}`
    const filePath = `${userId}/${reportId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('player-report-evidence')
      .upload(filePath, evidenceFile, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      throw uploadError
    }

    return filePath
  }

  async function submitReport(): Promise<void> {
    if (alreadyReported) {
      setError('This user is already reported and pending review.')
      return
    }

    if (!description.trim()) {
      setError('Please describe the issue.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user?.id) {
        setError('You must be logged in to send a report.')
        return
      }

      const reportId = createReportId()
      const evidencePath = await uploadEvidence(user.id, reportId)

      const payload = {
        id: reportId,
        reporter_user_id: user.id,
        reporter_club_id: reporterClubId ?? null,
        reported_user_id: reportedUserId,
        reported_club_id: reportedClubId,
        reported_club_name: reportedClubName,
        reason_type: reason,
        description: description.trim(),
        incident_context: `Severity: ${severity}`,
        evidence_path: evidencePath,
        page_label: currentPageLabel,
        page_path: currentPath,
        page_url: typeof window !== 'undefined' ? window.location.href : null,
        browser: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        viewport:
          typeof window !== 'undefined'
            ? `${window.innerWidth}x${window.innerHeight}`
            : null,
        reported_from: 'team_profile_modal',
        status: 'open',
      }

      const { error: insertError } = await supabase.from('player_reports').insert(payload)

      if (insertError) {
        if (insertError.code === '23505') {
          setAlreadyReported(true)
          setOpen(false)
          setError(null)
          return
        }

        throw insertError
      }

      setDescription('')
      setReason('abuse')
      setSeverity('medium')
      setEvidenceFile(null)
      setSuccess(true)
      setAlreadyReported(true)
      setOpen(false)

      window.setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      console.error('Failed to send player report:', err)
      setError(err instanceof Error ? err.message : 'Failed to send report.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex flex-col items-start">
        <button
          type="button"
          disabled={checkingExisting || alreadyReported || submitting}
          onClick={() => setOpen(true)}
          title={
            alreadyReported
              ? 'This user is already reported and pending review.'
              : 'Report player'
          }
          className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition ${
            alreadyReported || checkingExisting
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span>
            {checkingExisting
              ? 'Checking...'
              : alreadyReported
                ? 'Already Reported'
                : 'Report Player'}
          </span>
        </button>

        {alreadyReported ? (
          <span className="mt-1 text-xs text-slate-500">
            This user is already reported and pending review.
          </span>
        ) : null}
      </div>

      {success && <div className="text-xs text-green-400">Report sent. Thank you.</div>}

      {error && !open && <div className="text-xs text-red-400">{error}</div>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-[#11161d] text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-lg font-semibold">Report player or team</div>
                <div className="text-sm text-white/60">
                  Provide details to help our moderation team.
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
                  <span className="text-white/50">Reported:</span>{' '}
                  <span className="font-medium">{reportedDisplayName}</span>
                </div>
                <div className="mt-1 break-all text-white/70">
                  {reportedClubName} — {reportedClubId ?? 'No club'}
                </div>
                <div className="mt-2 text-xs text-white/50">
                  Page: <span className="font-medium">{currentPageLabel}</span>
                </div>
                <div className="mt-1 break-all text-xs text-white/70">{currentPath}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">Reason</label>
                  <select
                    value={reason}
                    onChange={(e) =>
                      setReason(e.target.value as 'abuse' | 'cheating' | 'spam' | 'other')
                    }
                    className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-red-400"
                  >
                    <option value="abuse">Abuse / Harassment</option>
                    <option value="cheating">Cheating / Exploits</option>
                    <option value="spam">Spam / Advertising</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Severity</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-red-400"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Details</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder="Describe the incident, when it happened and any relevant context..."
                  className="w-full rounded-md border border-white/10 bg-[#0b0f14] px-3 py-2 text-sm outline-none focus:border-red-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Proof screenshot</label>

                <div className="rounded-md border border-white/10 bg-[#0b0f14] p-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null
                      setEvidenceFile(file)
                    }}
                    className="block w-full text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/20"
                  />

                  <div className="mt-2 text-xs text-white/50">
                    Upload one image as proof. Max 5 MB.
                  </div>

                  {evidenceFile ? (
                    <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
                      <div className="text-sm text-white/80">{evidenceFile.name}</div>
                      <div className="mt-1 text-xs text-white/50">
                        {(evidenceFile.size / 1024 / 1024).toFixed(2)} MB
                      </div>

                      <button
                        type="button"
                        onClick={() => setEvidenceFile(null)}
                        className="mt-3 rounded-md border border-white/10 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/5"
                      >
                        Remove image
                      </button>
                    </div>
                  ) : null}
                </div>
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
                disabled={submitting || alreadyReported}
                className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-70"
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