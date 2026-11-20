'use client';

import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="logo-icon">
          <img
            src="/icons8-bot-48.png"
            alt="AI Email Assistant"
            width={32}
            height={32}
            className="w-8 h-8 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
          />
        </div>
        <div>
          <h1 className="header-title text-white font-bold text-lg">AI Email Assistant</h1>
          <p className="header-subtitle text-zinc-300 text-xs">AI-Powered Email Drafting & Review</p>
        </div>
      </div>
      <div className="header-actions">
        <span className="badge-connected">Ready</span>
      </div>
    </header>
  );
};
