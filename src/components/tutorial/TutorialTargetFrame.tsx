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

const FRAME_PADDING = 10
const VIEWPORT_MARGIN = 10
const MIN_FRAME_SIZE = 36

function findTargetElement(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-tutorial-target="${target}"]`,
  )
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

    let animationFrameId = 0
    let resizeObserver: ResizeObserver | null = null
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

    const targetElement = findTargetElement(target)

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFrame)

      if (targetElement) {
        resizeObserver.observe(targetElement)
      }

      resizeObserver.observe(document.body)
    }

    window.addEventListener('resize', updateFrame)
    window.addEventListener('scroll', updateFrame, true)

    const intervalId = window.setInterval(updateFrame, 250)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', updateFrame)
      window.removeEventListener('scroll', updateFrame, true)
      window.clearInterval(intervalId)
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

        /**
         * Important:
         * This must be BELOW the tutorial box.
         * The tutorial overlay/panel should be z-index 1000 or higher.
         */
        zIndex: 800,

        /**
         * Sharp rectangle only.
         * No rounded corners.
         */
        borderRadius: 0,
        border: '4px solid rgba(239, 68, 68, 0.98)',

        /**
         * Glow around the rectangle.
         */
        boxShadow:
          '0 0 0 2px rgba(255, 255, 255, 0.75), 0 0 22px rgba(239, 68, 68, 0.8)',

        /**
         * Keep it behind overlay but visible above page content.
         */
        background: 'transparent',
      }}
    />
  )
}