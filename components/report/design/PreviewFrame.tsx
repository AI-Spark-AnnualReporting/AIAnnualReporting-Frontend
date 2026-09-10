"use client"

import { useEffect, useRef, useState } from "react"

/**
 * An A4 page, drawn at the renderer's own logical size and scaled to fit.
 *
 * The children render at 595×842 CSS px — the same numbers the renderer's
 * templates use — and this scales the result down. Working at the true size is
 * what lets a type size mean the same thing here as it does in the file: an
 * "11pt body" is 11px on both, rather than 11px of a page that has already been
 * shrunk to fit a sidebar.
 *
 * The reserved height is the scaled height, so the panel does not jump as the
 * observer settles on a width.
 */

export const PAGE_W = 595
export const PAGE_H = 842

export function PreviewFrame({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = width ? width / PAGE_W : 0

  return (
    <div ref={wrapRef} className="w-full">
      <div style={{ height: scale ? PAGE_H * scale : 0 }}
           className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div style={{ width: PAGE_W, height: PAGE_H,
                      transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  )
}
