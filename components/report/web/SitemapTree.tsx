"use client"

/**
 * The sitemap drawn as a tree: Home at the top, the groups in a row under it,
 * and each group's pages hanging below it in a column.
 *
 * The connector lines are plain 1px boxes, not SVG. Every group column has the
 * same width, so the bar joining the groups is centred under Home without any
 * measuring: each column draws its own piece of the bar (the first from its
 * middle to the right, the last from the left to its middle, the rest edge to
 * edge), plus a short line down to its group box.
 *
 * Drag-and-drop targets (the DndContext itself lives in SitemapEditor):
 *   - a GAP between pages ("gap" data): drop to move the page there;
 *   - a PAGE box ("onto" data): drop to merge into that page.
 */

import { useDraggable, useDroppable } from "@dnd-kit/core"
import type { CSSProperties } from "react"

import type { WebSitemap, WebSitemapGroup, WebSitemapPage } from "@/lib/api/webSitemap"
import { cn } from "@/lib/utils"

import { GhostNode, GroupNode, HomeNode, PageNode } from "./SitemapNodes"

export type Selection =
  | { kind: "home" }
  | { kind: "group"; id: string }
  | { kind: "page"; id: string }
  | null

/** What is being dragged. */
export type DragItem =
  | { kind: "page"; pageId: string; title: string }
  | { kind: "section"; sectionCode: string; title: string }

/** Where it is dropped. */
export type DropTarget =
  | { kind: "gap"; groupId: string; index: number }
  | { kind: "onto"; pageId: string; title: string }

const LINE = "bg-slate-300"
// Each group column is this wide, so the bar between groups lines up under Home.
const COLUMN_WIDTH = "w-64"

interface SitemapTreeProps {
  sitemap: WebSitemap
  knownCodes: Set<string>
  selection: Selection
  dragging: DragItem | null
  zoom: number
  onSelect: (selection: Selection) => void
  onAddPage: (groupId: string) => void
  onAddGroup: () => void
}

export function SitemapTree({
  sitemap, knownCodes, selection, dragging, zoom, onSelect, onAddPage, onAddGroup,
}: SitemapTreeProps) {
  // `zoom` (not transform: scale) so the scroll area grows with the tree and
  // dnd-kit's measured boxes still match what is on screen.
  const zoomStyle: CSSProperties = { zoom }
  const columnCount = sitemap.groups.length + 1

  return (
    <div style={zoomStyle} className="inline-flex min-w-full flex-col items-center px-10 pb-16 pt-10">
      <HomeNode
        title={sitemap.home.title}
        selected={selection?.kind === "home"}
        onClick={() => onSelect({ kind: "home" })}
      />
      <div className={cn("h-6 w-px", LINE)} />

      <div className="flex items-start">
        {sitemap.groups.map((group, index) => (
          <GroupColumn
            key={group.id}
            group={group}
            isFirst={index === 0}
            isLast={false}
            knownCodes={knownCodes}
            selection={selection}
            dragging={dragging}
            onSelect={onSelect}
            onAddPage={onAddPage}
          />
        ))}
        <ColumnFrame isFirst={columnCount === 1} isLast dashed>
          <GhostNode label="Group" onClick={onAddGroup} className="h-11" />
        </ColumnFrame>
      </div>
    </div>
  )
}

interface ColumnFrameProps {
  isFirst: boolean
  isLast: boolean
  dashed?: boolean
  children: React.ReactNode
}

/** One column of the groups row, with its piece of the connecting bar. */
function ColumnFrame({ isFirst, isLast, dashed, children }: ColumnFrameProps) {
  const lineStyle = dashed ? "border-t border-dashed border-slate-300 bg-transparent" : LINE
  return (
    <div className={cn("relative shrink-0 px-4 pt-6", COLUMN_WIDTH)}>
      {!(isFirst && isLast) && (
        <span
          className={cn("absolute top-0 h-px", lineStyle)}
          style={{ left: isFirst ? "50%" : 0, right: isLast ? "50%" : 0 }}
        />
      )}
      <span
        className={cn(
          "absolute left-1/2 top-0 h-6 w-px",
          dashed ? "border-l border-dashed border-slate-300" : LINE,
        )}
      />
      {children}
    </div>
  )
}

interface GroupColumnProps {
  group: WebSitemapGroup
  isFirst: boolean
  isLast: boolean
  knownCodes: Set<string>
  selection: Selection
  dragging: DragItem | null
  onSelect: (selection: Selection) => void
  onAddPage: (groupId: string) => void
}

function GroupColumn({
  group, isFirst, isLast, knownCodes, selection, dragging, onSelect, onAddPage,
}: GroupColumnProps) {
  return (
    <ColumnFrame isFirst={isFirst} isLast={isLast}>
      <GroupNode
        group={group}
        selected={selection?.kind === "group" && selection.id === group.id}
        onClick={() => onSelect({ kind: "group", id: group.id })}
      />

      {/* The rail: from the group box down to the middle of the "+ Page"
          box, which is h-9 (36px), hence bottom 18px. */}
      <div className="relative ml-5 pl-5">
        <span className={cn("absolute left-0 top-0 w-px", LINE)} style={{ bottom: 18 }} />

        {group.pages.map((page, index) => (
          <div key={page.id}>
            <Gap groupId={group.id} index={index} active={!!dragging} />
            <Elbow>
              <DraggablePage
                page={page}
                selected={selection?.kind === "page" && selection.id === page.id}
                hasMissingSection={page.section_codes.some((code) => !knownCodes.has(code))}
                dragging={dragging}
                onSelect={() => onSelect({ kind: "page", id: page.id })}
              />
            </Elbow>
          </div>
        ))}

        <Gap groupId={group.id} index={group.pages.length} active={!!dragging} />
        <Elbow>
          <GhostNode label="Page" onClick={() => onAddPage(group.id)} />
        </Elbow>
      </div>
    </ColumnFrame>
  )
}

/** The short line from the rail to a box. */
function Elbow({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className={cn("absolute -left-5 top-1/2 h-px w-5", LINE)} />
      {children}
    </div>
  )
}

interface GapProps {
  groupId: string
  index: number
  active: boolean
}

/**
 * The space between two pages; while dragging, a drop line shows where a page
 * will land. Its height NEVER changes during a drag: dnd-kit measures the drop
 * zones when the drag starts, so any layout shift after that would put every
 * zone in the wrong place.
 */
function Gap({ groupId, index, active }: GapProps) {
  const target: DropTarget = { kind: "gap", groupId, index }
  const { setNodeRef, isOver } = useDroppable({ id: `gap:${groupId}:${index}`, data: target })
  return (
    <div ref={setNodeRef} className="relative h-4">
      {active && !isOver && (
        <span className="absolute inset-x-6 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-brand/25" />
      )}
      {isOver && (
        <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_0_3px_rgba(64,64,200,0.15)]" />
      )}
    </div>
  )
}

interface DraggablePageProps {
  page: WebSitemapPage
  selected: boolean
  hasMissingSection: boolean
  dragging: DragItem | null
  onSelect: () => void
}

/** A page box you can click, drag, and drop things onto. */
function DraggablePage({ page, selected, hasMissingSection, dragging, onSelect }: DraggablePageProps) {
  const item: DragItem = { kind: "page", pageId: page.id, title: page.title }
  const target: DropTarget = { kind: "onto", pageId: page.id, title: page.title }
  const draggable = useDraggable({ id: `page:${page.id}`, data: item })
  const droppable = useDroppable({ id: `onto:${page.id}`, data: target })

  const isSelf = dragging?.kind === "page" && dragging.pageId === page.id
  const mergeHint = droppable.isOver && dragging && !isSelf ? page.title || "Untitled page" : null

  function setRefs(node: HTMLButtonElement | null) {
    draggable.setNodeRef(node)
    droppable.setNodeRef(node)
  }

  return (
    <PageNode
      ref={setRefs}
      page={page}
      selected={selected}
      dragging={draggable.isDragging}
      mergeHint={mergeHint}
      hasMissingSection={hasMissingSection}
      onClick={onSelect}
      {...draggable.attributes}
      {...draggable.listeners}
    />
  )
}
