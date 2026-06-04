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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useState } from "react"
import { AlertCircle, GripVertical, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  useRemoveOptional,
  useReorderSections,
} from "@/hooks/useReportBuilder"
import { SECTION_LAYERS, SECTION_MODES } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { CycleReportSection, FeederMapEntry } from "@/types"
import { FeederPicker, type FeederDepartment } from "./FeederPicker"

interface PlanSectionListProps {
  cycleId: string
  sections: CycleReportSection[] // already display-ordered by the page
  feeders: FeederMapEntry[]
  departments: FeederDepartment[]
}

export function PlanSectionList({
  cycleId,
  sections,
  feeders,
  departments,
}: PlanSectionListProps) {
  const reorder = useReorderSections(cycleId)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const feederMap = new Map(feeders.map((f) => [f.section_code, f.departments]))
  const deptByCode = new Map(
    departments.map((d) => [d.department_code, d.department_name]),
  )
  const ids = sections.map((s) => s.section_code)

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(ids, oldIndex, newIndex)
    reorder.mutate({ orderedSectionCodes: next })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sections
        </span>
        <span className="text-xs text-muted-foreground">
          {sections.length} total
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="rounded-lg border bg-card divide-y">
            {sections.map((s) => (
              <SortableRow
                key={s.section_code}
                cycleId={cycleId}
                section={s}
                feederCodes={feederMap.get(s.section_code) ?? []}
                departments={departments}
                deptByCode={deptByCode}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  )
}

function SortableRow({
  cycleId,
  section,
  feederCodes,
  departments,
  deptByCode,
}: {
  cycleId: string
  section: CycleReportSection
  feederCodes: string[]
  departments: FeederDepartment[]
  deptByCode: Map<string, string>
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.section_code })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const mode = SECTION_MODES[section.mode]
  const layer = SECTION_LAYERS[section.layer]

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-3 px-3 py-3 bg-card",
        isDragging && "opacity-60 shadow-md z-10 relative",
      )}
    >
      <button
        type="button"
        className="mt-1 shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-sm font-medium leading-tight">{section.title}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
              layer?.color,
            )}
          >
            {layer?.label ?? section.layer}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
              mode?.color,
            )}
          >
            {mode?.label ?? section.mode}
          </span>
        </div>
        <FeederArea
          cycleId={cycleId}
          section={section}
          feederCodes={feederCodes}
          departments={departments}
          deptByCode={deptByCode}
        />
      </div>

      <RemoveSection cycleId={cycleId} section={section} />
    </li>
  )
}

function FeederArea({
  cycleId,
  section,
  feederCodes,
  departments,
  deptByCode,
}: {
  cycleId: string
  section: CycleReportSection
  feederCodes: string[]
  departments: FeederDepartment[]
  deptByCode: Map<string, string>
}) {
  if (section.mode === "attach") {
    return (
      <p className="text-xs text-muted-foreground italic">Uploaded separately</p>
    )
  }
  if (section.mode === "auto") {
    return <p className="text-xs text-muted-foreground italic">System-generated</p>
  }
  if (section.mode === "extract") {
    return (
      <p className="text-xs text-muted-foreground italic">
        Uploaded &amp; auto-extracted
      </p>
    )
  }

  // generate mode
  const isEmpty = feederCodes.length === 0
  return (
    <FeederPicker
      cycleId={cycleId}
      sectionCode={section.section_code}
      departments={departments}
      selected={feederCodes}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors text-left",
          isEmpty
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
            : "border-input bg-background hover:bg-accent",
        )}
      >
        {isEmpty ? (
          <>
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="font-medium">Needs a source</span>
          </>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {feederCodes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground"
              >
                {deptByCode.get(code) ?? code}
              </span>
            ))}
            <span className="text-muted-foreground">edit</span>
          </span>
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
      // No warning needed — optional sections are meant to come and go.
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
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
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
