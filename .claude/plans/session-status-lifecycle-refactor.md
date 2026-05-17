# Plan: Frontend — Session Status Lifecycle Refactor

## Context

The backend has migrated to a 6-status session lifecycle and a new review-endpoint payload (`action` instead of `status`, with `review_notes` now required for `rejected`/`reopened`). The frontend still encodes the old 7-status model (with dead `reviewed`/`rejected` resting states and a missing `assigned` state), and still sends `status` to `POST /pm/sessions/{id}/review`. Result: the PM review flow will silently 422 against the new backend, cycle stat counters will drop to zero on the removed states, and the dept user has no UI affordance for the new `assigned` (questions being prepared) state.

This refactor aligns the frontend with the backend so PMs can approve / request-changes, dept users see correct prompts at every lifecycle stage, and cycle stats reflect reality.

Source spec: `.claude/spec/fix_Session_Status_Lifecycle_refactor.md` (read in full before executing).

## Approach summary

Bottom-up, single PR. Land changes in this order so the build keeps compiling at every step:

1. **Types & constants** — single source of truth (`types/index.ts`, `lib/constants.ts`)
2. **API & hook** — wire `action`-based payload (`lib/api/pm.ts`, `hooks/useSessions.ts`)
3. **PM review page** — collapse 4 buttons → 2 (Approve / Request Changes), enforce notes on reject
4. **Dept dashboard + workspace + draft pages** — handle all 6 statuses, gate editing/finalize
5. **PM cycle page + admin cycle page + BFF aggregators** — update stats and pipeline labels
6. **Sweep** — global grep for residual `"reviewed"` / `"rejected"` references

## Deviations from the spec (deliberate)

- **Color values stay short-name (e.g. `"slate"`, `"blue"`)**, not the full `bg-slate-100 text-slate-600` Tailwind class strings the spec suggests. Reason: `components/ui/status-badge.tsx` resolves short names via an internal `colorMap`. Using full class strings would require also rewriting `StatusBadge`. I'll add a `slate` entry to `colorMap` so the new `assigned` status has a distinct neutral tone (otherwise `gray` and `assigned` look identical).
- **PM cycle page — no new filter tabs row.** The current page (`app/(protected)/pm/cycles/[id]/page.tsx`) uses a workflow pipeline visualization + stat cards, not tabs. Per the clarifying decision: update existing UI in place — relabel the `Reviewed` pipeline stage to `Needs Changes` (reopened), update stat-card filter arrays to read `assigned`/`reopened` instead of `reviewed`. No new tabs UI.
- **BFF aggregators are in scope.** `app/api/pm/cycles/route.ts` and `app/api/pm/_sessionAggregator.ts` are Next.js API routes (not the real backend) that count sessions by status. They reference `reviewed` and must be updated or stats break. The spec said "don't touch the backend" — these are frontend BFF code.

## File-by-file changes

### 1. `types/index.ts`

- Replace `SessionStatus` union: drop `"reviewed"` and `"rejected"`, add `"assigned"`. Final 6 values: `assigned | not_started | in_progress | submitted | approved | reopened`.
- Add new type: `export type PMReviewAction = "approved" | "rejected" | "reopened"` (note: `rejected` survives here as an action verb the backend accepts, even though it's no longer a resting status).
- `CycleOverview` interface: in its stats shape, drop `reviewed` field, add `assigned` and (if missing) `reopened` fields. Confirm by reading lines 98–114.
- If a `SessionReviewRequest` interface exists, change `status: string` → `action: PMReviewAction`.

### 2. `lib/constants.ts`

Replace `SESSION_STATUSES` with exactly 6 entries (using short color names):
```typescript
export const SESSION_STATUSES = {
  assigned:    { label: "Assigned",      color: "slate"  },
  not_started: { label: "Not Started",   color: "gray"   },
  in_progress: { label: "In Progress",   color: "blue"   },
  submitted:   { label: "Submitted",     color: "yellow" },
  approved:    { label: "Approved",      color: "green"  },
  reopened:    { label: "Needs Changes", color: "red"    },
}
```

### 3. `components/ui/status-badge.tsx`

Add `slate` to `colorMap` (line 6) so the new `assigned` badge renders distinctly:
```typescript
slate: "bg-slate-100 text-slate-700 border-slate-200",
```
No other changes — the component already reads labels/colors from constants.

### 4. `lib/api/pm.ts`

- Rename `ReviewPayload` field `status` → `action`, typed as `PMReviewAction`:
  ```typescript
  export interface ReviewPayload {
    action: PMReviewAction
    review_notes?: string
  }
  ```
- `reviewSession` (lines 118–124) body stays the same shape since it spreads `payload`; just the field name flows through. Confirm the POST body sends `{ action, review_notes }`.

### 5. `hooks/useSessions.ts`

- `useReviewSession` mutation input (lines 170–185) — the `data: ReviewPayload` type propagates automatically once `ReviewPayload` is updated. Verify no inline `status:` literal is constructed in the hook itself.
- Invalidations stay as-is.

### 6. `app/(protected)/pm/sessions/[id]/page.tsx` — PM session review

This is the highest-risk file. Current state: 4 review buttons (Mark Reviewed / Request Revision / Reject / Approve), notes optional except for `reopened`, sends `status` field.

Changes:
- Replace the `ReviewAction` local type (line 31) with the imported `PMReviewAction`.
- Delete the "Mark Reviewed" button (around lines 136–144).
- Collapse "Reject" and "Request Revision" into a single **"Request Changes"** button that sends `action: "rejected"`. Per spec, this is the canonical reject path; `reopened` is set by the backend after the dept user resubmits, not by a PM button.
- Update `handleReview` (lines 50–69) — payload key must be `action`, not `status`. Disable submit until `reviewNotes.trim()` is non-empty when `action === "rejected"` (backend 422s otherwise).
- Remove `isReviewed` / `isRejected` local booleans (lines 71–75) and any conditional branches that reference them.
- `canAct` (line 78) — narrow to `status === "submitted"` only (drop the `reviewed` arm).
- When viewing a `reopened` session as PM: show a passive indicator ("⏳ Waiting for department to revise and resubmit") and no action buttons — PM has nothing to do until dept resubmits.
- The existing `review_notes` banner (lines 207–227) for rejected/reopened can stay; just verify it triggers on `reopened` (and only `reopened`, since `rejected` is no longer a resting status).

### 7. `app/(protected)/department/page.tsx` — Dept dashboard

Current state: filter tabs include `"reviewed"`/`"rejected"`; CTA logic is inline; no `review_notes` on cards; card border handles only 3 statuses.

Changes:
- Filter tabs array (lines 19–28): replace `reviewed`/`rejected` entries with `assigned` and `reopened` (labeled "Needs Changes").
- Extract inline CTA logic (lines 184–215) into a `getSessionCTA(status)` helper covering all 6 statuses per spec section 5.
- Extract border colors into `getCardBorderColor(status)` covering all 6 statuses per spec.
- When `session.status === "reopened" && session.review_notes`, render the PM-feedback banner snippet on the card (replace the existing static "reopened" notice at lines 156–162 which doesn't show the actual notes).
- Drop the `isApproved`/`isSubmittedPending`/`isReopened` ad-hoc booleans in favor of `getSessionCTA`/`getCardBorderColor` driving everything.

### 8. `app/(protected)/department/sessions/[id]/page.tsx` — Session workspace

Current state: reopened banner exists (good); `disabled={isSubmitted}` on textarea (inverted logic, fragile).

Changes:
- Add explicit `const canEdit = session.status === "in_progress" || session.status === "reopened"` near the existing status-boolean block (lines 128–130).
- Replace `disabled={isSubmitted}` (line 780) with `disabled={!canEdit}`.
- Apply `!canEdit` to: "Save Answers" button (line ~744), AI assist / "Generate Answer" / refine chips (lines ~580, 678–690), document upload (line ~704). Currently these are gated only on `isPending` / `chatLoading` — let them stay disabled during pending operations AND when `!canEdit`.
- Keep the existing reopened banner (lines 381–398). Confirm it renders `session.review_notes` correctly (it does today).
- Optional: add a `getStatusMessage(status)` helper for a header subtitle per spec section 6. Low priority — the banner already covers the most important case.

### 9. `app/(protected)/department/sessions/[id]/draft/page.tsx` — Draft & finalize

Current state: Finalize button always shown; static dialog copy; generic success message.

Changes:
- Hide Finalize unless `session.status === "in_progress" || session.status === "reopened"`. Currently shown at lines 189–196 and 321–328.
- Branch confirm dialog copy on `status === "reopened"` (resubmit copy) vs default (first-time submit copy) per spec section 7.
- Branch post-submit success message: "Resubmitted — your revised report is back with the PM for review." when submitting from `reopened`; current generic message otherwise.
- Keep existing reopened banner (lines 142–158).

### 10. `app/(protected)/pm/cycles/[id]/page.tsx` — PM cycle workspace

Per the clarifying decision: update in place, no new tabs.

Changes:
- Pipeline visualization (lines 530–593): relabel the "Reviewed" stage to "Needs Changes" and have it filter on `reopened` (not `reviewed`). Optionally insert an "Assigned" stage before "In Progress" if the pipeline is meant to show the full lifecycle — confirm against the design intent when implementing.
- Computed arrays (lines 132–136): rename `reviewed` → `reopened`, add `assigned`. Update any consumers.
- Stat cards (lines 640–680): drop any card that reads from a `reviewed` count; add `assigned` and `reopened` cards if missing. Otherwise keep the existing 6-card layout.
- Status filtering for departments (line 31, line 32): replace `d.status === "reviewed"` with `d.status === "reopened"`. Update the "completed-ish" set `["submitted", "reviewed", "approved"]` to `["submitted", "approved"]` — `reopened` is *not* completed (user still needs to act).
- Status badges in the table (line 402–411) read from `SESSION_STATUSES` constant — already correct once Step 2 lands.

### 11. `app/(protected)/admin/cycles/[id]/page.tsx` — Admin cycle overview

Minimal change. Current state: 4 stat cards (Total, Submitted, In Progress, Completion Rate). No `reviewed`/`rejected` cards.

Changes:
- If the stats object the page reads (`stats.reviewed`, `stats.rejected`) has those fields, replace with `stats.assigned` + `stats.reopened`. Otherwise no UI change needed.
- Status badges in the table (line 245) read from constants — already correct after Step 2.

### 12. BFF aggregators

`app/api/pm/_sessionAggregator.ts`:
- `buildStats()` (lines 320–338): drop `reviewed` counter, add `assigned` and `reopened` counters.
- Completion-rate formula: currently `(submitted + reviewed + approved) / total`. New formula: `approved / total` (only approved is truly "done"). Confirm against backend's `completion_rate` semantics — if the backend already returns this field on the response, the frontend shouldn't recompute at all; just pass through.

`app/api/pm/cycles/route.ts`:
- Lines 67–69, 93–95: same updates — drop `reviewed` from counts and from "pending reviews" set; add `assigned`/`reopened`. Pending reviews should be `submitted` only (the rest are either user-actionable or terminal).

### 13. Global cleanup sweep

After all of the above, grep the repo and remove any residual matches:
- `"reviewed"` (as status string literal)
- `"rejected"` (as status string literal in session context — leave alone if it appears as the `PMReviewAction` value, which is correct)
- `label: "Reviewed"`, `label: "Rejected"`
- Any `case "reviewed":` / `case "rejected":` in switch blocks
- `SessionStatus.REVIEWED` / `SessionStatus.REJECTED` — explore reported no current matches, but re-check after the refactor

## Critical files (touch list)

```
types/index.ts
lib/constants.ts
lib/api/pm.ts
hooks/useSessions.ts
components/ui/status-badge.tsx
app/(protected)/pm/sessions/[id]/page.tsx
app/(protected)/pm/cycles/[id]/page.tsx
app/(protected)/admin/cycles/[id]/page.tsx
app/(protected)/department/page.tsx
app/(protected)/department/sessions/[id]/page.tsx
app/(protected)/department/sessions/[id]/draft/page.tsx
app/api/pm/cycles/route.ts
app/api/pm/_sessionAggregator.ts
```

## Out of scope (flag, don't fix here)

- **PM "kick off cycle" UI**: backend transitions `assigned → not_started` when the PM kicks off. If no such button exists today and the spec doesn't describe one, leave it. The current `assigned` state will simply render the new "Waiting for Questions" CTA on the dept side. Add a follow-up task to confirm a kickoff trigger exists somewhere.
- **`department_assignments.status` column** — separate from `department_sessions.status` per spec. Do not modify any code that touches assignments.
- **Chat / documents / agents pages** — unrelated, per spec.
- **Backend ITSELF** — only frontend changes plus the in-app BFF routes.

## Verification

1. **Typecheck / build**: `npm run build` must pass clean. Spec's Definition of Done requires this.
2. **Manual flow (happy path)** — start dev server (already running on :3000) and walk through:
   - Log in as a dept user, open a session in `not_started`: CTA reads "Start", textareas editable.
   - Save answers → status flips to `in_progress`: CTA on dashboard reads "Continue".
   - Submit → status `submitted`: dashboard CTA reads "Awaiting Review" (disabled), workspace fields read-only.
3. **Manual flow (PM review)** —
   - Log in as PM, open the submitted session: only 2 action buttons visible (Approve / Request Changes).
   - Click Request Changes: dialog appears with notes textarea; "Send Back" disabled until non-empty.
   - Submit with notes → backend should accept (no 422), session flips to `reopened` for the dept user.
4. **Manual flow (resubmit)** —
   - Dept user sees red "Needs Changes" banner on dashboard card with PM's notes.
   - Open session: top banner shows PM notes; fields editable again.
   - Open draft page: Finalize button visible; confirm dialog says "Resubmit for Review?"; success message reads "Resubmitted — ...".
5. **PM gets approve path** —
   - PM opens the resubmitted session, clicks Approve → status flips to `approved`. Dept user sees green "Approved" CTA, fields read-only.
6. **Grep sweep**: `rg '"reviewed"|"rejected"' app components lib types hooks` returns either no matches or only the `PMReviewAction = "rejected"` literal.
7. **Stat counters** — load a PM cycle page; the stat cards must show counts for `assigned` / `reopened` and must not throw on missing `reviewed` field.

## Risks

- **Backend payload schema drift**: if `review_notes` validation on the backend differs from the spec (e.g. min length > 1), the reject submit can still 422. Test with a single character of notes to confirm only "non-empty" is required.
- **In-flight sessions in legacy statuses**: if production data contains sessions still in `reviewed` or `rejected` status, the UI will fall through to the fallback gray badge with the raw string. Acceptable for a brief migration window but worth confirming with backend that data has been migrated.
- **PM cycle pipeline relabel** is a visible UX change for PMs mid-workflow. Coordinate the merge with a short comms note to the PM team.
