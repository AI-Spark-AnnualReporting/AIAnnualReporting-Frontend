import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { pmApi } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"
import type {
  ContentLanguage,
  CycleReportSection,
  FinalReport,
  PlanResponse,
  ReportTheme,
  SectionMode,
} from "@/types"

// Whether a cycle is ready to enter the Report Builder.
export function useBuildReadiness(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.BUILD_READINESS(cycleId),
    queryFn: () => pmApi.buildReadiness(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
  })
}

// Resolved report sections for a cycle (PM-access).
export function usePMCycleSections(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId),
    queryFn: () => pmApi.getCycleSections(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
  })
}

// The company's previous manual-section content, used to pre-fill the
// human-voice sections in the builder. Company-scoped — companyId comes from
// the authenticated user (/auth/me). Read-only. Cached longer than the cycle
// queries — prior-cycle content doesn't change during a build session.
//
// contentLanguage is the language of the report being created (the cycle's
// content_language). The backend filters previous content to that language, so
// an English report is never pre-filled with Arabic content (and vice versa).
// It's part of the cache key so English/Arabic suggestions cache separately.
export function usePreviousManualSections(
  companyId: string | null | undefined,
  contentLanguage?: ContentLanguage,
) {
  return useQuery({
    queryKey: QUERY_KEYS.PM_COMPANY_PREV_MANUAL(companyId ?? "", contentLanguage),
    queryFn: () =>
      pmApi.previousManualSections(companyId as string, contentLanguage),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  })
}

// Shared error shape. apiClient normalizes errors to { message, status, ... } but
// keep the legacy .response.data.detail path too in case anything bypasses the
// interceptor. Whatever we surface, coerce to string — toast.error/React crash
// if handed an object child.
type MutationError = {
  message?: unknown
  response?: { data?: { detail?: unknown } }
}

// Patch the affected section into the list cache for INSTANT feedback, then
// invalidate so the list refetches the authoritative GET /sections shape.
//
// The optimistic patch alone is fragile: it only replaces a row when the
// mutation response's `section_code` matches a list row. If the two responses
// disagree on shape (a backend inconsistency seen elsewhere in this file), the
// map matches nothing, the cache is unchanged, and the UI doesn't update until
// a manual refresh refetches /sections. The follow-up invalidate makes the UI
// self-heal regardless: it refetches the same data a manual refresh would —
// which GET /sections now returns complete (attachment/verified/locked_at
// included), so it no longer risks snapping the panel back to a field-less
// version. Readiness is invalidated too (independent query).
function patchSectionInList(
  qc: ReturnType<typeof useQueryClient>,
  cycleId: string,
  updated: CycleReportSection,
) {
  qc.setQueryData<CycleReportSection[]>(
    QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId),
    (old) => {
      if (!old) return old
      // MERGE, don't replace: some mutation responses omit routing-critical
      // fields (e.g. saveManualContent doesn't echo `content_source`). A full
      // replace would set those to undefined and mis-route the panel — a manual
      // narrative section would flip to the upload dropzone because
      // `content_source !== "narrative"`. Spreading the response over the
      // existing row keeps omitted fields and applies only what changed.
      return old.map((s) =>
        s.section_code === updated.section_code ? { ...s, ...updated } : s,
      )
    },
  )
  qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId) })
  qc.invalidateQueries({ queryKey: QUERY_KEYS.BUILD_READINESS(cycleId) })
  // Lock/unlock changes the assemble gate (locked count, can_assemble,
  // unlocked_sections). The Assemble button reads this independent query, so
  // refetch it too — otherwise its "(locked/total)" count stays stale until a
  // manual refresh.
  qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_ASSEMBLY_READINESS(cycleId) })
}

function readError(err: MutationError, fallback: string): string {
  const candidate = err?.message ?? err?.response?.data?.detail
  if (typeof candidate === "string" && candidate.trim()) return candidate
  return fallback
}

// Attach-mode mutations. Each returns the updated section, which we splice into
// the list query cache so the right panel and left list update immediately.

export function useAttachUpload(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionCode, file }: { sectionCode: string; file: File }) =>
      pmApi.attachUpload(cycleId, sectionCode, file),
    onSuccess: (section) => {
      patchSectionInList(qc, cycleId, section)
      toast.success("Document uploaded")
    },
    onError: (err: MutationError) => toast.error(readError(err, "Upload failed")),
  })
}

// Extract-mode: persist the PM's edits to the AI-extracted content. The
// document stays attached; only the body changes.
export function useSetExtractContent(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      sectionCode,
      content,
    }: {
      sectionCode: string
      content: string
    }) => pmApi.setExtractContent(cycleId, sectionCode, content),
    onSuccess: (section) => {
      patchSectionInList(qc, cycleId, section)
      toast.success("Content saved")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to save content")),
  })
}

export function useLockSection(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionCode }: { sectionCode: string }) =>
      pmApi.lockSection(cycleId, sectionCode),
    onSuccess: (section) => {
      patchSectionInList(qc, cycleId, section)
      toast.success("Section locked")
    },
    onError: (err: MutationError) => toast.error(readError(err, "Failed to lock section")),
  })
}

export function useUnlockSection(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionCode }: { sectionCode: string }) =>
      pmApi.unlockSection(cycleId, sectionCode),
    onSuccess: (section) => {
      patchSectionInList(qc, cycleId, section)
      toast.success("Section unlocked")
    },
    onError: (err: MutationError) => toast.error(readError(err, "Failed to unlock section")),
  })
}

export function useRemoveAttachment(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionCode }: { sectionCode: string }) =>
      pmApi.removeAttachment(cycleId, sectionCode),
    onSuccess: (section) => {
      patchSectionInList(qc, cycleId, section)
      toast.success("Document removed")
    },
    onError: (err: MutationError) => toast.error(readError(err, "Failed to remove document")),
  })
}

// Stage 7a — generate narrative content for a single AI-written section.
export function useGenerateSection(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionCode }: { sectionCode: string }) =>
      pmApi.generateSection(cycleId, sectionCode),
    onSuccess: (section) => {
      patchSectionInList(qc, cycleId, section)
      toast.success("Section generated")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Generation failed")),
  })
}

// Manual-content sections (`ai_allowed = false`). PM types the body directly
// — no AI, no feeder. Save overwrites the section's content.
export function useSaveManualContent(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      sectionCode,
      content,
    }: {
      sectionCode: string
      content: string
    }) => pmApi.saveManualContent(cycleId, sectionCode, content),
    onSuccess: (section) => {
      patchSectionInList(qc, cycleId, section)
      toast.success("Section saved")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to save section")),
  })
}

// Analyze-mode: (re-)trigger the analyze agent for a section.
export function useRunAnalysis(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionCode }: { sectionCode: string }) =>
      pmApi.runAnalysis(cycleId, sectionCode),
    onSuccess: (section) => {
      patchSectionInList(qc, cycleId, section)
      toast.success("Analysis triggered")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to trigger analysis")),
  })
}

// Analyze-mode: override or clear the AI findings. Pass null to clear.
export function useSetAnalyzeContent(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      sectionCode,
      content,
    }: {
      sectionCode: string
      content: string | null
    }) => pmApi.setAnalyzeContent(cycleId, sectionCode, content),
    onSuccess: (section) => {
      patchSectionInList(qc, cycleId, section)
      toast.success("Content saved")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to save content")),
  })
}

// Stage 7b — refine an existing draft with a natural-language instruction.
// Silent on success — refines happen many times in a session; the preview swap
// is the visible feedback. Errors still toast.
export function useRefineSection(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      sectionCode,
      instruction,
    }: {
      sectionCode: string
      instruction: string
    }) => pmApi.refineSection(cycleId, sectionCode, instruction),
    onSuccess: (section) => {
      patchSectionInList(qc, cycleId, section)
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Refinement failed")),
  })
}

// ───── Stage 8 — Assemble & Final Report ─────────────────────────────

export function useAssemblyReadiness(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PM_ASSEMBLY_READINESS(cycleId),
    queryFn: () => pmApi.assemblyReadiness(cycleId),
    enabled: !!cycleId,
    staleTime: 0, // reflects live lock progress
  })
}

export function useFinalReport(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PM_FINAL_REPORT(cycleId),
    queryFn: () => pmApi.getFinalReport(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
    retry: false, // 404 = "not assembled yet" — drive empty state from it
  })
}

export function useAssembleReport(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ refresh = false }: { refresh?: boolean } = {}) =>
      pmApi.assembleReport(cycleId, refresh),
    onSuccess: (report) => {
      qc.setQueryData<FinalReport>(QUERY_KEYS.PM_FINAL_REPORT(cycleId), report)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_ASSEMBLY_READINESS(cycleId) })
      toast.success("Report assembled")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to assemble report")),
  })
}

// Stage 9a — render the assembled report to a downloadable file (docx now,
// pdf in 9b). On success, triggers a browser save via anchor-click; pmApi's
// renderReport already decodes blob error bodies so toast messages are
// meaningful.
export function useRenderReport(cycleId: string) {
  return useMutation({
    mutationFn: ({ format }: { format: "docx" | "pdf" }) =>
      pmApi.renderReport(cycleId, format),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement("a")
      a.href = url
      a.download = filename
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      // Revoke on the next tick so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 0)
      toast.success("Document downloaded")
    },
    onError: (err: Error) =>
      toast.error(err?.message || "Couldn't generate the document"),
  })
}

// ───── Stage 6 — Plan Review ─────────────────────────────────────────

export function usePlan(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PM_CYCLE_PLAN(cycleId),
    queryFn: () => pmApi.getPlan(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
    retry: false, // 404 / 422 are meaningful — drive empty/error states from them
  })
}

export function useAvailableOptional(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PM_AVAILABLE_OPTIONAL(cycleId),
    queryFn: () => pmApi.getAvailableOptional(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
  })
}

// Cache helpers — write back the server's authoritative shape so the UI
// reflects changes immediately even if a follow-up GET would lag.
//
// Some backend endpoints (e.g. setFeeders, in practice) may respond with
// `{ success, section }` rather than the full `PlanResponse` we expect.
// Patching the cache with that would erase `feeders`/`themes` and crash any
// reader. Validate the shape first; if it doesn't look like a plan, invalidate
// the query so the UI refetches the canonical data instead.
function looksLikePlan(value: unknown): value is PlanResponse {
  if (!value || typeof value !== "object") return false
  const v = value as Partial<PlanResponse>
  return Array.isArray(v.feeders) && Array.isArray(v.themes)
}

function setPlanCache(
  qc: ReturnType<typeof useQueryClient>,
  cycleId: string,
  plan: PlanResponse,
) {
  if (looksLikePlan(plan)) {
    qc.setQueryData<PlanResponse>(QUERY_KEYS.PM_CYCLE_PLAN(cycleId), plan)
  } else {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_PLAN(cycleId) })
  }
}

function setSectionsCache(
  qc: ReturnType<typeof useQueryClient>,
  cycleId: string,
  sections: CycleReportSection[],
) {
  qc.setQueryData<CycleReportSection[]>(
    QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId),
    sections,
  )
}

// Generate or regenerate the plan. Backend runs two LLM passes.
export function useBuildPlan(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ refresh = false }: { refresh?: boolean } = {}) =>
      pmApi.buildPlan(cycleId, refresh),
    onSuccess: (plan) => {
      setPlanCache(qc, cycleId, plan)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_AVAILABLE_OPTIONAL(cycleId) })
      toast.success("Plan generated")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to generate plan")),
  })
}

export function useUpdatePlan(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { headline?: string | null; themes?: ReportTheme[] }) =>
      pmApi.updatePlan(cycleId, payload),
    onSuccess: (plan) => {
      setPlanCache(qc, cycleId, plan)
      toast.success("Plan saved")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to save plan")),
  })
}

// One-way blueprint lock. On success the returned plan carries
// `sections_locked: true`; writing it to the cache flips every gated control
// (sources, reorder, optional add/remove, themes, regenerate) to read-only.
export function useLockPlan(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => pmApi.lockPlan(cycleId),
    onSuccess: (plan) => {
      setPlanCache(qc, cycleId, plan)
      toast.success("Sections locked")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to lock sections")),
  })
}

// Switch a section's source type via the dedicated endpoint. The response
// section's `mode` is authoritative; patch it into both the sections cache and
// the plan's feeder map immediately so the badge updates without waiting for a
// plan refetch (the feeder map's mode takes priority in the tile display logic).
export function useSetSourceMode(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      sectionCode,
      mode,
    }: {
      sectionCode: string
      mode: SectionMode
    }) => pmApi.setSourceMode(cycleId, sectionCode, mode),
    onSuccess: (section) => {
      // Patch sections cache immediately.
      qc.setQueryData<CycleReportSection[]>(
        QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId),
        (old) =>
          old?.map((s) =>
            s.section_code === section.section_code ? section : s,
          ) ?? old,
      )
      // Also patch the feeder map entry's mode so the badge reflects the new
      // mode instantly — the tile uses entry?.mode ?? s.mode, so a stale feeder
      // entry would show the old badge until the plan refetch completes.
      qc.setQueryData<PlanResponse>(
        QUERY_KEYS.PM_CYCLE_PLAN(cycleId),
        (old) => {
          if (!old) return old
          const hasEntry = old.feeders.some(
            (f) => f.section_code === section.section_code,
          )
          const updatedFeeders = hasEntry
            ? old.feeders.map((f) =>
                f.section_code === section.section_code
                  ? { ...f, mode: section.mode }
                  : f,
              )
            : [
                ...old.feeders,
                {
                  section_code: section.section_code,
                  title: section.title,
                  departments: [],
                  mode: section.mode,
                },
              ]
          return { ...old, feeders: updatedFeeders }
        },
      )
      // Full refetch to pick up any other feeder map changes (cleared feeders etc.).
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_PLAN(cycleId) })
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to switch source type")),
  })
}

export function useSetFeeders(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      sectionCode,
      departmentCodes,
    }: {
      sectionCode: string
      departmentCodes: string[]
    }) => pmApi.setFeeders(cycleId, sectionCode, departmentCodes),
    // Optimistically update the plan cache so the pill and counter update the
    // moment the popover closes — independent of what the backend returns
    // (some setFeeders responses are shape-inconsistent in practice).
    onMutate: async ({ sectionCode, departmentCodes }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEYS.PM_CYCLE_PLAN(cycleId) })
      const previous = qc.getQueryData<PlanResponse>(
        QUERY_KEYS.PM_CYCLE_PLAN(cycleId),
      )
      if (previous && Array.isArray(previous.feeders)) {
        const hasEntry = previous.feeders.some(
          (f) => f.section_code === sectionCode,
        )
        const updatedFeeders = hasEntry
          ? previous.feeders.map((f) =>
              f.section_code === sectionCode
                ? { ...f, departments: departmentCodes }
                : f,
            )
          : [
              ...previous.feeders,
              {
                section_code: sectionCode,
                // Resolve the title from the sections cache if possible.
                title:
                  qc
                    .getQueryData<CycleReportSection[]>(
                      QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId),
                    )
                    ?.find((s) => s.section_code === sectionCode)?.title ??
                  sectionCode,
                departments: departmentCodes,
              },
            ]
        qc.setQueryData<PlanResponse>(QUERY_KEYS.PM_CYCLE_PLAN(cycleId), {
          ...previous,
          feeders: updatedFeeders,
        })
      }
      return { previous }
    },
    onSuccess: (plan) => {
      // Backend persists and returns the post-update plan now that the field
      // rename has shipped (was `department_codes` on the server, silently
      // dropping our `departments` key). Cache write is safe again; matches
      // the optimistic patch on the happy path.
      setPlanCache(qc, cycleId, plan)
      toast.success("Feeders updated")
    },
    onError: (err: MutationError, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(QUERY_KEYS.PM_CYCLE_PLAN(cycleId), context.previous)
      }
      toast.error(readError(err, "Failed to update feeders"))
    },
  })
}

// The reorder UI hides system sections (e.g. the auto "toc" Table of Contents),
// so the codes it produces are only a SUBSET of the cycle's sections. The backend
// requires the payload to contain EVERY section code exactly once, so fill any
// omitted sections back in, pinning each to its current position (by display_order).
// Returns the complete ordered list of section codes.
function completeReorder(
  qc: ReturnType<typeof useQueryClient>,
  cycleId: string,
  partial: string[],
): string[] {
  const all = qc.getQueryData<CycleReportSection[]>(
    QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId),
  )
  if (!all || all.length === 0) return partial
  const partialSet = new Set(partial)
  const queue = [...partial]
  const sortedAll = [...all].sort((a, b) => a.display_order - b.display_order)
  // Walk the cycle's full section list in display order: keep each omitted
  // (hidden) section pinned to its slot, and fill the remaining slots with the
  // caller's reordered visible sequence.
  return sortedAll.map((s) =>
    partialSet.has(s.section_code) ? (queue.shift() as string) : s.section_code,
  )
}

export function useReorderSections(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderedSectionCodes }: { orderedSectionCodes: string[] }) =>
      pmApi.reorderSections(
        cycleId,
        completeReorder(qc, cycleId, orderedSectionCodes),
      ),
    // Drop must feel instant — reorder the cache immediately, then let the
    // server response (or an error rollback) reconcile.
    onMutate: async ({ orderedSectionCodes }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId) })
      const previous = qc.getQueryData<CycleReportSection[]>(
        QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId),
      )
      if (previous) {
        // Use the COMPLETE order (incl. hidden sections) so the optimistic
        // update doesn't drop toc/cover from the cache.
        const fullOrder = completeReorder(qc, cycleId, orderedSectionCodes)
        const byCode = new Map(previous.map((s) => [s.section_code, s]))
        const reordered = fullOrder
          .map((code, i) => {
            const s = byCode.get(code)
            return s ? { ...s, display_order: i } : null
          })
          .filter((s): s is CycleReportSection => s !== null)
        qc.setQueryData(QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId), reordered)
      }
      return { previous }
    },
    onSuccess: (sections) => {
      setSectionsCache(qc, cycleId, sections)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_PLAN(cycleId) })
    },
    onError: (err: MutationError, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(
          QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId),
          context.previous,
        )
      }
      toast.error(readError(err, "Failed to reorder"))
    },
  })
}

export function useAddOptional(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionCode }: { sectionCode: string }) =>
      pmApi.addOptionalSection(cycleId, sectionCode),
    onSuccess: (sections) => {
      setSectionsCache(qc, cycleId, sections)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_AVAILABLE_OPTIONAL(cycleId) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_PLAN(cycleId) })
      toast.success("Section added")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to add section")),
  })
}

export function useRemoveOptional(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      sectionCode,
      force = false,
    }: {
      sectionCode: string
      force?: boolean
    }) => pmApi.removeOptionalSection(cycleId, sectionCode, force),
    onSuccess: (sections) => {
      setSectionsCache(qc, cycleId, sections)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_AVAILABLE_OPTIONAL(cycleId) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_PLAN(cycleId) })
      toast.success("Section removed")
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Failed to remove section")),
  })
}
