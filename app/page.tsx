import { redirect } from "next/navigation"

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (token) {
    redirect(`/auth/token?token=${encodeURIComponent(token)}`)
  }
  redirect("/login")
}
