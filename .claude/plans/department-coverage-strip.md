# Department coverage strip on the plan Sections step

## Context

On `/pm/cycles/{id}/plan` (step 1, Sections) the PM assigns department sources
section by section. Each card shows the departments feeding **that** section, but
nothing anywhere shows the inverse: **which departments aren't feeding anything
at all.**

That matters because a department that submitted and got HOD-approved, but never
gets ticked on any section, silently contributes nothing to the report. Nobody
finds out until the report reads thin. With two departments it's obvious; with
ten it isn't.

The ask is explicitly **not** a per-card change — the PM wants to see, at a
glance, which departments are still available to use.

### Decisions taken

| | |
|---|---|
| Placement | A always-visible strip under the "Report sections" heading, above the grid |
| "Used" means | The department feeds **at least one section**. No cross-check against submission status. |
| Interaction | Read-only. Informational, not a control. |
| Backend | **None.** Both inputs are already props on `SectionsStep`. |

## Why this is nearly free

`SectionsStep` (`app/(protected)/pm/cycles/[id]/plan/page.tsx:336-355`) already
receives everything needed:

- `departments: Array<{ department_code, department_name }>` — the cycle's departments
- `feeders: FeederMapEntry[]` — per section, `{ section_code, title, departments[] }`

So the counts are a pure client-side derivation. No new query, no new endpoint,
no type change.

**Count from `feeders`, not from `sections[].feeders`.** `PlanSectionGrid`
resolves each card's pills from the feeder map (`entry?.departments ?? []`,
`PlanSectionGrid.tsx:97`) because "the feeder map's `mode` is the authority (the
sections list can lag a mode switch)". Using the same source keeps the strip from
ever disagreeing with the pills sitting directly underneath it.

**Extract sections are excluded from the count.** The plan build's Router
assigns feeders to generate, extract and analyze alike, so extract rows do carry
feeders — but nothing reads them back (an extract section's content comes from
its uploaded document; `_feeder_session_blocks` is reached only from the analyze
path). Counting them would report a department as used when its content never
reaches the report. On Annual4 that is the difference between "FIN 8, HR 3" and
the true "FIN 4, HR 2". manual/attach/auto never carry feeders at all.

## The change — 2 files

### 1. New `components/report/DepartmentCoverage.tsx`

One component, matching the folder's one-component-per-file convention
(`AddSectionPicker`, `FeederPicker`, `PlanSectionGrid`).

```tsx
interface DepartmentCoverageProps {
  departments: FeederDepartment[]   // reuse the type from ./FeederPicker
  feeders: FeederMapEntry[]
  isRtl?: boolean
}
```

Derivation:

```tsx
// How many sections each department feeds. Built from the feeder map so this
// never contradicts the pills on the cards below.
const useCount = new Map<string, number>()
for (const entry of feeders)
  for (const code of entry.departments)
    useCount.set(code, (useCount.get(code) ?? 0) + 1)

const unused = departments.filter((d) => !useCount.get(d.department_code))
const used   = departments.filter((d) =>  useCount.get(d.department_code))
```

Render, unused first so the answer is the first thing read:

```
Department coverage
 ⚠ Operations   ⚠ Legal          ← amber, AlertCircle, "not used"
 Human Resources 5 · Finance & Accounting 4      ← muted
```

- Reuse the amber treatment already on the card's "Needs a source" pill
  (`PlanSectionGrid.tsx:447-452`) and the muted chip style of `deptPills`
  (`PlanSectionGrid.tsx:335-340`) so the strip reads as part of the same system.
- `AlertCircle` from `lucide-react`, as the cards use.
- Wrap in `dir={isRtl ? "rtl" : "ltr"}` on the chip row, the same way
  `SectionTile` mirrors its badge row (`PlanSectionGrid.tsx:180`).
- `flex-wrap` so ten departments wrap rather than overflow.

Edge cases:
- `departments.length === 0` → render nothing (a cycle with no departments has
  nothing to report and the empty heading would be noise).
- Nothing unused → no amber group; the used list alone reads as "all covered".
  Optionally prefix with a single muted "All departments are in use." line.
- Locked plan → still shown. It stays true and useful after the lock; it's
  informational, so there is no read-only variant to build.

### 2. `app/(protected)/pm/cycles/[id]/plan/page.tsx`

Import it and drop one element into `SectionsStep`, between the header `<div>`
and `<PlanSectionGrid>` (~line 377):

```tsx
<DepartmentCoverage
  departments={departments}
  feeders={feeders}
  isRtl={isRtl}
/>
```

Both props and `isRtl` are already in scope in that component — no prop
threading, no signature change.

## Not doing (say the word if you want it)

- **Clicking an unused department to filter or jump to sections.** A control, not
  a readout; the ask was to see what's left.
- **Cross-checking submission status** (greying departments that never submitted).
  Rejected in favour of the simpler rule; would need session status threaded into
  this step.
- **The same strip on step 2 or the builder page.** The assignment decision lives
  here; putting it elsewhere is duplication until asked for.

## Verification

Frontend has no test runner (`package.json` scripts are dev/build/start/lint), so:

1. `npx tsc --noEmit` and `npx eslint components/report/DepartmentCoverage.tsx "app/(protected)/pm/cycles/[id]/plan/page.tsx"` — both must be clean.
2. Manual on cycle `fdf2f655-fed9-4dea-b8e6-bd58aec2df85` ("Annual4", 2
   departments: Human Resources, Finance & Accounting):
   - Build the plan, then open step 1. Both departments feed Strategy &
     Objectives and Operational Review, so expect **no amber** and
     `Human Resources 2 · Finance & Accounting 2`.
   - Untick Finance & Accounting from both sections via the card pickers → it
     moves to the amber "not used" group **without a page reload** (the feeder
     map is refetched by the existing `useSetFeeders` invalidation).
   - Re-tick it on one section → it returns to the used group with a count of 1.
   - Narrow the window to phone width → chips wrap, nothing overflows.
3. Sanity-check against the DB that the counts match reality:
   ```sql
   select d.department_code, d.department_name, count(s.id) as sections_fed
   from departments d
   left join cycle_report_sections s
     on s.cycle_id = 'fdf2f655-fed9-4dea-b8e6-bd58aec2df85'
    and s.feeders @> to_jsonb(d.department_code)
   where d.id in (
     select department_id from department_sessions
     where cycle_id = 'fdf2f655-fed9-4dea-b8e6-bd58aec2df85'
   )
   group by d.department_code, d.department_name
   order by sections_fed;
   ```

## Ripple

None worth the word. It is an additive, read-only element on one step of one
page; no backend, no schema, no shared component touched. The only risk is
visual — it adds a row above the grid, so the first section cards sit ~40px
lower.
