'use client';

import React from 'react';

interface DraftEditorProps {
  recipient: string;
  subject: string;
  body: string;
  version: number;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  readOnly?: boolean;
}

export const DraftEditor: React.FC<DraftEditorProps> = ({
  recipient,
  subject,
  body,
  version,
  onSubjectChange,
  onBodyChange,
  readOnly = false,
}) => {
  return (
    <div className="editor-card">
      <div className="editor-header">
        <h3>Draft Preview (Version {version})</h3>
        <span className="human-review-tag">HITL Review State</span>
      </div>

      <div className="field-group">
        <label>Recipient</label>
        <input
          type="text"
          value={recipient}
          disabled
          className="input-disabled"
        />
      </div>

      <div className="field-group">
        <label>Draft Subject (Editable)</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          disabled={readOnly}
          className="input-text"
        />
      </div>

      <div className="field-group">
        <label>Draft Email Body (Editable)</label>
        <textarea
          rows={10}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          disabled={readOnly}
          className="textarea-body"
        />
      </div>

      <p className="safety-note">
        🛡️ <strong>Safety Rule:</strong> The LLM cannot send email automatically. You must inspect, edit if necessary, and explicitly approve this version before it is dispatched through Gmail.
      </p>
    </div>
  );
};
