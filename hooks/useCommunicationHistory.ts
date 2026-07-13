import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  communicationsApi,
  type EmailAudience,
  type EmailSendSavePayload,
} from "@/lib/api/communications"

/* React-query hooks for the Communication Hub → History tab. All endpoints are
   company-scoped by the JWT and live on the shared Centrion backend. */

const HISTORY_KEY = ["comm-history"]

// Email sends + header stats. `audience` filters the list only.
export function useEmailSends(audience: "all" | EmailAudience) {
  return useQuery({
    queryKey: [...HISTORY_KEY, "email-sends", audience],
    queryFn: () => communicationsApi.emailSends(audience),
    staleTime: 30_000,
  })
}

// Per-recipient drill-down; only fires once a send is selected.
export function useSendRecipients(sendId?: string) {
  return useQuery({
    queryKey: [...HISTORY_KEY, "send-recipients", sendId],
    queryFn: () => communicationsApi.sendRecipients(sendId as string),
    enabled: !!sendId,
    staleTime: 30_000,
  })
}

export function usePublications() {
  return useQuery({
    queryKey: [...HISTORY_KEY, "publications"],
    queryFn: () => communicationsApi.publications(),
    staleTime: 30_000,
  })
}

// ── Compose modal: drafts / save-send ──────────────────────────────────────

// Saved drafts (the only place drafts surface — not in the History list).
export function useDrafts() {
  return useQuery({
    queryKey: [...HISTORY_KEY, "drafts"],
    queryFn: () => communicationsApi.drafts().then((r) => r.drafts),
    staleTime: 15_000,
  })
}

// Draft detail for prefilling the editor; only fires once an id is known.
export function useEmailSend(id?: string) {
  return useQuery({
    queryKey: [...HISTORY_KEY, "email-send", id],
    queryFn: () => communicationsApi.getEmailSend(id as string),
    enabled: !!id,
  })
}

// Create (POST) or update (PATCH) a send. Invalidates drafts + History list.
export function useSaveSend() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { id?: string; payload: EmailSendSavePayload | Partial<EmailSendSavePayload> }) =>
      p.id
        ? communicationsApi.updateEmailSend(p.id, p.payload).then((r) => r.send)
        : communicationsApi.createEmailSend(p.payload as EmailSendSavePayload).then((r) => r.send),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...HISTORY_KEY, "drafts"] })
      qc.invalidateQueries({ queryKey: [...HISTORY_KEY, "email-sends"] })
    },
  })
}

// CSV export — goes through the authed client, then forces a download.
export async function exportRecipientsCsv(sendId: string, subject: string): Promise<void> {
  const blob = await communicationsApi.sendRecipientsCsv(sendId)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${subject.replace(/\s+/g, "_")}-recipients.csv`
  a.click()
  URL.revokeObjectURL(url)
}
