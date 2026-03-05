/**
 * ErrorBoundary.tsx
 * A minimal React error boundary to isolate Finance tab failures.
 *
 * If a child throws, this boundary will render a compact error box but keep
 * the rest of the Finance page functional.
 */

import React from 'react'

/**
 * ErrorBoundaryProps
 * Props for the Finance ErrorBoundary.
 */
interface ErrorBoundaryProps {
  title?: string
  children: React.ReactNode
}

/**
 * ErrorBoundaryState
 * Internal state representing error presence and message.
 */
interface ErrorBoundaryState {
  hasError: boolean
  message?: string
}

/**
 * ErrorBoundary
 * Catches rendering/runtime errors in child tab components.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: undefined }

  /**
   * getDerivedStateFromError
   * Update state when an error is thrown in a child.
   */
  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (error as any)?.message ?? 'Tab crashed.'
    return { hasError: true, message: msg }
  }

  /**
   * componentDidCatch
   * Log the error for debugging.
   */
  componentDidCatch(error: unknown): void {
    // eslint-disable-next-line no-console
    console.error('Finance Tab ErrorBoundary:', error)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm font-semibold text-red-600">{this.props.title ?? 'Tab error'}</div>
          <div className="text-sm text-gray-700 mt-1">{this.state.message}</div>
        </div>
      )
    }
    return this.props.children
  }
}
