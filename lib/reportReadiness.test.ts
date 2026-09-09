/**
 * Self-check for the report-readiness rules. No framework — run it with:
 *   node lib/reportReadiness.test.ts
 *
 * These two rules decide whether a "Try again" button appears on a notification
 * and which backend it calls, and both fail quietly when they are wrong: match
 * too loosely and unrelated alerts sprout a button that retries nothing; parse
 * the link wrong and the button hits the endpoint for the other report type.
 * Neither shows up as an error anywhere.
 */

import assert from "node:assert/strict"
import {
  READINESS_TYPE,
  READINESS_RELATED_TYPE,
  isReadinessNotification,
  reportKind,
  agentRunPath,
} from "./reportReadiness.ts"

// ── isReadinessNotification ────────────────────────────────────────

assert.equal(
  isReadinessNotification({ notification_type: "alert", related_type: "report" }),
  true, "the pair Centriton writes",
)

// BOTH halves are required. 'alert' is a general-purpose value in the backend's
// enum, so a future alert about something else must not gain a Try again button.
assert.equal(
  isReadinessNotification({ notification_type: "alert", related_type: "session" }),
  false, "an alert about something that is not a report",
)
assert.equal(
  isReadinessNotification({ notification_type: "alert", related_type: null }),
  false, "an alert with no related_type at all",
)
assert.equal(
  isReadinessNotification({ notification_type: "alert" }),
  false, "related_type absent — an older row, or a reader that drops the column",
)

// The other direction: a report-related row of a different type is not ours.
assert.equal(
  isReadinessNotification({ notification_type: "approval", related_type: "report" }),
  false, "a report approval is not a readiness warning",
)

// Communication Hub rows share this table and already reach the bell through the
// thread feed. Matching them here would list every tagged message twice.
assert.equal(
  isReadinessNotification({ notification_type: "system", related_type: null }),
  false, "a comm-hub row",
)

assert.equal(READINESS_TYPE, "alert", "must stay in step with Centriton's notifications.py")
assert.equal(READINESS_RELATED_TYPE, "report", "likewise")

// ── reportKind ─────────────────────────────────────────────────────

assert.equal(reportKind("/earnings/abc-123/report"), "earnings", "earnings link")
assert.equal(reportKind("/quarterly-report/abc-123/report"), "quarterly", "quarterly link")

// Nothing to act on → the caller renders the row without a button rather than
// guessing an endpoint.
assert.equal(reportKind(null), null, "no link")
assert.equal(reportKind(undefined), null, "no link at all")
assert.equal(reportKind(""), null, "empty link")
assert.equal(reportKind("/sessions/abc"), null, "some other route")

// A board report would be a third kind with its own endpoint — until then it
// must not be mistaken for one of these two.
assert.equal(reportKind("/board-report/abc/report"), null, "board is not handled here yet")

// Prefix matching, not substring: a path that merely mentions the word is not it.
assert.equal(reportKind("/reports/earnings/abc"), null, "must match the prefix, not anywhere")

// ── agentRunPath ───────────────────────────────────────────────────

// The client's baseURL already ends in /api/v1, so passing poll_url through raw
// would request /api/v1/api/v1/agent_runs/...
assert.equal(
  agentRunPath("/api/v1/agent_runs/run-1"), "/agent_runs/run-1",
  "the prefix the backend sends is stripped",
)
assert.equal(
  agentRunPath("/agent_runs/run-1"), "/agent_runs/run-1",
  "an already-stripped path is left alone",
)
// Only at the start — an id that happened to contain the prefix must survive.
assert.equal(
  agentRunPath("/agent_runs/api/v1"), "/agent_runs/api/v1",
  "only the leading prefix is stripped",
)

console.log("reportReadiness: all checks passed")
