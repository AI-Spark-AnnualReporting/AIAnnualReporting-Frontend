/**
 * GET /api/pm/cycles
 *
 * Server-side proxy that returns active cycles assigned to the requesting PM,
 * plus real-time pending_reviews and recent_submissions.
 *
 * WHY THIS EXISTS:
 *   The backend has no GET /pm/dashboard list endpoint, only GET /pm/dashboard/{cycle_id}.
 *   Additionally, GET /pm/dashboard/{cycle_id} has a confirmed bug that always returns
 *   departments:[] — even when sessions exist — so we use _sessionAggregator to fetch
 *   real department session data by logging in as each dept user server-side.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  getServiceToken,
  getAdminCycles,
  decodeUserId,
  fetchAllSessionsByCycle,
  DeptSession,
} from "../_sessionAggregator"

type CycleRecord = Record<string, unknown>

export async function GET(req: NextRequest) {
  try {
    // 1. Extract the PM's JWT from the Authorization header
    const auth = req.headers.get("authorization") ?? ""
    const pmToken = auth.startsWith("Bearer ") ? auth.slice(7) : null
    if (!pmToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Decode the PM's user_id from their JWT
    const pmUserId = decodeUserId(pmToken)
    if (!pmUserId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // 3. Fetch all cycles using the service account (cached 15 s on globalThis)
    const serviceToken = await getServiceToken()
    const allCycles: CycleRecord[] = await getAdminCycles(serviceToken)

    // 4. Filter to every cycle where this PM is the project manager
    //    (status is no longer filtered — the UI handles status tabs client-side)
    const myCycles = allCycles.filter(
      (c) => c.project_manager_id === pmUserId
    )

    // 5. Fetch ALL dept sessions in one pass (6 HTTP calls total, not 6×N).
    //    GET /pm/dashboard/{cycleId} always returns departments:[] (backend bug),
    //    so we log in as each dept user and collect their sessions, then group by cycle.
    const sessionsByCycle = await fetchAllSessionsByCycle(serviceToken)

    const cycleDetails = myCycles.map((cycle) => {
      const cycleId = cycle.id as string
      const sessions: DeptSession[] = sessionsByCycle.get(cycleId) ?? []
      return { cycle, sessions }
    })

    // 6. Compute pending_reviews count and recent_submissions from real session data
    let pendingReviews = 0
    const recentSubmissions: CycleRecord[] = []

    for (const { cycle, sessions } of cycleDetails) {
      for (const s of sessions) {
        // Only "submitted" sessions are awaiting PM action — reopened is on the dept user.
        if (s.status === "submitted") {
          pendingReviews++
          recentSubmissions.push({
            session_id: s.session_id,
            department_name: s.department_name,
            department_code: s.department_code,
            cycle_id: cycle.id,
            cycle_name: cycle.cycle_name,
            submitted_at: s.submitted_at ?? new Date().toISOString(),
            status: s.status,
          })
        }
      }
    }

    // Sort newest-first
    recentSubmissions.sort((a, b) => {
      const ta = new Date((a.submitted_at as string) || 0).getTime()
      const tb = new Date((b.submitted_at as string) || 0).getTime()
      return tb - ta
    })

    // 7. Return the full response with real-time data
    return NextResponse.json({
      active_cycles: cycleDetails.map(({ cycle, sessions }) => {
        const assigned = sessions.filter((s) => s.status === "assigned").length
        const notStarted = sessions.filter((s) => s.status === "not_started").length
        const inProgress = sessions.filter((s) => s.status === "in_progress").length
        const submitted = sessions.filter((s) => s.status === "submitted").length
        const approved = sessions.filter((s) => s.status === "approved").length
        const reopened = sessions.filter((s) => s.status === "reopened").length
        const total = sessions.length
        // Only `approved` counts as done — submitted is awaiting PM, reopened is awaiting dept.
        const completionRate = total > 0 ? Math.round((approved / total) * 100) : 0
        return {
          id: cycle.id,
          cycle_name: cycle.cycle_name,
          fiscal_year: cycle.fiscal_year,
          submission_deadline: cycle.submission_deadline,
          start_date: cycle.start_date,
          end_date: cycle.end_date,
          status: cycle.status,
          submitted_count: submitted + approved,
          in_progress_count: inProgress,
          not_started_count: notStarted,
          assigned_count: assigned,
          reopened_count: reopened,
          total_departments: total,
          completion_rate: completionRate,
          kickoff_brief: cycle.kickoff_brief,
        }
      }),
      pending_reviews: pendingReviews,
      recent_submissions: recentSubmissions.slice(0, 10),
    })
  } catch (err: unknown) {
    console.error("[/api/pm/cycles] Error:", err)
    return NextResponse.json(
      { error: (err as Error).message ?? "Internal server error" },
      { status: 500 }
    )
  }
}
