import { redirect } from "next/navigation"

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string
    next?: string
    company?: string
    back?: string
  }>
}) {
  const { token, next, company, back } = await searchParams
  if (token) {
    // Forward everything: /auth/token is the only page that consumes the
    // handoff, so anything dropped here is lost for good.
    const qs = new URLSearchParams({ token })
    if (next) qs.set("next", next)
    if (company) qs.set("company", company)
    if (back) qs.set("back", back)
    redirect(`/auth/token?${qs.toString()}`)
  }
  redirect("/login")
}
