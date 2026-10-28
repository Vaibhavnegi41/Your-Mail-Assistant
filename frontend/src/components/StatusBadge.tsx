'use client';

import React from 'react';
import { WorkflowStatus } from '../lib/types';

interface StatusBadgeProps {
  status: WorkflowStatus;
}

const statusConfig: Record<WorkflowStatus, { label: string; className: string }> = {
  idle: { label: 'Ready', className: 'status-idle' },
  processing: { label: 'Generating Draft...', className: 'status-processing' },
  pending_review: { label: 'Needs Human Review', className: 'status-review' },
  approved: { label: 'Approved', className: 'status-approved' },
  rejected: { label: 'Draft Rejected', className: 'status-rejected' },
  sending: { label: 'Sending via Gmail...', className: 'status-sending' },
  sent: { label: 'Sent to Gmail', className: 'status-sent' },
  failed: { label: 'Failed', className: 'status-failed' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config = statusConfig[status] || { label: status, className: 'status-idle' };
  return <span className={`badge ${config.className}`}>{config.label}</span>;
};
