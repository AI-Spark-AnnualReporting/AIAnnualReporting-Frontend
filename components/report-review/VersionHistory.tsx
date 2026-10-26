"use client"

import { useState } from "react"
import { ArrowLeft, ChevronRight, Download, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn, formatDateTime } from "@/lib/utils"
import type { DiffParagraph, DiffPart, SectionDiff, VersionSummary } from "@/lib/api/reportReview"
import { useCompareVersions, useDownloadVersionPdf } from "@/hooks/useReportReview"

const STATUS_LABEL: Record<VersionSummary["status"], string> = {
  draft: "Draft",
  shared: "With the client",
  changes_requested: "Changes requested",
  approved: "Approved by client",
}

const STATUS_PILL: Record<VersionSummary["status"], string> = {
  draft: "bg-slate-100 text-slate-700",
  shared: "bg-amber-50 text-amber-800",
  changes_requested: "bg-orange-50 text-orange-800",
  approved: "bg-green-50 text-green-800",
}

/**
 * Every kept version of the report (the last 3). Click one to see what
 * changed in it since the version before it: green words added, red removed.
 */
export function VersionHistory({
  cycleId,
  versions,
  open,
  onOpenChange,
  arabic = false,
}: {
  cycleId: string
  /** Newest first. */
  versions: VersionSummary[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The Arabic translation's versions: shown right to left. */
  arabic?: boolean
}) {
  const [selectedNo, setSelectedNo] = useState<number | null>(null)
  const selected = versions.find((version) => version.version_no === selectedNo) ?? null

  /** Closes the dialog, back on the list next time it opens. */
  const close = (next: boolean) => {
    if (!next) setSelectedNo(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      {/* A column, not one scrolling box: the title, Back and PDF stay put
          and only the list or the changes below them scroll. */}
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        {selected ? (
          <VersionChanges
            cycleId={cycleId}
            version={selected}
            arabic={arabic}
            onBack={() => setSelectedNo(null)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{arabic ? "Arabic version history" : "Version history"}</DialogTitle>
              <DialogDescription>
                The last 3 versions are kept. Click a version to see what changed in it.
              </DialogDescription>
            </DialogHeader>
            <div className="-mx-6 min-h-0 flex-1 space-y-2 overflow-y-auto px-6">
              {versions.map((version) => (
                <VersionRow
                  key={version.version_no}
                  version={version}
                  onOpen={() => setSelectedNo(version.version_no)}
                />
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** One version in the list. The whole row opens its changes. */
function VersionRow({ version, onOpen }: { version: VersionSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/40"
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Version {version.version_no}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_PILL[version.status])}>
            {STATUS_LABEL[version.status]}
          </span>
          {version.added_words !== null && version.deleted_words !== null && (
            <span className="text-xs font-semibold">
              <span className="text-green-700">+{version.added_words} words</span>
              {" · "}
              <span className="text-red-700">−{version.deleted_words} words</span>
            </span>
          )}
        </span>
        <span className="block text-xs text-muted-foreground">
          {version.shared_to_email
            ? `Sent to ${version.shared_to_email}${version.shared_at ? ` on ${formatDateTime(version.shared_at)}` : ""}`
            : version.assembled_at
              ? `Made ${formatDateTime(version.assembled_at)} · not sent yet`
              : "Not sent yet"}
          {version.viewed_at ? ` · opened ${formatDateTime(version.viewed_at)}` : ""}
          {version.decided_at ? ` · answered ${formatDateTime(version.decided_at)}` : ""}
        </span>
        {(version.decision_note || version.comments.length > 0) && (
          <span className="block space-y-1 pt-1">
            <span className="block text-[11px] font-bold tracking-wide text-muted-foreground">CLIENT&apos;S COMMENTS</span>
            {version.decision_note && (
              <span className="block whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">{version.decision_note}</span>
            )}
            {version.comments.map((comment) => (
              <span key={comment.id} className="block whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">
                {comment.body}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
        {version.has_previous ? "See changes" : "View"}
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

/** What changed in one version since the version before it. */
function VersionChanges({
  cycleId,
  version,
  arabic,
  onBack,
}: {
  cycleId: string
  version: VersionSummary
  arabic: boolean
  onBack: () => void
}) {
  const pdf = useDownloadVersionPdf(cycleId, arabic)
  const previousNo = version.has_previous ? version.version_no - 1 : null
  const compare = useCompareVersions(
    cycleId,
    previousNo,
    previousNo === null ? null : version.version_no,
    arabic,
  )
  const changed = compare.data?.sections.filter((section) => section.status !== "same") ?? []
  const same = compare.data?.sections.filter((section) => section.status === "same") ?? []

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 pr-8">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Back to the version history" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <DialogTitle>
              {previousNo === null
                ? `Version ${version.version_no}`
                : `Version ${version.version_no} — what changed since Version ${previousNo}`}
            </DialogTitle>
            <DialogDescription>
              {compare.data
                ? `${changed.length} section${changed.length === 1 ? "" : "s"} changed · ${same.length} unchanged`
                : STATUS_LABEL[version.status]}
            </DialogDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            disabled={pdf.isPending}
            onClick={() => pdf.mutate(version.version_no)}
          >
            {pdf.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
            PDF
          </Button>
        </div>
        {compare.data && (
          <div className="flex gap-4 pt-1 text-xs text-muted-foreground">
            <span><span className="rounded bg-green-100 px-1.5 font-semibold text-green-900">green</span> added</span>
            <span><span className="rounded bg-red-100 px-1.5 text-red-800 line-through">red</span> removed</span>
          </div>
        )}
      </DialogHeader>

      <div className="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-6">
      {previousNo === null && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <p className="font-semibold">
            {version.version_no === 1
              ? "This is the first version, so there's nothing to compare."
              : "The version before this one is no longer kept, so there's nothing to compare."}
          </p>
          <p className="text-sm text-muted-foreground">Open the PDF to read it as it was.</p>
        </div>
      )}

      {compare.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Finding the changes…
        </p>
      )}
      {compare.error && <p className="text-sm text-red-700">Couldn&apos;t load the changes.</p>}

      {compare.data && (
        <>
          {changed.length === 0 && (
            <p className="text-sm text-muted-foreground">No text changed between these versions.</p>
          )}
          <div className="space-y-3">
            {changed.map((section) => (
              <ChangedSection key={section.code} section={section} arabic={arabic} />
            ))}
          </div>
          {same.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Unchanged: {same.map((section) => section.title).join(", ")}
            </p>
          )}
        </>
      )}
      </div>
    </>
  )
}

/** One changed section: its changed paragraphs, each once, with the words marked. */
function ChangedSection({ section, arabic }: { section: SectionDiff; arabic: boolean }) {
  return (
    <section className="overflow-hidden rounded-lg border" dir={arabic ? "rtl" : undefined} lang={arabic ? "ar" : undefined}>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
        <span className="font-semibold">{section.title}</span>
        {section.status === "added" && <span className="text-xs text-green-700">· new section</span>}
        {section.status === "removed" && <span className="text-xs text-red-700">· removed</span>}
      </div>
      <div className={cn("space-y-3 p-3", arabic ? "text-right" : "text-left")}>
        {section.paragraphs.map((paragraph, index) => (
          <ChangedParagraph key={index} paragraph={paragraph} />
        ))}
      </div>
    </section>
  )
}

/** A changed paragraph, shown as what it is: heading, bullet, text or table row. */
function ChangedParagraph({ paragraph }: { paragraph: DiffParagraph }) {
  if (paragraph.type === "row") return <ChangedRow paragraph={paragraph} />
  const words = paragraph.parts.map((part, index) => <Words key={index} part={part} />)
  if (paragraph.type === "heading") {
    return <p className="text-sm font-bold leading-7">{words}</p>
  }
  if (paragraph.type === "bullet") {
    return (
      <p className="flex gap-2 text-sm leading-7">
        <span aria-hidden>•</span>
        <span>{words}</span>
      </p>
    )
  }
  return <p className="text-sm leading-7">{words}</p>
}

/** A changed table row, under its table's top row so the numbers have their labels. */
function ChangedRow({ paragraph }: { paragraph: DiffParagraph }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {paragraph.header && (
          <thead>
            <tr>
              {paragraph.header.map((cell, index) => (
                <th key={index} className="border bg-muted/40 px-2 py-1 text-start font-semibold">{cell}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          <tr>
            {paragraph.cells.map((parts, index) => (
              <td key={index} className="border px-2 py-1 align-top">
                {parts.map((part, partIndex) => (
                  <Words key={partIndex} part={part} />
                ))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Words({ part }: { part: DiffPart }) {
  if (part.kind === "same") return <span>{part.text}</span>
  const words = part.text.trimEnd()
  const space = part.text.slice(words.length)
  const style = part.kind === "added"
    ? "rounded bg-green-100 font-semibold text-green-900"
    : "rounded bg-red-100 text-red-800 line-through"
  return (
    <>
      <span className={style}>{words}</span>
      {space}
    </>
  )
}
