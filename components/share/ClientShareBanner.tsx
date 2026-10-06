"use client"

import { useEffect, useRef, useState } from "react"
import { Check, LayoutGrid, Mail, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ShareStage } from "@/lib/api/share"

/* ────────────────────────────────────────────────────────────────────────────
   The Centriyon banner across the top of the client's link.

   The client never logs in, so this page is the only Centriyon they see. The
   banner also carries what they need before they start: which of the three
   links this is, how much there is, how far they've got, who to ask, and —
   once sent — that it arrived.
──────────────────────────────────────────────────────────────────────────── */

const STEPS: { stage: ShareStage; label: string }[] = [
  { stage: "questionnaire", label: "Questionnaire" },
  { stage: "brief", label: "Strategic brief" },
  { stage: "areas", label: "Areas of focus" },
]

/** Where the client stands once they've acted on this link. */
export type BannerStatus = "open" | "sent" | "approved" | "sent_back"

/** The Centriyon tile and name — the same mark the app's sidebar carries. */
export function CentriyonMark({
  tone = "dark",
  small = false,
}: {
  tone?: "dark" | "light" | "muted"
  small?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          small ? "h-5 w-5 rounded-md" : "h-[30px] w-[30px] rounded-lg",
          tone === "light" ? "border border-white/25 bg-white/15" : "bg-[#4040c8]",
        )}
      >
        <LayoutGrid className={cn("text-white", small ? "h-3 w-3" : "h-3.5 w-3.5")} />
      </span>
      <span
        className={cn(
          "font-extrabold tracking-[-0.2px]",
          small ? "text-xs" : "text-[15px]",
          tone === "light" && "text-white",
          tone === "dark" && "text-foreground",
          tone === "muted" && "text-foreground/80",
        )}
      >
        Centriyon
      </span>
    </span>
  )
}

/** The small "Powered by Centriyon" line at the bottom of the page. */
export function CentriyonFooter() {
  return (
    <footer className="mt-12 flex items-center justify-center gap-1.5 border-t border-border pt-6 text-xs text-muted-foreground">
      Powered by <CentriyonMark small tone="muted" />
    </footer>
  )
}

/** "6 Oct" — short, because it sits in a pill. */
function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/** The three links as a trail. Earlier steps are done by definition — a
 *  later link only exists once Spark approved the one before it. */
function StepTrail({ stage, finished }: { stage: ShareStage; finished: boolean }) {
  const current = STEPS.findIndex((s) => s.stage === stage)
  return (
    <ol className="relative mt-5 flex flex-wrap items-center gap-1.5">
      {STEPS.map((step, i) => {
        const done = i < current || (i === current && finished)
        const isCurrent = i === current
        return (
          <li key={step.stage} className="flex items-center gap-1.5">
            {i > 0 && <span className="hidden h-px w-4 bg-white/30 sm:block" aria-hidden />}
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold",
                isCurrent ? "bg-white/15 text-white" : done ? "text-white/90" : "text-white/60",
              )}
            >
              <span
                className={cn(
                  "flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-extrabold",
                  done || isCurrent ? "bg-white text-[#4040c8]" : "bg-white/15",
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** The ring that fills as questions are answered. */
function ProgressRing({ answered, required }: { answered: number; required: number }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const share = required > 0 ? Math.min(answered / required, 1) : 0
  return (
    <div
      className="relative grid h-[76px] w-[76px] shrink-0 place-items-center sm:h-[92px] sm:w-[92px]"
      role="img"
      aria-label={`${answered} of ${required} answered`}
    >
      <svg viewBox="0 0 92 92" className="absolute inset-0 -rotate-90">
        <circle cx="46" cy="46" r={radius} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="7" />
        <circle
          cx="46"
          cy="46"
          r={radius}
          fill="none"
          stroke="#fff"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
          className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
        />
      </svg>
      <div className="text-center leading-tight">
        <p className="text-lg font-extrabold tabular-nums sm:text-[22px]">
          {answered}/{required}
        </p>
        <p className="text-[10px] text-white/75">answered</p>
      </div>
    </div>
  )
}

/** The slim bar pinned to the top once the banner has scrolled away, so the
 *  count of what's left never leaves the screen. */
function StickyProgress({
  title,
  answered,
  required,
}: {
  title: string
  answered: number
  required: number
}) {
  const share = required > 0 ? Math.min(answered / required, 1) : 0
  return (
    <div className="fixed inset-x-0 top-0 z-40 bg-[#3535b5] text-white shadow-lg">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/15">
          <LayoutGrid className="h-3 w-3 text-white" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-bold">{title}</p>
        <span className="hidden h-1.5 w-36 shrink-0 overflow-hidden rounded-full bg-white/20 sm:block">
          <span
            className="block h-full rounded-full bg-white transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${share * 100}%` }}
          />
        </span>
        <span className="shrink-0 text-xs tabular-nums text-white/85">
          {answered} of {required}
        </span>
      </div>
    </div>
  )
}

export function ClientShareBanner({
  stage,
  cycleName,
  title,
  subtitle,
  facts,
  status,
  submittedAt,
  progress,
  contactName,
  contactEmail,
}: {
  stage: ShareStage
  cycleName: string
  title: string
  subtitle: string
  /** Short chips under the title, e.g. "12 questions". Empty once sent. */
  facts: string[]
  status: BannerStatus
  submittedAt?: string | null
  /** Answering progress. Questionnaire only, and only while it's open. */
  progress?: { answered: number; required: number } | null
  contactName?: string | null
  contactEmail?: string | null
}) {
  const bannerRef = useRef<HTMLElement>(null)
  const [scrolledPast, setScrolledPast] = useState(false)

  // Watch the banner itself rather than the scroll position: the bar should
  // appear exactly when the ring it stands in for leaves the screen.
  useEffect(() => {
    const el = bannerRef.current
    if (!el || !progress) return
    const observer = new IntersectionObserver(([entry]) => setScrolledPast(!entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [progress])

  const finished = status === "sent" || status === "approved"
  const sentOn = shortDate(submittedAt)

  return (
    <>
      <header
        ref={bannerRef}
        className="relative overflow-hidden bg-gradient-to-br from-[#3535b5] via-[#4040c8] to-[#5a5ae0] pb-20 pt-4 text-white"
      >
        {/* Soft shapes for depth. Decorative only. */}
        <span className="pointer-events-none absolute -right-20 -top-32 h-72 w-72 rounded-full bg-white/[0.08]" aria-hidden />
        <span className="pointer-events-none absolute -bottom-24 right-36 h-40 w-40 rounded-full bg-white/[0.06]" aria-hidden />

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CentriyonMark tone="light" />
            {(contactName || contactEmail) && (
              <p className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-3 py-1.5 text-xs text-white/85">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  Questions?{" "}
                  {contactName && <b className="font-semibold text-white">{contactName}</b>}
                  {contactName && contactEmail && " · "}
                  {contactEmail && (
                    <a href={`mailto:${contactEmail}`} className="underline-offset-2 hover:underline">
                      {contactEmail}
                    </a>
                  )}
                </span>
              </p>
            )}
          </div>

          <StepTrail stage={stage} finished={finished} />

          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0 flex-1 basis-80">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/70">
                {cycleName}
              </p>
              <h1 className="mt-1 text-balance text-2xl font-extrabold tracking-tight sm:text-[28px]">
                {title}
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/80">{subtitle}</p>
              {facts.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {facts.map((fact) => (
                    <li key={fact} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white/90">
                      {fact}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {progress && <ProgressRing answered={progress.answered} required={progress.required} />}

            {finished && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-green-700">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                {status === "approved" ? "Approved" : sentOn ? `Sent on ${sentOn}` : "Sent"}
              </span>
            )}
            {status === "sent_back" && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                <RotateCcw className="h-3.5 w-3.5" />
                Sent back for changes
              </span>
            )}
          </div>
        </div>
      </header>

      {progress && scrolledPast && (
        <StickyProgress title={title} answered={progress.answered} required={progress.required} />
      )}
    </>
  )
}
