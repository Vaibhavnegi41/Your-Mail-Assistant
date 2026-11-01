'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FolderLock, Upload, FileText, CheckCircle2, ArrowUpRight, Database, Layers } from 'lucide-react';
import { getUserDocuments, uploadDocumentToVault } from '@/lib/api';

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
  const [items, setItems] = useState<VaultItem[]>([
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
  const [isUploading, setIsUploading] = useState(false);
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
        }
      } catch (err) {
        console.warn('Could not fetch vault documents:', err);
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
      setItems((prev) => [newItem, ...prev]);
    } catch (err: any) {
      alert(err.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="records-container" style={{ overflowY: 'auto' }}>
      <div className="pane-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="pane-title" style={{ fontSize: '1.3rem' }}>
            <FolderLock size={22} color="#38bdf8" /> Pinecone Vector Context Vault
          </h2>
          <p className="pane-subtitle">
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
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.85rem' }}
          >
            <Upload size={15} />
            {isUploading ? 'Chunking & Indexing...' : 'Upload to Pinecone Vault'}
          </button>
        </div>
      </div>

      <div className="vault-grid">
        {items.map((doc) => (
          <div key={doc.id} className="stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 8, background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', borderRadius: 8 }}>
                  <FileText size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.92rem' }}>{doc.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{doc.size} • {doc.uploadedAt}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="meta-pill" style={{ color: '#38bdf8', fontSize: '0.72rem', background: 'rgba(56, 189, 248, 0.1)' }}>
                  <Layers size={12} style={{ display: 'inline', marginRight: 4 }} />
                  {doc.chunks_indexed ?? 1} Chunks
                </span>
                <span className="meta-pill" style={{ color: '#34d399', fontSize: '0.72rem' }}>
                  <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                  Indexed
                </span>
              </div>
            </div>

            <div style={{ 
              fontSize: '0.82rem', 
              color: '#94a3b8', 
              lineHeight: 1.5,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              padding: '10px 12px',
              borderRadius: '6px',
              width: '100%'
            }}>
              "{doc.preview}"
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingTop: 4 }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Database size={12} /> Namespace: <code style={{ color: '#a5b4fc' }}>{doc.namespace || 'user_dev-user-001'}</code>
              </span>
              {onUseInComposer && (
                <button 
                  type="button" 
                  className="icon-btn-ghost" 
                  style={{ color: '#38bdf8', fontSize: '0.8rem', cursor: 'pointer' }}
                  onClick={() => onUseInComposer(doc.preview)}
                >
                  Insert in Composer <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
