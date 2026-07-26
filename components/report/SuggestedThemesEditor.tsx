"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, Loader2, Lock, Plus, ShieldAlert, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RefineAssistant } from "@/components/report/RefineAssistant"
import { ThemeChipCard } from "@/components/report/ThemeChipCard"
import { pmApi, type SuggestedTheme } from "@/lib/api/pm"
import { cn } from "@/lib/utils"

const MAX_THEMES = 8

const SUGGESTED_CHIPS = [
  "Add a governance theme",
  "Tighten the keywords",
  "Use fewer themes",
  "Add a digital theme",
]

// Old cycles may return items missing `keywords` (legacy shape) or `selected`
// (added later). Default keywords to [] and selected to true so nothing crashes
// and legacy themes render as checked.
function normalize(list: SuggestedTheme[]): SuggestedTheme[] {
  return list.map((t) => ({
    title: t.title,
    keywords: t.keywords ?? [],
    selected: t.selected ?? true,
  }))
}

function serialize(list: SuggestedTheme[]) {
  return list
    .map((t) => `${t.title}¦${(t.keywords ?? []).join(",")}¦${t.selected !== false}`)
    .join("§")
}

/**
 * Editable + AI-refinable + selectable list of the cycle's `suggested_themes`
 * ({title, keywords[], selected}). Mirrors the Strategic Brief page's themes
 * mechanics: manual edits auto-save (debounced typing, immediate add/remove) via
 * `save-brief-and-themes`; "Refine with AI" calls `suggested-themes/refine`
 * (already persisted server-side). The selection checkbox toggles `selected` and
 * persists immediately — the backend injects only checked themes into the prompt.
 */
export function SuggestedThemesEditor({
  cycleId,
  themes,
  isRtl,
  readOnly,
}: {
  cycleId: string
  themes: SuggestedTheme[]
  isRtl?: boolean
  /** Locked plan → view-only (no edit/refine/add/toggle). */
  readOnly?: boolean
}) {
  const qc = useQueryClient()
  const [list, setList] = useState<SuggestedTheme[]>(() => normalize(themes))
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [refineOpen, setRefineOpen] = useState(false)
  const [refining, setRefining] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed from the server only until the user starts editing. Every save
  // invalidates the cycle query, so reseeding after the first edit would let a
  // debounced save's refetch clobber in-progress typing (title "stuck" after a
  // keystroke). Once `touched`, local state is authoritative.
  const [touched, setTouched] = useState(false)
  const [seededKey, setSeededKey] = useState(serialize(themes))
  const incomingKey = serialize(themes)
  if (!touched && seededKey !== incomingKey) {
    setSeededKey(incomingKey)
    setList(normalize(themes))
  }

  const cancelPendingSave = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
  }
  useEffect(() => () => cancelPendingSave(), [])

  const runSave = async (next: SuggestedTheme[]) => {
    setSaveState("saving")
    try {
      await pmApi.saveBriefAndThemes(cycleId, { suggested_themes: next })
      setSaveState("saved")
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId] })
    } catch (err) {
      setSaveState("error")
      toast.error((err as { message?: string })?.message || "Couldn't save your changes.")
    }
  }
  const saveNow = (next: SuggestedTheme[]) => {
    cancelPendingSave()
    runSave(next)
  }
  const saveDebounced = (next: SuggestedTheme[]) => {
    setSaveState("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      runSave(next)
    }, 800)
  }

  const commit = (next: SuggestedTheme[], immediate: boolean) => {
    setList(next)
    setTouched(true) // local edits are authoritative — stop reseeding from the server
    if (immediate) saveNow(next)
    else saveDebounced(next)
  }

  const updateTitle = (i: number, value: string) =>
    commit(list.map((t, idx) => (idx === i ? { ...t, title: value } : t)), false)

  const addKeyword = (i: number, raw: string) => {
    const kw = raw.trim()
    if (!kw) return
    const existing = list[i].keywords ?? []
    if (existing.some((k) => k.toLowerCase() === kw.toLowerCase())) return
    commit(
      list.map((t, idx) => (idx === i ? { ...t, keywords: [...(t.keywords ?? []), kw] } : t)),
      true,
    )
  }
  const removeKeyword = (i: number, kwIdx: number) =>
    commit(
      list.map((t, idx) =>
        idx === i ? { ...t, keywords: (t.keywords ?? []).filter((_, k) => k !== kwIdx) } : t,
      ),
      true,
    )

  const addTheme = () => {
    if (list.length >= MAX_THEMES) return
    commit([...list, { title: "", keywords: [], selected: true }], true)
  }
  const removeTheme = (i: number) => commit(list.filter((_, idx) => idx !== i), true)

  // Toggle "select to include" — persists `selected` immediately.
  const toggleSelected = (i: number) =>
    commit(
      list.map((t, idx) => (idx === i ? { ...t, selected: t.selected === false } : t)),
      true,
    )

  const selectedCount = list.filter((t) => t.selected !== false).length

  const refineWith = async (instruction: string): Promise<boolean> => {
    if (refining) return false
    cancelPendingSave() // refine persists authoritatively — drop any stale save
    setRefining(true)
    try {
      const data = await pmApi.refineSuggestedThemes(cycleId, {
        suggested_themes: list,
        instruction,
      })
      const next = normalize(data.suggested_themes ?? [])
      setList(next)
      setSeededKey(serialize(next)) // refined set is authoritative; don't reseed over it
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId] }) // already saved
      return true
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't refine the themes.")
      return false
    } finally {
      setRefining(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested Themes
          </span>
          <span className="text-xs text-muted-foreground">
            {readOnly
              ? `${selectedCount} of ${list.length} selected`
              : `Edit or refine, then select to include · ${selectedCount} of ${list.length} selected`}
          </span>
          {!readOnly && <SaveIndicator state={saveState} />}
        </div>
        {readOnly ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            <Lock className="h-3 w-3" />
            Locked
          </span>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setRefineOpen((o) => !o)}
              className={cn(
                "bg-indigo-50 text-indigo-600 hover:bg-indigo-100",
                refineOpen && "bg-indigo-100 ring-1 ring-indigo-300",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> Refine with AI
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={addTheme}
              disabled={list.length >= MAX_THEMES}
            >
              <Plus className="h-3.5 w-3.5" /> Add theme
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">No themes were proposed.</p>
        )}
        {list.map((theme, i) => (
          <ThemeChipCard
            key={i}
            index={i}
            theme={theme}
            isRtl={isRtl}
            readOnly={readOnly}
            selected={theme.selected !== false}
            onToggleSelect={() => toggleSelected(i)}
            onTitleChange={(v) => updateTitle(i, v)}
            onAddKeyword={(kw) => addKeyword(i, kw)}
            onRemoveKeyword={(kwIdx) => removeKeyword(i, kwIdx)}
            onRemove={() => removeTheme(i)}
          />
        ))}
      </div>

      {!readOnly && refineOpen && (
        <RefineAssistant
          chips={SUGGESTED_CHIPS}
          loading={refining}
          onSubmit={refineWith}
          placeholder="e.g. add a governance theme, use fewer themes…"
        />
      )}
    </section>
  )
}

/* ── Save status indicator (mirrors the brief review page) ───────────────── */
function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    )
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
        <Check className="h-3.5 w-3.5" /> Saved
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
      <ShieldAlert className="h-3.5 w-3.5" /> Save failed
    </span>
  )
}
