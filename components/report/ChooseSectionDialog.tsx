"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { pmApi } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"
import { buildFixHref, type ChooseTarget } from "@/lib/validation-fixes"
import { cn } from "@/lib/utils"

/* "Which section should cover this?" - for a brief ask or concept message the
 * validation found no section covering. The AI suggests up to three sections;
 * the PM picks one (or any other) and lands on it in the Build page with the
 * instruction ready. Nothing is changed until they click Refine there. */
export function ChooseSectionDialog({
  cycleId,
  target,
  sections,
  onClose,
}: {
  cycleId: string
  /** What needs a home, and the refine instruction to carry. Null = closed. */
  target: ChooseTarget | null
  /** Every section the PM may pick by hand, in report order. */
  sections: { section_code: string; title: string }[]
  onClose: () => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [picked, setPicked] = useState<string>("")

  const suggestions = useQuery({
    queryKey: ["validation-suggest-sections", cycleId, target?.text],
    queryFn: () => pmApi.suggestSections(cycleId, target!.text),
    enabled: !!target,
    staleTime: Infinity,
    retry: false,
  })
  const suggested = suggestions.data ?? []

  // The best match is chosen until the PM picks otherwise.
  const choice = picked || suggested[0]?.section_code || ""

  const close = () => {
    setPicked("")
    onClose()
  }

  const [opening, setOpening] = useState(false)

  // Saves the choice first so the validation page can show this row Fixed
  // once the section is edited. A failed save only loses that label, so the
  // PM is taken to the section either way.
  const open = async () => {
    if (!target || !choice) return
    setOpening(true)
    try {
      await pmApi.chooseSection(cycleId, target.text, choice)
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PM_FINAL_REPORT(cycleId) })
    } catch {
      // Ignored on purpose: see above.
    }
    router.push(buildFixHref(cycleId, choice, target.instruction, target.manual))
  }

  return (
    <Dialog open={!!target} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Which section should cover this?</DialogTitle>
          <DialogDescription className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {target?.text}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs text-slate-500">
            Suggested from what each section is about. You choose.
          </legend>

          {suggestions.isLoading && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Finding the best sections…
            </p>
          )}
          {!suggestions.isLoading && suggested.length === 0 && (
            <p className="text-sm text-slate-500">
              No suggestion this time. Pick a section below.
            </p>
          )}

          {suggested.map((s, i) => (
            <label
              key={s.section_code}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3",
                choice === s.section_code ? "border-indigo-400 bg-indigo-50/50" : "border-slate-200",
              )}
            >
              <input
                type="radio"
                name="fix-section"
                className="mt-1"
                checked={choice === s.section_code}
                onChange={() => setPicked(s.section_code)}
              />
              <span className="min-w-0">
                <span className="text-sm font-semibold text-[#1A1D2E]">{s.title}</span>
                {i === 0 && (
                  <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                    Best match
                  </span>
                )}
                {s.reason && <span className="mt-0.5 block text-xs text-slate-500">{s.reason}</span>}
              </span>
            </label>
          ))}

          <label className="mt-3 flex flex-col gap-1.5 text-sm text-slate-600">
            Or pick any section
            <select
              value={suggested.some((s) => s.section_code === choice) ? "" : choice}
              onChange={(e) => setPicked(e.target.value)}
              // Locked until the suggestions arrive: a pick made meanwhile was
              // hard to tell apart from the best match that then appeared.
              disabled={suggestions.isLoading}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">All sections…</option>
              {sections.map((s) => (
                <option key={s.section_code} value={s.section_code}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={open} disabled={!choice || opening}>
            {opening && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Open section with fix
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
