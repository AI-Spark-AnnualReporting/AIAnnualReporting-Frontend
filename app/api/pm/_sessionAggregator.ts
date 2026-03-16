/**
 * Server-side utility: aggregate department sessions per cycle.
 *
 * WHY THIS EXISTS:
 *   GET /pm/dashboard/{cycle_id} has a confirmed backend bug — it always returns
 *   departments:[] even when sessions exist.  GET /admin/cycles/{id}/overview has
 *   the same bug.  Neither /admin/sessions nor /pm/sessions exist in the API.
 *
 *   Workaround: for each dept user in the system, we log in (server-side only)
 *   and call GET /department/dashboard, then filter to the requested cycle.
 *   This gives us real session data that we inject back into the PM dashboard.
 *
 * CACHING STRATEGY (all module-level, survives between requests in Next.js dev/prod):
 *   - tokenCache      : JWT per user email, 45 s TTL
 *   - deptUsersCache  : list of dept users from /admin/users, 60 s TTL
 *   - dashboardCache  : full /department/dashboard payload per user, 10 s TTL
 *
 *   The 10 s dashboard cache is the critical optimisation:
 *   fetchSessionsForCycle is called once per cycle in the list route (10 cycles),
 *   but every dept user's dashboard is fetched only ONCE per 10 s window and
 *   shared across all cycle lookups, reducing 60 network calls to 6.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL!
const SERVICE_EMAIL = process.env.ADMIN_SERVICE_EMAIL!
const SERVICE_PASSWORD = process.env.ADMIN_SERVICE_PASSWORD!
const DEPT_PASSWORD = process.env.DEPT_USER_DEFAULT_PASSWORD ?? SERVICE_PASSWORD

// ── Global caches (shared across all Next.js route handlers in the same process) ──
// Module-level `const` would give each route its own instance.
// Attaching to `globalThis` ensures a single shared store process-wide.

interface CachedToken { token: string; expiresAt: number }
interface DeptUser { user_id: string; email: string; role: string }
interface CachedDashboard { assignments: DeptSession[]; expiresAt: number }
interface CachedCycles { cycles: Record<string, unknown>[]; expiresAt: number }

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any
const tokenCache: Map<string, CachedToken>         = g.__pmTokenCache      ??= new Map()
const dashboardCache: Map<string, CachedDashboard> = g.__pmDashboardCache  ??= new Map()
// Scalar caches synced to globalThis on write so all route handlers share them
function getDeptUsersCached(): { users: DeptUser[]; expiresAt: number } | null {
  return g.__pmDeptUsersCache ?? null
}
function setDeptUsersCache(v: { users: DeptUser[]; expiresAt: number } | null) {
  g.__pmDeptUsersCache = v
}
function getAdminCyclesCached(): CachedCycles | null { return g.__pmAdminCycles ?? null }
function setAdminCyclesCache(v: CachedCycles | null) { g.__pmAdminCycles = v }
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Token cache ───────────────────────────────────────────────────────────────

// Sentinel value cached for users whose login fails, so we don't retry on every request
const LOGIN_FAILED = "__FAILED__"

async function loginAs(email: string, password: string): Promise<string | null> {
  const now = Date.now()
  const cached = tokenCache.get(email)
  if (cached && now < cached.expiresAt) {
    return cached.token === LOGIN_FAILED ? null : cached.token
  }

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    })
    if (!res.ok) {
      // Cache the failure for 30 s so we don't hammer Azure with repeated bad logins
      tokenCache.set(email, { token: LOGIN_FAILED, expiresAt: now + 30_000 })
      return null
    }
    const data = await res.json()
    const token: string = data.access_token
    if (!token) {
      tokenCache.set(email, { token: LOGIN_FAILED, expiresAt: now + 30_000 })
      return null
    }
    tokenCache.set(email, { token, expiresAt: now + 45_000 }) // 45 s
    return token
  } catch {
    tokenCache.set(email, { token: LOGIN_FAILED, expiresAt: now + 30_000 })
    return null
  }
}

// ── Dept user list cache ──────────────────────────────────────────────────────

async function getDeptUsers(serviceToken: string): Promise<DeptUser[]> {
  const now = Date.now()
  const cached = getDeptUsersCached()
  if (cached && now < cached.expiresAt) return cached.users

  try {
    const res = await fetch(`${API_BASE}/admin/users`, {
      headers: { Authorization: `Bearer ${serviceToken}` },
      cache: "no-store",
    })
    if (!res.ok) return []
    const raw = await res.json()
    // The API may return a plain array OR { success, users: [...] } — handle both
    const allUsers: DeptUser[] = Array.isArray(raw) ? raw : (raw.users ?? [])
    const users = allUsers.filter((u) => u.role === "department_user")
    setDeptUsersCache({ users, expiresAt: now + 60_000 }) // 60 s
    return users
  } catch {
    return []
  }
}

/**
 * Fetch admin cycles list, cached 15 s on globalThis.
 * Used by both the list route and the cycle-detail route to get cycle metadata
 * without calling the broken GET /pm/dashboard/{cycleId} each time.
 */
export async function getAdminCycles(
  serviceToken: string
): Promise<Record<string, unknown>[]> {
  const now = Date.now()
  const cached = getAdminCyclesCached()
  if (cached && now < cached.expiresAt) return cached.cycles

  try {
    const res = await fetch(`${API_BASE}/admin/cycles`, {
      headers: { Authorization: `Bearer ${serviceToken}` },
      cache: "no-store",
    })
    if (!res.ok) return []
    const raw = await res.json()
    const cycles: Record<string, unknown>[] = Array.isArray(raw)
      ? raw
      : (raw.cycles ?? raw.data ?? [])
    setAdminCyclesCache({ cycles, expiresAt: now + 15_000 }) // 15 s
    return cycles
  } catch {
    return []
  }
}

// ── Per-user dashboard cache ──────────────────────────────────────────────────
// KEY OPTIMISATION: cache the full dashboard per user so that fetching sessions
// for 10 cycles costs 6 HTTP calls (one per user), not 60 (6 × 10 cycles).
// dashboardCache is on globalThis so both the list and cycle-detail routes share it.

async function getDeptDashboard(email: string, token: string): Promise<DeptSession[]> {
  const now = Date.now()
  const cached = dashboardCache.get(email)
  if (cached && now < cached.expiresAt) return cached.assignments

  try {
    const res = await fetch(`${API_BASE}/department/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!res.ok) return []
    const data = await res.json()
    const assignments: DeptSession[] = Array.isArray(data.assignments)
      ? data.assignments
      : []
    dashboardCache.set(email, { assignments, expiresAt: now + 10_000 }) // 10 s
    return assignments
  } catch {
    return []
  }
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface DeptSession {
  session_id: string
  cycle_id: string
  department_id: string
  department_name: string
  department_code: string
  cycle_name: string
  fiscal_year: number
  submission_deadline: string
  status: string
  progress_percentage: number
  has_questions: boolean
  user_email?: string
  user_name?: string
  submitted_at?: string | null
}

// ── Service token helper ──────────────────────────────────────────────────────

export async function getServiceToken(): Promise<string> {
  const cached = tokenCache.get(SERVICE_EMAIL)
  if (cached && Date.now() < cached.expiresAt) return cached.token
  const token = await loginAs(SERVICE_EMAIL, SERVICE_PASSWORD)
  if (!token) throw new Error("Service login failed")
  return token
}

/** Decode user_id from a JWT without verifying the signature. */
export function decodeUserId(jwt: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString())
    return payload.user_id ?? null
  } catch {
    return null
  }
}

// ── Core aggregation helpers ──────────────────────────────────────────────────

/**
 * Fetch every dept user's dashboard in parallel and return a flat deduplicated
 * list of ALL assignments across all users, annotated with user_email.
 * Results are cached 10 s per user, so calling this repeatedly is cheap.
 */
async function fetchAllAssignments(serviceToken: string): Promise<DeptSession[]> {
  const deptUsers = await getDeptUsers(serviceToken)
  if (deptUsers.length === 0) return []

  const results = await Promise.all(
    deptUsers.map(async (u) => {
      const token = await loginAs(u.email, DEPT_PASSWORD)
      if (!token) return [] as DeptSession[]
      const assignments = await getDeptDashboard(u.email, token)
      return assignments.map((a) => ({ ...a, user_email: u.email }))
    })
  )

  // Flatten and deduplicate by session_id
  const seen = new Set<string>()
  const flat: DeptSession[] = []
  for (const list of results) {
    for (const s of list) {
      if (!seen.has(s.session_id)) {
        seen.add(s.session_id)
        flat.push(s)
      }
    }
  }
  return flat
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return sessions for a single cycle.
 * Internally calls fetchAllAssignments (cached) and filters by cycleId,
 * so repeated calls across multiple cycles cost only one set of HTTP calls.
 */
export async function fetchSessionsForCycle(
  cycleId: string,
  serviceToken: string
): Promise<DeptSession[]> {
  const all = await fetchAllAssignments(serviceToken)
  return all.filter((s) => s.cycle_id === cycleId)
}

/**
 * Return all sessions grouped by cycle_id.
 * Use this in the list route to populate multiple cycles at once.
 */
export async function fetchAllSessionsByCycle(
  serviceToken: string
): Promise<Map<string, DeptSession[]>> {
  const all = await fetchAllAssignments(serviceToken)
  const map = new Map<string, DeptSession[]>()
  for (const s of all) {
    const list = map.get(s.cycle_id) ?? []
    list.push(s)
    map.set(s.cycle_id, list)
  }
  return map
}

/**
 * Fetch the full session detail for a PM by impersonating the dept user who owns it.
 * Uses fetchAllAssignments (cached) to find the owner, then calls
 * GET /department/sessions/{sessionId} with the dept user's token.
 */
export async function getSessionForPM(
  sessionId: string,
  serviceToken: string
): Promise<Record<string, unknown> | null> {
  const all = await fetchAllAssignments(serviceToken)
  const meta = all.find((s) => s.session_id === sessionId)
  if (!meta?.user_email) return null

  const deptToken = await loginAs(meta.user_email, DEPT_PASSWORD)
  if (!deptToken) return null

  try {
    const res = await fetch(`${API_BASE}/department/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${deptToken}` },
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>

    // The backend stores department_name as "Unknown" in the session detail.
    // Enrich with the correct values from the aggregator (sourced from /department/dashboard).
    const session = (data.session ?? data) as Record<string, unknown>
    if (!session.department_name || session.department_name === "Unknown") {
      session.department_name = meta.department_name
    }
    if (!session.department_code) {
      session.department_code = meta.department_code
    }
    if (!session.cycle_name) {
      session.cycle_name = meta.cycle_name
    }

    return data
  } catch {
    return null
  }
}

/** Build PMDashboard-style stats from a list of sessions. */
export function buildStats(sessions: DeptSession[]) {
  const total = sessions.length
  const submitted = sessions.filter((s) => s.status === "submitted").length
  const reviewed = sessions.filter((s) => s.status === "reviewed").length
  const approved = sessions.filter((s) => s.status === "approved").length
  const inProgress = sessions.filter((s) => s.status === "in_progress").length
  const notStarted = sessions.filter((s) => s.status === "not_started").length
  const completionRate =
    total > 0 ? Math.round(((submitted + reviewed + approved) / total) * 100) : 0
  return {
    total_departments: total,
    submitted,
    reviewed,
    approved,
    in_progress: inProgress,
    not_started: notStarted,
    completion_rate: completionRate,
  }
}
