import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    DateTime,
    ForeignKey,
    UniqueConstraint
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    google_subject = Column(String(255), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    documents = relationship("Document", back_populates="user")
    drafts = relationship("EmailDraft", back_populates="user")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    storage_key = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    sha256 = Column(String(64), nullable=False)
    extracted_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="documents")


class EmailDraft(Base):
    __tablename__ = "email_drafts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    thread_id = Column(String(100), unique=True, index=True, nullable=False)  # LangGraph thread ID
    recipient = Column(String(255), nullable=False)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=True)
    status = Column(String(50), default="processing")  # processing, pending_review, approved, rejected, sending, sent, failed
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="drafts")
    approvals = relationship("EmailApproval", back_populates="draft")
    send_record = relationship("EmailSend", back_populates="draft", uselist=False)


class EmailApproval(Base):
    __tablename__ = "email_approvals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    draft_id = Column(String(36), ForeignKey("email_drafts.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    version = Column(Integer, nullable=False)
    decision = Column(String(50), nullable=False)  # approved, rejected
    approved_subject = Column(String(500), nullable=True)
    approved_body = Column(Text, nullable=True)
    approved_at = Column(DateTime, default=datetime.utcnow)

    draft = relationship("EmailDraft", back_populates="approvals")


class EmailSend(Base):
    __tablename__ = "email_sends"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    draft_id = Column(String(36), ForeignKey("email_drafts.id"), unique=True, nullable=False)
    idempotency_key = Column(String(100), unique=True, index=True, nullable=False)
    provider_message_id = Column(String(255), nullable=True)
    status = Column(String(50), default="sending")  # sending, sent, failed
    sent_at = Column(DateTime, nullable=True)

    draft = relationship("EmailDraft", back_populates="send_record")
