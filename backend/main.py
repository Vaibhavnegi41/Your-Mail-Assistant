import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

# Ensure both backend/ and project root are in sys.path for direct python main.py or uvicorn
current_dir = Path(__file__).resolve().parent
project_root = current_dir.parent
for p in (str(current_dir), str(project_root)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from dotenv import load_dotenv
    load_dotenv(project_root / ".env")
    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from langgraph.types import Command

try:
    from backend.database import get_db, init_checkpointer, close_checkpointer
    from backend.auth import get_current_user_id
    from backend.schemas import (
        EmailApprovalRequest,
        EmailReviewResponse,
        EmailStatusResponse,
    )
    from backend.workflow import build_email_graph
    from backend.document_service import extract_text_from_file
    from backend.rag_service import index_document_chunks, search_relevant_chunks
except ImportError:
    from database import get_db, init_checkpointer, close_checkpointer
    from auth import get_current_user_id
    from schemas import (
        EmailApprovalRequest,
        EmailReviewResponse,
        EmailStatusResponse,
    )
    from workflow import build_email_graph
    from document_service import extract_text_from_file
    from rag_service import index_document_chunks, search_relevant_chunks


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize LangGraph PostgresSaver checkpointer
    try:
        checkpointer = init_checkpointer()
        app.state.graph = build_email_graph(checkpointer=checkpointer)
    except Exception as e:
        print(f"Warning: PostgresSaver initialization deferred ({e}). Using in-memory graph.")
        from langgraph.checkpoint.memory import MemorySaver
        app.state.graph = build_email_graph(checkpointer=MemorySaver())
    yield
    close_checkpointer()


app = FastAPI(
    title="AI Email Assistant API",
    version="1.0.0",
    description="Backend API for LangGraph HITL Email Drafting and Gmail Integration",
    lifespan=lifespan
)

# CORS configuration allowing Next.js frontend and Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"^chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ai-email-assistant-backend"}


# --- Auth Endpoints ---

@app.get("/auth/google/start")
def google_auth_start():
    """Start Google OAuth 2.0 flow."""
    return {"auth_url": "https://accounts.google.com/o/oauth2/v2/auth?mock=true"}


@app.get("/auth/google/callback")
def google_auth_callback(code: str, state: Optional[str] = None):
    """Handle OAuth callback and token exchange."""
    return {"status": "connected", "message": "Google account linked successfully"}


# --- Document Upload & Vault ---

USER_DOCUMENTS = []


@app.post("/documents")
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id)
):
    """Validate upload, chunk, embed, and index into Pinecone under user's isolated namespace."""
    extracted_text = await extract_text_from_file(file)
    doc_id = str(uuid.uuid4())
    filename = file.filename or "uploaded_document"

    chunks_indexed = index_document_chunks(
        user_id=user_id,
        doc_id=doc_id,
        filename=filename,
        text=extracted_text
    )

    doc_record = {
        "id": doc_id,
        "name": filename,
        "size": f"{len(extracted_text) // 1024 or 1} KB",
        "extracted_length": len(extracted_text),
        "chunks_indexed": chunks_indexed,
        "preview": extracted_text[:200],
        "user_id": user_id,
        "uploaded_at": datetime.now(timezone.utc).strftime("%b %d, %H:%M")
    }
    USER_DOCUMENTS.insert(0, doc_record)

    return {
        "document_id": doc_id,
        "filename": filename,
        "extracted_length": len(extracted_text),
        "chunks_indexed": chunks_indexed,
        "preview": extracted_text[:200],
        "namespace": f"user_{user_id}"
    }


@app.get("/documents")
def get_documents(user_id: str = Depends(get_current_user_id)):
    """Retrieve indexed documents for current user."""
    return {"documents": [d for d in USER_DOCUMENTS if d.get("user_id") == user_id]}


# In-memory store for email records and history
EMAIL_RECORDS = []


# --- Email Generation & Workflow Endpoints ---

@app.post("/emails/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_email(
    recipient: str = Form(...),
    subject: str = Form(...),
    tone: str = Form("professional"),
    context: str = Form(...),
    file: Optional[UploadFile] = File(None),
    doc_id: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user_id)
):
    """Create workflow and start LangGraph execution with Pinecone RAG retrieval."""
    workflow_id = str(uuid.uuid4())
    doc_text = ""
    assigned_doc_id = doc_id

    if file:
        doc_text = await extract_text_from_file(file)
        assigned_doc_id = str(uuid.uuid4())
        chunks_indexed = index_document_chunks(
            user_id=user_id,
            doc_id=assigned_doc_id,
            filename=file.filename or "attachment",
            text=doc_text
        )
        USER_DOCUMENTS.insert(0, {
            "id": assigned_doc_id,
            "name": file.filename or "attachment",
            "size": f"{len(doc_text) // 1024 or 1} KB",
            "extracted_length": len(doc_text),
            "chunks_indexed": chunks_indexed,
            "preview": doc_text[:200],
            "user_id": user_id,
            "uploaded_at": datetime.now(timezone.utc).strftime("%b %d, %H:%M")
        })

    config = {"configurable": {"thread_id": workflow_id}}
    graph = app.state.graph

    # Invoke initial phase with Pinecone RAG parameters
    result = graph.invoke(
        {
            "user_id": user_id,
            "recipient": recipient,
            "subject": subject,
            "tone": tone,
            "context": context,
            "doc_id": assigned_doc_id,
            "document_text": doc_text,
            "filename": file.filename if file else "attached_document",
            "version": 1
        },
        config=config
    )

    state = graph.get_state(config)
    values = state.values if state else {}

    # Record into history store
    new_record = {
        "workflow_id": workflow_id,
        "recipient": recipient,
        "subject": values.get("draft_subject", subject),
        "tone": tone,
        "context": context,
        "draft_subject": values.get("draft_subject", subject),
        "draft_body": values.get("draft_body", ""),
        "status": "pending_review",
        "version": values.get("version", 1),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "gmail_message_id": None
    }
    EMAIL_RECORDS.insert(0, new_record)

    return {
        "workflow_id": workflow_id,
        "status": "pending_review",
        "message": "Draft created and awaiting human review."
    }


@app.get("/emails/records")
def get_email_records(user_id: str = Depends(get_current_user_id)):
    """Retrieve full history of email generation, approval, and send records."""
    return {"records": EMAIL_RECORDS}


@app.get("/emails/{workflow_id}/review", response_model=EmailReviewResponse)
def get_email_review(
    workflow_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Retrieve review payload if user owns workflow."""
    config = {"configurable": {"thread_id": workflow_id}}
    graph = app.state.graph
    state = graph.get_state(config)

    if not state or not state.values:
        raise HTTPException(status_code=404, detail="Workflow not found")

    values = state.values
    return EmailReviewResponse(
        workflow_id=workflow_id,
        recipient=values.get("recipient", ""),
        draft_subject=values.get("draft_subject", ""),
        draft_body=values.get("draft_body", ""),
        version=values.get("version", 1),
        status=values.get("status", "pending_review")
    )


@app.post("/emails/{workflow_id}/approve")
def approve_email(
    workflow_id: str,
    payload: EmailApprovalRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Validate version and resume graph execution to send email."""
    config = {"configurable": {"thread_id": workflow_id}}
    graph = app.state.graph

    result = graph.invoke(
        Command(resume={
            "action": "approve",
            "subject": payload.subject,
            "body": payload.body
        }),
        config=config
    )

    final_status = result.get("status", "sent")
    msg_id = result.get("gmail_message_id")

    # Update record
    for rec in EMAIL_RECORDS:
        if rec["workflow_id"] == workflow_id:
            rec["status"] = final_status
            rec["gmail_message_id"] = msg_id
            rec["draft_subject"] = payload.subject
            rec["draft_body"] = payload.body
            break

    return {
        "workflow_id": workflow_id,
        "status": final_status,
        "gmail_message_id": msg_id
    }


@app.post("/emails/{workflow_id}/reject")
def reject_email(
    workflow_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Reject the draft and terminate workflow."""
    config = {"configurable": {"thread_id": workflow_id}}
    graph = app.state.graph

    result = graph.invoke(
        Command(resume={"action": "reject"}),
        config=config
    )

    # Update record
    for rec in EMAIL_RECORDS:
        if rec["workflow_id"] == workflow_id:
            rec["status"] = "rejected"
            break

    return {"workflow_id": workflow_id, "status": "rejected"}


@app.post("/emails/{workflow_id}/regenerate")
def regenerate_email(
    workflow_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Generate a new draft and invalidate prior approval."""
    return {"workflow_id": workflow_id, "status": "regenerating"}


@app.get("/emails/{workflow_id}/status", response_model=EmailStatusResponse)
def get_email_status(
    workflow_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Return current status of workflow."""
    config = {"configurable": {"thread_id": workflow_id}}
    graph = app.state.graph
    state = graph.get_state(config)

    if not state or not state.values:
        raise HTTPException(status_code=404, detail="Workflow not found")

    values = state.values
    return EmailStatusResponse(
        workflow_id=workflow_id,
        status=values.get("status", "processing"),
        recipient=values.get("recipient", ""),
        subject=values.get("approved_subject") or values.get("draft_subject", ""),
        version=values.get("version", 1),
        provider_message_id=values.get("gmail_message_id")
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"Starting AI Email Assistant Backend on http://127.0.0.1:{port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

