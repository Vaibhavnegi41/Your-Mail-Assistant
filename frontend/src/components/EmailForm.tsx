'use client';

import React, { useState } from 'react';
import { DocumentUpload } from './DocumentUpload';
import { EmailFormData } from '../lib/types';

interface EmailFormProps {
  onSubmit: (data: EmailFormData) => void;
  isLoading: boolean;
}

export const EmailForm: React.FC<EmailFormProps> = ({ onSubmit, isLoading }) => {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [tone, setTone] = useState<EmailFormData['tone']>('professional');
  const [context, setContext] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !subject || !context) return;
    onSubmit({ recipient, subject, tone, context, file });
  };

  return (
    <form className="email-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="recipient">Recipient Email *</label>
        <input
          id="recipient"
          type="email"
          placeholder="colleague@example.com"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          required
          disabled={isLoading}
          className="input-text"
        />
      </div>

      <div className="field-group">
        <label htmlFor="subject">Subject / Goal *</label>
        <input
          id="subject"
          type="text"
          placeholder="e.g. Follow-up on project roadmap proposal"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          disabled={isLoading}
          className="input-text"
        />
      </div>

      <div className="field-group">
        <label htmlFor="tone">Tone of Voice</label>
        <select
          id="tone"
          value={tone}
          onChange={(e) => setTone(e.target.value as EmailFormData['tone'])}
          disabled={isLoading}
          className="select-dropdown"
        >
          <option value="professional">Professional</option>
          <option value="casual">Casual & Friendly</option>
          <option value="persuasive">Persuasive / Sales</option>
          <option value="urgent">Urgent</option>
          <option value="concise">Short & Concise</option>
        </select>
      </div>

      <div className="field-group">
        <label htmlFor="context">Context & Key Points *</label>
        <textarea
          id="context"
          rows={4}
          placeholder="Summarize key talking points, deadlines, actions needed..."
          value={context}
          onChange={(e) => setContext(e.target.value)}
          required
          disabled={isLoading}
          className="textarea-body"
        />
      </div>

      <DocumentUpload
        selectedFile={file}
        onFileSelect={setFile}
        disabled={isLoading}
      />

      <button
        type="submit"
        disabled={isLoading || !recipient || !subject || !context}
        className="btn btn-primary submit-btn"
      >
        {isLoading ? 'Running LangGraph Workflow...' : 'Generate AI Draft'}
      </button>
    </form>
  );
};
