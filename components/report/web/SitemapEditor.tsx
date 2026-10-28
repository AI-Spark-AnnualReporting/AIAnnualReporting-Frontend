"use client"

/**
 * The sitemap editor: a tree of boxes (SitemapTree), a side panel for the
 * clicked box (SitemapPanel), and a tray of sections not on the site yet
 * (UnplacedTray).
 *
 * This component owns three pieces of screen state: which box is selected,
 * the zoom level, and what is being dragged. The sitemap itself belongs to
 * WebShell; every change goes back through `onChange`.
 *
 * Drag-and-drop needs one DndContext around BOTH the tree and the tray, since
 * a tray chip is dropped into the tree — that is why it lives here.
 */

import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, type Modifier,
} from "@dnd-kit/core"
import { Minus, MousePointerClick, Move, Plus, Combine } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import type { WebSection, WebSitemap } from "@/lib/api/webSitemap"
import { cn } from "@/lib/utils"
import {
  addGroup, addPage, addSectionAsPage, addSectionToPage, mergePage, movePageTo,
  sectionsNotOnSite,
} from "@/lib/webSitemapEdits"

import { PageNode, SectionChip } from "./SitemapNodes"
import { SitemapPanel } from "./SitemapPanel"
import { SitemapTree, type DragItem, type DropTarget, type Selection } from "./SitemapTree"
import { UnplacedTray } from "./UnplacedTray"

/**
 * Puts the floating copy just below-right of the cursor instead of where the
 * box was grabbed, so it never covers the box under the cursor (and that
 * box's "Merge into" label).
 */
const trailCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!activatorEvent || !draggingNodeRect || !("clientX" in activatorEvent)) return transform
  const pointer = activatorEvent as PointerEvent
  return {
    ...transform,
    x: transform.x + pointer.clientX - draggingNodeRect.left + 14,
    y: transform.y + pointer.clientY - draggingNodeRect.top + 14,
  }
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1

interface EditorProps {
  sitemap: WebSitemap
  sections: WebSection[]
  onChange: (next: WebSitemap) => void
}

export function SitemapEditor({ sitemap, sections, onChange }: EditorProps) {
  const [selection, setSelection] = useState<Selection>(null)
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState<DragItem | null>(null)

  // A drag only starts after 6px of movement, so a plain click still opens
  // the panel (same idea as PlanSectionGrid's 4px).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const titles = new Map<string, string>()
  for (const section of sections) titles.set(section.section_code, section.title)
  const knownCodes = new Set(titles.keys())
  const unplaced = sectionsNotOnSite(sitemap, sections)
  const pageCount = sitemap.groups.reduce((total, group) => total + group.pages.length, 0)

  // Esc closes the panel.
  useEffect(() => {
    if (!selection) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelection(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [selection])

  function handleAddPage(groupId: string) {
    const next = addPage(sitemap, groupId, "New page")
    onChange(next)
    const group = next.groups.find((g) => g.id === groupId)
    const added = group?.pages[group.pages.length - 1]
    if (added) setSelection({ kind: "page", id: added.id })
  }

  function handleAddGroup() {
    const next = addGroup(sitemap, "New group")
    onChange(next)
    const added = next.groups[next.groups.length - 1]
    setSelection({ kind: "group", id: added.id })
  }

  function handleDragStart(event: DragStartEvent) {
    setDragging((event.active.data.current as DragItem | undefined) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null)
    const item = event.active.data.current as DragItem | undefined
    const target = event.over?.data.current as DropTarget | undefined
    if (!item || !target) return
    onChange(applyDrop(sitemap, item, target))
    if (item.kind === "page" && target.kind === "onto" && target.pageId !== item.pageId) {
      setSelection({ kind: "page", id: target.pageId })
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="relative flex h-full min-h-0">
        <div className="flex min-w-0 flex-1 flex-col">
          <Toolbar
            zoom={zoom}
            pageCount={pageCount}
            groupCount={sitemap.groups.length}
            onZoom={setZoom}
          />
          <div
            className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] bg-[length:20px_20px]"
            onClick={(event) => {
              // A click on the empty canvas (anywhere but a box) closes the panel.
              const target = event.target as HTMLElement
              if (!target.closest("button")) setSelection(null)
            }}
          >
            <SitemapTree
              sitemap={sitemap}
              knownCodes={knownCodes}
              selection={selection}
              dragging={dragging}
              zoom={zoom}
              onSelect={setSelection}
              onAddPage={handleAddPage}
              onAddGroup={handleAddGroup}
            />
          </div>
          <UnplacedTray sections={unplaced} />
        </div>

        {/* Always mounted so it can slide: 0 wide when closed. On a narrow
            screen it floats over the tree instead of squeezing it. */}
        <aside
          className={cn(
            "shrink-0 overflow-hidden border-slate-200 bg-white transition-[width] duration-200 ease-out",
            "max-[1100px]:absolute max-[1100px]:inset-y-0 max-[1100px]:right-0 max-[1100px]:z-20 max-[1100px]:shadow-2xl",
            selection ? "w-[340px] border-l" : "w-0",
          )}
          aria-hidden={!selection}
        >
          <div className="h-full w-[340px]">
            <SitemapPanel
              sitemap={sitemap}
              selection={selection}
              titles={titles}
              onChange={onChange}
              onSelect={setSelection}
              onAddPage={handleAddPage}
            />
          </div>
        </aside>
      </div>

      <DragOverlay dropAnimation={null} modifiers={[trailCursor]}>
        {dragging?.kind === "page" && (
          <div className="w-[170px]">
            <PageNode
              overlay
              page={findPageForOverlay(sitemap, dragging.pageId)}
            />
          </div>
        )}
        {dragging?.kind === "section" && <SectionChip overlay title={dragging.title} />}
      </DragOverlay>
    </DndContext>
  )
}

/** The sitemap after dropping `item` on `target`. */
function applyDrop(sitemap: WebSitemap, item: DragItem, target: DropTarget): WebSitemap {
  if (item.kind === "page" && target.kind === "gap") {
    return movePageTo(sitemap, item.pageId, target.groupId, target.index)
  }
  if (item.kind === "page" && target.kind === "onto") {
    return mergePage(sitemap, item.pageId, target.pageId)
  }
  if (item.kind === "section" && target.kind === "gap") {
    return addSectionAsPage(sitemap, item.sectionCode, item.title, target.groupId, target.index)
  }
  if (item.kind === "section" && target.kind === "onto") {
    return addSectionToPage(sitemap, item.sectionCode, target.pageId)
  }
  return sitemap
}

/** The page being dragged, for the floating copy under the pointer. */
function findPageForOverlay(sitemap: WebSitemap, pageId: string) {
  for (const group of sitemap.groups) {
    const page = group.pages.find((p) => p.id === pageId)
    if (page) return page
  }
  return { id: pageId, title: "", section_codes: [], hidden: false }
}

interface ToolbarProps {
  zoom: number
  pageCount: number
  groupCount: number
  onZoom: (zoom: number) => void
}

function Toolbar({ zoom, pageCount, groupCount, onZoom }: ToolbarProps) {
  function step(direction: -1 | 1) {
    const next = Math.round((zoom + direction * ZOOM_STEP) * 10) / 10
    onZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)))
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b bg-white px-5 py-2 text-xs text-slate-500">
      <span className="flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Click a box to edit</span>
      <span className="flex items-center gap-1.5"><Move className="h-3.5 w-3.5" /> Drag pages to move</span>
      <span className="flex items-center gap-1.5"><Combine className="h-3.5 w-3.5" /> Drop on a page to merge</span>
      <span className="ml-auto text-slate-400">{groupCount} groups · {pageCount} pages</span>
      <div className="flex items-center rounded-md border">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Zoom out"
          disabled={zoom <= ZOOM_MIN} onClick={() => step(-1)}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <button type="button" className="w-12 text-center tabular-nums hover:text-slate-800"
          title="Reset zoom" onClick={() => onZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Zoom in"
          disabled={zoom >= ZOOM_MAX} onClick={() => step(1)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
