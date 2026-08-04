import type { Metadata } from "next"
import { DM_Mono, Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" })
// Report figures are set in DM Mono, matching the assembled report on the
// Centrion side. Exposed as a CSS variable only — the body font is unchanged.
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono" })

export const metadata: Metadata = {
  title: "Spark Annual Report AI Studio",
  description: "AI-powered annual report generation platform",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${jakarta.className} ${dmMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
