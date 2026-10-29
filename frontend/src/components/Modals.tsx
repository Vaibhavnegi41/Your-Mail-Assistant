'use client';

import React from 'react';
import { 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  ExternalLink, 
  Copy, 
  Check, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { EmailRecord, ReviewDraft } from '@/lib/types';

/* --------------------------------------------------------------------
   1. Approve & Send Confirmation Modal
   -------------------------------------------------------------------- */
interface ApproveModalProps {
  isOpen: boolean;
  draft: ReviewDraft | null;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export const ApproveModal: React.FC<ApproveModalProps> = ({
  isOpen,
  draft,
  onClose,
  onConfirm,
  isLoading,
}) => {
  if (!isOpen || !draft) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-badge blue">
            <Send size={22} />
          </div>
          <div className="modal-title-group">
            <h3>Approve & Send via Gmail</h3>
            <p>Ready to dispatch this email through your connected Google Workspace.</p>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-info-row">
            <span className="modal-info-label">Recipient</span>
            <span className="modal-info-val">{draft.recipient}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Subject</span>
            <span className="modal-info-val">{draft.draft_subject}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Draft Version</span>
            <span className="modal-info-val">v{draft.version} (Human Approved)</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Safety Status</span>
            <span className="modal-info-val" style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={14} /> Verified for Dispatch
            </span>
          </div>
        </div>

        <div className="modal-actions">
          <button 
            type="button" 
            className="btn-canvas-secondary" 
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="btn-canvas-approve" 
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>Sending via Gmail...</>
            ) : (
              <>
                <Send size={15} /> Confirm & Send Now
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};


/* --------------------------------------------------------------------
   2. Email Dispatched Success Modal
   -------------------------------------------------------------------- */
interface DispatchedModalProps {
  isOpen: boolean;
  recipient: string;
  subject: string;
  gmailMessageId?: string;
  onClose: () => void;
  onViewRecords: () => void;
}

export const DispatchedModal: React.FC<DispatchedModalProps> = ({
  isOpen,
  recipient,
  subject,
  gmailMessageId,
  onClose,
  onViewRecords,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const handleCopyId = () => {
    if (gmailMessageId) {
      navigator.clipboard.writeText(gmailMessageId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-badge green">
            <CheckCircle2 size={24} />
          </div>
          <div className="modal-title-group">
            <h3>Email Dispatched Successfully!</h3>
            <p>Your approved draft has been transmitted through the Gmail API.</p>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-info-row">
            <span className="modal-info-label">Recipient</span>
            <span className="modal-info-val">{recipient}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Subject</span>
            <span className="modal-info-val">{subject}</span>
          </div>
          {gmailMessageId && (
            <div className="modal-info-row">
              <span className="modal-info-label">Gmail Message ID</span>
              <span 
                className="modal-info-val" 
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8' }}
                onClick={handleCopyId}
                title="Click to copy message ID"
              >
                {gmailMessageId}
                {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              </span>
            </div>
          )}
          <div className="modal-info-row">
            <span className="modal-info-label">Status</span>
            <span className="modal-info-val" style={{ color: '#10b981', fontWeight: 600 }}>
              ● Dispatched / Sent
            </span>
          </div>
        </div>

        <div className="modal-actions">
          <button 
            type="button" 
            className="btn-canvas-secondary" 
            onClick={onClose}
          >
            Compose Another
          </button>
          <button 
            type="button" 
            className="btn-canvas-approve" 
            onClick={onViewRecords}
          >
            <ExternalLink size={15} /> View in Mail Records
          </button>
        </div>
      </div>
    </div>
  );
};


/* --------------------------------------------------------------------
   3. Reject Confirmation Modal
   -------------------------------------------------------------------- */
interface RejectModalProps {
  isOpen: boolean;
  recipient: string;
  subject: string;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export const RejectModal: React.FC<RejectModalProps> = ({
  isOpen,
  recipient,
  subject,
  onClose,
  onConfirm,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-badge red">
            <AlertTriangle size={22} />
          </div>
          <div className="modal-title-group">
            <h3>Reject Email Draft?</h3>
            <p>This draft will NOT be sent. It will be marked as rejected and archived in records.</p>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-info-row">
            <span className="modal-info-label">Target Recipient</span>
            <span className="modal-info-val">{recipient}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Subject Line</span>
            <span className="modal-info-val">{subject}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Resulting Action</span>
            <span className="modal-info-val" style={{ color: '#f87171' }}>
              Workflow Terminated (No Email Sent)
            </span>
          </div>
        </div>

        <div className="modal-actions">
          <button 
            type="button" 
            className="btn-canvas-secondary" 
            onClick={onClose}
            disabled={isLoading}
          >
            Keep Draft
          </button>
          <button 
            type="button" 
            className="btn-canvas-reject" 
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Rejecting...' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  );
};


/* --------------------------------------------------------------------
   4. Rejection Result Notification Modal
   -------------------------------------------------------------------- */
interface RejectedResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewRecords: () => void;
}

export const RejectedResultModal: React.FC<RejectedResultModalProps> = ({
  isOpen,
  onClose,
  onViewRecords,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-badge red">
            <AlertCircle size={22} />
          </div>
          <div className="modal-title-group">
            <h3>Draft Rejected</h3>
            <p>The draft was safely discarded without sending and has been recorded in your audit logs.</p>
          </div>
        </div>

        <div className="modal-actions">
          <button 
            type="button" 
            className="btn-canvas-secondary" 
            onClick={onClose}
          >
            Back to Composer
          </button>
          <button 
            type="button" 
            className="btn-canvas-secondary" 
            style={{ color: '#38bdf8' }}
            onClick={onViewRecords}
          >
            <ExternalLink size={15} /> Check Records
          </button>
        </div>
      </div>
    </div>
  );
};


/* --------------------------------------------------------------------
   5. Error Modal
   -------------------------------------------------------------------- */
interface ErrorModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  message,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-badge red">
            <AlertTriangle size={22} />
          </div>
          <div className="modal-title-group">
            <h3>Operation Failed</h3>
            <p>An issue occurred while processing your request.</p>
          </div>
        </div>

        <div className="modal-body" style={{ color: '#f87171', fontSize: '0.86rem' }}>
          {message}
        </div>

        <div className="modal-actions">
          <button 
            type="button" 
            className="btn-canvas-secondary" 
            onClick={onClose}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};


/* --------------------------------------------------------------------
   6. Inspect Historical Record Modal
   -------------------------------------------------------------------- */
interface InspectRecordModalProps {
  isOpen: boolean;
  record: EmailRecord | null;
  onClose: () => void;
  onLoadInComposer?: (record: EmailRecord) => void;
}

export const InspectRecordModal: React.FC<InspectRecordModalProps> = ({
  isOpen,
  record,
  onClose,
  onLoadInComposer,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !record) return null;

  const handleCopyBody = () => {
    navigator.clipboard.writeText(record.draft_body || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
      case 'approved':
        return '#34d399';
      case 'rejected':
        return '#f87171';
      case 'pending_review':
        return '#fbbf24';
      default:
        return '#60a5fa';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-card" 
        style={{ maxWidth: '680px', width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="modal-icon-badge blue">
              <Send size={20} />
            </div>
            <div>
              <h3>Email Record Details</h3>
              <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Workflow: {record.workflow_id}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            className="icon-btn-ghost" 
            onClick={onClose}
            style={{ padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-info-row">
            <span className="modal-info-label">Recipient</span>
            <span className="modal-info-val" style={{ fontWeight: 600 }}>{record.recipient}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Subject</span>
            <span className="modal-info-val">{record.subject || record.draft_subject}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Status</span>
            <span 
              className="modal-info-val" 
              style={{ color: getStatusColor(record.status), fontWeight: 600 }}
            >
              ● {record.status.toUpperCase()}
            </span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Tone & Version</span>
            <span className="modal-info-val">{record.tone} (v{record.version})</span>
          </div>
          {record.gmail_message_id && (
            <div className="modal-info-row">
              <span className="modal-info-label">Gmail Message ID</span>
              <span className="modal-info-val" style={{ color: '#38bdf8' }}>{record.gmail_message_id}</span>
            </div>
          )}
        </div>

        {/* Full Email Body Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>Email Body</span>
            <button 
              type="button" 
              className="icon-btn-ghost" 
              onClick={handleCopyBody}
            >
              {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy Body'}
            </button>
          </div>
          <div 
            style={{ 
              background: 'rgba(15, 23, 42, 0.7)', 
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '16px',
              maxHeight: '260px',
              overflowY: 'auto',
              fontSize: '0.9rem',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              color: '#e2e8f0'
            }}
          >
            {record.draft_body}
          </div>
        </div>

        <div className="modal-actions">
          {onLoadInComposer && (
            <button 
              type="button" 
              className="btn-canvas-secondary" 
              style={{ color: '#38bdf8' }}
              onClick={() => {
                onLoadInComposer(record);
                onClose();
              }}
            >
              Load into Composer
            </button>
          )}
          <button 
            type="button" 
            className="btn-canvas-secondary" 
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
