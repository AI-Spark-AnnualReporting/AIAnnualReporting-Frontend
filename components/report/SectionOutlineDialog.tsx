"use client"

import { useState } from "react"
import { Loader2, Lock, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SECTION_LAYERS, SECTION_MODES } from "@/lib/constants"
import { subsectionsOf, type Placement } from "@/lib/sectionOutline"
import { cn } from "@/lib/utils"
import { useAddSubsection } from "@/hooks/useReportBuilder"
import type { CycleReportSection } from "@/types"

// Whether a section can take a new subsection at all.
//
// A subsection is a heading in the body, so a section needs a body to put one
// in: `attach` embeds a file whole and `auto` is rendered by the report itself.
// A locked section is refused by the server either way — refine says "Unlock
// the section before refining" and the content saves 409 — so the button is
// disabled rather than offered and then rejected.
function canAddTo(section: CycleReportSection, reportLocked: boolean): boolean {
  if (reportLocked) return false
  if (section.status === "locked") return false
  return section.mode !== "attach" && section.mode !== "auto"
}

// Refine rewrites the body from the department material; the other modes get
// the heading spliced in for the PM to write under. Worth saying out loud in
// the form, because the two produce very different results.
function writesItself(section: CycleReportSection): boolean {
  return section.mode === "generate" || section.mode === "analyze"
}

function AddSubsectionForm({
  cycleId,
  section,
  onDone,
  isRtl,
}: {
  cycleId: string
  section: CycleReportSection
  onDone: () => void
  isRtl?: boolean
}) {
  const add = useAddSubsection(cycleId)
  const existing = subsectionsOf(section.content)
  const [name, setName] = useState("")
  // "after the last one" is the same as the bottom, so the default is the end
  // of the list either way — the common case is appending.
  const [after, setAfter] = useState<string>("__bottom__")

  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0 && !add.isPending

  const submit = async () => {
    if (!canSubmit) return
    const placement: Placement =
      after === "__top__"
        ? { at: "top" }
        : after === "__bottom__"
          ? { at: "bottom" }
          : { at: "after", title: after }
    try {
      await add.mutateAsync({ section, name: trimmed, placement })
      onDone()
    } catch {
      // The underlying mutation toasted the reason; stay open so the typed
      // name survives a retry.
    }
  }

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="mt-2 space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
          if (e.key === "Escape") onDone()
        }}
        placeholder="Subsection name"
        className="h-8 bg-white text-sm"
        autoFocus
      />

      {existing.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span className="shrink-0">Place it</span>
          <select
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            className="min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
          >
            <option value="__top__">at the top</option>
            {existing.map((s, i) => (
              <option key={`${s.line}-${i}`} value={s.title}>
                after “{s.title}”
              </option>
            ))}
            <option value="__bottom__">at the bottom</option>
          </select>
        </label>
      )}

      <p className="text-[11px] text-muted-foreground">
        {writesItself(section)
          ? "The AI writes it from this section's department content and leaves the other subsections as they are."
          : "Adds the heading — you write the text under it in the editor."}
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} disabled={add.isPending}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          {add.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          Add
        </Button>
      </div>
    </div>
  )
}

/**
 * The whole report at a glance: every section with the subsections inside it,
 * and a way to add one.
 *
 * The rail shows the same tree, but it is a navigation strip a few hundred
 * pixels wide. This is where the PM reads the shape of the report and changes
 * it.
 */
export function SectionOutlineDialog({
  cycleId,
  sections,
  open,
  onOpenChange,
  onSelect,
  reportLocked = false,
  isRtl,
}: {
  cycleId: string
  sections: CycleReportSection[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Jump to a section in the builder and close. */
  onSelect: (code: string) => void
  reportLocked?: boolean
  isRtl?: boolean
}) {
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const ordered = [...sections].sort((a, b) => a.display_order - b.display_order)

  const close = (next: boolean) => {
    if (!next) setAddingTo(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report outline</DialogTitle>
          <DialogDescription>
            Every section in this report and the subsections inside it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {ordered.map((section, i) => {
            const subs = subsectionsOf(section.content)
            const mode = SECTION_MODES[section.mode]
            const prevLayer = i > 0 ? ordered[i - 1].layer : null
            const addable = canAddTo(section, reportLocked)

            return (
              <div key={section.section_code}>
                {section.layer !== prevLayer && (
                  <div className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {SECTION_LAYERS[section.layer]?.label ?? section.layer}
                  </div>
                )}

                <div
                  dir={isRtl ? "rtl" : "ltr"}
                  className="flex items-center gap-2 rounded-lg px-1 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(section.section_code)
                      close(false)
                    }}
                    className="min-w-0 flex-1 truncate text-start text-sm font-semibold text-slate-900 hover:text-indigo-700"
                  >
                    {section.title}
                  </button>

                  {section.status === "locked" && (
                    <Lock className="h-3 w-3 shrink-0 text-slate-400" />
                  )}
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                      mode?.color ?? "bg-slate-100 text-slate-600",
                    )}
                  >
                    {mode?.label ?? section.mode}
                  </span>

                  {addable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs text-indigo-600 hover:text-indigo-700"
                      onClick={() =>
                        setAddingTo(
                          addingTo === section.section_code
                            ? null
                            : section.section_code,
                        )
                      }
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      subsection
                    </Button>
                  )}
                </div>

                {subs.length > 0 && (
                  <ul
                    dir={isRtl ? "rtl" : "ltr"}
                    className={cn(
                      "space-y-0.5 border-slate-100",
                      isRtl ? "me-3 border-e pe-3" : "ms-3 border-s ps-3",
                    )}
                  >
                    {subs.map((sub, j) => (
                      <li
                        key={`${sub.line}-${j}`}
                        className="truncate py-0.5 text-xs text-slate-600"
                      >
                        {sub.title}
                      </li>
                    ))}
                  </ul>
                )}

                {addingTo === section.section_code && (
                  <AddSubsectionForm
                    cycleId={cycleId}
                    section={section}
                    onDone={() => setAddingTo(null)}
                    isRtl={isRtl}
                  />
                )}
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
