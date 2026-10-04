"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { useState } from "react"
import { Toaster } from "sonner"
import { AuthProvider } from "@/contexts/AuthContext"
import { isAuthError, isTimeoutError } from "@/lib/api/client"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            // RETRIES ARE PAID FOR IN WAITING, AND THE WAIT IS THE QUERY'S
            // TIMEOUT, NOT A ROUND TRIP.
            //
            // A refused connection or a 500 comes back in milliseconds, so
            // trying twice more is free and often works. A client-side timeout
            // is the opposite: it means this call has already spent its entire
            // budget waiting, and two more attempts spend it twice again. The
            // designer's payload sets a 120s timeout of its own, so retrying it
            // put a spinner in front of a PM for about six minutes before the
            // error page they could have acted on at two — and the error page
            // has a Try again button, which is a retry the person chose.
            //
            // A session that lost access is not retried at all: no number of
            // attempts grants a permission back.
            retry: (failureCount, error: unknown) => {
              if (isAuthError(error)) return false
              if (isTimeoutError(error)) return false
              return failureCount < 2
            },
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
