import os
import uuid
import math
import hashlib
from typing import List, Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv

# Ensure environment is loaded
project_root = Path(__file__).resolve().parent.parent
load_dotenv(project_root / ".env")
load_dotenv()

# Pinecone & Embedding Configurations
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "").strip()
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "email-assistant").strip()
PINECONE_CLOUD = os.getenv("PINECONE_CLOUD", "aws").strip()
PINECONE_REGION = os.getenv("PINECONE_REGION", "us-east-1").strip()
EMBEDDING_MODEL = os.getenv("PINECONE_EMBEDDING_MODEL", "multilingual-e5-large").strip()
EMBEDDING_DIM = 1024  # Dimensions for multilingual-e5-large

# Lazy client and index singletons
_pc_client = None
_index_instance = None
_in_memory_vector_store: Dict[str, List[Dict[str, Any]]] = {}


def get_user_namespace(user_id: str) -> str:
    """
    Multi-tenant isolation strategy:
    Partitions the Pinecone vector index strictly by user.
    Namespace format: 'user_{sanitized_user_id}'.
    Any search query in this namespace will NEVER touch or reveal documents of another user.
    """
    clean_id = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in (user_id or "default"))
    return f"user_{clean_id}"


def get_pinecone_client():
    """Lazily initialize Pinecone client if API key is provided."""
    global _pc_client
    api_key = os.getenv("PINECONE_API_KEY", "").strip()
    if not api_key:
        return None

    if _pc_client is None:
        try:
            from pinecone import Pinecone
            _pc_client = Pinecone(api_key=api_key)
            print("[Pinecone] Client initialized successfully.")
        except Exception as e:
            print(f"[Pinecone] Client initialization error: {e}")
            return None
    return _pc_client


def get_or_create_index():
    """Connect to existing Pinecone index or create a Serverless index if missing."""
    global _index_instance
    if _index_instance is not None:
        return _index_instance

    pc = get_pinecone_client()
    if pc is None:
        return None

    index_name = os.getenv("PINECONE_INDEX_NAME", "email-assistant").strip()
    try:
        existing_names = [idx.name for idx in pc.list_indexes()]
        if index_name not in existing_names:
            from pinecone import ServerlessSpec
            cloud = os.getenv("PINECONE_CLOUD", "aws")
            region = os.getenv("PINECONE_REGION", "us-east-1")
            print(f"[Pinecone] Creating serverless index '{index_name}' (dim={EMBEDDING_DIM}, metric='cosine')...")
            pc.create_index(
                name=index_name,
                dimension=EMBEDDING_DIM,
                metric="cosine",
                spec=ServerlessSpec(cloud=cloud, region=region)
            )
            print(f"[Pinecone] Index '{index_name}' created successfully.")

        _index_instance = pc.Index(index_name)
        return _index_instance
    except Exception as e:
        print(f"[Pinecone] Index connection/creation notice: {e}")
        try:
            _index_instance = pc.Index(index_name)
            return _index_instance
        except Exception:
            return None


def _fallback_embed(text: str, dim: int = 1024) -> List[float]:
    """Deterministic hash-based embedding for local offline dev when API key is not yet set."""
    vec = [0.0] * dim
    words = text.lower().split()
    if not words:
        return vec
    for w in words:
        h = int(hashlib.md5(w.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        vec[idx] += 1.0
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [x / norm for x in vec]
    return vec


def generate_embeddings(texts: List[str], input_type: str = "passage") -> List[List[float]]:
    """
    Generate dense vector embeddings.
    Primary: Pinecone Inference API (built-in, uses PINECONE_API_KEY with no extra LLM key).
    Fallback: Deterministic vector generator for graceful local development.
    """
    if not texts:
        return []

    pc = get_pinecone_client()
    if pc is not None and hasattr(pc, "inference"):
        try:
            response = pc.inference.embed(
                model=EMBEDDING_MODEL,
                inputs=texts,
                parameters={"input_type": input_type, "truncate": "END"}
            )
            vectors = []
            for item in response:
                if isinstance(item, dict):
                    vectors.append(item.get("values", []))
                elif hasattr(item, "values"):
                    vectors.append(item.values)
                else:
                    vectors.append([])
            if vectors and len(vectors) == len(texts):
                return vectors
        except Exception as e:
            print(f"[Pinecone Inference] Embedding warning ({e}). Using local fallback vector.")

    # Graceful local fallback
    return [_fallback_embed(t, dim=EMBEDDING_DIM) for t in texts]


def chunk_document_text(text: str, chunk_size: int = 800, chunk_overlap: int = 100) -> List[str]:
    """Split extracted text into semantically cohesive overlapping chunks."""
    if not text or not text.strip():
        return []

    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        return splitter.split_text(text)
    except Exception:
        # Fallback character chunker
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunks.append(text[start:end])
            start += max(1, chunk_size - chunk_overlap)
        return chunks


def _store_in_memory(namespace: str, records: List[Dict[str, Any]]):
    """Store vectors in memory when Pinecone is not connected."""
    if namespace not in _in_memory_vector_store:
        _in_memory_vector_store[namespace] = []
    _in_memory_vector_store[namespace].extend(records)


def _search_in_memory(
    namespace: str,
    query_vec: List[float],
    doc_id: Optional[str] = None,
    top_k: int = 3
) -> List[Dict[str, Any]]:
    """Cosine similarity search on in-memory store for isolated namespace."""
    records = _in_memory_vector_store.get(namespace, [])
    scored = []
    for r in records:
        meta = r.get("metadata", {})
        if doc_id and meta.get("doc_id") != doc_id:
            continue
        v = r.get("values", [])
        dot = sum(a * b for a, b in zip(query_vec, v))
        scored.append((dot, meta))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = []
    for score, meta in scored[:top_k]:
        results.append({
            "text": meta.get("text", ""),
            "filename": meta.get("filename", "document"),
            "doc_id": meta.get("doc_id", ""),
            "chunk_index": meta.get("chunk_index", 0),
            "score": float(score)
        })
    return results


def index_document_chunks(
    user_id: str,
    doc_id: str,
    filename: str,
    text: str
) -> int:
    """
    RAG Ingestion:
    1. Chunks document text into bounded segments.
    2. Computes dense vector embeddings.
    3. Upserts vectors to Pinecone under user's isolated namespace: 'user_{user_id}'.
    4. Attaches metadata (doc_id, filename, chunk_index, text).
    """
    chunks = chunk_document_text(text)
    if not chunks:
        return 0

    namespace = get_user_namespace(user_id)
    embeddings = generate_embeddings(chunks, input_type="passage")

    vectors_to_upsert = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        vector_id = f"{user_id}#{doc_id}#{i}"
        metadata = {
            "doc_id": doc_id,
            "user_id": user_id,
            "filename": filename,
            "chunk_index": i,
            "total_chunks": len(chunks),
            "text": chunk
        }
        vectors_to_upsert.append({
            "id": vector_id,
            "values": emb,
            "metadata": metadata
        })

    index = get_or_create_index()
    if index is not None:
        try:
            batch_size = 50
            for i in range(0, len(vectors_to_upsert), batch_size):
                batch = vectors_to_upsert[i:i + batch_size]
                index.upsert(vectors=batch, namespace=namespace)
            print(f"[Pinecone RAG] Successfully indexed {len(vectors_to_upsert)} chunks for '{filename}' in namespace '{namespace}'")
            return len(vectors_to_upsert)
        except Exception as e:
            print(f"[Pinecone RAG] Index upsert failed ({e}), falling back to local memory store.")

    # In-memory fallback
    _store_in_memory(namespace, vectors_to_upsert)
    print(f"[RAG Service] Stored {len(vectors_to_upsert)} chunks in local memory store for namespace '{namespace}'.")
    return len(vectors_to_upsert)


def search_relevant_chunks(
    user_id: str,
    query: str,
    doc_id: Optional[str] = None,
    top_k: int = 3
) -> List[Dict[str, Any]]:
    """
    RAG Retrieval:
    1. Embeds search query (synthesized from email subject + context).
    2. Queries Pinecone strictly inside namespace: 'user_{user_id}'.
    3. If doc_id is provided, applies metadata filter to only search that specific document.
    4. Returns top_k highest similarity chunks.
    """
    if not query or not query.strip():
        return []

    namespace = get_user_namespace(user_id)
    query_embeddings = generate_embeddings([query], input_type="query")
    if not query_embeddings:
        return []
    query_vec = query_embeddings[0]

    index = get_or_create_index()
    if index is not None:
        try:
            query_kwargs = {
                "vector": query_vec,
                "top_k": top_k,
                "namespace": namespace,
                "include_metadata": True
            }
            if doc_id:
                query_kwargs["filter"] = {"doc_id": {"$eq": doc_id}}

            response = index.query(**query_kwargs)
            matches = response.get("matches", []) if isinstance(response, dict) else getattr(response, "matches", [])

            results = []
            for m in matches:
                meta = m.get("metadata", {}) if isinstance(m, dict) else getattr(m, "metadata", {})
                score = m.get("score", 0.0) if isinstance(m, dict) else getattr(m, "score", 0.0)
                text = meta.get("text", "")
                if text:
                    results.append({
                        "text": text,
                        "filename": meta.get("filename", "document"),
                        "doc_id": meta.get("doc_id", ""),
                        "chunk_index": meta.get("chunk_index", 0),
                        "score": float(score)
                    })
            if results:
                return results
        except Exception as e:
            print(f"[Pinecone RAG] Query failed ({e}), checking in-memory store.")

    # Search in-memory fallback
    return _search_in_memory(namespace, query_vec, doc_id=doc_id, top_k=top_k)


def format_retrieved_context(chunks: List[Dict[str, Any]]) -> str:
    """Format matched chunks into a clean, targeted context block for LLM prompt."""
    if not chunks:
        return ""

    sections = []
    for i, c in enumerate(chunks, 1):
        filename = c.get("filename", "Attached Document")
        text = c.get("text", "").strip()
        sections.append(f"--- [Relevant Excerpt {i} from {filename}] ---\n{text}")

    return "\n\n".join(sections)
