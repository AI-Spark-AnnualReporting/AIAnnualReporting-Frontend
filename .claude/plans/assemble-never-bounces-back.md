# Assemble never bounces back to the Report Builder

**Date:** 2026-10-05
**Repo:** AIAnnualReporting-Frontend only (no backend, no DB, no endpoint changes)
**Status:** SUPERSEDED (2026-10-05) by `AIAnnualReporting/.claude/plans/assemble-in-background-with-polling.md`. Only the 300s timeout in `lib/api/pm.ts` survives (used by the report page's direct assemble); the retry/recovery code was removed.

## The bug

On the Report Builder (`/pm/cycles/[id]/build`) the PM clicks **Assemble Report**.
The "Assembling your report" loading screen appears. Sometimes it vanishes and the
PM is back on the builder. Clicking Assemble a second time works.

## What actually happens (investigation)

- The loading screen lives inside `components/report/AssembleEntry.tsx`.
- Only one code path takes it away without going to the preview: the `catch` in
  `runAssemble`. If the assemble request **fails for any reason**, it sets the
  phase back to `"idle"` and the PM lands on the builder again. The only other
  sign is a red toast.
- The request has a **120 second limit** in the browser (`lib/api/pm.ts`,
  `assembleReport`). When the server is slower than that, the browser gives up.
- **The server does not stop when the browser gives up.** It finishes and saves
  the report anyway.
- So the second click finds a saved report. `assemble_report` with
  `refresh=false` returns the stored report right away, and the preview opens.
  That is why the second click always works.
- Why it's random: assembling is a chain of AI calls. There is one call for the
  executive summary, one small title check per section run one after another,
  then embedding and a financial-figures call, then the title checks again while
  the response is built. A 9-chunk report took about 40s. Longer reports (e.g.
  BUPA, now 30 sections), or a slow moment at OpenAI, push it past 120s on some
  runs and not others.
- One more way to land here: the dev backend runs with auto-reload. If a backend
  file is saved during an assemble, the server restarts and the request dies
  ("Network Error"). That one also works on the second click.
- Ruled out: the login guard (it only loads once), cache resets (none), and the
  report page sending you back (it never redirects).

## The fix (4 steps)

### 1. Give the request more time: `lib/api/pm.ts`
- `assembleReport` timeout goes from 120s to 300s (5 min). That's the same limit
  the department draft generation already uses.
- Fixes most slow runs on its own.

### 2. Keep the timeout reason in errors: `lib/api/client.ts`
- The shared error object currently has `error`, `message`, `status` and
  `details`. Add `code` (axios's own code, e.g. `ECONNABORTED` for a timeout,
  `ERR_NETWORK` for a dropped connection).
- Purely additive. No existing code reads `code`, so nothing else changes.

### 3. Let the builder handle its own assemble errors: `hooks/useReportBuilder.ts`
- `useAssembleReport(cycleId, { showErrorToast = true })`. The default keeps
  today's behaviour, so the report page's two callers are unchanged.
- AssembleEntry passes `false`. Otherwise a red "failed" toast would pop up
  while we are quietly recovering.

### 4. Never drop the PM back silently: `components/report/AssembleEntry.tsx`
Before starting, remember the current report's `generated_at` (null if there is
none yet). The server sets this value whenever a report is saved, so a new value
means "a new report was saved".

On failure, sort the error into one of 3 kinds (a small pure function in a new
file, `lib/assembleRecovery.ts`):

| Kind | When | What we do (loader stays up) |
|---|---|---|
| **refused** | server answered 400–499: nothing to assemble, report locked, no access | Go straight to the error screen (below). Retrying can't help. |
| **timed out** | browser gave up waiting | The server is probably still working. Check `GET final-report` every 5s for up to 3 min. A report with a new `generated_at` counts as success. |
| **failed** | server error 500+, or connection dropped | Check once for a new report. If none, **retry the assemble once automatically**. |

- **Success from any of these:** put the report in the cache, finish the loader,
  and open the preview, exactly like a normal success.
- **Error screen** (only when recovery also fails): the overlay stays up and shows
  "We couldn't assemble the report", the reason, and two buttons: **Try again**
  and **Back to builder**. The PM is never moved without clicking something.
- Why the "timed out" kind doesn't re-send right away: the first run is still
  going on the server. A second run would pay for every AI call twice, and the
  two runs could both save a report.

New test file `lib/assembleRecovery.test.ts` checks the sorting and the "is this
a new report" rule. It needs no framework, like the other `lib/*.test.ts`, and
runs with `node`.

## What could break (impact)

- **Example:** a 150s assemble today means: loader → back on builder plus a red
  toast → click again → preview. After the fix it means: loader for 150s →
  preview. A server restart mid-assemble: loader, quiet automatic retry, preview.
- Report page re-assemble (`report/page.tsx`): unchanged. It still uses the
  default toast and the old timeout behaviour, apart from the longer 300s limit.
- Worst case for a genuinely stuck server: the PM waits up to 5 min plus 3 min of
  checking before seeing the error screen, instead of 2 min. That's a
  deliberate trade.
- The automatic retry re-runs the AI calls once, but only after confirming no new
  report was saved. It never double-runs while the first run is still alive.
- Backend: untouched.

## Verification
- `node lib/assembleRecovery.test.ts`, `npx tsc --noEmit`, `npm run lint`, and
  `npm run build` compared against the counts before the change.
- Manual, by you:
  - (a) A normal assemble still opens the preview.
  - (b) Start an assemble, then save any backend file (auto-reload kills the
    request). It should retry and still open the preview.
  - (c) Assemble a locked report. You should see the error screen, not a jump
    back.

## Last step
Update `Anual Reporting/notes/`: add a feature note "Assemble Recovery", update
`Current Status.md`, and link it from [[Report Builder Pipeline]].
