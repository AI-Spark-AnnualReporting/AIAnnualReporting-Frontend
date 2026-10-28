# Annual Report Validator: make our page look like Centriyon's

**Status:** Built 2026-10-11 (approved the same day), not committed. tsc + eslint clean, `npm run build` passes; compared side by side in the browser (admin's Centriyon page vs Spark's page): form, running, results and cards match.
**Repo:** frontend only (`AIAnnualReporting-Frontend`). No backend, DB, endpoint or Centrion change.
**Decision (2026-10-11):** keep two pages (Spark → ours, admin → Centriyon's) but make them look and behave the same. Option B, chosen over "Spark uses Centriyon's page".

## What Spark will see
The same screen admin sees in Centriyon, inside our app:
1. A **"Set up validation"** card (icon, caption, collapses) with numbered steps **1 Annual report · 2 Strategic brief · 3 Concept messages · 4 Tone · 5 Validate**.
2. **Dashed drop zones** for files (file name, size, "click to replace", Remove), not "Choose File" buttons.
3. **"Type it / Upload a file"** tabs for the brief, concepts and tone.
4. Errors shown **next to the Validate button** (e.g. "The annual report must be a DOCX file."), not as a toast.
5. **Centriyon's AI loader** while it runs (ring, progress bar, tips), with the live stage line.
6. Results: a **Back** button, the title, "file — checked {date}", and **Validate again**, then the same panel.
7. **Previous validations** as **cards** (dark top with file name and score, "Continue →", "2 days ago"), newest first, with loading skeletons.

## What stays different (cannot be the same)
- **The app around the page**: our PM sidebar and top bar vs Centriyon's sidebar. The page content matches; the frame is each app's own.
- **Refresh-safe run page:** ours keeps the job id in the URL (`/runs/{jobId}`); Centriyon's is one page that loses the run on refresh. Same look, ours just survives a refresh.

## Ripple effects
- Only the two validator pages change, plus one breadcrumb line. Our own report's Validate report, the Report page and the Validation page are untouched (they use the same results panel, which isn't changing).
- **Two copies of the same look now exist** (Centriyon's page and ours). A future visual change needs doing in both, the cost of keeping two pages.
- **Breadcrumb:** it now says "Annual Report Validator", not "Dashboard" (suspect S1 from the test, confirmed: `pageTitle` in `PMTopNav.tsx` falls back to "Dashboard").

## Steps
1. **New `components/validator/` (ported from Centriyon, Tailwind + Centriyon's colours, no new dependency):**
   - `SetupCard.tsx`, `Section.tsx`, `ModeTabs.tsx`, `FileDropzone.tsx`: the form pieces, ported from `Centrion_Frontend/src/pages/AnnualReportValidatorPage.tsx`. Centriyon's `.card .ct .tabs .tab .inp .btn .bp .bs` CSS becomes Tailwind classes.
   - `ValidatorLoader.tsx`: a port of Centriyon's `AiLoadingScreen` (ring, progress, rotating tips, live stage as the subtitle, no milestone list).
   - `PreviousValidationsGallery.tsx`: a port of Centriyon's gallery (cards, skeletons, relative time), fed by our existing `useExternalValidations`.
2. **`app/(protected)/pm/annual-report-validator/page.tsx`:** rebuilt with those pieces. The same state and the same API call (`useStartExternalValidation`). The start error is shown inline next to Validate.
3. **`app/(protected)/pm/annual-report-validator/runs/[jobId]/page.tsx`:** `ValidatorLoader` while running; results header like Centriyon's (Back, title, "checked {date}", Validate again); the failed state like Centriyon's.
4. **`components/layout/PMTopNav.tsx`:** `pageTitle` returns "Annual Report Validator" for `/pm/annual-report-validator`.
5. **Remove** the now-unused bits in the old page (its plain `Field` wrapper etc.). The `ReportValidateLoader` stays, since our own report's Validation page uses it.
6. **Checks:** `npx tsc --noEmit`, eslint, `npm run build`, then the browser side by side: admin's Centriyon page and Spark's page, screenshots of the form, running, results and the gallery.
7. Notes: `notes/Features/Assembled Report Validation.md`, plus a line in `Decisions.md` (two pages kept, made to match).

## Not in scope
Changing Centriyon's page, the backend, or the shared results panel.

## What was built (2026-10-11)
- `components/validator/validator-ui.tsx`: SetupCard, Section, ModeTabs, FileDropzone, ValidatorHeader and `checkedAt`, copied from Centriyon's page with the same inline styles.
- `components/validator/PreviousValidationsGallery.tsx`: Centriyon's cards (gradient top, score, action pill, relative time, skeletons). A card links to `/runs/{id}`. It replaces `components/report/PreviousValidationsList.tsx` (deleted).
- `app/globals.css`: Centriyon's `.card .ct .tabs .tab .inp .bsm`, copied verbatim and unlayered like the existing `.btn .bp .bs`.
- `components/report/AiLoadingScreen.tsx`: skips the checklist box when there are no steps (the same change Centriyon made); used for the run screen with Centriyon's tips.
- Both pages rebuilt. The start error shows next to Validate (the start hook no longer toasts). The finish animation only plays for a run watched while running; a finished run opened from a card shows at once.
- `PMTopNav.tsx`: the breadcrumb reads "Annual Report Validator".

## Found while comparing
- Our Tailwind v4 `space-y-*` puts the gap **below** each child, Centriyon's v3 above, so the inline `marginBottom`s copied from Centriyon cancelled the gap. Removed in our copy.
- Back used our app's blue. It is now Centriyon's indigo, set inline (a new Tailwind colour class didn't show until the dev server was restarted).
- A production `npm run build` while `npm run dev` is running replaces `.next` under the dev server, which then serves a stale stylesheet. Restart the dev server after a build.

## Still different (by design)
- The app frame around the page (our PM sidebar and top bar vs Centriyon's).
- Our run page survives a refresh (job id in the URL); Centriyon's doesn't.
- A faint extra pulse behind the loader ring: our app's copy of the loader has it.
