import { ReviewDraft, EmailStatusResponse } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// ---------------------------------------------------------------------------
// Extension Auth Token Manager
//
// When running inside the Chrome Extension side panel, the service worker
// injects the Google OAuth access_token via postMessage:
//   { type: 'EXTENSION_AUTH_TOKEN', token: '<google_access_token>' }
//
// All fetch calls to the backend then attach:
//   Authorization: Bearer <token>
//
// If the backend returns 401, we notify the extension to refresh the token.
// ---------------------------------------------------------------------------
let _extensionToken: string | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'EXTENSION_AUTH_TOKEN' && event.data.token) {
      _extensionToken = event.data.token;
      console.log('[API] Extension auth token received.');
    }
  });
}

function authHeaders(): Record<string, string> {
  return _extensionToken ? { Authorization: `Bearer ${_extensionToken}` } : {};
}

function handleUnauthorized(response: Response): void {
  if (response.status === 401 && _extensionToken) {
    _extensionToken = null;
    if (typeof window !== 'undefined') {
      window.parent?.postMessage({ type: 'REQUEST_AUTH_TOKEN_REFRESH' }, '*');
    }
  }
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function generateEmail(formData: FormData): Promise<ReviewDraft> {
  const response = await fetch(`${API_URL}/emails/generate`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...authHeaders() },
    body: formData,
  });

  if (!response.ok) {
    handleUnauthorized(response);
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Unable to generate email draft');
  }

  return response.json();
}

export async function getReviewPayload(workflowId: string): Promise<ReviewDraft> {
  const response = await fetch(`${API_URL}/emails/${workflowId}/review`, {
    method: 'GET',
    credentials: 'include',
    headers: { ...authHeaders() },
  });

  if (!response.ok) {
    handleUnauthorized(response);
    throw new Error('Unable to fetch draft review');
  }

  return response.json();
}

export async function approveEmail(
  workflowId: string,
  subject: string,
  body: string,
  recipient?: string
): Promise<{ workflow_id: string; status: string; gmail_message_id?: string }> {
  const response = await fetch(`${API_URL}/emails/${workflowId}/approve`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ subject, body, recipient }),
  });

  if (!response.ok) {
    handleUnauthorized(response);
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Unable to approve email');
  }

  return response.json();
}

export async function rejectEmail(workflowId: string): Promise<{ workflow_id: string; status: string }> {
  const response = await fetch(`${API_URL}/emails/${workflowId}/reject`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...authHeaders() },
  });

  if (!response.ok) {
    handleUnauthorized(response);
    throw new Error('Unable to reject draft');
  }

  return response.json();
}

export async function getEmailStatus(workflowId: string): Promise<EmailStatusResponse> {
  const response = await fetch(`${API_URL}/emails/${workflowId}/status`, {
    method: 'GET',
    credentials: 'include',
    headers: { ...authHeaders() },
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
      headers: { ...authHeaders() },
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

export async function getUserDocuments(): Promise<any[]> {
  try {
    const response = await fetch(`${API_URL}/documents`, {
      method: 'GET',
      credentials: 'include',
      headers: { ...authHeaders() },
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
      headers: { ...authHeaders() },
    });
    return response.ok;
  } catch (err) {
    console.error('Failed to delete document from vault:', err);
    return false;
  }
}
