/**
 * One section's blocks: the shape, the stream that produces them, and the
 * render that turns them into sheets.
 *
 * `blocks` keeps its name deliberately. It is a wire-format word shared with
 * the render engine — Centriton's /reports/render-page and /reports/page-options
 * both take a `blocks` body, and the stored envelope's per-unit field is
 * `unit.blocks`. The Create Design feature owns the envelope around these; it
 * does not own the payload's name.
 *
 * streamSectionBlocks bypasses axios, and two hard constraints force it:
 *   • axios cannot stream a response body in the browser — it resolves once,
 *     with the whole body, which is exactly what this endpoint must not do;
 *   • the native EventSource cannot send an Authorization header, and auth
 *     here is a bearer token read from localStorage.
 *
 * So: fetch + response.body.getReader(). The two header rules below are a
 * deliberate mirror of the request interceptor in ./client.ts — if that one
 * ever gains a header, this needs it too.
 *
 * The types live here rather than in @/types because this is scaffolding for a
 * later design pass; promote them next to FinalReportSection if that pass
 * keeps them.
 */
import { getActingCompany } from "@/lib/actingCompany"
import { noteEpoch } from "@/lib/createDesignCache"
import { parseSseFrames } from "@/lib/sseFrames"
import { apiClient } from "./client"

/** A stage of the extraction, announced as it starts. */
export interface CreateDesignStep {
  index: number
  total: number
  key: string
  label: string
  /** True only for the model call — the one stage with no measurable progress. */
  indeterminate: boolean
}

/** A measured detail about the stage that just ran. */
export interface CreateDesignNote {
  index: number
  text: string
}

/**
 * One prose block, carrying the author's own structure.
 *
 * Was `string[]`. The report's `###` subheadings survive every upstream
 * transform and were then flattened here into ordinary paragraphs — 50 of 63
 * headings on one real cycle simply disappeared. `kind` is what lets a page
 * set a subheading AS a subheading instead of guessing from its length.
 */
export interface SectionNarrativeBlock {
  kind: "heading" | "paragraph"
  text: string
}

export interface SectionNumericBlock {
  label: string
  /** Copied verbatim from the report, e.g. "$104.7 billion" — never a number. */
  value_current: string
  value_prior: string | null
  unit: string | null
  period_current: string | null
  period_prior: string | null
}

export interface SectionTableBlock {
  title: string | null
  columns: string[]
  rows: string[][]
}

export interface SectionQuoteBlock {
  text: string
  attribution: string | null
}

export interface SectionBlocks {
  section_code: string
  narrative_blocks: SectionNarrativeBlock[]
  numeric_data: SectionNumericBlock[]
  tables: SectionTableBlock[]
  pull_quotes: SectionQuoteBlock[]
}

export interface CreateDesignStreamError {
  status: number
  code: string
  message: string
  index?: number
}

export interface CreateDesignStreamHandlers {
  onStep(step: CreateDesignStep): void
  onNote(note: CreateDesignNote): void
  onResult(result: SectionBlocks): void
  onError(error: CreateDesignStreamError): void
}

/**
 * Open the stream and drive the handlers until the server says `done`.
 *
 * Failure arrives down one of two channels and the caller should not have to
 * care which: a pre-stream rejection is a real HTTP status (401/403/404),
 * while anything after the first byte can only be an `error` frame, because
 * the status line is already committed to 200. Both are normalised into
 * onError.
 *
 * Resolves when the stream ends or is aborted; never rejects.
 */
export async function streamSectionBlocks(
  cycleId: string,
  sectionCode: string,
  handlers: CreateDesignStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  // Reuse the resolved axios base rather than re-reading the env var: the
  // fallback lives in client.ts and only one copy of it should exist. The
  // trim matters — .env carries a trailing space after /api/v1.
  const base = (apiClient.defaults.baseURL ?? "").trim().replace(/\/+$/, "")
  const url =
    `${base}/pm/cycles/${encodeURIComponent(cycleId)}` +
    `/sections/${encodeURIComponent(sectionCode)}/create-design-blocks`

  const headers: Record<string, string> = { Accept: "text/event-stream" }
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token")
    if (token) headers.Authorization = `Bearer ${token}`
    // Spark staff acting as a company. Omitting this sends the request to the
    // wrong tenant, which surfaces as a 404 on a cycle that is on screen.
    const company = getActingCompany()
    if (company) headers["X-Company-Id"] = company
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal,
      cache: "no-store",
    })

    if (!res.ok) {
      // The pre-stream channel: the guard refused before any byte was written,
      // so this is a normal JSON error body.
      const body = await res.json().catch(() => null)
      handlers.onError({
        status: res.status,
        code: body?.error ?? "HTTP_ERROR",
        message: body?.detail ?? body?.message ?? res.statusText,
      })
      return
    }

    if (!res.body) {
      handlers.onError({
        status: 0,
        code: "NO_STREAM",
        message: "This browser returned no readable stream.",
      })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder("utf-8")
    let buffer = ""

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      // stream: true so a multi-byte character split across chunks is held
      // back rather than decoded into a replacement char.
      buffer += decoder.decode(value, { stream: true })

      const { frames, rest } = parseSseFrames(buffer)
      buffer = rest

      for (const frame of frames) {
        let payload: unknown
        try {
          payload = JSON.parse(frame.data)
        } catch {
          continue
        }

        if (frame.event === "step") {
          handlers.onStep(payload as CreateDesignStep)
        } else if (frame.event === "note") {
          handlers.onNote(payload as CreateDesignNote)
        } else if (frame.event === "result") {
          handlers.onResult(payload as SectionBlocks)
        } else if (frame.event === "error") {
          handlers.onError(payload as CreateDesignStreamError)
        } else if (frame.event === "done") {
          // The one termination signal. Cancel rather than fall out of the
          // loop so the connection closes immediately.
          await reader.cancel().catch(() => {})
          return
        }
      }
    }
  } catch (e) {
    // Aborting is the caller closing the dialog or switching section — not an
    // error, and showing one there would be noise.
    if ((e as Error)?.name === "AbortError") return
    handlers.onError({
      status: 0,
      code: "NETWORK",
      message: (e as Error)?.message || "The connection failed.",
    })
  }
}

/**
 * Typeset one already-extracted section as a designed page.
 *
 * Hands the blocks straight back to the server, which picks a page template,
 * fills its slots and prints the sheet. Returns an object URL for an <img>;
 * the caller owns it and must revoke it.
 *
 * Plain axios, unlike the streaming call above — this one is a single request
 * with a single answer, and the engine launches a browser per render, so the
 * timeout is the long one.
 */

/**
 * Typeset one page unit and get back EVERY sheet it produces.
 *
 * Templates no longer cap their content, so a section with seventeen figures
 * legitimately runs to several sheets. Returning only the first would hide
 * exactly the content that change exists to stop losing.
 *
 * Data URIs rather than object URLs: there is nothing to revoke, so the
 * render cache can outlive the components that fill it without leaking.
 */
export interface RenderedPages {
  template_key: string
  /** Which build of the drawing code produced these images. */
  epoch?: string
  page_count: number
  counts: Record<string, number>
  dropped: Record<string, number>
  pages: string[]
}

export async function renderSectionPages(
  cycleId: string,
  body: {
    blocks: SectionBlocks
    title?: string
    eyebrow?: string
    running_label?: string
    template_key?: string
    /** Positions, per source array, of blocks that should open a fresh sheet. */
    breaks?: Record<string, number[]>
    /**
     * How finely to rasterise, in multiples of the PDF's own 72dpi.
     *
     * The engine defaults to 2, which is 1191px across an A4 page — enough for
     * the thumbnail column and slightly short of a Retina screen showing the
     * page full width. Ask for more only for a page someone is actually
     * looking at: the pixmap grows with the square, so 4 is four times the
     * bytes of 2. Clamped to 1..4 server-side.
     */
    scale?: number
  },
): Promise<RenderedPages> {
  const { data } = await apiClient.post<RenderedPages>(
    `/pm/cycles/${encodeURIComponent(cycleId)}/create-design-page`,
    body,
    { timeout: 180000 },
  )
  noteEpoch(data?.epoch)
  return data
}


/** One item of a batch render: its pages, or why it has none. */
export interface RenderedBatchItem {
  template_key: string
  page_count: number
  pages: string[]
  error?: string
}

/**
 * Typeset MANY pages in one request.
 *
 * The engine draws a whole batch in a single browser, and most of a render is
 * browser startup — so this is several times faster than the same pages one
 * at a time. Used by the pre-warm, never by the panel: the panel renders one
 * page that someone is waiting for, and should not queue behind a batch.
 *
 * Partial results are normal. An item that could not be drawn comes back with
 * `pages: []` and an `error`, in its own slot, so one bad section cannot cost
 * its siblings their renders.
 */
export async function renderSectionPagesBatch(
  cycleId: string,
  items: Array<Record<string, unknown>>,
): Promise<{ items: RenderedBatchItem[] }> {
  const { data } = await apiClient.post(
    `/pm/cycles/${encodeURIComponent(cycleId)}/create-design-pages`,
    { items },
    // A batch is many renders; it needs many renders' worth of time.
    { timeout: 600000 },
  )
  noteEpoch(data?.epoch)
  return { items: data?.items ?? [] }
}
