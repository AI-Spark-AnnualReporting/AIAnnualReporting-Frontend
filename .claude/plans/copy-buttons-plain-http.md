# Copy buttons — make them work on plain http (on-prem)

**Date:** 2026-11-26
**Repo:** frontend only
**Branch:** `fix/copy-buttons` from `pre-staging`
**Status:** Done

## The problem in plain words

Every Copy button used only `navigator.clipboard.writeText(...)`. Browsers only give pages
`navigator.clipboard` on https or http://localhost. On an on-prem server opened as
`http://<server-ip>:...` it is missing, so nothing was copied.

| # | Where | File | Before (on http) |
|---|---|---|---|
| 1 | Department session — copy AI answer | `app/(protected)/department/sessions/[id]/page.tsx` | Said "Copied", copied nothing |
| 2 | Department session — copy saved answer | same file | Said "Copied", copied nothing |
| 3 | HOD — department client share link | `components/hod/DepartmentClientShare.tsx` | Error toast |
| 4 | PM — share with client link | `components/pm/ShareWithClientButton.tsx` | Error toast |
| 5 | Client review card link | `components/report-review/ClientReviewCard.tsx` | Error toast |
| 6 | Share with client dialog link | `components/report-review/ShareWithClientDialog.tsx` | Error toast |
| 7 | Create design — copy JSON | `components/report/create-design/UnitJsonPanel.tsx` | Nothing |

## The fix

1. New `lib/copyText.ts` — `copyTextToClipboard(text)` returns true/false. Tries the clipboard API
   first; if missing or refused, copies through a hidden textarea + `document.execCommand('copy')`,
   which works on plain http. The textarea goes inside an open Radix dialog (focus trap) and focus
   goes back to the button.
2. All 7 buttons use it. Same toasts as before; rows 1–2 now show "Copied" only when it really
   copied (new small `copyAnswerText` in the session page), and an error otherwise.
3. `lib/copyText.test.ts` — self-check, run with `node lib/copyText.test.ts`.

## Ripple effects

- No backend, DB, or endpoint changes. No Postman update.
- On https / localhost nothing changes for the user.
- Same fix as Centriyon frontend (`Centrion_Frontend/src/lib/copyText.ts`, branch `fix/copy-buttons`).

## Check by hand

Open the app on `http://<your-PC-IP>:<port>` (not localhost), click each button above, paste into Notepad.
