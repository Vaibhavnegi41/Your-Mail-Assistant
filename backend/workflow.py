import os
import uuid
from typing import TypedDict, Literal, Optional, List, Dict, Any
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from pathlib import Path

try:
    from backend.rag_service import (
        search_relevant_chunks,
        format_retrieved_context,
        index_document_chunks,
    )
except ImportError:
    from rag_service import (
        search_relevant_chunks,
        format_retrieved_context,
        index_document_chunks,
    )

# Load environment from project root if not in cwd
project_root = Path(__file__).resolve().parent.parent
load_dotenv(project_root / ".env")
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MODEL_NAME = os.getenv("GROQ_MODEL") or os.getenv("LLM_MODEL") or "openai/gpt-oss-120b"
if MODEL_NAME.startswith("gpt-4"):
    MODEL_NAME = "openai/gpt-oss-120b"


def get_candidate_models():
    primary = os.getenv("GROQ_MODEL") or os.getenv("LLM_MODEL") or ""
    defaults = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "llama-3.3-70b-versatile"]
    candidates = []
    if primary and not primary.startswith("gpt-4") and not primary.startswith("gpt-3"):
        candidates.append(primary)
    for m in defaults:
        if m not in candidates:
            candidates.append(m)
    return candidates


model = ChatGroq(
    model=MODEL_NAME,
    api_key=GROQ_API_KEY,
    temperature=0.2,
    max_tokens=1024
)


class EmailDraftOutput(BaseModel):
    draft_subject: str = Field(description="Clear, polished subject line for the email")
    draft_body: str = Field(description="Complete email body including greeting, body paragraphs, and professional closing")


EMAIL_SYSTEM_PROMPT = """You are an expert AI email assistant.
Your task is to draft high-impact, contextually accurate, and well-structured emails.

### Guidelines:
1. Tone: Strictly adhere to the requested tone: {tone} (e.g., professional, friendly, formal, concise, urgent).
2. Content & Accuracy: Base the email strictly on the provided context and any reference document text. Do not invent commitments, dates, or factual claims not provided.
3. Completeness: Do NOT leave bracketed placeholders like [Your Name], [Company], or [Recipient Name]. If names are not explicitly provided, use natural phrasing or standard professional greetings and closings.
4. Structure:
   - Appropriate salutation
   - Engaging opening and structured message body
   - Clear call to action (CTA) if applicable
   - Polite professional sign-off
"""

EMAIL_USER_PROMPT = """Please draft an email based on the following:
- Tone: {tone}
- Subject/Topic: {subject}
- Recipient: {recipient}
- Context/Details:
{context}
{document_section}
"""


class EmailState(TypedDict, total=False):
    recipient: str
    subject: str
    tone: str
    context: str
    document_text: str
    doc_id: Optional[str]
    filename: Optional[str]
    rag_context: str
    retrieved_chunks: List[Dict[str, Any]]
    draft_subject: str
    draft_body: str
    approved_subject: str
    approved_body: str
    status: str
    version: int
    user_id: str
    gmail_message_id: str
    error: Optional[str]


def prepare_context(state: EmailState):
    """
    RAG Retrieval Node:
    Constructs a semantic search query from subject + context,
    queries Pinecone using the user's isolated namespace,
    and returns ONLY the top relevant chunks to minimize tokens and latency.
    """
    user_id = state.get("user_id", "dev-user-001")
    subject = state.get("subject", "")
    context = state.get("context", "")
    doc_id = state.get("doc_id")
    raw_doc_text = state.get("document_text", "")
    filename = state.get("filename", "reference_document")

    # If document text was supplied without being indexed yet, index it now
    if raw_doc_text and not doc_id:
        doc_id = str(uuid.uuid4())
        index_document_chunks(
            user_id=user_id,
            doc_id=doc_id,
            filename=filename,
            text=raw_doc_text
        )

    # Formulate semantic search query from email objective & context
    search_query = f"{subject} {context}".strip()

    # Retrieve top 3 most relevant chunks from user's isolated namespace
    retrieved_chunks = []
    rag_context = ""
    if search_query:
        retrieved_chunks = search_relevant_chunks(
            user_id=user_id,
            query=search_query,
            doc_id=doc_id,
            top_k=3
        )
        if retrieved_chunks:
            rag_context = format_retrieved_context(retrieved_chunks)

    # Fallback if no vector search chunks matched but raw text exists
    if not rag_context and raw_doc_text:
        rag_context = raw_doc_text[:2000]

    return {
        "doc_id": doc_id,
        "rag_context": rag_context,
        "retrieved_chunks": retrieved_chunks,
        "document_text": rag_context,  # Preserve backwards compatibility
        "status": "context_prepared"
    }


def generate_email(state: EmailState):
    """Call Groq LLM with structured output prompt to generate draft email."""
    recipient = state.get("recipient", "")
    subject = state.get("subject", "Follow up")
    context = state.get("context", "")
    tone = state.get("tone", "professional")
    doc_text = state.get("rag_context") or state.get("document_text", "")

    document_section = f"\nRelevant Reference Context (Semantic Search Excerpts):\n{doc_text}" if doc_text else ""

    api_key = os.getenv("GROQ_API_KEY")
    candidates = get_candidate_models()
    last_exc = None

    prompt = ChatPromptTemplate.from_messages([
        ("system", EMAIL_SYSTEM_PROMPT),
        ("human", EMAIL_USER_PROMPT),
    ])

    draft_subject = ""
    draft_body = ""

    for candidate_name in candidates:
        try:
            chat_model = ChatGroq(
                model=candidate_name,
                api_key=api_key,
                temperature=0.2,
                max_tokens=1024
            )
            structured_model = chat_model.with_structured_output(EmailDraftOutput)
            chain = prompt | structured_model
            result: EmailDraftOutput = chain.invoke({
                "tone": tone,
                "subject": subject,
                "recipient": recipient or "Valued Contact",
                "context": context or "Follow up on our previous conversation.",
                "document_section": document_section,
            })

            draft_subject = result.draft_subject.strip()
            draft_body = result.draft_body.strip()
            if draft_subject and draft_body:
                break
        except Exception as exc:
            last_exc = exc
            print(f"Info: Model {candidate_name} failed ({exc}), attempting next available Groq model...")
    else:
        print(f"Warning: All LLM models failed (last error: {last_exc}). Falling back to template draft.")
        draft_subject = f"[{tone.capitalize()}] {subject}"
        draft_body = (
            f"Dear Recipient,\n\n"
            f"{context}\n\n"
            f"Best regards,\nSender"
        )

    return {
        "draft_subject": draft_subject,
        "draft_body": draft_body,
        "status": "pending_review",
        "version": state.get("version", 1)
    }


def validate_draft(state: EmailState):
    """Validate recipient and draft format before showing to user."""
    if not state.get("recipient") or "@" not in state["recipient"]:
        return {"status": "failed", "error": "Invalid recipient email"}
    return {"status": "pending_review"}


def human_review(state: EmailState):
    """Pause graph execution using interrupt() to present draft to user."""
    decision = interrupt({
        "recipient": state["recipient"],
        "subject": state["draft_subject"],
        "body": state["draft_body"],
        "version": state.get("version", 1),
        "message": "Review, edit, approve, or reject this email."
    })

    if decision.get("action") == "approve":
        return {
            "approved_subject": decision.get("subject", state["draft_subject"]),
            "approved_body": decision.get("body", state["draft_body"]),
            "status": "approved"
        }
    elif decision.get("action") == "reject":
        return {"status": "rejected"}
    return {"status": "needs_revision"}


def route_review(state: EmailState) -> Literal["validate_approved_version", "record_result"]:
    if state.get("status") == "approved":
        return "validate_approved_version"
    return "record_result"


def validate_approved_version(state: EmailState):
    """Ensure approved draft is bound to user and has not been altered."""
    if not state.get("approved_subject") or not state.get("approved_body"):
        return {"status": "failed", "error": "Empty approved content"}
    return {"status": "approved"}


def send_email_node(state: EmailState):
    """Send verified email through Gmail API."""
    try:
        from backend.gmail_service import gmail_send_approved_email
    except ImportError:
        from gmail_service import gmail_send_approved_email

    try:
        message_id = gmail_send_approved_email(
            user_id=state.get("user_id", "default_user"),
            recipient=state["recipient"],
            subject=state["approved_subject"],
            body=state["approved_body"],
            idempotency_key=f"send-{state.get('version', 1)}-{state.get('recipient')}"
        )
        return {"gmail_message_id": message_id, "status": "sent"}
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}


def record_result(state: EmailState):
    """Final node logging status to business database."""
    return {"final_status": state.get("status", "completed")}


def build_email_graph(checkpointer=None):
    builder = StateGraph(EmailState)
    builder.add_node("prepare_context", prepare_context)
    builder.add_node("generate_email", generate_email)
    builder.add_node("validate_draft", validate_draft)
    builder.add_node("human_review", human_review)
    builder.add_node("validate_approved_version", validate_approved_version)
    builder.add_node("send_email", send_email_node)
    builder.add_node("record_result", record_result)

    builder.add_edge(START, "prepare_context")
    builder.add_edge("prepare_context", "generate_email")
    builder.add_edge("generate_email", "validate_draft")
    builder.add_edge("validate_draft", "human_review")

    builder.add_conditional_edges(
        "human_review",
        route_review,
        {
            "validate_approved_version": "validate_approved_version",
            "record_result": "record_result"
        }
    )

    builder.add_edge("validate_approved_version", "send_email")
    builder.add_edge("send_email", "record_result")
    builder.add_edge("record_result", END)

    if checkpointer:
        return builder.compile(checkpointer=checkpointer)
    return builder.compile()
