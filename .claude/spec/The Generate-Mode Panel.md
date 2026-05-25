# Stage 7a — Frontend Spec: The Generate-Mode Panel (Generate · Preview · Lock)

**Goal of this stage:** Replace the `<GenerateSection>` placeholder with a working panel: the PM generates a narrative section, reads the prose in a report-styled preview, regenerates if needed, and locks it. The left-list status and progress update live. **No chat refinement yet** — that's 7b. This is generate → preview → (regenerate) → lock.

**Verifiable output:** Click an AI-written section → "Generate" → spinner → real prose renders in a clean report-style preview → "Lock" → left-list dot turns to check, progress increments. Unlock → editable again. Regenerate → fresh prose.

**Stack:** existing. Reuses the Stage 7a backend endpoints + the mode-aware lock/unlock from Stage 3.

**Touches:**
- `lib/api/pm.ts` — `generateSection` (lock/unlock already exist, mode-aware)
- `hooks/useReportBuilder.ts` — `useGenerateSection` (+ reuse lock/unlock hooks)
- `components/report/GenerateSection.tsx` — replace placeholder with the real panel
- `types/index.ts` — `content` already on `CycleReportSection` (added in 7a backend)

---

## 1. API + hook

```ts
// pm.ts
generateSection: (cycleId: string, sectionCode: string) =>
  apiClient.post(`/pm/cycles/${cycleId}/sections/${sectionCode}/generate`, null, { timeout: 120_000 })
    .then(r => r.data.section),   // returns SectionView with content + status:"drafting"
```
(120 s timeout — generation is an LLM call, ~10–40 s.)

```ts
// useReportBuilder.ts
export function useGenerateSection(cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionCode: string) => pmApi.generateSection(cycleId, sectionCode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId) });
      toast.success("Section generated");
    },
    onError: (e: any) => toast.error(e?.message || "Generation failed"),
  });
}
```
`useLockSection` / `useUnlockSection` already exist from Stage 3 and are mode-aware on the backend — reuse as-is.

---

## 2. The panel — `<GenerateSection section={...}>`

Replaces the placeholder. Renders by `section.status`.

### Shared header (exists from Stage 2)
Layer chip · mode badge (AI-written) · content_source · title. Keep.

### State: `pending` (no content yet)
- A centered prompt: *"This section will be written by the AI narrative writer, using the report's themes and the content from: {feeder department names}."*
- If `section.feeders` is **empty**: instead show a blocked state — *"No source assigned. Assign a department on the Review Plan screen before generating."* + a link to `/pm/cycles/[id]/plan`. (Mirrors the backend 422; don't let them click Generate into an error.)
- Otherwise: a primary **Generate Section** button → `useGenerateSection`. While running, show a spinner + *"Writing this section…"* (it's a 10–40 s LLM call; disable the button, don't let double-clicks fire two generations).

### State: `drafting` (content exists, editable)
- The **preview**: render `section.content` as report-styled prose. Use the same markdown/prose rendering the department draft page uses (`react-markdown` + the `@tailwindcss/typography` `prose` classes) so it reads like a document, not a textarea. **Read-only** in 7a (editing the text directly is 7b's chat; here it's generate/regenerate/lock).
- Action row:
  - **Regenerate** (secondary) → `useGenerateSection` again, with a light confirm if you want (*"Replace this draft with a fresh one?"*) since it overwrites. Spinner during.
  - **Lock** (primary) → `useLockSection`. Enabled whenever content exists.
- A subtle note: *"Review the draft. Lock it when you're satisfied — you can unlock and regenerate any time."*

### State: `locked`
- The preview, same report-styled rendering, with a green **Locked** banner + `locked_at` (`formatDateTime`).
- **Unlock** button (secondary) → `useUnlockSection` → back to `drafting`. No regenerate while locked (backend 409s; don't offer it).

---

## 3. Left list + progress (already wired)

The left `SectionList` + progress read `usePMCycleSections`; the generate/lock/unlock mutations invalidate it. So after generate, the section shows `drafting`; after lock, the dot becomes a check and progress increments. No new code if the list reads the live `status` field (confirmed working in Stage 3).

> **Status indicator for `drafting`:** Stage 2 defined a `drafting` visual (half/filled dot). Confirm it renders distinctly from `pending` (hollow) and `locked` (check) — three visible states now actually occur, where before only `pending`/`locked` did.

---

## 4. Verification (how you test this stage)

On a cycle with a built plan, on an AI-written section with feeders (Strategy / IT):

1. **Pending state:** panel shows the "will be written from {IT}" prompt + Generate button.
2. **Empty-feeder block:** on a narrative section with no feeders → blocked state + link to Review Plan, no Generate button.
3. **Generate:** click → spinner → prose renders in the preview, nicely formatted (paragraphs, not raw markdown asterisks). Left-list dot → `drafting`. Button didn't allow a double-fire.
4. **Preview quality:** the prose reads as a document (typography applied), scrolls, readable.
5. **Regenerate:** click → fresh prose replaces it, still `drafting`.
6. **Lock:** → green locked banner + timestamp; left dot → check; progress increments ("1 of N locked"). No Regenerate offered while locked.
7. **Unlock:** → back to `drafting`, content retained, Regenerate/Lock available again.
8. **Reload persistence:** generate, lock, **refresh the browser** → section still locked with its content (proves `content` + `status` come from `GET /sections`, the 7a/addendum source-of-truth fix).
9. **Other modes untouched:** attach section still shows the upload panel; Cover still shows System placeholder.
10. **Mixed progress:** lock one attach section and one generate section → progress counts both ("2 of N locked") — confirms generate + attach share the same lock/status model.

---

## 5. Out of scope for 7a frontend

- **No chat refinement** — no "make it shorter" box, no inline editing of the prose. The preview is read-only here. That whole loop is **7b**.
- **No "generate all sections" button** — one at a time. (A batch convenience can come later.)
- **No weave / exec summary / final document** — Stage 8.

---

## 6. A note on the preview rendering

The backend returns prose (likely markdown-ish — paragraphs, maybe some emphasis). Render it with the same `react-markdown` + `prose` setup the department draft page already uses, so:
- it looks like a report section, not a code block;
- 7b can later swap the read-only preview for the same rendering *with* a chat box beside/below it, without re-doing the prose display.

Keep the preview component clean and reusable — 7b builds directly on it (same preview, plus a chat panel and live updates per chat turn).

