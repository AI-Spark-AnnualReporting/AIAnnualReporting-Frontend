import { Button } from "@/components/ui/button"
import { Sparkles, ArrowUpRight } from "lucide-react"
import { centriyonLoginUrl } from "@/lib/centriyon"

export default function LoginPage() {
  const loginUrl = centriyonLoginUrl()

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border bg-card shadow-xl p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Spark Annual Report Studio
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in is managed through the Centriyon platform.
          </p>
        </div>

        <a
          href={loginUrl}
          className="block"
        >
          <Button className="w-full">
            Go to Centriyon Login
            <ArrowUpRight className="ml-1.5 h-4 w-4" />
          </Button>
        </a>

        <p className="mt-5 text-center text-xs text-muted-foreground leading-relaxed">
          Your Centriyon session gives you access to both platforms — no
          separate password needed.
        </p>
      </div>
    </div>
  )
}
