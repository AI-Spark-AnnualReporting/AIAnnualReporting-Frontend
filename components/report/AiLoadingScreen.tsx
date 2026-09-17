"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

// Full-screen "AI is working" loader, ported from Centriton's
// src/pages/onboarding/AiLoadingScreen.tsx so a long wait looks the same in
// both products. Styling is inline and the keyframes (onb-*, dpulse) live in
// app/globals.css under the same names, so the two copies stay diffable.
//
// Drive it either way:
//   • `controlledProgress` — a real percentage from the caller (capped at 99
//     while running, eased to 100 once `done`).
//   • `indeterminate` — a travelling shimmer for waits nobody can measure. A
//     percentage nobody measured is a lie the user sees through on a long wait.

const PRIMARY = "#4040C8"

const DEFAULT_TIPS = [
  "A section with no department assigned can't be AI-written — it shows an amber \"Needs a source\" flag.",
  'Switching a section to "Upload later" clears its departments: it reads your document instead.',
  "You can change a section's departments any time until the plan is locked.",
  "Sections you create yourself sit alongside the built-in ones and are written the same way.",
]

// The brand mark inside a rotating ring with expanding pulse halos, over the
// Centriyon wordmark. It used to read "AI" — the same tile the sidebar carries
// says whose product is working, which the surrounding copy no longer has to.
function AnimatedLoader() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ position: "relative", width: 92, height: 92, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {[0, 0.6, 1.2].map((d) => (
          <span
            key={d}
            style={{
              position: "absolute",
              inset: 6,
              borderRadius: "50%",
              border: `2px solid ${PRIMARY}`,
              animation: "onb-ring 2.1s ease-out infinite",
              animationDelay: `${d}s`,
            }}
          />
        ))}
        <svg width="92" height="92" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="#fff" stroke="#ECEEF8" strokeWidth="4" />
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            stroke={PRIMARY}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="58 220"
            transform="rotate(-90 40 40)"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="-90 40 40"
              to="270 40 40"
              dur="1.3s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
        {/* The tile is markup, not SVG: it is the sidebar's brand tile at the
            size the ring allows, so the two stay the same shape. */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: PRIMARY,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="7" height="7" x="3" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" />
              <rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "2.4px",
          color: "#6f74a0",
          textTransform: "uppercase",
        }}
      >
        Centriyon
      </div>
    </div>
  )
}

function MilestoneRow({
  label,
  status,
}: {
  label: string
  status: "complete" | "active" | "pending"
}) {
  const color =
    status === "complete" ? "#10B981" : status === "active" ? "#1A1D2E" : "#9BA3C4"
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 0",
        fontSize: 13.5,
        color,
        fontWeight: status === "active" ? 700 : 500,
        transition: "color .3s",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 800,
          color:
            status === "complete" ? "#fff" : status === "active" ? "#fff" : "#C4C9DD",
          background:
            status === "complete"
              ? "#10B981"
              : status === "active"
                ? PRIMARY
                : "#EEF0F6",
          animation: status === "active" ? "dpulse 1.4s ease-in-out infinite" : undefined,
        }}
      >
        {status === "complete" ? "✓" : status === "active" ? "" : "•"}
      </span>
      <span>{label}</span>
    </div>
  )
}

export interface AiLoadingScreenProps {
  title: string
  subtitle: string
  milestones: string[]
  done?: boolean
  doneTitle?: string
  doneSubtitle?: string
  onDone?: () => void
  tips?: string[]
  /** Real progress, 0–99 while running. Disables the simulated climb. */
  controlledProgress?: number
  /** Travelling shimmer for a wait with no measurable progress. */
  indeterminate?: boolean
  /** Replaces the "N% complete" line — say something true about the wait. */
  progressCaption?: ReactNode
  /** Force the active milestone; otherwise it is inferred from progress. */
  activeMilestone?: number
  /** Roughly how long the wait runs, in ms — the simulated climb reaches 90%
   *  here and then holds. Set it from a measured run: too short and the PM
   *  watches a frozen bar, which reads as broken far more than a slow one
   *  does. Ignored when `controlledProgress` is supplied. */
  estimatedMs?: number
  /** Hide the bar and its caption. `controlledProgress` still steps the
   *  milestone checklist, which carries the progress on its own. */
  showProgress?: boolean
  headerExtra?: ReactNode
  footer?: ReactNode
}

export function AiLoadingScreen({
  title,
  subtitle,
  milestones,
  done = false,
  doneTitle,
  doneSubtitle,
  onDone,
  tips = DEFAULT_TIPS,
  controlledProgress,
  indeterminate = false,
  progressCaption,
  activeMilestone,
  estimatedMs,
  showProgress = true,
  headerExtra,
  footer,
}: AiLoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [currentTip, setCurrentTip] = useState(0)
  const progressRef = useRef(0)
  const doneRef = useRef(false)
  const controlled = controlledProgress != null

  // Simulated climb: toward 90% and hold; once `done`, ease to 100% and fire
  // onDone. Disabled whenever the caller supplies a real percentage.
  useEffect(() => {
    if (controlled) return
    const target = estimatedMs ?? 9000 + milestones.length * 1400 // ms
    // Resume where the bar already is rather than snapping back to 0, so a
    // re-run of this effect (an unmemoised `onDone`, say) never rewinds it.
    const start = Date.now() - (progressRef.current / 100) * target
    let raf = 0
    const tick = () => {
      let p = progressRef.current
      if (done) {
        p = Math.min(p + (100 - p) * 0.05 + 0.5, 100)
        if (p >= 99.6) p = 100
      } else {
        p = Math.min(((Date.now() - start) / target) * 100, 90)
      }
      progressRef.current = p
      setProgress(p)
      if (done && p >= 100 && !doneRef.current) {
        doneRef.current = true
        if (onDone) setTimeout(onDone, 900)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [controlled, done, estimatedMs, milestones.length, onDone])

  // Controlled + running: the caller's percentage IS the value, so derive it
  // during render (below) instead of mirroring a prop into state.
  //
  // Controlled + done: ease the last real value up to 100, then fire onDone.
  useEffect(() => {
    if (!controlled || !done) return
    // Start the ease where the bar actually is, not from zero.
    progressRef.current = Math.max(
      progressRef.current,
      Math.min(99, Math.max(0, controlledProgress ?? 0)),
    )
    let raf = 0
    const tick = () => {
      let p = progressRef.current
      p = Math.min(p + (100 - p) * 0.08 + 0.5, 100)
      if (p >= 99.6) p = 100
      progressRef.current = p
      setProgress(p)
      if (p >= 100 && !doneRef.current) {
        doneRef.current = true
        if (onDone) setTimeout(onDone, 900)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [controlled, done, controlledProgress, onDone])

  useEffect(() => {
    const t = setInterval(
      () => setCurrentTip((c) => (c + 1) % tips.length),
      6000,
    )
    return () => clearInterval(t)
  }, [tips.length])

  // While running under caller control the prop is the truth; the animated
  // state only takes over for the simulated climb and the finishing ease.
  const controlledRunning =
    controlled && !done ? Math.min(99, Math.max(0, controlledProgress ?? 0)) : null
  const shown = controlledRunning ?? progress

  const allDone = shown >= 100
  const stepWidth = 90 / Math.max(1, milestones.length)
  const activeIdx = allDone
    ? milestones.length
    : activeMilestone != null
      ? Math.min(milestones.length - 1, Math.max(0, activeMilestone))
      : Math.min(milestones.length - 1, Math.floor(shown / stepWidth))
  // Indeterminate ends the moment the work does — the finishing fill is real.
  const shimmer = indeterminate && !allDone && !done

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!allDone}
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(120% 80% at 50% -10%, #EEEFFE 0%, #F4F5FB 45%, #F4F5FB 100%)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -80,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle,rgba(64,64,200,.18),transparent 70%)",
          animation: "onb-float 11s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -140,
          left: -90,
          width: 360,
          height: 360,
          borderRadius: "50%",
          background:
            "radial-gradient(circle,rgba(91,201,226,.14),transparent 70%)",
          animation: "onb-float2 13s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "min(520px, 100%)",
          padding: "36px 34px",
          textAlign: "center",
          background: "#fff",
          border: "1px solid #E2E4F0",
          borderRadius: 16,
          animation: "onb-rise .5s ease",
          boxShadow: "0 30px 70px rgba(20,22,40,.14)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <AnimatedLoader />
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-.4px",
            margin: "18px 0 4px",
            background: "linear-gradient(90deg,#1A1D2E,#4040C8,#1A1D2E)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "onb-sheen 5s linear infinite",
          }}
        >
          {allDone && doneTitle ? doneTitle : title}
        </h1>
        <p style={{ fontSize: 12, color: "#9BA3C4", margin: "0 0 22px" }}>
          {allDone && doneSubtitle ? doneSubtitle : subtitle}
        </p>

        {headerExtra && <div style={{ marginBottom: 22 }}>{headerExtra}</div>}

        <div
          style={{
            background: "#FAFBFE",
            border: "1px solid #ECEEF8",
            borderRadius: 14,
            padding: "10px 20px",
            textAlign: "left",
          }}
        >
          {milestones.map((label, i) => (
            <MilestoneRow
              key={label}
              label={label}
              status={
                allDone || i < activeIdx
                  ? "complete"
                  : i === activeIdx
                    ? "active"
                    : "pending"
              }
            />
          ))}
        </div>

        {showProgress ? (
          <>
            <div
              style={{
                position: "relative",
                height: 9,
                background: "#E8EAF5",
                borderRadius: 9,
                overflow: "hidden",
                margin: "22px 0 8px",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: shimmer ? "32%" : `${Math.round(shown)}%`,
                  borderRadius: 9,
                  background: "linear-gradient(90deg,#4040C8,#5BC9E2,#4040C8)",
                  backgroundSize: "200% auto",
                  animation: shimmer
                    ? "onb-indeterminate 1.5s ease-in-out infinite, onb-sheen 1.6s linear infinite"
                    : "onb-sheen 1.6s linear infinite",
                  transition: shimmer ? undefined : "width .25s ease",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#5A6080",
                fontFamily: "var(--font-dm-mono), monospace",
                fontWeight: 700,
                marginBottom: 24,
              }}
            >
              {progressCaption != null && !allDone
                ? progressCaption
                : `${Math.round(shown)}% complete`}
            </div>
          </>
        ) : (
          <div style={{ height: 24 }} />
        )}

        <div
          key={currentTip}
          style={{
            display: "flex",
            gap: 11,
            textAlign: "left",
            padding: "13px 16px",
            background: "linear-gradient(180deg,#FAFAFE,#F4F5FF)",
            border: "1px solid #E5E7FF",
            borderRadius: 12,
            fontSize: 12,
            color: "#5A6080",
            lineHeight: 1.55,
            animation: "onb-rise .5s ease",
          }}
        >
          <span aria-hidden style={{ flexShrink: 0, fontSize: 14 }}>
            💡
          </span>
          <span>
            <strong style={{ color: "#1A1D2E" }}>Did you know?</strong>{" "}
            {tips[currentTip]}
          </span>
        </div>

        {footer && <div style={{ marginTop: 18 }}>{footer}</div>}
      </div>
    </div>
  )
}
