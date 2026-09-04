// src/components/tutorial/TutorialTargetFrame.tsx
import React, { useEffect, useState } from 'react'

type TutorialTargetFrameProps = {
  target?: string | null
}

type FrameRect = {
  top: number
  left: number
  width: number
  height: number
}

const FRAME_PADDING = 8
const VIEWPORT_MARGIN = 6
const MIN_FRAME_SIZE = 28

const TARGET_ALIASES: Record<string, string[]> = {
  'header-premium': ['header-membership'],
  'overview-staff-briefing': ['overview-attention'],
}

function getTutorialTargetSelector(target: string): string {
  const escapedTarget =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(target)
      : target.replace(/"/g, '\\"')

  return `[data-tutorial-target="${escapedTarget}"]`
}

function findTargetElement(target: string): HTMLElement | null {
  const targetCandidates = [target, ...(TARGET_ALIASES[target] ?? [])]

  for (const targetCandidate of targetCandidates) {
    const element = document.querySelector<HTMLElement>(
      getTutorialTargetSelector(targetCandidate),
    )

    if (element) return element
  }

  return null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function buildFrameRect(targetElement: HTMLElement): FrameRect | null {
  const targetRect = targetElement.getBoundingClientRect()

  if (targetRect.width <= 0 || targetRect.height <= 0) {
    return null
  }

  const left = clamp(
    targetRect.left - FRAME_PADDING,
    VIEWPORT_MARGIN,
    window.innerWidth - VIEWPORT_MARGIN,
  )

  const top = clamp(
    targetRect.top - FRAME_PADDING,
    VIEWPORT_MARGIN,
    window.innerHeight - VIEWPORT_MARGIN,
  )

  const right = clamp(
    targetRect.right + FRAME_PADDING,
    VIEWPORT_MARGIN,
    window.innerWidth - VIEWPORT_MARGIN,
  )

  const bottom = clamp(
    targetRect.bottom + FRAME_PADDING,
    VIEWPORT_MARGIN,
    window.innerHeight - VIEWPORT_MARGIN,
  )

  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)

  if (width < MIN_FRAME_SIZE || height < MIN_FRAME_SIZE) {
    return null
  }

  return {
    top,
    left,
    width,
    height,
  }
}

export default function TutorialTargetFrame({
  target,
}: TutorialTargetFrameProps): JSX.Element | null {
  const [frameRect, setFrameRect] = useState<FrameRect | null>(null)

  useEffect(() => {
    if (!target) {
      setFrameRect(null)
      return
    }

    let resizeObserver: ResizeObserver | null = null
    let animationFrameId = 0
    let secondAnimationFrameId = 0
    let timeoutId = 0
    let intervalId = 0
    let cancelled = false

    function updateFrame(): void {
      window.cancelAnimationFrame(animationFrameId)

      animationFrameId = window.requestAnimationFrame(() => {
        if (cancelled || !target) return

        const targetElement = findTargetElement(target)

        if (!targetElement) {
          setFrameRect(null)
          return
        }

        setFrameRect(buildFrameRect(targetElement))
      })
    }

    updateFrame()

    secondAnimationFrameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(updateFrame)
    })

    timeoutId = window.setTimeout(updateFrame, 120)
    intervalId = window.setInterval(updateFrame, 250)

    const targetElement = findTargetElement(target)
    const overlayPanel = document.querySelector<HTMLElement>(
      '[data-tutorial-overlay-panel="true"]',
    )

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFrame)

      if (targetElement) {
        resizeObserver.observe(targetElement)
      }

      if (overlayPanel) {
        resizeObserver.observe(overlayPanel)
      }

      resizeObserver.observe(document.body)
    }

    window.addEventListener('resize', updateFrame)
    window.addEventListener('scroll', updateFrame, true)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrameId)
      window.cancelAnimationFrame(secondAnimationFrameId)
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
      window.removeEventListener('resize', updateFrame)
      window.removeEventListener('scroll', updateFrame, true)
      resizeObserver?.disconnect()
    }
  }, [target])

  if (!target || !frameRect) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed"
      style={{
        top: frameRect.top,
        left: frameRect.left,
        width: frameRect.width,
        height: frameRect.height,
        zIndex: 800,
        borderRadius: 0,
        border: '4px solid rgba(239, 68, 68, 0.98)',
        boxShadow:
          '0 0 0 2px rgba(255, 255, 255, 0.75), 0 0 22px rgba(239, 68, 68, 0.8)',
        background: 'transparent',
      }}
    />
  )
}
