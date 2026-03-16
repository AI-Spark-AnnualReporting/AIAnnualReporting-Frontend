/**
 * GET /api/pm/cycles/[cycleId]
 *
 * Server-side proxy for the PM cycle dashboard.
 *
 * The backend GET /pm/dashboard/{cycle_id} has a confirmed bug that always
 * returns departments:[].  This route works around it by:
 *   1. Getting cycle metadata from the cached admin cycles list (getAdminCycles).
 *   2. Aggregating real department sessions via fetchSessionsForCycle, which
 *      uses the globalThis dashboard cache warmed by the list route.
 *   3. Returning a fully populated PM dashboard response.
 *
 * After the list route (/api/pm/cycles) has run, both the admin cycles list and
 * every dept user's dashboard are cached on globalThis.  This route therefore
 * completes in ~200 ms on warm cache instead of ~8 s on cold.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  getServiceToken,
  getAdminCycles,
  fetchSessionsForCycle,
  buildStats,
  DeptSession,
} from "../../_sessionAggregator"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cycleId: string }> }
) {
  try {
    const { cycleId } = await params

    // 1. Get the shared service token (cached 45 s)
    const serviceToken = await getServiceToken()

    // 2. Get cycle metadata from the cached admin cycles list.
    //    This avoids calling the broken GET /pm/dashboard/{cycleId} which always
    //    returns departments:[] AND adds ~1-2 s of extra latency.
    const allCycles = await getAdminCycles(serviceToken)
    const cycleRecord = allCycles.find((c) => c.id === cycleId) ?? {}

    // 3. Aggregate real department sessions (uses globalThis dashboard cache)
    const sessions: DeptSession[] = await fetchSessionsForCycle(cycleId, serviceToken)

    // 4. Build proper stats from real session data
    const stats = buildStats(sessions)

    // 5. Shape sessions into the DepartmentProgress schema the frontend expects
    const departments = sessions.map((s) => ({
      session_id: s.session_id,
      department_id: s.department_id,
      department_name: s.department_name,
      department_code: s.department_code,
      user_id: "",
      user_name: s.user_name ?? s.user_email ?? "",
      user_email: s.user_email ?? "",
      status: s.status,
      progress_percentage: s.progress_percentage,
      submitted_at: s.submitted_at ?? null,
      updated_at: null,
    }))

    return NextResponse.json({
      success: true,
      cycle: cycleRecord,
      stats,
      departments,
    })
  } catch (err: unknown) {
    console.error("[/api/pm/cycles/[cycleId]] Error:", err)
    return NextResponse.json(
      { error: (err as Error).message ?? "Internal server error" },
      { status: 500 }
    )
  }
}
