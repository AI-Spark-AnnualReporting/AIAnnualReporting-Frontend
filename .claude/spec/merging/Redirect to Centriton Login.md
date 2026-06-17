
# SAR Logout — Redirect to Centriton Login

## Scope

When a user logs out from SAR, they must be redirected to Centriton's login page — not SAR's own login (which is deprecated since Part 2).

## Implementation

### File: SAR frontend — wherever the logout function is defined

This is likely in `app/context/AuthContext.tsx` or a similar auth hook.

Find the existing `logout()` function. After clearing the local token and user state, replace whatever navigation happens at the end with a hard redirect to Centriton's login page.

```ts
const logout = () => {
  // Clear local storage
  localStorage.removeItem("sar_token")
  localStorage.removeItem("centriton_token")  // also clear shared token if stored
  
  // Clear context state
  setUser(null)
  setToken(null)
  
  // Hard redirect to Centriton login (not SAR's)
  const centritonUrl = (process.env.NEXT_PUBLIC_CENTRITON_URL ?? "").replace(/\/+$/, "")
  if (centritonUrl) {
    window.location.href = `${centritonUrl}/login`
  } else {
    // Fallback to SAR login if env var missing (shouldn't happen in production)
    router.push("/login")
  }
}
```

### Env var

Make sure `NEXT_PUBLIC_CENTRITON_URL` is set in SAR's `.env.local`:

```env
NEXT_PUBLIC_CENTRITON_URL=http://localhost:5173
```

For production point at the deployed Centriton URL.

This was added in Part 2 — confirm it's still there. If missing, add it.

### Also update SAR's 401 interceptor

When a request returns 401 (token expired or invalid), the user should also bounce to Centriton login — same destination. The 401 handler was set up in Part 2, but confirm it points to `${CENTRITON_URL}/login`, not SAR's `/login`.

## Done Criteria

1. Clicking logout in SAR redirects to Centriton's login page
2. Local storage is cleared before redirect (no stale tokens)
3. 401 responses also bounce to Centriton login, not SAR login
4. After logging back in via Centriton, PM/dept_user gets redirected to SAR (the existing Centriton redirect flow)
5. The redirect uses `NEXT_PUBLIC_CENTRITON_URL` env var, never a hardcoded URL

---

That's the SAR side. Once Centriton's frontend redirect (Part 6 redirect plan) and this SAR logout change are both done, the login/logout flow is fully unified:

- Login on Centriton → PM/dept auto-redirected to SAR
- Logout on SAR → bounced back to Centriton login
- Token expiry on SAR → also bounced to Centriton login
- All admin and IR work stays on Centriton

