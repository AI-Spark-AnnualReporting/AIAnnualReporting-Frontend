# Stage 1 — Frontend Spec: Profile Fields & Resolved-Sections View

**Goal of this stage:** The admin can set a cycle's company profile (profile, sector, flags) on the create/edit form, trigger section resolution, and *see* the resulting section list — each row showing its mode (AI-written / Upload / System) and status. Read-only view; no section editing yet (that's Stage 2+).

**Verifiable output:** Create a cycle as "listed bank, Shariah, has sukuk," click **Resolve Sections**, and see 42 rows render with correct modes (14 generate / 26 attach / 2 auto) in canonical order. Change the profile, re-resolve, watch it stay consistent (idempotent — no duplicates).

**Stack (per existing frontend):** Next.js 16 App Router, TS strict, Tailwind v4, shadcn/ui, TanStack Query, RHF + Zod, Axios singleton.

**Touches:**
- `types/index.ts` — profile fields on `Cycle`; new section types
- `lib/constants.ts` — mode/layer badge maps; `QUERY_KEYS` addition
- `lib/api/cycles.ts` — `resolveSections`, `getSections`
- `hooks/useCycles.ts` — `useResolveSections`, `useCycleSections`
- `app/(protected)/admin/cycles/new/page.tsx` — profile fields on create form
- `app/(protected)/admin/cycles/[id]/page.tsx` — profile fields in edit dialog + new "Report Sections" panel

---

## 1. Types (`types/index.ts`)

```ts
export type CompanyProfile = "listed" | "private";
export type Sector = "bank" | "insurance" | "general" | "reit" | "finance_co";
export type SectionMode = "generate" | "attach" | "auto";
export type SectionLayer = "common" | "cma" | "sector" | "optional";
export type SectionStatus = "pending" | "drafting" | "locked";

// Extend the existing Cycle type with the five profile fields:
export interface CycleProfileFields {
  company_profile: CompanyProfile | null;
  sector: Sector | null;
  is_shariah: boolean;
  has_subsidiaries: boolean;
  has_sukuk: boolean;
}
// → add these fields to Cycle, CycleCreateInput, CycleUpdateInput

// Read shape from GET /admin/cycles/{id}/sections (enriched via the definitions join):
export interface CycleReportSection {
  section_code: string;
  title: string;
  layer: SectionLayer;
  content_source: "narrative" | "structured" | "financials" | "composite";
  mode: SectionMode;
  status: SectionStatus;
  display_order: number;
  ai_allowed: boolean;
}

export interface ResolveSectionsResponse {
  success: boolean;
  cycle_id: string;
  sections_created: number;
  sections: CycleReportSection[];
}
```

---

## 2. Constants (`lib/constants.ts`)

Follow the existing `{ label, color }` pattern used by `SESSION_STATUSES` etc. Colors are Tailwind class fragments consistent with the current design tokens.

```ts
export const SECTION_MODES: Record<SectionMode, { label: string; color: string; hint: string }> = {
  generate: { label: "AI-written", color: "violet",  hint: "Drafted by the narrative agent, refined by you" },
  attach:   { label: "Upload",     color: "cyan",    hint: "You upload the source document; embedded as-is" },
  auto:     { label: "System",     color: "neutral", hint: "Generated automatically at render (cover, contents)" },
};

export const SECTION_LAYERS: Record<SectionLayer, { label: string }> = {
  common:   { label: "Common" },
  cma:      { label: "CMA Required" },
  sector:   { label: "Sector" },
  optional: { label: "Optional" },
};

export const COMPANY_PROFILES: Record<CompanyProfile, string> = {
  listed:  "Listed (Tadawul)",
  private: "Private",
};

export const SECTORS: Record<Sector, string> = {
  bank:       "Bank",
  insurance:  "Insurance",
  general:    "General",
  reit:       "REIT",
  finance_co: "Finance Company",
};

// Add to QUERY_KEYS:
//   cycleSections: (cycleId: string) => ["cycle", cycleId, "sections"] as const
```

---

## 3. API layer (`lib/api/cycles.ts`)

Add to `cyclesApi`:

```ts
resolveSections: (cycleId: string) =>
  apiClient.post<ResolveSectionsResponse>(`/admin/cycles/${cycleId}/resolve-sections`)
    .then(r => r.data),

getSections: (cycleId: string) =>
  apiClient.get<{ success: boolean; sections: CycleReportSection[] }>(`/admin/cycles/${cycleId}/sections`)
    .then(r => r.data.sections),
```

The five profile fields ride along inside the existing `create` / `update` payloads — no new method needed, just widen the input type.

---

## 4. Hooks (`hooks/useCycles.ts`)

```ts
export function useCycleSections(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.cycleSections(cycleId),
    queryFn: () => cyclesApi.getSections(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
  });
}

export function useResolveSections(cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cyclesApi.resolveSections(cycleId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.cycleSections(cycleId) });
      toast.success(`Resolved ${res.sections.length} sections (${res.sections_created} new)`);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to resolve sections"),
  });
}
```

---

## 5. Profile fields on the cycle form

### 5.1 Create form (`/admin/cycles/new`)

Add a **"Company Profile"** fieldset to the existing RHF + Zod form, after the cycle metadata:

- `company_profile` — Select, options from `COMPANY_PROFILES`. **Required.**
- `sector` — Select, options from `SECTORS`. **Required.**
- `is_shariah` — toggle/checkbox, default `false`.
- `has_subsidiaries` — toggle/checkbox, default `false`.
- `has_sukuk` — toggle/checkbox, default `false`.

Zod additions:
```ts
company_profile: z.enum(["listed", "private"], { required_error: "Select a company profile" }),
sector: z.enum(["bank","insurance","general","reit","finance_co"], { required_error: "Select a sector" }),
is_shariah: z.boolean().default(false),
has_subsidiaries: z.boolean().default(false),
has_sukuk: z.boolean().default(false),
```

> **Decision to confirm:** I'm making `company_profile` + `sector` **required at create** (a cycle should know what it is). The backend keeps them nullable only so pre-existing cycles don't break. If you'd rather allow creating a cycle without a profile and setting it later, make them optional here and rely on the resolve-button gate (§6) to enforce it. Flags are always optional.

A small inline hint under the fieldset: *"These determine which sections your report requires."*

### 5.2 Edit dialog (`/admin/cycles/[id]`)

The same five fields appear in the existing edit dialog (the one auto-opened via `?editCycle=1`), pre-populated from the cycle. Editing the profile and saving should let the admin re-resolve (§6) to pick up the change.

---

## 6. Resolved-Sections panel (`/admin/cycles/[id]`)

A new card on the cycle detail page titled **"Report Sections."** Three states:

**State A — profile incomplete.** If `company_profile` or `sector` is null: show an empty-state with *"Set the company profile to generate the report's section list,"* and a button that opens the edit dialog. No resolve button yet.

**State B — profile set, not yet resolved** (no sections returned): show a short explainer (*"Resolve the section list from this cycle's profile. Required sections are added automatically; you can review them below."*) and a primary **Resolve Sections** button → `useResolveSections`.

**State C — resolved** (sections exist): show
1. A summary row of counts — total + a breakdown by mode, e.g. `42 sections · 14 AI-written · 26 upload · 2 system`. (Compute from the fetched list; render as small pills using `SECTION_MODES` colors.)
2. The section list as a `<DataTable<CycleReportSection>>` (reuse the existing primitive), ordered by `display_order`, columns:
   - **#** — `display_order`
   - **Section** — `title`
   - **Layer** — badge from `SECTION_LAYERS`
   - **Mode** — badge from `SECTION_MODES` (this is the important column — it's the generate/attach/auto split made visible)
   - **Status** — badge from `SectionStatus` (all `pending` at this stage)
3. A secondary **Re-resolve** button (idempotent; safe to click after a profile change). Wording: *"Re-resolve from current profile."*

All read-only — no row actions, no editing. This panel is also the exact data source the Stage 2 builder list will consume, so keep the fetch (`useCycleSections`) and row shape reusable.

---

## 7. Verification (how you test this stage)

1. **Create** a cycle with profile = listed, sector = bank, Shariah ✓, sukuk ✓. Save.
2. On the detail page, the Report Sections card is in **State B**. Click **Resolve Sections**.
3. Confirm **42 rows** render, ordered 1→ (canonical), with the mode breakdown **14 AI-written / 26 upload / 2 system**, and Cover + Table of Contents showing **System**.
4. Click **Re-resolve** → count stays 42, no duplicate rows (idempotency visible in UI).
5. Open the edit dialog, turn **has_subsidiaries** on, save, re-resolve → count becomes **43** (the Subsidiaries row appears).
6. Create a second cycle as **private, general**, resolve → only **13** common sections, all either generate or attach/system per their type.
7. Confirm **State A** behavior: a cycle with no profile shows the "set profile first" empty-state and no resolve button.

---

## 8. Notes / out of scope for Stage 1

- **No section editing, no upload, no AI** — every section is read-only and `pending`. Those arrive in Stage 2 (builder list), Stage 3 (attach mode), Stage 7 (generate mode).
- **Optional sections** (`auto_include = false`) are not shown here and have no "add" affordance yet — that's a later stage. This panel shows only the auto-resolved required set.
- **Where resolve lives:** a manual admin button for now (best for testing). Later, when the PM build flow is wired, resolution may be triggered automatically at build-start — but keep the manual button through Stage 1 so the slice is independently testable.
- **`database.md` drift** (from the backend stage) and the **RLS gaps on escalations/reminders/audit_log** are unrelated to the frontend — just don't lose track of them.

