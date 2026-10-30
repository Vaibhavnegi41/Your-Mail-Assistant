'use client';

import React, { useState } from 'react';
import { FolderLock, Upload, FileText, CheckCircle2, Trash2, ArrowUpRight } from 'lucide-react';

interface VaultItem {
  id: string;
  name: string;
  size: string;
  extractedLength: number;
  preview: string;
  uploadedAt: string;
}

interface VaultViewProps {
  onUseInComposer?: (text: string) => void;
}

export const VaultView: React.FC<VaultViewProps> = ({ onUseInComposer }) => {
  const [items, setItems] = useState<VaultItem[]>([
    {
      id: 'doc-1',
      name: 'Q3_Project_Brief.pdf',
      size: '245 KB',
      extractedLength: 4820,
      preview: 'The Q3 project roadmap focuses on latency reduction in LangGraph HITL pipelines, Gmail API batch dispatching, and PostgresSaver checkpointer resiliency...',
      uploadedAt: 'Today, 2:15 PM'
    },
    {
      id: 'doc-2',
      name: 'Executive_Meeting_Notes.docx',
      size: '118 KB',
      extractedLength: 2150,
      preview: 'Action Items from Monday Sync: 1) Align with finance on budget cap. 2) Schedule client follow-ups by Wednesday. 3) Deploy email assistant update...',
      uploadedAt: 'Yesterday'
    }
  ]);

  return (
    <div className="records-container" style={{ overflowY: 'auto' }}>
      <div className="pane-section-header">
        <h2 className="pane-title" style={{ fontSize: '1.3rem' }}>
          <FolderLock size={22} color="#38bdf8" /> Document Context Vault
        </h2>
        <p className="pane-subtitle">
          Manage ground-truth PDFs, DOCX files, and meeting notes attached as reference context for your Groq email assistant.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
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
              <span className="meta-pill" style={{ color: '#34d399', fontSize: '0.72rem' }}>
                <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                Processed
              </span>
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
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Extracted: {doc.extractedLength} chars
              </span>
              {onUseInComposer && (
                <button 
                  type="button" 
                  className="icon-btn-ghost" 
                  style={{ color: '#38bdf8', fontSize: '0.8rem' }}
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
