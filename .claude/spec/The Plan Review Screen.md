# Stage 6 — Frontend Spec: The Plan Review Screen

**Goal of this stage:** The "Review the plan before we build" screen (your prototype's Screen 2), on real data. The PM sees the AI-generated plan — headline, themes, and the section list with feeder tags — and can edit all of it before committing: edit the headline, add/edit/remove themes, fix feeders (especially empty-flagged sections), add optional sections, reorder. Then **"Start Building"** hands off to generation (Stage 7). This is the cheap review gate before the expensive writing.

**Verifiable output:** From the builder, open Review Plan → see the real headline + themes + section list with feeder tags (and empty-feeder flags). Edit the headline, drop a theme, assign a department to an empty-flagged section, add an optional section, reorder one. Each persists. "Start Building" is present (wired in Stage 7).

**Stack:** existing. Reuses Stage 5/6 backend endpoints.

**Touches:**
- `lib/api/pm.ts` — `getPlan`, `buildPlan`, `updatePlan`, `setFeeders`, `reorderSections`, `addOptionalSection`, `removeOptionalSection`, `getAvailableOptional`
- `hooks/useReportBuilder.ts` — query + mutations for the above
- `types/index.ts` — `ReportTheme`, `FeederMapEntry`, `PlanResponse`, `AvailableOptionalSection`
- `app/(protected)/pm/cycles/[id]/plan/page.tsx` — NEW: the review screen
- `components/report/` — `ThemeEditor`, `PlanSectionList`, `AddSectionPicker`
- entry: a "Review Plan" action in the builder shell

---

## 1. Types

```ts
export interface ReportTheme { title: string; description: string; }
export interface FeederMapEntry { section_code: string; title: string; departments: string[]; }
export interface PlanResponse {
  cycle_id: string;
  headline: string | null;
  themes: ReportTheme[];
  plan_generated_at: string | null;
  feeders: FeederMapEntry[];
}
export interface AvailableOptionalSection { section_code: string; title: string; layer: SectionLayer; }
```

---

## 2. API + hooks

```ts
// pm.ts
getPlan, buildPlan(refresh?), updatePlan({headline?, themes?}),
setFeeders(sectionCode, departmentCodes[]),
reorderSections(orderedCodes[]),
addOptionalSection(sectionCode), removeOptionalSection(sectionCode),
getAvailableOptional()
```

```ts
// useReportBuilder.ts
usePlan(cycleId)              // GET plan — staleTime 0
useBuildPlan(cycleId)         // POST plan (?refresh) — for "Generate plan" / "Regenerate"
useUpdatePlan(cycleId)        // PATCH — headline/themes
useSetFeeders(cycleId)        // PUT feeders
useReorderSections(cycleId)   // PUT order
useAddOptional / useRemoveOptional(cycleId)
useAvailableOptional(cycleId)
```

All mutations invalidate `["pm","cycle",cycleId,"plan"]` and `PM_CYCLE_SECTIONS`. The plan and the builder section list share section state, so keep both fresh.

---

## 3. Entry & the "plan not built yet" state

The review screen lives at `/pm/cycles/[id]/plan`, reached from a **"Review Plan"** action in the builder shell (Stage 2).

`usePlan` drives three states:
- **`plan_generated_at` is null** (never built) → a centered prompt: *"Generate the report plan from your approved departments."* + **Generate Plan** button (`useBuildPlan`, no refresh). Show a spinner while the two LLM passes run. This is the trigger for Stage 5.
- **Plan exists** → the full review layout (§4).
- **No approved departments** (build returns 422) → empty-state explaining departments must be approved first.

> So Stage 5's generation is *triggered from here* — the PM clicks "Generate Plan," Stage 5 runs, and this screen then shows the result for review. (Matches the flow: plan is generated, then reviewed.)

---

## 4. The review layout

Mirrors the prototype. Top-to-bottom, scrollable, with a sticky header.

### Sticky header
- Left: *"Review the plan before we build"* + sub: *"Edit anything here — the build uses your revisions."*
- Right: **Back** + **Start Building** (primary). Start Building → Stage 7 entry (the builder's generate flow). In this stage it can route to the builder; the actual generation trigger is Stage 7.

### Block 1 — Headline (editable)
- The `headline` shown large. An **Edit** affordance → inline textarea → save calls `useUpdatePlan({headline})`. Optimistic or on-blur save, toast on success.
- A small **Regenerate plan** link (calls `useBuildPlan(refresh=true)`) with a confirm (*"This replaces the current headline, themes, and feeder assignments with a fresh AI plan. Your manual edits will be lost."*) — because regenerating overwrites manual edits (backend overwrites on refresh).

### Block 2 — Themes (`<ThemeEditor>`)
- Themes as **cards/chips**, each showing title + description, each editable inline and removable (×).
- An **Add theme** affordance → blank theme card.
- All edits build a new themes array held in local state; save (on blur, or an explicit Save) → `useUpdatePlan({themes})` with the **full array**.
- Validation mirrors backend: 1–8 themes, each needs title + description. Block save + inline error otherwise (don't just eat the 422).

### Block 3 — Section list (`<PlanSectionList>`)
The ordered sections (from `usePMCycleSections` + plan `feeders`). This is the meatier piece. Each row:
- **Drag handle** → reorder (`useReorderSections` with the full new code order). Use the existing DnD approach or a simple up/down if DnD is heavy — reorder is nice-to-have, not critical-path.
- **Section title** + layer chip + mode badge (System/Upload/AI-written, from Stage 1 constants).
- **Feeder tags** (for narrative/`generate` sections only): the `departments` array as small chips. Clicking opens a small multi-select of the cycle's departments → `useSetFeeders(sectionCode, codes)`.
- **Empty-feeder flag:** a narrative section with `departments: []` shows an **amber "Needs a source" pill** instead of tags — this is Stage 5's honest flag surfaced. Clicking it opens the same department multi-select so the PM can assign one. (Don't hide empty feeders — flag them; that's the whole point.)
- Attach/auto sections show **no feeder UI** (they have no feeders) — just their mode badge. (Optionally a muted "Uploaded separately" / "System-generated" note.)
- **Optional sections** show a small **remove (×)**; required sections do **not** (backend 409s anyway, but don't even offer it).

### Block 4 — Add optional section (`<AddSectionPicker>`)
- A **+ Add section** button → dropdown/dialog listing `useAvailableOptional` (optional sections not yet in the report: ESG, Human Capital, CSR, Awards, Investor Info, Digital Transformation, Glossary).
- Selecting one → `useAddOptional(sectionCode)` → appears in the section list (appended; PM can reorder).

---

## 5. The empty-feeder flow (call out — it's the point of this screen)

Stage 5 deliberately leaves sections it can't confidently route with empty feeders. This screen is where that gets resolved:
1. PM sees an amber **"Needs a source"** pill on, say, Risk Management.
2. Clicks it → multi-select of departments → picks IT (+ others).
3. `useSetFeeders` persists; pill becomes normal feeder tags.

This is the human-in-the-loop safety valve we designed: the AI flags what it couldn't decide, the PM decides. Make this flow obvious and pleasant — it's the screen's reason to exist beyond display.

---

## 6. Verification (how you test this stage)

On a cycle with approved departments:

1. **Generate from empty:** plan-never-built state → click **Generate Plan** → spinner → the review layout populates with the real headline, themes, and section list. (This is triggering Stage 5 from the UI.)
2. **Headline edit:** edit + save → reload → persists.
3. **Theme edit:** drop one theme, edit another's text, add one → save → reload → exactly that set. Empty theme or missing title → inline validation, no save.
4. **Feeder assign on empty flag:** find a "Needs a source" section → assign a department → pill becomes tags, persists on reload.
5. **Feeder change on populated section:** reassign departments on a section that already had them → persists.
6. **No feeder UI on attach/auto:** Financial Statements / Cover show no feeder controls.
7. **Add optional:** add ESG → appears in list; picker no longer offers it.
8. **Remove optional:** remove it → gone; no remove control on required sections.
9. **Reorder:** drag (or up/down) a section → order persists on reload.
10. **Regenerate:** click Regenerate (confirm) → fresh plan replaces edits (headline/themes/feeders reset to new AI output).
11. **Start Building** present and routes onward (full behavior in Stage 7).
12. **Ownership:** non-owner PM → access error, not crash.

---

## 7. Out of scope for Stage 6

- **No section writing / generation** — "Start Building" routes toward Stage 7 but generation itself is Stage 7. This screen only plans.
- **No digests UI, no per-department summary display** — the plan is the abstraction here, not the raw summaries.
- **Reorder via fancy DnD is optional** — up/down buttons are an acceptable v1 if drag is costly.

---

*End of Stage 6 frontend spec. Once §6 passes, the PM can generate, review, and shape the plan — the cheap gate before expensive writing. Stage 7 is the big one: the section writer. "Start Building" begins generating narrative sections from the plan (themes + feeders + full department content), and the PM refines each in the chat-and-preview workspace, then locks it — the generate-mode half of the builder finally comes alive.*