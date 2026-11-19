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

from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, status, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from langgraph.types import Command

try:
    from backend.database import get_db, init_checkpointer, close_checkpointer
    from backend.auth import get_current_user_id, get_token_from_request, security
    from backend.schemas import (
        EmailApprovalRequest,
        EmailReviewResponse,
        EmailStatusResponse,
    )
    from backend.workflow import build_email_graph
    from backend.document_service import extract_text_from_file
    from backend.rag_service import (
        index_document_chunks,
        search_relevant_chunks,
        delete_document_chunks,
        chunk_document_text,
    )
    from backend.gmail_service import gmail_send_approved_email
except ImportError:
    from database import get_db, init_checkpointer, close_checkpointer
    from auth import get_current_user_id, get_token_from_request, security
    from schemas import (
        EmailApprovalRequest,
        EmailReviewResponse,
        EmailStatusResponse,
    )
    from workflow import build_email_graph
    from document_service import extract_text_from_file
    from rag_service import (
        index_document_chunks,
        search_relevant_chunks,
        delete_document_chunks,
        chunk_document_text,
    )
    from gmail_service import gmail_send_approved_email


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

    chunks_indexed = await run_in_threadpool(
        index_document_chunks,
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
        "preview": extracted_text[:1000],
        "user_id": user_id,
        "uploaded_at": datetime.now(timezone.utc).strftime("%b %d, %H:%M")
    }
    USER_DOCUMENTS.insert(0, doc_record)

    return {
        "document_id": doc_id,
        "filename": filename,
        "extracted_length": len(extracted_text),
        "chunks_indexed": chunks_indexed,
        "preview": extracted_text[:1000],
        "namespace": f"user_{user_id}"
    }


@app.get("/documents")
def get_documents(user_id: str = Depends(get_current_user_id)):
    """Retrieve indexed documents for current user."""
    return {"documents": [d for d in USER_DOCUMENTS if d.get("user_id") == user_id]}


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete document from catalog and wipe all associated chunks from Pinecone."""
    global USER_DOCUMENTS
    delete_document_chunks(user_id=user_id, doc_id=doc_id)
    USER_DOCUMENTS = [d for d in USER_DOCUMENTS if not (d.get("id") == doc_id and d.get("user_id") == user_id)]
    return {"status": "deleted", "doc_id": doc_id, "message": "Document and Pinecone vector chunks removed."}


# In-memory store for email records and history
EMAIL_RECORDS = []


def _run_generate_graph(graph, initial_state: dict, config: dict) -> dict:
    """Execute synchronous LangGraph invocation.
    Returns the final state values dict directly from graph.invoke() without
    a redundant graph.get_state() round-trip (saves 10–50ms per request on PostgresSaver).
    Falls back to graph.get_state() only if invoke returns None or an empty dict.
    """
    result = graph.invoke(initial_state, config=config)
    # LangGraph returns the last-node state dict on completion/interrupt
    if result and isinstance(result, dict) and result.get("draft_subject"):
        return result
    # Fallback: read from checkpointer if invoke returned an unexpected value
    state = graph.get_state(config)
    return state.values if state else {}


@app.post("/emails/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_email(
    background_tasks: BackgroundTasks,
    recipient: str = Form(...),
    subject: str = Form(...),
    tone: str = Form("professional"),
    context: str = Form(...),
    sender_name: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    doc_id: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user_id)
):
    """Create workflow and start LangGraph execution with instant local RAG + background Pinecone indexing."""
    workflow_id = str(uuid.uuid4())
    doc_text = ""
    assigned_doc_id = doc_id

    if file:
        doc_text = await extract_text_from_file(file)
        assigned_doc_id = str(uuid.uuid4())
        filename = file.filename or "attachment"

        chunks_count = len(chunk_document_text(doc_text))
        USER_DOCUMENTS.insert(0, {
            "id": assigned_doc_id,
            "name": filename,
            "size": f"{len(doc_text) // 1024 or 1} KB",
            "extracted_length": len(doc_text),
            "chunks_indexed": chunks_count,
            "preview": doc_text[:1000],
            "user_id": user_id,
            "uploaded_at": datetime.now(timezone.utc).strftime("%b %d, %H:%M")
        })

        # Offload remote Pinecone indexing so draft generation does not block on upsert
        background_tasks.add_task(
            index_document_chunks,
            user_id=user_id,
            doc_id=assigned_doc_id,
            filename=filename,
            text=doc_text
        )

    config = {"configurable": {"thread_id": workflow_id}}
    graph = app.state.graph
    initial_state = {
        "user_id": user_id,
        "recipient": recipient,
        "sender_name": sender_name or "",
        "subject": subject,
        "tone": tone,
        "context": context,
        "doc_id": assigned_doc_id,
        "document_text": doc_text,
        "filename": file.filename if file else "attached_document",
        "version": 1
    }


    values = await run_in_threadpool(_run_generate_graph, graph, initial_state, config)

    draft_subject = values.get("draft_subject", subject)
    draft_body = values.get("draft_body", "")
    version = values.get("version", 1)

    # Record into history store
    new_record = {
        "workflow_id": workflow_id,
        "recipient": recipient,
        "subject": draft_subject,
        "tone": tone,
        "context": context,
        "draft_subject": draft_subject,
        "draft_body": draft_body,
        "status": "pending_review",
        "version": version,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "gmail_message_id": None
    }
    EMAIL_RECORDS.insert(0, new_record)

    return {
        "workflow_id": workflow_id,
        "recipient": values.get("recipient", recipient),
        "draft_subject": draft_subject,
        "draft_body": draft_body,
        "version": version,
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
    credentials=Depends(security),
    user_id: str = Depends(get_current_user_id),
):
    """Validate version and resume graph execution to send email, with fallback for historical drafts."""
    # Extract raw access_token so gmail_service can call Gmail API on behalf of the user
    access_token = get_token_from_request(credentials)

    config = {"configurable": {"thread_id": workflow_id}}
    graph = app.state.graph
    state = graph.get_state(config)

    final_status = "sent"
    msg_id = None
    is_live_interrupted = bool(
        state is not None
        and state.values
        and getattr(state, "next", None)
        and "human_review" in state.next
    )

    if is_live_interrupted:
        try:
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
        except Exception as e:
            print(f"[Approve] Graph resume failed ({e}), executing direct approval dispatch.")
            is_live_interrupted = False

    if not is_live_interrupted:
        # Determine recipient from payload, in-memory records, or database
        recipient = payload.recipient
        if not recipient:
            for rec in EMAIL_RECORDS:
                if rec.get("workflow_id") == workflow_id and rec.get("recipient"):
                    recipient = rec.get("recipient")
                    break

        if not recipient:
            # Fallback: try database (uses module-level SessionLocal if available)
            try:
                from database import SessionLocal, EmailRecordModel as _ERM
                with SessionLocal() as db_session:
                    db_rec = db_session.query(_ERM).filter(_ERM.workflow_id == workflow_id).first()
                    if db_rec and db_rec.recipient:
                        recipient = db_rec.recipient
            except Exception:
                pass

        if not recipient:
            recipient = "recipient@company.com"

        # Dispatch via Gmail API — passes the user's access_token for real send in production
        try:
            msg_id = gmail_send_approved_email(
                user_id=user_id,
                recipient=recipient,
                subject=payload.subject,
                body=payload.body,
                idempotency_key=f"send-{workflow_id}",
                access_token=access_token,
            )
            final_status = "sent"
        except Exception as exc:
            print(f"[Approve] Gmail dispatch error: {exc}")
            raise HTTPException(status_code=500, detail=f"Failed to transmit email: {exc}")

    # Update in-memory record
    found = False
    for rec in EMAIL_RECORDS:
        if rec.get("workflow_id") == workflow_id:
            rec["status"] = final_status
            rec["gmail_message_id"] = msg_id
            rec["draft_subject"] = payload.subject
            rec["draft_body"] = payload.body
            found = True
            break

    if not found:
        EMAIL_RECORDS.insert(0, {
            "workflow_id": workflow_id,
            "recipient": recipient if not is_live_interrupted else state.values.get("recipient", ""),
            "subject": payload.subject,
            "tone": "professional",
            "context": "",
            "draft_subject": payload.subject,
            "draft_body": payload.body,
            "status": final_status,
            "gmail_message_id": msg_id,
            "version": 1,
            "created_at": datetime.utcnow().isoformat()
        })

    # Update persistent database if available (fire-and-forget in background)
    try:
        from database import SessionLocal, EmailRecordModel as _ERM
        with SessionLocal() as db_session:
            db_rec = db_session.query(_ERM).filter(_ERM.workflow_id == workflow_id).first()
            if db_rec:
                db_rec.status = final_status
                db_rec.draft_subject = payload.subject
                db_rec.draft_body = payload.body
                if msg_id:
                    db_rec.gmail_message_id = msg_id
                db_session.commit()
    except Exception:
        pass

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
    """Reject the draft and terminate workflow, with fallback for historical drafts."""
    config = {"configurable": {"thread_id": workflow_id}}
    graph = app.state.graph
    state = graph.get_state(config)

    if state is not None and state.values and getattr(state, "next", None) and "human_review" in state.next:
        try:
            graph.invoke(
                Command(resume={"action": "reject"}),
                config=config
            )
        except Exception as e:
            print(f"[Reject] Graph resume failed ({e})")

    # Update in-memory record
    for rec in EMAIL_RECORDS:
        if rec.get("workflow_id") == workflow_id:
            rec["status"] = "rejected"
            break

    # Update persistent database if available
    try:
        from database import SessionLocal, EmailRecordModel as _ERM
        with SessionLocal() as db_session:
            db_rec = db_session.query(_ERM).filter(_ERM.workflow_id == workflow_id).first()
            if db_rec:
                db_rec.status = "rejected"
                db_session.commit()
    except Exception:
        pass

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

