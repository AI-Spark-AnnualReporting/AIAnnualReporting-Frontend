"use client"

/**
 * "Not on the site yet": report sections that are on no page, for example a
 * section added to the report after the sitemap was made. Each chip can be
 * dragged into the tree. Renders nothing when every section is placed.
 */

import { useDraggable } from "@dnd-kit/core"

import type { WebSection } from "@/lib/api/webSitemap"

import { SectionChip } from "./SitemapNodes"
import type { DragItem } from "./SitemapTree"

export function UnplacedTray({ sections }: { sections: WebSection[] }) {
  if (sections.length === 0) return null
  return (
    <div className="shrink-0 border-t border-amber-200 bg-amber-50/80 px-5 py-3">
      <p className="mb-2 text-xs font-semibold text-amber-900">
        Not on the site yet{" "}
        <span className="font-normal text-amber-800">
          · drag into a gap to make a page, or onto a page to add it there
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <DraggableChip key={section.section_code} section={section} />
        ))}
      </div>
    </div>
  )
}

function DraggableChip({ section }: { section: WebSection }) {
  const item: DragItem = { kind: "section", sectionCode: section.section_code, title: section.title }
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `section:${section.section_code}`,
    data: item,
  })
  return (
    <SectionChip
      ref={setNodeRef}
      title={section.title}
      dragging={isDragging}
      {...attributes}
      {...listeners}
    />
  )
}
