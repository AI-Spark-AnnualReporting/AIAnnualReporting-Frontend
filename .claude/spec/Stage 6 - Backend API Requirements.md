# Stage 6 — Backend API Requirements (Plan Review Screen)

This document lists every endpoint the new **Plan Review** screen (`/pm/cycles/[id]/plan`) calls, with exact request/response shapes the frontend expects. Also includes one carryover gap from Stage 3 that surfaces on hard refresh.

All endpoints are PM-access (auth: `project_manager` or `admin` role, scoped to cycles the PM owns). Pagination: none — these are bounded per-cycle datasets.

---

## 1. `GET /pm/cycles/{cycle_id}/plan`

**Purpose:** Fetch the AI-generated plan for a cycle.

**Used by:** `usePlan` hook → drives the entire Plan Review layout.

**Response 200:** `PlanResponse` (either flat or wrapped in `{ plan: ... }`)

```jsonc
{
  "cycle_id": "uuid",
  "headline": "Resilience and renewal — a year of disciplined growth",
  "themes": [
    { "title": "Operational excellence", "description": "..." },
    { "title": "Sustainability commitments", "description": "..." }
  ],
  "plan_generated_at": "2026-05-24T10:00:00Z",   // null if never generated
  "feeders": [
    {
      "section_code": "ceo_review",
      "title": "CEO's Review",
      "departments": ["FIN", "STRAT"]              // department codes
    },
    {
      "section_code": "risk_management",
      "title": "Risk Management",
      "departments": []                            // empty = "Needs a source" flag
    }
  ]
}
```

**Response 404:** plan has never been generated — treated as "empty plan" state. Frontend shows the **Generate Plan** prompt.

**Notes:**
- The frontend treats `plan_generated_at === null` AND a 404 as the same "no plan yet" state.
- `feeders` only contains entries for `generate`-mode sections. `attach` and `auto` sections do not need feeders.

---

## 2. `POST /pm/cycles/{cycle_id}/plan?refresh={true|false}`

**Purpose:** Generate the plan (two LLM passes — themes pass + feeder-routing pass).

**Used by:**
- `useBuildPlan({ refresh: false })` → invoked when the PM clicks **Generate Plan** on the empty state.
- `useBuildPlan({ refresh: true })` → invoked when the PM clicks **Regenerate plan** in the header (overwrites manual edits).

**Request body:** none.

**Query params:**
- `refresh=false` (default): generate only if no plan exists yet. If one exists, return the existing plan (or 409 — frontend tolerates either).
- `refresh=true`: regenerate from scratch, overwriting headline, themes, and feeders.

**Response 200:** same `PlanResponse` as #1.

**Response 422:** at least one department session must be approved before generation. Return `{ detail: "..." }` with a message we can toast.

**Notes:**
- Takes 30–60s under normal load. Frontend timeout is set to **180s**.
- Whatever toast we surface comes from `detail`. Validation array form (`detail: [{type, loc, msg, input}]`) is also handled.

---

## 3. `PATCH /pm/cycles/{cycle_id}/plan`

**Purpose:** Update the headline and/or themes after the PM edits them.

**Used by:** `useUpdatePlan` — fires on Save in both `HeadlineBlock` and `ThemeEditor`.

**Request body:** any subset of:
```jsonc
{
  "headline": "New headline string",            // string or null
  "themes": [
    { "title": "...", "description": "..." }
  ]                                              // FULL replacement array — not a diff
}
```

**Response 200:** updated `PlanResponse` (same shape as #1).

**Validation:**
- `themes.length` must be between 1 and 8 inclusive.
- Each theme must have non-empty `title` and `description` after trimming.
- Frontend pre-validates, so 422s here should only fire on concurrent edits / race conditions.

---

## 4. `PUT /pm/cycles/{cycle_id}/sections/{section_code}/feeders` ✅ shipped

**Purpose:** Assign which departments feed a generate-mode section.

**Used by:** `useSetFeeders` — fired when the feeder popover closes with a changed selection.

**Request body:**
```jsonc
{
  "departments": ["FIN", "HR", "IT"]   // department codes (strings)
}
```

**Response 200:** updated `PlanResponse`.

**Root cause of the previous "doesn't persist" bug (now fixed):** the backend's `FeedersUpdateRequest` schema expected `department_codes`, but `BaseSchema` had no `extra='forbid'`, so Pydantic v2 silently dropped our `departments` key and defaulted the field to `[]`. The service "persisted" an empty list, and the 200 response was an honest echo of that empty state. Backend renamed the field to `departments` to match the read side (`FeederMapEntry.departments`) — one wire name across read + write.

**Validation:**
- `section_code` must exist on the cycle.
- Section's `mode` must be `"generate"` — attach/auto sections shouldn't accept feeders.
- All department codes must be valid for this cycle.

**Notes:**
- Pass an empty array to clear all feeders (re-flag as "Needs a source").
- Frontend writes the response back to the cache and uses an optimistic update on top — so the chip flips instantly on close and stays put after the request lands.

---

## 5. `PUT /pm/cycles/{cycle_id}/sections/order`

**Purpose:** Persist the new section order after a drag-and-drop.

**Used by:** `useReorderSections` — fires on drop end with the complete new order.

**Request body:**
```jsonc
{
  "ordered_codes": ["cover", "toc", "ceo_review", "risk_management", ...]
}
```

> ⚠️ **Already discovered:** the field MUST be `ordered_codes` (not `section_codes`). Frontend was sending the wrong name initially; this has been fixed.

**Response 200:**
```jsonc
{
  "sections": [/* CycleReportSection[] in the new order */]
}
```
or the array directly. Frontend tolerates both.

**Validation:**
- `ordered_codes` must be the *complete* set of current section codes for the cycle — no additions, no omissions.
- Backend should re-write `display_order` on every section based on array index.

---

## 6. `POST /pm/cycles/{cycle_id}/sections/optional`

**Purpose:** Add an optional section (ESG, CSR, Awards, etc.) to the report.

**Used by:** `useAddOptional` — fires when the PM picks an item from the `+ Add optional section` dropdown.

**Request body:**
```jsonc
{ "section_code": "esg" }
```

**Response 200/201:**
```jsonc
{
  "sections": [/* CycleReportSection[] — the new full list, including the added section */]
}
```

**Validation:**
- `section_code` must be in the cycle's available-optional list (see #8).
- 409 if already present.

---

## 7. `DELETE /pm/cycles/{cycle_id}/sections/optional/{section_code}` ✅ shipped (with `?force=true`)

**Purpose:** Attempt to remove a section from the report.

**Used by:** `useRemoveOptional` — fires when the PM clicks the × on any row in `<PlanSectionList>`. Sends `force: true` after the PM confirms the "required section" warning.

**Request:**
```
DELETE /pm/cycles/{cycle_id}/sections/optional/{section_code}?force={true|false}
```
- `force=false` (default) — current behavior.
- `force=true` — bypass the required-section check. Frontend sends this only after the PM confirms a warning dialog.

**Response 200:**
```jsonc
{
  "sections": [/* CycleReportSection[] — full list without the removed section */]
}
```

**Backend behaviour:**
| Scenario | `force=false` | `force=true` |
|---|---|---|
| Section missing / unknown code | 404 | 404 |
| Required (common/cma/sector) | 409 with *"This section is required for a {profile}/{sector} company and cannot be removed."* | **200 — remove** |
| Locked (status === "locked") | 409 *"Unlock the section before removing it."* | **409 — guard preserved** (force only overrides the layer check) |
| Optional / unlocked | 200 | 200 |

**Cascade behaviour (from backend):** deleting the section row drops its feeders array atomically; other sections' feeders reference department codes (not section codes), so no cross-section cleanup is needed. The deleted section's `FeederMapEntry` naturally disappears from `GET /plan` on the next read.

**Frontend handling:**
- Optional sections — direct delete, no confirm.
- Required sections — `<ConfirmDialog>` opens with *"{title} is normally required ({layer}). Removing it may make the report non-compliant."* before the DELETE fires with `?force=true`.
- Locked sections (any layer) — 409 surfaces as a toast (*"Unlock the section before removing it."*).

---

## 8. `GET /pm/cycles/{cycle_id}/sections/optional/available`

**Purpose:** List optional sections that the cycle *could* add but hasn't yet.

**Used by:** `useAvailableOptional` → populates the dropdown in `<AddSectionPicker>`.

**Response 200:**
```jsonc
{
  "available": [
    { "section_code": "esg",     "title": "ESG",                 "layer": "optional" },
    { "section_code": "awards",  "title": "Awards & Recognition", "layer": "optional" },
    { "section_code": "investor", "title": "Investor Information", "layer": "optional" }
  ]
}
```
or the array directly. Frontend tolerates both.

**Notes:**
- Should EXCLUDE optional sections that are already on the cycle's section list.
- Empty list is valid and renders an "All optional sections already added" state.

---

## 9. `GET /pm/cycles/{cycle_id}/sections` ✅ shipped

**Status:** Live. The Stage 3 carryover gap is closed.

**What backend shipped:**
- `AttachmentInfo` moved above `CycleReportSectionResponse` in `app/schemas/report.py`; the latter gained `verified` / `locked_at` / `attachment` (defaults `false` / `null` / `null`).
- `_build_enriched_sections` does a single batched `document_repository.get_cycle_documents(cycle_id)` and hydrates attachment data only on rows with `attachment_document_id`. No N+1.
- 8 new tests cover: locked row carries attachment after reload, empty rows carry safe nulls, single batched query, no-attach cycles still 1 query, missing-doc tolerance, non-owner 403.

**Frontend impact:** the cache-patching in Stage 3 mutations (`useAttachUpload` etc.) is no longer strictly required — but kept as-is because it gives the right panel an instant update before the list refetch lands.

---

## 11. `GET /pm/cycles/{cycle_id}/assembly-readiness` ✅ shipped

**What backend shipped:** in `app/services/report_service.py::get_assembly_readiness`, a section is now "ready" iff `mode == "auto"` OR `status == "locked"`. Auto sections are implicitly ready regardless of status:
- `locked` count includes all auto sections (locked or pending).
- `unlocked_sections` never contains auto sections.
- `can_assemble` is True iff every non-auto section is locked.
- Narrative + attach sections still block normally — the exemption is auto-only.

**Tests added (5):** 3 unit-level (`test_report_assembly.py`) covering the auto-exemption + the sanity check that narrative still blocks; 2 route-level (`test_pm_assemble.py`) confirming `POST /assemble` works end-to-end when the only "unlocked" sections are pending autos.

**Frontend impact:** the client-side workaround in `AssembleEntry` (cross-referencing `GET /sections` to filter auto-mode entries from `unlocked_sections`) has been removed. The component now reads the backend response directly — single source of truth.

---

## 10. ⚠️ Error response shape — consistency request

**Currently working:** validation errors come back as
```jsonc
{ "detail": [ { "type": "...", "loc": [...], "msg": "Field required", "input": null } ] }
```
which is the standard FastAPI shape. The frontend now flattens these into a readable toast (`"body.ordered_codes: Field required"`), so this is fine.

**Ask:** for plain backend errors (auth failures, missing entities), keep using `{ "detail": "human readable string" }`. The frontend surfaces that string as-is in a toast.

---

## Summary table

| # | Method | Endpoint | Status |
|---|--------|---------------------------------------------------------|--------|
| 1 | GET    | `/pm/cycles/{id}/plan`                                  | New |
| 2 | POST   | `/pm/cycles/{id}/plan?refresh={bool}`                   | New |
| 3 | PATCH  | `/pm/cycles/{id}/plan`                                  | New |
| 4 | PUT    | `/pm/cycles/{id}/sections/{code}/feeders`               | ✅ shipped (field name now `departments` — matches GET side) |
| 5 | PUT    | `/pm/cycles/{id}/sections/order`                        | New (use `ordered_codes`) |
| 6 | POST   | `/pm/cycles/{id}/sections/optional`                     | New |
| 7 | DELETE | `/pm/cycles/{id}/sections/optional/{code}?force=`       | ✅ shipped (explanatory 409 by default; `?force=true` overrides required-section check, locked guard preserved) |
| 8 | GET    | `/pm/cycles/{id}/sections/optional/available`           | New |
| 9 | GET    | `/pm/cycles/{id}/sections`                              | ✅ shipped (`verified` / `locked_at` / `attachment` now included) |
| 11| GET    | `/pm/cycles/{id}/assembly-readiness`                    | ✅ shipped (auto-mode sections now implicitly ready; never appear in `unlocked_sections`) |

---

## Type reference (TypeScript on the frontend)

```ts
type SectionMode    = "generate" | "attach" | "auto"
type SectionStatus  = "pending"  | "drafting" | "locked"
type SectionLayer   = "common"   | "cma"      | "sector" | "optional"

interface ReportTheme {
  title: string
  description: string
}

interface FeederMapEntry {
  section_code: string
  title: string
  departments: string[]   // department codes
}

interface PlanResponse {
  cycle_id: string
  headline: string | null
  themes: ReportTheme[]
  plan_generated_at: string | null
  feeders: FeederMapEntry[]
}

interface AvailableOptionalSection {
  section_code: string
  title: string
  layer: SectionLayer
}

interface AttachmentInfo {
  document_id: string
  filename: string
  file_type: string
  file_size: number
  uploaded_at: string
}

interface CycleReportSection {
  section_code: string
  title: string
  layer: SectionLayer
  content_source: "narrative" | "structured" | "financials" | "composite"
  mode: SectionMode
  status: SectionStatus
  display_order: number
  ai_allowed: boolean
  // Stage 3 attach-mode fields — currently MISSING from GET /sections:
  verified: boolean
  locked_at: string | null
  attachment: AttachmentInfo | null
}
```
