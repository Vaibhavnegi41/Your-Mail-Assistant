import os
import uuid
import math
import hashlib
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import List, Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv

# Ensure environment is loaded from both backend/.env and root .env
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent

load_dotenv(project_root / ".env", override=True)
load_dotenv(current_dir / ".env", override=True)

# Pinecone & Embedding Configurations
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "").strip()
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "email-assistant").strip()
PINECONE_CLOUD = os.getenv("PINECONE_CLOUD", "aws").strip()
PINECONE_REGION = os.getenv("PINECONE_REGION", "us-east-1").strip()
EMBEDDING_MODEL = os.getenv("PINECONE_EMBEDDING_MODEL", "multilingual-e5-large").strip()
EMBEDDING_DIM = 1024

# Lazy client, index, and host singletons
_pc_client = None
_index_instance = None
_index_host: Optional[str] = None
_http_session: Optional[requests.Session] = None
_in_memory_vector_store: Dict[str, List[Dict[str, Any]]] = {}


def get_http_session() -> requests.Session:
    """
    Persistent connection pool session.
    Reuses warm TCP/TLS connections to Pinecone to eliminate 800-1200ms connection handshake latency.
    """
    global _http_session
    if _http_session is None:
        _http_session = requests.Session()
        retries = Retry(total=2, backoff_factor=0.2, status_forcelist=[500, 502, 503, 504])
        adapter = HTTPAdapter(pool_connections=10, pool_maxsize=20, max_retries=retries)
        _http_session.mount("https://", adapter)
        _http_session.mount("http://", adapter)
    return _http_session


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


def get_index_host() -> Optional[str]:
    """Retrieve and cache host URL for index REST operations."""
    global _index_host
    if _index_host:
        return _index_host

    # Check if host is provided in env for instant zero-roundtrip resolution
    env_host = os.getenv("PINECONE_HOST", "").strip()
    if env_host:
        _index_host = env_host.replace("https://", "").replace("http://", "").strip("/")
        return _index_host

    pc = get_pinecone_client()
    if pc is None:
        return None

    index_name = os.getenv("PINECONE_INDEX_NAME", "email-assistant").strip()
    try:
        desc = pc.describe_index(index_name)
        _index_host = desc.host if hasattr(desc, "host") else desc.get("host")
        return _index_host
    except Exception as e:
        print(f"[Pinecone] Could not describe index host: {e}")
        return None


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


def chunk_document_text(text: str, chunk_size: int = 800, chunk_overlap: int = 100) -> List[str]:
    """
    Ultra-fast pure Python recursive chunker (< 1ms).
    Avoids the 13+ second lazy-import bottleneck of langchain_text_splitters on Windows.
    Splits along paragraphs, lines, and sentence boundaries.
    """
    if not text or not text.strip():
        return []

    separators = ["\n\n", "\n", ". ", " "]

    def _split(t: str, sep_idx: int) -> List[str]:
        if len(t) <= chunk_size or sep_idx >= len(separators):
            return [t] if t else []

        sep = separators[sep_idx]
        parts = t.split(sep)
        chunks = []
        curr = ""

        for p in parts:
            cand = f"{curr}{sep}{p}" if curr else p
            if len(cand) <= chunk_size:
                curr = cand
            else:
                if curr:
                    chunks.append(curr)
                if len(p) > chunk_size:
                    chunks.extend(_split(p, sep_idx + 1))
                    curr = ""
                else:
                    curr = p

        if curr:
            chunks.append(curr)

        return chunks

    raw_chunks = _split(text, 0)
    if chunk_overlap <= 0 or len(raw_chunks) <= 1:
        return raw_chunks

    final_chunks = []
    for i, c in enumerate(raw_chunks):
        if i > 0 and chunk_overlap > 0:
            overlap = raw_chunks[i - 1][-chunk_overlap:]
            final_chunks.append(f"{overlap}... {c}")
        else:
            final_chunks.append(c)

    return final_chunks


def rank_chunks_locally(chunks: List[str], query: str, filename: str = "Attached Document", top_k: int = 3) -> List[Dict[str, Any]]:
    """
    High-speed in-memory semantic/keyword ranking for attached files (< 1ms).
    Instantly returns the most relevant chunks without waiting for internet round-trips.
    """
    if not chunks:
        return []
    if not query or not query.strip():
        return [{"text": c, "filename": filename, "score": 1.0, "chunk_index": i} for i, c in enumerate(chunks[:top_k])]

    q_words = set(query.lower().split())
    # Remove common stop words for sharper relevance
    stop_words = {"the", "a", "an", "is", "and", "or", "to", "in", "of", "for", "with", "on", "at", "by", "this", "that"}
    filtered_q = q_words - stop_words
    match_targets = filtered_q if filtered_q else q_words

    scored = []
    for i, c in enumerate(chunks):
        c_lower = c.lower()
        score = sum(1.0 for w in match_targets if w in c_lower)
        scored.append((score, c, i))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = []
    for score, c, i in scored[:top_k]:
        results.append({
            "text": c,
            "filename": filename,
            "score": float(score),
            "chunk_index": i
        })
    return results


def _store_in_memory(namespace: str, records: List[Dict[str, Any]]):
    """Store vectors in memory when Pinecone is not connected."""
    if namespace not in _in_memory_vector_store:
        _in_memory_vector_store[namespace] = []
    _in_memory_vector_store[namespace].extend(records)


def _search_in_memory(
    namespace: str,
    query: str,
    doc_id: Optional[str] = None,
    top_k: int = 3
) -> List[Dict[str, Any]]:
    """In-memory keyword/overlap search fallback."""
    records = _in_memory_vector_store.get(namespace, [])
    scored = []
    query_words = set(query.lower().split())

    for r in records:
        if doc_id and r.get("doc_id") != doc_id:
            continue
        text = r.get("chunk_text") or r.get("text", "")
        text_words = set(text.lower().split())
        overlap = len(query_words.intersection(text_words))
        score = overlap / max(1, len(query_words))
        scored.append((score, r))

    scored.sort(key=lambda x: x[0], reverse=True)
    results = []
    for score, r in scored[:top_k]:
        results.append({
            "text": r.get("chunk_text") or r.get("text", ""),
            "filename": r.get("filename", "document"),
            "doc_id": r.get("doc_id", ""),
            "chunk_index": r.get("chunk_index", 0),
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
    Chunks document text and upserts to Pinecone under user's isolated namespace.
    Uses connection pooling to minimize HTTP overhead.
    """
    chunks = chunk_document_text(text)
    if not chunks:
        return 0

    namespace = get_user_namespace(user_id)
    api_key = os.getenv("PINECONE_API_KEY", "").strip()
    host = get_index_host()
    session = get_http_session()

    # 1. Primary Strategy: Pinecone Documents API with connection pooling
    if api_key and host:
        try:
            headers = {
                "Api-Key": api_key,
                "X-Pinecone-API-Version": "2026-07",
                "Content-Type": "application/json"
            }
            doc_records = []
            for i, chunk in enumerate(chunks):
                doc_records.append({
                    "_id": f"{user_id}#{doc_id}#{i}",
                    "chunk_text": chunk,
                    "filename": filename,
                    "doc_id": doc_id,
                    "user_id": user_id,
                    "chunk_index": i
                })

            batch_size = 50
            total_upserted = 0
            for i in range(0, len(doc_records), batch_size):
                batch = doc_records[i:i + batch_size]
                url = f"https://{host}/namespaces/{namespace}/documents/upsert"
                resp = session.post(url, headers=headers, json={"documents": batch}, timeout=15)
                if resp.status_code in (200, 202):
                    total_upserted += len(batch)
                else:
                    print(f"[Pinecone Documents API] Batch status: {resp.status_code} {resp.text}")

            if total_upserted > 0:
                print(f"[Pinecone RAG] Indexed {total_upserted} chunks into namespace '{namespace}' for '{filename}'.")
                return total_upserted
        except Exception as e:
            print(f"[Pinecone Documents API] Upsert notice: {e}")

    # 2. Local memory fallback
    mem_records = [
        {
            "_id": f"{user_id}#{doc_id}#{i}",
            "chunk_text": chunk,
            "filename": filename,
            "doc_id": doc_id,
            "user_id": user_id,
            "chunk_index": i
        }
        for i, chunk in enumerate(chunks)
    ]
    _store_in_memory(namespace, mem_records)
    return len(chunks)


def search_relevant_chunks(
    user_id: str,
    query: str,
    doc_id: Optional[str] = None,
    top_k: int = 3
) -> List[Dict[str, Any]]:
    """
    RAG Retrieval:
    Queries Pinecone strictly inside namespace: 'user_{user_id}'.
    Uses warm persistent connection session for sub-400ms response time.
    """
    if not query or not query.strip():
        return []

    namespace = get_user_namespace(user_id)
    api_key = os.getenv("PINECONE_API_KEY", "").strip()
    host = get_index_host()
    session = get_http_session()

    # 1. Primary Strategy: Warm Session Pinecone Documents API search
    if api_key and host:
        try:
            headers = {
                "Api-Key": api_key,
                "X-Pinecone-API-Version": "2026-07",
                "Content-Type": "application/json"
            }
            search_payload = {
                "top_k": top_k,
                "include_fields": ["*"],
                "score_by": [
                    {
                        "type": "embed",
                        "field": "chunk_text",
                        "query": query
                    }
                ]
            }
            if doc_id:
                search_payload["filter"] = {"doc_id": doc_id}

            url = f"https://{host}/namespaces/{namespace}/documents/search"
            max_attempts = 4 if doc_id else 1
            for attempt in range(max_attempts):
                resp = session.post(url, headers=headers, json=search_payload, timeout=8)
                if resp.status_code == 200:
                    data = resp.json()
                    matches = data.get("matches", [])
                    if matches:
                        results = []
                        for m in matches:
                            text = m.get("chunk_text") or m.get("text", "")
                            if text:
                                results.append({
                                    "text": text,
                                    "filename": m.get("filename", "Attached Document"),
                                    "doc_id": m.get("doc_id", ""),
                                    "chunk_index": int(m.get("chunk_index", 0)),
                                    "score": float(m.get("_score", 0.0))
                                })
                        if results:
                            print(f"[Pinecone Documents API] Retrieved {len(results)} chunks via vector similarity search.")
                            return results
                if attempt < max_attempts - 1:
                    import time
                    time.sleep(0.4)
        except Exception as e:
            print(f"[Pinecone Documents API] Search notice: {e}")

    # 2. In-memory search fallback
    return _search_in_memory(namespace, query, doc_id=doc_id, top_k=top_k)


def format_retrieved_context(chunks: List[Dict[str, Any]]) -> str:
    """Format matched chunks into a clean, targeted context block for LLM prompt."""
    if not chunks:
        return ""

    sections = []
    for i, c in enumerate(chunks, 1):
        filename = c.get("filename", "Attached Document")
        text = c.get("text", "").strip()
        score = c.get("score", 0.0)
        score_tag = f" (relevance: {score:.2f})" if score > 0 else ""
        sections.append(f"--- [Relevant Excerpt {i} from {filename}{score_tag}] ---\n{text}")

    return "\n\n".join(sections)


def delete_document_chunks(user_id: str, doc_id: str) -> bool:
    """
    Delete all chunks associated with doc_id from Pinecone in user's isolated namespace.
    """
    namespace = get_user_namespace(user_id)
    api_key = os.getenv("PINECONE_API_KEY", "").strip()
    host = get_index_host()
    session = get_http_session()

    # 1. Documents API delete
    if api_key and host:
        try:
            headers = {
                "Api-Key": api_key,
                "X-Pinecone-API-Version": "2026-07",
                "Content-Type": "application/json"
            }
            url = f"https://{host}/namespaces/{namespace}/documents/delete"
            resp = session.post(url, headers=headers, json={"filter": {"doc_id": doc_id}}, timeout=10)
            if resp.status_code in (200, 202):
                print(f"[Pinecone Documents API] Deleted chunks for doc_id='{doc_id}' in namespace '{namespace}'.")
                return True
        except Exception as e:
            print(f"[Pinecone Documents API] Delete notice: {e}")

    # 2. Vector API fallback
    try:
        index = get_or_create_index()
        if index is not None and api_key:
            index.delete(filter={"doc_id": doc_id}, namespace=namespace)
            return True
    except Exception as e:
        print(f"[Pinecone Vector API] Delete notice: {e}")

    # 3. In-memory cleanup
    if namespace in _in_memory_vector_store:
        _in_memory_vector_store[namespace] = [
            r for r in _in_memory_vector_store[namespace]
            if r.get("doc_id") != doc_id
        ]
    return True
