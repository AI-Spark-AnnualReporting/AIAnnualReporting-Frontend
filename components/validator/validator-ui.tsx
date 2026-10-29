"use client"

import { ShieldCheck } from "lucide-react"

/* The Annual Report Validator's form pieces, copied from Centriyon's own page
   (Centrion_Frontend/src/pages/AnnualReportValidatorPage.tsx) so Spark's
   validator here looks exactly like admin's there. Same inline styles, same
   class names (.card .ct .tabs .tab .inp .btn - see globals.css).

   Two copies of one look is the price of keeping two pages: a visual change
   to one validator belongs in both. */

export const PRIMARY = "#4040C8"
export const MUTED = "#9BA3C4"
export const DARK = "#1A1D2E"
export const MONO = "'DM Mono', monospace"

/** The whole form in one card under a collapsible "Set up validation" header. */
export function SetupCard({
  expanded,
  onToggleExpanded,
  caption,
  children,
}: {
  expanded: boolean
  onToggleExpanded: () => void
  caption: string
  children: React.ReactNode
}) {
  return (
    // No marginBottom here (Centriyon has 14): our Tailwind v4 `space-y-*` puts the
    // gap below each child, and an inline margin would override it.
    <div className="card" style={{ overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 18px",
          background: "transparent",
          border: "none",
          borderBottom: expanded ? "1px solid #ECEEF8" : "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "linear-gradient(135deg,#4040C8,#7C3AED)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ShieldCheck className="h-[15px] w-[15px] text-white" strokeWidth={2.2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="ct">Set up validation</div>
            <div
              style={{
                fontSize: 11,
                color: MUTED,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {caption}
            </div>
          </div>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            flexShrink: 0,
            transform: expanded ? "rotate(0deg)" : "rotate(180deg)",
            transition: "transform .15s",
          }}
        >
          <path
            d="M2.5 7L6 3.5 9.5 7"
            stroke={MUTED}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {expanded && children}
    </div>
  )
}

/** One numbered step inside the setup card. */
export function Section({
  step,
  title,
  caption,
  last,
  children,
}: {
  step: number
  title: string
  caption?: string
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ padding: "16px 18px", borderBottom: last ? "none" : "1px solid #ECEEF8" }}>
      <div className="ct">
        <span style={{ color: MUTED, fontFamily: MONO, marginRight: 6 }}>{step}</span>
        {title}
      </div>
      {caption && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 3, marginBottom: 14, maxWidth: 620 }}>
          {caption}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Two pill tabs. `fromFile` is true when the second ("Upload a file") is open.
 * Labels default to the brief/tone pair; concepts pass "Type them".
 */
export function ModeTabs({
  fromFile,
  onChange,
  typeLabel = "Type it",
}: {
  fromFile: boolean
  onChange: (fromFile: boolean) => void
  typeLabel?: string
}) {
  return (
    <div className="tabs">
      <button type="button" className={`tab ${!fromFile ? "act" : ""}`} onClick={() => onChange(false)}>
        {typeLabel}
      </button>
      <button type="button" className={`tab ${fromFile ? "act" : ""}`} onClick={() => onChange(true)}>
        Upload a file
      </button>
    </div>
  )
}

/** A dashed drop zone that turns solid with the file's name and size once chosen. */
export function FileDropzone({
  file,
  accept,
  hint,
  onPick,
}: {
  file: File | null
  accept: string
  hint: string
  onPick: (f: File | null) => void
}) {
  return (
    <label
      style={{
        display: "block",
        padding: file ? "13px 15px" : 20,
        borderRadius: 10,
        border: `1.5px ${file ? "solid" : "dashed"} ${file ? PRIMARY : "#E2E4F0"}`,
        background: file ? "#FAFAFF" : "#fff",
        cursor: "pointer",
        textAlign: file ? "left" : "center",
        transition: ".12s",
      }}
    >
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null)
          // Let the same file be picked again after it was removed - without
          // this, choosing A, removing it and choosing A again fires no event.
          e.target.value = ""
        }}
        style={{ display: "none" }}
      />
      {file ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: DARK,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
              {formatFileSize(file.size)} · click to replace
            </div>
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault()
              onPick(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onPick(null)
              }
            }}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: MUTED,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
              flexShrink: 0,
            }}
          >
            Remove
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          <span style={{ color: PRIMARY, fontWeight: 700 }}>Choose a file</span> {hint}
        </div>
      )}
    </label>
  )
}

/** "36 KB", "1.4 MB", "12 MB". */
function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Title + description on the left, an action on the right. */
export function ValidatorHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-[#1A1D2E]">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  )
}

/** "Oct 11, 2026, 12:31 PM" for a results header; empty if unknown. */
export function checkedAt(validatedAt: string | undefined): string {
  if (!validatedAt) return ""
  const date = new Date(validatedAt)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}
