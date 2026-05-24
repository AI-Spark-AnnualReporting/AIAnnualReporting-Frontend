"use client"

import { CycleReportSection } from "@/types"
import { SECTION_MODES, SECTION_LAYERS } from "@/lib/constants"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { Sparkles, Upload, Settings, FileText, MousePointerClick } from "lucide-react"

// Shared header for every mode sub-component — title, layer chip, mode badge,
// and the section's content source.
function SectionHeader({ section }: { section: CycleReportSection }) {
  const mode = SECTION_MODES[section.mode]
  const layer = SECTION_LAYERS[section.layer]
  return (
    <div className="border-b px-6 py-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            layer?.color
          )}
        >
          {layer?.label ?? section.layer}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            mode?.color
          )}
        >
          {mode?.label ?? section.mode}
        </span>
        <span className="text-xs text-muted-foreground capitalize">
          {section.content_source}
        </span>
      </div>
      <h2 className="text-lg font-semibold leading-tight">{section.title}</h2>
    </div>
  )
}

// Read-only placeholder body shared by all three modes this stage.
function Placeholder({
  icon: Icon,
  message,
}: {
  icon: typeof Sparkles
  message: string
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      </div>
    </div>
  )
}

// Stage 7 replaces this body with the chat-and-preview workspace.
function GenerateSection({ section }: { section: CycleReportSection }) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <SectionHeader section={section} />
      <Placeholder
        icon={Sparkles}
        message="This section will be written by the narrative agent. Drafting becomes available once the report plan is built."
      />
    </div>
  )
}

// Stage 3 replaces this body with the upload-and-verify panel.
function AttachSection({ section }: { section: CycleReportSection }) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <SectionHeader section={section} />
      <Placeholder
        icon={Upload}
        message="This section is filled by uploading its source document. Upload becomes available next."
      />
    </div>
  )
}

// Stays a placeholder permanently — rendered automatically at report time.
function AutoSection({ section }: { section: CycleReportSection }) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <SectionHeader section={section} />
      <Placeholder
        icon={Settings}
        message="Generated automatically when the report is rendered — no input needed."
      />
    </div>
  )
}

// The architectural seam: switches on section.mode. Stages 3 & 7 swap two
// sub-component bodies without touching this switch.
export function SectionDetail({ section }: { section: CycleReportSection | null }) {
  if (!section) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={MousePointerClick}
          title="Select a section"
          description="Pick a section from the list to see its details."
        />
      </div>
    )
  }

  switch (section.mode) {
    case "generate":
      return <GenerateSection section={section} />
    case "attach":
      return <AttachSection section={section} />
    case "auto":
      return <AutoSection section={section} />
    default:
      return (
        <div className="flex flex-1 flex-col min-h-0">
          <SectionHeader section={section} />
          <Placeholder icon={FileText} message="Unknown section mode." />
        </div>
      )
  }
}
