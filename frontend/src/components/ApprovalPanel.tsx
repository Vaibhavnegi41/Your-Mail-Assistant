'use client';

import React from 'react';

interface ApprovalPanelProps {
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  isLoading: boolean;
}

export const ApprovalPanel: React.FC<ApprovalPanelProps> = ({
  onApprove,
  onReject,
  onRegenerate,
  isLoading,
}) => {
  return (
    <div className="approval-panel">
      <div className="button-group">
        <button
          type="button"
          onClick={onReject}
          disabled={isLoading}
          className="btn btn-danger"
        >
          Reject Draft
        </button>

        <button
          type="button"
          onClick={onRegenerate}
          disabled={isLoading}
          className="btn btn-secondary"
        >
          Regenerate
        </button>

        <button
          type="button"
          onClick={onApprove}
          disabled={isLoading}
          className="btn btn-primary"
        >
          {isLoading ? 'Processing Send...' : 'Approve & Send via Gmail'}
        </button>
      </div>
    </div>
  );
};
