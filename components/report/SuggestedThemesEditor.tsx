"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, Loader2, Plus, ShieldAlert, Sparkles } from "lucide-react"
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

// Old cycles may return items missing `keywords` (generated under the previous
// {title, description} shape). Default to [] so nothing crashes on render.
function normalize(list: SuggestedTheme[]): SuggestedTheme[] {
  return list.map((t) => ({ title: t.title, keywords: t.keywords ?? [] }))
}

function serialize(list: SuggestedTheme[]) {
  return list.map((t) => `${t.title}¦${(t.keywords ?? []).join(",")}`).join("§")
}

/**
 * Editable + AI-refinable + selectable list of the cycle's `suggested_themes`
 * ({title, keywords[]} — the SAME shape as the initial themes). Mirrors the
 * Strategic Brief page's themes mechanics: manual edits auto-save (debounced
 * typing, immediate add/remove) via `save-brief-and-themes`; "Refine with AI"
 * calls `suggested-themes/refine` (already persisted server-side). The selection
 * checkbox drives which themes become the report's themes (owned by the parent).
 */
export function SuggestedThemesEditor({
  cycleId,
  themes,
  selected,
  onToggle,
  isRtl,
}: {
  cycleId: string
  themes: SuggestedTheme[]
  /** Titles currently selected. */
  selected: Set<string>
  onToggle: (title: string) => void
  isRtl?: boolean
}) {
  const qc = useQueryClient()
  const [list, setList] = useState<SuggestedTheme[]>(() => normalize(themes))
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [refineOpen, setRefineOpen] = useState(false)
  const [refining, setRefining] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Re-seed from the server when it changes (e.g. after refine/reload) and the
  // user has no unsaved edits.
  const [prevKey, setPrevKey] = useState(serialize(themes))
  const currentKey = serialize(themes)
  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
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
    setPrevKey(serialize(next)) // our own edit is the new baseline; don't reseed over it
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
    commit([...list, { title: "", keywords: [] }], true)
  }
  const removeTheme = (i: number) => commit(list.filter((_, idx) => idx !== i), true)

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
      setPrevKey(serialize(next))
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
            Edit or refine, then select to include · {list.length} of {MAX_THEMES}
          </span>
          <SaveIndicator state={saveState} />
        </div>
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
            selected={selected.has(theme.title)}
            onToggleSelect={() => onToggle(theme.title)}
            onTitleChange={(v) => updateTitle(i, v)}
            onAddKeyword={(kw) => addKeyword(i, kw)}
            onRemoveKeyword={(kwIdx) => removeKeyword(i, kwIdx)}
            onRemove={() => removeTheme(i)}
          />
        ))}
      </div>

      {refineOpen && (
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
