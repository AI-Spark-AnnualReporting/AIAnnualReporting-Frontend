# Spec: Frontend — Session Status Lifecycle Refactor

**Applies to:** `/AnnualReport_Frontend` (Next.js app)  
**Backend status:** ✅ COMPLETE — do not touch the backend  
**Goal:** Align the frontend with the 6-status lifecycle the backend now enforces

---

## Context — What the backend now does

The backend has already been updated. Here is exactly what changed that the frontend must now match:

| What | Before | After |
|---|---|---|
| Session created | `not_started` | `assigned` |
| PM kicks off | `in_progress` | `not_started` |
| User first save | stays `in_progress` | `not_started → in_progress` |
| PM approves | `approved` | `approved` |
| PM rejects | `rejected` (dead end) | `reopened` (user sees notes, can resubmit) |
| `reviewed` status | existed (dead code) | **gone** — will never come from backend |
| `rejected` status | existed | **gone** — will never come from backend |

**The review endpoint payload also changed:**
```
// OLD
POST /pm/sessions/{id}/review
{ "status": "approved" | "rejected" | "reopened", "review_notes": "..." }

// NEW
POST /pm/sessions/{id}/review
{ "action": "approved" | "rejected" | "reopened", "review_notes": "..." }
```

`review_notes` is now **required** when `action` is `rejected` or `reopened`. The backend returns `422` if it is empty.

---

## The 6 statuses the frontend must handle

| Status | Label to show users | Color |
|---|---|---|
| `assigned` | Assigned | slate/gray — neutral |
| `not_started` | Not Started | gray — neutral |
| `in_progress` | In Progress | blue |
| `submitted` | Submitted | yellow/amber |
| `approved` | Approved | green |
| `reopened` | Needs Changes | red |

`reviewed` and `rejected` — **delete everywhere, handle nowhere.**

---

## File-by-file changes

### 1. `types/index.ts`

```typescript
// BEFORE
export type SessionStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "reviewed"
  | "approved"
  | "rejected"
  | "reopened";

// AFTER
export type SessionStatus =
  | "assigned"
  | "not_started"
  | "in_progress"
  | "submitted"
  | "approved"
  | "reopened";

// NEW — for the PM review action payload
export type PMReviewAction = "approved" | "rejected" | "reopened";
```

Also find the `SessionReviewRequest` type (or wherever the review payload is typed) and update it:

```typescript
// BEFORE
interface SessionReviewRequest {
  session_id: string;
  status: string;
  review_notes: string;
}

// AFTER
interface SessionReviewRequest {
  session_id: string;
  action: PMReviewAction;
  review_notes: string;
}
```

---

### 2. `lib/constants.ts`

Replace the entire `SESSION_STATUSES` object:

```typescript
// BEFORE — had reviewed, rejected, missing assigned
export const SESSION_STATUSES: Record<string, { label: string; color: string }> = {
  not_started: { label: "Not Started", color: "..." },
  in_progress: { label: "In Progress", color: "..." },
  submitted:   { label: "Submitted",   color: "..." },
  reviewed:    { label: "Reviewed",    color: "..." },   // DELETE
  approved:    { label: "Approved",    color: "..." },
  rejected:    { label: "Rejected",    color: "..." },   // DELETE
  reopened:    { label: "Reopened",    color: "..." },
};

// AFTER
export const SESSION_STATUSES: Record<string, { label: string; color: string }> = {
  assigned:    { label: "Assigned",      color: "bg-slate-100  text-slate-600"  },
  not_started: { label: "Not Started",   color: "bg-gray-100   text-gray-600"   },
  in_progress: { label: "In Progress",   color: "bg-blue-100   text-blue-700"   },
  submitted:   { label: "Submitted",     color: "bg-yellow-100 text-yellow-700" },
  approved:    { label: "Approved",      color: "bg-green-100  text-green-700"  },
  reopened:    { label: "Needs Changes", color: "bg-red-100    text-red-700"    },
};
```

Note: `reopened` label is **"Needs Changes"** not "Reopened" — this matches the filter tab already shown in the UI screenshot.

---

### 3. `lib/api/pm.ts`

Update `reviewSession` to send `action` instead of `status`:

```typescript
// BEFORE
reviewSession: (data: { session_id: string; status: string; review_notes: string }) =>
  apiClient.post(`/pm/sessions/${data.session_id}/review`, {
    status: data.status,
    review_notes: data.review_notes,
  }),

// AFTER
reviewSession: (data: { session_id: string; action: PMReviewAction; review_notes: string }) =>
  apiClient.post(`/pm/sessions/${data.session_id}/review`, {
    action: data.action,
    review_notes: data.review_notes,
  }),
```

---

### 4. `hooks/useSessions.ts`

#### `useReviewSession` mutation

Update the mutation input type to use `action: PMReviewAction` instead of `status: string`. The internal call flows through from `lib/api/pm.ts` so if types are updated there this should propagate — but verify the mutation variable type explicitly:

```typescript
// BEFORE
useMutation({
  mutationFn: (data: { session_id: string; status: string; review_notes: string }) =>
    pmApi.reviewSession(data),
  ...
})

// AFTER
useMutation({
  mutationFn: (data: { session_id: string; action: PMReviewAction; review_notes: string }) =>
    pmApi.reviewSession(data),
  ...
})
```

---

### 5. `app/(protected)/department/page.tsx` — Dept user dashboard

This page shows session cards. The CTA button and card border color must handle all 6 statuses.

#### Card border color by status:
```typescript
const getCardBorderColor = (status: SessionStatus) => {
  switch (status) {
    case "assigned":    return "border-slate-200";
    case "not_started": return "border-gray-200";
    case "in_progress": return "border-blue-300";
    case "submitted":   return "border-yellow-300";
    case "approved":    return "border-green-400";
    case "reopened":    return "border-red-400";   // most prominent — user needs to act
    default:            return "border-gray-200";
  }
};
```

#### CTA button logic — replace the existing switch/if chain:
```typescript
const getSessionCTA = (status: SessionStatus) => {
  switch (status) {
    case "assigned":
      return { label: "Waiting for Questions", disabled: true, variant: "outline" };
    case "not_started":
      return { label: "Start",                 disabled: false, variant: "default" };
    case "in_progress":
      return { label: "Continue",              disabled: false, variant: "default" };
    case "submitted":
      return { label: "Awaiting Review",       disabled: true,  variant: "outline" };
    case "approved":
      return { label: "View Submission",       disabled: false, variant: "outline" };
    case "reopened":
      return { label: "Revise & Resubmit",     disabled: false, variant: "destructive" };
    default:
      return { label: "Open",                  disabled: false, variant: "default" };
  }
};
```

#### Reopened banner on card:
When `session.status === "reopened"`, show the PM's rejection notes directly on the dashboard card so the user sees what needs fixing before they even open the session:

```tsx
{session.status === "reopened" && session.review_notes && (
  <div className="mt-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
    <span className="font-medium">PM feedback: </span>
    {session.review_notes}
  </div>
)}
```

#### Remove all references to `"reviewed"` and `"rejected"` statuses in this file.

---

### 6. `app/(protected)/department/sessions/[id]/page.tsx` — Session workspace

#### Editing permissions:
The user can only edit (save answers, upload documents, use AI assist) when the session is `in_progress` or `reopened`. For all other statuses the fields must be read-only.

```typescript
const canEdit = session.status === "in_progress" || session.status === "reopened";
```

Apply `canEdit` to:
- Answer text areas (`disabled={!canEdit}`)
- "Save Answers" button (`disabled={!canEdit}`)
- "Ask AI" / suggestion buttons (`disabled={!canEdit}`)
- Document upload button (`disabled={!canEdit}`)

#### Reopened banner at the top of the workspace:
Show this banner prominently at the very top of the page (above the questions list) whenever status is `reopened`:

```tsx
{session.status === "reopened" && (
  <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
    <div className="flex items-start gap-3">
      <span className="text-red-500 text-lg">⚠️</span>
      <div>
        <p className="font-semibold text-red-700">Changes Requested</p>
        <p className="mt-1 text-sm text-red-600">
          {session.review_notes
            ? session.review_notes
            : "The PM has requested changes to your submission. Please review and resubmit."}
        </p>
      </div>
    </div>
  </div>
)}
```

#### Status-based page header messages:
```typescript
const getStatusMessage = (status: SessionStatus) => {
  switch (status) {
    case "assigned":    return "Questions are being prepared. Check back soon.";
    case "not_started": return "Your questions are ready. Start answering below.";
    case "submitted":   return "Submission received. Awaiting PM review.";
    case "approved":    return "Your submission has been approved. ✅";
    case "reopened":    return "Please address the PM's feedback and resubmit.";
    default:            return null;
  }
};
```

---

### 7. `app/(protected)/department/sessions/[id]/draft/page.tsx` — Draft & finalize page

#### Finalize button:
Only show the Finalize button when `status === "in_progress"` or `status === "reopened"`. For all other statuses, hide it entirely.

```typescript
const canFinalize = session.status === "in_progress" || session.status === "reopened";
```

#### Confirm dialog copy for resubmission:
When the session is `reopened`, change the finalize confirm dialog copy:

```typescript
const finalizeDialogCopy = session.status === "reopened"
  ? {
      title: "Resubmit for Review?",
      description: "Your revised submission will be sent back to the PM for review.",
      confirmLabel: "Resubmit",
    }
  : {
      title: "Finalize Submission?",
      description: "Once submitted, you won't be able to make changes unless the PM requests revisions.",
      confirmLabel: "Submit",
    };
```

#### Post-submission success state:
After a successful finalize from `reopened`, show:
> "Resubmitted — your revised report is back with the PM for review."

Instead of the standard first-time submission message.

---

### 8. `app/(protected)/pm/sessions/[id]/page.tsx` — PM session review page

This is the most impactful change on the PM side.

#### Review action buttons:

**Remove** the `reviewed` and `rejected` buttons entirely.

**Keep only two action buttons** visible when `session.status === "submitted"`:

```tsx
{session.status === "submitted" && (
  <div className="flex gap-3">
    <Button
      variant="default"
      onClick={() => handleReview("approved")}
    >
      ✅ Approve
    </Button>
    <Button
      variant="destructive"
      onClick={() => openRejectDialog()}
    >
      ❌ Request Changes
    </Button>
  </div>
)}
```

**The reject flow must collect notes** because the backend now requires non-empty `review_notes` when `action === "rejected"`. Show a dialog:

```tsx
// Reject dialog — must have a notes field
<Dialog open={rejectDialogOpen}>
  <DialogHeader>
    <DialogTitle>Request Changes</DialogTitle>
    <DialogDescription>
      Tell the department what needs to be revised. This message will be shown to them.
    </DialogDescription>
  </DialogHeader>
  <Textarea
    placeholder="Describe what needs to change..."
    value={rejectionNotes}
    onChange={(e) => setRejectionNotes(e.target.value)}
    className="mt-2"
    rows={4}
  />
  <DialogFooter>
    <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
      Cancel
    </Button>
    <Button
      variant="destructive"
      disabled={!rejectionNotes.trim()}  // disabled until notes are typed
      onClick={() => handleReview("rejected")}
    >
      Send Back
    </Button>
  </DialogFooter>
</Dialog>
```

#### `handleReview` function — use `action` not `status`:

```typescript
// BEFORE
const handleReview = (status: string) => {
  reviewSession({ session_id: session.session_id, status, review_notes });
};

// AFTER
const handleReview = (action: PMReviewAction) => {
  reviewSession({ session_id: session.session_id, action, review_notes: rejectionNotes });
};
```

#### When session is `reopened` — show it clearly:
When PM views a session that is currently `reopened`, show a status indicator:
> "⏳ Waiting for department to revise and resubmit."

No action buttons needed while it's `reopened` — PM can't do anything until the dept user resubmits.

#### Remove any condition checks for `reviewed` or `rejected` in this file.

---

### 9. `app/(protected)/pm/cycles/[id]/page.tsx` — PM cycle workspace

#### Status filter tabs:
Replace the tabs array with the 6 new statuses:

```typescript
const STATUS_FILTERS = [
  { key: "all",         label: "All"           },
  { key: "assigned",    label: "Assigned"      },
  { key: "not_started", label: "Not Started"   },
  { key: "in_progress", label: "In Progress"   },
  { key: "submitted",   label: "Submitted"     },
  { key: "approved",    label: "Approved"      },
  { key: "reopened",    label: "Needs Changes" },
];
```

Remove `reviewed` and `rejected` tabs.

#### Stats counters on the cycle overview:
The backend's `CycleStatsResponse` now returns these fields:
```
total_departments, assigned, not_started, in_progress,
submitted, approved, reopened, completion_rate
```

`reviewed` and `rejected` fields are gone. Update any stat cards or progress indicators that were reading those fields.

#### Session table row — status badge:
The `<StatusBadge variant="session" status={row.status} />` component will automatically pick up the new colors once `SESSION_STATUSES` in `lib/constants.ts` is updated (Step 2). No change needed here as long as the badge reads from that constant.

---

### 10. `app/(protected)/admin/cycles/[id]/page.tsx` — Admin cycle overview

The admin cycle overview also shows session statuses. Same changes as above:
- Stats counters: remove `reviewed`/`rejected`, add `assigned`/`reopened`
- Any hardcoded status filter or color map: update to new 6 statuses

---

## Global search — things to delete everywhere

Run these searches across the entire frontend codebase and remove every match:

| Search term | Action |
|---|---|
| `"reviewed"` (as a status value) | Delete — this status no longer exists |
| `"rejected"` (as a status value in SESSION_STATUSES or status checks) | Delete — never a resting state |
| `status: "approved" \| "rejected"` in review payloads | Replace with `action: PMReviewAction` |
| `SessionStatus.REVIEWED` | Delete |
| `SessionStatus.REJECTED` | Delete |
| `label: "Reviewed"` in filter tabs or badge maps | Delete |
| `label: "Rejected"` in filter tabs or badge maps | Delete |
| Any `case "reviewed":` or `case "rejected":` in switch blocks | Delete |

---

## What NOT to touch

- `current_step` — separate field, nothing to do with this refactor
- `progress_percentage` — calculated by DB trigger, frontend just reads it
- Chat, documents, agents pages — unrelated
- Any admin user management pages — unrelated
- The `department_assignments` table has its own `status` column — that is NOT the same as `department_sessions.status`. Do not confuse them.

---

## Definition of Done

- [ ] `SessionStatus` type has exactly 6 values: `assigned`, `not_started`, `in_progress`, `submitted`, `approved`, `reopened`
- [ ] `PMReviewAction` type exists: `approved`, `rejected`, `reopened`
- [ ] `SESSION_STATUSES` constant has exactly 6 entries, `reopened` labeled "Needs Changes"
- [ ] `reviewSession` API call sends `action` field not `status` field
- [ ] Dept dashboard: all 6 status CTAs handled, `reopened` shows PM notes on card
- [ ] Session workspace: editing blocked except for `in_progress` and `reopened`
- [ ] Session workspace: "Changes Requested" banner visible when `reopened`
- [ ] Draft page: Finalize only shown for `in_progress` and `reopened`
- [ ] Draft page: resubmit dialog copy differs from first-time submit copy
- [ ] PM review page: only two action buttons (Approve / Request Changes)
- [ ] PM review page: reject dialog forces non-empty notes before enabling submit
- [ ] PM cycle page: filter tabs updated, `reviewed`/`rejected` tabs removed
- [ ] PM cycle stats: `reviewed`/`rejected` counters removed, `assigned`/`reopened` added
- [ ] Global search for `"reviewed"` as a status value returns zero results
- [ ] Global search for `"rejected"` as a status value returns zero results
- [ ] No TypeScript errors (`npm run build` passes clean)