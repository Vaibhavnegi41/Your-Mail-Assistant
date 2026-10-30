'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from '@/components/Sidebar';
import { RecordsView } from '@/components/RecordsView';
import { VaultView } from '@/components/VaultView';
import {
  ApproveModal,
  DispatchedModal,
  RejectModal,
  RejectedResultModal,
  ErrorModal,
  InspectRecordModal
} from '@/components/Modals';
import {
  EmailFormData,
  ReviewDraft,
  WorkflowStatus,
  EmailRecord
} from '@/lib/types';
import {
  generateEmail,
  getReviewPayload,
  approveEmail,
  rejectEmail,
  getEmailRecords
} from '@/lib/api';
import {
  Sparkles,
  Mail,
  Send,
  Copy,
  Check,
  RotateCw,
  FileText,
  Paperclip,
  X,
  ShieldCheck,
  Clock,
  AlertCircle
} from 'lucide-react';

export default function Home() {
  // Navigation & View
  const [activeTab, setActiveTab] = useState<NavTab>('composer');

  // Workflow & Draft State
  const [status, setStatus] = useState<WorkflowStatus>('idle');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form Inputs
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [tone, setTone] = useState<EmailFormData['tone']>('professional');
  const [context, setContext] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Records & History
  const [records, setRecords] = useState<EmailRecord[]>([]);

  // Modals
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isDispatchedModalOpen, setIsDispatchedModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isRejectedResultModalOpen, setIsRejectedResultModalOpen] = useState(false);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [inspectingRecord, setInspectingRecord] = useState<EmailRecord | null>(null);
  const [lastDispatchedInfo, setLastDispatchedInfo] = useState<{
    recipient: string;
    subject: string;
    gmailMessageId?: string;
  }>({ recipient: '', subject: '' });

  // Clipboard
  const [copiedCanvas, setCopiedCanvas] = useState(false);

  // Load records on mount
  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const backendRecords = await getEmailRecords();
        const savedLocal = localStorage.getItem('email_records_cache');
        const localRecords: EmailRecord[] = savedLocal ? JSON.parse(savedLocal) : [];

        // Merge records with uniqueness on workflow_id
        const map = new Map<string, EmailRecord>();
        [...backendRecords, ...localRecords].forEach(r => {
          if (r.workflow_id && !map.has(r.workflow_id)) {
            map.set(r.workflow_id, r);
          }
        });
        const combined = Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setRecords(combined);
      } catch (e) {
        console.warn('Records load fallback error:', e);
      }
    };

    fetchRecords();
  }, []);

  // Save records to cache
  const saveRecordsToCache = (updated: EmailRecord[]) => {
    setRecords(updated);
    try {
      localStorage.setItem('email_records_cache', JSON.stringify(updated));
    } catch (e) {
      console.warn('Storage error:', e);
    }
  };

  // ------------------------------------------------------------------
  // Generation Handler
  // ------------------------------------------------------------------
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!recipient || !subject || !context) {
      setErrorMessage('Please fill in Recipient, Subject, and Context to generate.');
      setIsErrorModalOpen(true);
      return;
    }

    setIsLoading(true);
    setStatus('processing');

    try {
      const data = new FormData();
      data.append('recipient', recipient);
      data.append('subject', subject);
      data.append('tone', tone);
      data.append('context', context);
      if (file) {
        data.append('file', file);
      }

      const res = await generateEmail(data);
      setWorkflowId(res.workflow_id);

      // Fetch the real LLM-generated draft
      const reviewData = await getReviewPayload(res.workflow_id);
      setDraft(reviewData);
      setStatus('pending_review');

      // Add to records list
      const newRec: EmailRecord = {
        workflow_id: res.workflow_id,
        recipient: reviewData.recipient,
        subject: reviewData.draft_subject,
        tone: tone,
        context: context,
        draft_subject: reviewData.draft_subject,
        draft_body: reviewData.draft_body,
        status: 'pending_review',
        version: reviewData.version,
        created_at: new Date().toISOString(),
      };
      saveRecordsToCache([newRec, ...records.filter(r => r.workflow_id !== res.workflow_id)]);
    } catch (err: any) {
      setStatus('failed');
      setErrorMessage(err.message || 'Failed to generate email via Groq model.');
      setIsErrorModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Approval & Sending Modal Trigger
  // ------------------------------------------------------------------
  const handleOpenApproveModal = () => {
    if (!draft || !workflowId) return;
    setIsApproveModalOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!workflowId || !draft) return;
    setIsLoading(true);

    try {
      const res = await approveEmail(workflowId, draft.draft_subject, draft.draft_body);
      setStatus('sent');
      setIsApproveModalOpen(false);

      // Update records
      const updated = records.map(r =>
        r.workflow_id === workflowId ? {
          ...r,
          status: 'sent' as WorkflowStatus,
          draft_subject: draft.draft_subject,
          draft_body: draft.draft_body,
          gmail_message_id: res.gmail_message_id || 'sent-ok'
        } : r
      );
      saveRecordsToCache(updated);

      setLastDispatchedInfo({
        recipient: draft.recipient,
        subject: draft.draft_subject,
        gmailMessageId: res.gmail_message_id
      });
      setIsDispatchedModalOpen(true);
    } catch (err: any) {
      setIsApproveModalOpen(false);
      setErrorMessage(err.message || 'Error transmitting email via Gmail.');
      setIsErrorModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Rejection Modal Trigger
  // ------------------------------------------------------------------
  const handleOpenRejectModal = () => {
    if (!draft || !workflowId) return;
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!workflowId) return;
    setIsLoading(true);

    try {
      await rejectEmail(workflowId);
      setStatus('rejected');
      setIsRejectModalOpen(false);

      // Update records
      const updated = records.map(r =>
        r.workflow_id === workflowId ? { ...r, status: 'rejected' as WorkflowStatus } : r
      );
      saveRecordsToCache(updated);

      setIsRejectedResultModalOpen(true);
    } catch (err: any) {
      setIsRejectModalOpen(false);
      setErrorMessage(err.message || 'Error rejecting draft.');
      setIsErrorModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Regenerate Variation
  // ------------------------------------------------------------------
  const handleRegenerate = async () => {
    await handleGenerate();
  };

  // ------------------------------------------------------------------
  // Copy to clipboard from canvas
  // ------------------------------------------------------------------
  const handleCopyCanvasBody = () => {
    if (draft?.draft_body) {
      navigator.clipboard.writeText(draft.draft_body);
      setCopiedCanvas(true);
      setTimeout(() => setCopiedCanvas(false), 2000);
    }
  };

  // ------------------------------------------------------------------
  // Load record into composer
  // ------------------------------------------------------------------
  const handleLoadRecordInComposer = (rec: EmailRecord) => {
    setRecipient(rec.recipient);
    setSubject(rec.draft_subject || rec.subject);
    setTone((rec.tone as EmailFormData['tone']) || 'professional');
    if (rec.context) setContext(rec.context);

    setDraft({
      workflow_id: rec.workflow_id,
      recipient: rec.recipient,
      draft_subject: rec.draft_subject,
      draft_body: rec.draft_body,
      version: rec.version,
      status: rec.status,
    });
    setWorkflowId(rec.workflow_id);
    setStatus(rec.status);
    setActiveTab('composer');
  };

  // Pending count for sidebar badge
  const pendingCount = records.filter(r => r.status === 'pending_review').length;

  return (
    <div className="app-shell">
      {/* 1. VS Code-Style Left Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingCount={pendingCount}
        totalRecordsCount={records.length}
      />

      {/* 2. Main Viewport */}
      <main className="main-viewport">
        {/* Top Header Bar */}
        <header className="top-header-bar">
          <div className="top-header-left">
            <span className="view-title">
              {activeTab === 'composer' && 'AI Email Studio'}
              {activeTab === 'records' && 'Mail Records & Results'}
              {activeTab === 'vault' && 'Document Context Vault'}
            </span>
            <div className="view-pill">
              <Sparkles size={13} /> LangGraph HITL
            </div>
          </div>

          <div className="top-header-right">
            <div className="status-badge-clean">
              <span className="status-dot-active" />
              <span>Ready</span>
            </div>
          </div>
        </header>


        {activeTab === 'composer' && (
          <div className="composer-split-container">
            {/* Left Half: Form Studio */}
            <div className="composer-left-pane">
              <div className="pane-section-header">
                <h1 className="pane-title">
                  <Mail size={18} color="#38bdf8" /> Compose & Configure
                </h1>
                <p className="pane-subtitle">
                  Define your objective and key points.
                </p>
              </div>

              <form onSubmit={handleGenerate}>
                {/* Recipient */}
                <div className="form-group">
                  <label className="form-label">
                    <span>Recipient Email</span>
                    <span style={{ color: '#f43f5e' }}>*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. partner@company.com"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    required
                    disabled={isLoading}
                    className="form-input"
                  />
                </div>

                {/* Subject / Goal */}
                <div className="form-group">
                  <label className="form-label">
                    <span>Primary Goal / Topic</span>
                    <span style={{ color: '#f43f5e' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Follow-up on project roadmap proposal"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    disabled={isLoading}
                    className="form-input"
                  />
                </div>

                {/* Tone Selector Pills */}
                <div className="form-group">
                  <label className="form-label">Tone of Voice</label>
                  <div className="tone-selector-grid">
                    {[
                      { id: 'professional', label: 'Professional' },
                      { id: 'casual', label: 'Casual & Friendly' },
                      { id: 'persuasive', label: 'Persuasive' },
                      { id: 'urgent', label: 'Urgent' },
                      { id: 'concise', label: 'Concise' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`tone-pill-btn ${tone === t.id ? 'active' : ''}`}
                        onClick={() => setTone(t.id as EmailFormData['tone'])}
                        disabled={isLoading}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Context & Key Points */}
                <div className="form-group">
                  <div className="form-label">
                    <span>Context & Key Points</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {context.length} chars
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    placeholder="Summarize key facts, meeting takeaways, deadlines, or requested next steps..."
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    required
                    disabled={isLoading}
                    className="form-input"
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {/* Document Reference Dropzone */}
                <div className="form-group">
                  <label className="form-label">Reference Document (Optional)</label>
                  <label className={`dropzone-box ${file ? 'has-file' : ''}`}>
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      style={{ display: 'none' }}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      disabled={isLoading}
                    />
                    <Paperclip size={18} color={file ? '#34d399' : '#64748b'} />
                    <div style={{ flex: 1, fontSize: '0.84rem', color: file ? '#f8fafc' : '#64748b' }}>
                      {file ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>{file.name}</span>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.preventDefault();
                              setFile(null);
                            }}
                            className="icon-btn-ghost"
                            style={{ color: '#f87171', padding: '2px 6px' }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        'Attach PDF, DOCX, or text notes for grounding'
                      )}
                    </div>
                  </label>
                </div>

                {/* Generate Button with Shimmer */}
                <button
                  type="submit"
                  disabled={isLoading || !recipient || !subject || !context}
                  className="btn-generate-shimmer"
                >
                  {isLoading ? (
                    <>
                      <RotateCw size={18} className="animate-spin" /> Generating Draft...
                    </>
                  ) : (
                    <>
                      Generate Draft
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Right Half: Expansive Email Reading & Review Canvas */}
            <div className="composer-right-pane">
              {!draft ? (
                /* Empty State Guide */
                <div className="canvas-empty-state">
                  <div className="empty-icon-wrap">
                    <Mail size={32} />
                  </div>
                  <h3 className="empty-title">Ready for Your First Draft</h3>
                  <p className="empty-desc">
                    Fill in the recipient and context on the left, then click <strong>"Generate AI Draft"</strong>.
                    Your complete email will populate right here
                  </p>
                </div>
              ) : (
                /* Active Email Canvas */
                <div className="canvas-active-wrapper">
                  {/* Meta Bar */}
                  <div className="canvas-meta-bar">
                    <div className="canvas-meta-left">

                      <span className="meta-pill ">To: {draft.recipient}</span>

                    </div>

                    <div className="canvas-meta-right">
                      <button
                        type="button"
                        className="icon-btn-ghost"
                        onClick={handleCopyCanvasBody}
                        title="Copy Email Text"
                      >
                        {copiedCanvas ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                        {copiedCanvas ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* Body Container (Spacious, full-height readability) */}
                  <div className="canvas-body-container">
                    {/* Editable Subject */}
                    <input
                      type="text"
                      value={draft.draft_subject}
                      onChange={(e) => setDraft({ ...draft, draft_subject: e.target.value })}
                      placeholder="Email Subject Line..."
                      className="canvas-subject-field"
                    />

                    {/* Full Body Textarea with High Readability */}
                    <textarea
                      value={draft.draft_body}
                      onChange={(e) => setDraft({ ...draft, draft_body: e.target.value })}
                      placeholder="Email body text..."
                      className="canvas-textarea-full"
                    />
                  </div>

                  {/* Floating Action Bottom Bar */}
                  <div className="canvas-actions-bar">
                    <div className="actions-left-note">
                      <ShieldCheck size={14} color="#34d399" />
                      <span>Review required before dispatching</span>
                    </div>

                    <div className="actions-btn-group">
                      <button
                        type="button"
                        className="btn-canvas-reject"
                        onClick={handleOpenRejectModal}
                        disabled={isLoading}
                      >
                        Reject Draft
                      </button>

                      <button
                        type="button"
                        className="btn-canvas-secondary"
                        onClick={handleRegenerate}
                        disabled={isLoading}
                      >
                        <RotateCw size={14} /> Regenerate
                      </button>

                      <button
                        type="button"
                        className="btn-canvas-approve"
                        onClick={handleOpenApproveModal}
                        disabled={isLoading}
                      >
                        <Send size={15} /> Approve & Send via Gmail
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* -----------------------------------------------------------
            VIEW: Mail Records & Results History
            ----------------------------------------------------------- */}
        {activeTab === 'records' && (
          <RecordsView
            records={records}
            onInspect={setInspectingRecord}
            onLoadInComposer={handleLoadRecordInComposer}
            onRefresh={async () => {
              const fresh = await getEmailRecords();
              if (fresh.length > 0) saveRecordsToCache(fresh);
            }}
          />
        )}

        {/* -----------------------------------------------------------
            VIEW: Document Context Vault
            ----------------------------------------------------------- */}
        {activeTab === 'vault' && (
          <VaultView
            onUseInComposer={(text) => {
              setContext((prev) => prev ? `${prev}\n\n[Reference Notes]:\n${text}` : text);
              setActiveTab('composer');
            }}
          />
        )}
      </main>

      {/* -------------------------------------------------------------
          SHADCN / ACETERNITY MODAL SYSTEM (Replaces bad popups/toasts)
          ------------------------------------------------------------- */}

      {/* 1. Approve & Send Confirmation Modal */}
      <ApproveModal
        isOpen={isApproveModalOpen}
        draft={draft}
        isLoading={isLoading}
        onClose={() => setIsApproveModalOpen(false)}
        onConfirm={handleConfirmApprove}
      />

      {/* 2. Email Dispatched Success Modal */}
      <DispatchedModal
        isOpen={isDispatchedModalOpen}
        recipient={lastDispatchedInfo.recipient}
        subject={lastDispatchedInfo.subject}
        gmailMessageId={lastDispatchedInfo.gmailMessageId}
        onClose={() => setIsDispatchedModalOpen(false)}
        onViewRecords={() => {
          setIsDispatchedModalOpen(false);
          setActiveTab('records');
        }}
      />

      {/* 3. Reject Confirmation Modal */}
      <RejectModal
        isOpen={isRejectModalOpen}
        recipient={draft?.recipient || ''}
        subject={draft?.draft_subject || ''}
        isLoading={isLoading}
        onClose={() => setIsRejectModalOpen(false)}
        onConfirm={handleConfirmReject}
      />

      {/* 4. Rejection Result Modal */}
      <RejectedResultModal
        isOpen={isRejectedResultModalOpen}
        onClose={() => setIsRejectedResultModalOpen(false)}
        onViewRecords={() => {
          setIsRejectedResultModalOpen(false);
          setActiveTab('records');
        }}
      />

      {/* 5. Error Modal */}
      <ErrorModal
        isOpen={isErrorModalOpen}
        message={errorMessage}
        onClose={() => setIsErrorModalOpen(false)}
      />

      {/* 6. Inspect Record Detail Modal */}
      <InspectRecordModal
        isOpen={!!inspectingRecord}
        record={inspectingRecord}
        onClose={() => setInspectingRecord(null)}
        onLoadInComposer={handleLoadRecordInComposer}
      />
    </div>
  );
}
