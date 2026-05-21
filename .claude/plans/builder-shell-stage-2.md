# Plan: Stage 2 — The Builder Shell

## Context

Stage 1 gave admins a resolved section list per cycle. Stage 2 builds the
**PM-facing Report Builder** — a full-height workspace where a PM opens a cycle's
builder, sees a readiness banner, navigates a left-hand list of the report's
sections (each with live status + mode), and selecting a section shows a
mode-appropriate detail panel.

This stage is the **frame only** — no editing, no upload, no AI, no status
changes. Every section stays `pending`. The architectural payoff is
`<SectionDetail>` switching on `section.mode` into three placeholder
sub-components; Stages 3 (attach) and 7 (generate) later swap two of those bodies
for real editors **without touching the switch**.

Verifiable outcome: as PM of a resolved cycle, click **Open Report Builder** →
land on `/pm/cycles/[id]/build` → see "0 of 42 sections locked" + a departments
banner → click sections in the left list → watch the right panel switch
placeholder by mode.

Spec source: `.claude/spec/The Builder Shell.md`.

## Files to touch

- `types/index.ts` — `BuildReadiness` interface
- `lib/constants.ts` — two `QUERY_KEYS` entries
- `lib/api/pm.ts` — `buildReadiness`, `getCycleSections` methods
- `hooks/useReportBuilder.ts` — **new**: `useBuildReadiness`, `usePMCycleSections`
- `app/(protected)/pm/cycles/[id]/page.tsx` — gated "Open Report Builder" entry
- `app/(protected)/pm/cycles/[id]/build/page.tsx` — **new**: the builder shell
- `components/report/SectionList.tsx` — **new**
- `components/report/SectionDetail.tsx` — **new** (mode-switch + 3 placeholders)

## Changes

### 1. `types/index.ts`

```ts
export interface BuildReadiness {
  sections_resolved: boolean
  sections_total: number
  departments_total: number
  departments_approved: number
  all_approved: boolean
  status_breakdown: Record<string, number>
  can_build: boolean
}
```

### 2. `lib/constants.ts` — `QUERY_KEYS`

Match the existing `UPPER_SNAKE` key convention:
```ts
BUILD_READINESS: (cycleId: string) => ["pm", "cycle", cycleId, "readiness"],
PM_CYCLE_SECTIONS: (cycleId: string) => ["pm", "cycle", cycleId, "sections"],
```

### 3. `lib/api/pm.ts`

Two GET methods on `pmApi`, direct backend paths:
```ts
buildReadiness: async (cycleId) => GET /pm/cycles/{cycleId}/build-readiness
getCycleSections: async (cycleId) => GET /pm/cycles/{cycleId}/sections → data.sections
```

### 4. `hooks/useReportBuilder.ts` (new)

`useBuildReadiness` + `usePMCycleSections` — `useQuery`, `staleTime: 0`,
`enabled: !!cycleId`. No polling this stage.

### 5. Entry point — `app/(protected)/pm/cycles/[id]/page.tsx`

`useBuildReadiness(id)`-driven header action:
- `can_build` → enabled **Open Report Builder** link-button + "X of Y departments approved".
- `!can_build` → disabled button + "sections not set up yet" hint.
- `can_build && departments_approved === 0` → non-blocking amber warning.

Decision (from spec): building allowed once sections resolved; approval is
guidance, not a gate.

### 6. Builder shell — `app/(protected)/pm/cycles/[id]/build/page.tsx` (new)

- Role gate `RouteGuard allowedRoles={["project_manager","admin"]}`.
- Readiness guard: `can_build === false` → toast + `router.replace` back to cycle.
- Sidebar collapse on mount (`sidebar-set-mode` → `hidden`), restore on unmount.
- Full-height wrapper `-mx-6 -mt-6 -mb-6 flex flex-col h-[calc(100vh-4rem)]`.
- Selection state defaults to first section by `display_order`.
- Header (back link + title), readiness banner, left list (progress + SectionList),
  right `SectionDetail`.

### 7. `components/report/SectionList.tsx` (new)

Sections by `display_order`, optional layer dividers, per-row status indicator +
title + mode badge, selected-row highlight, click → `onSelect(section_code)`.

### 8. `components/report/SectionDetail.tsx` (new)

`SectionDetail` switches on `section.mode` → `GenerateSection` / `AttachSection`
/ `AutoSection`, each a read-only placeholder with a shared section header.
Stages 3 & 7 later replace two bodies without touching the switch.

## Out of scope (Stage 2)

No section editing/upload/AI/lock, no status changes, no optional-section
adding, no plan/strategist UI, no polling.

## Verification

1. `/pm/cycles/[id]` — Open Report Builder enabled, shows approved count.
2. Unresolved cycle → button disabled + hint.
3. Builder → left list in `display_order`, status indicator + mode badge,
   "0 of N sections locked".
4. Mode badges correct (Cover/TOC = System, financials/governance = Upload,
   Chairman/Strategy = AI-written).
5. Mode switch: generate/attach/auto → matching placeholder.
6. Deep-link unresolved `/build` → redirected back with toast.
7. Non-owner PM → 403 → access-error state, no crash.
8. Sidebar collapses entering builder, restores on leaving.
9. Zero new TypeScript errors.
