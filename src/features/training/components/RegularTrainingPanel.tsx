/**
 * src/features/training/components/RegularTrainingPanel.tsx
 *
 * Placeholder panel for regular weekly training configuration.
 *
 * Purpose:
 * - Provide a visually consistent card on the Training page.
 * - Reserve space for future regular training settings and controls.
 * - Avoid backend or business logic until the long-term processor is ready.
 */

'use client'

import React from 'react'

/**
 * RegularTrainingPanel
 * Simple informational card describing upcoming regular training features.
 */
export default function RegularTrainingPanel(): JSX.Element {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
        Regular Training
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        This stays intentionally light for now. Training Camps are the first live training system,
        while regular weekly training will come after the long-term skill progression processor is
        ready.
      </p>
    </section>
  )
}
