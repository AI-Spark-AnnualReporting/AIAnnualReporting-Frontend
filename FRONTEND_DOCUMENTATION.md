# Spark Annual Report AI Studio — Frontend Documentation

A production-ready, AI-powered annual-report generation platform. The frontend is a Next.js 16 (App Router) application written in TypeScript, styled with Tailwind v4 and shadcn/ui primitives, and powered by TanStack Query for server-state management. It talks to a remote FastAPI backend hosted on Azure App Service (`/api/v1`), and also ships a small fleet of internal Next.js Route Handlers under `/api/pm/*` that act as server-side proxies to work around confirmed backend bugs.

---

## 1. Tech Stack

| Layer | Technology | Version |
|------|----------|--------|
| Framework | Next.js (App Router, RSC) | `16.1.6` |
| Runtime | React | `19.2.3` |
| Language | TypeScript (strict) | `^5` |
| Styling | TailwindCSS + `@tailwindcss/typography` | `^4` |
| Component primitives | Radix UI + shadcn/ui patterns | latest |
| Server state | TanStack Query (+ Devtools) | `^5.90` |
| Forms | React Hook Form + Zod (`@hookform/resolvers`) | `^7.71` / `^4.3` |
| HTTP client | Axios (singleton, with JWT auto-refresh) | `^1.13` |
| Icons | `lucide-react` | `^0.575` |
| Toasts | `sonner` | `^2.0` |
| Markdown render | `react-markdown` | `^10.1` |
| Date utils | `date-fns` (only `formatDate` helpers in `lib/utils.ts` actually use it transitively) | `^4.1` |
| Theme | `next-themes` (wired but light-only used in UI) | `^0.4` |
| Auth | JWT (access + refresh tokens, `localStorage`) | — |

`package.json` declares no test or storybook runner; only `dev`, `build`, `start`, `lint`.

---

## 2. Top-Level Project Structure

```
spark-ar-studio/
├── app/                          Next.js App Router root
│   ├── layout.tsx                Root <html><body> wrapper, mounts <Providers>
│   ├── globals.css               Tailwind base + CSS-var theme tokens
│   ├── page.tsx                  Hard redirect "/" → "/login"
│   │
│   ├── (public)/                 Route group, public layout (gradient card)
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/page.tsx
│   │
│   ├── (protected)/              Route group — wraps in <RouteGuard>
│   │   ├── layout.tsx            Sidebar + TopNav shell, 100vh flex
│   │   ├── profile/page.tsx
│   │   ├── admin/                Admin module (M1 — Identity, M2 — Cycles, M3 — KB)
│   │   ├── pm/                   Project-manager module (M5 — Cycle ops & review)
│   │   └── department/           Department module (M4 — Authoring workspace)
│   │
│   └── api/pm/                   Internal Route Handlers (server-side proxies)
│       ├── _sessionAggregator.ts Service-account login + per-user dashboard cache
│       ├── cycles/route.ts                            PM dashboard list (workaround)
│       ├── cycles/[cycleId]/route.ts                  PM cycle detail (workaround)
│       ├── cycles/[cycleId]/full-report/route.ts      Assemble full annual report
│       └── sessions/[sessionId]/route.ts              PM-impersonates-dept-user fetch
│
├── components/
│   ├── providers.tsx             QueryClient + AuthProvider + Toaster + Devtools
│   ├── auth/
│   │   ├── RouteGuard.tsx        Auth gate, role redirect, hydration-safe skeleton
│   │   └── Can.tsx               <Can role="admin">…</Can> RBAC wrapper
│   ├── layout/
│   │   ├── Sidebar.tsx           Tri-state (expanded/icons/hidden), per-role nav
│   │   └── TopNav.tsx            Avatar dropdown, logout, profile links
│   └── ui/                       Design-system primitives (button, card, dialog,
│                                  data-table, status-badge, stats-card, …)
│
├── contexts/
│   └── AuthContext.tsx           Login, /auth/me, role-based redirect, logout
│
├── hooks/                        Thin TanStack Query wrappers (one per resource)
│   ├── useUsers.ts
│   ├── useDepartments.ts
│   ├── useCycles.ts
│   └── useSessions.ts            ← biggest; covers dept + PM session ops
│
├── lib/
│   ├── api/
│   │   ├── client.ts             Axios singleton with refresh-token interceptor
│   │   ├── auth.ts               login / me / refresh / logout / pw reset
│   │   ├── users.ts              admin user CRUD + stats
│   │   ├── departments.ts        admin department CRUD + user assign
│   │   ├── cycles.ts             admin cycle CRUD + activate + dept-assign + overview
│   │   ├── department.ts         dept session ops: answer, draft, finalize, AI assist
│   │   ├── pm.ts                 PM ops: dashboard (proxied), kickoff, review, escalate
│   │   ├── chat.ts               RAG conversations linked to documents
│   │   └── knowledge-base.ts     KB API: paginated list / get / text / download
│   ├── constants.ts              Status maps, tone options, structured QUERY_KEYS
│   └── utils.ts                  cn, formatDate, formatDateTime, getInitials, formatFileSize
│
├── types/
│   └── index.ts                  All domain TypeScript types (single source)
│
├── public/                       Static assets
├── scripts/                      (build/dev scripts, currently unused)
├── tailwind.config.ts            HSL CSS-var theme, typography plugin
├── postcss.config.mjs            Tailwind v4 PostCSS plugin
├── eslint.config.mjs             Next + flat config
├── tsconfig.json                 strict; "@/*" alias → repo root
├── next.config.ts                empty experimental block
├── .env.example                  NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_APP_NAME
└── README.md
```

---

## 3. Environment Variables

| Variable | Purpose | Used by |
|----------|---------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API base (defaulted in `lib/api/client.ts`) | All Axios calls |
| `NEXT_PUBLIC_APP_NAME` | Display name | UI only |
| `ADMIN_SERVICE_EMAIL` | Service-account email for server-side proxy login | `app/api/pm/_sessionAggregator.ts` |
| `ADMIN_SERVICE_PASSWORD` | Service-account password | same |
| `DEPT_USER_DEFAULT_PASSWORD` | Shared password used when impersonating dept users from the proxy (falls back to `ADMIN_SERVICE_PASSWORD`) | same |

The `NEXT_PUBLIC_*` vars are baked into the bundle. The non-prefixed ones are only readable in Route Handlers and are required for the PM proxies to function.

Default backend URL (also hard-coded as a fallback inside `client.ts`):
```
https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1
```

---

## 4. Application Bootstrap

### `app/layout.tsx`
Wraps every route in `<Providers>` and applies the Inter font as a CSS variable. Sets the global `<title>` and meta-description.

### `components/providers.tsx`
- Creates a single `QueryClient` (memoised via `useState`) with:
  - `staleTime: 60_000`
  - `retry`: disabled for `401`/`403`; otherwise up to 2 retries
- Mounts the React-Query provider, the `AuthProvider`, the Sonner `<Toaster position="top-right" richColors closeButton />`, and the React-Query Devtools (collapsed).

### `app/page.tsx`
Synchronously redirects `/` → `/login` on the server.

---

## 5. Authentication

### Token lifecycle
- `access_token` + `refresh_token` are stored in `localStorage`.
- Axios attaches `Authorization: Bearer <access_token>` on every request via the request interceptor (`lib/api/client.ts`).
- On a `401` that is **not** an `/auth/refresh` or `/auth/login` request, the response interceptor:
  1. Pauses concurrent requests via a `failedQueue` and `isRefreshing` flag.
  2. POSTs `refresh_token` → `/auth/refresh`.
  3. Stores the new `access_token`, updates the default header, replays the original request.
  4. If refresh fails, clears tokens and hard-navigates to `/login`.
- All other errors are normalised to `{ error, message, status, details }` so UI code can read `err.message` regardless of whether the FastAPI backend returned `{message}`, `{detail}`, or `{detail: [{msg:…}]}`.

### `contexts/AuthContext.tsx`
Exposes `useAuth()` with:
- `user`, `isAuthenticated`, `isLoading`
- `login(email, password)` — calls `/auth/login`, persists tokens, fetches `/auth/me`, then pushes the user to their role's home (`/admin`, `/pm`, `/department`).
- `logout()` — best-effort `/auth/logout`, clears tokens, routes to `/login`.
- `refreshUser()` — re-fetches `/auth/me`.

### `components/auth/RouteGuard.tsx`
Wraps every `(protected)` route. Behaviour:
- While loading: shows `<AuthSkeleton />`.
- If no token and not authenticated: redirects to `/login?redirect=<pathname>`.
- If token exists but user state hasn't hydrated yet: keeps the skeleton (avoids the post-login flash back to `/login`).
- If `allowedRoles` is set and the user's role is not allowed: redirects to that user's role home.

### `components/auth/Can.tsx`
Tiny inline RBAC primitive:
```tsx
<Can role="admin">…admin-only UI…</Can>
<Can role={["admin","project_manager"]} fallback={<ReadOnlyView/>}>…</Can>
```

### Public auth pages
- `app/(public)/login/page.tsx` — Zod-validated email + password; toggle password visibility; toasts errors.
- `app/(public)/forgot-password/page.tsx` — `authApi.requestPasswordReset({email})`.
- `app/(public)/reset-password/page.tsx` — `authApi.confirmPasswordReset({token, new_password})`.

---

## 6. Routing & Role Map

| Role | Default route after login | Allowed prefix |
|------|---------------------------|----------------|
| `admin` | `/admin` | `/admin/*` (full system) |
| `project_manager` | `/pm` | `/pm/*` |
| `department_user` | `/department` | `/department/*` |

Hard-coded in `AuthContext.tsx` (`ROLE_ROUTES`) and `RouteGuard.tsx` (role-mismatch fallback).

### Protected layout (`app/(protected)/layout.tsx`)
```
┌───────────────────────────────────────────────────┐
│ <Sidebar />  │  <TopNav />                         │
│  (tri-state)│  ───────────────────────────────────│
│              │  <main> {children} (overflow-y)    │
└───────────────────────────────────────────────────┘
```

### Sidebar (`components/layout/Sidebar.tsx`)
- Three persisted modes in `localStorage["sidebar-mode"]`: `expanded` (w-64) → `icons` (w-14) → `hidden` (only sliver re-open button) → `expanded`.
- Per-role nav definitions (`ADMIN_NAV`, `PM_NAV`, `DEPT_NAV`), each supporting `{type:"divider"}` items.
- Listens for a global `sidebar-set-mode` `CustomEvent`, so the session workspace can toggle the nav from inside the workspace UI.

### TopNav (`components/layout/TopNav.tsx`)
- Bell placeholder.
- Avatar + role chip → Radix DropdownMenu with Profile / Change Password / Sign Out.

---

## 7. Domain Types (`types/index.ts`)

| Type | Notes |
|------|------|
| `UserRole` | `"admin" \| "project_manager" \| "department_user"` |
| `UserStatus` | `"active" \| "inactive" \| "pending" \| "suspended"` |
| `CycleStatus` | `"draft" \| "active" \| "completed" \| "archived" \| "closed"` |
| `SessionStatus` | `not_started \| in_progress \| submitted \| reviewed \| approved \| rejected \| reopened` |
| `User`, `AuthTokens`, `LoginResponse` | Auth payloads |
| `Department` | Tolerates both `id` and `department_id` (backend inconsistency); carries `initial_prompt` + `system_prompt` (AI agent persona) |
| `Cycle`, `CycleOverview`, `SessionSummary` | Cycle list / detail / departments-on-cycle |
| `Question`, `Answer`, `Session` | Per-department questionnaire & draft state |
| `DepartmentDashboard` | Top-level dept user inbox (uses `assignments[]` — the old `active_sessions` is gone) |
| `PMDashboard`, `AdminStats` | Dashboard payloads |
| `Document`, `ApiError`, `PaginatedResponse<T>` | Misc |

---

## 8. API Client Layer (`lib/api/*`)

All modules import the singleton `apiClient` from `lib/api/client.ts` and expose a typed object of functions.

### `auth.ts` — `authApi`
`login`, `me`, `refresh`, `logout`, `changePassword`, `requestPasswordReset`, `confirmPasswordReset`.

### `users.ts` — `usersApi`
Admin user CRUD against `/admin/users`. **Important quirk:** `create()` does **not** call `POST /admin/users` (which has a UUID bug on the backend). Instead it:
1. `POST /auth/register` to create the user (status: pending).
2. `POST /admin/users/{user_id}/activate` to immediately activate them (admin-created users are trusted).

Also: `list`, `get`, `update`, `activate`, `delete`, `stats` (`/admin/users/stats`), `adminStats` (`/admin/stats`).

### `departments.ts` — `departmentsApi`
`list`, `get`, `create`, `update`, `assignUsers` (`POST /admin/departments/{id}/users`). Department records carry `initial_prompt` + `system_prompt` which configure the per-department AI agent persona.

### `cycles.ts` — `cyclesApi`
Admin cycle ops:
- `list(status?)`, `get(id)`, `create`, `update`, `delete`
- `assignDepartments(cycleId, {assignments:[{department_id,user_id}…]})` — step 1 before activation
- `activate(cycleId, generateQuestions=true)` — step 2; query string toggles auto-generation of AI questions
- `uploadKickoffDocs(cycleId, files[])` — multipart, axios auto-sets the boundary
- `overview(cycleId)` — returns stats + per-department session summary

### `pm.ts` — `pmApi`
Mixed: most call the real backend, but two routes pass through Next.js handlers because the backend endpoints are broken or missing.

| Method | Endpoint | Notes |
|--------|----------|------|
| `dashboard()` | `GET /api/pm/cycles` (local proxy) | Real backend has no list endpoint and `/pm/dashboard/{cycle_id}` returns empty departments |
| `cycleDashboard(id)` | `GET /api/pm/cycles/{id}` (local proxy) | Same workaround |
| `submitKickoff` | `POST /pm/kickoff` | Text strategic brief |
| `uploadKickoffDoc` | `POST /pm/kickoff/upload` | Multipart, 120 s timeout (backend extracts + vectorises) |
| `getSession(id)` | `GET /api/pm/sessions/{id}` (local proxy) | Proxy impersonates the dept user who owns the session |
| `reviewSession` | `POST /pm/sessions/{id}/review` | `status ∈ reviewed/approved/rejected/reopened` |
| `sendBulkReminders` | `POST /pm/reminders` | Optional `session_ids` or `cycle_id` |
| `createEscalation` / `getEscalations` | `/pm/escalations` |
| `generateReport` | `POST /pm/cycles/{id}/generate-report` | Optional `session_ids`, `format` |

### `department.ts` — `departmentApi`
Dept user session workflow:
- `dashboard()` — `/department/dashboard`
- `getSession(id)`
- `submitAnswers(id, {answers:[{question_id, question, answer}]})`
- `generateDraft(id)` — server-side AI consolidation
- `finalize(id, {final_content})` — locks the session for review
- `uploadDocument(id, file)` — multipart, 120 s timeout (extraction + vector chunking)
- `getAiSuggestion(id, questionId)` — fetch the cached AI suggestion for a question
- `suggestAnswer(id, {question_id, question, context?})` — request a fresh AI suggestion
- `conversationPrompt(id, {…, prompt})` — chat-style refinement against an answer
- `adjustTone(id, {content, target_tone})` — rewrite the draft in a chosen tone

### `chat.ts` — `chatApi`
RAG conversations optionally bound to a document:
- `createConversation({document_id?, title?})`
- `sendMessage(conversationId, message)`
- `getConversation(id)`, `listConversations()`

### `knowledge-base.ts` — `knowledgeBaseApi`
Knowledge Base API mounted at `/knowledge-base/documents`. Server-paginated and role-scoped server-side:
- `list({document_purpose?, page?, page_size?})` — paginated list; use the `total` field for the pager.
- `get(id)` — single-document metadata (incl. `word_count`).
- `getText(id)` — extracted plain text.
- `getDownloadUrl(id)` — short-lived signed URL; fetch fresh per download, never cache.

The API also exposes an admin-only `DELETE`, but document deletion is intentionally **not** surfaced in the frontend.

---

## 9. Internal Next.js Route Handlers (`app/api/pm/*`)

These run server-side inside Next.js and exist to work around two confirmed backend issues:
1. `GET /pm/dashboard/{cycle_id}` always returns `departments: []`.
2. There is no list endpoint exposing all PM cycles.

### Strategy
The handlers log into the backend as a service account, also impersonate dept users (using a shared `DEPT_USER_DEFAULT_PASSWORD`), and call `GET /department/dashboard` per user. They aggregate and group by `cycle_id`.

### `_sessionAggregator.ts` — core helpers (module-scope, with **`globalThis`-attached caches** so multiple route handlers share state inside one process)
- `tokenCache: Map<email, {token, expiresAt}>` — 45 s TTL on success, 30 s sentinel `__FAILED__` on failure (avoids hammering Azure).
- `deptUsersCache` (via `globalThis.__pmDeptUsersCache`) — 60 s TTL.
- `adminCyclesCache` (via `globalThis.__pmAdminCycles`) — 15 s TTL.
- `dashboardCache: Map<email, {assignments, expiresAt}>` — 10 s TTL (the critical optimisation: 6 calls instead of 6×N).

Exports:
- `getServiceToken()`
- `getAdminCycles(serviceToken)`
- `decodeUserId(jwt)` — base64-decodes the JWT payload without verifying.
- `fetchAllAssignments(serviceToken)` — flat dedup'd list across all dept users.
- `fetchSessionsForCycle(cycleId, serviceToken)` — single-cycle filter.
- `fetchAllSessionsByCycle(serviceToken)` — `Map<cycleId, DeptSession[]>`.
- `getSessionForPM(sessionId, serviceToken)` — finds owner via aggregator, logs in as them, fetches `GET /department/sessions/{id}`, and enriches `department_name`/`department_code`/`cycle_name` because the backend stores `"Unknown"` in those fields.
- `buildStats(sessions)` — `total/submitted/reviewed/approved/in_progress/not_started/completion_rate`.

### `cycles/route.ts` — `GET /api/pm/cycles`
1. Decodes the PM user_id from their JWT.
2. Pulls all admin cycles (cached).
3. Filters to active cycles where `project_manager_id === pmUserId`.
4. Aggregates real sessions via `fetchAllSessionsByCycle`.
5. Walks every session to compute `pending_reviews` (`submitted` + `reviewed` count) and `recent_submissions` (sorted newest-first, capped at 10).
6. Returns a shape matching the legacy `PMDashboard` contract (`active_cycles`, `pending_reviews`, `recent_submissions`).

### `cycles/[cycleId]/route.ts` — `GET /api/pm/cycles/{cycleId}`
Returns `{ success, cycle, stats, departments[] }` for a single cycle. Departments come from the aggregator (the backend can't supply them).

### `cycles/[cycleId]/full-report/route.ts`
Assembles the entire annual report as Markdown by impersonating each dept user and pulling `final_submission` / `ai_generated_draft`. The backend's own `POST /pm/cycles/{id}/generate-report` returns only a ~1 000-char preview; this route gives the full document.

### `sessions/[sessionId]/route.ts` — `GET /api/pm/sessions/{sessionId}`
Auth-gates the PM, then resolves the session via `getSessionForPM` (impersonating the dept owner).

---

## 10. TanStack Query Hooks (`hooks/*`)

Conventions:
- Query keys are tuples; the canonical set is also exported as `QUERY_KEYS` in `lib/constants.ts`.
- Mutations call `qc.invalidateQueries` for affected keys and toast success/failure (some leave toasts to the form when an inline error is preferred).
- `staleTime: 0` + `refetchInterval` is used wherever the UI needs to reflect server-side work (sessions appearing post-activation, dept submissions, etc.).

### `useUsers.ts`
- `useUsers(filters)` → `["users", filters]`
- `useUserStats()`, `useAdminStats()`
- `useCreateUser`, `useUpdateUser`, `useActivateUser`, `useDeleteUser`

### `useDepartments.ts`
- `useDepartments()` → `["departments"]`
- `useDepartment(id)` → `["department", id]` (no retry)
- `useCreateDepartment`, `useUpdateDepartment`, `useAssignUsersToDepartment`

### `useCycles.ts`
- `useCycles(status?)`, `useCycle(id)`
- `useCycleOverview(id)` — `staleTime:0` + `refetchInterval:15_000` (poll because session creation after activation is async on the backend)
- `useCreateCycle`, `useUpdateCycle`, `useUploadKickoffDocs`, `useAssignDepartments`, `useDeleteCycle`, `useActivateCycle`

### `useSessions.ts` — the densest file
- `useDepartmentDashboard()` → `["dept","dashboard"]`
- `useSession(id)` — dept-scoped fetch (`/department/sessions/{id}`)
- `usePMSession(id)` — PM-scoped fetch via the impersonation proxy
- `useSubmitAnswers`, `useGenerateDraft`, `useFinalizeSession`, `useAdjustTone`
- `usePMDashboard()` — also handles backend `404` ("PM has no active cycles") by returning an empty payload. Polls every 5 s.
- `usePMCycleDashboard(cycleId)` — same 5 s poll.
- `useSubmitKickoff`, `useUploadKickoffDoc`
- `useReviewSession`, `useSendReminder`, `useBulkReminder`
- `useGenerateReport`
- `useCreateEscalation`, `useEscalations(cycleId)`

`useSubmitAnswers` and `useFinalizeSession` invalidate `["pm"]` broadly so the PM dashboard reflects the change without a full reload.

---

## 11. Design System — `components/ui/*`

These follow shadcn/ui's pattern: a thin Radix wrapper styled with Tailwind and `class-variance-authority` (`cva`) for variants. All accept a `className` and `forwardRef` where applicable.

| File | Purpose |
|------|---------|
| `avatar.tsx` | Radix Avatar (Image + Fallback) |
| `badge.tsx` | `default \| secondary \| destructive \| outline` |
| `button.tsx` | Variants: `default \| destructive \| outline \| secondary \| ghost \| link`. Sizes: `default \| sm \| lg \| icon` |
| `confirm-dialog.tsx` | Pre-styled destructive confirm dialog |
| `data-table.tsx` | Generic `<DataTable<T>>` with `columns: Column<T>[]`, skeleton rows, empty state, **optional pagination** (first/prev/next/last) |
| `dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tabs.tsx` | Radix wrappers |
| `empty-state.tsx` | Centered icon + title + description + action |
| `input.tsx`, `label.tsx`, `textarea.tsx`, `separator.tsx`, `progress.tsx` | Form & layout primitives |
| `page-header.tsx` | `<h1>` + description + right-aligned action slot |
| `stats-card.tsx` | Number tile used on dashboards (icon, title, value, description) |
| `status-badge.tsx` | Coloured pill driven by `SESSION_STATUSES`, `CYCLE_STATUSES`, `USER_STATUSES` (from `lib/constants.ts`) — pass `variant="cycle" \| "session" \| "user"` |
| `skeletons.tsx` | `PageSkeleton`, `AuthSkeleton`, plus inline shimmer placeholders |
| `table.tsx` | Plain HTML-table primitives used by `data-table.tsx` |

### `lib/utils.ts`
- `cn(...inputs)` — `clsx` + `tailwind-merge`
- `formatDate(iso)` → `"Mar 16, 2026"`
- `formatDateTime(iso)` → `"Mar 16, 2026, 02:08 AM"`
- `formatFileSize(bytes)` → `"512 B" / "1.4 KB" / "2.3 MB"`
- `getInitials(name)` → first two upper-cased initials

### `lib/constants.ts`
- `SESSION_STATUSES`, `CYCLE_STATUSES`, `USER_STATUSES` — `{ label, color }` per status
- `USER_ROLES` — display labels
- `TONE_OPTIONS` — Executive / Professional / Technical / Conversational / Formal (each with a short description)
- `QUERY_KEYS` — canonical TanStack-Query key registry

---

## 12. Operational Workflow (end-to-end)

```
ADMIN
 ├─ Create departments              (/admin/departments)
 │   each department also stores
 │   initial_prompt + system_prompt
 │   that configure its AI agent
 ├─ Create / activate users         (/admin/users)
 │   create() = /auth/register
 │             + /admin/users/{id}/activate
 ├─ Create a cycle                  (/admin/cycles/new)
 │   captures name, FY, dates,
 │   deadline, assigned PM
 ├─ On the cycle detail page        (/admin/cycles/{id})
 │   – Assign departments + responsible users
 │   – Upload kickoff docs (multipart, PDF/DOCX/TXT)
 │   – Edit cycle metadata
 └─ Click "Activate Cycle"          (/admin/cycles/{id}/activate)
     – pre-activation checklist
     – calls POST /admin/cycles/{id}/activate
     – backend asynchronously creates one
       Session per department; the activate
       page polls (`useCycleOverview`, 15 s)
       to reflect new sessions

PROJECT MANAGER
 ├─ /pm                             dashboard, polled every 5 s
 ├─ /pm/cycles/{id}                 cycle workspace
 │   – submit kickoff brief (text)  POST /pm/kickoff
 │     or upload a brief doc        POST /pm/kickoff/upload
 │   – send reminders (bulk or per-row)
 │   – raise escalations            POST /pm/escalations
 │   – generate a consolidated      POST /pm/cycles/{id}/generate-report
 │     report (with selected
 │     sessions or all approved)
 │   – download full report         GET  /api/pm/cycles/{id}/full-report
 │                                  (assembled client-side from real
 │                                   session content)
 └─ /pm/sessions/{id}               review one submission
     – view answers and draft (tabs)
     – mark reviewed / approved /
       rejected / reopened          POST /pm/sessions/{id}/review

DEPARTMENT USER
 ├─ /department                     "My Sessions" inbox
 ├─ /department/sessions/{id}       authoring workspace
 │   – answer Qs one-by-one or in overview
 │   – save (autosave) and submit answers
 │   – get an AI suggestion per Q
 │   – converse with the agent against an answer
 │   – upload evidence documents
 └─ /department/sessions/{id}/draft draft & finalise
     – generate / regenerate draft  POST /department/sessions/{id}/generate-draft
     – preview rendered HTML/MD
     – adjust tone                  POST /department/sessions/{id}/adjust-tone
                                    (TONE_OPTIONS in constants.ts)
     – finalise                     POST /department/sessions/{id}/finalize
       → status becomes "submitted" → enters PM review pool
```

---

## 13. Page-by-Page Reference

### Public

| Route | File | Purpose |
|-------|------|---------|
| `/login` | `app/(public)/login/page.tsx` | Email + password, RHF + Zod, password-visibility toggle, "Forgot password?" link. Redirects to role home on success. |
| `/forgot-password` | `app/(public)/forgot-password/page.tsx` | Email-only form → `requestPasswordReset`. Success state shows "Check your inbox". |
| `/reset-password` | `app/(public)/reset-password/page.tsx` | Token + new password → `confirmPasswordReset`. |

### Profile

| Route | Purpose |
|-------|---------|
| `/profile` | View name/email/role/department; change password (current + new + confirm, Zod-validated). |

### Admin

| Route | File | What it does |
|-------|------|--------------|
| `/admin` | `admin/page.tsx` | Dashboard. Stats (users / pending activation / departments / active cycles), "Requires your attention" banner (pending users + draft cycles), per-cycle progress bars colour-coded by completion (red < 30 %, amber 30–70 %, green ≥ 70 %), user-role breakdown (3 columns), 3 quick-action cards. |
| `/admin/departments` | `admin/departments/page.tsx` | Table of departments with a "System" vs "Custom" pill (system inferred from earliest `created_at`). Modal create form: code (≤ 10, upper-cased), name, description, **initial_prompt** + **system_prompt** (≥ 10 chars — these configure the dept's AI agent). |
| `/admin/departments/[id]` | `admin/departments/[id]/page.tsx` | Department detail. Inline-edit name + description. Edit the agent persona (initial + system prompts). List of assigned users. Error-state banner with Try Again. |
| `/admin/users` | `admin/users/page.tsx` | Paginated user table (filters: role, status, search). Modal create (`/auth/register` + auto-activate). Modal edit. Delete with `<ConfirmDialog>`. Activate pending users. |
| `/admin/cycles` | `admin/cycles/page.tsx` | Cycles table — name + FY, PM, deadline, progress bar with completion %, status badge, View action. |
| `/admin/cycles/new` | `admin/cycles/new/page.tsx` | RHF + Zod form (`cycle_name`, `fiscal_year`, `start_date`, `end_date`, `submission_deadline`, `project_manager_id` from `useUsers({role:"project_manager", status:"active"})`, `kickoff_brief`). Defaults `fiscal_year` to current year. |
| `/admin/cycles/[id]` | `admin/cycles/[id]/page.tsx` | Cycle workspace. Header actions: Upload Docs, Edit, Activate (if draft). For draft / 0-sessions cycles shows an **Assign Departments** section (search + add a department row → assign one dept user per row → Save). For active cycles with sessions: shows the session table from `useCycleOverview()` (which polls every 15 s while async session generation runs). Edit dialog is auto-opened when redirected from the activate page's "Fix" buttons via `?editCycle=1`. Tolerates the documented backend response-serialisation bug on `assignDepartments` (DB write succeeded; we proceed anyway). |
| `/admin/cycles/[id]/activate` | `admin/cycles/[id]/activate/page.tsx` | Pre-activation checklist (PM assigned ✓, deadline set ✓, timeline set ✓, departments assigned). Calls `activate(id, generateQuestions=false)` (false here because PM submits the kickoff brief which then triggers question generation). Success screen explains the next steps. |
| `/admin/documents`, `/admin/conversations`, `/admin/agents` | placeholder empty-state pages |

### PM

| Route | File | What it does |
|-------|------|--------------|
| `/pm` | `pm/page.tsx` | Pending-reviews alert, 3 stat cards, per-cycle cards with deadline + colour-coded progress + status breakdown (submitted / in progress / not started), recent submissions feed with quick-review links. |
| `/pm/cycles` | `pm/cycles/page.tsx` | List of all active cycles assigned to this PM. Renders an explanatory Info card when empty (most common reason: admin hasn't activated yet). Tolerates either `active_cycles` or `cycles` keys in the response. |
| `/pm/cycles/[id]` | `pm/cycles/[id]/page.tsx` | The PM cycle workspace — see "PROJECT MANAGER" in §12. Includes a kickoff-brief dialog (text or doc upload), per-row reminder + escalation dialogs, a bulk reminder dialog, and a Generate-Report dialog where the PM can pick "all approved" or hand-pick session IDs. ~1 200 lines, largest single page in the codebase. |
| `/pm/reviews` | `pm/reviews/page.tsx` | Flat list of "needs review" sessions from `usePMDashboard().recent_submissions`. |
| `/pm/sessions/[id]` | `pm/sessions/[id]/page.tsx` | Read-only session view (answers tab + draft tab) with the four review actions: `reviewed`, `approved`, `rejected`, `reopened`. PM can act when status is `submitted` or `reviewed`. |
| `/pm/documents`, `/pm/conversations`, `/pm/agents` | placeholder empty-state pages |

### Department

| Route | File | What it does |
|-------|------|--------------|
| `/department` | `department/page.tsx` | "My Report Sessions" cards. Each card has a coloured border (red overdue, amber reopened, green approved). Shows progress + deadline + a CTA that adapts to status (Start / Continue / Revise / Submitted-waiting / Approved). Reads `data?.assignments` (the new contract; old `active_sessions` is gone). |
| `/department/sessions/[id]` | `department/sessions/[id]/page.tsx` | Authoring workspace (~790 lines). Question-by-question or overview layout. Autosave debounce. Per-question AI suggestion + a chat panel that creates a conversation per session (via `chatApi.createConversation`) and sends messages bound to the current Q. Evidence upload via `departmentApi.uploadDocument`. The workspace can hide the main app sidebar via a custom event so it has more horizontal real-estate. Defines an `extractContent(res)` helper that only looks at explicit field names (so the AI parsing never accidentally echoes the question text back). |
| `/department/sessions/[id]/draft` | `department/sessions/[id]/draft/page.tsx` | Generate the draft. Toggle between Markdown source and rendered preview (HTML detection via regex; markdown via `react-markdown`). Tone adjuster: 5 buttons (`executive / professional / technical / conversational / formal`). Finalise with a `<ConfirmDialog>` → `final_content` is locked in and status becomes `submitted`. Shows the post-submission state with a different success card when the session is already approved. |
| `/department/documents`, `/department/conversations`, `/department/agents` | placeholder empty-state pages |

---

## 14. Cross-Cutting Patterns & Conventions

### Server-side polling
React Query is the authoritative source of truth, and we poll where the backend's async work could land between user actions:
- `useCycleOverview` — 15 s (post-activation session creation)
- `usePMDashboard`, `usePMCycleDashboard` — 5 s (dept submissions appearing for the PM)

### Multipart uploads
Every multipart endpoint deletes the Axios instance-level `Content-Type` default (`{ headers: { "Content-Type": undefined } }`) so Axios can set the boundary from the `FormData`. All raise the timeout to 120 s because the backend extracts text + creates vector chunks.

### Backend quirks handled by the frontend
- `Department.id` vs `Department.department_id` — every call site uses a `getDeptKey()` helper or the `??` fallback.
- `Cycle.id` vs `Cycle.cycle_id` in the create response — handled in `/admin/cycles/new`.
- PM dashboard endpoint returns empty departments → replaced entirely by `/api/pm/*` proxies.
- `session.department_name === "Unknown"` → enriched in `getSessionForPM`.
- `assignDepartments` response-serialisation error → caught silently because the DB write actually succeeded.
- `404` on the PM dashboard means "no active cycles" → mapped to an empty payload, not an error.

### Error normalisation
`client.ts` produces `{error, message, status, details}` regardless of FastAPI's variant response shapes (`message`, `detail` string, `detail` array of `{msg}`). Hooks always toast `err?.message || "Failed to …"`. Forms that want inline errors (e.g. user creation) skip the hook's toast and read the same field manually.

### Optimistic UX
The codebase prefers polling + invalidation over optimistic updates (per the comments in `useSessions.ts`, things like dept-submission visibility are critical and the team would rather pay the round-trip).

### CSS theming
- HSL CSS variables defined in `app/globals.css` (`--background`, `--primary`, `--muted`, …).
- Tailwind config maps them: `bg-primary`, `text-foreground`, etc.
- `darkMode: "class"` is configured but the app currently runs light-only.
- `@tailwindcss/typography` powers the markdown preview on the draft page.

### File-path alias
`tsconfig.json` maps `@/*` to the repo root. All in-app imports use `@/components/...`, `@/lib/...`, etc.

---

## 15. Build & Run

```bash
# install
npm install

# local dev (default port 3000)
npm run dev

# production build + serve
npm run build
npm run start

# lint (ESLint 9 flat config + next/core-web-vitals)
npm run lint
```

Required `.env.local` (minimum):

```env
NEXT_PUBLIC_API_BASE_URL=https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1
NEXT_PUBLIC_APP_NAME=Spark Annual Report AI Studio

# Server-side only — required for /api/pm/* proxies to function
ADMIN_SERVICE_EMAIL=...
ADMIN_SERVICE_PASSWORD=...
DEPT_USER_DEFAULT_PASSWORD=...   # optional; falls back to ADMIN_SERVICE_PASSWORD
```

The repo includes a `.vercel/` directory and the project is wired for Vercel deployment.

---

## 16. Quick Reference — Where Things Live

| Need | File |
|------|------|
| Add a new domain type | `types/index.ts` |
| Add an API endpoint | `lib/api/<module>.ts` (+ types in the same file) |
| Wrap it in a query/mutation | `hooks/use<Resource>.ts` (+ key in `lib/constants.ts → QUERY_KEYS`) |
| Add a UI primitive | `components/ui/<name>.tsx` |
| Add an authenticated page | `app/(protected)/<role>/.../page.tsx` |
| Tweak the role-routing map | `contexts/AuthContext.tsx::ROLE_ROUTES` + `components/auth/RouteGuard.tsx` |
| Adjust nav | `components/layout/Sidebar.tsx::ADMIN_NAV / PM_NAV / DEPT_NAV` |
| Status colours | `lib/constants.ts::SESSION_STATUSES / CYCLE_STATUSES / USER_STATUSES` |
| Tone presets | `lib/constants.ts::TONE_OPTIONS` |
| Add a Next.js server-side proxy | `app/api/pm/...` (use helpers from `_sessionAggregator.ts`) |
| Tweak Axios behaviour (timeouts, headers, refresh) | `lib/api/client.ts` |
| Theme tokens / dark-mode HSL vars | `app/globals.css` (paired with `tailwind.config.ts`) |
