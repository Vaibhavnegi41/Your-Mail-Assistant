export type WorkflowStatus =
  | 'idle'
  | 'processing'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'sending'
  | 'sent'
  | 'failed';

export interface EmailFormData {
  recipient: string;
  subject: string;
  tone: 'professional' | 'casual' | 'persuasive' | 'urgent' | 'concise';
  context: string;
  file?: File | null;
}

export interface ReviewDraft {
  workflow_id: string;
  recipient: string;
  draft_subject: string;
  draft_body: string;
  version: number;
  status: WorkflowStatus;
  message?: string;
}

export interface EmailStatusResponse {
  workflow_id: string;
  status: WorkflowStatus;
  recipient: string;
  subject: string;
  version: number;
  provider_message_id?: string;
  sent_at?: string;
  error_message?: string;
}
