"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2, Lock, Plus, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { pmApi, type BriefTheme } from "@/lib/api/pm"
import { cn } from "@/lib/utils"

const MAX_THEMES = 8
const MIN_THEMES = 1

interface InitialThemesEditorProps {
  cycleId: string
  themes: BriefTheme[]
  /** When the plan is locked, themes are read-only — no edits, add, or save. */
  readOnly?: boolean
  /** Arabic cycles render theme titles right-to-left. */
  isRtl?: boolean
}

function serializeThemes(t: BriefTheme[]) {
  return t.map((x) => `${x.title}|${x.keywords.join(",")}`).join("¦")
}

/**
 * Editable list of the themes generated during the Strategic Brief flow
 * (`initial_themes_and_keywords.themes`). Mirrors ThemeEditor's UX (draft +
 * Save/Discard) but for `BriefTheme` (title + keyword chips) and persists via
 * `save-brief-and-themes` — the same store the brief step writes to.
 */
export function InitialThemesEditor({
  cycleId,
  themes,
  readOnly,
  isRtl,
}: InitialThemesEditorProps) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<BriefTheme[]>(themes)
  const [errors, setErrors] = useState<Record<number, string>>({})

  // Re-seed the draft when server themes change (e.g. edited on the brief step),
  // but only when the user has no unsaved edits.
  const [prevKey, setPrevKey] = useState(serializeThemes(themes))
  const currentKey = serializeThemes(themes)
  if (prevKey !== currentKey) {
    setPrevKey(currentKey)
    setDraft(themes)
    setErrors({})
  }

  const save = useMutation({
    mutationFn: (payload: BriefTheme[]) =>
      pmApi.saveBriefAndThemes(cycleId, { themes: payload }),
    onSuccess: () => {
      // Bust the dashboard cycle cache so the persisted themes flow back in.
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId] })
      toast.success("Initial themes saved.")
    },
    onError: (err: unknown) => {
      toast.error(
        (err as { message?: string })?.message || "Couldn't save the initial themes.",
      )
    },
  })

  if (readOnly) return <LockedInitialThemes themes={themes} isRtl={isRtl} />

  const dirty = serializeThemes(draft) !== currentKey

  const clearError = (i: number) =>
    setErrors((prev) => {
      if (!prev[i] && !prev[-1]) return prev
      const next = { ...prev }
      delete next[i]
      delete next[-1]
      return next
    })

  const updateTitle = (i: number, value: string) => {
    setDraft((prev) => prev.map((t, idx) => (idx === i ? { ...t, title: value } : t)))
    clearError(i)
  }

  const addKeyword = (i: number, raw: string) => {
    const kw = raw.trim()
    if (!kw) return
    setDraft((prev) =>
      prev.map((t, idx) => {
        if (idx !== i) return t
        if (t.keywords.some((k) => k.toLowerCase() === kw.toLowerCase())) return t
        return { ...t, keywords: [...t.keywords, kw] }
      }),
    )
  }

  const removeKeyword = (i: number, kwIdx: number) => {
    setDraft((prev) =>
      prev.map((t, idx) =>
        idx === i ? { ...t, keywords: t.keywords.filter((_, k) => k !== kwIdx) } : t,
      ),
    )
  }

  const addTheme = () => {
    if (draft.length >= MAX_THEMES) return
    setDraft((prev) => [...prev, { title: "", keywords: [] }])
  }

  const removeTheme = (i: number) => {
    setDraft((prev) => prev.filter((_, idx) => idx !== i))
    clearError(i)
  }

  const discard = () => {
    setDraft(themes)
    setErrors({})
  }

  const validate = (): boolean => {
    const next: Record<number, string> = {}
    if (draft.length < MIN_THEMES) {
      next[-1] = `At least ${MIN_THEMES} theme is required.`
    }
    draft.forEach((t, i) => {
      if (!t.title.trim()) next[i] = "Title is required."
    })
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSave = () => {
    if (!validate()) return
    const clean: BriefTheme[] = draft.map((t) => ({
      title: t.title.trim(),
      keywords: t.keywords.map((k) => k.trim()).filter(Boolean),
    }))
    save.mutate(clean)
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Initial Themes
          </span>
          <span className="text-xs text-muted-foreground">
            From your approved strategic brief · {draft.length} of {MAX_THEMES}
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
              disabled={save.isPending}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={save.isPending}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              Save themes
            </Button>
          </div>
        )}
      </div>

      {errors[-1] && <p className="text-xs text-destructive">{errors[-1]}</p>}

      {draft.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
          <Sparkles className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No initial themes yet. Add one to carry over from the brief.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {draft.map((theme, i) => (
            <BriefThemeCard
              key={i}
              index={i}
              theme={theme}
              error={errors[i]}
              isRtl={isRtl}
              onTitleChange={(v) => updateTitle(i, v)}
              onAddKeyword={(kw) => addKeyword(i, kw)}
              onRemoveKeyword={(kwIdx) => removeKeyword(i, kwIdx)}
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

/* ── Editable card: inline title + keyword chips ─────────────────────────── */
function BriefThemeCard({
  index,
  theme,
  error,
  isRtl,
  onTitleChange,
  onAddKeyword,
  onRemoveKeyword,
  onRemove,
}: {
  index: number
  theme: BriefTheme
  error?: string
  isRtl?: boolean
  onTitleChange: (value: string) => void
  onAddKeyword: (keyword: string) => void
  onRemoveKeyword: (keywordIndex: number) => void
  onRemove: () => void
}) {
  const [kwDraft, setKwDraft] = useState("")
  const commitKw = () => {
    if (kwDraft.trim()) onAddKeyword(kwDraft)
    setKwDraft("")
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card p-3 pr-9",
        error && "border-destructive/60",
      )}
    >
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove theme"
        className="absolute right-3 top-3 text-muted-foreground/50 transition-colors hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={theme.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Theme title"
            dir={isRtl ? "rtl" : "ltr"}
            className={cn(
              "w-full border-0 bg-transparent p-0 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/60",
              isRtl && "text-right",
            )}
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {theme.keywords.map((kw, k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => onRemoveKeyword(k)}
                  aria-label={`Remove ${kw}`}
                  className="text-indigo-400 transition-colors hover:text-indigo-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={kwDraft}
              onChange={(e) => setKwDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  commitKw()
                } else if (
                  e.key === "Backspace" &&
                  kwDraft === "" &&
                  theme.keywords.length > 0
                ) {
                  onRemoveKeyword(theme.keywords.length - 1)
                }
              }}
              onBlur={commitKw}
              placeholder="Add keyword…"
              dir={isRtl ? "rtl" : "ltr"}
              className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}

/* ── Read-only presentation once the plan is locked ──────────────────────── */
function LockedInitialThemes({
  themes,
  isRtl,
}: {
  themes: BriefTheme[]
  isRtl?: boolean
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Initial Themes
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
          <Lock className="h-3 w-3" />
          Locked
        </span>
      </div>

      {themes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center">
          <Sparkles className="h-5 w-5 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No initial themes.</p>
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
                    "min-w-0 flex-1 space-y-2",
                    isRtl ? "text-right" : "text-left",
                  )}
                >
                  <h4 className="text-sm font-semibold leading-snug text-slate-900">
                    {theme.title || (
                      <span className="italic text-slate-400">Untitled theme</span>
                    )}
                  </h4>
                  {theme.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {theme.keywords.map((kw, k) => (
                        <span
                          key={k}
                          className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50/60 px-2.5 py-1 text-xs font-medium text-indigo-700"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
