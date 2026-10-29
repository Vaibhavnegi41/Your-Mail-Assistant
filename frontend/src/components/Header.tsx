'use client';

import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="logo-icon">✉️</div>
        <div>
          <h1 className="header-title">AI Email Assistant</h1>
          <p className="header-subtitle">AI-Powered Email Drafting & Review</p>
        </div>
      </div>
      <div className="header-actions">
        <span className="badge-connected">Ready</span>
      </div>
    </header>
  );
};
