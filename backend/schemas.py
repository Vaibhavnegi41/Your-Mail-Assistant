from pydantic import BaseModel, EmailStr
from typing import Optional, Literal
from datetime import datetime


class EmailGenerateRequest(BaseModel):
    recipient: EmailStr
    subject: str
    tone: str = "professional"
    context: str
    document_id: Optional[str] = None


class EmailApprovalRequest(BaseModel):
    subject: str
    body: str


class EmailReviewResponse(BaseModel):
    workflow_id: str
    recipient: str
    draft_subject: str
    draft_body: str
    version: int
    status: str
    message: Optional[str] = None


class EmailStatusResponse(BaseModel):
    workflow_id: str
    status: Literal["processing", "pending_review", "approved", "rejected", "sending", "sent", "failed"]
    recipient: str
    subject: str
    version: int
    sent_at: Optional[datetime] = None
    provider_message_id: Optional[str] = None
    error_message: Optional[str] = None
