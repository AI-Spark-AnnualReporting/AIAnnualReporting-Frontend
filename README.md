# Spark Annual Report AI Studio

A production-ready, AI-powered annual report generation platform built with Next.js 14 App Router, TypeScript, TailwindCSS, and shadcn/ui.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | TailwindCSS + shadcn/ui |
| Server State | TanStack Query (React Query) |
| Forms | React Hook Form + Zod |
| HTTP Client | Axios (with JWT auto-refresh) |
| Icons | Lucide React |
| Notifications | Sonner |
| Auth | JWT (access + refresh tokens) |

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1
NEXT_PUBLIC_APP_NAME=Spark Annual Report AI Studio
```

### 3. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
spark-ar-studio/
├── app/
│   ├── (public)/           # Unauthenticated pages
│   │   ├── login/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   └── (protected)/        # Auth-gated pages
│       ├── admin/          # Admin module (M1, M2, M3)
│       │   ├── departments/
│       │   ├── users/
│       │   ├── cycles/
│       │   │   ├── new/
│       │   │   └── [id]/activate/
│       │   ├── documents/
│       │   ├── conversations/
│       │   └── agents/
│       ├── pm/             # PM module (M5)
│       │   ├── cycles/[id]/
│       │   └── sessions/[id]/
│       ├── department/     # Department module (M4)
│       │   ├── sessions/[id]/
│       │   │   └── draft/
│       │   ├── documents/
│       │   ├── conversations/
│       │   └── agents/
│       └── profile/
├── components/
│   ├── auth/               # RouteGuard, Can (RBAC)
│   ├── layout/             # Sidebar, TopNav
│   └── ui/                 # Design system components
├── contexts/
│   └── AuthContext.tsx     # JWT auth + role routing
├── hooks/                  # TanStack Query hooks
│   ├── useUsers.ts
│   ├── useDepartments.ts
│   ├── useCycles.ts
│   └── useSessions.ts
├── lib/
│   ├── api/                # Typed API client
│   │   ├── client.ts       # Axios + 401 refresh interceptor
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── departments.ts
│   │   ├── cycles.ts
│   │   ├── pm.ts
│   │   ├── department.ts
│   │   └── knowledge-base.ts
│   ├── constants.ts        # Status maps, query keys, tone options
│   └── utils.ts            # cn, formatDate, getInitials
└── types/
    └── index.ts            # All TypeScript types
```

## Role-Based Access

| Role | Default Route | Access |
|------|--------------|--------|
| `admin` | `/admin` | Full system |
| `project_manager` | `/pm` | Cycles, reviews, reports |
| `department_user` | `/department` | Assigned sessions only |

## Operational Workflow

```
Admin creates departments
    → Creates/activates users
    → Creates cycle (sets PM, dates)
    → Uploads kickoff documents
    → Activates cycle (selects departments)
         → AI generates 10-15 questions per department
         → Sessions created for each department

Department User
    → Sees session on dashboard
    → Answers questions (or gets AI suggestions)
    → Generates AI draft
    → Adjusts tone (Executive/Professional/Technical/Conversational/Formal)
    → Finalizes & submits

PM
    → Monitors completion on cycle dashboard
    → Reviews submitted sessions (approve/reject/reopen)
    → Sends reminders to lagging departments
    → Generates consolidated final report
```

## Key Components

### Authentication
- `AuthContext` — JWT login/logout, `/me` endpoint, role-based routing
- `RouteGuard` — Protects pages, shows auth skeleton (no flash)
- `Can` — Component-level RBAC: `<Can role="ADMIN">...</Can>`

### Data Fetching
All server state uses TanStack Query with structured query keys:

```ts
useUsers(filters)        → ["users", filters]
useDepartments()         → ["departments"]
useCycles(status)        → ["cycles", { status }]
useCycle(id)             → ["cycle", id]
useCycleOverview(id)     → ["cycle", id, "overview"]
useSession(id)           → ["session", id]
usePMDashboard()         → ["pm", "dashboard"]
useDepartmentDashboard() → ["dept", "dashboard"]
```

### API Client
`lib/api/client.ts` — Axios instance with:
- Automatic `Bearer` token injection
- Single retry on 401 → refresh token → retry original request
- Hard logout if refresh fails
- Normalized error format

## API Base URL

```
https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API base URL |
| `NEXT_PUBLIC_APP_NAME` | App display name |

## Build

```bash
npm run build
npm run start
```
