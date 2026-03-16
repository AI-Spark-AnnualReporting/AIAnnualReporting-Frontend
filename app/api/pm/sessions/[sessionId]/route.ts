import { NextRequest, NextResponse } from "next/server"
import { getServiceToken, getSessionForPM, decodeUserId } from "../../_sessionAggregator"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  // Verify caller is authenticated (PM token must be present)
  const authHeader = req.headers.get("authorization") ?? ""
  const pmToken = authHeader.replace("Bearer ", "").trim()
  if (!pmToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = decodeUserId(pmToken)
  if (!userId) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }

  try {
    const serviceToken = await getServiceToken()
    const sessionData = await getSessionForPM(sessionId, serviceToken)

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    return NextResponse.json(sessionData)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
