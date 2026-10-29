import os
from typing import TypedDict, Literal, Optional
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt
from dotenv import load_dotenv
from langchain_groq import ChatGroq


load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

model = ChatGroq(
    model="openai/gpt-oss-120b",
    api_key=GROQ_API_KEY,
    temperature=0.2,
    max_tokens=1024
)

class EmailState(TypedDict, total=False):
    recipient: str
    subject: str
    tone: str
    context: str
    document_text: str
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
    """Validate and sanitize prompt context and document text."""
    doc_text = state.get("document_text", "")
    # Bound untrusted document text to avoid exceeding limits
    truncated_text = doc_text[:10000] if doc_text else ""
    return {
        "document_text": truncated_text,
        "status": "context_prepared"
    }


def generate_email(state: EmailState):
    """Call LLM with structured output prompt."""
    # LLM generation placeholder (integrate langchain_openai / ChatOpenAI here)
    recipient = state.get("recipient", "")
    subject = state.get("subject", "Follow up")
    context = state.get("context", "")
    tone = state.get("tone", "professional")

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
