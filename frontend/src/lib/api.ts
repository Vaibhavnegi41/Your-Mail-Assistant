import { ReviewDraft, EmailStatusResponse } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export async function generateEmail(formData: FormData): Promise<{ workflow_id: string; status: string }> {
  const response = await fetch(`${API_URL}/emails/generate`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Unable to generate email draft');
  }

  return response.json();
}

export async function getReviewPayload(workflowId: string): Promise<ReviewDraft> {
  const response = await fetch(`${API_URL}/emails/${workflowId}/review`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Unable to fetch draft review');
  }

  return response.json();
}

export async function approveEmail(
  workflowId: string,
  subject: string,
  body: string
): Promise<{ workflow_id: string; status: string; gmail_message_id?: string }> {
  const response = await fetch(`${API_URL}/emails/${workflowId}/approve`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subject, body }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Unable to approve email');
  }

  return response.json();
}

export async function rejectEmail(workflowId: string): Promise<{ workflow_id: string; status: string }> {
  const response = await fetch(`${API_URL}/emails/${workflowId}/reject`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Unable to reject draft');
  }

  return response.json();
}

export async function getEmailStatus(workflowId: string): Promise<EmailStatusResponse> {
  const response = await fetch(`${API_URL}/emails/${workflowId}/status`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Unable to retrieve workflow status');
  }

  return response.json();
}

export async function getEmailRecords(): Promise<import('./types').EmailRecord[]> {
  try {
    const response = await fetch(`${API_URL}/emails/records`, {
      method: 'GET',
      credentials: 'include',
    });
    if (response.ok) {
      const data = await response.json();
      return data.records || [];
    }
  } catch (err) {
    console.warn('Failed to fetch backend records:', err);
  }
  return [];
}

export async function uploadDocumentToVault(file: File): Promise<{
  document_id: string;
  filename: string;
  extracted_length: number;
  chunks_indexed: number;
  preview: string;
  namespace: string;
}> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/documents`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to upload document');
  }

  return response.json();
}

export async function getUserDocuments(): Promise<any[]> {
  try {
    const response = await fetch(`${API_URL}/documents`, {
      method: 'GET',
      credentials: 'include',
    });
    if (response.ok) {
      const data = await response.json();
      return data.documents || [];
    }
  } catch (err) {
    console.warn('Failed to fetch user documents:', err);
  }
  return [];
}

export async function deleteDocumentFromVault(docId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/documents/${docId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return response.ok;
  } catch (err) {
    console.error('Failed to delete document from vault:', err);
    return false;
  }
}

