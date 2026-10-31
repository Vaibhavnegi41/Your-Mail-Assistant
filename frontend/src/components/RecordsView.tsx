'use client';

import React, { useState } from 'react';
import { 
  Search, 
  Eye, 
  Copy, 
  Check, 
  Send, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  RotateCw,
  Mail,
  Calendar
} from 'lucide-react';
import { EmailRecord, WorkflowStatus } from '@/lib/types';

interface RecordsViewProps {
  records: EmailRecord[];
  onInspect: (record: EmailRecord) => void;
  onLoadInComposer: (record: EmailRecord) => void;
  onRefresh?: () => void;
}

export const RecordsView: React.FC<RecordsViewProps> = ({
  records,
  onInspect,
  onLoadInComposer,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'sent' | 'pending_review' | 'rejected'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Statistics
  const totalCount = records.length;
  const sentCount = records.filter(r => r.status === 'sent' || r.status === 'approved').length;
  const pendingCount = records.filter(r => r.status === 'pending_review' || r.status === 'processing').length;
  const rejectedCount = records.filter(r => r.status === 'rejected').length;

  // Filtered records
  const filteredRecords = records.filter((r) => {
    const matchesSearch = 
      r.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.subject && r.subject.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.draft_subject && r.draft_subject.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'sent') return r.status === 'sent' || r.status === 'approved';
    if (selectedFilter === 'pending_review') return r.status === 'pending_review' || r.status === 'processing';
    if (selectedFilter === 'rejected') return r.status === 'rejected';

    return true;
  });

  const handleCopyBody = (record: EmailRecord) => {
    navigator.clipboard.writeText(record.draft_body || '');
    setCopiedId(record.workflow_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: WorkflowStatus) => {
    switch (status) {
      case 'sent':
      case 'approved':
        return (
          <span className="meta-pill" style={{ color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
            ● Sent
          </span>
        );
      case 'rejected':
        return (
          <span className="meta-pill" style={{ color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            ● Rejected
          </span>
        );
      case 'pending_review':
        return (
          <span className="meta-pill" style={{ color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
            ● Review Pending
          </span>
        );
      default:
        return (
          <span className="meta-pill" style={{ color: '#60a5fa' }}>
            ● {status}
          </span>
        );
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="records-container">
      {/* Top Stat Cards */}
      <div className="records-stats-grid">
        <div className="stat-card">
          <div>
            <div className="stat-val">{totalCount}</div>
            <div className="stat-label">Total Draft Workflows</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa' }}>
            <Mail size={20} />
          </div>
        </div>

        <div className="stat-card">
          <div>
            <div className="stat-val" style={{ color: '#34d399' }}>{sentCount}</div>
            <div className="stat-label">Dispatched via Gmail</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="stat-card">
          <div>
            <div className="stat-val" style={{ color: '#fbbf24' }}>{pendingCount}</div>
            <div className="stat-label">Awaiting Approval</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>
            <Clock size={20} />
          </div>
        </div>

        <div className="stat-card">
          <div>
            <div className="stat-val" style={{ color: '#f87171' }}>{rejectedCount}</div>
            <div className="stat-label">Rejected / Discarded</div>
          </div>
          <div className="stat-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}>
            <XCircle size={20} />
          </div>
        </div>
      </div>

      {/* Toolbar: Search and Filter Tabs */}
      <div className="records-toolbar">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by recipient or subject..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-field"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="filter-pills-row">
            <button 
              type="button" 
              className={`filter-tab-btn ${selectedFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('all')}
            >
              All ({totalCount})
            </button>
            <button 
              type="button" 
              className={`filter-tab-btn ${selectedFilter === 'sent' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('sent')}
            >
              Sent ({sentCount})
            </button>
            <button 
              type="button" 
              className={`filter-tab-btn ${selectedFilter === 'pending_review' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('pending_review')}
            >
              Pending ({pendingCount})
            </button>
            <button 
              type="button" 
              className={`filter-tab-btn ${selectedFilter === 'rejected' ? 'active' : ''}`}
              onClick={() => setSelectedFilter('rejected')}
            >
              Rejected ({rejectedCount})
            </button>
          </div>

          {onRefresh && (
            <button 
              type="button" 
              className="icon-btn-ghost" 
              onClick={onRefresh}
              title="Refresh Records"
            >
              <RotateCw size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Table / Records List */}
      <div className="records-table-wrap">
        {filteredRecords.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <Mail size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
            <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: '1rem' }}>No Email Records Found</div>
            <p style={{ fontSize: '0.82rem', marginTop: 4 }}>
              {searchQuery ? 'Try adjusting your search query or filter.' : 'Generate your first email in Composer to see it recorded here.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <table className="records-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Subject Line</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr key={r.workflow_id}>
                    <td style={{ fontWeight: 600, color: '#f1f5f9' }}>
                      {r.recipient}
                    </td>
                    <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.draft_subject || r.subject}
                    </td>
                    <td>
                      {getStatusBadge(r.status)}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {formatDate(r.created_at)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button 
                          type="button" 
                          className="icon-btn-ghost" 
                          onClick={() => onInspect(r)}
                          title="View Full Email"
                        >
                          <Eye size={15} /> Inspect
                        </button>

                        <button 
                          type="button" 
                          className="icon-btn-ghost" 
                          onClick={() => handleCopyBody(r)}
                          title="Copy Body"
                        >
                          {copiedId === r.workflow_id ? (
                            <Check size={14} color="#10b981" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>

                        <button 
                          type="button" 
                          className="icon-btn-ghost" 
                          onClick={() => onLoadInComposer(r)}
                          title="Load into Composer"
                          style={{ color: '#38bdf8' }}
                        >
                          Load
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile / Sidepanel Card List */}
            <div className="records-mobile-cards">
              {filteredRecords.map((r) => (
                <div key={r.workflow_id} className="record-mobile-card">
                  <div className="record-card-top">
                    <span className="record-card-recipient">{r.recipient}</span>
                    {getStatusBadge(r.status)}
                  </div>
                  <div className="record-card-subject">
                    {r.draft_subject || r.subject}
                  </div>
                  <div className="record-card-footer">
                    <span className="record-card-date">{formatDate(r.created_at)}</span>
                    <div className="record-card-actions">
                      <button 
                        type="button" 
                        className="icon-btn-ghost compact"
                        onClick={() => onInspect(r)}
                        title="View Full Email"
                      >
                        <Eye size={13} /> View
                      </button>
                      <button 
                        type="button" 
                        className="icon-btn-ghost compact"
                        onClick={() => onLoadInComposer(r)}
                        title="Load into Composer"
                        style={{ color: '#38bdf8' }}
                      >
                        <Send size={13} /> Open
                      </button>
                      <button 
                        type="button" 
                        className="icon-btn-ghost compact"
                        onClick={() => handleCopyBody(r)}
                        title="Copy Body"
                      >
                        {copiedId === r.workflow_id ? (
                          <Check size={13} color="#10b981" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
