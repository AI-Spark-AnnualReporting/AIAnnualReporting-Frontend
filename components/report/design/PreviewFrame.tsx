"use client"

import { useEffect, useRef, useState } from "react"

/**
 * An A4 page with its own Cover | Page switch, drawn at the renderer's logical
 * size and scaled to fit.
 *
 * The children render at 595×842 CSS px — the same numbers the renderer's
 * templates use — and this scales the result down. Working at the true size is
 * what lets a type size mean the same thing here as it does in the file: an
 * "11pt body" is 11px on both, rather than 11px of a page that has already been
 * shrunk to fit a sidebar.
 *
 * The reserved height is the scaled height, so the panel does not jump as the
 * observer settles on a width.
 *
 * The switch lives here rather than in the dialog, mirroring
 * Centrion_Frontend/src/components/quarterly/ReportPreview.tsx:83-106. Each
 * instance keeps its own view, so the desktop pane and the small-screen strip
 * do not fight over one piece of state.
 */

export const PAGE_W = 595
export const PAGE_H = 842

export type PreviewView = "cover" | "page"

export function PreviewFrame({ cover, page }: {
  cover: React.ReactNode
  page: React.ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [view, setView] = useState<PreviewView>("cover")

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = width ? width / PAGE_W : 0

  return (
    <div ref={wrapRef} className="flex w-full flex-col gap-2">
      <div className="inline-flex self-center overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white">
        {(["cover", "page"] as const).map((m) => {
          const active = view === m
          return (
            <button
              key={m}
              type="button"
              onClick={() => setView(m)}
              aria-pressed={active}
              className={
                "cursor-pointer px-3 py-1 text-[11.5px] transition-colors "
                + (active ? "bg-[#EEF2FF] font-semibold text-[#4338CA]" : "text-[#64748B] hover:bg-[#F8FAFC]")
              }
            >
              {m === "cover" ? "Cover" : "Page"}
            </button>
          )
        })}
      </div>

      {/* rounded-md in the reference, which is 8px there and 6px here. */}
      <div
        className="relative overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-[#F8FAFC] shadow-[inset_0_2px_4px_0_rgba(0,0,0,0.05)]"
        style={{ height: scale ? PAGE_H * scale : 0 }}
      >
        <div style={{ width: PAGE_W, height: PAGE_H, background: "#ffffff",
                      position: "absolute", top: 0, left: 0,
                      transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {view === "cover" ? cover : page}
        </div>
      </div>
    </div>
  )
}
