'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { EmailForm } from '@/components/EmailForm';
import { DraftEditor } from '@/components/DraftEditor';
import { ApprovalPanel } from '@/components/ApprovalPanel';
import { StatusBadge } from '@/components/StatusBadge';
import { EmailFormData, ReviewDraft, WorkflowStatus } from '@/lib/types';
import { generateEmail, approveEmail, rejectEmail } from '@/lib/api';

export default function Home() {
  const [status, setStatus] = useState<WorkflowStatus>('idle');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const handleCreateDraft = async (formData: EmailFormData) => {
    setIsLoading(true);
    setStatus('processing');
    setNotification(null);

    try {
      const data = new FormData();
      data.append('recipient', formData.recipient);
      data.append('subject', formData.subject);
      data.append('tone', formData.tone);
      data.append('context', formData.context);
      if (formData.file) {
        data.append('file', formData.file);
      }

      const res = await generateEmail(data);
      setWorkflowId(res.workflow_id);

      // Populate draft in review state
      setDraft({
        workflow_id: res.workflow_id,
        recipient: formData.recipient,
        draft_subject: `[${formData.tone.toUpperCase()}] ${formData.subject}`,
        draft_body: `Dear Recipient,\n\n${formData.context}\n\nBest regards,\nSender`,
        version: 1,
        status: 'pending_review',
      });
      setStatus('pending_review');
    } catch (err: any) {
      setStatus('failed');
      setNotification(`Error: ${err.message || 'Failed to generate email'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!workflowId || !draft) return;
    setIsLoading(true);
    setStatus('sending');

    try {
      const res = await approveEmail(workflowId, draft.draft_subject, draft.draft_body);
      setStatus('sent');
      setNotification(`Email successfully approved and dispatched via Gmail! (ID: ${res.gmail_message_id || 'sent'})`);
    } catch (err: any) {
      setStatus('failed');
      setNotification(`Failed to send email: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!workflowId) return;
    setIsLoading(true);
    try {
      await rejectEmail(workflowId);
      setStatus('rejected');
      setNotification('Draft rejected. The email will not be sent.');
    } catch (err: any) {
      setNotification(`Error rejecting draft: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = () => {
    setStatus('processing');
    setNotification('Regenerating draft with updated context...');
    setTimeout(() => {
      if (draft) {
        setDraft({
          ...draft,
          draft_body: `${draft.draft_body}\n\n[Regenerated variation]`,
          version: draft.version + 1,
        });
        setStatus('pending_review');
        setNotification('New version generated. Please review.');
      }
    }, 1200);
  };

  return (
    <main>
      <Header />

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Workflow Station</h2>
        <StatusBadge status={status} />
      </div>

      {notification && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 16,
          background: status === 'failed' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          border: `1px solid ${status === 'failed' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
          color: status === 'failed' ? '#fca5a5' : '#86efac',
          fontSize: '0.9rem'
        }}>
          {notification}
        </div>
      )}

      <div className="main-grid">
        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: '1rem', fontWeight: 600 }}>1. Compose Request</h3>
          <EmailForm onSubmit={handleCreateDraft} isLoading={isLoading} />
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: '1rem', fontWeight: 600 }}>2. Human-In-The-Loop Approval</h3>
          {draft ? (
            <>
              <DraftEditor
                recipient={draft.recipient}
                subject={draft.draft_subject}
                body={draft.draft_body}
                version={draft.version}
                onSubjectChange={(val) => setDraft({ ...draft, draft_subject: val })}
                onBodyChange={(val) => setDraft({ ...draft, draft_body: val })}
                readOnly={status === 'sent' || status === 'rejected'}
              />
              {status === 'pending_review' && (
                <ApprovalPanel
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onRegenerate={handleRegenerate}
                  isLoading={isLoading}
                />
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
              <p>No draft in review.</p>
              <p style={{ fontSize: '0.8rem', marginTop: 8 }}>
                Fill out the email form on the left to start the LangGraph drafting pipeline.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
