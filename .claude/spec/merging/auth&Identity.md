# Part 2 — Auth & Identity
## SAR Frontend Spec for Claude Code

---

### Context

SAR's backend login and register endpoints now return 410. All authentication
goes through Centriton. When a user wants to access SAR, Centriton will open
SAR in a new tab passing the Centriton JWT via a URL query parameter:

```
https://sar.domain.com?token=<centriton_jwt>
```

SAR's frontend must:
1. Accept the Centriton JWT from the URL on first load and store it
2. Use that token for all subsequent API calls
3. Replace the login/register pages with "use Centriton" messages
4. When the token expires and cannot be refreshed, redirect to Centriton login

**Tech stack:** Next.js 16 App Router, TypeScript strict, TanStack Query,
Axios singleton in `lib/api/client.ts`, auth in `contexts/AuthContext.tsx`.

---

### New Environment Variable

Add to `.env.example` and `.env.local`:

```env
NEXT_PUBLIC_CENTRITON_URL=http://localhost:8080
```

This is the URL of the Centriton frontend. SAR uses it to redirect users to
Centriton login when their token expires or is missing.

---

### Files to Change

| File | Change type |
|---|---|
| `.env.example` | Add `NEXT_PUBLIC_CENTRITON_URL` |
| `app/page.tsx` | Handle `?token=` param before redirecting |
| `app/(public)/login/page.tsx` | Replace login form with "use Centriton" message |
| `app/(public)/forgot-password/page.tsx` | Replace with redirect to Centriton |
| `app/(public)/reset-password/page.tsx` | Replace with redirect to Centriton |
| `contexts/AuthContext.tsx` | Add `loginWithToken()`, update `logout()` |
| `lib/api/client.ts` | Update 401 handler to redirect to Centriton |
| `components/providers.tsx` | Token ingestion on app mount |

---

### Change 1 — `app/page.tsx`

Currently: hard redirect `/` → `/login`

New logic:

```ts
// app/page.tsx (server component)
import { redirect } from "next/navigation"

export default function RootPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  if (searchParams.token) {
    // Pass token to a client component that stores it
    // then redirect to role home
    redirect(`/auth/token?token=${searchParams.token}`)
  }
  redirect("/login")
}
```

This requires a new page at `app/auth/token/page.tsx` — see Change 2.

---

### Change 2 — `app/auth/token/page.tsx` (new file)

Client component. Its only job is to receive the Centriton JWT from the URL,
store it, call `/auth/me` to get the user, and redirect to the correct role
home. This runs once per token passthrough from Centriton.

```tsx
"use client"

import { useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"

export default function TokenPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { loginWithToken } = useAuth()

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      router.replace("/login")
      return
    }
    loginWithToken(token).catch(() => {
      router.replace("/login")
    })
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Signing you in…</p>
    </div>
  )
}
```

---

### Change 3 — `contexts/AuthContext.tsx`

Add `loginWithToken(token: string): Promise<void>`:

```ts
const ROLE_ROUTES: Record<string, string> = {
  admin:             "/admin",
  project_manager:   "/pm",
  department_user:   "/department",
}

const loginWithToken = async (token: string): Promise<void> => {
  // Store token immediately so Axios attaches it to the /auth/me call
  localStorage.setItem("access_token", token)
  // Do NOT store a refresh_token — Centriton tokens are not refreshed by SAR
  localStorage.removeItem("refresh_token")

  // Hydrate user from the backend (verifies the token is valid)
  const user = await authApi.me()
  setUser(user)
  setIsAuthenticated(true)

  // Route to the correct role home
  const dest = ROLE_ROUTES[user.role] ?? "/login"
  router.push(dest)
}
```

Update `logout()` to redirect to Centriton login instead of SAR login:

```ts
const logout = async (): Promise<void> => {
  try {
    await authApi.logout()
  } catch {}
  localStorage.removeItem("access_token")
  localStorage.removeItem("refresh_token")
  setUser(null)
  setIsAuthenticated(false)
  // Redirect to Centriton, not SAR login
  const centritonUrl = process.env.NEXT_PUBLIC_CENTRITON_URL ?? ""
  window.location.href = `${centritonUrl}/login`
}
```

Expose `loginWithToken` from `useAuth()`.

---

### Change 4 — `lib/api/client.ts`

The current 401 interceptor attempts a token refresh. Since SAR no longer
issues its own tokens, there is no refresh token to use. Update the interceptor:

**Current behaviour on 401:**
1. If `isRefreshing`, queue the request
2. POST to `/auth/refresh` with the refresh_token
3. On success: replay the original request with the new token
4. On failure: clear tokens, redirect to `/login`

**New behaviour on 401:**
1. If the failed request IS `/auth/refresh` or `/auth/login` — skip (avoid loop)
2. Otherwise: clear tokens and redirect to Centriton login

```ts
// In the response interceptor, replace the refresh logic:

if (error.response?.status === 401) {
  const isAuthEndpoint =
    error.config?.url?.includes("/auth/refresh") ||
    error.config?.url?.includes("/auth/login")

  if (!isAuthEndpoint) {
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    const centritonUrl = process.env.NEXT_PUBLIC_CENTRITON_URL ?? ""
    window.location.href = `${centritonUrl}/login`
  }
}
```

Remove the `isRefreshing` / `failedQueue` single-flight refresh logic entirely —
it is no longer needed.

---

### Change 5 — `app/(public)/login/page.tsx`

Replace the login form entirely. Do not remove the route — it is still the
fallback page SAR routes to when unauthenticated, and users may land here
directly.

New content:

```tsx
export default function LoginPage() {
  const centritonUrl = process.env.NEXT_PUBLIC_CENTRITON_URL ?? "#"

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8 text-center">
      {/* App logo / branding */}
      <div>
        <h1 className="text-2xl font-semibold">Spark Annual Report Studio</h1>
        <p className="text-muted-foreground mt-2">
          Sign in is managed through the Centriton platform.
        </p>
      </div>

      <a href={`${centritonUrl}/login`}>
        <Button className="w-full">
          Go to Centriton Login
        </Button>
      </a>

      <p className="text-sm text-muted-foreground">
        Your Centriton session gives you access to both platforms.
        No separate password needed.
      </p>
    </div>
  )
}
```

---

### Change 6 — `app/(public)/forgot-password/page.tsx`

Replace with a redirect to Centriton:

```tsx
export default function ForgotPasswordPage() {
  const centritonUrl = process.env.NEXT_PUBLIC_CENTRITON_URL ?? "#"
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-muted-foreground">
        Password reset is handled through the Centriton platform.
      </p>
      <a href={`${centritonUrl}/login`}>
        <Button variant="outline">Go to Centriton</Button>
      </a>
    </div>
  )
}
```

Apply the same treatment to `app/(public)/reset-password/page.tsx`.

---

### Change 7 — `components/auth/RouteGuard.tsx`

No structural changes needed. The RouteGuard already redirects to `/login`
when unauthenticated, and `/login` now shows the "use Centriton" message.

One addition: if the URL contains `?token=`, do NOT redirect to `/login` —
let the root page handler process the token first. Check for the token param
before the unauthenticated redirect:

```ts
// At the top of RouteGuard, before any redirects:
const searchParams = useSearchParams()
if (searchParams.get("token")) {
  // Token passthrough in progress — don't redirect
  return <AuthSkeleton />
}
```

---

### What NOT to Change

- Role-based routing (`ROLE_ROUTES`) — keep as-is
- `RouteGuard` allowed roles logic — keep as-is
- TanStack Query hooks — no changes needed
- Any page beyond the auth pages — the rest of SAR's workflow is untouched
- `authApi.me()` — keep as-is, SAR still calls `/auth/me` to hydrate the user
- `Can.tsx` component — keep as-is

---

### Done Criteria

1. Opening `https://sar.domain.com?token=<centriton_jwt>` stores the token,
   calls `/auth/me`, and redirects to the correct role home (`/admin`, `/pm`,
   or `/department`)
2. Subsequent page loads use the stored token with no re-authentication
3. `GET /admin` with a valid admin token → loads the admin dashboard
4. `GET /pm` with a valid project_manager token → loads the PM dashboard
5. `GET /department` with a valid department_user token → loads the dept dashboard
6. Token expiry (401 on any request) clears localStorage and redirects to
   `{CENTRITON_URL}/login` — NOT to SAR `/login`
7. Navigating directly to SAR `/login` shows the "Go to Centriton Login"
   message, not a login form
8. SAR logout redirects to `{CENTRITON_URL}/login`
9. The refresh-token interceptor is removed — no attempt to call `/auth/refresh`
   with a Centriton token