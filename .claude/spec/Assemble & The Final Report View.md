# Stage 8 — Frontend Spec: Assemble & The Final Report View

**Goal of this stage:** The payoff screen. The PM assembles the report (gated on all sections locked), then sees the finished document on screen — cover, generated table of contents, executive summary, the narrative sections in order, and the financial/governance sections as embedded document cards. A **Download** produces a PDF of the rendered report (narrative bound in; financials referenced as attachments — v1 hybrid). This is the artifact the whole system was built to produce.

**Verifiable output:** On an all-locked cycle → "Assemble Report" → the final report renders: cover block, TOC, exec summary, ordered narrative sections as polished prose, financials as document cards. "Download PDF" produces a clean printable document.

**Stack:** existing. Reuses Stage 8 backend (`assembly-readiness`, `assemble`, `final-report`), `react-markdown` + `prose` for narrative rendering.

**Touches:**
- `lib/api/pm.ts` — `assemblyReadiness`, `assembleReport`, `getFinalReport`
- `hooks/useReportBuilder.ts` — `useAssemblyReadiness`, `useAssembleReport`, `useFinalReport`
- `types/index.ts` — `FinalReport`, `FinalReportSection`
- `app/(protected)/pm/cycles/[id]/report/page.tsx` — NEW: the final report view
- builder entry: an "Assemble Report" action gated on readiness
- `components/report/FinalReportView.tsx`, `ReportSectionRenderer.tsx`

---

## 1. Types

```ts
export interface FinalReportSection {
  type: "narrative" | "attachment" | "auto";
  section_code: string;
  title: string;
  order: number;
  content?: string;                  // narrative
  document?: { document_id: string; filename: string; file_type: string }; // attachment
}
export interface FinalReport {
  cycle_id: string;
  headline: string | null;
  executive_summary: string | null;
  word_count: number;
  status: string;
  generated_at: string | null;
  sections: FinalReportSection[];
}
```

---

## 2. API + hooks

```ts
// pm.ts
assemblyReadiness: (id) => apiClient.get(`/pm/cycles/${id}/assembly-readiness`).then(r => r.data),
assembleReport:    (id, refresh=false) => apiClient.post(`/pm/cycles/${id}/assemble?refresh=${refresh}`, null, {timeout:120_000}).then(r => r.data),
getFinalReport:    (id) => apiClient.get(`/pm/cycles/${id}/final-report`).then(r => r.data),
```

```ts
// hooks
useAssemblyReadiness(cycleId)  // staleTime 0 — reflects lock progress
useAssembleReport(cycleId)     // invalidates final-report on success
useFinalReport(cycleId)        // the assembled report
```

---

## 3. Assembly entry & gate (in the builder)

In the builder shell, an **"Assemble Report"** action driven by `useAssemblyReadiness`:
- **`can_assemble: false`** → button disabled + a clear list: *"{locked} of {total} sections locked. Lock the remaining sections to assemble:"* with the `unlocked_sections` titles. This turns the gate into a checklist — the PM sees exactly what's left.
- **`can_assemble: true`** → primary **Assemble Report** button → `useAssembleReport`, spinner during (writes exec summary + assembles, ~10–30 s). On success → route to `/pm/cycles/[id]/report`.
- If a final report already exists → the action reads **"View Report"** (→ the report page) with a secondary **Re-assemble** (refresh=true, confirm: *"Regenerate the executive summary and reassemble?"*).

---

## 4. The final report view (`/pm/cycles/[id]/report`)

The document, rendered to read like a real annual report. Reuse the `prose` typography; this should feel like a document, not an app screen.

### Layout (top to bottom, in `display_order`)
- **Cover block** (the `auto` "cover" section): a styled title page — company/cycle name, fiscal year, the `headline` as a subtitle, a clean cover treatment. Generated client-side from cycle data (it's an `auto` section — no content from backend, the FE composes it).
- **Table of Contents** (the `auto` "toc" section): generated client-side from the section list — section titles + (for print) page anchors. Each entry links to its section on screen.
- **Executive Summary**: render `executive_summary` (markdown → prose). Labeled, prominent — it's the opening.
- **Then each section in order**, via `<ReportSectionRenderer>`:
  - **`narrative`** → section title + `content` rendered as `prose` (react-markdown). Reads as report prose.
  - **`attachment`** → section title + a **document card**: filename, file-type icon, file size if available, and **View / Download** for that document (links to the existing document fetch). A muted note: *"Audited document — included as filed."* (This is the as-filed financials, referenced not rewritten — the v1 hybrid.)
  - **`auto`** (other than cover/toc, if any) → generated treatment or skip.

### Header actions
- **Back to builder**
- **Download PDF** (§5)
- **Re-assemble** (secondary, with confirm — regenerates)
- Word count + generated-at shown subtly.

---

## 5. Download (v1 — print-to-PDF)

The pragmatic v1: a **print stylesheet** + `window.print()`.
- A `@media print` CSS that: hides the app chrome (sidebar, nav, buttons), forces the report view to clean full-width document styling, adds page breaks before major sections (`break-before: page` on each top-level section), and renders the cover as its own page.
- **Download PDF** → `window.print()` → the user saves as PDF via the browser's print dialog. No backend, no PDF library, works now.
- **Financials in the printed doc:** the document cards print as "Financial Statements — see attached: {filename}" references (not the merged pages). This is the known v1 limitation — the narrative report is one clean PDF; the audited files remain separate downloads. A future backend render step (docx/pdf skill) can bind them into a true single file if needed; not v1.

> Note this limitation in the UI honestly: near the financial cards, *"Audited financial documents are provided as separate files."* Don't imply they're merged when they're referenced.

---

## 6. Verification (how you test this stage)

On a cycle with sections (mix of generate + attach):

1. **Gate — incomplete:** with some sections unlocked → Assemble disabled + checklist of what's unlocked.
2. **Lock all** → Assemble enabled.
3. **Assemble:** click → spinner → routes to the report view.
4. **Report renders:** cover with headline, TOC from the sections, exec summary, narrative sections as prose in order, financials as document cards.
5. **Exec summary present and reads as the opening**, reflects the body (the backend wrote it from locked sections).
6. **Order correct:** cover, TOC first; sections follow `display_order`; financials where they belong.
7. **Attachments as cards:** financial sections show document cards with View/Download — NOT AI prose. The as-filed note is visible.
8. **Narrative = locked content:** the prose matches what was locked (not re-written).
9. **Download PDF:** click → print dialog → save → the PDF is a clean document (no app chrome, cover on its own page, sections page-broken, financials shown as references).
10. **Re-assemble:** unlock a section → report view shows it's stale (or re-assemble required); lock again, re-assemble → updated report.
11. **Ownership:** non-owner → access error.

---

## 7. Out of scope (v1)

- **True single-file PDF with financials bound in** — financials are referenced as cards/links, not merged pages. A backend render step (docx/pdf skill) is the future path if a single bound document is required.
- **DOCX export** — print-to-PDF only for v1. (Backend docx render is the upgrade path.)
- **Custom cover design / branding upload** — the cover is a clean generated treatment; bespoke design is later.
- **Inter-section transitions** — not present (backend didn't write them; §4 of backend spec).

---

## 8. The milestone

Once §6 passes, the pipeline is **complete end to end**: a PM takes a cycle from company profile → resolved sections → approved department content → plan → generated & refined narrative → uploaded financials → assembled, rendered, downloadable annual report. Every stage built and verified in sequence. This is the artifact the whole system was designed to produce.

Remaining known edges (none block completion, worth a pass after): the parked `ai_generated_draft` column check, the multi-department plan re-test when more departments are approved, deleting the dormant Stage 4 code, and — if a truly bound single-file PDF is needed — the backend render upgrade noted in §7.
