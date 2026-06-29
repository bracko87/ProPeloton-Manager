// src/components/tutorial/TutorialTargetFrame.tsx
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type Rect = {
  top: number
  left: number
  width: number
  height: number
}

function findTutorialTarget(target: string): HTMLElement | null {
  const directTarget = document.querySelector<HTMLElement>(
    `[data-tutorial-target="${target}"]`,
  )

  if (directTarget) return directTarget

  const clickableElements = Array.from(
    document.querySelectorAll<HTMLElement>('button, a, [role="button"]'),
  )

  if (target === 'header-coins') {
    return (
      clickableElements.find((element) => {
        const text = element.innerText || element.textContent || ''
        const aria = element.getAttribute('aria-label') || ''
        const title = element.getAttribute('title') || ''

        return /coin/i.test(`${text} ${aria} ${title}`)
      }) ?? null
    )
  }

  if (target === 'header-notifications') {
    return (
      clickableElements.find((element) => {
        const text = element.innerText || element.textContent || ''
        const aria = element.getAttribute('aria-label') || ''
        const title = element.getAttribute('title') || ''

        return (
          /notification/i.test(`${text} ${aria} ${title}`) ||
          /bell/i.test(`${text} ${aria} ${title}`)
        )
      }) ?? null
    )
  }

  if (target === 'header-menu') {
    return (
      clickableElements.find((element) => {
        const text = element.innerText || element.textContent || ''
        const aria = element.getAttribute('aria-label') || ''
        const title = element.getAttribute('title') || ''

        return /menu/i.test(`${text} ${aria} ${title}`)
      }) ?? null
    )
  }

  return null
}

export default function TutorialTargetFrame({
  target,
}: {
  target?: string | null
}) {
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    if (!target) {
      setRect(null)
      return
    }

    let alive = true

    function updateRect() {
      if (!alive || !target) return

      const element = findTutorialTarget(target)

      if (!element) {
        setRect(null)
        return
      }

      const nextRect = element.getBoundingClientRect()
      const padding = 8

      setRect({
        top: Math.max(4, nextRect.top - padding),
        left: Math.max(4, nextRect.left - padding),
        width: nextRect.width + padding * 2,
        height: nextRect.height + padding * 2,
      })
    }

    updateRect()

    const rafId = window.requestAnimationFrame(updateRect)
    const intervalId = window.setInterval(updateRect, 250)

    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)

    return () => {
      alive = false
      window.cancelAnimationFrame(rafId)
      window.clearInterval(intervalId)
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [target])

  if (!rect) return null

  return createPortal(
    <div
      className="pointer-events-none fixed z-[9999] rounded-full border-4 border-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.18),0_0_24px_rgba(239,68,68,0.55)]"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    />,
    document.body,
  )
}