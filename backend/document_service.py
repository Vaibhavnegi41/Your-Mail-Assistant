import io
from fastapi import UploadFile, HTTPException


MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit


async def extract_text_from_file(file: UploadFile) -> str:
    """Validate and extract text from PDF, DOCX, or TXT file."""
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10MB maximum limit")

    filename = file.filename.lower() if file.filename else ""

    if filename.endswith(".pdf"):
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        pages = [page.extract_text() for page in reader.pages if page.extract_text()]
        return "\n".join(pages)

    elif filename.endswith(".docx"):
        import docx
        doc = docx.Document(io.BytesIO(content))
        return "\n".join([p.text for p in doc.paragraphs if p.text])

    elif filename.endswith(".txt"):
        return content.decode("utf-8", errors="replace")

    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported document format. Allowed: .pdf, .docx, .txt"
        )
