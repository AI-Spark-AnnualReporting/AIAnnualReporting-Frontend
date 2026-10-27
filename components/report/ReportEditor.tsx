"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, FileText, Info, Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ArabicEdition } from "@/components/report/ArabicTranslation"
import { CARD, RAIL_LABEL } from "@/components/communication/review/shared"
import type { ArabicEditBody } from "@/lib/api/pm"
import type { VersionSummary } from "@/lib/api/reportReview"
import type { FinalReport } from "@/types"

/**
 * The PM editing a whole assembled report by hand, on one page: Edit report
 * (English) and Edit Arabic share it.
 *
 * Every section's heading, then its text, one after another. Headings are
 * fixed (the contents page, numbering and PDF use them) and attachments can't
 * be edited; only the text changes. One Save for all of it. After the client
 * asked for changes, the first save makes the next version.
 */

/** The editable text of a report: the summary and each text section by code. */
interface Texts {
  summary: string
  sections: Record<string, string>
}

/** The editable text the report holds now. */
function textsOf(report: FinalReport): Texts {
  const sections: Record<string, string> = {}
  for (const section of report.sections) {
    if (section.type === "narrative") sections[section.section_code] = section.content ?? ""
  }
  return { summary: report.executive_summary ?? "", sections }
}

/** True when two sets of text differ anywhere. */
function textsDiffer(a: Texts, b: Texts): boolean {
  if (a.summary !== b.summary) return true
  for (const code of Object.keys(a.sections)) {
    if (a.sections[code] !== b.sections[code]) return true
  }
  return false
}

/** The id of a section's block in the editor, for the comments to jump to. */
function editorSectionId(sectionCode: string): string {
  return `edit-sec-${sectionCode}`
}

/**
 * Scrolls the editor to a section, puts the cursor in its text, and briefly
 * highlights it. Does nothing when the section isn't on the page.
 */
function jumpToEditorSection(sectionCode: string): void {
  const block = document.getElementById(editorSectionId(sectionCode))
  if (!block) return
  block.scrollIntoView({ behavior: "smooth", block: "start" })
  block.querySelector("textarea")?.focus({ preventScroll: true })
  block.style.transition = "background-color 0.4s"
  block.style.backgroundColor = "rgba(99, 102, 241, 0.10)"
  window.setTimeout(() => {
    block.style.backgroundColor = ""
  }, 1600)
}

/** Enough rows to show the text without scrolling inside the box. */
function rowsFor(text: string): number {
  let rows = 0
  for (const line of text.split("\n")) {
    rows += Math.max(1, Math.ceil(line.length / 80))
  }
  return Math.max(3, rows + 1)
}

/** The page shown instead of the editor when editing isn't allowed. */
export function EditorBlocked({
  backHref,
  backLabel,
  message,
}: {
  backHref: string
  backLabel: string
  message: string
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <Lock className="h-6 w-6 text-muted-foreground" />
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Link href={backHref}>
        <Button variant="outline" size="sm">{backLabel}</Button>
      </Link>
    </div>
  )
}

export function ReportEditor({
  report,
  arabic,
  backHref,
  reviewComments,
  latestStatus,
  saving,
  onSave,
}: {
  report: FinalReport
  /** The Arabic translation: right to left, with its own labels. */
  arabic: boolean
  /** The report page to go back to, after Save as well. */
  backHref: string
  /** The latest round the client asked for changes in: its comments and note. */
  reviewComments?: VersionSummary
  /** The newest version's status: "changes_requested" means this save makes the next one. */
  latestStatus?: string
  saving: boolean
  /** Saves the edits and resolves with the saved report. */
  onSave: (body: ArabicEditBody) => Promise<FinalReport>
}) {
  const router = useRouter()
  const [saved, setSaved] = useState<Texts>(() => textsOf(report))
  const [texts, setTexts] = useState<Texts>(() => textsOf(report))
  const [leaveOpen, setLeaveOpen] = useState(false)
  const dirty = textsDiffer(texts, saved)

  // Leaving the browser tab with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const setSection = (code: string, value: string) =>
    setTexts((prev) => ({ ...prev, sections: { ...prev.sections, [code]: value } }))

  const save = async () => {
    const sections = Object.entries(texts.sections).map(([section_code, content]) => ({ section_code, content }))
    let savedReport: FinalReport
    try {
      savedReport = await onSave({ executive_summary: texts.summary, sections })
    } catch {
      return // the hook has shown the error
    }
    const next = textsOf(savedReport)
    setSaved(next)
    setTexts(next)
    const madeNext = latestStatus === "changes_requested" && reviewComments
    const label = arabic ? "Arabic version" : "version"
    toast.success(
      madeNext
        ? `Saved as ${label} ${reviewComments.version_no + 1}. Share it again to send it to the client.`
        : "Saved.",
    )
    // Back to the report page, which shows the saved text.
    router.push(backHref)
  }

  const leave = () => (dirty ? setLeaveOpen(true) : router.push(backHref))

  const comments = reviewComments?.comments ?? []
  const note = reviewComments?.decision_note
  const summaryTitle = arabic ? "الملخص التنفيذي" : "Executive Summary"

  return (
    <div className="-m-8 flex h-[calc(100vh-72px)] flex-col overflow-hidden bg-[#F2F3FA]">
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-5 py-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Back to the report" onClick={leave}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 truncate text-sm font-semibold">
            {arabic ? "Edit Arabic report" : "Edit report"}
            {arabic && (
              <span lang="ar" className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                العربية
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">
            {dirty ? "Changes not saved yet" : "All changes saved"} · headings and attached files stay as they are
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8" onClick={leave} disabled={saving}>
          Cancel
        </Button>
        <Button variant="brand" size="sm" className="h-8" onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save changes
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6">
          {/* A plain wrapper, not a component made here: one defined inside
              this render would be a new type each keystroke, and React would
              remount every box and drop the caret. */}
          <SheetWrap arabic={arabic}>
            <article
              className="report-sheet mx-auto max-w-[794px] space-y-8 rounded-lg border border-[#E5E7EF] bg-white px-6 py-10 shadow-[0_10px_30px_rgba(20,22,40,.08)] sm:px-14"
              aria-label={arabic ? "Arabic report, editable" : "Report, editable"}
            >
              <EditableSection
                sectionCode="executive_summary"
                arabic={arabic}
                number="1"
                title={summaryTitle}
                value={texts.summary}
                onChange={(value) => setTexts((prev) => ({ ...prev, summary: value }))}
              />
              {report.sections
                .filter((section) => section.type !== "auto")
                .sort((a, b) => a.order - b.order)
                .map((section) =>
                  section.type === "narrative" ? (
                    <EditableSection
                      key={section.section_code}
                      sectionCode={section.section_code}
                      arabic={arabic}
                      number={section.number == null ? null : String(section.number)}
                      title={section.title}
                      value={texts.sections[section.section_code] ?? ""}
                      onChange={(value) => setSection(section.section_code, value)}
                    />
                  ) : (
                    <section key={section.section_code} id={editorSectionId(section.section_code)} className="scroll-mt-4 space-y-2 rounded-md">
                      <SectionHeading number={section.number == null ? null : String(section.number)} title={section.title} />
                      <div dir="ltr" className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
                        <FileText className="h-4 w-4 shrink-0" />
                        Attached file{section.document?.filename ? `: ${section.document.filename}` : ""} (can&apos;t be edited here)
                      </div>
                    </section>
                  ),
                )}
            </article>
          </SheetWrap>
        </div>

        <aside className="hidden w-[322px] shrink-0 flex-col gap-3.5 overflow-y-auto border-l px-4 py-5 lg:flex">
          {(comments.length > 0 || note) && (
            <div style={{ ...CARD, padding: "14px 16px" }}>
              <div style={RAIL_LABEL}>Client&apos;s comments · v{reviewComments?.version_no}</div>
              <div className="space-y-2">
                {note && <p className="whitespace-pre-wrap rounded-lg bg-[#F5F4FF] p-2 text-xs">{note}</p>}
                {comments.map((comment) => (
                  comment.section_code ? (
                    // Jumps to that section's text, with the cursor in it.
                    <button
                      key={comment.id}
                      type="button"
                      onClick={() => jumpToEditorSection(comment.section_code as string)}
                      title={`Go to ${comment.section_title ?? "this section"}`}
                      className="block w-full rounded-lg border border-[#ECEEF8] p-2 text-left text-xs transition-colors hover:bg-indigo-50/50"
                    >
                      <p className="mb-0.5 text-[10.5px] font-semibold text-indigo-600" dir="auto">
                        {comment.section_title}
                      </p>
                      <p className="whitespace-pre-wrap">{comment.body}</p>
                    </button>
                  ) : (
                    <div key={comment.id} className="rounded-lg border border-[#ECEEF8] p-2 text-xs">
                      <p className="mb-0.5 text-[10.5px] font-semibold text-muted-foreground">Whole report</p>
                      <p className="whitespace-pre-wrap">{comment.body}</p>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 rounded-2xl border bg-card p-3.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Bold and lists are typed as in the builder: <code>**bold**</code>, <code>- item</code>.
              After saving, share it again to send the client the new version.
            </span>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Leave without saving?"
        description="Your changes to the report will be lost."
        confirmLabel="Leave"
        variant="destructive"
        onConfirm={() => router.push(backHref)}
      />
    </div>
  )
}

/** The Arabic report's right-to-left styling around the sheet; nothing for the English. */
function SheetWrap({ arabic, children }: { arabic: boolean; children: ReactNode }) {
  if (arabic) return <ArabicEdition>{children}</ArabicEdition>
  return <>{children}</>
}

function SectionHeading({ number, title }: { number: string | null; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="flex-1 text-xl font-semibold" style={{ color: "var(--report-brand, #3C0866)" }}>
        {number ? `${number}. ` : ""}
        {title}
      </h2>
      <span dir="ltr" className="flex items-center gap-1 text-[10.5px] text-muted-foreground" title="Headings stay as they are">
        <Lock className="h-3 w-3" aria-hidden="true" />
        heading fixed
      </span>
    </div>
  )
}

function EditableSection({
  sectionCode,
  arabic,
  number,
  title,
  value,
  onChange,
}: {
  sectionCode: string
  arabic: boolean
  number: string | null
  title: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <section id={editorSectionId(sectionCode)} className="scroll-mt-4 space-y-2 rounded-md">
      <SectionHeading number={number} title={title} />
      <textarea
        dir={arabic ? "rtl" : "ltr"}
        lang={arabic ? "ar" : undefined}
        aria-label={title}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rowsFor(value)}
        className="w-full resize-none rounded-md border border-transparent bg-transparent p-2 text-[15px] leading-[1.9] text-[#2A2E45] outline-none transition-colors hover:border-[#E5E7EF] focus:border-indigo-300 focus:bg-indigo-50/20"
      />
    </section>
  )
}
