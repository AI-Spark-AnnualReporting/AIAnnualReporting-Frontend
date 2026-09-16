import type { CycleReportSection, FeederMapEntry, SectionMode } from "@/types"

// Source edits the PM has made on the Sections step but not yet saved.
//
// Feeder and source-mode changes used to hit the server on every click: a dozen
// requests to configure one plan, each able to fail on its own. They are now
// collected here and written once, when the PM leaves the step. Two things fall
// out of that: a flaky connection has one moment to go wrong instead of twelve,
// and toggling "Upload document later" on and off again sends nothing at all —
// where before the first click destroyed that section's draft server-side.
export type PendingSourceChange = {
  feeders?: string[]
  mode?: SectionMode
}

/** section_code -> the unsaved change on it. */
export type PendingSources = Record<string, PendingSourceChange>

/**
 * The feeder map as the PM currently sees it: saved values with unsaved edits
 * laid over the top.
 *
 * Applied once, at the top of the step, so the section cards, the "needs a
 * source" counter and the department-coverage strip all read one already-merged
 * list and cannot disagree with each other.
 *
 * The feeder map wins over the section row for mode, because a saved mode
 * switch lands there first and the sections list can lag it.
 */
export function applyPending(
  feeders: FeederMapEntry[],
  sections: CycleReportSection[],
  pending: PendingSources,
): FeederMapEntry[] {
  if (Object.keys(pending).length === 0) return feeders

  const byCode = new Map(feeders.map((f) => [f.section_code, f]))
  for (const section of sections) {
    const change = pending[section.section_code]
    if (!change) continue
    const entry = byCode.get(section.section_code)
    byCode.set(section.section_code, {
      section_code: section.section_code,
      title: entry?.title ?? section.title,
      document_uploaded: entry?.document_uploaded ?? false,
      departments: change.feeders ?? entry?.departments ?? [],
      mode: change.mode ?? entry?.mode ?? section.mode,
    })
  }
  // Preserve the server's ordering; anything newly added lands at the end.
  const seen = new Set(feeders.map((f) => f.section_code))
  return [
    ...feeders.map((f) => byCode.get(f.section_code) ?? f),
    ...sections
      .filter((s) => pending[s.section_code] && !seen.has(s.section_code))
      .map((s) => byCode.get(s.section_code)!),
  ]
}

/**
 * Fold one edit into the pending set, dropping the entry entirely when it no
 * longer differs from what is saved — so a toggle-and-untoggle leaves nothing
 * behind to write, and the "unsaved changes" guard stays quiet.
 */
export function mergePending(
  pending: PendingSources,
  section: CycleReportSection,
  entry: FeederMapEntry | undefined,
  change: PendingSourceChange,
): PendingSources {
  const next: PendingSources = { ...pending }
  const merged = { ...next[section.section_code], ...change }

  const savedDepartments = entry?.departments ?? []
  const savedMode = entry?.mode ?? section.mode

  const feedersChanged =
    merged.feeders !== undefined && !sameCodes(merged.feeders, savedDepartments)
  const modeChanged = merged.mode !== undefined && merged.mode !== savedMode

  if (!feedersChanged && !modeChanged) {
    delete next[section.section_code]
    return next
  }

  next[section.section_code] = {
    ...(feedersChanged ? { feeders: merged.feeders } : {}),
    ...(modeChanged ? { mode: merged.mode } : {}),
  }
  return next
}

/** Order-insensitive compare — the picker rebuilds the list from a Set. */
function sameCodes(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedB = [...b].sort()
  return [...a].sort().every((code, i) => code === sortedB[i])
}

export function demo() {
  const section = { section_code: "s1", mode: "generate" } as CycleReportSection
  const entry = {
    section_code: "s1",
    title: "S1",
    departments: ["HR", "FIN"],
    mode: "generate" as SectionMode,
  }

  // Re-picking the same departments in a different order is not a change.
  console.assert(
    Object.keys(mergePending({}, section, entry, { feeders: ["FIN", "HR"] }))
      .length === 0,
    "reordering the same codes should leave nothing pending",
  )

  // A real change is kept.
  const one = mergePending({}, section, entry, { feeders: ["HR"] })
  console.assert(one.s1?.feeders?.length === 1, "a real feeder edit is pending")

  // Toggling to extract and back cancels out — nothing is sent, so no draft dies.
  const toExtract = mergePending({}, section, entry, { mode: "extract" })
  console.assert(toExtract.s1?.mode === "extract", "switch to extract is pending")
  const backAgain = mergePending(toExtract, section, entry, { mode: "generate" })
  console.assert(
    Object.keys(backAgain).length === 0,
    "switching back to the saved mode should clear the pending entry",
  )

  // Unsaved edits win over saved values when rendering.
  const merged = applyPending([entry], [section], one)
  console.assert(
    merged[0].departments.join() === "HR",
    "pending feeders override the saved ones",
  )
  console.assert(
    applyPending([entry], [section], {})[0].departments.length === 2,
    "with nothing pending the saved value shows",
  )
  console.assert(
    applyPending([entry], [section], toExtract)[0].mode === "extract",
    "a pending mode switch shows on the card before it is saved",
  )

  console.log("pendingSectionSources: all checks passed")
}
