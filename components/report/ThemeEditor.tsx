"use client"

import { useState } from "react"
import { Loader2, Lock, Plus, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useUpdatePlan } from "@/hooks/useReportBuilder"
import type { ReportTheme } from "@/types"
import { cn } from "@/lib/utils"

const MAX_THEMES = 8
const MIN_THEMES = 1

interface ThemeEditorProps {
  cycleId: string
  themes: ReportTheme[]
  /** When the plan is locked, themes are read-only — no edits, add, or save. */
  readOnly?: boolean
  /** Arabic cycles render theme titles/descriptions right-to-left. */
  isRtl?: boolean
}

function themesEqual(a: ReportTheme[], b: ReportTheme[]) {
  if (a.length !== b.length) return false
  return a.every(
    (t, i) => t.title === b[i].title && t.description === b[i].description,
  )
}

export function ThemeEditor({ cycleId, themes, readOnly, isRtl }: ThemeEditorProps) {
  const [draft, setDraft] = useState<ReportTheme[]>(themes)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const update = useUpdatePlan(cycleId)

  // Re-seed draft when server themes change (regenerate, etc.) — but only when
  // not in the middle of editing (i.e. the draft matches the previous server).
  const [prevThemesKey, setPrevThemesKey] = useState(serializeThemes(themes))
  const currentKey = serializeThemes(themes)
  if (prevThemesKey !== currentKey) {
    setPrevThemesKey(currentKey)
    // Only reseed if user has no unsaved edits (draft mirrors what we last saw).
    setDraft(themes)
    setErrors({})
  }

  // Locked plan → present themes as polished read-only cards, not dull
  // disabled form fields.
  if (readOnly) return <LockedThemes themes={themes} isRtl={isRtl} />

  const dirty = !themesEqual(draft, themes)

  const updateTheme = (i: number, patch: Partial<ReportTheme>) => {
    setDraft((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
    setErrors((prev) => {
      if (!prev[i]) return prev
      const next = { ...prev }
      delete next[i]
      return next
    })
  }

  const addTheme = () => {
    if (draft.length >= MAX_THEMES) return
    setDraft((prev) => [...prev, { title: "", description: "" }])
  }

  const removeTheme = (i: number) => {
    setDraft((prev) => prev.filter((_, idx) => idx !== i))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[i]
      return next
    })
  }

  const discard = () => {
    setDraft(themes)
    setErrors({})
  }

  const validate = (): boolean => {
    const next: Record<number, string> = {}
    if (draft.length < MIN_THEMES) {
      // attached to last index if any, otherwise -1 as a global error
      next[-1] = `At least ${MIN_THEMES} theme is required.`
    }
    draft.forEach((t, i) => {
      if (!t.title.trim()) next[i] = "Title is required."
      else if (!t.description.trim()) next[i] = "Description is required."
    })
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = () => {
    if (!validate()) return
    const clean: ReportTheme[] = draft.map((t) => ({
      title: t.title.trim(),
      description: t.description.trim(),
    }))
    update.mutate({ themes: clean })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Themes
          </span>
          <span className="text-xs text-muted-foreground">
            {draft.length} of {MAX_THEMES}
          </span>
        </div>
        {dirty && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Unsaved changes
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={discard}
              disabled={update.isPending}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={update.isPending}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {update.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              Save themes
            </Button>
          </div>
        )}
      </div>

      {errors[-1] && (
        <p className="text-xs text-destructive">{errors[-1]}</p>
      )}

      {draft.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
          <Sparkles className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No themes yet. Add one to anchor the report&apos;s narrative.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {draft.map((theme, i) => (
            <ThemeCard
              key={i}
              index={i}
              theme={theme}
              error={errors[i]}
              isRtl={isRtl}
              onChange={(patch) => updateTheme(i, patch)}
              onRemove={() => removeTheme(i)}
            />
          ))}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={addTheme}
        disabled={draft.length >= MAX_THEMES}
        className="w-full sm:w-auto"
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add theme
      </Button>
    </section>
  )
}

function ThemeCard({
  index,
  theme,
  error,
  isRtl,
  onChange,
  onRemove,
}: {
  index: number
  theme: ReportTheme
  error?: string
  isRtl?: boolean
  onChange: (patch: Partial<ReportTheme>) => void
  onRemove: () => void
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 space-y-2",
        error && "border-destructive/60",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {index + 1}
        </span>
        <Input
          value={theme.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Theme title"
          dir={isRtl ? "rtl" : "ltr"}
          className={cn("font-medium", isRtl && "text-right")}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          title="Remove theme"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Textarea
        value={theme.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="What this theme is about — a sentence or two"
        rows={2}
        dir={isRtl ? "rtl" : "ltr"}
        className={cn("text-sm", isRtl && "text-right")}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// Read-only presentation shown once the plan is locked. The narrative is final,
// so render each theme as a clean, fully-readable card instead of a disabled
// input/textarea pair.
function LockedThemes({ themes, isRtl }: { themes: ReportTheme[]; isRtl?: boolean }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Themes
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
          <Lock className="h-3 w-3" />
          Locked
        </span>
      </div>

      {themes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center">
          <Sparkles className="h-5 w-5 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No themes.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {themes.map((theme, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-600">
                  {i + 1}
                </span>
                <div
                  dir={isRtl ? "rtl" : "ltr"}
                  className={cn(
                    "min-w-0 flex-1 space-y-1",
                    isRtl ? "text-right" : "text-left",
                  )}
                >
                  <h4 className="text-sm font-semibold leading-snug text-slate-900">
                    {theme.title || (
                      <span className="italic text-slate-400">
                        Untitled theme
                      </span>
                    )}
                  </h4>
                  <p className="text-xs leading-relaxed text-slate-500">
                    {theme.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function serializeThemes(t: ReportTheme[]) {
  return t.map((x) => `${x.title}${x.description}`).join("")
}
