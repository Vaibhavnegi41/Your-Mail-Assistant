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
  userProfile?: {
    email: string;
    name: string;
    picture?: string;
  } | null;
  onProfileClick?: () => void;
  userInitials?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  pendingCount = 0,
  totalRecordsCount = 0,
  userProfile = null,
  onProfileClick,
  userInitials = 'VN',
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
          <img
            src="/icons8-bot-48.png"
            alt="AI Email Assistant"
            width={32}
            height={32}
            className="w-8 h-8 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]"
          />
        </div>

        {/* Navigation Buttons (VS Code Activity Bar style) */}
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-btn ${activeTab === 'composer' ? 'active' : ''}`}
            onClick={() => onTabChange('composer')}
            title="Composer & HITL Review (Ctrl+1)"
          >
            <PenTool size={22} />
            <span className="sidebar-label">Composer</span>
          </button>

          <button
            type="button"
            className={`sidebar-btn ${activeTab === 'records' ? 'active' : ''}`}
            onClick={() => onTabChange('records')}
            title="Mail Records & Results (Ctrl+2)"
          >
            <Archive size={22} />
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
            <FolderLock size={22} />
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
        <button
          type="button"
          onClick={onProfileClick}
          className="user-avatar-btn overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          title={userProfile?.name || 'Account & Profile'}
          aria-label="Account details"
        >
          {userProfile?.picture ? (
            <img
              src={userProfile.picture}
              alt={userProfile.name || 'User'}
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <span>{userInitials || 'VN'}</span>
          )}
        </button>
      </div>
    </aside>
  );
};
