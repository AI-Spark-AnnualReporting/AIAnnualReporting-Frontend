"use client"

import Link from "next/link"

import { Skeleton } from "@/components/ui/skeletons"
import { useExternalValidations } from "@/hooks/useReportBuilder"
import type { ValidationJobSummary } from "@/lib/api/pm"

/* "Previous validations" under the Annual Report Validator form - the same
   cards admin sees in Centriyon (Centrion_Frontend/src/components/validator/
   PreviousValidationsGallery.tsx): a gradient top by status, the score, an
   action pill, a relative time.

   A card is a link to that run's page (/runs/[jobId]), which already polls a
   running job, shows a finished one and explains a failed one - so nothing
   here needs to know which state the run is in beyond the card's face. */

const FACE: Record<ValidationJobSummary["status"], { gradient: string; label: string; action: string }> = {
  running: {
    gradient: "linear-gradient(135deg,#1F2A6B,#3535B5)",
    label: "Validating…",
    action: "Resume →",
  },
  completed: {
    gradient: "linear-gradient(135deg,#334155,#475569)",
    label: "Completed",
    action: "Continue →",
  },
  failed: {
    gradient: "linear-gradient(135deg,#7F1D1D,#B91C1C)",
    label: "Failed",
    action: "See what happened →",
  },
}

const CARD_STYLE: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid #E2E4F0",
  display: "flex",
  flexDirection: "column",
  // Fixed-ish width, not a stretched grid cell: wraps with however many
  // cards there are instead of reserving empty columns.
  flex: "0 1 260px",
}

/** "3 min ago", "Yesterday", "2 days ago" - Centriyon's relativeTime. */
function relativeTime(input?: string | null): string {
  if (!input) return "—"
  const then = new Date(input).getTime()
  if (Number.isNaN(then)) return "—"
  const sec = Math.round((Date.now() - then) / 1000)
  if (sec < 0) return "just now"
  if (sec < 45) return "Active now"
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`
  const day = Math.round(hr / 24)
  if (day === 1) return "Yesterday"
  if (day < 7) return `${day} days ago`
  const wk = Math.round(day / 7)
  if (wk < 5) return `${wk} week${wk === 1 ? "" : "s"} ago`
  const mo = Math.round(day / 30)
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`
  const yr = Math.round(day / 365)
  return `${yr} year${yr === 1 ? "" : "s"} ago`
}

// Same shape as a real card, so the row doesn't jump when the list arrives.
function CardSkeleton() {
  return (
    <div style={CARD_STYLE}>
      <div style={{ padding: "20px 20px 22px" }}>
        <Skeleton className="mb-3 h-5 w-3/4" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  )
}

function Card({ job }: { job: ValidationJobSummary }) {
  const face = FACE[job.status] ?? FACE.completed

  return (
    <Link
      href={`/pm/annual-report-validator/runs/${job.job_id}`}
      style={{ ...CARD_STYLE, cursor: "pointer", transition: "transform .15s ease, box-shadow .15s ease" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)"
        e.currentTarget.style.boxShadow = "0 8px 22px rgba(26,29,46,.08)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      <div style={{ background: face.gradient, padding: "20px 20px 22px", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -34, right: -34, width: 124, height: 124, borderRadius: "50%", background: "rgba(255,255,255,.08)" }} />
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            lineHeight: 1.2,
            letterSpacing: "-.3px",
            marginBottom: 14,
            position: "relative",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
          title={job.filename}
        >
          {job.filename}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, position: "relative" }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              padding: "4px 9px",
              borderRadius: 999,
              background: "rgba(255,255,255,.22)",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {job.status === "completed" && job.score != null ? `${job.score}/100` : face.label}
          </span>
        </div>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#4040C8", background: "rgba(64,64,200,.1)", padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
          {face.action}
        </span>
        <span style={{ fontSize: 10, color: "#9BA3C4", textAlign: "right" }}>
          {relativeTime(job.created_at)}
        </span>
      </div>
    </Link>
  )
}

export function PreviousValidationsGallery() {
  const { data: jobs, isLoading } = useExternalValidations()

  // Nothing to show only once loading is done - while it runs there is no
  // way yet to tell "empty" from "has rows", so the skeleton shows.
  if (!isLoading && (!jobs || jobs.length === 0)) return null

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#1A1D2E" }}>Previous validations</span>
        <span style={{ fontSize: 11, color: "#9BA3C4" }}>{isLoading ? "loading…" : "newest first"}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {isLoading
          ? [0, 1, 2].map((i) => <CardSkeleton key={i} />)
          : jobs!.map((job) => <Card key={job.job_id} job={job} />)}
      </div>
    </div>
  )
}
