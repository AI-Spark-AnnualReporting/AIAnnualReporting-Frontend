# Spark Annual Report AI Studio — Frontend

A production-grade, AI-powered annual-report generation platform built with Next.js 16 (App Router), TypeScript (strict), TailwindCSS v4, and shadcn/ui.

> **Single source of truth:** see [`FRONTEND_DOCUMENTATION.md`](./FRONTEND_DOCUMENTATION.md).
> It covers every page, every API call, every hook, the Report Builder pipeline (Resolve → Plan → Build → Assemble → Render), the section data model, the Next.js proxy layer, and the operational workflow end-to-end.

---

## Quick Start

```bash
npm install
cp .env.example .env.local
# edit .env.local — at minimum:
#   NEXT_PUBLIC_API_BASE_URL=https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1
#   NEXT_PUBLIC_APP_NAME=Spark Annual Report AI Studio
#   NEXT_PUBLIC_CENTRITON_URL=http://localhost:8080   # Centriyon SSO (login / logout / 401 redirect)
#   ADMIN_SERVICE_EMAIL=...          # server-only, for /api/pm/* proxies
#   ADMIN_SERVICE_PASSWORD=...
#   DEPT_USER_DEFAULT_PASSWORD=...   # optional; falls back to ADMIN_SERVICE_PASSWORD
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev`   | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint`  | ESLint flat config + `next/core-web-vitals` |
| `npx tsc --noEmit` | Type check (no script alias) |

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | TailwindCSS v4 + shadcn/ui (Radix) |
| Server state | TanStack Query |
| Forms | React Hook Form + Zod |
| HTTP | Axios (Centriyon JWT; 401 → Centriyon login redirect) |
| Icons | Lucide React |
| Toasts | Sonner |
| Auth | Centriyon SSO — receives JWT via `?token=` on root; no refresh token |
| DnD | `@dnd-kit/core` + `@dnd-kit/sortable` (plan reorder) |
| Markdown | `react-markdown` |
| Drag-and-drop upload | `react-dropzone` |

## Roles

| Role | Default route after login | Access |
|------|---------------------------|--------|
| `admin` | `/admin` | Full system |
| `project_manager` | `/pm` | Cycle ops + Report Builder + reviews |
| `department_user` | `/department` | Assigned sessions only |

## Operational Workflow (one-line)

```
Admin creates departments/users/cycle (with profile)
  → admin assigns departments + activates cycle
  → PM submits kickoff brief → AI generates per-department questions
  → departments answer + draft + finalize ("submitted")
  → PM reviews/approves each session
  → PM opens Report Builder (gated on every department approved):
       Plan Review → Builder Shell → Assemble → Final Report → Download DOCX
```

## Key Concepts (one-screen mental model)

- **Sections** are the unit of the final report. Each row has four facets:
  - `mode` ∈ `generate | attach | auto` (how content is produced)
  - `layer` ∈ `common | cma | sector | optional` (why it's required)
  - `status` ∈ `pending | drafting | locked`
  - `ai_allowed` (if false → manual section)
- **Plan** = AI-generated `{headline, themes[], feeders[]}` that the PM reviews and edits.
- **Feeder** = which approved department session(s) supply content for a `generate`-mode section.
- **Assemble** = stitch all locked sections + cover + executive summary into a `FinalReport`.
- **Render** = export `FinalReport` to DOCX (PDF planned).

## Build

```bash
npm run build
npm run start
```

For everything else — pages, endpoints, hooks, types, conventions — read [`FRONTEND_DOCUMENTATION.md`](./FRONTEND_DOCUMENTATION.md).
