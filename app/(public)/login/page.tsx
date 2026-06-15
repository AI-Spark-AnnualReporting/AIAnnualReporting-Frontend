import { Button } from "@/components/ui/button"
import { Sparkles, ArrowUpRight } from "lucide-react"
import { centritonLoginUrl } from "@/lib/centriton"

export default function LoginPage() {
  const loginUrl = centritonLoginUrl()

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
            Sign in is managed through the Centriton platform.
          </p>
        </div>

        <a
          href={loginUrl}
          className="block"
        >
          <Button className="w-full">
            Go to Centriton Login
            <ArrowUpRight className="ml-1.5 h-4 w-4" />
          </Button>
        </a>

        <p className="mt-5 text-center text-xs text-muted-foreground leading-relaxed">
          Your Centriton session gives you access to both platforms — no
          separate password needed.
        </p>
      </div>
    </div>
  )
}
