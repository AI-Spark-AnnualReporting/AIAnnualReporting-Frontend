"use client"

// The Centriton Document Bank (grouped-by-cycle, styled) is role-agnostic —
// useKBDocuments is scoped to the signed-in user server-side, so the same
// component serves the department view. Admin keeps the original
// KnowledgeBasePage until its own redesign.
import { PMDocumentBank } from "@/components/pm/PMDocumentBank"

export default function DeptDocumentsPage() {
  return <PMDocumentBank />
}
