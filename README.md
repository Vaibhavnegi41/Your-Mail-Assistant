# AI Email Assistant

> **Chrome Extension / Web App &bull; Next.js 14 &bull; LangGraph HITL &bull; Gmail API &bull; PostgreSQL**

An AI-powered email drafting assistant with a **Human-In-The-Loop (HITL)** approval flow. Users specify recipient, goal, tone, context, and optional reference files (PDF, DOCX, TXT). LangGraph orchestrates structured generation and validation, pauses for human review and editing, and sends the final approved draft through the Gmail API only after explicit user confirmation.

---

## Architecture Overview

- **Frontend (`frontend/`)**: **Next.js 14** (App Router, TypeScript, modern UI, reactive HITL review console) - *configured in place of React + Vite per user request*.
- **Backend (`backend/`)**: **FastAPI** with LangGraph orchestration, session & token validation, and file parsing.
- **AI Workflow (`backend/workflow.py`)**: **LangGraph** state graph with `interrupt()` for human approval and PostgresSaver checkpointing.
- **Email Delivery (`backend/gmail_service.py`)**: **Gmail API** with OAuth 2.0 authorization, MIME construction, and idempotency guarantees.
- **Persistence (`backend/models.py`)**: **PostgreSQL** for application records (`users`, `documents`, `email_drafts`, `email_approvals`, `email_sends`) + LangGraph `PostgresSaver`.
- **Extension (`extension/`)**: **Chrome Manifest V3** side panel embedding the assistant directly inside the browser.

---

## Repository Structure

```text
Email-Assistant/
├── backend/
│   ├── __init__.py               # Python package initialization
│   ├── main.py                   # FastAPI application & REST endpoints
│   ├── workflow.py               # LangGraph HITL StateGraph with interrupt() & resume
│   ├── database.py               # SQLAlchemy database session & PostgresSaver checkpointer
│   ├── auth.py                   # Google OAuth verification & security guards
│   ├── gmail_service.py          # MIME email construction & Gmail API sender
│   ├── document_service.py       # PDF/DOCX/TXT file parsing & text extraction
│   ├── models.py                 # SQLAlchemy relational tables (users, drafts, sends, etc.)
│   ├── schemas.py                # Pydantic request/response schemas
│   └── requirements.txt          # Python dependencies
│
├── frontend/                     # Next.js 14 Frontend (App Router + TypeScript)
│   ├── package.json              # Next.js scripts & dependencies
│   ├── tsconfig.json             # TypeScript configuration & path aliases
│   ├── next.config.mjs           # Next.js config with backend API proxy rewrites
│   └── src/
│       ├── app/
│       │   ├── layout.tsx        # App Router root layout & metadata
│       │   ├── page.tsx          # Main interactive drafting & HITL approval station
│       │   └── globals.css       # Design system tokens, glassmorphism & responsive styles
│       ├── components/
│       │   ├── EmailForm.tsx     # Recipient, subject, tone & context input form
│       │   ├── DocumentUpload.tsx# Drag-and-drop reference document attachment
│       │   ├── DraftEditor.tsx   # Live draft subject & body editor
│       │   ├── ApprovalPanel.tsx # Approve, Reject, & Regenerate actions
│       │   ├── StatusBadge.tsx   # Visual status badge for workflow state machine
│       │   └── Header.tsx        # Top branding header & service status
│       └── lib/
│           ├── api.ts            # Client API calls matching backend endpoints
│           └── types.ts          # TypeScript domain interfaces
│
├── extension/                    # Chrome Extension (Manifest V3)
│   ├── manifest.json             # Manifest V3 specification
│   ├── service-worker.js         # Side panel click event listener
│   ├── sidepanel.html            # Loads the Next.js frontend into Chrome Side Panel
│   └── README.md                 # Extension installation instructions
│
├── docker-compose.yml            # PostgreSQL container for local development
├── .env.example                  # Environment variable blueprint
├── .gitignore                    # Git ignore rules for Python, Next.js & secrets
└── README.md                     # Project documentation
```

---

## Core Safety Rule & HITL Workflow

> **CRITICAL RULE**: The LLM **cannot** send an email automatically.
>
> 1. `prepare_context` &rarr; Extracts bounded document content & sanitizes input.
> 2. `generate_email` &rarr; Calls LLM with structured output `{subject, body}`.
> 3. `validate_draft` &rarr; Checks recipient structure and format.
> 4. `human_review` &rarr; **Pauses workflow** via `interrupt()` and presents draft in Next.js UI.
> 5. User edits and decides:
>    - **Approve**: Calls `/emails/{id}/approve`, resumes graph with approved draft version.
>    - **Reject**: Calls `/emails/{id}/reject`, halts workflow; Gmail API is never called.
>    - **Regenerate**: Updates context and produces new draft iteration.
> 6. `validate_approved_version` &rarr; Verifies exact approved version against tampering.
> 7. `send_email` &rarr; Calls Gmail API with idempotency key.
> 8. `record_result` &rarr; Persists outcome to PostgreSQL.

---

## Quick Start (Next Steps)

### 1. Database
```bash
docker compose up -d
```

### 2. Backend (FastAPI + LangGraph)
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### 3. Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```
