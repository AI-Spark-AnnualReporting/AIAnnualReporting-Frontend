/**
 * Design2 (dev testing): stream one assembled section's structured blocks.
 *
 * This is the one call in the app that bypasses axios, and two hard
 * constraints force it:
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
import { parseSseFrames } from "@/lib/sseFrames"
import { apiClient } from "./client"

/** A stage of the extraction, announced as it starts. */
export interface DesignBlockStep {
  index: number
  total: number
  key: string
  label: string
  /** True only for the model call — the one stage with no measurable progress. */
  indeterminate: boolean
}

/** A measured detail about the stage that just ran. */
export interface DesignBlockNote {
  index: number
  text: string
}

export interface DesignBlocksNumeric {
  label: string
  /** Copied verbatim from the report, e.g. "$104.7 billion" — never a number. */
  value_current: string
  value_prior: string | null
  unit: string | null
  period_current: string | null
  period_prior: string | null
}

export interface DesignBlocksTable {
  title: string | null
  columns: string[]
  rows: string[][]
}

export interface DesignBlocksQuote {
  text: string
  attribution: string | null
}

export interface DesignBlocksResult {
  section_code: string
  narrative_blocks: string[]
  numeric_data: DesignBlocksNumeric[]
  tables: DesignBlocksTable[]
  pull_quotes: DesignBlocksQuote[]
}

export interface DesignBlocksError {
  status: number
  code: string
  message: string
  index?: number
}

export interface DesignBlocksHandlers {
  onStep(step: DesignBlockStep): void
  onNote(note: DesignBlockNote): void
  onResult(result: DesignBlocksResult): void
  onError(error: DesignBlocksError): void
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
export async function streamSectionDesignBlocks(
  cycleId: string,
  sectionCode: string,
  handlers: DesignBlocksHandlers,
  signal: AbortSignal,
): Promise<void> {
  // Reuse the resolved axios base rather than re-reading the env var: the
  // fallback lives in client.ts and only one copy of it should exist. The
  // trim matters — .env carries a trailing space after /api/v1.
  const base = (apiClient.defaults.baseURL ?? "").trim().replace(/\/+$/, "")
  const url =
    `${base}/pm/cycles/${encodeURIComponent(cycleId)}` +
    `/sections/${encodeURIComponent(sectionCode)}/design2-blocks`

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
          handlers.onStep(payload as DesignBlockStep)
        } else if (frame.event === "note") {
          handlers.onNote(payload as DesignBlockNote)
        } else if (frame.event === "result") {
          handlers.onResult(payload as DesignBlocksResult)
        } else if (frame.event === "error") {
          handlers.onError(payload as DesignBlocksError)
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
