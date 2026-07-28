"use client"

import { useEffect, useRef, useState } from "react"
import { usePatchOutlineTitles } from "@/hooks/useSessions"
import { OutlineHeading } from "@/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Check } from "lucide-react"

// Debounce for save-as-you-type. Renames persist ~0.6s after the last keystroke.
const AUTOSAVE_MS = 600

interface OutlineHeadingCardProps {
  sessionId: string
  heading: OutlineHeading
  isRtl: boolean
  /** When true, render plain text with no inputs/controls (draft is generated). */
  readOnly?: boolean
  /** Called when a PATCH returns 409 outline_locked so the page can lock the UI. */
  onLocked?: () => void
  /** Called after any title is successfully renamed, so the page knows the draft
   *  is now out of date with the outline and should be rebuilt on Continue. */
  onEdited?: () => void
}

/**
 * One editable title (heading or subheading). Saves as you type (debounced) and
 * also commits on blur / Enter; Escape reverts. Manages its own last-saved value
 * so revert/PATCH stay per-field. While typing, values shorter than 3 chars are
 * simply not saved (no mid-typing revert); the < 3 revert only happens on blur.
 */
function OutlineTitleInput({
  sessionId,
  id,
  title,
  isRtl,
  variant,
  onLocked,
  onEdited,
}: {
  sessionId: string
  id: string
  title: string
  isRtl: boolean
  variant: "heading" | "subheading"
  onLocked?: () => void
  onEdited?: () => void
}) {
  // Local-only editing state. The parent remounts this input (via `key`) when
  // the server title changes on regenerate, so there is no prop→state sync to do
  // here — which keeps this clear of the strict "no set-state-in-effect / no ref
  // access during render" lint rules.
  const patch = usePatchOutlineTitles()
  const [value, setValue] = useState(title)
  const [saved, setSaved] = useState(title)
  const [showTick, setShowTick] = useState(false)
  const skipBlurRef = useRef(false)
  // Mirror of `saved`, read by async saves/timeouts to compare against the
  // freshest committed value (ref reads are outside render, so this is fine).
  const savedValRef = useRef(title)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    savedValRef.current = saved
  }, [saved])

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (tickTimer.current) clearTimeout(tickTimer.current)
    },
    []
  )

  const persist = async (trimmed: string) => {
    try {
      await patch.mutateAsync({ sessionId, payload: { titles: [{ id, title: trimmed }] } })
      setSaved(trimmed)
      savedValRef.current = trimmed
      onEdited?.() // draft is now stale relative to the outline
      setShowTick(true)
      if (tickTimer.current) clearTimeout(tickTimer.current)
      tickTimer.current = setTimeout(() => setShowTick(false), 1500)
    } catch (err) {
      // Never leave a title on screen that isn't in the DB.
      setValue(savedValRef.current)
      const e = err as { status?: number; error?: string; message?: string }
      if (e?.status === 409 && e?.error === "outline_locked") {
        toast.error("This outline is locked.")
        onLocked?.()
      } else {
        toast.error(e?.message || "Couldn't save the title.")
      }
    }
  }

  // Debounced auto-save while typing. Skips no-ops and too-short values silently.
  const scheduleSave = (raw: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      const trimmed = raw.trim()
      if (trimmed === savedValRef.current || trimmed.length < 3) return
      persist(trimmed)
    }, AUTOSAVE_MS)
  }

  // Final commit on blur / Enter: enforce the min-length rule (revert if broken).
  const commitNow = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    const trimmed = value.trim()
    if (trimmed === savedValRef.current) {
      setValue(savedValRef.current) // normalise whitespace back to the saved value
      return
    }
    if (trimmed.length < 3) {
      setValue(savedValRef.current)
      toast.error("Title must be at least 3 characters.")
      return
    }
    setValue(trimmed)
    persist(trimmed)
  }

  const isHeading = variant === "heading"
  const overLimit = value.length > 100

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <input
          value={value}
          maxLength={120}
          dir={isRtl ? "rtl" : "ltr"}
          onChange={(e) => {
            setValue(e.target.value)
            scheduleSave(e.target.value)
          }}
          onBlur={() => {
            if (skipBlurRef.current) {
              skipBlurRef.current = false
              return
            }
            commitNow()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === "Escape") {
              skipBlurRef.current = true
              if (debounceTimer.current) clearTimeout(debounceTimer.current)
              setValue(savedValRef.current)
              e.currentTarget.blur()
            }
          }}
          className={cn(
            "min-w-0 flex-1 rounded-lg border border-slate-200 bg-white transition-colors placeholder:text-slate-300 hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100",
            isHeading
              ? "px-3.5 py-2.5 text-lg font-bold text-slate-900"
              : "px-3 py-2 text-sm font-medium text-slate-700",
            isRtl && "text-right"
          )}
        />
        {/* Fixed-width status slot keeps every row's input edge aligned */}
        <div className="flex w-6 shrink-0 items-center justify-center">
          {showTick && (
            <span title="Saved" className="text-emerald-500">
              <Check className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
      {overLimit && (
        <p className={cn("mt-1 px-1 text-[11px] text-slate-400", isRtl && "text-right")}>
          {value.length}/120
        </p>
      )}
    </div>
  )
}

/** Read-only title text (draft generated — headings locked). */
function ReadOnlyTitle({
  text,
  isRtl,
  variant,
}: {
  text: string
  isRtl: boolean
  variant: "heading" | "subheading"
}) {
  return (
    <p
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "min-w-0 flex-1 px-1",
        variant === "heading"
          ? "text-lg font-bold text-slate-900"
          : "text-sm font-medium text-slate-700",
        isRtl && "text-right"
      )}
    >
      {text}
    </p>
  )
}

/**
 * One heading + its subheadings. Renders strictly by `order` and exposes no
 * add / delete / reorder controls (enforced by construction). Editable inputs
 * in normal mode; plain text in read-only mode.
 */
export function OutlineHeadingCard({
  sessionId,
  heading,
  isRtl,
  readOnly = false,
  onLocked,
  onEdited,
}: OutlineHeadingCardProps) {
  // `?? []` because the outline blob is unvalidated LLM output — a heading with
  // no subheadings may simply omit the key rather than send an empty array.
  const subheadings = [...(heading.subheadings ?? [])].sort((a, b) => a.order - b.order)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Heading (H2) */}
      <div className="flex items-center gap-2">
        {readOnly ? (
          <ReadOnlyTitle text={heading.title} isRtl={isRtl} variant="heading" />
        ) : (
          <OutlineTitleInput
            // Remount (reset local state) only when the server title changes
            // (regenerate) — not on our own saves, which don't touch the cache.
            key={`${heading.id}:${heading.title}`}
            sessionId={sessionId}
            id={heading.id}
            title={heading.title}
            isRtl={isRtl}
            variant="heading"
            onLocked={onLocked}
            onEdited={onEdited}
          />
        )}
      </div>

      {/* Subheadings (H3, indented with an accent rail) */}
      {subheadings.length > 0 && (
        <div
          className={cn(
            "mt-4 space-y-2.5 border-indigo-100",
            isRtl ? "mr-1.5 border-r-2 pr-4" : "ml-1.5 border-l-2 pl-4"
          )}
        >
          {subheadings.map((sub) => (
            <div key={sub.id} className="flex items-center gap-3">
              {readOnly ? (
                <ReadOnlyTitle text={sub.title} isRtl={isRtl} variant="subheading" />
              ) : (
                <OutlineTitleInput
                  key={`${sub.id}:${sub.title}`}
                  sessionId={sessionId}
                  id={sub.id}
                  title={sub.title}
                  isRtl={isRtl}
                  variant="subheading"
                  onLocked={onLocked}
                  onEdited={onEdited}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
