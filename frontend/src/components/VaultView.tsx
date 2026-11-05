'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FolderLock, Upload, FileText, CheckCircle2, ArrowUpRight, Database, Layers, Trash2, AlertCircle, AlertTriangle, X, Eye, ArrowRight } from 'lucide-react';
import { getUserDocuments, uploadDocumentToVault, deleteDocumentFromVault } from '@/lib/api';

/* -----------------------------------------------------------------------
   Delete Confirmation Modal (inline, matches app modal theme)
   ----------------------------------------------------------------------- */
interface DeleteConfirmModalProps {
  isOpen: boolean;
  docName: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  docName,
  isDeleting,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={!isDeleting ? onCancel : undefined}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460 }}
      >
        {/* Close button */}
        {!isDeleting && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              transition: 'all 0.15s ease'
            }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        )}

        {/* Header */}
        <div className="modal-header">
          <div className="modal-icon-badge red">
            <AlertTriangle size={20} />
          </div>
          <div className="modal-title-group">
            <h3>Delete Vault Document</h3>
            <p>This action is permanent and cannot be undone.</p>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
          <div className="modal-info-row">
            <span className="modal-info-label">Document</span>
            <span className="modal-info-val" title={docName}>{docName}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Vector Chunks</span>
            <span className="modal-info-val" style={{ color: '#f87171' }}>
              All chunks wiped from Pinecone
            </span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">RAG Context</span>
            <span className="modal-info-val" style={{ color: '#f87171' }}>
              Removed from namespace index
            </span>
          </div>
        </div>


        {/* Actions */}
        <div className="modal-actions">
          <button
            type="button"
            className="btn-canvas-secondary"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 18px',
              borderRadius: 9,
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              background: isDeleting ? 'rgba(239,68,68,0.3)' : 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              transition: 'all 0.15s ease',
              opacity: isDeleting ? 0.7 : 1
            }}
          >
            <Trash2 size={14} />
            {isDeleting ? 'Deleting...' : 'Yes, Delete Forever'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* -----------------------------------------------------------------------
   See Context Modal
   ----------------------------------------------------------------------- */
interface SeeContextModalProps {
  isOpen: boolean;
  doc: { name: string; preview: string; extractedLength: number; chunks_indexed?: number } | null;
  onClose: () => void;
  onLoadInComposer: () => void;
}

const SeeContextModal: React.FC<SeeContextModalProps> = ({ isOpen, doc, onClose, onLoadInComposer }) => {
  if (!isOpen || !doc) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 580, width: '92%' }}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, color: '#94a3b8', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30,
          }}
          aria-label="Close"
        >
          <X size={15} />
        </button>

        {/* Header */}
        <div className="modal-header">
          <div className="modal-icon-badge blue">
            <FileText size={20} />
          </div>
          <div className="modal-title-group">
            <h3 style={{ wordBreak: 'break-word', paddingRight: 32 }}>{doc.name}</h3>
          </div>
        </div>

        {/* Meta pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 500,
            color: '#38bdf8'
          }}>
            <Layers size={11} /> {doc.chunks_indexed ?? 1} Chunks
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 500,
            color: '#34d399'
          }}>
            <CheckCircle2 size={11} /> Indexed
          </span>
          {doc.extractedLength > 0 && (
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
              {doc.extractedLength.toLocaleString()} characters extracted
            </span>
          )}
        </div>

        {/* Context body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8',
            textTransform: 'uppercase', letterSpacing: '0.05em'
          }}>
            Context Content
          </span>
          <div style={{
            background: 'rgba(15,23,42,0.75)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '14px 16px',
            fontSize: '0.875rem', color: '#cbd5e1',
            lineHeight: 1.65, whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 320, overflowY: 'auto',
          }}>
            {doc.preview}
          </div>
        </div>

        {/* Full-width CTA */}
        <button
          type="button"
          onClick={() => { onLoadInComposer(); onClose(); }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
            padding: '11px 20px', borderRadius: 10,
            fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
            background: 'linear-gradient(135deg, rgba(56,189,248,0.18) 0%, rgba(99,102,241,0.18) 100%)',
            border: '1px solid rgba(56,189,248,0.35)', color: '#38bdf8',
            transition: 'all 0.15s ease',
          }}
        >
          Load in Composer
        </button>
      </div>
    </div>
  );
};

interface VaultItem {
  id: string;
  name: string;
  size: string;
  extractedLength: number;
  chunks_indexed?: number;
  preview: string;
  uploadedAt: string;
}

interface VaultViewProps {
  onUseInComposer?: (text: string) => void;
}

export const VaultView: React.FC<VaultViewProps> = ({ onUseInComposer }) => {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; id: string; name: string }>({
    open: false, id: '', name: '',
  });

  // See Context modal state
  const [contextModal, setContextModal] = useState<{ open: boolean; doc: VaultItem | null }>({
    open: false, doc: null,
  });

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const docs = await getUserDocuments();
        if (docs && docs.length > 0) {
          const mapped: VaultItem[] = docs.map((d: any) => ({
            id: d.id,
            name: d.name,
            size: d.size,
            extractedLength: d.extracted_length,
            chunks_indexed: d.chunks_indexed,
            preview: d.preview,
            uploadedAt: d.uploaded_at,
          }));
          setItems(mapped);
        } else {
          setItems([
            {
              id: 'doc-sample-1',
              name: 'Q3_Project_Brief.pdf',
              size: '245 KB',
              extractedLength: 4820,
              chunks_indexed: 6,
              preview: 'The Q3 project roadmap focuses on latency reduction in LangGraph HITL pipelines, Gmail API batch dispatching, and Pinecone vector retrieval. Key milestones include sub-500ms draft synthesis, resilient multi-turn approval loops, automated embedding updates upon document modification, and adaptive chunk reranking for multi-tenant context isolation.',
              uploadedAt: 'Today',
            }
          ]);
        }
      } catch (err) {
        console.warn('Could not fetch vault documents:', err);
      } finally {
        setIsLoadingInitial(false);
      }
    };
    fetchDocs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setIsUploading(true);
    try {
      const res = await uploadDocumentToVault(file);
      const newItem: VaultItem = {
        id: res.document_id,
        name: res.filename,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        extractedLength: res.extracted_length,
        chunks_indexed: res.chunks_indexed,
        preview: res.preview,
        uploadedAt: 'Just now',
      };
      setItems((prev) => [newItem, ...prev.filter(d => d.id !== 'doc-sample-1')]);
    } catch (err: any) {
      alert(err.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string, docName: string) => {
    // Open the themed modal instead of window.confirm
    setDeleteModal({ open: true, id: docId, name: docName });
  };

  const handleDeleteCancel = () => {
    if (deletingId) return; // prevent cancel while in-flight
    setDeleteModal({ open: false, id: '', name: '' });
  };

  const handleDeleteConfirm = async () => {
    const { id: docId } = deleteModal;
    setDeletingId(docId);
    try {
      await deleteDocumentFromVault(docId);
      setItems((prev) => prev.filter((d) => d.id !== docId));
      setDeleteModal({ open: false, id: '', name: '' });
    } catch (err) {
      console.error('Delete document failed:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="records-container" style={{ overflowY: 'auto' }}>
      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModal.open}
        docName={deleteModal.name}
        isDeleting={deletingId === deleteModal.id}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
      />

      {/* See Context Modal */}
      <SeeContextModal
        isOpen={contextModal.open}
        doc={contextModal.doc}
        onClose={() => setContextModal({ open: false, doc: null })}
        onLoadInComposer={() => {
          if (contextModal.doc && onUseInComposer) {
            onUseInComposer(contextModal.doc.preview);
          }
        }}
      />

      {/* Header bar */}
      <div className="pane-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>

          <p className="pane-subtitle" style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
            Ground-truth documents chunked, embedded, and indexed under your isolated Pinecone namespace.
          </p>
        </div>
        <div>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".pdf,.docx,.txt"
            onChange={handleFileUpload}
            disabled={isUploading}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.84rem' }}
          >
            <Upload size={14} />
            {isUploading ? 'Chunking & Indexing...' : 'Upload to Pinecone Vault'}
          </button>
        </div>
      </div>

      {/* Grid container */}
      {items.length === 0 && !isLoadingInitial ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          background: 'rgba(15, 23, 42, 0.4)',
          borderRadius: 12,
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          color: '#64748b',
          gap: 12,
          textAlign: 'center'
        }}>
          <FolderLock size={40} color="#475569" />
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8' }}>Your Pinecone Vault is Empty</div>
          <div style={{ fontSize: '0.82rem', maxWidth: 380 }}>
            Upload a reference PDF, DOCX, or text file. It will be chunked, embedded, and indexed into your Pinecone namespace for semantic grounding.
          </div>
        </div>
      ) : (
        <div className="vault-grid">
          {items.map((doc) => (
            <div key={doc.id} className="vault-card">
              {/* Card Header: Icon + single-line title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, width: '100%' }}>
                {/* Icon */}
                <div style={{
                  padding: '8px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  color: '#60a5fa',
                  borderRadius: 9,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <FileText size={18} />
                </div>

                {/* Title — single line, responsive font, ellipsis */}
                <div
                  title={doc.name}
                  style={{
                    fontWeight: 600,
                    color: '#f8fafc',
                    fontSize: 'clamp(0.72rem, 2vw, 0.92rem)',
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    flex: 1,
                    cursor: 'default',
                  }}
                >
                  {doc.name}
                </div>
              </div>

              {/* Sub-row: Badges + size + timestamp */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
                width: '100%',
              }}>
                <span style={{
                  color: '#38bdf8', fontSize: '0.68rem',

                  whiteSpace: 'nowrap', flexShrink: 0,
                  padding: '3px 7px', borderRadius: '5px', fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                  <Layers size={10} />
                  {doc.chunks_indexed ?? 1} Chunks
                </span>
                <span style={{
                  color: '#34d399', fontSize: '0.68rem',

                  whiteSpace: 'nowrap', flexShrink: 0,
                  padding: '3px 7px', borderRadius: '5px', fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                  <CheckCircle2 size={10} />
                  Indexed
                </span>
                <span style={{ fontSize: '0.69rem', color: '#475569' }}>•</span>
                <span style={{ fontSize: '0.69rem', color: '#64748b', whiteSpace: 'nowrap' }}>{doc.size}</span>
                <span style={{ fontSize: '0.69rem', color: '#475569' }}>•</span>
                <span style={{ fontSize: '0.69rem', color: '#64748b', whiteSpace: 'nowrap' }}>{doc.uploadedAt}</span>
              </div>

              {/* Footer: Actions only — no preview here */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                paddingTop: 10,
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 'auto'
              }}>
                <span style={{
                  fontSize: '0.72rem', color: '#475569',
                  display: 'flex', alignItems: 'center', gap: 4
                }}>
                  <Database size={12} color="#38bdf8" />
                  {doc.extractedLength > 0 ? `${doc.extractedLength.toLocaleString()} chars` : 'Pinecone Vault'}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteDocument(doc.id, doc.name)}
                    disabled={deletingId === doc.id}
                    title="Remove document and delete chunks from Pinecone"
                    style={{
                      color: '#ef4444',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.22)',
                      padding: '5px 11px', borderRadius: '7px',
                      fontSize: '0.78rem', fontWeight: 500,
                      cursor: deletingId === doc.id ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Trash2 size={13} />
                    {deletingId === doc.id ? 'Deleting...' : 'Delete'}
                  </button>

                  {/* See Context Button */}
                  <button
                    type="button"
                    onClick={() => setContextModal({ open: true, doc })}
                    style={{
                      color: '#38bdf8',
                      background: 'rgba(56, 189, 248, 0.10)',
                      border: '1px solid rgba(56, 189, 248, 0.28)',
                      padding: '5px 12px', borderRadius: '7px',
                      fontSize: '0.78rem', fontWeight: 500,
                      cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Eye size={13} />
                    See Context
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
