# Frontend Spec — PM Dashboard Changes
# Reflects Backend Modules 1-6

## Status
Ready for implementation

## Overview
The backend question generation pipeline has been completely rebuilt.
This spec covers all frontend changes needed to reflect those backend changes
for the PM role only.

No new pages. No new routes. Changes are confined to existing files.

---

## Files to Read BEFORE making any changes

Read every file listed here before touching anything:

1. `types/index.ts` — all domain types
2. `lib/api/pm.ts` — PM API calls
3. `lib/constants.ts` — status maps, query keys
4. `hooks/useSessions.ts` — PM session mutations and queries
5. `app/(protected)/pm/cycles/[id]/page.tsx` — PM cycle workspace (largest file)
6. `app/(protected)/pm/page.tsx` — PM dashboard
7. `app/(protected)/pm/cycles/page.tsx` — PM cycles list

---

## Context — What Changed in the Backend

### Session lifecycle is now two steps
Before: admin activate created sessions + generated questions in one step.
Now:
- Admin assign departments → creates sessions with `status = not_started`, empty questions
- PM submits kickoff → generates questions, moves sessions to `in_progress`

This means the PM cycle page will now show `not_started` sessions before
the PM has submitted the kickoff brief. Previously `not_started` count was
always zero.

### PM kickoff response has new fields
The backend now returns additional fields from `POST /pm/kickoff`:
```json
{
  "success": true,
  "message": "...",
  "cycle_id": "...",
  "departments_processed": 3,
  "used_document_context": true,
  "brief_quality": {
    "quality": "low | acceptable | good",
    "total": 4,
    "missing": ["specific targets", "year themes"],
    "suggestion": "Add FY2026 priorities and specific targets..."
  },
  "warning": "Brief quality is low. Questions generated may be generic...",
  "enrichment_applied": true
}
```

### num_questions is now accepted
The kickoff request now accepts `num_questions: int` (range 5-20, default 12).
This controls how many questions are generated per department.

---

## Change 1 — `types/index.ts`

### 1a. Add BriefQuality type
Add this new type — place it near other response types:

```typescript
export interface BriefQuality {
  quality: "low" | "acceptable" | "good"
  total: number
  length_score?: number
  specificity_score?: number
  cycle_relevance_score?: number
  missing: string[]
  suggestion: string
}
```

### 1b. Add or update KickoffBriefResponse type
Find the existing kickoff response type (may be inline or named).
Add the new fields:

```typescript
export interface KickoffBriefResponse {
  success: boolean
  message: string
  cycle_id: string
  departments_processed: number
  used_document_context?: boolean
  brief_quality?: BriefQuality
  warning?: string
  enrichment_applied?: boolean
}
```

### 1c. Verify SessionStatus includes not_started
Find the SessionStatus type. Confirm `not_started` is present:

```typescript
export type SessionStatus =
  | "not_started"    // ← must be here
  | "in_progress"
  | "submitted"
  | "reviewed"
  | "approved"
  | "rejected"
  | "reopened"
```

If missing, add it.

### 1d. Add enriched_context to Cycle type
Find the Cycle type. Add optional field:

```typescript
enriched_context?: string
```

### What NOT to change in this file
Do not change any other existing types.
Do not remove any fields.
Only add new fields and the new BriefQuality interface.

---

## Change 2 — `lib/constants.ts`

### 2a. Verify not_started in SESSION_STATUSES
Find `SESSION_STATUSES`. Confirm `not_started` entry exists with a label and color.
If missing, add it:

```typescript
not_started: {
  label: "Not Started",
  color: "gray",       // use whatever color key your StatusBadge expects
  // match the pattern of other entries exactly
}
```

Look at how other entries are structured (e.g. `in_progress`, `submitted`)
and match that exact shape.

### What NOT to change in this file
Do not change any other status entries.
Do not change CYCLE_STATUSES, USER_STATUSES, TONE_OPTIONS, or QUERY_KEYS.

---

## Change 3 — `lib/api/pm.ts`

### 3a. Update submitKickoff to include num_questions
Find the `submitKickoff` function (calls `POST /pm/kickoff`).

Update the request payload type to include `num_questions`:

```typescript
submitKickoff: (data: {
  cycle_id: string
  strategic_brief: string
  additional_context?: string
  num_questions?: number    // NEW — backend default is 12 if omitted
}) => apiClient.post<KickoffBriefResponse>("/pm/kickoff", data)
```

If the function is typed with an inline type, update the inline type.
If it references a named request type, add `num_questions?: number` to that type.

### 3b. Update uploadKickoffDoc if it also takes a brief
Find `uploadKickoffDoc` (calls `POST /pm/kickoff/upload`).
If it includes `strategic_brief` in its FormData, also add `num_questions`
to the FormData append calls:

```typescript
if (data.num_questions) {
  formData.append("num_questions", String(data.num_questions))
}
```

### What NOT to change in this file
Do not change any other PM API functions.
Do not change endpoint URLs.
Do not change error handling patterns.

---

## Change 4 — `hooks/useSessions.ts`

### 4a. Update useSubmitKickoff mutation to return response data
Find the `useSubmitKickoff` mutation.

Currently it likely toasts success and invalidates queries.
It needs to also expose the full response data so the calling component
can read `brief_quality` and `warning` after submission.

The mutation's `onSuccess` should still:
- Toast success message
- Invalidate relevant queries

But the mutation itself must return the response data.
TanStack Query mutations return response data from `mutateAsync`.

Ensure the mutation is typed to return `KickoffBriefResponse`:

```typescript
const useSubmitKickoff = () => {
  return useMutation<KickoffBriefResponse, Error, KickoffRequest>({
    mutationFn: (data) => pmApi.submitKickoff(data),
    onSuccess: (data, variables) => {
      // existing invalidations — keep them all
      queryClient.invalidateQueries(...)

      // Only toast if quality is good or acceptable
      // Do NOT toast here if quality is low — the component handles that
      if (!data.warning) {
        toast.success("Kickoff brief submitted successfully")
      }
    },
    onError: (error) => {
      toast.error(error?.message || "Failed to submit kickoff brief")
    }
  })
}
```

If the existing mutation already returns data correctly via `mutateAsync`,
just ensure the return type is `KickoffBriefResponse`. Do not restructure
the whole mutation — minimal change only.

### What NOT to change in this file
Do not change any other mutations or queries.
Do not change usePMDashboard, usePMCycleDashboard, useReviewSession,
useSendReminder, useGenerateReport, or any other hook.

---

## Change 5 — PM Kickoff Dialog in `/pm/cycles/[id]/page.tsx`

This is the main UI change. The kickoff dialog/form currently has
a textarea for the brief and optionally a file upload.

Read the full file first to understand how the dialog is structured
before making any changes.

### 5a. Add word counter to brief textarea

Find the brief textarea in the kickoff dialog.
Add a word counter that updates as the PM types.

Logic:
```typescript
const wordCount = brief.trim() === "" ? 0 : brief.trim().split(/\s+/).length
```

Display below the textarea:
- 0–49 words → red text: `"{wordCount} words — minimum 50 recommended for good questions"`
- 50–149 words → amber text: `"{wordCount} words — good start, more detail helps"`
- 150+ words → green text: `"{wordCount} words — good detail"`

Do NOT disable the submit button based on word count.
This is informational only — PM can always submit.

### 5b. Add num_questions slider

Add a slider input below the brief textarea and above the submit button.

```
Label: "Questions per department"
Min: 5
Max: 20
Default: 12
Step: 1
Show current value next to label: "Questions per department: 12"
```

Use a standard HTML range input or whatever slider component exists
in the codebase. Store value in local state:

```typescript
const [numQuestions, setNumQuestions] = useState(12)
```

Pass to submission:
```typescript
await submitKickoff.mutateAsync({
  cycle_id: cycleId,
  strategic_brief: brief,
  num_questions: numQuestions,
})
```

### 5c. Show quality feedback after successful submission

After `mutateAsync` resolves successfully, read the response:

```typescript
const result = await submitKickoff.mutateAsync({...})

if (result.brief_quality?.quality === "low") {
  // Show warning — do NOT close the dialog yet
  // Set a state variable to show the warning inside the dialog
  setQualityWarning({
    suggestion: result.brief_quality.suggestion,
    missing: result.brief_quality.missing,
  })
} else {
  // Good or acceptable — close dialog normally
  setOpen(false)
  toast.success("Kickoff submitted. Questions are being generated.")
}

if (result.enrichment_applied) {
  // Show subtle info toast
  toast.info("Brief was expanded with AI context to improve question quality.")
}
```

### 5d. Quality warning UI inside the dialog

When `qualityWarning` state is set, show inside the dialog
(below the form, above the submit button):

```
[amber warning box]
⚠ Brief quality is low
{qualityWarning.suggestion}

Missing: {qualityWarning.missing.join(", ")}

Questions have been generated but may be generic.
You can improve your brief and resubmit to regenerate questions.

[Two buttons]
[Close anyway]   [Improve brief]
```

- "Close anyway" → closes dialog, invalidates queries, done
- "Improve brief" → stays on dialog, clears warning, lets PM edit and resubmit

State management:
```typescript
const [qualityWarning, setQualityWarning] = useState<{
  suggestion: string
  missing: string[]
} | null>(null)

// Reset when dialog opens
const handleOpenChange = (open: boolean) => {
  if (!open) setQualityWarning(null)
  setDialogOpen(open)
}
```

### What NOT to change in this file
Do not change the review session flow.
Do not change reminder or escalation dialogs.
Do not change the generate report dialog.
Do not change any other part of this large file.
Only touch the kickoff dialog section.

---

## Change 6 — Session Status Display in PM Cycle Page

Still in `/pm/cycles/[id]/page.tsx`.

### 6a. Handle not_started sessions in the session table

The session table on this page shows all sessions for the cycle.
Sessions now arrive with `status = "not_started"` before PM submits kickoff.

Find where session rows are rendered in the table.

For sessions with `status === "not_started"`:
- Status badge should show "Not Started" in gray
  (this comes from SESSION_STATUSES which was updated in Change 2)
- The review action button should be hidden or disabled
- Show a subtle note in the row: "Awaiting kickoff submission"

No other row changes needed.

### 6b. Stats breakdown includes not_started count

Find where the cycle stats are displayed
(total / submitted / in_progress / not_started breakdown).

The backend now returns a real `not_started` count.
Ensure it is displayed in the breakdown.

If the stats card currently shows:
```
Submitted    X
In Progress  X
Not Started  X   ← verify this is wired to real data not hardcoded 0
```

Check that `not_started` comes from the API response and is not
hardcoded or omitted. If it is hardcoded to 0, fix it to read
from the actual stats data.

---

## Change 7 — PM Dashboard Stats (`/pm/page.tsx`)

### 7a. not_started count in per-cycle cards

Find the per-cycle progress cards on the PM dashboard.
Each card shows a breakdown of session statuses.

Verify `not_started` is included in the breakdown and shows the
real count from the backend. If it is omitted or hardcoded to 0, fix it.

The cycle cards should show all status counts including `not_started`
so the PM can see how many departments are still waiting for kickoff.

### What NOT to change in this file
Do not change the pending reviews section.
Do not change the recent submissions feed.
Do not change stat cards at the top.

---

## Change 8 — PM Cycles List (`/pm/cycles/page.tsx`)

No functional changes needed here.

Only verify that cycles showing `not_started` sessions do not display
incorrectly. If a cycle has all sessions in `not_started` state
(PM has not yet submitted kickoff), the completion percentage should
show 0% and the status breakdown should show the `not_started` count.

If this already works correctly, skip this file.

---

## Summary of Files Changed

| File | What changes |
|---|---|
| `types/index.ts` | Add BriefQuality type, update KickoffBriefResponse, verify SessionStatus |
| `lib/constants.ts` | Verify/add not_started to SESSION_STATUSES |
| `lib/api/pm.ts` | Add num_questions to submitKickoff request |
| `hooks/useSessions.ts` | Ensure useSubmitKickoff returns KickoffBriefResponse |
| `app/(protected)/pm/cycles/[id]/page.tsx` | Word counter, num_questions slider, quality feedback, not_started rows |
| `app/(protected)/pm/page.tsx` | Verify not_started count in cycle cards |
| `app/(protected)/pm/cycles/page.tsx` | Verify only — no changes if already correct |

---

## What NOT to Change (Global)

- Do not change any admin pages
- Do not change any department user pages
- Do not change auth flow
- Do not change the sidebar or topnav
- Do not change any API endpoint URLs
- Do not change the proxy layer in `app/api/pm/*`
- Do not change useReviewSession, usePMDashboard, usePMCycleDashboard
- Do not change the generate report flow
- Do not change reminder or escalation flows
- Do not add new pages or routes

---

## Verification — How to Test

### Test 1 — Word counter works
Open PM kickoff dialog. Type a short brief.
Expected: word count shows in red under 50 words.
Type more. Expected: color changes to amber then green at correct thresholds.
Submit button always enabled regardless of word count.

### Test 2 — num_questions slider works
Open PM kickoff dialog.
Expected: slider visible with range 5-20, default 12.
Move slider to 7. Submit kickoff.
Check backend — sessions should have approximately 7 questions each.

### Test 3 — Quality warning shows for weak brief
Submit kickoff with a brief under 50 words.
Expected:
- Dialog stays open
- Amber warning box appears with suggestion text
- Two buttons: "Close anyway" and "Improve brief"
- "Improve brief" keeps dialog open for editing
- "Close anyway" closes and refreshes dashboard

### Test 4 — Quality warning absent for good brief
Submit kickoff with a detailed 150+ word brief with specific targets.
Expected:
- Dialog closes normally
- Success toast appears
- No warning shown
- If enrichment_applied is true, info toast appears

### Test 5 — not_started sessions display correctly
Before PM submits kickoff (sessions are in not_started state):
Open PM cycle page.
Expected:
- Sessions show "Not Started" gray badge
- No review action button visible
- Stats breakdown shows correct not_started count

### Test 6 — After kickoff submission
After PM submits kickoff:
Sessions move to in_progress.
Expected:
- Status badges update to "In Progress"
- not_started count drops to 0
- in_progress count increases

---

## Definition of Done

- [ ] BriefQuality type added to types/index.ts
- [ ] KickoffBriefResponse has brief_quality, warning, enrichment_applied fields
- [ ] SessionStatus includes not_started
- [ ] SESSION_STATUSES has not_started entry with label and color
- [ ] submitKickoff API call includes num_questions
- [ ] useSubmitKickoff mutation returns KickoffBriefResponse data
- [ ] Word counter shows below brief textarea with correct color thresholds
- [ ] num_questions slider in kickoff dialog (5-20, default 12)
- [ ] Quality warning UI shows when quality === "low"
- [ ] Quality warning has "Close anyway" and "Improve brief" buttons
- [ ] Enrichment toast shows when enrichment_applied === true
- [ ] not_started sessions show correct badge and no review action
- [ ] not_started count is real data not hardcoded 0
- [ ] No regression on review, reminder, escalation, generate report flows

