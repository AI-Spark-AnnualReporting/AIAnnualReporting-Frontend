import { NextRequest, NextResponse } from "next/server"
import {
  getServiceToken,
  fetchSessionsForCycle,
  decodeUserId,
  getAdminCycles,
} from "../../../_sessionAggregator"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL!
const DEPT_PASSWORD = process.env.DEPT_USER_DEFAULT_PASSWORD ?? process.env.ADMIN_SERVICE_PASSWORD!

async function loginAs(email: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: DEPT_PASSWORD }),
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token ?? null
  } catch {
    return null
  }
}

/**
 * GET /api/pm/cycles/[cycleId]/full-report
 *
 * Assembles the full annual report by fetching every approved session's
 * final_submission (or ai_generated_draft fallback) via server-side impersonation,
 * then wrapping them in a structured Markdown document.
 *
 * WHY THIS EXISTS:
 *   POST /pm/cycles/{id}/generate-report returns only a ~1000-char report_preview.
 *   There is no backend endpoint to retrieve the full stored report by report_id.
 *   This route works around that by pulling the raw session content directly.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cycleId: string }> }
) {
  const { cycleId } = await params

  const authHeader = req.headers.get("authorization") ?? ""
  const pmToken = authHeader.replace("Bearer ", "").trim()
  if (!pmToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = decodeUserId(pmToken)
  if (!userId) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  try {
    const serviceToken = await getServiceToken()

    // ── Get cycle metadata ────────────────────────────────────────────────────
    const allCycles = await getAdminCycles(serviceToken)
    const cycle = allCycles.find(
      (c) => c.id === cycleId || c.cycle_id === cycleId
    ) as Record<string, unknown> | undefined

    const cycleName  = (cycle?.cycle_name  as string) ?? "Annual Report"
    const fiscalYear = (cycle?.fiscal_year as number) ?? new Date().getFullYear()

    // ── Get all sessions for this cycle ───────────────────────────────────────
    const sessions = await fetchSessionsForCycle(cycleId, serviceToken)

    // Only include submitted / approved sessions in the report
    const includedStatuses = new Set(["submitted", "approved"])
    const reportSessions = sessions.filter((s) => includedStatuses.has(s.status))

    if (reportSessions.length === 0) {
      return NextResponse.json(
        { error: "No submitted sessions found for this cycle" },
        { status: 404 }
      )
    }

    // ── Fetch full content for each session via dept-user impersonation ───────
    interface SectionData {
      department_name: string
      department_code: string
      status: string
      content: string
    }

    const sections: SectionData[] = []

    await Promise.all(
      reportSessions.map(async (s) => {
        if (!s.user_email) return

        const deptToken = await loginAs(s.user_email)
        if (!deptToken) return

        try {
          const res = await fetch(`${API_BASE}/department/sessions/${s.session_id}`, {
            headers: { Authorization: `Bearer ${deptToken}` },
            cache: "no-store",
          })
          if (!res.ok) return

          const data = await res.json()
          const session = (data.session ?? data) as Record<string, unknown>

          // Prefer final_submission → ai_generated_draft → answers concatenation
          const content =
            (session.final_submission as string | null) ??
            (session.ai_generated_draft as string | null) ??
            buildContentFromAnswers(session)

          if (content) {
            sections.push({
              department_name: s.department_name || (session.department_name as string) || "Unknown",
              department_code: s.department_code || (session.department_code as string) || "",
              status: s.status,
              content: content.trim(),
            })
          }
        } catch {
          // Skip sessions that fail to load
        }
      })
    )

    if (sections.length === 0) {
      return NextResponse.json(
        { error: "Could not retrieve content for any session" },
        { status: 500 }
      )
    }

    // Sort sections alphabetically by department name for consistent output
    sections.sort((a, b) => a.department_name.localeCompare(b.department_name))

    // ── Assemble Markdown document ────────────────────────────────────────────
    const now = new Date()
    const dateStr = now.toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    })

    const lines: string[] = [
      `# ${cycleName}`,
      `## Annual Report — Fiscal Year ${fiscalYear}`,
      "",
      `**Generated:** ${dateStr}  `,
      `**Departments included:** ${sections.length}`,
      "",
      "---",
      "",
      "## Table of Contents",
      "",
      ...sections.map((s, i) => `${i + 1}. [${s.department_name}](#section-${i + 1})`),
      "",
      "---",
      "",
    ]

    sections.forEach((s, i) => {
      lines.push(`## ${i + 1}. ${s.department_name}`)
      if (s.department_code) {
        lines.push(`*Department Code: ${s.department_code}*`)
      }
      lines.push("")
      lines.push(s.content)
      lines.push("")
      lines.push("---")
      lines.push("")
    })

    const report = lines.join("\n")

    return new NextResponse(report, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="annual-report-${fiscalYear}-${cycleId.slice(0, 8)}.md"`,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Fallback: build readable content from Q&A pairs when no draft/submission exists. */
function buildContentFromAnswers(session: Record<string, unknown>): string | null {
  const answers = session.answers as Array<{
    question: string
    answer: string
  }> | undefined

  if (!Array.isArray(answers) || answers.length === 0) return null

  return answers
    .filter((a) => a.answer?.trim())
    .map((a) => `**${a.question}**\n\n${a.answer}`)
    .join("\n\n")
}
