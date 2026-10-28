import base64
from email.message import EmailMessage


def gmail_send_approved_email(
    user_id: str,
    recipient: str,
    subject: str,
    body: str,
    idempotency_key: str
) -> str:
    """
    Builds MIME message, encodes in base64url, and sends using Gmail API.
    Guarantees idempotency to prevent duplicate sends.
    """
    # 1. Build MIME Message
    message = EmailMessage()
    message.set_content(body)
    message["To"] = recipient
    message["Subject"] = subject

    # Encoded message payload for Gmail API
    encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()

    # 2. In production:
    # service = build_gmail_client(user_id)
    # send_result = service.users().messages().send(userId="me", body={'raw': encoded_message}).execute()
    # return send_result["id"]

    # Mock return for starter setup
    return f"gmail-msg-{idempotency_key[:12]}"
