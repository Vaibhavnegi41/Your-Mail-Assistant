'use client';

import React from 'react';
import {
  PenTool,
  Archive,
  FolderLock,
  Sparkles,
  Zap,
  Mail
} from 'lucide-react';

export type NavTab = 'composer' | 'records' | 'vault';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  pendingCount?: number;
  totalRecordsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  pendingCount = 0,
  totalRecordsCount = 0,
}) => {
  return (
    <aside className="vscode-sidebar" aria-label="Main Navigation">
      <div className="sidebar-top">
        {/* Brand Logo */}
        <div
          className="sidebar-logo"
          onClick={() => onTabChange('composer')}
          title="AI Email Assistant"
        >
          <Mail size={22} />
        </div>

        {/* Navigation Buttons (VS Code Activity Bar style) */}
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-btn ${activeTab === 'composer' ? 'active' : ''}`}
            onClick={() => onTabChange('composer')}
            title="Composer & HITL Review (Ctrl+1)"
          >
            <PenTool size={20} />
            <span className="sidebar-label">Composer</span>
          </button>

          <button
            type="button"
            className={`sidebar-btn ${activeTab === 'records' ? 'active' : ''}`}
            onClick={() => onTabChange('records')}
            title="Mail Records & Results (Ctrl+2)"
          >
            <Archive size={20} />
            <span className="sidebar-label">Records</span>
            {totalRecordsCount > 0 && (
              <span
                className="sidebar-badge"
                style={{ background: '#3b82f6', fontSize: '9px' }}
              >
                {totalRecordsCount > 99 ? '99+' : totalRecordsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`sidebar-btn ${activeTab === 'vault' ? 'active' : ''}`}
            onClick={() => onTabChange('vault')}
            title="Document Vault (Ctrl+3)"
          >
            <FolderLock size={20} />
            <span className="sidebar-label">Vault</span>
          </button>
        </nav>
      </div>

      <div className="sidebar-bottom">
        {/* Liveness Indicator */}
        <div
          className="status-indicator-dot"
          title="System Operational"
        />

        {/* User Avatar */}
        <div
          className="user-avatar-btn"
          title="Account / Workspace"
        >
          VN
        </div>
      </div>
    </aside>
  );
};
