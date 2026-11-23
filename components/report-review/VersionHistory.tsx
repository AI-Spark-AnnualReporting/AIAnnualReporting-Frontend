"use client"

import { Fragment, useState } from "react"
import { ArrowLeft, ChevronRight, Download, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeletons"
import { cn, formatDateTime } from "@/lib/utils"
import type { DiffParagraph, DiffPart, SectionDiff, VersionSummary } from "@/lib/api/reportReview"
import { useCompareVersions, useDownloadVersionWord } from "@/hooks/useReportReview"

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
      {/* A column, not one scrolling box: the title, Back and Word stay put
          and only the list or the changes below them scroll. */}
      {/* Wider for the changes: two versions side by side. */}
      <DialogContent className={cn("flex max-h-[85vh] flex-col", selected ? "sm:max-w-5xl" : "sm:max-w-3xl")}>
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

/** "word" for one, "words" otherwise. */
function wordLabel(count: number): string {
  return count === 1 ? "word" : "words"
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
              <span className="text-green-700">+{version.added_words} {wordLabel(version.added_words)}</span>
              {" · "}
              <span className="text-red-700">−{version.deleted_words} {wordLabel(version.deleted_words)}</span>
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
                <span className="block text-[10.5px] font-semibold text-muted-foreground" dir="auto">
                  {comment.section_title ?? "Whole report"}
                </span>
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
  // The designed Word file of this version (internal users; the client gets a simple PDF).
  const word = useDownloadVersionWord(cycleId, arabic)
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
            disabled={word.isPending}
            onClick={() => word.mutate(version.version_no)}
          >
            {word.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
            Word
          </Button>
        </div>
        {compare.data && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span><span className="rounded bg-green-100 px-1.5 font-semibold text-green-900">green</span> added in Version {version.version_no}</span>
            <span><span className="rounded bg-red-100 px-1.5 text-red-800 line-through">red</span> removed in Version {version.version_no}</span>
            <span><span className="rounded border px-1.5">grey</span> unchanged, shown so you can see where the change sits</span>
          </div>
        )}
        {/* Once, at the top, over the two columns of every section below
            (side by side only; stacked on a phone, each cell names its own).
            The Arabic reads right to left, so its older version is on the right. */}
        {compare.data && previousNo !== null && changed.length > 0 && (
          <div
            dir={arabic ? "rtl" : "ltr"}
            className="hidden grid-cols-2 rounded-md border bg-muted/40 pt-0 text-[11px] font-bold tracking-wide text-muted-foreground md:grid"
          >
            <span dir="ltr" className={cn("px-3 py-1.5", arabic ? "text-right" : "border-r")}>VERSION {previousNo} (BEFORE)</span>
            <span dir="ltr" className={cn("px-3 py-1.5", arabic ? "border-r text-right" : "")}>VERSION {version.version_no} (AFTER)</span>
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
          {version.version_no > 1 && (
            <p className="text-sm text-muted-foreground">
              History keeps only the last 3 versions, so Version {version.version_no - 1} was removed.
              Version {version.version_no} can&apos;t be compared with it.
            </p>
          )}
          <p className="text-sm text-muted-foreground">Download the Word file to read it as it was.</p>
        </div>
      )}

      {compare.isLoading && <ChangesSkeleton />}
      {compare.error && <p className="text-sm text-red-700">Couldn&apos;t load the changes.</p>}

      {compare.data && (
        <>
          {changed.length === 0 && (
            <p className="text-sm text-muted-foreground">No text changed between these versions.</p>
          )}
          <div className="space-y-3">
            {changed.map((section) => (
              <ChangedSection
                key={section.code}
                section={section}
                arabic={arabic}
                fromNo={previousNo ?? version.version_no - 1}
                toNo={version.version_no}
              />
            ))}
          </div>
        </>
      )}
      </div>
    </>
  )
}

/** The changes' shape while they load: two sections, each with its two columns. */
function ChangesSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Finding the changes">
      {[0, 1].map((key) => (
        <div key={key} className="overflow-hidden rounded-lg border">
          <div className="border-b bg-muted/40 px-3 py-2">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="grid grid-cols-1 gap-4 p-3 md:grid-cols-2">
            {[0, 1].map((side) => (
              <div key={side} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Which version a column shows: the older one as it was, the newer one with its changes marked. */
type Side = "old" | "new"

/**
 * A paragraph's words as one side shows them.
 *
 * The older version shows its text plain: the removed words really are in
 * it, and crossing them out there read as "never in this version" (user,
 * 2026-10-29). The newer version shows every part, like Word's track
 * changes: what was taken out (red, crossed out) next to what came in (green).
 */
function sideParts(parts: DiffPart[], side: Side): DiffPart[] {
  if (side === "new") return parts
  const oldParts: DiffPart[] = []
  for (const part of parts) {
    if (part.kind === "added") continue
    oldParts.push({ ...part, kind: "same" })
  }
  return oldParts
}

/** True when the parts have any words at all. */
function hasWords(parts: DiffPart[]): boolean {
  return parts.some((part) => part.text.trim() !== "")
}

/**
 * One changed section, the two versions side by side: the older on the
 * left as it was, the newer on the right with removed words (red) and added
 * words (green) marked, each changed paragraph on the same row. The
 * unchanged paragraphs just before and after each change are shown in grey,
 * so the reader sees where the change sits (user, 2026-11-18). The Arabic
 * reads right to left, so there the older version is on the right.
 */
/** Paragraphs shown together: one paragraph, or the rows of one table that follow each other. */
type Block = {
  /** Where the block's first paragraph sits in the section's list. */
  start: number
  paragraphs: DiffParagraph[]
}

/** A row's cells as plain text (for a top row: the table's column names). */
function cellTexts(row: DiffParagraph): string[] {
  return row.cells.map((parts) => parts.map((part) => part.text).join("").trim())
}

/** True when the row is its table's top row and unchanged (a grey neighbour). */
function isGreyTopRow(row: DiffParagraph): boolean {
  return row.header == null && row.context === true
}

/**
 * The top row a row sits under. A grey top row has no header of its own (it
 * IS the header), so its own cells count: that lets it join the rows under
 * it instead of showing as a separate one-row table (ISSUE-8, 2026-11-18).
 */
function headerOf(row: DiffParagraph): string[] | null {
  if (isGreyTopRow(row)) return cellTexts(row)
  return row.header ?? null
}

/** True when two rows are in the same table: same name and same top row. */
function sameTable(a: DiffParagraph, b: DiffParagraph): boolean {
  const sameTitle = (a.table_title ?? null) === (b.table_title ?? null)
  const sameHeader = JSON.stringify(headerOf(a)) === JSON.stringify(headerOf(b))
  return sameTitle && sameHeader
}

/**
 * Groups a section's paragraphs into blocks, so the rows of one table show
 * as one table (name and top row once) instead of one small table per row
 * (ISSUE-6, 2026-11-18). A gap of left-out paragraphs starts a new block.
 */
function toBlocks(paragraphs: DiffParagraph[]): Block[] {
  const blocks: Block[] = []
  for (let index = 0; index < paragraphs.length; index++) {
    const paragraph = paragraphs[index]
    const last = blocks.length > 0 ? blocks[blocks.length - 1] : null
    const lastParagraph = last ? last.paragraphs[last.paragraphs.length - 1] : null
    const joins = last !== null
      && lastParagraph !== null
      && paragraph.type === "row"
      && lastParagraph.type === "row"
      && (paragraph.skipped_before ?? 0) === 0
      && sameTable(lastParagraph, paragraph)
    if (joins && last) {
      last.paragraphs.push(paragraph)
    } else {
      blocks.push({ start: index, paragraphs: [paragraph] })
    }
  }
  return blocks
}

function ChangedSection({
  section,
  arabic,
  fromNo,
  toNo,
}: {
  section: SectionDiff
  arabic: boolean
  fromNo: number
  toNo: number
}) {
  return (
    <section className="overflow-hidden rounded-lg border" dir={arabic ? "rtl" : undefined} lang={arabic ? "ar" : undefined}>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
        <span className="font-semibold">{section.title}</span>
        {section.status === "added" && <span className="text-xs text-green-700">· new section</span>}
        {section.status === "removed" && <span className="text-xs text-red-700">· removed</span>}
      </div>
      <div className={cn("grid grid-cols-1 md:grid-cols-2", arabic ? "text-right" : "text-left")}>
        {toBlocks(section.paragraphs).map((block) => {
          const paragraph = block.paragraphs[0]
          const index = block.start
          // Name the subsection once, above the first changed line in it.
          const place = paragraph.subsection ?? null
          const previous = index > 0 ? (section.paragraphs[index - 1].subsection ?? null) : null
          // A subheading row (changed or not) already names its subsection,
          // so no label above it (ISSUE-5) ...
          const isHeading = paragraph.type === "heading"
          const showPlace = place !== null && (index === 0 || place !== previous) && !isHeading
          // ... but it starts a new part, so a line above it, like the labels (ISSUE-3).
          const ruleAbove = isHeading && index > 0
          return (
            <Fragment key={index}>
              {(paragraph.skipped_before ?? 0) > 0 && <Skipped count={paragraph.skipped_before ?? 0} />}
              {showPlace && (
                // Just the subsection's name, in the report's own direction.
                <p
                  className={cn(
                    "bg-muted/20 px-3 py-1.5 text-xs font-semibold text-foreground md:col-span-2",
                    index > 0 && "border-t",
                  )}
                >
                  {place}
                </p>
              )}
              {paragraph.type === "row" ? (
                <TablePair rows={block.paragraphs} fromNo={fromNo} toNo={toNo} arabic={arabic} />
              ) : (
                <SidePair paragraph={paragraph} fromNo={fromNo} toNo={toNo} arabic={arabic} ruleAbove={ruleAbove} />
              )}
            </Fragment>
          )
        })}
        {(section.skipped_after ?? 0) > 0 && <Skipped count={section.skipped_after ?? 0} />}
      </div>
    </section>
  )
}

/** A small grey line standing in for the unchanged paragraphs left out here. */
function Skipped({ count }: { count: number }) {
  return (
    <p dir="ltr" className="px-3 py-1 text-center text-xs text-muted-foreground md:col-span-2">
      ⋯ {count} unchanged paragraph{count === 1 ? "" : "s"}
    </p>
  )
}

/**
 * One paragraph's two cells: the older version, then the newer. A change
 * sits on a soft amber band; its unchanged neighbours are grey. No lines
 * between rows, so the text reads as one flow (user, 2026-11-18).
 */
function SidePair({
  paragraph,
  fromNo,
  toNo,
  arabic,
  ruleAbove,
}: {
  paragraph: DiffParagraph
  fromNo: number
  toNo: number
  arabic: boolean
  /** A line above the row: a subheading starting a new part. */
  ruleAbove: boolean
}) {
  const context = paragraph.context === true
  const cell = cn(
    "min-w-0 px-3",
    context ? "py-1 text-muted-foreground" : "bg-amber-50 py-2.5",
    ruleAbove && "border-t",
  )
  // The divider sits between the two columns: on the right of the first in
  // English, on its left (the second's right) in Arabic.
  return (
    <>
      {/* Stacked (phone), an unchanged neighbour shows once: the two cells are the same. */}
      <div className={cn(cell, context && "hidden md:block", arabic ? "" : "md:border-r")}>
        {!context && (
          <p dir="ltr" className="mb-1 text-[11px] font-bold tracking-wide text-muted-foreground md:hidden">VERSION {fromNo} (BEFORE)</p>
        )}
        <SideParagraph paragraph={paragraph} side="old" emptyText={`— not in Version ${fromNo}`} />
      </div>
      <div className={cn(cell, arabic ? "md:border-r" : "")}>
        {!context && (
          <p dir="ltr" className="mb-1 text-[11px] font-bold tracking-wide text-muted-foreground md:hidden">VERSION {toNo} (AFTER)</p>
        )}
        <SideParagraph paragraph={paragraph} side="new" emptyText={`— removed in Version ${toNo}`} />
      </div>
    </>
  )
}

/**
 * Rows of one table, the two versions side by side: the table's name and top
 * row once, then each row. A changed row is amber, an unchanged one grey.
 */
function TablePair({
  rows,
  fromNo,
  toNo,
  arabic,
}: {
  rows: DiffParagraph[]
  fromNo: number
  toNo: number
  arabic: boolean
}) {
  const cell = "min-w-0 px-3 py-2"
  return (
    <>
      <div className={cn(cell, arabic ? "" : "md:border-r")}>
        <p dir="ltr" className="mb-1 text-[11px] font-bold tracking-wide text-muted-foreground md:hidden">VERSION {fromNo} (BEFORE)</p>
        <SideTable rows={rows} side="old" emptyText={`— not in Version ${fromNo}`} />
      </div>
      <div className={cn(cell, arabic ? "md:border-r" : "")}>
        <p dir="ltr" className="mb-1 text-[11px] font-bold tracking-wide text-muted-foreground md:hidden">VERSION {toNo} (AFTER)</p>
        <SideTable rows={rows} side="new" emptyText={`— removed in Version ${toNo}`} />
      </div>
    </>
  )
}

/** A paragraph as one version has it, shown as what it is: heading, bullet or text. */
function SideParagraph({ paragraph, side, emptyText }: { paragraph: DiffParagraph; side: Side; emptyText: string }) {
  // English words, so written left to right even in an Arabic column (else
  // the leading dash jumps to the end); the column still aligns it.
  const empty = <p dir="ltr" className="text-sm italic text-muted-foreground">{emptyText}</p>
  const parts = sideParts(paragraph.parts, side)
  if (!hasWords(parts)) return empty
  const words = parts.map((part, index) => <Words key={index} part={part} />)
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

/**
 * Rows of one table as one version has them, under the table's top row
 * (shown once) so the numbers have their labels. No "Table: <name>" line:
 * the report has none, and the subheading above already names the table
 * (ISSUE-7, 2026-11-18).
 */
function SideTable({ rows, side, emptyText }: { rows: DiffParagraph[]; side: Side; emptyText: string }) {
  // A grey top row with rows under it is the table's header: shown once,
  // as the header, not again as a grey row (ISSUE-8).
  const topRowIsHeader = isGreyTopRow(rows[0]) && rows.length > 1
  const header = topRowIsHeader ? cellTexts(rows[0]) : rows[0].header
  const bodyRows = topRowIsHeader ? rows.slice(1) : rows
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {header && (
          <thead>
            <tr>
              {header.map((cell, index) => (
                <th key={index} className="border bg-muted/40 px-2 py-1 text-start font-semibold">{cell}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <SideTableRow key={rowIndex} row={row} side={side} emptyText={emptyText} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One table row as one version has it: amber when it changed, grey when it didn't. */
function SideTableRow({ row, side, emptyText }: { row: DiffParagraph; side: Side; emptyText: string }) {
  const cells = row.cells.map((parts) => sideParts(parts, side))
  const rowStyle = row.context === true ? "text-muted-foreground" : "bg-amber-50"
  if (!cells.some(hasWords)) {
    return (
      <tr className={rowStyle}>
        <td dir="ltr" colSpan={Math.max(cells.length, 1)} className="border px-2 py-1 italic text-muted-foreground">
          {emptyText}
        </td>
      </tr>
    )
  }
  return (
    <tr className={rowStyle}>
      {cells.map((parts, index) => (
        <td key={index} className="border px-2 py-1 align-top">
          {parts.map((part, partIndex) => (
            <Words key={partIndex} part={part} />
          ))}
        </td>
      ))}
    </tr>
  )
}

function Words({ part }: { part: DiffPart }) {
  if (part.kind === "same") return <span>{part.text}</span>
  const words = part.text.trimEnd()
  // A removed run with no space after it (a number in a table cell) would
  // touch the word that replaced it: "2,4562,460". Give it one.
  const trailing = part.text.slice(words.length)
  const space = trailing === "" && part.kind === "deleted" ? " " : trailing
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
