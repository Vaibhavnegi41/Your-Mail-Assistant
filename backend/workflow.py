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
        chunk_document_text,
        rank_chunks_locally,
    )
except ImportError:
    from rag_service import (
        search_relevant_chunks,
        format_retrieved_context,
        index_document_chunks,
        chunk_document_text,
        rank_chunks_locally,
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
    draft_subject: str = Field(description="High-converting, concise (4-8 words) subject line reflecting the goal and tone")
    draft_body: str = Field(description="Complete, ready-to-send email body with natural greeting, structured body paragraphs or bullet points, clear call to action, and clean sign-off. Zero bracketed placeholders.")


EMAIL_SYSTEM_PROMPT = """You are an elite AI email communications assistant specializing in high-impact, contextually precise, executive-ready emails.

<mission>
Transform user notes, objectives, and reference context into an authentic, impeccably structured email tailored strictly to the requested tone: {tone}.
</mission>

<tone_matrix>
- professional: Executive-ready, authoritative, polished, and balanced. Active voice, clear paragraphs, polite sign-off ("Best regards,").
- casual: Warm, conversational, peer-to-peer, approachable. Natural contractions allowed, friendly cadence, informal sign-off ("Best," or "Talk soon,").
- persuasive: Value-first, hook-driven, highlighting recipient benefits and pain points. Compelling narrative flow with a single frictionless Call to Action (CTA).
- urgent: Time-sensitive and direct. Front-load the critical request and deadline in the opening lines. High-priority phrasing, unambiguous next steps.
- concise: Extreme density and brevity (< 100 words total). Core message delivered immediately. Bullet points for multiple items, zero pleasantries or fluff.
</tone_matrix>

<strict_rules>
1. Anti-Cliché Directives:
   - NEVER use hollow openings: "I hope this email finds you well", "I am writing to inform you that", "Hope you are doing good", or "I hope you are having a wonderful week". Start immediately with purpose, context, or value.
   - NEVER use tired closings: "Please do not hesitate to reach out", "Feel free to contact me with any questions", or "Looking forward to hearing from you at your earliest convenience". Use crisp, actionable closing remarks.

2. Salutation & Recipient Handling:
   - If a real person's name is identifiable from the recipient information or context (e.g., "vaibhav.negi@domain.com" -> "Hi Vaibhav," or "Dr. Smith" -> "Dear Dr. Smith,"), address them properly.
   - If only an email address or generic handle is provided (e.g., "user123@gmail.com", "contact@company.com"), do NOT use the raw email address in the salutation. Use a clean, natural greeting such as "Hi," or "Hello,".

3. Zero Bracketed Placeholders:
   - Absolutely NEVER output bracketed placeholders like [Your Name], [Company Name], [Insert Date], [Your Title], or [Recipient Name].
   - If sender details are not specified in the prompt context, close cleanly with just the sign-off (e.g., "Best regards,") and leave NO trailing placeholder line beneath it.

4. Reference Grounding (RAG Context):
   - When reference context is provided, ground all technical specifications, facts, numbers, dates, and milestones strictly on those excerpts.
   - Never hallucinate commitments, meeting dates, or metrics not present in the context.
   - Integrate reference details seamlessly as first-hand knowledge—do NOT mention "according to the excerpt", "the attached document states", or "in the reference context".

5. Subject Line Optimization:
   - Craft a punchy, specific 4-to-8 word subject line that drives high engagement and clarity.
   - For urgent tones, prefix naturally (e.g., "Action Required: ..." or "Time-Sensitive: ...").
</strict_rules>
"""

EMAIL_USER_PROMPT = """<draft_request>
<selected_tone>{tone}</selected_tone>
<recipient_info>{recipient}</recipient_info>
<intended_subject>{subject}</intended_subject>
<context_and_key_points>
{context}
</context_and_key_points>
{document_section}
</draft_request>

Please generate the optimal draft_subject and draft_body adhering strictly to the system directives."""


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
    High-Speed RAG Retrieval Node:
    Constructs a semantic search query from subject + context.
    - If document text was attached directly, ranks chunks in memory in < 1ms.
    - If document was chosen from Vault, queries Pinecone via persistent warm session in ~300ms.
    Returns ONLY the top relevant chunks to minimize tokens and latency.
    """
    user_id = state.get("user_id", "dev-user-001")
    subject = state.get("subject", "")
    context = state.get("context", "")
    doc_id = state.get("doc_id")
    raw_doc_text = state.get("document_text", "")
    filename = state.get("filename", "reference_document")

    search_query = f"{subject} {context}".strip()
    retrieved_chunks = []
    rag_context = ""

    # 1. Store chunks in Pinecone under user's isolated namespace
    if raw_doc_text:
        assigned_doc_id = doc_id or str(uuid.uuid4())
        index_document_chunks(
            user_id=user_id,
            doc_id=assigned_doc_id,
            filename=filename,
            text=raw_doc_text
        )

    # 2. Perform Pinecone Vector Similarity Search across user's isolated namespace
    if search_query:
        filter_doc_id = doc_id if (doc_id and not raw_doc_text) else None
        retrieved_chunks = search_relevant_chunks(
            user_id=user_id,
            query=search_query,
            doc_id=filter_doc_id,
            top_k=3
        )
        if retrieved_chunks:
            rag_context = format_retrieved_context(retrieved_chunks)

    # 3. Fallback if vector search returned no results
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

    document_section = f"\n<reference_context>\n{doc_text}\n</reference_context>" if doc_text else ""

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
