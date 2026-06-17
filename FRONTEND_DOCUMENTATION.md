# Spark Annual Report AI Studio — Frontend Documentation

A production-grade, AI-powered annual-report generation platform. The frontend is a Next.js 16 (App Router) application written in strict TypeScript, styled with Tailwind v4 and shadcn/ui primitives, and powered by TanStack Query for server-state management. It talks to a remote FastAPI backend hosted on Azure App Service at `/api/v1`, and ships a small fleet of internal Next.js Route Handlers under `/api/pm/*` that act as server-side workarounds for documented backend bugs.

This is the single source of truth for the frontend — paste it anywhere you need a complete reference.

---

## 0. TL;DR — One-Page Mental Model

- **Three roles, three modules**: Admin (identity + cycles + KB), Project Manager (cycle ops + report builder), Department User (questionnaire authoring).
- **The cycle is the unit of work.** An admin creates a cycle, assigns a PM and departments. The PM submits a kickoff brief which generates per-department questions. Departments answer, generate a draft, finalize → "submitted". PM reviews, approves, then enters the Report Builder.
- **The Report Builder is a five-stage pipeline:**
  - **Resolve** — backend turns the cycle's profile (Listed/Private + Sector + Shariah/Subsidiaries/Sukuk) into a canonical, ordered list of report sections (Common + CMA + Sector + Optional).
  - **Plan** — AI produces a headline, themes, and per-section "feeders" (which approved department session(s) supply content). PM reviews and edits.
  - **Build** — PM walks each section in a Builder Shell: AI-write, manually-write, upload a file, or system-render. Each section is then locked.
  - **Assemble** — backend stitches all locked sections + cover + executive summary into a `FinalReport`.
  - **Render** — backend exports the assembled report to DOCX (PDF planned).
- **Sections have four orthogonal facets:**
  - `mode` ∈ `generate | attach | auto` — how content is produced
  - `layer` ∈ `common | cma | sector | optional` — why the section exists
  - `status` ∈ `pending | drafting | locked` — where it is in the workflow
  - `ai_allowed` (boolean) — if `false`, the PM provides content manually (text or upload, based on `content_source`)
- **Server state via TanStack Query.** Mutations always patch the affected list cache directly (the canonical pattern in `hooks/useReportBuilder.ts → patchSectionInList`), then invalidate the readiness query.
- **Auth via JWT** (access + refresh in `localStorage`). Refresh-on-401 is automatic, with a single-flight queue.
- **Two backend workarounds**: PM dashboard list + per-cycle dashboard are proxied through Next.js Route Handlers that impersonate department users and aggregate session data.

---

## 1. Tech Stack

| Layer | Technology | Version |
|------|------------|---------|
| Framework | Next.js (App Router, RSC) | `16.1.6` |
| Runtime | React | `19.2.3` |
| Language | TypeScript (strict) | `^5` |
| Styling | TailwindCSS + `@tailwindcss/typography` | `^4` |
| Component primitives | Radix UI (slot, dialog, dropdown, select, tabs, progress, separator, label, avatar, toast) + shadcn/ui patterns | latest |
| Server state | TanStack Query (+ Devtools) | `^5.90` |
| Forms | React Hook Form + Zod (`@hookform/resolvers`) | `^7.71` / `^4.3` |
| HTTP client | Axios singleton with JWT auto-refresh + single-flight refresh queue | `^1.13` |
| File upload | `react-dropzone` (drag + drop for attach + extract sections) | `^15` |
| DnD | `@dnd-kit/core` + `@dnd-kit/sortable` (section reorder in plan view) | `^6.3` / `^10` |
| Icons | `lucide-react` | `^0.575` |
| Toasts | `sonner` | `^2.0` |
| Markdown render | `react-markdown` (prose preview of drafts + final report) | `^10.1` |
| Date utils | `date-fns` (used by `lib/utils.ts` helpers) | `^4.1` |
| Theme | `next-themes` (wired but UI runs light-only) | `^0.4` |
| Auth | JWT (access + refresh, `localStorage`) | — |

`package.json` declares only `dev`, `build`, `start`, `lint` — no test or storybook runner.

---

## 2. Top-Level Project Structure

```
spark-ar-studio/
├── app/                                  Next.js App Router root
│   ├── layout.tsx                        Root <html><body>, mounts <Providers>
│   ├── globals.css                       Tailwind base + HSL CSS-var theme tokens
│   ├── page.tsx                          Hard redirect "/" → "/login"
│   │
│   ├── (public)/                         Public layout (centered card)
│   │   ├── layout.tsx
│   │   ├── login/page.tsx                "Use Centriyon" info card (no form)
│   │   ├── forgot-password/page.tsx      "Manage in Centriyon" notice
│   │   └── reset-password/page.tsx       "Manage in Centriyon" notice
│   │
│   ├── auth/
│   │   └── token/page.tsx                Centriyon SSO landing — reads ?token=,
│   │                                     calls loginWithToken, redirects to role home
│   │
│   ├── (protected)/                      RouteGuard-wrapped layout (Sidebar + TopNav)
│   │   ├── layout.tsx
│   │   ├── profile/page.tsx
│   │   ├── admin/                        Identity, Cycles, Knowledge Base
│   │   │   ├── page.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── departments/page.tsx
│   │   │   ├── departments/[id]/page.tsx
│   │   │   ├── cycles/page.tsx
│   │   │   ├── cycles/new/page.tsx
│   │   │   ├── cycles/[id]/page.tsx          (cycle workspace + edit dialog)
│   │   │   ├── cycles/[id]/activate/page.tsx (pre-activation checklist)
│   │   │   ├── documents/page.tsx            (KB browser, KnowledgeBasePage)
│   │   │   ├── conversations/page.tsx        (RAG chat)
│   │   │   └── agents/page.tsx               (placeholder)
│   │   ├── pm/                            PM cycle ops + Report Builder
│   │   │   ├── page.tsx
│   │   │   ├── cycles/page.tsx
│   │   │   ├── cycles/[id]/page.tsx               (cycle workspace)
│   │   │   ├── cycles/[id]/plan/page.tsx          (Plan Review + Themes wizard)
│   │   │   ├── cycles/[id]/build/page.tsx         (Builder Shell)
│   │   │   ├── cycles/[id]/report/page.tsx        (Assembled Final Report viewer)
│   │   │   ├── cycles/[id]/sessions/page.tsx
│   │   │   ├── cycles/[id]/sessions/[sid]/page.tsx
│   │   │   ├── sessions/[id]/page.tsx             (session review)
│   │   │   ├── reviews/page.tsx
│   │   │   ├── documents/page.tsx
│   │   │   ├── conversations/page.tsx
│   │   │   └── agents/page.tsx
│   │   └── department/                    Dept user authoring workspace
│   │       ├── page.tsx
│   │       ├── sessions/[id]/page.tsx           (questionnaire)
│   │       ├── sessions/[id]/draft/page.tsx     (draft + tone + finalize)
│   │       ├── documents/page.tsx
│   │       ├── conversations/page.tsx
│   │       └── agents/page.tsx
│   │
│   └── api/pm/                           Server-side proxies (Next route handlers)
│       ├── _sessionAggregator.ts         Service-account login + per-user dashboard cache
│       ├── cycles/route.ts               GET /api/pm/cycles
│       └── cycles/[cycleId]/route.ts     GET /api/pm/cycles/{id}
│
├── components/
│   ├── providers.tsx                     QueryClient + AuthProvider + Toaster + Devtools
│   ├── auth/
│   │   ├── RouteGuard.tsx
│   │   └── Can.tsx                       <Can role="admin">…</Can>
│   ├── layout/
│   │   ├── Sidebar.tsx                   Tri-state nav (expanded / icons / hidden)
│   │   └── TopNav.tsx                    Notifications bell + avatar dropdown
│   ├── chat/                             RAG chat
│   │   ├── ChatMessageBubble.tsx
│   │   └── ConversationsView.tsx
│   ├── department/
│   │   └── extraction-loader.tsx         Full-screen AI loader for evidence extraction
│   ├── knowledge-base/
│   │   └── KnowledgeBasePage.tsx         Shared KB browser (admin + pm + dept)
│   ├── pm/
│   │   └── kickoff-loader.tsx
│   ├── report/                           Report Builder primitives (see §13)
│   │   ├── HeadlineBlock.tsx
│   │   ├── ThemeEditor.tsx
│   │   ├── RegeneratePlanButton.tsx
│   │   ├── PlanSectionGrid.tsx           Tile-grid section editor (new plan UI)
│   │   ├── PlanSectionList.tsx           Legacy list (still referenced)
│   │   ├── AddSectionPicker.tsx
│   │   ├── FeederPicker.tsx
│   │   ├── SectionList.tsx               Left rail of the Builder Shell
│   │   ├── SectionDetail.tsx             Right-pane router (mode + ai_allowed branch)
│   │   ├── GenerateSection.tsx           AI generate / refine / lock
│   │   ├── ManualSection.tsx             Manual narrative editor
│   │   ├── AttachSection.tsx             File upload + verify + lock
│   │   ├── SectionChat.tsx               Inline refinement chat panel
│   │   ├── AssembleEntry.tsx             "Assemble & Open" button in builder header
│   │   ├── FinalReportView.tsx           Assembled report viewer (cover + body)
│   │   └── ReportSectionRenderer.tsx     Per-section render switch in the final view
│   └── ui/                               Design-system primitives
│       (avatar, badge, button, checkbox, confirm-dialog, data-table, dialog,
│        dropdown-menu, empty-state, input, label, page-header, progress,
│        prose-preview, select, separator, skeletons, stats-card, status-badge,
│        table, tabs, textarea)
│
├── contexts/
│   └── AuthContext.tsx                   loginWithToken / me / role redirect / logout (Centriyon SSO)
│
├── hooks/
│   ├── useUsers.ts
│   ├── useDepartments.ts
│   ├── useCycles.ts
│   ├── useSessions.ts                    Dept + PM session ops
│   ├── useReportBuilder.ts               Plan / sections / build / assemble / render
│   ├── useKnowledgeBase.ts               KB list + text
│   ├── useConversations.ts               RAG chat
│   └── useNotifications.ts               Notifications + live polling
│
├── lib/
│   ├── api/
│   │   ├── client.ts                     Axios singleton; 401 → Centriyon redirect
│   │   ├── auth.ts                       me + logout only (Centriyon SSO)
│   │   ├── users.ts
│   │   ├── departments.ts
│   │   ├── cycles.ts                     Admin cycle ops (incl. resolveSections)
│   │   ├── department.ts
│   │   ├── pm.ts                         PM ops + Report Builder API surface
│   │   ├── chat.ts                       RAG conversation API
│   │   ├── knowledge-base.ts
│   │   └── notifications.ts
│   ├── constants.ts                      Status / mode / layer maps + QUERY_KEYS
│   ├── section-filters.ts                isTableOfContentsSection helper
│   └── utils.ts                          cn, formatDate, formatDateTime, formatFileSize, getInitials
│
├── types/
│   └── index.ts                          All domain TS types (single source)
│
├── public/
├── tailwind.config.ts                    HSL CSS-var theme, typography plugin
├── postcss.config.mjs                    Tailwind v4 PostCSS plugin
├── eslint.config.mjs                     ESLint flat config + next/core-web-vitals
├── tsconfig.json                         Strict, "@/*" alias → repo root
├── next.config.ts                        Empty experimental block
├── .env.example                          NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_CENTRITON_URL
├── README.md                             Pointer to this file
└── FRONTEND_DOCUMENTATION.md             ← you are here
```

---

## 3. Environment Variables

| Variable | Scope | Purpose | Used by |
|----------|-------|---------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Browser + server | Backend API base; hard-coded fallback in `lib/api/client.ts` | All Axios calls |
| `NEXT_PUBLIC_APP_NAME` | Browser + server | Display name | UI only |
| `NEXT_PUBLIC_CENTRITON_URL` | Browser + server | Centriyon frontend URL — SAR redirects here for login, on logout, and on 401 token expiry. No fallback (deliberate: surfaces misconfiguration). | `contexts/AuthContext.tsx`, `lib/api/client.ts`, login/forgot/reset/profile pages |
| `ADMIN_SERVICE_EMAIL` | Server only | Service-account email for `/api/pm/*` proxies | `app/api/pm/_sessionAggregator.ts` |
| `ADMIN_SERVICE_PASSWORD` | Server only | Service-account password | same |
| `DEPT_USER_DEFAULT_PASSWORD` | Server only | Shared password used when proxy impersonates dept users (falls back to `ADMIN_SERVICE_PASSWORD`) | same |

`NEXT_PUBLIC_*` are baked into the bundle. The unprefixed ones are only readable in route handlers. Without them, the PM dashboard list and per-cycle detail proxies will refuse to return data.

Default backend URL (also the fallback in `client.ts`):

```
https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1
```

---

## 4. Application Bootstrap

### `app/layout.tsx`
Wraps every route in `<Providers>` and applies the Inter font as a CSS variable. Sets global `<title>` and `<meta>`.

### `components/providers.tsx`
- Memoised `QueryClient`:
  - `staleTime: 60_000`
  - `retry`: disabled for `401` / `403`; otherwise up to 2 retries
- Mounts: React-Query provider, `AuthProvider`, Sonner `<Toaster position="top-right" richColors closeButton />`, React-Query Devtools (collapsed).

### `app/page.tsx`
Server-side hard redirect `/` → `/login`.

---

## 5. Authentication & RBAC — Centriyon SSO

SAR delegates **all** authentication to **Centriyon**. SAR's backend no longer issues login, register, refresh, or password-management tokens — those endpoints return 410. SAR receives a Centriyon-issued JWT on the URL and uses it directly.

### Sign-in flow

```
Centriyon login UI
   ↓
GET https://sar.domain.com?token=<centriyon_jwt>
   ↓ app/page.tsx (server) reads ?token=
   ↓
GET /auth/token?token=<jwt>
   ↓ app/auth/token/page.tsx (client) calls loginWithToken(jwt)
   ↓
localStorage.access_token = jwt
GET /auth/me → User
router.push(ROLE_ROUTES[user.role])  // /admin, /pm, /department
```

### Token lifecycle (`lib/api/client.ts`)

- Only `access_token` is stored (in `localStorage`). There is **no refresh token** — Centriyon mints the JWT, SAR can't refresh it.
- Axios attaches `Authorization: Bearer <access_token>` on every request via the request interceptor.
- On a `401`, the response interceptor:
  1. **Excludes** `/auth/me` and `/auth/logout` (they're handled by `AuthContext.refreshUser` and `logout` respectively — bouncing here would prevent the "use Centriyon" info card from rendering).
  2. Otherwise clears `localStorage` and full-page-navigates to `${NEXT_PUBLIC_CENTRITON_URL}/login`.
- The old single-flight refresh queue (`isRefreshing`, `failedQueue`, `processQueue`) has been removed entirely.
- All other errors are normalised to `{ error, message, status, details }`. Hooks always toast `err?.message || "Failed to …"` so UI code reads `err.message` regardless of FastAPI's response shape (`{message}`, `{detail}`, `{detail:[{msg}]}`).

### `lib/api/auth.ts`

Only two methods remain:
- `me(): Promise<User>` — `GET /auth/me` (hydrate the user)
- `logout(): Promise<unknown>` — `POST /auth/logout` (best-effort backend cleanup)

`login`, `refresh`, `changePassword`, `requestPasswordReset`, `confirmPasswordReset` have all been removed.

### `contexts/AuthContext.tsx`

Exposes `useAuth()`:
- `user`, `isAuthenticated`, `isLoading`
- `loginWithToken(token: string)` — persists the Centriyon JWT, fetches `/auth/me`, then pushes the user to their role home per `ROLE_ROUTES`. Called by `app/auth/token/page.tsx`.
- `logout()` — best-effort `/auth/logout`, clears `localStorage`, full-page nav to `${NEXT_PUBLIC_CENTRITON_URL}/login`.
- `refreshUser()` — re-fetches `/auth/me`; on 401 clears `localStorage` so the next render shows the Centriyon info card.

The old `login(email, password)` method has been removed.

### `components/auth/RouteGuard.tsx`

Wraps every `(protected)` route. Wrapped in `<Suspense>` so `useSearchParams` is allowed in Next 16. Behaviour:
- While loading: `<AuthSkeleton />`.
- **`?token=` present on the URL**: render the skeleton and let `app/auth/token/page.tsx` complete the handoff — don't bounce to `/login`.
- No token + not authenticated: redirect to `/login?redirect=<pathname>` (which now shows the Centriyon info card).
- Token exists but user state hasn't hydrated yet: keep the skeleton.
- `allowedRoles` set and user's role is disallowed: redirect to that user's role home.

### `components/auth/Can.tsx`
Inline RBAC (unchanged):

```tsx
<Can role="admin">…admin-only UI…</Can>
<Can role={["admin","project_manager"]} fallback={<ReadOnlyView/>}>…</Can>
```

### Public auth pages — now info cards

- `/(public)/login` — "Sign in is managed through Centriyon" + **Go to Centriyon Login** button (`${NEXT_PUBLIC_CENTRITON_URL}/login`). No form.
- `/(public)/forgot-password` — "Password reset is handled through Centriyon" + **Go to Centriyon** button.
- `/(public)/reset-password` — same as forgot-password.

These routes still exist so old bookmarks land somewhere sensible and `RouteGuard` has a redirect target.

### Profile + TopNav

- `/profile` shows a single **Password & account** card explaining that credentials are managed in Centriyon, plus an **Open Centriyon** button. The old Change Password form is gone.
- The TopNav avatar dropdown no longer contains a **Change Password** entry — only **Profile** and **Sign Out**.

---

## 6. Routing & Role Map

| Role | Default route after login | Allowed prefix |
|------|---------------------------|----------------|
| `admin` | `/admin` | `/admin/*` (full system) |
| `project_manager` | `/pm` | `/pm/*` |
| `department_user` | `/department` | `/department/*` |

Hard-coded in `AuthContext.tsx::ROLE_ROUTES` and the fallback in `RouteGuard.tsx`.

### Protected layout (`app/(protected)/layout.tsx`)

```
┌───────────────────────────────────────────────────┐
│  <Sidebar />  │  <TopNav />                       │
│  tri-state    │  ─────────────────────────────────│
│               │  <main> {children} (overflow-y)   │
└───────────────────────────────────────────────────┘
```

### Sidebar (`components/layout/Sidebar.tsx`)
- Three modes persisted in `localStorage["sidebar-mode"]`: `expanded` (w-64) → `icons` (w-14) → `hidden` (only a re-open sliver).
- Per-role nav defs (`ADMIN_NAV`, `PM_NAV`, `DEPT_NAV`), each supporting `{type:"divider"}` items.
- Listens for a global `sidebar-set-mode` `CustomEvent` so the Plan Review / Builder Shell can collapse it to gain horizontal room.

### TopNav (`components/layout/TopNav.tsx`)
- Notifications bell with unread badge + dropdown list (driven by `useNotificationsLive`).
- Avatar + role chip → Radix DropdownMenu with **Profile** and **Sign Out**. Sign Out redirects to `${NEXT_PUBLIC_CENTRITON_URL}/login`.

---

## 7. Domain Types (`types/index.ts`)

### Enums

| Type | Values |
|------|--------|
| `UserRole` | `admin \| project_manager \| department_user` |
| `UserStatus` | `active \| inactive \| pending \| suspended` |
| `CycleStatus` | `draft \| active \| completed \| archived \| closed` |
| `SessionStatus` | `assigned \| not_started \| in_progress \| submitted \| approved \| reopened` |
| `PMReviewAction` | `approved \| rejected \| reopened` |
| `CompanyProfile` | `listed \| private` |
| `Sector` | `bank \| insurance \| general \| reit \| finance_co` |
| `SectionMode` | `generate \| attach \| auto` |
| `SectionLayer` | `common \| cma \| sector \| optional` |
| `SectionStatus` | `pending \| drafting \| locked` |
| `DocumentPurpose` | `kickoff \| reference \| submission \| supporting \| template` |

### Core interfaces

| Interface | Notes |
|-----------|------|
| `User` | Carries both `id` and `user_id` (backend serialises both); status + role |
| `AuthTokens`, `LoginResponse` | Auth payloads |
| `Department` | Both `id` and `department_id`; carries `initial_prompt` + `system_prompt` (AI agent persona) |
| `Cycle` | Includes the cycle profile (`company_profile`, `sector`, `is_shariah`, `has_subsidiaries`, `has_sukuk`) used by resolveSections |
| `AttachmentInfo` | `{document_id, filename, file_type, file_size, uploaded_at}` |
| `CycleReportSection` | The resolved section row — see §8 |
| `ResolveSectionsResponse` | `{success, cycle_id, sections_created, sections[]}` |
| `ReportTheme` | `{title, description}` — one per theme bubble in the plan |
| `FeederMapEntry` | `{section_code, title, departments[]}` — which dept session(s) feed each generate-mode section |
| `PlanResponse` | `{cycle_id, headline, themes[], plan_generated_at, feeders[]}` |
| `AvailableOptionalSection` | `{section_code, title, layer}` — for the "Add section" picker |
| `BuildReadiness` | `{sections_resolved, sections_total, departments_total, departments_approved, all_approved, status_breakdown, can_build}` |
| `AssemblyReadiness` | `{cycle_id, total, locked, can_assemble, unlocked_sections[], has_final_report, final_report_generated_at}` |
| `FinalReportSection` | `{type:"narrative" \| "attachment" \| "auto", section_code, title, order, content?, document?}` |
| `FinalReport` | `{cycle_id, headline, executive_summary, word_count, status, generated_at, sections[]}` |
| `BriefQuality` | Kickoff brief grading: `{quality, total, length_score, specificity_score, cycle_relevance_score, missing[], suggestion}` |
| `KickoffBriefResponse` | `{success, message, cycle_id, departments_processed, used_document_context?, brief_quality?, warning?, enrichment_applied?}` |
| `CycleOverview` | `{cycle, stats, departments[]}` — admin cycle workspace + activate poll |
| `SessionSummary` | Row in the cycle session table |
| `Question`, `Answer`, `Session` | Per-department questionnaire |
| `DepartmentDashboard` | Top-level dept user inbox; uses `assignments[]` (old `active_sessions` is gone) |
| `PMDashboard` | Active cycles + pending reviews + recent submissions |
| `AdminStats` | Admin dashboard counts |
| `Document` | Generic doc record |
| `KBDocument`, `KBDocumentDetail`, `KBDocumentText`, `KBListResponse`, `KBDownloadResponse` | Knowledge Base API shapes |
| `Notification`, `NotificationListResponse`, `NotificationUnreadCountResponse`, `NotificationMarkReadResponse` | Notifications |
| `ApiError`, `PaginatedResponse<T>` | Misc |

---

## 8. Section Data Model (deep dive)

The single most important shape in the Report Builder is `CycleReportSection`:

```ts
interface CycleReportSection {
  section_code: string                 // e.g. "ceo_review", "financial_statements", "cover"
  title: string
  layer: "common" | "cma" | "sector" | "optional"
  content_source: "narrative" | "structured" | "financials" | "composite"
  mode: "generate" | "attach" | "auto"
  status: "pending" | "drafting" | "locked"
  display_order: number
  ai_allowed: boolean

  // Attach-mode state (default false / null for other modes)
  verified: boolean
  locked_at: string | null
  attachment: AttachmentInfo | null

  // Generate-mode body (null until generated; irrelevant for attach/auto)
  content: string | null
}
```

### `layer` — *why* the section is in the report
- **`common`** — required for every report (e.g. CEO Review, About the Company).
- **`cma`** — required by Saudi Capital Market Authority regulations (e.g. risk management, related-party transactions).
- **`sector`** — required by the cycle's sector (Bank, Insurance, REIT, etc.).
- **`optional`** — opt-in; surfaced in the "Add section" picker.

Resolution from the cycle profile to the section list is server-side (`POST /admin/cycles/{id}/resolve-sections`) and is **idempotent**.

### `mode` — *how* content is produced

| Mode | UI | Content origin |
|------|----|----------------|
| `generate` | AI narrative — feeders (approved sessions) + themes + headline run through the narrative agent; PM refines via chat | LLM |
| `attach` | File uploader — PM uploads a source PDF/DOCX/XLSX; embedded as-is | Uploaded document |
| `auto` | System-rendered at assembly (cover, ToC); no PM input needed | Backend at assembly time |

Badge styling is owned by `SECTION_MODES` in `lib/constants.ts`:

| Mode | Label | Color |
|------|-------|-------|
| `generate` | "AI-written" | violet |
| `attach`   | "Upload"     | cyan |
| `auto`     | "System"     | neutral |

### `status` — *where* the section is

| Status | Meaning |
|--------|---------|
| `pending`  | Untouched (no content yet) |
| `drafting` | Has content but not locked — can be re-generated, re-uploaded, re-edited |
| `locked`   | Frozen — included as-is in the assembled report. Unlocking requires an explicit action |

`auto` sections are treated as "always ready" by the builder progress bar — they don't need to lock.

### `ai_allowed` — manual override

When `ai_allowed === false`, the PM provides content themselves regardless of `mode`. The UI branches on `content_source`:

- `content_source === "narrative"` → `ManualSection` — labelled textarea + Save (via `POST /pm/cycles/{id}/sections/{code}/manual-content`)
- `content_source === "structured" | "financials" | "composite"` → `AttachSection` — file upload

Manual sections render with an amber **Manual** chip in both the Plan Review tile and the Builder Shell header. They are never sent to the AI generator (the Plan page's bulk Start-Building generator filters them out, and `eligibleToGenerate` excludes them).

### `content_source` — what shape the content takes
- `narrative` — long-form prose (Markdown)
- `structured` — tables of numbers / definitions
- `financials` — audited financial statements
- `composite` — mix of narrative + tables

---

## 9. API Client Layer (`lib/api/*`)

Every module imports the singleton `apiClient` from `lib/api/client.ts` and exports a typed object of functions.

### `auth.ts` — `authApi`

Centriyon owns authentication. SAR only calls two endpoints:

| Method | URL | Notes |
|--------|-----|------|
| `me()` | `GET /auth/me` | Hydrate the user from the Centriyon-issued JWT |
| `logout()` | `POST /auth/logout` | Best-effort backend cleanup before redirecting to Centriyon |

Removed (now handled by Centriyon): `login`, `refresh`, `changePassword`, `requestPasswordReset`, `confirmPasswordReset`. The SAR backend's `/auth/login`, `/auth/register`, and password endpoints return 410.

### `users.ts` — `usersApi`

| Method | URL | Notes |
|--------|-----|------|
| `list(filters)` | `GET /admin/users` | Filters: role, status, search, page, page_size |
| `get(id)` | `GET /admin/users/{id}` | |
| `create(payload)` | `POST /auth/register` then `POST /admin/users/{id}/activate` | **Quirk:** the admin POST has a UUID bug; we register + auto-activate instead |
| `update(id, payload)` | `PUT /admin/users/{id}` | |
| `activate(id)` | `POST /admin/users/{id}/activate` | |
| `delete(id)` | `DELETE /admin/users/{id}` | |
| `stats()` | `GET /admin/users/stats` | Per-status + per-role counts |
| `adminStats()` | `GET /admin/stats` | Top-level dashboard counters |

### `departments.ts` — `departmentsApi`

| Method | URL | Notes |
|--------|-----|------|
| `list()` | `GET /admin/departments` | |
| `get(id)` | `GET /admin/departments/{id}` | Carries `initial_prompt` + `system_prompt` |
| `create(payload)` | `POST /admin/departments` | |
| `update(id, payload)` | `PUT /admin/departments/{id}` | |
| `assignUsers(id, userIds)` | `POST /admin/departments/{id}/users` | |

### `cycles.ts` — `cyclesApi`

| Method | URL | Notes |
|--------|-----|------|
| `list(status?)` | `GET /admin/cycles` | |
| `get(id)` | `GET /admin/cycles/{id}` | |
| `create(payload)` | `POST /admin/cycles` | |
| `update(id, payload)` | `PUT /admin/cycles/{id}` | |
| `assignDepartments(id, {assignments:[{department_id,user_id}…]})` | `POST /admin/cycles/{id}/assignments` | Tolerates the serialisation bug on the response — DB write succeeds anyway |
| `activate(id, generateQuestions=true)` | `POST /admin/cycles/{id}/activate?generate_questions=…` | Async — backend creates a Session per department in the background |
| `uploadKickoffDocs(id, files[])` | `POST /admin/cycles/{id}/kickoff-docs` | Multipart, axios sets the boundary |
| `overview(id)` | `GET /admin/cycles/{id}/overview` | Stats + per-department session summary; polled |
| `delete(id)` | `DELETE /admin/cycles/{id}` | |
| `resolveSections(id)` | `POST /admin/cycles/{id}/resolve-sections` | Idempotent — populates `cycle_report_sections` from the cycle profile |
| `getSections(id)` | `GET /admin/cycles/{id}/sections` | Used by the admin Report Sections panel |

### `department.ts` — `departmentApi`

| Method | URL | Notes |
|--------|-----|------|
| `dashboard()` | `GET /department/dashboard` | Returns `{assignments[]}` |
| `getSession(id)` | `GET /department/sessions/{id}` | |
| `submitAnswers(id, {answers:[{question_id, question, answer}…]})` | `POST /department/sessions/{id}/answers` | Autosaved from the workspace |
| `generateDraft(id)` | `POST /department/sessions/{id}/generate-draft` | Server-side AI consolidation |
| `finalize(id, {final_content})` | `POST /department/sessions/{id}/finalize` | Status → `submitted` |
| `uploadDocument(id, file)` | `POST /department/sessions/{id}/documents` | Multipart, 120s timeout (extraction + chunking) |
| `extractAnswers(id)` | `POST /department/sessions/{id}/extract-answers` | Pulls answers out of uploaded evidence (`<extraction-loader>`) |
| `getAiSuggestion(id, questionId)` | `GET /department/sessions/{id}/ai-suggestion/{questionId}` | Cached suggestion |
| `suggestAnswer(id, payload)` | `POST /department/sessions/{id}/suggest-answer` | Fresh suggestion |
| `conversationPrompt(id, payload)` | `POST /department/sessions/{id}/conversation-prompt` | Chat-style refinement of an answer |
| `adjustTone(id, {content, target_tone})` | `POST /department/sessions/{id}/adjust-tone` | One of `TONE_OPTIONS` |
| `aiAssist(id, payload)` | `POST /department/sessions/{id}/ai-assist` | Per-question chat |
| `downloadQuestions(id)` | `GET /department/sessions/{id}/questions/download` | Returns `{blob, filename}` for printing the questionnaire |

### `pm.ts` — `pmApi`

Largest module. Covers PM cycle ops + the entire Report Builder API surface.

#### PM cycle ops (Stages 1–5)

| Method | URL | Notes |
|--------|-----|------|
| `cycleDashboard(id)` | `GET /pm/dashboard/{cycle_id}` | Backend now returns full payload (cycle + stats + departments) |
| `submitKickoff(payload)` | `POST /pm/kickoff` | 180s timeout — runs per-department question generation |
| `uploadKickoffDoc(id, file)` | `POST /pm/cycles/{id}/kickoff-doc` | Multipart, 120s timeout |
| `getCycles()` | `GET /pm/cycles` | Real backend list (Now-fixed) |
| `getCycleSessions(id)` | `GET /pm/cycles/{id}/sessions` | |
| `getSession(id)` | `GET /pm/sessions/{id}` | |
| `reviewSession(id, payload)` | `POST /pm/sessions/{id}/review` | Action: `approved \| rejected \| reopened` |
| `sendBulkReminders(payload)` | `POST /pm/reminders` | |
| `createEscalation(payload)` / `getEscalations(cycleId)` | `/pm/escalations` | |
| `generateReport(id, payload)` | `POST /pm/cycles/{id}/generate-report` | Optional `session_ids` + `format` |
| `getReport(reportId)` | `GET /pm/reports/{id}` | |
| `downloadReportDocx(reportId)` | `GET /pm/reports/{id}/download` | Returns Blob |

#### Report Builder — section ops

| Method | URL | Notes |
|--------|-----|------|
| `buildReadiness(id)` | `GET /pm/cycles/{id}/build-readiness` | `{can_build, all_approved, ...}` — drives the "Open Report Builder" button |
| `getCycleSections(id)` | `GET /pm/cycles/{id}/sections` | PM-scoped section list |
| `attachUpload(id, code, file)` | `POST /pm/cycles/{id}/sections/{code}/attachment` | 120s timeout |
| `removeAttachment(id, code)` | `DELETE /pm/cycles/{id}/sections/{code}/attachment` | |
| `lockSection(id, code)` | `POST /pm/cycles/{id}/sections/{code}/lock` | |
| `unlockSection(id, code)` | `POST /pm/cycles/{id}/sections/{code}/unlock` | |
| `generateSection(id, code)` | `POST /pm/cycles/{id}/sections/{code}/generate` | LLM call — 10–40s |
| `refineSection(id, code, instruction)` | `POST /pm/cycles/{id}/sections/{code}/refine` | 120s timeout |
| `saveManualContent(id, code, content)` | `POST /pm/cycles/{id}/sections/{code}/manual-content` | Manual narrative override |

#### Report Builder — plan ops

| Method | URL | Notes |
|--------|-----|------|
| `getPlan(id)` | `GET /pm/cycles/{id}/plan` | Tolerates `{plan:…}` or bare payload |
| `buildPlan(id, refresh=false)` | `POST /pm/cycles/{id}/plan[?refresh=true]` | Two LLM passes, 180s timeout |
| `updatePlan(id, {headline?, themes?})` | `PATCH /pm/cycles/{id}/plan` | |
| `setFeeders(id, code, departmentCodes)` | `PUT /pm/cycles/{id}/sections/{code}/feeders` | |
| `reorderSections(id, orderedCodes)` | `PUT /pm/cycles/{id}/sections/order` | Body: `{ordered_codes}` |
| `addOptionalSection(id, code)` | `POST /pm/cycles/{id}/sections/optional` | Body: `{section_code}` |
| `removeOptionalSection(id, code, force=false)` | `DELETE /pm/cycles/{id}/sections/optional/{code}[?force=true]` | `force=true` allows removing required sections after PM confirms |
| `getAvailableOptional(id)` | `GET /pm/cycles/{id}/sections/optional/available` | "Add section" picker source |

#### Report Builder — assembly + render

| Method | URL | Notes |
|--------|-----|------|
| `assemblyReadiness(id)` | `GET /pm/cycles/{id}/assembly-readiness` | `{total, locked, can_assemble, unlocked_sections[]}` |
| `assembleReport(id, refresh=false)` | `POST /pm/cycles/{id}/assemble[?refresh=true]` | 120s timeout — writes executive summary, stitches body |
| `getFinalReport(id)` | `GET /pm/cycles/{id}/final-report` | 404 = "not assembled yet" |
| `renderReport(id, {format})` | `GET /pm/cycles/{id}/render?format=docx \| pdf` | Returns Blob (DOCX shipped; PDF returns 501 until Stage 9b) |

### `chat.ts` — `chatApi`

RAG conversations bound (optionally) to a Knowledge Base document.

| Method | URL | Notes |
|--------|-----|------|
| `createConversation({document_id?, title?})` | `POST /conversations` | |
| `listConversations()` | `GET /conversations` | |
| `getConversation(id)` | `GET /conversations/{id}` | |
| `sendMessage(id, message)` | `POST /conversations/{id}/messages` | |
| `renameConversation(id, title)` | `PATCH /conversations/{id}` | |
| `deleteConversation(id)` | `DELETE /conversations/{id}` | |
| `clearHistory(id)` | `POST /conversations/{id}/clear` | |

### `knowledge-base.ts` — `knowledgeBaseApi`

Server-paginated, role-scoped server-side.

| Method | URL | Notes |
|--------|-----|------|
| `list({document_purpose?, page?, page_size?})` | `GET /knowledge-base/documents` | Pager off `total`, not `documents.length` |
| `get(id)` | `GET /knowledge-base/documents/{id}` | Carries `word_count` |
| `getText(id)` | `GET /knowledge-base/documents/{id}/text` | Extracted plain text |
| `getDownloadUrl(id)` | `GET /knowledge-base/documents/{id}/download` | Short-lived signed URL — never cache |

Document deletion (admin-only) is intentionally **not** surfaced in the UI.

### `notifications.ts` — `notificationsApi`

| Method | URL | Notes |
|--------|-----|------|
| `list({is_read?, page?, page_size?})` | `GET /notifications` | |
| `unreadCount()` | `GET /notifications/unread-count` | Polled by `useNotificationsLive` |
| `markRead(id)` | `POST /notifications/{id}/read` | |
| `markAllRead()` | `POST /notifications/read-all` | |

---

## 10. Internal Next.js Route Handlers (`app/api/pm/*`)

These exist to work around historical backend gaps. As the real backend matures, the `pmApi.cycleDashboard` etc. now hit the real backend directly — the route handlers still aggregate sessions across departments for views the real backend can't yet supply on a single round trip.

### Strategy
Log into the backend as a service account, also impersonate dept users (with a shared `DEPT_USER_DEFAULT_PASSWORD`), and call `GET /department/dashboard` per user. Aggregate and group by `cycle_id`.

### `_sessionAggregator.ts` — module-scope helpers with **`globalThis`-attached caches** (shared across all route handlers inside one Next.js process)

- `tokenCache: Map<email, {token, expiresAt}>` — 45 s TTL on success, 30 s sentinel `__FAILED__` on failure (avoids hammering Azure with bad logins).
- `deptUsersCache` via `globalThis.__pmDeptUsersCache` — 60 s TTL.
- `adminCyclesCache` via `globalThis.__pmAdminCycles` — 15 s TTL.
- `dashboardCache: Map<email, {assignments, expiresAt}>` — 10 s TTL (the critical optimisation: 6 backend calls instead of 6 × N).

Exports:
- `getServiceToken()`
- `getAdminCycles(serviceToken)`
- `decodeUserId(jwt)` — base64-decodes the JWT payload without verifying.
- `fetchAllAssignments(serviceToken)` — flat dedup'd list across all dept users.
- `fetchSessionsForCycle(cycleId, serviceToken)` — single-cycle filter.
- `fetchAllSessionsByCycle(serviceToken)` — `Map<cycleId, DeptSession[]>`.
- `buildStats(sessions)` — `{total, submitted, reviewed, approved, in_progress, not_started, completion_rate}`.

### `cycles/route.ts` — `GET /api/pm/cycles`
1. Decode the PM user_id from their JWT.
2. Pull all admin cycles (cached).
3. Filter to active cycles where `project_manager_id === pmUserId`.
4. Aggregate real sessions via `fetchAllSessionsByCycle`.
5. Walk every session to compute `pending_reviews` (`submitted` + `reviewed` count) and `recent_submissions` (sorted newest-first, capped at 10).
6. Return a shape matching the legacy `PMDashboard` contract.

### `cycles/[cycleId]/route.ts` — `GET /api/pm/cycles/{cycleId}`
Returns `{ success, cycle, stats, departments[] }` for a single cycle — departments come from the aggregator.

---

## 11. TanStack Query Hooks (`hooks/*`)

Conventions:
- Query keys are tuples; the canonical set is exported as `QUERY_KEYS` in `lib/constants.ts`.
- Mutations call `qc.invalidateQueries` for affected keys and toast success/failure (some leave toasts to the form when an inline error is preferred).
- `staleTime: 0` + `refetchInterval` wherever the UI needs to reflect server-side async work.
- The Report Builder mutations explicitly **patch the list cache directly** (`patchSectionInList`) because the GET endpoint doesn't yet return `attachment` / `verified` / `locked_at` for every section — an invalidate-and-refetch would clobber fresh fields.

### `useUsers.ts`
- `useUsers(filters)` → `["users", filters]`
- `useUserStats()`, `useAdminStats()`
- `useCreateUser`, `useUpdateUser`, `useActivateUser`, `useDeleteUser`

### `useDepartments.ts`
- `useDepartments()` → `["departments"]`
- `useDepartment(id)` (no retry)
- `useCreateDepartment`, `useUpdateDepartment`, `useAssignUsersToDepartment`

### `useCycles.ts`
- `useCycles(status?)`, `useCycle(id)`
- `useCycleOverview(id)` — `staleTime:0` + `refetchInterval:15_000` (post-activation session generation is async)
- `useCreateCycle`, `useUpdateCycle`, `useUploadKickoffDocs`, `useAssignDepartments`, `useDeleteCycle`, `useActivateCycle`
- `useCycleSections(id)` — admin Report Sections panel
- `useResolveSections(id)` — `POST /admin/cycles/{id}/resolve-sections`; toasts the count of new sections

### `useSessions.ts`
- `useDepartmentDashboard()` → `["dept","dashboard"]`
- `useSession(id)` — dept-scoped
- `usePMSession(id)` — PM-scoped
- `useSubmitAnswers`, `useGenerateDraft`, `useFinalizeSession`, `useAdjustTone`
- `usePMDashboard()` — handles `404` ("PM has no active cycles") with empty payload; polls every 5 s
- `usePMCycleDashboard(cycleId)` — 5 s poll
- `useSubmitKickoff`, `useUploadKickoffDoc`
- `useReviewSession`, `useSendReminder`, `useBulkReminder`
- `useGenerateReport`
- `useCreateEscalation`, `useEscalations(cycleId)`

### `useReportBuilder.ts`
Build readiness + plan + sections + assemble + render. All under `["pm","cycle",cycleId,…]`.

**Queries**
- `useBuildReadiness(cycleId)` — `staleTime:0`; reflects live lock progress
- `usePMCycleSections(cycleId)` — full section list
- `usePlan(cycleId)` — `retry:false` so the empty-plan state can render off the 404
- `useAvailableOptional(cycleId)` — "Add section" picker source
- `useAssemblyReadiness(cycleId)` — drives the Assemble entry
- `useFinalReport(cycleId)` — `retry:false`; 404 = "not assembled yet"

**Section mutations** (each patches the section into the list cache)
- `useAttachUpload`, `useRemoveAttachment`
- `useLockSection`, `useUnlockSection`
- `useGenerateSection` — toast "Section generated"
- `useRefineSection` — silent on success (chat panel shows the new preview)
- `useSaveManualContent` — manual narrative save

**Plan mutations**
- `useBuildPlan` — invalidates plan + sections
- `useUpdatePlan` — `{headline?, themes?}`
- `useSetFeeders`, `useReorderSections`
- `useAddOptional`, `useRemoveOptional`

**Assemble + render**
- `useAssembleReport({refresh?})` — `setQueryData` for final-report; invalidates readiness
- `useRenderReport({format})` — fetches Blob and triggers a browser download via anchor click

### `useKnowledgeBase.ts`
- `useKBDocuments({document_purpose?, page?, page_size?})`
- `useKBDocumentText(id|null)` (skips when null)

### `useConversations.ts`
- `useConversations`, `useConversation(id)`
- `useCreateConversation`, `useSendMessage`, `useRenameConversation`, `useDeleteConversation`, `useClearHistory`

### `useNotifications.ts`
- `useNotificationsLive()` — combines list + unread count, polls
- `useNotifications(filters)`, `useUnreadCount()`
- `useMarkNotificationRead`, `useMarkAllNotificationsRead`

### `QUERY_KEYS` (canonical set in `lib/constants.ts`)
```ts
ME, ADMIN_STATS
USERS(filters), USER(id), DEPARTMENTS
CYCLES(filters), CYCLE(id), CYCLE_OVERVIEW(id)
PM_DASHBOARD, PM_CYCLE(id)
BUILD_READINESS(cycleId), PM_CYCLE_SECTIONS(cycleId),
PM_CYCLE_PLAN(cycleId), PM_AVAILABLE_OPTIONAL(cycleId),
PM_ASSEMBLY_READINESS(cycleId), PM_FINAL_REPORT(cycleId)
DEPT_DASHBOARD, SESSION(id), DOCUMENTS
```

---

## 12. Design System (`components/ui/*`)

shadcn/ui pattern: thin Radix wrapper styled with Tailwind + `class-variance-authority` (`cva`) for variants. Every primitive accepts `className` and uses `forwardRef` where appropriate.

| File | Purpose |
|------|---------|
| `avatar.tsx` | Radix Avatar (Image + Fallback) |
| `badge.tsx` | `default \| secondary \| destructive \| outline` |
| `button.tsx` | Variants: `default \| destructive \| outline \| secondary \| ghost \| link`. Sizes: `default \| sm \| lg \| icon` |
| `checkbox.tsx` | Form checkbox with label + description slot |
| `confirm-dialog.tsx` | Pre-styled destructive confirm dialog (used by every "are you sure?" flow) |
| `data-table.tsx` | Generic `<DataTable<T>>` with `columns: Column<T>[]`, skeleton rows, empty state, optional pagination (first/prev/next/last) |
| `dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tabs.tsx` | Radix wrappers |
| `empty-state.tsx` | Centered icon + title + description + optional action |
| `input.tsx`, `label.tsx`, `textarea.tsx`, `separator.tsx`, `progress.tsx` | Form & layout primitives |
| `page-header.tsx` | `<h1>` + description + right-aligned action slot |
| `prose-preview.tsx` | `react-markdown` + Tailwind `prose` for AI / manual content |
| `stats-card.tsx` | Number tile used on dashboards (icon, title, value, description) |
| `status-badge.tsx` | Coloured pill driven by `SESSION_STATUSES`, `CYCLE_STATUSES`, `USER_STATUSES`; pass `variant="cycle" \| "session" \| "user"` |
| `skeletons.tsx` | `PageSkeleton`, `AuthSkeleton`, plus inline shimmer placeholders |
| `table.tsx` | Plain HTML-table primitives used by `data-table.tsx` |

### `lib/utils.ts`
- `cn(...inputs)` — `clsx` + `tailwind-merge`
- `formatDate(iso)` → `"Mar 16, 2026"`
- `formatDateTime(iso)` → `"Mar 16, 2026, 02:08 AM"`
- `formatFileSize(bytes)` → `"512 B" / "1.4 KB" / "2.3 MB"`
- `getInitials(name)` → first two upper-cased initials

### `lib/constants.ts`
- `SESSION_STATUSES`, `CYCLE_STATUSES`, `USER_STATUSES`, `USER_ROLES`
- `TONE_OPTIONS` — Executive / Professional / Technical / Conversational / Formal
- `SECTION_MODES`, `SECTION_LAYERS`, `SECTION_STATUSES`, `COMPANY_PROFILES`, `SECTORS`
- `QUERY_KEYS` — canonical TanStack-Query key registry

### `lib/section-filters.ts`
- `isTableOfContentsSection(s)` — used everywhere we hide the auto ToC from PM-facing lists (Plan Review, Builder Shell, Final Report body)

---

## 13. Report Builder Components (`components/report/*`)

### Stage 1 — Section list (admin)
- `app/(protected)/admin/cycles/[id]/page.tsx::ReportSectionsCard` — read-only table of resolved sections with layer/mode/status badges. Auto-triggers `useResolveSections` on first mount if the profile is set but no sections exist yet.

### Stage 2 — Plan Review (`/pm/cycles/[id]/plan`)

The PM's review/edit screen for the AI plan. Wizard pattern with two steps:

1. **Sections** — tile grid (`PlanSectionGrid`):
   - 2-column responsive grid, internal scroll, `@dnd-kit` drag-reorder.
   - Each tile shows numbered prefix, layer + mode + (Manual?) badges, feeder picker, remove button on hover.
   - Manual sections show *"Manual — written by the PM"* or *"Manual — file uploaded by the PM"* in place of the feeder picker.
   - Footer: **Add section** dropdown (with search field + scrollable list, see `AddSectionPicker`) + **Lock sections →** CTA (disabled until every generate-mode `ai_allowed` section has a source).
2. **Themes** — `ThemeEditor`. Up to 8 themes (`title` + `description`). Save batches the whole list via `useUpdatePlan({themes})`.

Top toolbar:
- Back chevron, eyebrow *"Review the plan before we build"*, cycle name as the prominent title.
- **Regenerate plan** button (`RegeneratePlanButton`) — `useBuildPlan({refresh:true})` with destructive confirm.
- **Start Building →** CTA in step 2's footer (`StartBuildingAction`):
  - Fires `pmApi.generateSection` in parallel for every pending generate-mode `ai_allowed` section with feeders assigned.
  - Shows a progress dialog with per-section status; allows "Skip and continue".
  - Manual sections are excluded from this loop.
- Table of Contents is hidden from the section grid via `isTableOfContentsSection`.

### Stage 3 — Builder Shell (`/pm/cycles/[id]/build`)

Two-pane layout:
- **Left** — progress (`{locked} of {total} sections locked`) + `<SectionList>`. Auto sections count as always-locked. Auto-selects the first section on load.
- **Right** — `<SectionDetail>` (the architectural seam — routes by `ai_allowed`, then `mode`).
- Top header: **Review Plan** link + **Assemble & Open** button (`AssembleEntry` — disabled until `assemblyReadiness.can_assemble`).

`SectionDetail` routes as follows:

```ts
if (!section.ai_allowed) {
  return content_source === "narrative"
    ? <ManualSection />
    : <AttachSection />
}
switch (section.mode) {
  case "generate": return <GenerateSection />
  case "attach":   return <AttachSection />
  case "auto":     return <AutoSection />   // cover, TOC
}
```

`SectionHeader` renders layer + mode + (Manual?) chip + `content_source` label + the section title.

#### `GenerateSection` (AI narrative)
Three sub-views off `section.status`:
- **PendingView** — *"No source assigned"* or *"Written by the AI narrative writer"* (lists feeder names), with a Generate button.
- **DraftingView** — `ProsePreview` of the current draft, `SectionChat` for instruction-driven refines, **Regenerate** (destructive confirm) + **Lock section**.
- **LockedView** — read-only preview + locked-at timestamp + **Unlock**.

`SectionChat` posts user instructions to `useRefineSection`; the panel dims during the LLM call. No persisted transcript — backend is stateless.

#### `ManualSection` (manual narrative)
- Labelled textarea pre-filled with `section.content`.
- Save (`useSaveManualContent`) — disabled when not dirty or empty; saves overwrite the previous body.
- Saved-state indicator + character count.
- Lock / Unlock identical to GenerateSection.

#### `AttachSection` (file upload)
- `react-dropzone` (PDF, DOCX, DOC, XLSX, TXT). 120s upload timeout (backend extracts + chunks).
- AttachedView shows a file card + Replace / Remove + a **Verified** checkbox (gates Lock).
- LockedView shows the file + Lock badge + Unlock.
- Used for both `mode === "attach"` and manual non-narrative sections (`ai_allowed=false` + `content_source !== "narrative"`).

#### `AutoSection` (system-rendered)
- Read-only placeholder + **Optional notes** textarea (localStorage; not yet wired to the assembled report).
- "Always ready" badge — auto sections aren't required to lock.

### Stage 4 — Assemble (`AssembleEntry`)
- Reads `useAssemblyReadiness`.
- When `can_assemble`, opens a dialog with a list of unlocked sections (so the PM can finish them).
- "Assemble" calls `useAssembleReport({refresh:false})` and navigates to `/pm/cycles/[id]/report`.
- "Re-assemble" calls with `refresh:true`.

### Stage 5 — Final Report (`/pm/cycles/[id]/report`)
- Renders `<FinalReportView report={…} cycle={…}>`.
- Layout:
  - **`CoverBlock`** — fiscal year + cycle name + headline + sector / profile meta line.
  - **Executive Summary** — `ProsePreview` over `report.executive_summary`.
  - **Per-section body** — sorted by `order`, rendered by `<ReportSectionRenderer>`:
    - `narrative` → title + `ProsePreview(content)`
    - `attachment` → title + document card (filename, file type) + a muted *"Audited document — included as filed."* note
    - `auto` → skipped (cover/ToC handled separately)
- Header actions: **Re-assemble** + **Download DOCX** (via `useRenderReport({format:"docx"})`).

---

## 14. Operational Workflow (end-to-end)

```
ADMIN
 ├─ Create departments              (/admin/departments)
 │   each department also stores
 │   initial_prompt + system_prompt
 │   that configure its AI agent
 ├─ Create / activate users         (/admin/users)
 │   create() = /auth/register + /admin/users/{id}/activate
 ├─ Create a cycle                  (/admin/cycles/new)
 │   captures name, FY, dates, deadline, PM,
 │   AND the company profile (Listed/Private,
 │   Sector, Shariah, Subsidiaries, Sukuk)
 │   → on success, the new-cycle page also fires
 │     resolveSections() so the section list is
 │     populated before the PM lands on /admin/cycles/{id}
 ├─ On the cycle detail page        (/admin/cycles/{id})
 │   – Assign departments + responsible users
 │   – Upload kickoff docs (multipart, PDF/DOCX/TXT)
 │   – Edit cycle metadata + company profile
 │   – Re-resolve sections from the current profile
 └─ Click "Activate Cycle"          (/admin/cycles/{id}/activate)
     – pre-activation checklist
     – calls POST /admin/cycles/{id}/activate (generate_questions=false)
     – backend asynchronously creates one Session per department;
       the activate page polls useCycleOverview every 15 s

PROJECT MANAGER
 ├─ /pm                             dashboard (poll 5 s)
 ├─ /pm/cycles/{id}                 cycle workspace
 │   – submit kickoff brief (text)   POST /pm/kickoff (180s)
 │     or upload a brief doc         POST /pm/cycles/{id}/kickoff-doc
 │   – send reminders (bulk or row)
 │   – raise escalations
 │   – review submitted sessions
 │       /pm/sessions/{sid}
 │   – once every department is approved,
 │     "Open Report Builder" unlocks → /pm/cycles/{id}/plan
 ├─ /pm/cycles/{id}/plan            Plan Review wizard
 │   – Step 1: Sections — reorder, set feeders,
 │     add/remove sections, lock the list
 │   – Step 2: Themes — edit themes, save
 │   – Start Building → bulk-generate every eligible
 │     section then routes to /pm/cycles/{id}/build
 ├─ /pm/cycles/{id}/build           Builder Shell
 │   – Walk each section: generate / refine / manual write / upload
 │   – Lock each section
 │   – When all required sections are locked, Assemble
 ├─ /pm/cycles/{id}/report          Assembled report viewer
 │   – Re-assemble (refresh)
 │   – Download DOCX  GET /pm/cycles/{id}/render?format=docx
 └─ Optional fallback flow (legacy):
     /pm/cycles/{id} → "Generate Report" dialog
     hits POST /pm/cycles/{id}/generate-report for a quick consolidated doc

DEPARTMENT USER
 ├─ /department                     "My Sessions" inbox (reads data?.assignments)
 ├─ /department/sessions/{id}       authoring workspace
 │   – answer Qs one-by-one or in overview
 │   – autosave + submit answers
 │   – get a per-question AI suggestion
 │   – converse with the agent against an answer
 │   – upload evidence documents — backend can also extract
 │     answers directly out of the evidence
 └─ /department/sessions/{id}/draft draft & finalise
     – generate / regenerate draft  POST /department/sessions/{id}/generate-draft
     – preview rendered HTML/MD
     – adjust tone                  POST /department/sessions/{id}/adjust-tone
     – finalise                     POST /department/sessions/{id}/finalize
       → status becomes "submitted" → enters PM review pool
```

---

## 15. Page-by-Page Reference

### Public

| Route | File | Purpose |
|-------|------|---------|
| `/login` | `app/(public)/login/page.tsx` | "Use Centriyon" info card with a button linking to `${NEXT_PUBLIC_CENTRITON_URL}/login`. No form. |
| `/forgot-password` | `app/(public)/forgot-password/page.tsx` | "Password reset is handled in Centriyon" info card. |
| `/reset-password` | `app/(public)/reset-password/page.tsx` | Same treatment as forgot-password. |
| `/auth/token` | `app/auth/token/page.tsx` | Centriyon SSO landing — reads `?token=`, calls `loginWithToken`, redirects to the role home. Shows a "Signing you in…" loader. |

### Profile

| Route | Purpose |
|-------|---------|
| `/profile` | View name/email/role/department + a "Password & account" card explaining that credentials are managed in Centriyon, with a button linking out to Centriyon. |

### Admin

| Route | What it does |
|-------|--------------|
| `/admin` | Dashboard. Stats (users / pending activation / departments / active cycles), "Requires your attention" banner (pending users + draft cycles), per-cycle progress bars colour-coded by completion (red < 30%, amber 30–70%, green ≥ 70%), per-role user breakdown. |
| `/admin/departments` | Table — code + name + description + System vs Custom pill. Modal create form: code (≤ 10, upper-cased), name, description, **initial_prompt** + **system_prompt** (≥ 10 chars — configure the dept agent). |
| `/admin/departments/[id]` | Inline edit name + description + AI agent persona (initial + system prompts). List of assigned users. |
| `/admin/users` | Paginated user table (filters: role, status, search). Modal create (`/auth/register` + auto-activate). Modal edit. Delete with `<ConfirmDialog>`. Activate pending users. |
| `/admin/cycles` | Cycles table — name + FY, PM, deadline, progress bar, status badge, View action. |
| `/admin/cycles/new` | RHF + Zod form: `cycle_name`, `fiscal_year`, `start_date`, `end_date`, `submission_deadline`, `project_manager_id` (`useUsers({role:"project_manager", status:"active"})`), `kickoff_brief`, **company profile** (`company_profile`, `sector`, `is_shariah`, `has_subsidiaries`, `has_sukuk`). After create, also calls `cyclesApi.resolveSections(newId)` so the section list is ready by the time the PM lands on the workspace. |
| `/admin/cycles/[id]` | Cycle workspace. Header actions: Upload Docs, Edit, Activate (if draft). For draft / 0-sessions cycles shows an **Assign Departments** section. For active cycles with sessions: shows the session table from `useCycleOverview()` (polls every 15s). Includes a **Report Sections** card that auto-triggers `useResolveSections` if the profile is set but no sections exist. |
| `/admin/cycles/[id]/activate` | Pre-activation checklist (PM assigned, deadline set, timeline set, departments assigned). Calls `activate(id, generate_questions=false)` (PM submits the kickoff brief which triggers question generation). |
| `/admin/documents` | Knowledge Base browser (uses shared `KnowledgeBasePage`). |
| `/admin/conversations` | RAG chat (uses shared `ConversationsView`). |
| `/admin/agents` | placeholder |

### PM

| Route | What it does |
|-------|--------------|
| `/pm` | Pending-reviews alert, 3 stat cards, per-cycle cards with deadline + colour-coded progress + status breakdown (submitted / in progress / not started), recent submissions feed. |
| `/pm/cycles` | List of all active cycles assigned to this PM. Tolerates either `active_cycles` or `cycles` keys in the response. |
| `/pm/cycles/[id]` | PM cycle workspace (~1.2K LOC). Kickoff-brief dialog (text or doc upload). Department Progress Tracker with per-row actions (Review / View Submission / Remind / Escalate / Awaiting Resubmit). Workflow pipeline indicator (Kickoff → In Progress → Submitted → Needs Changes → Approved → Final Report). **Open Report Builder** button — enabled only when every assigned department is approved. Generate-Report dialog for the legacy consolidated-report flow. |
| `/pm/cycles/[id]/plan` | The Plan Review wizard — see §13 / Stage 2. |
| `/pm/cycles/[id]/build` | The Builder Shell — see §13 / Stage 3. |
| `/pm/cycles/[id]/report` | The assembled report viewer — see §13 / Stage 5. |
| `/pm/cycles/[id]/sessions` + `/[sid]` | PM-scoped session list + detail (in-cycle quick navigation). |
| `/pm/sessions/[id]` | Read-only session view (answers tab + draft tab) with the review actions: `approved`, `rejected`, `reopened`. PM can act when status is `submitted` or `reviewed`. |
| `/pm/reviews` | Flat list of "needs review" sessions from `usePMDashboard().recent_submissions`. |
| `/pm/documents`, `/pm/conversations`, `/pm/agents` | KB, RAG, placeholder. |

### Department

| Route | What it does |
|-------|--------------|
| `/department` | "My Report Sessions" cards. Each card has a coloured border (red overdue, amber reopened, green approved). Progress + deadline + a CTA that adapts to status (Start / Continue / Revise / Submitted-waiting / Approved). Reads `data?.assignments`. |
| `/department/sessions/[id]` | Authoring workspace (~790 LOC). Question-by-question or overview layout. Autosave debounce. Per-question AI suggestion + chat panel (creates a conversation per session via `chatApi.createConversation`, sends messages bound to the current Q). Evidence upload + AI extraction (via `departmentApi.extractAnswers` with `extraction-loader`). Workspace can hide the main app sidebar via the `sidebar-set-mode` custom event. |
| `/department/sessions/[id]/draft` | Generate the draft. Toggle between Markdown source and rendered preview. Tone adjuster (5 presets). Finalise with `<ConfirmDialog>` → `final_content` is locked in, status becomes `submitted`. Different success card when already approved. |
| `/department/documents`, `/department/conversations`, `/department/agents` | KB, RAG, placeholder. |

---

## 16. Knowledge Base & RAG

### Knowledge Base
- `components/knowledge-base/KnowledgeBasePage.tsx` is shared across all three roles (the menus differ but the inner browser is the same).
- Server-paginated list with purpose filter and search.
- Document detail panel pulls `getText` for an in-app preview and `getDownloadUrl` for a fresh signed URL on each download (signed URLs are short-lived — never cache them).

### RAG Conversations
- `components/chat/ConversationsView.tsx` + `ChatMessageBubble.tsx` for the UI.
- One conversation per session in the dept authoring workspace; the conversation is created when the chat panel is first opened and reused.
- `useConversations.ts::useSendMessage` does optimistic updates so the user's message renders immediately.

---

## 17. Notifications

- `useNotificationsLive()` polls `GET /notifications/unread-count` + `GET /notifications` so the bell badge updates without a manual refresh.
- `TopNav` renders the bell with the unread count and a dropdown of recent notifications.
- Per-notification actions: mark read, mark all read.

---

## 18. Cross-Cutting Patterns & Conventions

### Server-side polling
TanStack Query is the authoritative store, and we poll where the backend's async work could land between user actions:
- `useCycleOverview` — 15 s (post-activation session creation)
- `usePMDashboard`, `usePMCycleDashboard` — 5 s (dept submissions appearing for the PM)
- `useNotificationsLive` — interval based

### Cache-patch pattern (Report Builder)
Section mutations always `setQueryData(PM_CYCLE_SECTIONS, oldList => oldList.map(replace))` rather than invalidate-and-refetch. Rationale documented in `useReportBuilder.ts`: the GET list doesn't yet return `attachment` / `verified` / `locked_at` for every section, so a refetch would clobber fresh fields.

### Multipart uploads
Every multipart endpoint deletes the Axios instance-level `Content-Type` default (`{ headers: { "Content-Type": undefined } }`) so Axios can set the boundary from the `FormData`. All raise the timeout to 120 s because the backend extracts text + creates vector chunks.

### Backend quirks handled by the frontend
- `Department.id` vs `Department.department_id` — every call site uses a `getDeptKey()` helper or the `??` fallback.
- `Cycle.id` vs `Cycle.cycle_id` in the create response — handled in `/admin/cycles/new`.
- `session.department_name === "Unknown"` → enriched in the proxy aggregator.
- `assignDepartments` response-serialisation error → caught silently because the DB write actually succeeded.
- `404` on the PM dashboard means "no active cycles" → mapped to an empty payload, not an error.
- Plan / sections responses may wrap as `{plan:…}` / `{sections:[…]}` / `{available:[…]}` or arrive bare — every API function tolerates both shapes.

### Error normalisation
`client.ts` produces `{error, message, status, details}` regardless of FastAPI's variant response shapes (`message`, `detail` string, `detail` array of `{msg}`). Hooks always toast `err?.message || "Failed to …"`. Forms that want inline errors skip the hook's toast and read the same field manually.

### Optimistic UX
The codebase prefers polling + invalidation + targeted cache-patches over optimistic updates (per the comments in `useSessions.ts`, things like dept-submission visibility are critical and the team would rather pay the round-trip).

### CSS theming
- HSL CSS variables defined in `app/globals.css` (`--background`, `--primary`, `--muted`, …).
- Tailwind config maps them: `bg-primary`, `text-foreground`, etc.
- `darkMode: "class"` is configured but the app runs light-only.
- `@tailwindcss/typography` powers the markdown preview on the draft page and the final report view.

### File-path alias
`tsconfig.json` maps `@/*` to the repo root. All in-app imports use `@/components/...`, `@/lib/...`, etc.

### Lint
ESLint 9 flat config with `next/core-web-vitals`. Type-check via `npx tsc --noEmit` (not wired into a package.json script).

---

## 19. Build & Run

```bash
# install
npm install

# local dev (default port 3000)
npm run dev

# production build + serve
npm run build
npm run start

# lint
npm run lint

# type check (no script — invoke directly)
npx tsc --noEmit
```

Required `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1
NEXT_PUBLIC_APP_NAME=Spark Annual Report AI Studio

# Centriyon SSO — SAR redirects here for login, on logout, and on 401 token expiry
NEXT_PUBLIC_CENTRITON_URL=http://localhost:8080

# Server-side only — required for /api/pm/* proxies to function
ADMIN_SERVICE_EMAIL=...
ADMIN_SERVICE_PASSWORD=...
DEPT_USER_DEFAULT_PASSWORD=...   # optional; falls back to ADMIN_SERVICE_PASSWORD
```

The repo is wired for Vercel deployment.

---

## 20. Quick Reference — Where Things Live

| Need | File |
|------|------|
| Add a new domain type | `types/index.ts` |
| Add an API endpoint | `lib/api/<module>.ts` (+ payload types in the same file) |
| Wrap it in a query/mutation | `hooks/use<Resource>.ts` (+ key in `lib/constants.ts → QUERY_KEYS`) |
| Add a UI primitive | `components/ui/<name>.tsx` |
| Add a report-builder primitive | `components/report/<name>.tsx` |
| Add an authenticated page | `app/(protected)/<role>/.../page.tsx` |
| Add a Next.js server-side proxy | `app/api/pm/...` (use helpers from `_sessionAggregator.ts`) |
| Tweak the role-routing map | `contexts/AuthContext.tsx::ROLE_ROUTES` + `components/auth/RouteGuard.tsx` |
| Adjust nav | `components/layout/Sidebar.tsx::ADMIN_NAV / PM_NAV / DEPT_NAV` |
| Tweak Axios behaviour (timeouts, headers, refresh) | `lib/api/client.ts` |
| Status / mode / layer colours | `lib/constants.ts` (`SESSION_STATUSES`, `CYCLE_STATUSES`, `USER_STATUSES`, `SECTION_MODES`, `SECTION_LAYERS`, `SECTION_STATUSES`) |
| Tone presets | `lib/constants.ts::TONE_OPTIONS` |
| Hide a section globally (e.g. ToC) | `lib/section-filters.ts` |
| Theme tokens / HSL vars | `app/globals.css` (paired with `tailwind.config.ts`) |

---

## 21. Glossary

| Term | Meaning |
|------|---------|
| **Cycle** | A single annual-report cycle for one fiscal year — the unit of work |
| **Kickoff brief** | PM-authored strategic context that feeds AI question generation per department |
| **Session** | One department's questionnaire instance inside a cycle |
| **Resolve** | Server-side derivation of the canonical section list from the cycle profile |
| **Plan** | The AI-generated `{headline, themes[], feeders[]}` payload the PM reviews |
| **Feeder** | A department session whose approved content feeds an AI-generated section |
| **Section layer** | Why the section is required (common / cma / sector / optional) |
| **Section mode** | How the section's content is produced (generate / attach / auto) |
| **Manual section** | `ai_allowed === false`; PM provides content directly (text or upload) |
| **Lock** | Freeze a section's content for assembly |
| **Assemble** | Stitch all locked sections + cover + executive summary into a `FinalReport` |
| **Render** | Export the assembled report to a binary format (DOCX shipped, PDF planned) |
| **Auto section** | A section the backend generates at assembly time (cover, ToC) |
| **Builder Shell** | The two-pane PM workspace at `/pm/cycles/[id]/build` |
| **Proxy** | A Next.js Route Handler under `/api/pm/*` that fills in for a missing or broken backend endpoint |
