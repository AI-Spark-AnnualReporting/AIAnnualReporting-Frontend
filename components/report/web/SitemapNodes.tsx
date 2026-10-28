"use client"

/**
 * The boxes of the sitemap tree. Look only: what a click or a drag does is
 * decided in SitemapTree, these just draw the box for a given state.
 */

import { AlertTriangle, EyeOff, FileText, Globe, Layers, Plus } from "lucide-react"
import { forwardRef, type HTMLAttributes } from "react"

import type { WebSitemapGroup, WebSitemapPage } from "@/lib/api/webSitemap"
import { cn } from "@/lib/utils"

/** Fade-and-rise when a box first appears (keyframe in app/globals.css). */
const APPEAR = "animate-[onb-rise_220ms_ease-out]"

const SELECTED_RING = "ring-2 ring-brand ring-offset-2"

interface HomeNodeProps {
  title: string
  selected: boolean
  onClick: () => void
}

export function HomeNode({ title, selected, onClick }: HomeNodeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-40 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800",
        selected && SELECTED_RING,
      )}
    >
      <Globe className="h-4 w-4 opacity-80" />
      <span dir="auto" className="max-w-56 truncate">{title || "Home"}</span>
    </button>
  )
}

interface GroupNodeProps {
  group: WebSitemapGroup
  selected: boolean
  onClick: () => void
}

export function GroupNode({ group, selected, onClick }: GroupNodeProps) {
  const visible = group.pages.filter((page) => !page.hidden).length
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg bg-brand px-3 py-2.5 text-left text-sm font-semibold text-brand-foreground shadow-sm transition hover:bg-brand/90",
        APPEAR,
        selected && SELECTED_RING,
      )}
    >
      <span dir="auto" className="line-clamp-2">{group.title || "Untitled group"}</span>
      <span
        className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium"
        title={`${visible} of ${group.pages.length} pages visible`}
      >
        {group.pages.length}
      </span>
    </button>
  )
}

interface PageNodeProps extends HTMLAttributes<HTMLButtonElement> {
  page: WebSitemapPage
  selected?: boolean
  /** True while this box is the one being dragged (the original stays, faded). */
  dragging?: boolean
  /** Set while another page or section hovers over this box: "Merge into …". */
  mergeHint?: string | null
  /** True when the page points at a section the report no longer has. */
  hasMissingSection?: boolean
  /** The floating copy that follows the pointer during a drag. */
  overlay?: boolean
}

export const PageNode = forwardRef<HTMLButtonElement, PageNodeProps>(function PageNode(
  { page, selected, dragging, mergeHint, hasMissingSection, overlay, className, ...rest },
  ref,
) {
  const merged = page.section_codes.length > 1
  const extra = page.section_codes.length === 0
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "relative flex w-full flex-col gap-1 rounded-lg border bg-white px-3 py-2 text-left shadow-sm transition",
        "cursor-grab hover:border-slate-300 hover:shadow active:cursor-grabbing",
        !overlay && APPEAR,
        page.hidden && "border-dashed bg-slate-50 text-slate-400",
        selected && SELECTED_RING,
        dragging && "opacity-30",
        overlay && "rotate-1 cursor-grabbing shadow-xl ring-2 ring-brand/40",
        mergeHint && "border-brand bg-brand/5 ring-2 ring-brand",
        className,
      )}
      {...rest}
    >
      <span className="flex items-start gap-1.5">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span dir="auto" className="line-clamp-2 flex-1 text-[13px] font-medium leading-snug text-slate-800">
          {page.title || "Untitled page"}
        </span>
        {page.hidden && <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Hidden" />}
        {hasMissingSection && (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
            aria-label="A section on this page is no longer in the report" />
        )}
      </span>
      {(merged || extra) && (
        <span className="flex gap-1 pl-5">
          {merged && (
            <span className="flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
              <Layers className="h-3 w-3" />
              {page.section_codes.length} sections
            </span>
          )}
          {extra && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              Extra page
            </span>
          )}
        </span>
      )}
      {mergeHint && (
        <span className="absolute -top-2.5 left-2 max-w-[90%] truncate rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
          Merge into “{mergeHint}”
        </span>
      )}
    </button>
  )
})

interface GhostNodeProps {
  label: string
  onClick: () => void
  className?: string
}

/** A dashed "+" box that adds a page or a group. */
export function GhostNode({ label, onClick, className }: GhostNodeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-500 transition hover:border-brand hover:bg-brand/5 hover:text-brand",
        className,
      )}
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

/** A report section chip in the "Not on the site yet" tray. */
export const SectionChip = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  title: string
  dragging?: boolean
  overlay?: boolean
}>(function SectionChip({ title, dragging, overlay, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex cursor-grab items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 shadow-sm active:cursor-grabbing",
        dragging && "opacity-30",
        overlay && "cursor-grabbing shadow-lg ring-2 ring-brand/40",
        className,
      )}
      {...rest}
    >
      <FileText className="h-3 w-3 text-amber-500" />
      <span dir="auto" className="max-w-48 truncate">{title}</span>
    </div>
  )
})
