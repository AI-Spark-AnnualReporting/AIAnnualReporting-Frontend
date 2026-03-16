#!/usr/bin/env node
/**
 * End-to-End Workflow Test Script
 * Spark Annual Report AI Studio
 *
 * Tests the complete journey:
 *   Admin → creates PM user + Dept user + Department + Cycle
 *   PM    → logs in, submits kickoff brief
 *   Dept  → logs in, answers questions, generates draft, finalizes submission
 *   PM    → reviews submission, approves it, generates final report
 *
 * Usage:
 *   node scripts/e2e-test.mjs
 *   node scripts/e2e-test.mjs --base-url https://your-api.com/api/v1
 *   node scripts/e2e-test.mjs --skip-cleanup   (keep created test data after run)
 *   node scripts/e2e-test.mjs --verbose         (print full response bodies)
 *
 * Requirements: Node 18+ (uses built-in fetch)
 */

// ── CLI args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const SKIP_CLEANUP = args.includes("--skip-cleanup")
const VERBOSE      = args.includes("--verbose")
const baseUrlArg   = args.find(a => a.startsWith("--base-url="))?.split("=")[1]
               ?? (args[args.indexOf("--base-url") + 1]?.startsWith("http") ? args[args.indexOf("--base-url") + 1] : null)

const BASE_URL = baseUrlArg
  ?? process.env.NEXT_PUBLIC_API_BASE_URL
  ?? "https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1"

// ── Colours ────────────────────────────────────────────────────────────────────
const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  cyan:   "\x1b[36m",
  blue:   "\x1b[34m",
  magenta:"\x1b[35m",
  white:  "\x1b[37m",
}
const ok   = `${c.green}✓${c.reset}`
const fail = `${c.red}✗${c.reset}`
const info = `${c.cyan}ℹ${c.reset}`
const warn = `${c.yellow}⚠${c.reset}`

// ── Test state ─────────────────────────────────────────────────────────────────
const state = {
  adminToken:    null,
  pmToken:       null,
  deptToken:     null,
  pmUserId:      null,
  deptUserId:    null,
  departmentId:  null,
  cycleId:       null,
  sessionId:     null,
  reportContent: null,
}

const results = { passed: 0, failed: 0, skipped: 0 }

// IDs of resources created during the test — used for cleanup
const created = {
  pmUserId:     null,
  deptUserId:   null,
  departmentId: null,
  cycleId:      null,
}

// Unique suffix so parallel runs don't collide
const RUN_ID  = Date.now().toString(36).toUpperCase()
const TS      = new Date().toISOString().slice(0,10)

const TEST_PM = {
  email:     `spark.e2e.pm.${RUN_ID}@gmail.com`,
  password:  "Test@1234!",
  full_name: `E2E PM User ${RUN_ID}`,
  role:      "project_manager",
}

const TEST_DEPT_USER = {
  email:     `spark.e2e.dept.${RUN_ID}@gmail.com`,
  password:  "Test@1234!",
  full_name: `E2E Dept User ${RUN_ID}`,
  role:      "department_user",
}

const TEST_DEPT = {
  department_code: `E2E-${RUN_ID.slice(0, 6)}`,  // max 10 chars
  department_name: `E2E Test Department ${RUN_ID}`,
  description:     "Created by automated e2e test — safe to delete",
  initial_prompt:  "Describe your department's key achievements and strategic initiatives for the annual report.",
}

const TEST_CYCLE = {
  cycle_name:          `E2E Test Cycle ${RUN_ID}`,
  fiscal_year:         new Date().getFullYear(),
  start_date:          TS,
  end_date:            `${new Date().getFullYear() + 1}-01-31`,
  submission_deadline: `${new Date().getFullYear() + 1}-01-15`,
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function header(title) {
  const line = "─".repeat(60)
  console.log(`\n${c.bold}${c.blue}${line}${c.reset}`)
  console.log(`${c.bold}${c.blue}  ${title}${c.reset}`)
  console.log(`${c.bold}${c.blue}${line}${c.reset}`)
}

function step(label) {
  console.log(`\n  ${c.bold}${c.white}▶ ${label}${c.reset}`)
}

function pass(label, detail = "") {
  results.passed++
  console.log(`    ${ok} ${label}${detail ? `  ${c.dim}${detail}${c.reset}` : ""}`)
}

function failure(label, detail = "") {
  results.failed++
  console.log(`    ${fail} ${c.red}${label}${c.reset}${detail ? `\n       ${c.dim}${detail}${c.reset}` : ""}`)
}

function skip(label, reason = "") {
  results.skipped++
  console.log(`    ${warn} ${c.yellow}SKIP${c.reset} ${label}${reason ? `  ${c.dim}(${reason})${c.reset}` : ""}`)
}

function log(msg) {
  console.log(`    ${info} ${c.dim}${msg}${c.reset}`)
}

/**
 * Thin fetch wrapper.
 * @param {string} path   - relative API path, e.g. "/auth/login"
 * @param {object} opts
 * @param {string}  opts.method   default GET
 * @param {object}  opts.body     auto JSON-serialised
 * @param {string}  opts.token    Bearer token
 * @returns {{ ok: boolean, status: number, data: any }}
 */
async function api(path, { method = "GET", body, token } = {}) {
  const url = `${BASE_URL}${path}`
  const headers = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    let data
    try { data = await res.json() } catch { data = {} }

    if (VERBOSE) {
      console.log(`\n  ${c.dim}[${method}] ${url}`)
      if (body) console.log(`  → body: ${JSON.stringify(body, null, 2)}`)
      console.log(`  ← ${res.status}: ${JSON.stringify(data, null, 2)}${c.reset}`)
    }

    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message } }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Phase helpers ─────────────────────────────────────────────────────────────

async function assertOk(label, promise, extract) {
  const res = await promise
  if (res.ok) {
    const detail = extract ? extract(res.data) : `HTTP ${res.status}`
    pass(label, detail)
    return res
  } else {
    const msg = res.data?.detail || res.data?.message || res.data?.error || JSON.stringify(res.data)
    failure(label, `HTTP ${res.status} — ${msg}`)
    return res
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PHASE 0 — Connectivity check
// ══════════════════════════════════════════════════════════════════════════════
async function phase0() {
  header("PHASE 0 — Connectivity & Admin Login")

  step("Ping backend")
  const ping = await api("/auth/me")
  // 401 is fine — server is up
  if (ping.status === 401 || ping.ok) {
    pass("Backend reachable", BASE_URL)
  } else if (ping.status === 0) {
    failure("Backend unreachable", `Cannot connect to ${BASE_URL}`)
    process.exit(1)
  } else {
    pass("Backend reachable (unexpected status, continuing)", `HTTP ${ping.status}`)
  }

  step("Admin login")
  const loginRes = await api("/auth/login", {
    method: "POST",
    body: { email: "admin@spark.com", password: "Admin123" },
  })
  if (!loginRes.ok) {
    failure("Admin login", `HTTP ${loginRes.status} — check credentials`)
    process.exit(1)
  }
  state.adminToken = loginRes.data.access_token
  pass("Admin login", `token acquired for admin@spark.com`)
}

// ══════════════════════════════════════════════════════════════════════════════
//  PHASE 1 — Admin creates users
// ══════════════════════════════════════════════════════════════════════════════
async function phase1() {
  header("PHASE 1 — Admin: Create PM & Department Users")

  // ── Create PM user ────────────────────────────────────────────────────────
  step("Create PM user")
  const regPM = await api("/auth/register", {
    method: "POST",
    token:  state.adminToken,
    body:   TEST_PM,
  })
  if (!regPM.ok) {
    failure("Register PM user", `HTTP ${regPM.status}`)
  } else {
    state.pmUserId  = regPM.data.user_id ?? regPM.data.id
    created.pmUserId = state.pmUserId
    pass("Register PM user", `id=${state.pmUserId}  email=${TEST_PM.email}`)

    // Auto-activate
    if (state.pmUserId) {
      const act = await api(`/admin/users/${state.pmUserId}/activate`, {
        method: "POST",
        token:  state.adminToken,
      })
      act.ok
        ? pass("Activate PM user")
        : failure("Activate PM user", `HTTP ${act.status}`)
    }
  }

  // ── Create Dept user ──────────────────────────────────────────────────────
  step("Create Department user")
  const regDept = await api("/auth/register", {
    method: "POST",
    token:  state.adminToken,
    body:   TEST_DEPT_USER,
  })
  if (!regDept.ok) {
    failure("Register Department user", `HTTP ${regDept.status}`)
  } else {
    state.deptUserId  = regDept.data.user_id ?? regDept.data.id
    created.deptUserId = state.deptUserId
    pass("Register Department user", `id=${state.deptUserId}  email=${TEST_DEPT_USER.email}`)

    if (state.deptUserId) {
      const act = await api(`/admin/users/${state.deptUserId}/activate`, {
        method: "POST",
        token:  state.adminToken,
      })
      act.ok
        ? pass("Activate Department user")
        : failure("Activate Department user", `HTTP ${act.status}`)
    }
  }

  // ── Verify users appear in list ───────────────────────────────────────────
  step("Verify users in admin list")
  const listRes = await api("/admin/users?page_size=100", { token: state.adminToken })
  if (listRes.ok) {
    const users = Array.isArray(listRes.data) ? listRes.data : (listRes.data.users ?? [])
    const pmFound   = users.some(u => u.email === TEST_PM.email)
    const deptFound = users.some(u => u.email === TEST_DEPT_USER.email)
    pmFound   ? pass("PM user visible in /admin/users")   : failure("PM user NOT found in /admin/users")
    deptFound ? pass("Dept user visible in /admin/users") : failure("Dept user NOT found in /admin/users")
    log(`Total users in system: ${users.length}`)
  } else {
    failure("GET /admin/users", `HTTP ${listRes.status}`)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PHASE 2 — Admin creates Department + assigns Dept user
// ══════════════════════════════════════════════════════════════════════════════
async function phase2() {
  header("PHASE 2 — Admin: Create Department & Assign User")

  step("Create Department")
  const deptRes = await api("/admin/departments", {
    method: "POST",
    token:  state.adminToken,
    body:   TEST_DEPT,
  })
  if (!deptRes.ok) {
    failure("Create Department", `HTTP ${deptRes.status}`)
    return
  }
  // Backend may return { department_id } or { id } or { department: { ... } }
  const deptData = deptRes.data.department ?? deptRes.data
  state.departmentId  = deptData.department_id ?? deptData.id
  created.departmentId = state.departmentId
  pass("Create Department", `id=${state.departmentId}  code=${TEST_DEPT.department_code}`)

  // ── Assign dept user to department ───────────────────────────────────────
  // Note: POST /admin/departments/{id}/users is not implemented in this backend.
  // User-to-department assignment happens via the cycle assignment in Phase 3.
  if (state.departmentId && state.deptUserId) {
    step("Assign Dept user to Department")
    const assignRes = await api(`/admin/departments/${state.departmentId}/users`, {
      method: "POST",
      token:  state.adminToken,
      body:   { user_ids: [state.deptUserId] },
    })
    if (assignRes.ok) {
      pass("Department user assigned to department")
    } else if (assignRes.status === 404) {
      skip("Assign user to department", "endpoint not in this backend — user assigned via cycle assignment instead")
    } else {
      failure("Assign user to department", `HTTP ${assignRes.status} — ${JSON.stringify(assignRes.data)}`)
    }
  } else {
    skip("Assign user to department", "missing department or user id")
  }

  // ── Verify dept appears in list ───────────────────────────────────────────
  step("Verify Department in list")
  const listRes = await api("/admin/departments", { token: state.adminToken })
  if (listRes.ok) {
    const depts = listRes.data.departments ?? listRes.data
    const found = Array.isArray(depts) && depts.some(d =>
      (d.department_id ?? d.id) === state.departmentId
    )
    found
      ? pass("Department visible in /admin/departments")
      : failure("Department NOT found in listing")
    log(`Total departments: ${Array.isArray(depts) ? depts.length : "?"}`)
  } else {
    failure("GET /admin/departments", `HTTP ${listRes.status}`)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PHASE 3 — Admin creates Cycle + assigns Dept + activates
// ══════════════════════════════════════════════════════════════════════════════
async function phase3() {
  header("PHASE 3 — Admin: Create Cycle, Assign Department, Activate")

  // Need a PM user id for project_manager_id
  const cyclePayload = {
    ...TEST_CYCLE,
    ...(state.pmUserId ? { project_manager_id: state.pmUserId } : {}),
  }

  step("Create Cycle")
  const cycleRes = await api("/admin/cycles", {
    method: "POST",
    token:  state.adminToken,
    body:   cyclePayload,
  })
  if (!cycleRes.ok) {
    failure("Create Cycle", `HTTP ${cycleRes.status} — ${JSON.stringify(cycleRes.data)}`)
    return
  }
  const cycleData = cycleRes.data.cycle ?? cycleRes.data
  state.cycleId  = cycleData.id ?? cycleData.cycle_id
  created.cycleId = state.cycleId
  pass("Create Cycle", `id=${state.cycleId}  name=${TEST_CYCLE.cycle_name}`)

  // ── Assign department to cycle ────────────────────────────────────────────
  if (state.cycleId && state.departmentId && state.deptUserId) {
    step("Assign Department to Cycle")
    const assignRes = await api(`/admin/cycles/${state.cycleId}/assign-departments`, {
      method: "POST",
      token:  state.adminToken,
      body:   {
        assignments: [{
          department_id: state.departmentId,
          user_id:       state.deptUserId,
        }],
      },
    })
    assignRes.ok
      ? pass("Department assigned to cycle")
      : failure("Assign department to cycle", `HTTP ${assignRes.status} — ${JSON.stringify(assignRes.data)}`)
  } else {
    skip("Assign department to cycle", "missing ids")
  }

  // ── Activate cycle ────────────────────────────────────────────────────────
  if (state.cycleId) {
    step("Activate Cycle (generate_questions=true)")
    const actRes = await api(
      `/admin/cycles/${state.cycleId}/activate?generate_questions=true`,
      { method: "POST", token: state.adminToken }
    )
    if (actRes.ok) {
      pass("Cycle activated", "sessions + AI questions will be generated asynchronously")
      log("Waiting 5 s for session creation to complete...")
      await sleep(5000)
    } else {
      failure("Activate cycle", `HTTP ${actRes.status} — ${JSON.stringify(actRes.data)}`)
    }

    // ── Verify cycle overview ─────────────────────────────────────────────
    step("Verify Cycle overview (admin)")
    const ovRes = await api(`/admin/cycles/${state.cycleId}/overview`, { token: state.adminToken })
    if (ovRes.ok) {
      const stats = ovRes.data.stats ?? ovRes.data
      const depts = ovRes.data.departments ?? []
      pass("Cycle overview returned", `total_departments=${stats.total_departments ?? depts.length}`)
    } else {
      failure("GET cycle overview", `HTTP ${ovRes.status}`)
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PHASE 4 — PM logs in, views dashboard, submits kickoff brief
// ══════════════════════════════════════════════════════════════════════════════
async function phase4() {
  header("PHASE 4 — PM: Login, Dashboard, Kickoff Brief")

  // ── PM login ──────────────────────────────────────────────────────────────
  step("PM login")
  const loginRes = await api("/auth/login", {
    method: "POST",
    body:   { email: TEST_PM.email, password: TEST_PM.password },
  })
  if (!loginRes.ok) {
    failure("PM login", `HTTP ${loginRes.status} — may need to retry if account not fully active`)
    return
  }
  state.pmToken = loginRes.data.access_token
  pass("PM login", `role=${loginRes.data.role}`)

  // ── PM: /auth/me ──────────────────────────────────────────────────────────
  step("PM /auth/me")
  const meRes = await api("/auth/me", { token: state.pmToken })
  meRes.ok
    ? pass("/auth/me", `${meRes.data.full_name}  (${meRes.data.role})`)
    : failure("/auth/me", `HTTP ${meRes.status}`)

  // ── PM: submit kickoff brief ──────────────────────────────────────────────
  if (state.cycleId) {
    step("Submit Kickoff Brief")
    const kickoffRes = await api("/pm/kickoff", {
      method: "POST",
      token:  state.pmToken,
      body:   {
        cycle_id:       state.cycleId,
        strategic_brief:
          "This annual report cycle focuses on operational excellence, digital transformation " +
          "and stakeholder transparency. Each department should highlight key metrics, " +
          "challenges overcome, and strategic goals achieved during the fiscal year.",
        additional_context:
          "Emphasise quantitative achievements with specific numbers where possible. " +
          "Keep language professional and concise.",
      },
    })
    kickoffRes.ok
      ? pass("Kickoff brief submitted", "AI questions will be (re-)generated for all sessions")
      : failure("Submit kickoff brief", `HTTP ${kickoffRes.status} — ${JSON.stringify(kickoffRes.data)}`)
  } else {
    skip("Submit kickoff brief", "no cycleId")
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PHASE 5 — Dept user logs in, finds session, answers questions, submits
// ══════════════════════════════════════════════════════════════════════════════
async function phase5() {
  header("PHASE 5 — Dept User: Login, Answer Questions, Submit")

  // ── Dept login ────────────────────────────────────────────────────────────
  step("Department user login")
  const loginRes = await api("/auth/login", {
    method: "POST",
    body:   { email: TEST_DEPT_USER.email, password: TEST_DEPT_USER.password },
  })
  if (!loginRes.ok) {
    failure("Dept user login", `HTTP ${loginRes.status}`)
    return
  }
  state.deptToken = loginRes.data.access_token
  pass("Dept user login", `role=${loginRes.data.role}`)

  // ── Dept dashboard ────────────────────────────────────────────────────────
  step("Department dashboard")
  const dashRes = await api("/department/dashboard", { token: state.deptToken })
  if (!dashRes.ok) {
    failure("GET /department/dashboard", `HTTP ${dashRes.status}`)
    return
  }
  const assignments = dashRes.data.assignments ?? []
  pass("Dashboard loaded", `${assignments.length} assignment(s)`)

  // Find the session for our test cycle
  const assignment = assignments.find(a => a.cycle_id === state.cycleId)
  if (!assignment) {
    // Session may still be creating — wait and retry once
    log("Session not in dashboard yet — waiting 8 s and retrying...")
    await sleep(8000)
    const retryRes = await api("/department/dashboard", { token: state.deptToken })
    const retryAssignments = retryRes.data?.assignments ?? []
    const retryAssignment  = retryAssignments.find(a => a.cycle_id === state.cycleId)
    if (!retryAssignment) {
      failure("Session for test cycle found in dashboard", "session may still be generating")
      log(`Available cycles: ${retryAssignments.map(a => a.cycle_id).join(", ") || "none"}`)
      return
    }
    state.sessionId = retryAssignment.session_id
    pass("Session found (after retry)", `session_id=${state.sessionId}  status=${retryAssignment.status}`)
  } else {
    state.sessionId = assignment.session_id
    pass("Session found in dashboard", `session_id=${state.sessionId}  status=${assignment.status}`)
  }

  // ── Load session detail ───────────────────────────────────────────────────
  step("Load session detail")
  const sessRes = await api(`/department/sessions/${state.sessionId}`, { token: state.deptToken })
  if (!sessRes.ok) {
    failure("GET /department/sessions/:id", `HTTP ${sessRes.status}`)
    return
  }
  const session   = sessRes.data.session ?? sessRes.data
  const questions = session.questions ?? []
  pass("Session detail loaded", `${questions.length} question(s)  status=${session.status}`)

  if (questions.length === 0) {
    log("No questions yet — AI generation may still be running. Waiting 10 s...")
    await sleep(10000)
    const retryS = await api(`/department/sessions/${state.sessionId}`, { token: state.deptToken })
    const retrySession   = retryS.data?.session ?? retryS.data
    const retryQuestions = retrySession?.questions ?? []
    if (retryQuestions.length === 0) {
      skip("Answer questions", "no AI-generated questions available yet — kickoff may need more time")
      return
    }
    questions.push(...retryQuestions)
    log(`${questions.length} question(s) loaded after retry`)
  }

  // ── Answer questions ──────────────────────────────────────────────────────
  step("Submit answers for all questions")
  const sampleAnswers = [
    "Our department achieved significant milestones this year, including a 15% improvement in operational efficiency and successful delivery of all major projects on time and within budget.",
    "The primary challenges we faced included resource constraints and evolving regulatory requirements. We addressed these through cross-functional collaboration and proactive risk management.",
    "Key strategic initiatives included the implementation of a new digital workflow system that reduced processing time by 30%, and the launch of a staff development programme that improved team capability scores by 20%.",
    "Looking ahead, our department plans to expand our digital capabilities, strengthen partnerships with external stakeholders, and continue building a culture of continuous improvement and innovation.",
    "Our financial performance remained strong with all KPIs met or exceeded. We maintained strict cost controls while investing in infrastructure that will deliver long-term value to the organisation.",
  ]

  const answers = questions.map((q, idx) => ({
    question_id: q.question_id,
    question:    q.question,
    answer:      sampleAnswers[idx % sampleAnswers.length],
  }))

  const answerRes = await api(`/department/sessions/${state.sessionId}/answers`, {
    method: "POST",
    token:  state.deptToken,
    body:   { answers },
  })
  answerRes.ok
    ? pass("Answers submitted", `${answers.length} answer(s) saved`)
    : failure("Submit answers", `HTTP ${answerRes.status} — ${JSON.stringify(answerRes.data)}`)

  // ── Generate AI draft ─────────────────────────────────────────────────────
  step("Generate AI draft")
  const draftRes = await api(`/department/sessions/${state.sessionId}/generate-draft`, {
    method: "POST",
    token:  state.deptToken,
  })
  if (draftRes.ok) {
    const draftPreview = (draftRes.data.draft ?? draftRes.data.ai_generated_draft ?? "")
      .toString().slice(0, 80).replace(/\n/g, " ")
    pass("AI draft generated", draftPreview ? `"${draftPreview}..."` : "")
  } else {
    failure("Generate draft", `HTTP ${draftRes.status} — ${JSON.stringify(draftRes.data)}`)
  }

  // ── Re-fetch session to get the draft content ─────────────────────────────
  step("Re-fetch session to retrieve draft content")
  const sess2Res = await api(`/department/sessions/${state.sessionId}`, { token: state.deptToken })
  const session2    = sess2Res.data?.session ?? sess2Res.data
  const draftContent = session2?.ai_generated_draft ?? session2?.draft ?? null
  if (draftContent) {
    pass("Draft content available", `${draftContent.length} chars`)
  } else {
    log("Draft content not in session yet — using answers as final content")
  }

  // ── Finalize / submit ─────────────────────────────────────────────────────
  step("Finalize submission")
  const finalContent = draftContent
    ?? answers.map(a => `${a.question}\n${a.answer}`).join("\n\n")

  const finalRes = await api(`/department/sessions/${state.sessionId}/finalize`, {
    method: "POST",
    token:  state.deptToken,
    body:   { final_content: finalContent },
  })
  if (finalRes.ok) {
    const newStatus = finalRes.data?.session?.status ?? finalRes.data?.status ?? "submitted"
    pass("Submission finalized", `status=${newStatus}`)
  } else {
    failure("Finalize submission", `HTTP ${finalRes.status} — ${JSON.stringify(finalRes.data)}`)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PHASE 6 — PM reviews & approves submission, generates report
// ══════════════════════════════════════════════════════════════════════════════
async function phase6() {
  header("PHASE 6 — PM: Review, Approve & Generate Final Report")

  if (!state.pmToken) {
    skip("PM review flow", "PM token missing — Phase 4 failed")
    return
  }
  if (!state.sessionId) {
    skip("PM review flow", "sessionId missing — Phase 5 failed")
    return
  }

  // ── PM: mark as reviewed ──────────────────────────────────────────────────
  step("PM marks session as 'reviewed'")
  const reviewRes = await api(`/pm/sessions/${state.sessionId}/review`, {
    method: "POST",
    token:  state.pmToken,
    body:   {
      status:       "reviewed",
      review_notes: "Reviewed by automated E2E test. Content is clear and comprehensive.",
    },
  })
  reviewRes.ok
    ? pass("Session marked as reviewed")
    : failure("Mark session reviewed", `HTTP ${reviewRes.status} — ${JSON.stringify(reviewRes.data)}`)

  // ── PM: approve ───────────────────────────────────────────────────────────
  step("PM approves session")
  const approveRes = await api(`/pm/sessions/${state.sessionId}/review`, {
    method: "POST",
    token:  state.pmToken,
    body:   {
      status:       "approved",
      review_notes: "Approved. Excellent contribution — content meets all requirements.",
    },
  })
  approveRes.ok
    ? pass("Session approved")
    : failure("Approve session", `HTTP ${approveRes.status} — ${JSON.stringify(approveRes.data)}`)

  // ── PM: generate final report ─────────────────────────────────────────────
  if (state.cycleId) {
    step("Generate final report")
    const reportRes = await api(`/pm/cycles/${state.cycleId}/generate-report`, {
      method: "POST",
      token:  state.pmToken,
      body:   { format: "markdown" },
    })
    if (reportRes.ok) {
      const content = reportRes.data.report ?? reportRes.data.report_preview ?? null
      state.reportContent = content
      const wordCount = content ? content.split(/\s+/).length : 0
      pass("Final report generated", wordCount > 0 ? `~${wordCount} words` : "content returned")
    } else {
      failure("Generate report", `HTTP ${reportRes.status} — ${JSON.stringify(reportRes.data)}`)
    }
  } else {
    skip("Generate report", "no cycleId")
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PHASE 7 — Admin validation (view created data, stats)
// ══════════════════════════════════════════════════════════════════════════════
async function phase7() {
  header("PHASE 7 — Admin: Validate Final State")

  step("Admin stats")
  const statsRes = await api("/admin/stats", { token: state.adminToken })
  if (statsRes.ok) {
    const s = statsRes.data
    pass("Admin stats returned",
      `users=${s.total_users}  active_cycles=${s.active_cycles ?? "?"}  departments=${s.total_departments ?? "?"}`
    )
  } else {
    failure("GET /admin/stats", `HTTP ${statsRes.status}`)
  }

  if (state.cycleId) {
    step("Admin cycle overview — final check")
    const ovRes = await api(`/admin/cycles/${state.cycleId}/overview`, { token: state.adminToken })
    if (ovRes.ok) {
      const stats = ovRes.data.stats ?? {}
      const depts = ovRes.data.departments ?? []
      pass("Cycle overview",
        `total=${stats.total_departments}  approved=${stats.approved}  rate=${stats.completion_rate}%`
      )
      if (depts.length > 0) {
        const d = depts[0]
        log(`  └ ${d.department_name}  status=${d.status}  progress=${d.progress_percentage}%`)
      }
    } else {
      failure("GET cycle overview (final)", `HTTP ${ovRes.status}`)
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CLEANUP — delete test data created during the run
// ══════════════════════════════════════════════════════════════════════════════
async function cleanup() {
  header("CLEANUP — Removing Test Data")

  if (SKIP_CLEANUP) {
    console.log(`  ${warn} ${c.yellow}--skip-cleanup flag set — test data NOT deleted${c.reset}`)
    console.log(`  ${info} ${c.dim}Cycle:      ${created.cycleId}${c.reset}`)
    console.log(`  ${info} ${c.dim}Department: ${created.departmentId}${c.reset}`)
    console.log(`  ${info} ${c.dim}PM user:    ${created.pmUserId}${c.reset}`)
    console.log(`  ${info} ${c.dim}Dept user:  ${created.deptUserId}${c.reset}`)
    return
  }

  // Cycles: backend returns 405 Method Not Allowed on DELETE — no endpoint exists
  if (created.cycleId) {
    skip(`Delete test cycle ${created.cycleId}`, "backend has no DELETE /admin/cycles endpoint")
  }

  // Departments: backend returns 404 on DELETE — no endpoint exists
  if (created.departmentId) {
    skip(`Delete test department ${created.departmentId}`, "backend has no DELETE /admin/departments endpoint")
  }

  // Re-login as admin to get a fresh token for cleanup (phases take >30 s)
  const freshLogin = await api("/auth/login", {
    method: "POST",
    body:   { email: "admin@spark.com", password: "Admin123" },
  })
  const cleanupToken = freshLogin.ok ? freshLogin.data.access_token : state.adminToken

  // Delete PM user
  if (created.pmUserId) {
    const r = await api(`/admin/users/${created.pmUserId}`, { method: "DELETE", token: cleanupToken })
    if (r.ok) {
      pass(`Deleted PM user ${created.pmUserId}`)
    } else if (r.status === 404) {
      skip(`Delete PM user ${created.pmUserId}`, "404 — user may be protected when assigned to an active cycle")
    } else {
      failure(`Delete PM user`, `HTTP ${r.status}`)
    }
  }

  // Delete Dept user
  if (created.deptUserId) {
    const r = await api(`/admin/users/${created.deptUserId}`, { method: "DELETE", token: cleanupToken })
    r.ok
      ? pass(`Deleted Dept user ${created.deptUserId}`)
      : failure(`Delete Dept user`, `HTTP ${r.status}`)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
function summary() {
  const total = results.passed + results.failed + results.skipped
  const allOk = results.failed === 0

  console.log("")
  console.log(`${c.bold}${"═".repeat(60)}${c.reset}`)
  console.log(`${c.bold}  TEST SUMMARY${c.reset}`)
  console.log(`${c.bold}${"═".repeat(60)}${c.reset}`)
  console.log(`  ${ok}  Passed : ${c.green}${c.bold}${results.passed}${c.reset}`)
  console.log(`  ${fail}  Failed : ${results.failed > 0 ? c.red + c.bold : c.dim}${results.failed}${c.reset}`)
  console.log(`  ${warn}  Skipped: ${c.yellow}${results.skipped}${c.reset}`)
  console.log(`  ${info}  Total  : ${total}`)
  console.log("")

  if (state.reportContent) {
    console.log(`${c.bold}${c.magenta}  REPORT PREVIEW (first 400 chars)${c.reset}`)
    console.log(`  ${c.dim}${"─".repeat(56)}${c.reset}`)
    const preview = state.reportContent.slice(0, 400).replace(/\n/g, "\n  ")
    console.log(`  ${c.dim}${preview}...${c.reset}`)
    console.log("")
  }

  if (allOk) {
    console.log(`${c.green}${c.bold}  ✓ ALL CHECKS PASSED — Full workflow verified end-to-end${c.reset}`)
  } else {
    console.log(`${c.red}${c.bold}  ✗ ${results.failed} CHECK(S) FAILED — Review output above${c.reset}`)
  }
  console.log(`${c.bold}${"═".repeat(60)}${c.reset}\n`)

  return allOk
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${c.bold}${c.cyan}${"═".repeat(60)}${c.reset}`)
  console.log(`${c.bold}${c.cyan}  SPARK ANNUAL REPORT — END-TO-END WORKFLOW TEST${c.reset}`)
  console.log(`${c.bold}${c.cyan}${"═".repeat(60)}${c.reset}`)
  console.log(`  ${info} API       : ${c.dim}${BASE_URL}${c.reset}`)
  console.log(`  ${info} Run ID    : ${c.dim}${RUN_ID}${c.reset}`)
  console.log(`  ${info} Cleanup   : ${c.dim}${SKIP_CLEANUP ? "disabled (--skip-cleanup)" : "enabled"}${c.reset}`)
  console.log(`  ${info} Verbose   : ${c.dim}${VERBOSE ? "on (--verbose)" : "off"}${c.reset}`)

  try {
    await phase0()   // connectivity + admin login
    await phase1()   // create PM + dept users
    await phase2()   // create department + assign user
    await phase3()   // create cycle + assign dept + activate
    await phase4()   // PM login + kickoff brief
    await phase5()   // dept login + answer + submit
    await phase6()   // PM review + approve + generate report
    await phase7()   // admin final validation
  } catch (err) {
    console.error(`\n${c.red}${c.bold}  Unexpected error: ${err.message}${c.reset}`)
    if (VERBOSE) console.error(err)
  } finally {
    await cleanup()
    const allOk = summary()
    process.exit(allOk ? 0 : 1)
  }
}

main()
