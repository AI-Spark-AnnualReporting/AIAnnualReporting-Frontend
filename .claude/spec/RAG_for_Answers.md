# Spec: pgvector RAG Implementation

**Target system:** Spark Annual Report System (SAR) — Backend only  
**Frontend:** Zero changes required  
**Goal:** Replace the broken concatenation-based document retrieval with proper
vector similarity search using pgvector inside the existing Supabase PostgreSQL database.

---

## The Problem Being Fixed

Currently every feature that reads document content does this:

```
ALL chunks → join into one giant string → truncate → send to LLM
```

Middle content of any document longer than the truncation threshold is
permanently lost. This breaks:
- Extract answers from documents
- Per-question AI suggestions
- Chat with document
- Agent chat with documents

The fix: embed every chunk at upload time, embed the query at retrieval time,
find the most relevant chunks via cosine similarity, send only those to the LLM.

---

## Architecture Overview

```
UPLOAD TIME (once per document):
  File → extract text → split into chunks → embed ALL chunks in one batch call
  → store chunks WITH embeddings in document_chunks.embedding

QUERY TIME (every LLM feature):
  Question / message → embed → vector similarity search → top 5 relevant chunks
  → send ONLY those chunks to LLM → accurate answer
```

---

## Step 1 — Database Migration

Run this entire block in Supabase SQL Editor in one shot.
The order matters — do not rearrange.

```sql
-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to document_chunks
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Vector similarity search index (IVFFlat — fast approximate search)
-- lists = 100 is correct for up to ~1,000,000 chunks
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 4. Vector similarity search function
-- This is your "query" equivalent of Pinecone's index.query()
CREATE OR REPLACE FUNCTION search_chunks_by_embedding(
    query_embedding  vector(1536),
    p_user_id        VARCHAR  DEFAULT NULL,
    p_cycle_id       UUID     DEFAULT NULL,
    p_document_id    UUID     DEFAULT NULL,
    p_purpose        VARCHAR  DEFAULT NULL,
    p_limit          INTEGER  DEFAULT 5,
    p_threshold      FLOAT    DEFAULT 0.5
)
RETURNS TABLE (
    chunk_id      UUID,
    document_id   UUID,
    filename      VARCHAR,
    chunk_index   INTEGER,
    content       TEXT,
    similarity    FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id                                          AS chunk_id,
        dc.document_id,
        d.filename,
        dc.chunk_index,
        dc.content,
        1 - (dc.embedding <=> query_embedding)         AS similarity
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE
        dc.embedding IS NOT NULL
        AND 1 - (dc.embedding <=> query_embedding) > p_threshold
        AND (p_user_id    IS NULL OR d.user_id            = p_user_id)
        AND (p_cycle_id   IS NULL OR d.cycle_id           = p_cycle_id)
        AND (p_document_id IS NULL OR dc.document_id      = p_document_id)
        AND (p_purpose    IS NULL OR d.document_purpose   = p_purpose)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 5. Update schema.sql to reflect these changes (keep it as source of truth)
-- Add these lines to scripts/schema.sql after the document_chunks table definition
```

After running, update `scripts/schema.sql` to include these changes so it stays
as the authoritative schema mirror.

---

## Step 2 — New File: `app/services/embedding_service.py`

Create this file from scratch. This is the only new file in the entire implementation.

```python
"""
EmbeddingService — OpenAI text embeddings for pgvector RAG.

Wraps the OpenAI embeddings API with:
- Single text embedding (query time)
- Batch text embedding (upload time — all chunks in one API call)
- Graceful fallback (returns None on failure, caller decides what to do)
"""

import logging
from openai import AsyncOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

# OpenAI text-embedding-3-small
# - 1536 dimensions  (matches vector(1536) in DB)
# - $0.02 per 1M tokens (essentially free at this scale)
# - Fast — purpose-built for retrieval
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536


class EmbeddingService:

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def embed_text(self, text: str) -> list[float] | None:
        """
        Embed a single text string.
        Used at query time: questions, chat messages, search queries.
        Returns None on failure — caller should handle gracefully.
        """
        try:
            text = text.replace("\n", " ").strip()
            if not text:
                return None

            response = await self.client.embeddings.create(
                input=text,
                model=EMBEDDING_MODEL
            )
            return response.data[0].embedding

        except Exception as e:
            logger.warning(f"embed_text failed: {e}")
            return None

    async def embed_texts_batch(self, texts: list[str]) -> list[list[float] | None]:
        """
        Embed multiple texts in a single API call.
        Used at upload time to embed all chunks of a document at once.
        OpenAI supports up to 2048 inputs per batch call.
        Returns list of embeddings in same order as input.
        Individual failures return None at that index.
        """
        if not texts:
            return []

        try:
            cleaned = [t.replace("\n", " ").strip() for t in texts]
            response = await self.client.embeddings.create(
                input=cleaned,
                model=EMBEDDING_MODEL
            )
            # response.data is ordered to match input order — guaranteed by OpenAI
            return [item.embedding for item in response.data]

        except Exception as e:
            logger.warning(f"embed_texts_batch failed: {e} — returning None for all chunks")
            return [None] * len(texts)


# Singleton instance — import and use directly
embedding_service = EmbeddingService()
```

---

## Step 3 — Update `app/database/repositories/document_repository.py`

### 3a. Update `insert_chunk` to accept and store embeddings

Find the method that inserts a chunk row and add the `embedding` field:

```python
# BEFORE
async def insert_chunk(self, document_id: str, chunk_index: int,
                        content: str, token_count: int) -> dict:
    data = {
        "document_id": document_id,
        "chunk_index": chunk_index,
        "content": content,
        "token_count": token_count
    }
    result = await self.supabase.table("document_chunks").insert(data).execute()
    return result.data[0]

# AFTER
async def insert_chunk(self, document_id: str, chunk_index: int,
                        content: str, token_count: int,
                        embedding: list[float] | None = None) -> dict:
    data = {
        "document_id": document_id,
        "chunk_index": chunk_index,
        "content": content,
        "token_count": token_count
    }
    if embedding is not None:
        data["embedding"] = embedding   # pgvector accepts Python list[float] directly

    result = await self.supabase.table("document_chunks").insert(data).execute()
    return result.data[0]
```

### 3b. Add vector search method

Add this new method to the repository:

```python
async def search_by_embedding(
    self,
    query_embedding: list[float],
    user_id: str | None = None,
    cycle_id: str | None = None,
    document_id: str | None = None,
    purpose: str | None = None,
    limit: int = 5,
    threshold: float = 0.5
) -> list[dict]:
    """
    Find the most relevant chunks for a given query embedding.
    Calls the search_chunks_by_embedding Supabase RPC function.
    Returns ranked list of {chunk_id, document_id, filename,
                            chunk_index, content, similarity}.
    Returns empty list on failure — never raises.
    """
    try:
        result = await self.supabase.rpc(
            "search_chunks_by_embedding",
            {
                "query_embedding": query_embedding,
                "p_user_id":       user_id,
                "p_cycle_id":      cycle_id,
                "p_document_id":   document_id,
                "p_purpose":       purpose,
                "p_limit":         limit,
                "p_threshold":     threshold
            }
        ).execute()
        return result.data or []

    except Exception as e:
        logger.warning(f"search_by_embedding failed: {e}")
        return []
```

---

## Step 4 — Update `app/services/document_service.py`

This is where chunks are created after a document is uploaded. Add embedding
generation AFTER chunking, BEFORE inserting chunks.

Find the section of `process_document` (or whatever the upload handler method
is called) that loops through chunks and inserts them. Replace it:

```python
# ADD this import at the top of document_service.py
from app.services.embedding_service import embedding_service

# BEFORE — inserts chunks one by one, no embeddings
for i, chunk in enumerate(chunks):
    await document_repository.insert_chunk(
        document_id=document_id,
        chunk_index=i,
        content=chunk["content"],
        token_count=chunk["token_count"]
    )

# AFTER — generate all embeddings in one batch call, then insert
chunk_texts = [chunk["content"] for chunk in chunks]

# One batch API call for all chunks (cheap, fast)
embeddings = await embedding_service.embed_texts_batch(chunk_texts)

for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
    await document_repository.insert_chunk(
        document_id=document_id,
        chunk_index=i,
        content=chunk["content"],
        token_count=chunk["token_count"],
        embedding=embedding   # None if embedding failed — stored as NULL, still searchable via keyword fallback
    )
```

**Important:** if `embed_texts_batch` returns `None` for some chunks (API failure),
those chunks are inserted with `embedding = NULL`. They will be excluded from
vector search (`WHERE dc.embedding IS NOT NULL` in the SQL function) but the
document still gets stored correctly. The keyword search fallback covers them.

---

## Step 5 — Rewrite `extract_answers` in `app/services/session_service.py`

This is the biggest change. Replace the entire `extract_answers` method.

```python
# ADD this import at the top of session_service.py
from app.services.embedding_service import embedding_service

async def extract_answers(
    self,
    session_id: str,
    user_id: str,
    cycle_id: str
) -> dict:
    """
    Extract answers to session questions from the user's uploaded documents.
    Uses per-question vector similarity search so the full document is covered,
    not just the beginning and end.
    """
    session = await session_repository.get_by_session_id(session_id)
    questions = session.get("questions", [])

    if not questions:
        raise BusinessRuleError("No questions found for this session.")

    extracted_answers = []
    found_count = 0
    not_found_count = 0

    for q in questions:
        question_text = q["question"]

        # 1. Embed the question
        question_embedding = await embedding_service.embed_text(question_text)

        relevant_chunks = []

        if question_embedding:
            # 2. Vector search — find top 5 chunks most relevant to THIS question
            # Scoped to this user + cycle + supporting documents only
            relevant_chunks = await document_repository.search_by_embedding(
                query_embedding=question_embedding,
                user_id=user_id,
                cycle_id=cycle_id,
                purpose="supporting",
                limit=5,
                threshold=0.5
            )

        # 3. Fallback to keyword search if vector search returned nothing
        # (handles case where embedding failed or chunks have no embeddings yet)
        if not relevant_chunks:
            relevant_chunks = await document_repository.search_by_keyword(
                search_term=question_text,
                user_id=user_id,
                limit=5
            )

        # 4. Still nothing — mark as not found
        if not relevant_chunks:
            extracted_answers.append({
                "question_id": q["question_id"],
                "question":    question_text,
                "answer":      "Information not found in uploaded documents.",
            })
            not_found_count += 1
            continue

        # 5. Build context from ONLY the relevant chunks for this question
        context = "\n\n---\n\n".join([
            f"[Source: {chunk['filename']}, section {chunk['chunk_index']}]\n"
            f"{chunk['content']}"
            for chunk in relevant_chunks
        ])

        # 6. One focused LLM call for this one question
        answer = await llm_service.extract_single_answer(
            question=question_text,
            context=context,
            department_context=session.get("department", {}).get("initial_prompt", "")
        )

        extracted_answers.append({
            "question_id": q["question_id"],
            "question":    question_text,
            "answer":      answer,
        })
        found_count += 1

    # 7. Merge into session — never overwrites already-answered questions
    await session_repository.merge_answers(session_id, extracted_answers)

    # 8. Advance step
    await session_repository.advance_step(session_id, "answers_extracted")

    return {
        "success":        True,
        "session_id":     session_id,
        "found_count":    found_count,
        "not_found_count": not_found_count,
        "total_questions": len(questions),
        "answers":        extracted_answers
    }
```

---

## Step 6 — Add `extract_single_answer` to `app/services/llm_service.py`

Add this new method. It is a focused single-question extraction call — different
from the existing bulk extraction prompt:

```python
async def extract_single_answer(
    self,
    question: str,
    context: str,
    department_context: str = ""
) -> str:
    """
    Extract an answer to ONE question from pre-filtered relevant document chunks.
    Context contains only the top-N most relevant chunks — not the full document.
    """
    system_prompt = """You are an expert at extracting precise information from 
business documents for annual report preparation. Extract factual, specific answers.
Do not invent or infer information that is not explicitly present in the provided text."""

    user_prompt = f"""Extract an answer to the following question from the document excerpts below.

{f"Department context: {department_context}" if department_context else ""}

Document excerpts (most relevant sections):
{context}

Question: {question}

Instructions:
- Answer based ONLY on the provided excerpts
- Be specific and factual — include numbers, dates, names where present
- If the information is not in the excerpts, respond with exactly:
  "Information not found in uploaded documents."
- Do not combine information from multiple unrelated sections
- Keep the answer focused and direct"""

    return await self.generate_completion(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=500
    )
```

---

## Step 7 — Update Per-Question Suggestion in `app/services/session_service.py`

Find `get_question_suggestion` (or `generate_answer_suggestion`) and replace
the document context retrieval section:

```python
async def get_question_suggestion(
    self,
    session_id: str,
    question_id: str,
    user_id: str
) -> dict:

    session  = await session_repository.get_by_session_id(session_id)
    question = next((q for q in session["questions"]
                     if q["question_id"] == question_id), None)

    if not question:
        raise NotFoundError("Question not found")

    question_text = question["question"]
    context = ""

    # Vector search for relevant chunks
    question_embedding = await embedding_service.embed_text(question_text)

    if question_embedding:
        relevant_chunks = await document_repository.search_by_embedding(
            query_embedding=question_embedding,
            user_id=user_id,
            cycle_id=session.get("cycle_id"),
            limit=5,
            threshold=0.5
        )
        if relevant_chunks:
            context = "\n\n---\n\n".join([
                chunk["content"] for chunk in relevant_chunks
            ])

    # Call existing LLM method with the retrieved context
    suggestion = await llm_service.generate_answer_suggestion(
        question=question_text,
        context=context,
        department_name=session.get("department", {}).get("department_name", ""),
        kickoff_brief=session.get("kickoff_brief", "")
    )

    return {
        "success":     True,
        "question_id": question_id,
        "suggestion":  suggestion
    }
```

---

## Step 8 — Update Chat in `app/services/chat_service.py`

Find the method that handles sending a chat message and replace the document
context retrieval section:

```python
# ADD import
from app.services.embedding_service import embedding_service

async def send_message(
    self,
    conversation_id: str,
    message: str,
    user_id: str
) -> dict:

    conversation = await chat_repository.get_conversation(conversation_id)
    history      = await chat_repository.get_messages(conversation_id)

    context = ""

    # Vector search for relevant document chunks
    message_embedding = await embedding_service.embed_text(message)

    if message_embedding:
        # If conversation is bound to a specific document, search only that doc
        # Otherwise search all user's documents
        relevant_chunks = await document_repository.search_by_embedding(
            query_embedding=message_embedding,
            user_id=user_id,
            document_id=conversation.get("document_id"),  # None = search all
            limit=6,
            threshold=0.45   # slightly lower threshold for chat — more forgiving
        )

        if relevant_chunks:
            context = "\n\n---\n\n".join([
                f"[{chunk['filename']}]\n{chunk['content']}"
                for chunk in relevant_chunks
            ])

    # Pass context to existing LLM chat method
    response = await llm_service.generate_chat_response(
        message=message,
        context=context,
        history=history
    )

    # Save messages to DB (existing logic — no change)
    await chat_repository.save_message(conversation_id, "user",      message)
    await chat_repository.save_message(conversation_id, "assistant", response)

    return {
        "success":   True,
        "response":  response,
        "used_context": bool(context)
    }
```

---

## Step 9 — Add Keyword Search Fallback to `document_repository.py`

This is the fallback for when embeddings are NULL (document uploaded before
this feature was deployed). It uses the existing `search_document_chunks`
PostgreSQL function already in your schema:

```python
async def search_by_keyword(
    self,
    search_term: str,
    user_id: str | None = None,
    limit: int = 5
) -> list[dict]:
    """
    Keyword-based chunk search using PostgreSQL full-text search.
    Fallback when vector search returns no results.
    Uses the existing search_document_chunks DB function.
    """
    try:
        result = await self.supabase.rpc(
            "search_document_chunks",
            {
                "p_search_term": search_term,
                "p_user_id":     user_id,
                "p_limit":       limit
            }
        ).execute()
        return result.data or []

    except Exception as e:
        logger.warning(f"search_by_keyword failed: {e}")
        return []
```

---

## Step 10 — Backfill Embeddings for Existing Chunks

Existing chunks in the DB have `embedding = NULL`. Write a one-time backfill
script at `scripts/backfill_embeddings.py`:

```python
"""
One-time script to generate embeddings for all existing document_chunks
that have embedding = NULL.

Run once after deploying the embedding changes:
  python scripts/backfill_embeddings.py
"""

import asyncio
from app.database.connection import get_supabase
from app.services.embedding_service import embedding_service
import logging

logger = logging.getLogger(__name__)
BATCH_SIZE = 100   # process 100 chunks at a time


async def backfill():
    supabase = get_supabase()

    # Fetch all chunks with no embedding
    result = supabase.table("document_chunks") \
        .select("id, content") \
        .is_("embedding", "null") \
        .execute()

    chunks = result.data
    total  = len(chunks)
    logger.info(f"Found {total} chunks to backfill")

    if total == 0:
        logger.info("Nothing to backfill. Done.")
        return

    # Process in batches of BATCH_SIZE
    for i in range(0, total, BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        texts = [c["content"] for c in batch]

        logger.info(f"Processing batch {i//BATCH_SIZE + 1} "
                    f"({i+1}–{min(i+BATCH_SIZE, total)} of {total})")

        embeddings = await embedding_service.embed_texts_batch(texts)

        for chunk, embedding in zip(batch, embeddings):
            if embedding is None:
                logger.warning(f"Embedding failed for chunk {chunk['id']} — skipping")
                continue

            supabase.table("document_chunks") \
                .update({"embedding": embedding}) \
                .eq("id", chunk["id"]) \
                .execute()

    logger.info("Backfill complete.")


if __name__ == "__main__":
    asyncio.run(backfill())
```

---

## What Changes Where — Complete Summary

| File | Change type | What |
|---|---|---|
| Supabase SQL Editor | Run once | Enable pgvector, add column, add index, add function |
| `scripts/schema.sql` | Update | Add pgvector extension, embedding column, index, search function |
| `app/services/embedding_service.py` | **New file** | OpenAI embeddings wrapper |
| `app/database/repositories/document_repository.py` | Update | `insert_chunk` accepts embedding, new `search_by_embedding` method, new `search_by_keyword` fallback |
| `app/services/document_service.py` | Update | After chunking, call `embed_texts_batch` and pass embeddings to `insert_chunk` |
| `app/services/session_service.py` | Update | Rewrite `extract_answers`, update `get_question_suggestion` |
| `app/services/llm_service.py` | Update | Add `extract_single_answer` method |
| `app/services/chat_service.py` | Update | Replace document context retrieval with vector search |
| `scripts/backfill_embeddings.py` | **New file** | One-time backfill for existing chunks |

---

## What Does NOT Change

- Chunking logic in `token_manager.py` — correct, no change
- Chunk sizes (2,000 tokens, 200 overlap) — correct, no change
- The `documents` table — no change
- Upload endpoints — same API surface, just does more internally
- All frontend code — zero changes
- Auth, users, cycles, sessions, notifications — untouched
- `search_document_chunks` existing function — kept as keyword fallback

---

## Retrieval Strategy Per Feature

| Feature | Vector search scope | Threshold | Limit | Fallback |
|---|---|---|---|---|
| Extract answers | user + cycle + purpose=supporting | 0.5 | 5 per question | keyword search |
| Per-question suggestion | user + cycle (all purposes) | 0.5 | 5 | empty context |
| Chat with document | specific document_id | 0.45 | 6 | empty context |
| Agent chat | user (all documents) | 0.45 | 6 | empty context |

---

## Deployment Order

Run in this exact order:

```
1. Run SQL migration in Supabase SQL Editor
2. Deploy backend code changes
3. Run backfill script:  python scripts/backfill_embeddings.py
4. Test with a new document upload — verify embedding column is populated
5. Test extract_answers — verify middle-document content is now found
```

---

## Definition of Done

- [ ] `CREATE EXTENSION IF NOT EXISTS vector` runs without error in Supabase
- [ ] `document_chunks.embedding` column exists as `vector(1536)`
- [ ] `search_chunks_by_embedding` RPC function exists in Supabase
- [ ] `app/services/embedding_service.py` created with `embed_text` and `embed_texts_batch`
- [ ] New document upload stores embeddings in `document_chunks.embedding`
- [ ] `extract_answers` makes N LLM calls (one per question) not 1 giant call
- [ ] `extract_answers` uses vector search, falls back to keyword if no results
- [ ] Per-question suggestion uses vector search for context
- [ ] Chat uses vector search for context
- [ ] Backfill script runs to completion with no unhandled errors
- [ ] `scripts/schema.sql` updated to reflect all DB changes
- [ ] No existing tests broken (`pytest` passes)