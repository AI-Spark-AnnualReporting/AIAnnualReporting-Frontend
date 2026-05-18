# Knowledge Base — Frontend Integration Guide

> Audience: Frontend Claude integrating the Knowledge Base screen.
> Backend branch: `fix/notifications` (already implemented).

---

## 1. Base URL & Auth

All API calls go to:
```
http://localhost:8000/api/v1
```

Every Knowledge Base endpoint requires a **Bearer token** in the `Authorization` header:
```
Authorization: Bearer <access_token>
```

The `access_token` comes from `POST /auth/login` → `data.access_token`.
Store it and attach it to every request. All three roles (admin, project_manager,
department_user) can call these endpoints — the backend scopes the results automatically.

---

## 2. Endpoints

### 2.1 List Documents (role-scoped)

```
GET /api/v1/knowledge-base/documents
```

**Query params (all optional):**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `document_purpose` | string (enum) | — | Filter by purpose. Allowed values: `kickoff`, `reference`, `submission`, `supporting`, `template` |
| `page` | integer | `1` | Page number (1-based) |
| `page_size` | integer | `50` | Items per page |

**What each role receives:**
- **Admin** → every document in the system
- **Project Manager** → only documents they personally uploaded
- **Department User** → all documents in the reporting cycles their department is assigned to

**Success response `200`:**
```json
{
  "success": true,
  "documents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "document_id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "Q4_Report.pdf",
      "file_type": ".pdf",
      "file_size": 204800,
      "document_purpose": "kickoff",
      "user_id": "user_abc123",
      "uploader_name": "Jane Smith",
      "department_id": "dept-uuid-here",
      "department_name": "Finance",
      "cycle_id": "cycle-uuid-here",
      "cycle_name": "FY2026 Annual Report",
      "created_at": "2026-05-10T14:32:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 20
}
```

**Pagination notes:**
- `total` = total matching docs **before** pagination (use for page count calculation)
- `page_size` echo lets you compute `total_pages = Math.ceil(total / page_size)`
- An empty Knowledge Base returns `{ documents: [], total: 0, page: 1, page_size: 50 }`

---

### 2.2 Get Single Document

```
GET /api/v1/knowledge-base/documents/:document_id
```

Returns metadata for one document. Raises **403** if the caller's role does not give
them access to this document (same scoping rules as the list).

**Success response `200`:**
```json
{
  "id": "550e8400-...",
  "document_id": "550e8400-...",
  "filename": "Strategy_Brief.docx",
  "file_type": ".docx",
  "file_size": 51200,
  "user_id": "user_abc123",
  "cycle_id": "cycle-uuid",
  "department_id": "dept-uuid",
  "document_purpose": "reference",
  "word_count": 1240,
  "created_at": "2026-05-10T14:32:00Z"
}
```

---

### 2.3 Get Download URL

```
GET /api/v1/knowledge-base/documents/:document_id/download
```

Returns a **short-lived signed URL** (valid 1 hour) for downloading the original file
directly from Supabase Storage. Raises **403** if out of scope.

**Success response `200`:**
```json
{
  "success": true,
  "document_id": "550e8400-...",
  "filename": "Strategy_Brief.docx",
  "download_url": "https://supabase-storage-url/signed/...",
  "expires_in": 3600
}
```

**How to use in the UI:**
```js
// Open in new tab or trigger browser download
window.open(data.download_url, '_blank');

// Or set as href on an <a> tag
<a href={data.download_url} download={data.filename}>Download</a>
```

> Do NOT cache the signed URL — it expires in 1 hour. Fetch a fresh one each time
> the user clicks download.

---

### 2.4 Delete Document (admin only)

```
DELETE /api/v1/knowledge-base/documents/:document_id
```

Only users with role `admin` can call this. Any other role gets **403**.
Deletes the document record, its storage file, and all embedded chunks.

**Success response `200`:**
```json
{
  "success": true,
  "message": "Document deleted successfully",
  "data": null
}
```

**Error `404`** if the document doesn't exist.

---

## 3. Error Responses

All errors follow this shape:
```json
{
  "detail": "Human-readable error message"
}
```

| HTTP status | When it happens |
|-------------|----------------|
| `401` | Missing or expired token |
| `403` | Calling delete as non-admin, or fetching a document outside the caller's scope |
| `404` | Document ID not found |
| `422` | Invalid query param (e.g. `document_purpose=bogus`) |
| `500` | Storage or DB failure |

---

## 4. Role-Aware UI Behaviour

Check `current_user.role` (from the login response / auth context) to conditionally
render UI elements:

```js
const isAdmin = user.role === 'admin';
const isPM    = user.role === 'project_manager';
const isDept  = user.role === 'department_user';
```

| UI element | Admin | PM | Dept user |
|-----------|-------|----|-----------|
| Delete button on each row | ✅ show | ❌ hide | ❌ hide |
| Download button | ✅ | ✅ | ✅ |
| `uploader_name` column | useful | always self | useful |
| `department_name` column | useful | may be null | usually consistent |
| Empty state message | "No documents in the system yet" | "You haven't uploaded any documents yet" | "No documents available for your department's cycles yet" |

---

## 5. Suggested API Client (TypeScript)

```ts
// types
interface KBDocument {
  id: string;
  document_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  document_purpose: string | null;
  user_id: string | null;
  uploader_name: string | null;
  department_id: string | null;
  department_name: string | null;
  cycle_id: string | null;
  cycle_name: string | null;
  created_at: string;
}

interface KBListResponse {
  success: boolean;
  documents: KBDocument[];
  total: number;
  page: number;
  page_size: number;
}

interface DownloadResponse {
  success: boolean;
  document_id: string;
  filename: string;
  download_url: string;
  expires_in: number;
}

// api helpers
const BASE = '/api/v1';

async function listKBDocuments(
  token: string,
  params: { document_purpose?: string; page?: number; page_size?: number } = {}
): Promise<KBListResponse> {
  const query = new URLSearchParams();
  if (params.document_purpose) query.set('document_purpose', params.document_purpose);
  if (params.page)      query.set('page', String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));

  const res = await fetch(`${BASE}/knowledge-base/documents?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
  return res.json();
}

async function getKBDownloadUrl(token: string, documentId: string): Promise<DownloadResponse> {
  const res = await fetch(`${BASE}/knowledge-base/documents/${documentId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
  return res.json();
}

async function deleteKBDocument(token: string, documentId: string): Promise<void> {
  const res = await fetch(`${BASE}/knowledge-base/documents/${documentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
}
```

---

## 6. Screen Wiring

### Empty state
Show the empty state UI (book icon + copy from the screenshot) when
`response.total === 0`.

### Pagination
```js
const totalPages = Math.ceil(data.total / data.page_size);
// render page controls only if totalPages > 1
```

### Purpose filter (optional dropdown)
Values to offer in a filter dropdown:
```
All (no filter)
Kickoff
Reference
Submission
Supporting
Template
```
Pass the lowercase value as `document_purpose` query param.

### Download flow
```js
async function handleDownload(documentId: string, filename: string) {
  const { download_url } = await getKBDownloadUrl(token, documentId);
  const a = document.createElement('a');
  a.href = download_url;
  a.download = filename;
  a.click();
}
```

### Delete flow (admin only)
```js
async function handleDelete(documentId: string) {
  if (!confirm('Delete this document? This cannot be undone.')) return;
  await deleteKBDocument(token, documentId);
  // re-fetch the list or remove the item from local state
  setDocuments(prev => prev.filter(d => d.id !== documentId));
}
```

---

## 7. No Upload Endpoint

The Knowledge Base screen has **no upload endpoint of its own**. Documents appear here
after being uploaded through existing flows:
- PMs upload kickoff briefs via `POST /api/v1/admin/cycles/{cycleId}/upload-kickoff`
  or `POST /api/v1/pm/kickoff/upload`
- Department users upload supporting docs via
  `POST /api/v1/department/sessions/{sessionId}/upload-document`

The KB screen is a **read + manage** view, not an upload surface.

---

## 8. Quick Test Checklist

1. Log in as **admin** → list shows all documents in system with `uploader_name`,
   `department_name`, `cycle_name` populated.
2. Log in as **PM** → list shows only that PM's own uploads.
3. Log in as **dept user** → list shows only documents whose cycle belongs to that
   user's department; if none, `total === 0`.
4. Try `document_purpose=bogus` → expect `422`.
5. As admin, call `DELETE /knowledge-base/documents/:id` → `200`, document gone from list.
6. As PM, call `DELETE /knowledge-base/documents/:id` → `403`.
7. As dept user, call `GET /knowledge-base/documents/:out_of_scope_id` → `403`.
8. Call `GET /knowledge-base/documents/:id/download` → signed URL in response; opening
   it downloads the file.
