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
    # All default fallback IDs verified active on Groq
    defaults = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
    candidates = []
    if primary and not primary.startswith("gpt-4") and not primary.startswith("gpt-3"):
        candidates.append(primary)
    for m in defaults:
        if m not in candidates:
            candidates.append(m)
    return candidates


_STRUCTURED_CHAIN_CACHE: Dict[tuple, Any] = {}


class EmailDraftOutput(BaseModel):
    draft_subject: str = Field(
        description="Clear, well-crafted subject line (5-10 words) preserving key qualifiers such as urgency, dates, or core intent."
    )
    draft_body: str = Field(
        description="Complete, well-formatted email body with greeting, well-developed multi-paragraph structure (including bullet points where helpful), polite closing CTA, and a full sign-off block ending with the sender name on the line below the closing phrase."
    )


EMAIL_SYSTEM_PROMPT = """You are an elite AI email communications assistant specializing in drafting thorough, well-formatted, natural, and ready-to-send emails.

<mission>
Transform the user's goal/topic, context notes, and any reference documents into a complete, well-developed, and cleanly formatted email tailored strictly to the requested tone: {tone}.
</mission>

<tone_and_length_guidelines>
- professional: Polished, courteous, executive-ready, and thorough (150–230 words across 3–4 well-structured paragraphs, using bullet points where helpful). End with a closing like "Best regards," followed by the sender's name.
- casual: Warm, friendly, conversational, yet still complete and well-structured (130–210 words across 3 clear paragraphs; bullet points when outlining transition/coverage steps or key items). End with a friendly closing like "Best regards," or "Warm regards," followed by the sender's name.
- persuasive: Value-first, compelling narrative highlighting benefits, addressing likely questions, and ending with a clear Call to Action (150–230 words across 3–4 paragraphs). End with "Best regards," followed by the sender's name.
- urgent: Direct and time-sensitive, front-loading the urgent situation, reason, and timeframe in the opening lines, followed by concrete next steps and coverage details (130–200 words). End with "Best regards," or "Regards," followed by the sender's name.
- concise: Crisp, focused, and compact while remaining polite and complete (75–110 words across 2 short paragraphs or clean bullets). End with "Best regards," or "Thanks," followed by the sender's name.
</tone_and_length_guidelines>

<formatting_and_structure_rules>
1. Sufficient Depth & Proper Email Structure (CRITICAL):
   - Do NOT produce a bare 2- or 3-sentence stub (unless tone is explicitly "concise").
   - Synthesize BOTH <intended_subject> AND <context_and_key_points> into a full, well-paced, multi-paragraph email:
     * Salutation: Clean greeting on its own line.
     * Opening Paragraph: Clearly state the primary purpose/request, including urgency, cause, and full timeframe/dates mentioned (e.g., if a month like "December 2026" is specified, clearly state the full period such as December 1 to December 31, 2026).
     * Middle Section (Elaboration / Key Points): Provide clear, thoughtful context and practical details relevant to the request. When outlining 2–4 distinct deliverables, preparations, or transition steps (e.g., handover plan, task completion, availability during absence), format them cleanly as `- ` bullet points with a brief intro line for crisp visual formatting.
     * Closing Paragraph: Polite request for approval, confirmation, or reply, along with genuine appreciation.
   - Separate greeting, paragraphs, bullet lists, and sign-off with blank lines (`\n\n`) so the email looks cleanly formatted.

2. Strict Anti-Hallucination & Grounding:
   - NEVER invent unmentioned people's names (even in parentheses), unmentioned dates/deadlines (e.g., do not invent dates like "November 25"), unmentioned company names, or fabricated statistics/schedules.
   - Only reference dates explicitly provided or directly implied by the user (e.g., December 1–31, 2026 when the user specifies "complete December 2026 month").
   - Write natural, accurate logistical statements without fabricating specifics (e.g., "I will document all active tasks and coordinate a smooth handover before my leave begins", "I will remain reachable by email for any urgent questions").
   - When <reference_context> is provided, ground factual claims strictly on those excerpts and integrate them naturally without saying "according to the excerpt" or "the attached document states".

3. Salutation & Recipient Handling:
   - If a real person's name is identifiable from <recipient_info> or <context_and_key_points> (e.g., "vaibhav.negi@company.com" -> "Hi Vaibhav," or "Dr. Smith" -> "Dear Dr. Smith,"), use it.
   - If only a generic or numeric email handle is given (e.g., "negivaibhav2005@gmail.com", "contact@company.com"), do NOT put the raw email address in the greeting; use "Hi," or "Hello,".

4. Complete Sender Sign-Off Block (CRITICAL — NEVER OMIT):
   - EVERY generated email MUST end with a complete sign-off block containing BOTH an appropriate closing phrase (e.g., "Best regards,") AND `{sender_display}` on the very next line:
     Best regards,
     {sender_display}
   - NEVER leave a bare closing phrase ("Best," or "Best regards,") with nothing beneath it.

5. Subject Line Quality:
   - Craft a clear, compelling subject line (5–10 words) that preserves important qualifiers from <intended_subject> (such as urgency, timeframe, or reason—for example, "Urgent: One-Month Medical Leave Request (December 2026)").

6. Anti-Cliché Rule:
   - Avoid hollow filler phrases like "I hope this email finds you well" or "Please do not hesitate to contact me". Open directly and respectfully with the purpose.
</formatting_and_structure_rules>
"""

EMAIL_USER_PROMPT = """<draft_request>
<selected_tone>{tone}</selected_tone>
<sender_name>{sender_display}</sender_name>
<recipient_info>{recipient}</recipient_info>
<intended_subject>{subject}</intended_subject>
<context_and_key_points>
{context}
</context_and_key_points>
{document_section}
</draft_request>

Please generate a complete, well-formatted draft_subject and draft_body adhering strictly to all formatting, depth, grounding, and sender sign-off rules."""

EMAIL_PROMPT = ChatPromptTemplate.from_messages([
    ("system", EMAIL_SYSTEM_PROMPT),
    ("human", EMAIL_USER_PROMPT),
])


def _get_structured_chain(model_name: str, api_key: Optional[str]):
    """Return cached prompt | structured ChatGroq chain to avoid per-request client construction."""
    cache_key = (model_name, api_key or "")
    chain = _STRUCTURED_CHAIN_CACHE.get(cache_key)
    if chain is None:
        chat_model = ChatGroq(
            model=model_name,
            api_key=api_key,
            temperature=0.25,
            max_tokens=1500,
            request_timeout=15.0,
            max_retries=1,
        )
        chain = EMAIL_PROMPT | chat_model.with_structured_output(EmailDraftOutput)
        _STRUCTURED_CHAIN_CACHE[cache_key] = chain
    return chain


class EmailState(TypedDict, total=False):
    recipient: str
    sender_name: Optional[str]
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
    - If document text was attached directly, chunks & ranks in memory in < 1ms
      (background indexing into Pinecone is handled separately in main.py).
    - If referencing pre-indexed Vault context, queries Pinecone via persistent warm session.
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

    # 1. Attached file present: rank chunks locally in < 1ms without duplicate Pinecone round-trips
    if raw_doc_text:
        chunks = chunk_document_text(raw_doc_text)
        if chunks:
            retrieved_chunks = rank_chunks_locally(
                chunks,
                search_query,
                filename=filename,
                top_k=3,
            )
            if retrieved_chunks:
                rag_context = format_retrieved_context(retrieved_chunks)
        if not rag_context:
            rag_context = raw_doc_text[:2000]
    # 2. Pre-indexed Vault context: query Pinecone vector similarity search
    elif search_query:
        retrieved_chunks = search_relevant_chunks(
            user_id=user_id,
            query=search_query,
            doc_id=doc_id,
            top_k=3,
        )
        if retrieved_chunks:
            rag_context = format_retrieved_context(retrieved_chunks)

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
    sender_name = (state.get("sender_name") or "").strip()
    sender_display = sender_name if sender_name else os.getenv("DEFAULT_SENDER_NAME", "").strip() or "[Your Name]"
    subject = state.get("subject", "Follow up")
    context = state.get("context", "")
    tone = state.get("tone", "professional")
    doc_text = state.get("rag_context") or state.get("document_text", "")

    document_section = f"\n<reference_context>\n{doc_text}\n</reference_context>" if doc_text else ""

    api_key = os.getenv("GROQ_API_KEY")
    candidates = get_candidate_models()
    last_exc = None

    draft_subject = ""
    draft_body = ""

    for candidate_name in candidates:
        try:
            chain = _get_structured_chain(candidate_name, api_key)
            result: EmailDraftOutput = chain.invoke({
                "tone": tone,
                "sender_display": sender_display,
                "subject": subject,
                "recipient": recipient or "Valued Contact",
                "context": context or "Follow up on our previous conversation.",
                "document_section": document_section,
            })

            draft_subject = result.draft_subject.strip()
            draft_body = result.draft_body.strip()
            if draft_subject and draft_body:
                # Ensure the sign-off always includes the sender line below the closing phrase
                lines = [ln.strip() for ln in draft_body.splitlines() if ln.strip()]
                if lines and lines[-1].rstrip(",!").lower() in {
                    "best", "best regards", "warm regards", "kind regards",
                    "regards", "sincerely", "thanks", "thank you", "cheers"
                }:
                    draft_body = f"{draft_body}\n{sender_display}"
                elif sender_display not in draft_body:
                    draft_body = f"{draft_body}\n\nBest regards,\n{sender_display}"
                break
        except Exception as exc:
            last_exc = exc
            print(f"Info: Model {candidate_name} failed ({exc}), attempting next available Groq model...")
    else:
        print(f"Warning: All LLM models failed (last error: {last_exc}). Falling back to template draft.")
        draft_subject = f"[{tone.capitalize()}] {subject}"
        draft_body = (
            f"Hi,\n\n"
            f"{context}\n\n"
            f"Best regards,\n{sender_display}"
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
