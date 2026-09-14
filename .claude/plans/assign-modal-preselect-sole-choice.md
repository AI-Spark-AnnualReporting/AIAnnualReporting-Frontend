# Pre-select the sole assignee in "Assign & send questions"

Repo: `/Users/ahmer/Documents/Work/Anual Reporting/AIAnnualReporting-Frontend` (Next.js, :3000,
branch `annual-design`). One file. No backend change.

## Context

On the HOD / HR-Lead review screen (`/hod/sessions/[id]`), finishing a review opens an
**Assign & send questions** modal with a radio list headed CHOOSE WHO ANSWERS.

When the department has no other members, that list has exactly one row — *you* — and it opens
**unselected**, leaving "Send questions" disabled. The only input the screen accepts is a click on
the single option it already knows is the only answer. Every pass costs a dead click, and it reads
as a broken button until you spot the hollow radio.

Two smaller things are wrong in that same unselected state, because both labels key off
`self` (`page.tsx:363`), which is false while nothing is picked:
- the note heading says "Note to the team member" when the only candidate is you
- the button says "Send questions" when it should say "Start answering"

Pre-selecting fixes all three at once.

This bites the Spark-internal user testing the flow end to end against a one-person department.

**Decisions taken:** gate it to Spark-internal users, and fire **only when that row is the sole
option**. As soon as real members are in the list nothing is pre-selected, so this can never
quietly assign a department's questions to the wrong person.

**Intended outcome:** internal user opens the modal with one candidate → already selected, Send
enabled, labels correct. Two or more candidates, or any non-internal user → behaviour unchanged.

## One thing that was worth checking

The header in the screenshot reads "spark · **Department User**", which looks like the gate would
never fire. It is a mislabel, not the real role: `DeptTopNav.tsx:76` renders
`{user.role === "hod" ? leadLabel : "Department User"}` — a two-branch literal with no Spark case,
so a Spark user falls to the hardcoded else. Confirmed against the database:

```
usr_59e34fa0a04e  spark@wearespark.me  spark  role = spark_internal
```

So `user.role` really is `spark_internal` here. `AppShell.tsx:27-36` computes an `effectiveRole`
from the URL path (`/hod` → `"hod"`), but it is a local const — never written to the user object,
never in context. **Gate on the account role, never on `effectiveRole` or the sidebar labels.**

## The change

All of it in `app/(protected)/hod/sessions/[id]/page.tsx`, inside `AssignModal` (`:345-439`).
`useEffect` is already imported (`:3`); `me` and `isLoading` are already in scope (`:348-349`).

**Derive during render — no effect, no new state.** This is the codebase's own stated preference:
`app/(protected)/pm/cycles/[id]/build/page.tsx:90-92` does exactly this and says why ("derived
during render (no effect) so the initial selection never causes a cascading re-render"). The
alternative convention, an auto-select `useEffect` (`components/chat/ConversationsView.tsx:86-90`),
would also work but latches — see the loading race below, which deriving avoids for free.

Add after `choices` (`:357-361`):

```tsx
// A Spark-internal tester hits this modal against a one-person department on
// every pass, where the only option opens unselected and Send is disabled — so
// the first click is always a no-op. Assume it for them, and only then: with two
// or more candidates nothing is assumed, so questions can never be assigned to
// the wrong person by default. Derived rather than stored, so when the user list
// finishes loading and others appear, this simply stops applying.
const soleChoice =
  !isLoading && me?.role === "spark_internal" && choices.length === 1
    ? choices[0].user_id
    : null
const effectiveUserId = userId ?? soleChoice
```

Then read `effectiveUserId` instead of `userId` at its four use sites — `setUserId` stays as it is,
so an explicit click still wins:

| line | now | becomes |
|---|---|---|
| `:363` | `const self = !!me && userId === me.user_id` | `… effectiveUserId === me.user_id` |
| `:366` | `if (!userId) return` | `if (!effectiveUserId) return` |
| `:367` | `assign.mutate({ user_id: userId, …})` | `{ user_id: effectiveUserId, … }` |
| `:389` | `const selected = userId === u.user_id` | `const selected = effectiveUserId === u.user_id` |
| `:429` | `disabled={!userId \|\| assign.isPending}` | `disabled={!effectiveUserId \|\| …}` |

**The `!isLoading` guard is load-bearing, not defensive.** While the query is in flight `users` is
`undefined`, so `choices` is `[me]` — length 1. Without the guard the modal would pre-select and
enable Send *during the spinner*, on any department, including ones with a full team. Deriving
(rather than an effect) then also self-corrects: once the real list arrives, `choices.length > 1`
and the pre-selection silently drops away instead of being stuck in state.

**Keeping the role check inline**, matching the existing precedent at
`components/layout/BackToCentritonButton.tsx:32` (`const isSpark = user.role === "spark_internal"`).
There is no shared helper in this repo — the check is spelled inline in five places
(`AppShell.tsx:28`, `RouteGuard.tsx:56,86`, and the two route maps). Extracting an
`isSparkInternal` into `lib/constants.ts` beside `USER_ROLES` would be a reasonable follow-up, but
it means touching five unrelated files, so it is not part of this change.

## Worth flagging, not fixing here

`users` in the database contains a row with role **`spark_admin`** (`info@wearespark.me`) — a value
that is not in this backend's `UserRole` enum (`app/core/enums.py:31-39`, five members) nor in the
frontend's `UserRole` union (`types/index.ts:5-11`). If you ever sign into the annual-reporting app
with that account, `UserRole(row["role"])` at `app/api/dependencies.py:175` will raise, and this
new gate would not fire for it either. Not a problem for the account in the screenshot
(`spark@wearespark.me` is a clean `spark_internal`), but say the word if you want it looked at.

## Verification

From `/Users/ahmer/Documents/Work/Anual Reporting/AIAnnualReporting-Frontend`:

1. `npx tsc --noEmit` — this repo has a single `tsconfig.json` and `next build` type-checks against
   it, so the bare form is correct here (unlike Centrion_Frontend, which needs
   `-p tsconfig.app.json`). Record the pre-change error count first and compare; do not assume zero.
2. `npm run lint`
3. `npm run build`

There is no component test runner in this repo — only three pure-function `lib/*.test.ts` files and
no `test` script — so the behaviour itself is checked in the browser. The dev server is already
running on :3000.

4. **The reported case.** Signed in as `spark@wearespark.me`, open
   `/hod/sessions/session_228621b42f681ecc`, approve the questions, click "Assign & send →".
   The single `spark / YOU` row should already be selected, "Send questions" enabled, the note
   heading reading "Note to yourself" and the button reading "Start answering".
5. **The safety case.** Add a second active `department_user` to that department, reopen the modal,
   and confirm **nothing** is pre-selected and Send is disabled until you pick someone.
6. **The loading case.** Throttle the network (or watch a cold load) and confirm Send stays
   disabled while the list spinner is showing — this is what the `!isLoading` guard is for.
7. **The non-internal case.** As a genuine `hod` account with a one-person department, confirm the
   modal still opens unselected, exactly as today.
8. Send once and confirm the assignment still lands: it should route to `/department`
   (`onAssigned(self)` at `page.tsx:309-311`) and the session should show as assigned.
