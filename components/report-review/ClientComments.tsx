"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, MessageSquarePlus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { clientReportReviewApi, type ClientComment } from "@/lib/api/reportReview"

/* ────────────────────────────────────────────────────────────────────────────
   The client's comments on the review page, like the Communication Hub
   reviewer screen: "Add comment" under each section, the comment shown there,
   and a list of all of them in the rail that jumps to its section. A comment
   with no section is about the whole report.
──────────────────────────────────────────────────────────────────────────── */

/** Where a section's comments sit on the page, for the rail to jump to. */
export function sectionAnchor(sectionCode: string): string {
  return `client-comments-${sectionCode}`
}

/** The error the server sent, or a fallback. */
function errorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === "string" && detail ? detail : fallback
}

/**
 * The client's comments and the three ways to change them. Each call returns
 * the version's whole list, which replaces ours.
 */
export function useClientComments(token: string, initial: ClientComment[]) {
  const [comments, setComments] = useState<ClientComment[]>(initial)

  /** Runs one change; returns false (and says why) when it failed. */
  const run = async (change: () => Promise<ClientComment[]>, failed: string): Promise<boolean> => {
    try {
      setComments(await change())
      return true
    } catch (err) {
      toast.error(errorDetail(err, failed))
      return false
    }
  }

  return {
    comments,
    add: (sectionCode: string | null, body: string) =>
      run(() => clientReportReviewApi.addComment(token, body, sectionCode), "Couldn't save your comment."),
    edit: (commentId: string, body: string) =>
      run(() => clientReportReviewApi.editComment(token, commentId, body), "Couldn't save your comment."),
    remove: (commentId: string) =>
      run(() => clientReportReviewApi.deleteComment(token, commentId), "Couldn't delete your comment."),
  }
}

export type ClientCommentsApi = ReturnType<typeof useClientComments>

/** A box to write a comment in, with Save and Cancel. */
function Composer({
  initial = "",
  placeholder,
  onSave,
  onCancel,
}: {
  initial?: string
  placeholder: string
  /** Resolves true when saved, so the box can close. */
  onSave: (body: string) => Promise<boolean>
  onCancel?: () => void
}) {
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const body = text.trim()
    if (!body) return
    setSaving(true)
    const saved = await onSave(body)
    setSaving(false)
    if (saved && !initial) setText("")
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={5000}
        dir="auto"
        placeholder={placeholder}
        autoFocus={!!onCancel}
        className="text-sm"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={save} disabled={saving || !text.trim()}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save comment
        </Button>
      </div>
    </div>
  )
}

/** One saved comment; Edit and Delete while the review is open. */
function CommentItem({
  comment,
  canChange,
  api,
  showSection = false,
  onJump,
}: {
  comment: ClientComment
  canChange: boolean
  api: ClientCommentsApi
  /** In the rail: name the section it's on. */
  showSection?: boolean
  onJump?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (editing) {
    return (
      <Composer
        initial={comment.body}
        placeholder="Your comment"
        onCancel={() => setEditing(false)}
        onSave={async (body) => {
          const saved = await api.edit(comment.id, body)
          if (saved) setEditing(false)
          return saved
        }}
      />
    )
  }

  const remove = async () => {
    setDeleting(true)
    await api.remove(comment.id)
    setDeleting(false)
  }

  return (
    <div className="rounded-lg border bg-background p-2.5 text-sm">
      {showSection && (
        <button
          type="button"
          onClick={onJump}
          disabled={!onJump}
          className="mb-0.5 block text-left text-[11px] font-semibold text-indigo-700 hover:underline disabled:no-underline disabled:text-muted-foreground"
          dir="auto"
        >
          {comment.section_title ?? "Whole report"}
        </button>
      )}
      <p className="whitespace-pre-wrap break-words" dir="auto">{comment.body}</p>
      {canChange && comment.is_draft && (
        <div className="mt-1.5 flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-700" onClick={remove} disabled={deleting}>
            {deleting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />}
            Delete
          </Button>
        </div>
      )}
    </div>
  )
}

/** Under one section: its comments, and Add comment while the review is open. */
export function SectionComments({
  sectionCode,
  title,
  open,
  api,
}: {
  sectionCode: string
  title: string
  open: boolean
  api: ClientCommentsApi
}) {
  const [adding, setAdding] = useState(false)
  const mine = api.comments.filter((comment) => comment.section_code === sectionCode)
  if (!open && mine.length === 0) return null

  return (
    // Left to right, whatever the report's direction: the page's own words are English.
    <div id={sectionAnchor(sectionCode)} dir="ltr" className="mx-auto my-4 max-w-3xl scroll-mt-6 space-y-2 print:hidden">
      {mine.map((comment) => (
        <CommentItem key={comment.id} comment={comment} canChange={open} api={api} />
      ))}
      {open && !adding && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAdding(true)}>
            <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" /> Add comment
          </Button>
        </div>
      )}
      {open && adding && (
        <Composer
          // The title is wrapped in direction isolates (U+2068 … U+2069): an
          // Arabic title in this English line otherwise pulled the quotes and
          // the "?" out of place.
          placeholder={`What should change in "⁨${title}⁩"?`}
          onCancel={() => setAdding(false)}
          onSave={async (body) => {
            const saved = await api.add(sectionCode, body)
            if (saved) setAdding(false)
            return saved
          }}
        />
      )}
    </div>
  )
}

/** The rail: every comment, each jumping to its section, and one on the whole report. */
export function CommentsRail({ open, api }: { open: boolean; api: ClientCommentsApi }) {
  const jumpTo = (sectionCode: string) => {
    document.getElementById(sectionAnchor(sectionCode))?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">Your comments ({api.comments.length})</p>
      {api.comments.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {open ? "Use Add comment under any section, or comment on the whole report below." : "You left no comments."}
        </p>
      )}
      {/* Scrolls inside itself, so the rail stays short enough for the
          Approve / Request changes buttons below it to stay on screen. */}
      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
        {api.comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            canChange={open}
            api={api}
            showSection
            onJump={comment.section_code ? () => jumpTo(comment.section_code as string) : undefined}
          />
        ))}
      </div>
      {open && (
        <div className="space-y-1.5 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Comment on the whole report</p>
          <Composer placeholder="Anything about the report as a whole" onSave={(body) => api.add(null, body)} />
        </div>
      )}
    </div>
  )
}
