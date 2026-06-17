import { Button } from "@/components/ui/button"
import { Sparkles, ArrowLeft, ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { centriyonLoginUrl } from "@/lib/centriyon"

export default function ForgotPasswordPage() {
  const loginUrl = centriyonLoginUrl()

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border bg-card shadow-xl p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Password reset</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Password reset is handled through the Centriyon platform.
          </p>
        </div>

        <a href={loginUrl} className="block">
          <Button className="w-full">
            Go to Centriyon
            <ArrowUpRight className="ml-1.5 h-4 w-4" />
          </Button>
        </a>

        <Link
          href="/login"
          className="mt-4 flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Sign In
        </Link>
      </div>
    </div>
  )
}
