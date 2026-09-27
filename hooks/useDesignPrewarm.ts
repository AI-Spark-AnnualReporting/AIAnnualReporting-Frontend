"use client"

/**
 * Draw every section's page before anyone asks for it.
 *
 * The designer used to draw a page per click: open a section, wait two or
 * three seconds, open the next, wait again. Nineteen sections meant nineteen
 * waits before a PM had seen their own report.
 *
 * This runs in the background once the screen is interactive and fills the
 * render cache, so by the time someone clicks, the page is already there.
 *
 * TWO THINGS MAKE IT HONEST RATHER THAN JUST EARLIER:
 *
 *   * It batches. The engine draws a whole batch in one browser, and most of
 *     a render is browser startup — measured at roughly 3x for real pages.
 *     Firing nineteen single requests instead would be slower than doing
 *     nothing, because they would queue behind each other AND behind the
 *     render the user is waiting for.
 *
 *   * It reprioritises. Selecting a section moves it to the front of the
 *     queue. Without that, clicking the last section still waits for the
 *     eighteen ahead of it — which is the exact experience this exists to
 *     remove, just rearranged.
 */

import { useEffect, useRef } from "react"

import { renderSectionPagesBatch } from "@/lib/api/sectionBlocks"
import { cacheKey, has, prime } from "@/lib/createDesignCache"
import type { DesignSection } from "@/lib/api/createDesign"

// How many pages go in one request. Large enough that browser startup is
// amortised, small enough that the first pages appear early rather than the
// whole report landing at once — and small enough not to hold the render
// container for a minute while a real export waits behind it.
const CHUNK = 5

// A gap between chunks, so the backend is not permanently occupied by work
// nobody asked for. Every request this screen makes — reading the cycle,
// saving a template, drawing the page on screen — is queued behind whatever
// the server is already doing, and back-to-back batches leave no gap for them
// to land in. Long enough to matter, short enough that the pre-warm still
// finishes well before a person has clicked through the report.
const BREATHE_MS = 400

// How many batches in a row may fail before the pre-warm stops trying.
// One failure is a batch that happened to time out; the panel will draw that
// page on demand when someone opens it. Two in a row means the engine is
// having a bad time and the remaining chunks would only make it worse.
const MAX_CONSECUTIVE_FAILURES = 2

interface Job {
  key: string
  sectionCode: string
  body: {
    blocks: unknown
    title: string
    eyebrow: string
    running_label: string
    template_key: string
    breaks?: Record<string, number[]>
  }
}

/**
 * @param active  the section on screen; its pages jump the queue
 */
export function useDesignPrewarm(
  cycleId: string,
  sections: DesignSection[] | undefined,
  active: string | null,
  enabled: boolean,
) {
  // The section on screen, readable from inside the loop without making it a
  // dependency — re-running the whole pre-warm on every click would restart
  // the work it is trying to finish.
  //
  // Written in an effect rather than during render: a render can be thrown
  // away or replayed, and this ref is read by work already in flight.
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  }, [active])

  const startedRef = useRef(false)

  useEffect(() => {
    if (!enabled || !sections?.length || startedRef.current) return
    startedRef.current = true

    const jobs: Job[] = []
    for (const section of sections) {
      if (!section.eligible) continue
      for (const unit of section.design?.units ?? []) {
        const template =
          unit.template_key ??
          unit.options.find((o) => o.recommended)?.key ??
          null
        if (!template) continue
        const key = cacheKey(cycleId, section.section_code, unit.index, template)
        if (has(key)) continue
        jobs.push({
          key,
          sectionCode: section.section_code,
          body: {
            blocks: unit.blocks,
            title: unit.title,
            eyebrow: section.title,
            running_label: "Annual Report",
            template_key: template,
            breaks: unit.breaks,
          },
        })
      }
    }
    if (!jobs.length) return

    let alive = true

    void (async () => {
      const remaining = [...jobs]
      let failures = 0
      while (alive && remaining.length) {
        // Re-sorted every chunk, not once: the section on screen may have
        // changed while the previous chunk was in flight, and the whole point
        // is to serve whoever is waiting now.
        const wanted = activeRef.current
        if (wanted) {
          remaining.sort((a, b) =>
            a.sectionCode === wanted ? -1 : b.sectionCode === wanted ? 1 : 0,
          )
        }
        const chunk = remaining.splice(0, CHUNK)
        try {
          const res = await renderSectionPagesBatch(
            cycleId,
            chunk.map((j) => j.body),
          )
          if (!alive) return
          res.items.forEach((item, i) => {
            const job = chunk[i]
            if (job && item?.pages?.length) prime(job.key, item.pages)
          })
          failures = 0
        } catch {
          // Pre-warming is an optimisation. If it fails the screen still works
          // — the panel renders on demand exactly as it did before — so this
          // must stay silent rather than put an error in front of someone who
          // did not ask for anything.
          //
          // Not silent AND fatal, though: one bad chunk used to abandon every
          // chunk after it, so a single hiccup early on cost the whole report
          // its pre-warm and every later click paid full render time again.
          failures += 1
          if (failures >= MAX_CONSECUTIVE_FAILURES) return
        }
        if (remaining.length) {
          await new Promise((resolve) => setTimeout(resolve, BREATHE_MS))
        }
      }
    })()

    return () => {
      alive = false
    }
  }, [cycleId, sections, enabled])
}
