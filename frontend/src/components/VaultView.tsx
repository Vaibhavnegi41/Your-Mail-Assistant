'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FolderLock, Upload, FileText, CheckCircle2, ArrowUpRight, Database, Layers, Trash2, AlertCircle } from 'lucide-react';
import { getUserDocuments, uploadDocumentToVault, deleteDocumentFromVault } from '@/lib/api';

interface VaultItem {
  id: string;
  name: string;
  size: string;
  extractedLength: number;
  chunks_indexed?: number;
  preview: string;
  uploadedAt: string;
  namespace?: string;
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
            namespace: `user_${d.user_id || 'dev-user-001'}`
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
              preview: 'The Q3 project roadmap focuses on latency reduction in LangGraph HITL pipelines, Gmail API batch dispatching, and Pinecone vector retrieval...',
              uploadedAt: 'Today',
              namespace: 'user_dev-user-001'
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
        namespace: res.namespace
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
    const confirmed = window.confirm(
      `Delete "${docName}"?\n\nThis will remove the document card from the vault and wipe all associated vector chunks from Pinecone.`
    );
    if (!confirmed) return;

    setDeletingId(docId);
    try {
      await deleteDocumentFromVault(docId);
      // Remove from frontend state immediately
      setItems((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      console.error('Delete document failed:', err);
      alert('Failed to delete document from Pinecone.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="records-container" style={{ overflowY: 'auto' }}>
      {/* Header bar */}
      <div className="pane-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="pane-title" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderLock size={22} color="#38bdf8" /> Pinecone Vector Context Vault
          </h2>
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
              {/* Card Header: Title + Pills */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                width: '100%',
                gap: 10,
                minWidth: 0
              }}>
                {/* Left: Icon and truncated title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{
                    padding: 8,
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: '#60a5fa',
                    borderRadius: 8,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <FileText size={18} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      title={doc.name}
                      style={{
                        fontWeight: 600,
                        color: '#f1f5f9',
                        fontSize: '0.88rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        width: '100%',
                        cursor: 'default'
                      }}
                    >
                      {doc.name}
                    </div>
                    <div style={{
                      fontSize: '0.74rem',
                      color: '#64748b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {doc.size} • {doc.uploadedAt}
                    </div>
                  </div>
                </div>

                {/* Right: Badges */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  flexShrink: 0
                }}>
                  <span
                    className="meta-pill"
                    style={{
                      color: '#38bdf8',
                      fontSize: '0.7rem',
                      background: 'rgba(56, 189, 248, 0.1)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      padding: '3px 8px'
                    }}
                  >
                    <Layers size={11} style={{ display: 'inline', marginRight: 3 }} />
                    {doc.chunks_indexed ?? 1} Chunks
                  </span>
                  <span
                    className="meta-pill"
                    style={{
                      color: '#34d399',
                      fontSize: '0.7rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      padding: '3px 8px'
                    }}
                  >
                    <CheckCircle2 size={11} style={{ display: 'inline', marginRight: 3 }} />
                    Indexed
                  </span>
                </div>
              </div>

              {/* Preview Content with clamping */}
              <div style={{
                fontSize: '0.82rem',
                color: '#94a3b8',
                lineHeight: 1.5,
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                padding: '9px 11px',
                borderRadius: '8px',
                width: '100%',
                boxSizing: 'border-box',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxHeight: '4.8em'
              }}>
                "{doc.preview}"
              </div>

              {/* Footer: Namespace + Actions */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                paddingTop: 4,
                gap: 8,
                flexWrap: 'wrap'
              }}>
                <span style={{
                  fontSize: '0.72rem',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  <Database size={12} color="#818cf8" />
                  <code style={{ color: '#a5b4fc', fontSize: '0.72rem' }}>{doc.namespace || 'user_dev-user-001'}</code>
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
                      padding: '4px 9px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      cursor: deletingId === doc.id ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Trash2 size={13} />
                    {deletingId === doc.id ? 'Deleting...' : 'Delete'}
                  </button>

                  {/* Insert in Composer Button */}
                  {onUseInComposer && (
                    <button
                      type="button"
                      className="icon-btn-ghost"
                      style={{
                        color: '#38bdf8',
                        background: 'rgba(56, 189, 248, 0.08)',
                        border: '1px solid rgba(56, 189, 248, 0.2)',
                        padding: '4px 9px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      onClick={() => onUseInComposer(doc.preview)}
                    >
                      Insert in Composer <ArrowUpRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
