"use client"

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useState } from "react"
import { AlertCircle, CheckCircle2, GripVertical, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  useRemoveOptional,
  useReorderSections,
  useSetSourceMode,
} from "@/hooks/useReportBuilder"
import { SECTION_LAYERS, SECTION_MODES } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { CycleReportSection, FeederMapEntry } from "@/types"
import { FeederPicker, type FeederDepartment } from "./FeederPicker"

interface PlanSectionGridProps {
  cycleId: string
  sections: CycleReportSection[]
  feeders: FeederMapEntry[]
  departments: FeederDepartment[]
  readOnly?: boolean
  /** Arabic cycles render section titles right-to-left. */
  isRtl?: boolean
}

export function PlanSectionGrid({
  cycleId,
  sections,
  feeders,
  departments,
  readOnly,
  isRtl,
}: PlanSectionGridProps) {
  const reorder = useReorderSections(cycleId)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Index the feeder map once — it carries departments, the section's mode, and
  // whether a document has been uploaded. The feeder map's `mode` is the
  // authority (the sections list can lag a mode switch).
  const feederByCode = new Map(feeders.map((f) => [f.section_code, f]))
  const deptByCode = new Map(
    departments.map((d) => [d.department_code, d.department_name]),
  )
  const ids = sections.map((s) => s.section_code)

  const onDragEnd = (event: DragEndEvent) => {
    if (readOnly) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(ids, oldIndex, newIndex)
    reorder.mutate({ orderedSectionCodes: next })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sections.map((s, i) => {
            const entry = feederByCode.get(s.section_code)
            const effectiveMode = entry?.mode ?? s.mode
            const isExtract = effectiveMode === "extract"
            const isAnalyze = effectiveMode === "analyze"
            return (
              <SectionTile
                key={s.section_code}
                index={i}
                cycleId={cycleId}
                section={s}
                feederCodes={entry?.departments ?? []}
                documentUploaded={entry?.document_uploaded ?? false}
                isExtract={isExtract}
                isAnalyze={isAnalyze}
                departments={departments}
                deptByCode={deptByCode}
                readOnly={readOnly}
                isRtl={isRtl}
              />
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SectionTile({
  index,
  cycleId,
  section,
  feederCodes,
  documentUploaded,
  isExtract,
  isAnalyze,
  departments,
  deptByCode,
  readOnly,
  isRtl,
}: {
  index: number
  cycleId: string
  section: CycleReportSection
  feederCodes: string[]
  documentUploaded: boolean
  isExtract: boolean
  isAnalyze: boolean
  departments: FeederDepartment[]
  deptByCode: Map<string, string>
  readOnly?: boolean
  isRtl?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.section_code, disabled: readOnly })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // The feeder map's mode wins (the sections list can lag a mode switch).
  const effectiveMode = isExtract ? "extract" : isAnalyze ? "analyze" : section.mode
  const mode = SECTION_MODES[effectiveMode]
  const layer = SECTION_LAYERS[section.layer]
  // Generate and analyze sections both require department feeders as their source.
  const needsSource =
    !isExtract &&
    (isAnalyze || section.mode === "generate") &&
    section.ai_allowed &&
    feederCodes.length === 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all",
        "hover:shadow-md",
        needsSource && "border-amber-200",
        isDragging && "z-10 opacity-60 shadow-lg ring-2 ring-indigo-300",
      )}
    >
      {needsSource && (
        <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-amber-400" />
      )}
      <div className="flex items-start gap-3">
        {!readOnly && (
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-600 active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <span className="mt-0.5 inline-flex h-6 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-semibold tabular-nums text-slate-500">
          {String(index + 1).padStart(2, "0")}
        </span>

        <div className="min-w-0 flex-1 space-y-2.5">
          <h3
            dir={isRtl ? "rtl" : "ltr"}
            className={cn(
              "text-sm font-semibold leading-snug text-slate-900",
              isRtl ? "text-right" : "text-left",
            )}
          >
            {section.title}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                layer?.color,
              )}
            >
              {layer?.label ?? section.layer}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                mode?.color ?? "bg-slate-100 text-slate-600",
              )}
            >
              {mode?.label ?? section.mode}
            </span>
            {!section.ai_allowed && !isExtract && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                Manual
              </span>
            )}
          </div>
          <FeederArea
            cycleId={cycleId}
            section={section}
            feederCodes={feederCodes}
            documentUploaded={documentUploaded}
            isExtract={isExtract}
            isAnalyze={isAnalyze}
            departments={departments}
            deptByCode={deptByCode}
            readOnly={readOnly}
          />
        </div>

        {!readOnly && <RemoveSection cycleId={cycleId} section={section} />}
      </div>
    </div>
  )
}

function FeederArea({
  cycleId,
  section,
  feederCodes,
  documentUploaded,
  isExtract,
  isAnalyze,
  departments,
  deptByCode,
  readOnly,
}: {
  cycleId: string
  section: CycleReportSection
  feederCodes: string[]
  documentUploaded: boolean
  isExtract: boolean
  isAnalyze: boolean
  departments: FeederDepartment[]
  deptByCode: Map<string, string>
  readOnly?: boolean
}) {
  // Manual sections (PM writes/uploads directly) — no sources to assign.
  if (!section.ai_allowed && !isExtract && !isAnalyze) {
    return (
      <p className="text-xs text-muted-foreground italic">
        {section.content_source === "narrative"
          ? "Manual — written by the PM"
          : "Manual — file uploaded by the PM"}
      </p>
    )
  }
  if (!isExtract && !isAnalyze && section.mode === "attach") {
    return <p className="text-xs text-muted-foreground italic">Uploaded separately</p>
  }
  if (!isExtract && !isAnalyze && section.mode === "auto") {
    return <p className="text-xs text-muted-foreground italic">System-generated</p>
  }

  // Generate, extract, and analyze sections share one source picker.
  // The mode toggles switch between these three — extract is document-based,
  // analyze and generate are department-based.
  return (
    <SourcesFeederArea
      cycleId={cycleId}
      section={section}
      feederCodes={feederCodes}
      documentUploaded={documentUploaded}
      isExtract={isExtract}
      isAnalyze={isAnalyze}
      departments={departments}
      deptByCode={deptByCode}
      readOnly={readOnly}
    />
  )
}

// One dropdown holds all three sources: department feeders (checkboxes), an
// "Upload document later" toggle (→ extract mode), and an "Analyze mode" toggle
// (→ analyze mode, keeps department feeders). Modes are mutually exclusive.
function SourcesFeederArea({
  cycleId,
  section,
  feederCodes,
  documentUploaded,
  isExtract,
  isAnalyze,
  departments,
  deptByCode,
  readOnly,
}: {
  cycleId: string
  section: CycleReportSection
  feederCodes: string[]
  documentUploaded: boolean
  isExtract: boolean
  isAnalyze: boolean
  departments: FeederDepartment[]
  deptByCode: Map<string, string>
  readOnly?: boolean
}) {
  const setSourceMode = useSetSourceMode(cycleId)
  const hasDoc = documentUploaded || !!section.attachment
  const hasDepts = feederCodes.length > 0

  // Generate and analyze need a department source; extract is sourced by document.
  const showAmber = !isExtract && !hasDepts

  const deptPills = feederCodes.map((code) => (
    <span
      key={code}
      className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground"
    >
      {deptByCode.get(code) ?? code}
    </span>
  ))

  const docChip = isExtract ? (
    <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
      {hasDoc ? (
        <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
      ) : (
        <Upload className="h-3 w-3" />
      )}
      {hasDoc ? "Document" : "Document later"}
    </span>
  ) : null

  const analyzeChip = isAnalyze ? (
    <span className="inline-flex items-center gap-1 rounded-sm bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-900/50 dark:text-indigo-300">
      Analyze
    </span>
  ) : null

  // Read-only (locked plan) — summarize the chosen sources, no picker.
  if (readOnly) {
    return (
      <div className="text-xs">
        {hasDepts || isExtract ? (
          <span className="flex flex-wrap items-center gap-1">
            {deptPills}
            {docChip}
            {analyzeChip}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" />
            <span>No source</span>
          </span>
        )}
      </div>
    )
  }

  return (
    <FeederPicker
      cycleId={cycleId}
      sectionCode={section.section_code}
      departments={departments}
      selected={feederCodes}
      // Analyze sections: departments only — no source-mode switcher.
      // Generate sections: show "Upload document later" to switch to extract.
      // Extract sections: "Upload document later" is checked (toggle back to generate).
      documentOption={
        isAnalyze
          ? undefined
          : {
              checked: isExtract,
              onChange: (next) =>
                setSourceMode.mutate({
                  sectionCode: section.section_code,
                  mode: next ? "extract" : "generate",
                }),
            }
      }
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors text-left",
          showAmber
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
            : "border-input bg-background hover:bg-accent",
        )}
      >
        {hasDepts || isExtract ? (
          <span className="flex flex-wrap items-center gap-1">
            {deptPills}
            {docChip}
            {analyzeChip}
            <span className="text-muted-foreground">edit</span>
          </span>
        ) : (
          <>
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="font-medium">Needs a source</span>
          </>
        )}
      </button>
    </FeederPicker>
  )
}

function RemoveSection({
  cycleId,
  section,
}: {
  cycleId: string
  section: CycleReportSection
}) {
  const remove = useRemoveOptional(cycleId)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isOptional = section.layer === "optional"
  const layerLabel = SECTION_LAYERS[section.layer]?.label ?? section.layer

  const onClick = () => {
    if (isOptional) {
      remove.mutate({ sectionCode: section.section_code })
    } else {
      setConfirmOpen(true)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
        onClick={onClick}
        disabled={remove.isPending}
        title={
          isOptional
            ? "Remove section"
            : `Remove ${layerLabel} section (requires confirmation)`
        }
      >
        <X className="h-3.5 w-3.5" />
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove this required section?"
        description={`${section.title} is normally required (${layerLabel}). Removing it may make the report non-compliant. You can add it back later if you change your mind.`}
        confirmLabel="Remove anyway"
        variant="destructive"
        isLoading={remove.isPending}
        onConfirm={async () => {
          await remove.mutateAsync({
            sectionCode: section.section_code,
            force: true,
          })
          setConfirmOpen(false)
        }}
      />
    </>
  )
}
