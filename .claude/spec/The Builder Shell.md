# Stage 2 — Frontend Spec: The Builder Shell

**Goal of this stage:** A new PM-facing **Report Builder** screen. From a cycle, the PM opens the builder (gated on readiness), sees a readiness banner, and navigates a left-hand list of the report's sections — each row showing live status (pending / drafting / locked) and its mode (AI-written / Upload / System). Selecting a section shows a mode-appropriate detail panel. **No editing, no upload, no AI yet** — this is the frame every later editor plugs into.

**Verifiable output:** As the PM of a resolved cycle, click **Open Report Builder**, land on `/pm/cycles/[id]/build`, see "0 of 42 sections locked" + a "7 of 8 departments approved" banner, click through sections in the left list, and watch the right panel switch its placeholder based on the section's mode.

**Stack:** Next.js 16 App Router, TS strict, Tailwind v4, shadcn/ui, TanStack Query. Reuses Stage 1/2 backend.

**Touches:**
- `lib/api/pm.ts` — `buildReadiness`, `getSections` (PM)
- `hooks/useReportBuilder.ts` — NEW: `useBuildReadiness`, `usePMCycleSections`
- `types/index.ts` — `BuildReadiness` type
- `lib/constants.ts` — `QUERY_KEYS` additions
- `app/(protected)/pm/cycles/[id]/page.tsx` — the gated entry point
- `app/(protected)/pm/cycles/[id]/build/page.tsx` — NEW: the builder shell
- `components/report/` — NEW: `SectionList`, `SectionDetail` (mode-switch), three mode placeholders

---

## 1. Types & constants

```ts
// types/index.ts
export interface BuildReadiness {
  sections_resolved: boolean;
  sections_total: number;
  departments_total: number;
  departments_approved: number;
  all_approved: boolean;
  status_breakdown: Record<string, number>;
  can_build: boolean;
}
```

```ts
// lib/constants.ts — add to QUERY_KEYS
buildReadiness: (cycleId: string) => ["pm", "cycle", cycleId, "readiness"] as const,
pmCycleSections: (cycleId: string) => ["pm", "cycle", cycleId, "sections"] as const,
```

(`SECTION_MODES`, `SECTION_STATUSES`, `SECTION_LAYERS` already exist from Stage 1.)

---

## 2. API layer (`lib/api/pm.ts`)

Add to `pmApi`. Note: **direct backend calls, not the `/api/pm/*` proxy** — these are the clean Stage 2 endpoints, unaffected by the old PM-dashboard bugs.

```ts
buildReadiness: (cycleId: string) =>
  apiClient.get<{ success: boolean } & BuildReadiness>(`/pm/cycles/${cycleId}/build-readiness`)
    .then(r => r.data),

getSections: (cycleId: string) =>
  apiClient.get<{ success: boolean; sections: CycleReportSection[] }>(`/pm/cycles/${cycleId}/sections`)
    .then(r => r.data.sections),
```

---

## 3. Hooks (`hooks/useReportBuilder.ts` — new file)

Keeping builder hooks in their own file rather than swelling `useSessions.ts`.

```ts
export function useBuildReadiness(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.buildReadiness(cycleId),
    queryFn: () => pmApi.buildReadiness(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
  });
}

export function usePMCycleSections(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.pmCycleSections(cycleId),
    queryFn: () => pmApi.getSections(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
  });
}
```

No polling yet — nothing changes section status in Stage 2. Later stages add `invalidateQueries` on these keys after a section is locked.

---

## 4. Entry point (`/pm/cycles/[id]/page.tsx`)

On the existing PM cycle workspace, add a **Report Builder** entry — a prominent header action or a dedicated card. Drive it off `useBuildReadiness`:

- **`can_build === true`** → primary button **"Open Report Builder"** → `router.push('/pm/cycles/{id}/build')`. Next to it, a soft readiness line: *"{departments_approved} of {departments_total} departments approved."*
- **`can_build === false`** (sections not resolved) → disabled button + empty-state hint: *"Report sections haven't been set up for this cycle yet."* (Resolution is an admin setup step — the PM can't trigger it.)
- **Soft warning** (optional, recommended): if `can_build` but `departments_approved === 0`, show an amber note: *"No department content is approved yet — narrative sections will have nothing to draft from until you approve submissions."* Doesn't block; just warns. This is the §3 product decision from the backend spec, surfaced as guidance not a gate.

> **Decision baked in:** building is allowed as soon as sections are resolved; department approval is shown as guidance, not enforced. If your PM wants a hard "all approved first" gate, change this one condition to `can_build && all_approved`. Everything downstream is unaffected.

---

## 5. Builder shell (`/pm/cycles/[id]/build/page.tsx`)

A focused full-height workspace. Mirrors the prototype's three-zone layout, but only the left zone and a placeholder right zone are real this stage.

### Layout
```
┌──────────────────────────────────────────────────────────┐
│  Header: ‹ Back to cycle  ·  "Report Builder — {cycle}"    │
│  Readiness banner: "7 of 8 departments approved"           │
├───────────────┬────────────────────────────────────────────┤
│ LEFT (≈300px) │  RIGHT (fills)                              │
│ progress      │  <SectionDetail section={selected} />      │
│ "0/42 locked" │   — mode-appropriate placeholder this stage │
│               │                                             │
│ <SectionList> │                                             │
│  · pending    │                                             │
│  · pending    │                                             │
│  ...          │                                             │
└───────────────┴────────────────────────────────────────────┘
```

- **Route guard:** PM/admin only (existing `RouteGuard`/`Can` patterns). If `useBuildReadiness` returns `can_build === false`, redirect back to the cycle page with a toast ("This cycle isn't ready to build yet") — defends against deep-linking.
- **Sidebar room:** reuse the existing `sidebar-set-mode` custom-event trick (as the department workspace does) to collapse the app nav and give the builder horizontal space. Restore on unmount.
- **Selection state:** `const [selectedCode, setSelectedCode] = useState<string | null>(null)` — default to the first section once data loads.

### Left zone — progress + `<SectionList>`
- **Progress summary** at top: `{locked} of {total} sections locked` with a thin `<Progress>` bar. (`locked` = count of sections with `status === 'locked'`; all 0 this stage.)
- **`<SectionList>`** (new component): the sections ordered by `display_order`. Optionally insert subtle layer dividers (`Common` / `CMA Required` / `Sector` / `Optional`) using `SECTION_LAYERS` labels, since 42 rows benefit from grouping. Each row renders:
  - a **status indicator** (left): `pending` → hollow circle, `drafting` → filled/half dot, `locked` → check — colors from `SECTION_STATUSES`.
  - the **title**.
  - a small **mode badge** (right): `SECTION_MODES[mode]` (AI-written / Upload / System) with its color.
  - selected row highlighted; click → `setSelectedCode(section_code)`.

### Right zone — `<SectionDetail>` (the seam that matters)
This is the key architectural piece. `<SectionDetail>` **switches on `section.mode`** and renders one of three sub-components. This stage they're all read-only placeholders; Stages 3 and 7 replace two of them with real editors **without touching this switch**:

```tsx
function SectionDetail({ section }) {
  if (!section) return <EmptyState title="Select a section" .../>;
  switch (section.mode) {
    case "generate": return <GenerateSection section={section} />; // Stage 7 fills this
    case "attach":   return <AttachSection section={section} />;   // Stage 3 fills this
    case "auto":     return <AutoSection section={section} />;     // stays a placeholder
  }
}
```

Stage 2 placeholders (each shows the section header — title, layer chip, mode badge, content_source — then a mode-specific message):
- **`<GenerateSection>`** → *"This section will be written by the narrative agent. Drafting becomes available once the report plan is built."* (Stage 7 replaces the body with the chat-and-preview workspace.)
- **`<AttachSection>`** → *"This section is filled by uploading its source document. Upload becomes available next."* (Stage 3 replaces the body with the upload-and-verify panel.)
- **`<AutoSection>`** → *"Generated automatically when the report is rendered — no input needed."* (Stays a placeholder permanently.)

Building all three now, behind the switch, is what lets Stage 3 and Stage 7 be drop-ins.

---

## 6. Verification (how you test this stage)

Prereq: one cycle that's genuinely resolved (Stage 1) **and** has department sessions (mix of approved/other) — the combined fixture the backend report flagged you should create.

1. On `/pm/cycles/[id]`, the **Open Report Builder** button is enabled and shows "X of Y departments approved."
2. On a cycle with **no resolved sections**, the button is disabled with the "not set up yet" hint.
3. Click into the builder → left list shows all sections in `display_order`, each with a status indicator and a mode badge. Progress reads "0 of 42 sections locked."
4. The **mode badges are correct**: Cover + Table of Contents = System; financials/governance = Upload; Chairman/Strategy/etc. = AI-written.
5. Click a **generate** section → right panel shows the AI-written placeholder. Click an **attach** section → upload placeholder. Click Cover → System placeholder. (The switch works.)
6. Deep-link directly to `/pm/cycles/[unresolved-id]/build` → redirected back with a toast (guard works).
7. As a **PM who doesn't own the cycle**, the builder/readiness calls 403 → the page shows an access error, not a crash.

---

## 7. Out of scope for Stage 2

- **No section editing** — no chat, no upload, no lock button, no status changes. Every section stays `pending`. Those are Stage 3 (attach) and Stage 7 (generate).
- **No optional-section adding** — the left list shows only the auto-resolved required sections.
- **No plan/strategist UI** — themes, headline, feeders, the review screen are Stages 5–6.
- **No polling** — added later when sections start changing state.

---

*End of Stage 2 frontend spec. Once §6 passes, you have a navigable builder shell on real data — the frame is up. Stage 3 then makes the **attach** sections real (upload-and-verify → lock), which is the cleanest next slice because it involves no AI and immediately makes ~26 of a listed bank's sections actually completable.*