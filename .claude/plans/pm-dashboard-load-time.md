# Implementation Plan — Fix PM Dashboard Load Time (~36 requests → 1)

## Context

Logging in as PM takes **37.86s** and fires **~70 requests**, nearly all named `sessions` with initiator `pm.ts:460`.

**Root cause — an N+1 fan-out in `hooks/useSessions.ts:196-207`:**

```js
const { cycles } = await pmApi.getCycles()                        // 1 request
const perCycle = await Promise.all(
  cycles.map(async (c) => pmApi.getCycleSessions(c.cycle_id))     // + one PER CYCLE
)
```

`pm.ts:460` is just the shared axios call site inside `getCycleSessions`, which is why every request reports the same initiator — the loop is one frame up. With ~35 cycles that's ~36 requests; browsers cap at ~6 concurrent per host, so `Promise.all` fires all 35 and they queue 6 at a time. That queue wait *is* the "times climbing 8s → 28s". **This is a request-count problem, not a payload problem** — 188 kB total, each response 0.2–0.9 kB.

**Why ~70 and not ~36:** `usePMDashboard` sets `staleTime: 0`, so mounting `/pm/cycles` after `/pm` refetches the whole fan-out. ≈2 × 36.

### What makes this egregious

1. **`GET /pm/cycles` already returns `total_departments`, `submitted_count`, and `progress`** (verified in the live OpenAPI schema: *"Assigned department count"*, *"Submitted session count"*, *"Average department progress percentage"*). `getCycles` at `lib/api/pm.ts:449-452` even spreads them onto each object — they arrive at the client and are **discarded**, then re-derived from 35 extra calls.
2. **The fan-out's main product is never rendered.** `recent_submissions` is built from every session (`useSessions.ts:241-257`) and used **only for `.length`** at `pm/page.tsx:65`. The list itself has no consumer anywhere in the app.
3. **`usePMReviewQueue` (`useSessions.ts:279`) is a second copy of the same N+1 with zero callers** — dead code, and `pm/reviews/page.tsx` is now just a redirect (*"The PM no longer reviews"*).

So ~36 round-trips and 37 seconds produce about five integers per cycle, three of which the server already sent.

**Intended outcome:** PM dashboard = **1 request**, sub-second, and it stops getting slower as cycles accumulate (today it scales linearly with cycle count).

### Confirmed decisions
- Backend **will** add the missing per-status counts to the cycle list.
- The duplicate "Recent Submissions" stat card is **left visually unchanged for now** — the user will review a screenshot and decide separately. This plan must not change what it displays.

---

## Backend Contract

Add a per-status breakdown to each item in `GET /pm/cycles` (`CycleResponse`):

```jsonc
"status_counts": {          // counts of the cycle's department sessions, keyed by status
  "assigned": 0, "hod_curation": 0, "not_started": 3, "in_progress": 5,
  "submitted": 2, "approved": 1, "reopened": 0
}
```

**Why one object rather than four scalar fields.** The existing `submitted_count` is documented only as *"Submitted session count"* — it does **not** say whether `approved` is included, and the two consumers need *different* answers:

- the per-cycle card shows `submitted + approved` (`useSessions.ts:233`)
- the global `pending_reviews` counts `submitted` **only** (`useSessions.ts:244, 261`)

Any scalar we add inherits that ambiguity and we'd be guessing. A status-keyed object is unambiguous, lets the frontend reproduce today's numbers exactly, and never needs revisiting when a status is added. It also leaves the existing `submitted_count`/`progress`/`total_departments` fields untouched, so nothing else that reads them breaks.

Keys should cover every value of the existing `SessionStatus` enum (`assigned`, `hod_curation`, `not_started`, `in_progress`, `submitted`, `approved`, `reopened`). Missing keys must be treated as `0` by the frontend, so a partial rollout degrades to an undercount rather than a crash.

This is per-cycle data the backend already has — it's what `GET /pm/cycles/{id}/sessions` is being called 35 times to compute.

---

## Frontend Changes

### 1. `lib/api/pm.ts` — declare the fields the backend already sends

`PMCycleListItem` (line 237) currently declares only `cycle_id`, `cycle_name`, `fiscal_year`, `status`, `submission_deadline`, `updated_at` — so three fields that arrive on every response are invisible to TypeScript and were never used. Add them:

```ts
export interface PMCycleListItem {
  // …existing…
  total_departments?: number
  submitted_count?: number
  progress?: number                              // avg department progress_percentage
  status_counts?: Partial<Record<SessionStatus, number>>
}
```

All optional + null-guarded: the dashboard must not break between this shipping and the backend's `status_counts` landing.

### 2. `hooks/useSessions.ts` — delete the fan-out (the whole fix)

Rewrite `usePMDashboard`'s queryFn to a single `pmApi.getCycles()`, mapping each cycle straight through. Keep the output shape of `PMDashboard` identical so no page changes are forced.

Derive **exactly today's numbers** from `status_counts`:

| Field | Today (from 35 calls) | After (from the cycle list) |
|---|---|---|
| `total_departments` | `sessions.length` | `cycle.total_departments ?? 0` |
| `submitted_count` | `submitted + approved` | `sc.submitted + sc.approved` |
| `in_progress_count` | `in_progress` | `sc.in_progress` |
| `not_started_count` | `not_started + assigned` | `sc.not_started + sc.assigned` |
| `reopened_count` | `reopened` | `sc.reopened` |
| `completion_rate` | avg of `progress_percentage` | `cycle.progress ?? 0` |
| `pending_reviews` | count of `submitted` across cycles | `sum(sc.submitted)` |

Also set **`staleTime: 30_000`** (matching `refetchInterval`) so `/pm` → `/pm/cycles` navigation stops refiring everything — that alone halves today's request count and is worth having independently of the backend change.

Keep `refetchInterval: 30_000` and `retry: false` as-is.

### 3. `types/index.ts` — `PMDashboard.recent_submissions`

The list is unrenderable dead weight once the fan-out is gone (no session-level data). Replace it with the only thing ever read from it:

```ts
/** Count only — the historic list of submissions was never rendered, just counted. */
recent_submissions_count: number
```

**Preserve the displayed number exactly.** Today's card shows `recent_submissions.length`, which `slice(0, 10)` caps at 10 — so it silently stops rising past 10. Reproduce that verbatim, with the oddity named rather than hidden:

```ts
// Historic behaviour: the list was sliced to 10 before its length was rendered,
// so this card maxes out at 10. Preserved deliberately — pending a decision on
// whether the card stays at all (it duplicates "Awaiting HOD Approval").
const RECENT_SUBMISSIONS_CAP = 10
recent_submissions_count: Math.min(totalSubmitted, RECENT_SUBMISSIONS_CAP)
```

### 4. `app/(protected)/pm/page.tsx` — one-line change

Line 34/65: `recentSubmissions.length` → `data?.recent_submissions_count ?? 0`. **No visual change.**
Lines 93-94's `??` fallbacks stay — they're the guard for a partial backend rollout.

### 5. Delete dead code

- `usePMReviewQueue` (`useSessions.ts:279-311`) and its `ReviewQueueItem` type (line 273) — zero callers, and a live N+1 waiting for someone to mount it.
- `pmApi.getCycleSessions` (`pm.ts:457`) — after the above, its only two callers are gone. Removing it makes the fan-out unreachable by construction rather than by convention.

Leave `app/api/pm/_sessionAggregator.ts` and `app/api/pm/cycles/[cycleId]/route.ts` alone for now. Both are orphaned, and the aggregator logs in as every department user with a shared password — worth deleting, but that's a separate change with its own risk, not a performance fix.

### Not in scope
`usePMCycleDashboard` (`useSessions.ts:313`) polls every **5s**, but it's a single request and is *not* the reported problem (its requests are named `{cycleId}`, not `sessions`). Flag only: 5s is aggressive for a page a PM leaves open. Revisit separately.

---

## Risks

- **`total_departments` semantics may differ.** Backend calls it *"Assigned department count"*; the frontend counts `sessions.length`. If a department is assigned but has no session row, the "X of Y submitted" denominator ticks up. Compare the two on a real cycle before/after — the numbers should be identical.
- **`progress` vs `completion_rate`.** Both documented as an average of department progress. Should match, but eyeball one cycle.
- **Partial rollout.** If this ships before `status_counts`, every per-status count reads 0 and "In Progress"/"Not Started" show 0 while totals stay right. Acceptable and self-correcting, but land the backend first if possible.
- **`pending_reviews` counts `submitted` only** — not `approved`. Easy to get wrong when reading `status_counts`; the card is literally "Awaiting HOD Approval".

---

## Verification

The whole point is request count, so measure it — don't infer it.

1. **Before:** log in as PM with devtools Network open, filter `sessions`. Record the count and `Finish` time. Note the actual cycle count from the `GET /pm/cycles` response (my ~35 is inferred from 70÷2, not measured — the fan-out scales with it).
2. **After:** repeat. Expect **exactly one** `/pm/cycles` request, **zero** `/pm/cycles/{id}/sessions` requests, and Finish under ~1s.
3. **Numbers unchanged:** screenshot the dashboard before and after. Every cycle card's Submitted / In Progress / Not Started / percentage and both top stat cards must be identical. This is the real acceptance test — the speed fix is worthless if the counts drift.
4. **Navigation no longer refires:** `/pm` → `/pm/cycles` → `/pm`. With `staleTime: 30_000`, no new request within 30s.
5. **Polling still works:** leave `/pm` open ~35s, confirm exactly one `/pm/cycles` refetch (not 36).
6. **Empty state:** a PM with no cycles still renders "No active cycles assigned", no crash.
7. `npx tsc --noEmit` and `npx eslint` on changed files. Note: tsc reports 3 pre-existing stale errors in `.next/types/validator.ts` about non-existent `communication` pages — unrelated, filter them.
