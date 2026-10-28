'use client';

import React, { useRef } from 'react';

interface DocumentUploadProps {
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  selectedFile,
  onFileSelect,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="upload-container">
      <label className="upload-label">
        Reference Document (Optional: PDF, DOCX, TXT - max 10MB)
      </label>
      <div
        className={`dropzone ${selectedFile ? 'has-file' : ''}`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleFileChange}
          disabled={disabled}
          style={{ display: 'none' }}
        />
        {selectedFile ? (
          <div className="file-info">
            <span className="file-name">📄 {selectedFile.name}</span>
            <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
            <button
              type="button"
              className="remove-btn"
              onClick={(e) => {
                e.stopPropagation();
                onFileSelect(null);
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="placeholder-text">
            <span>📎 Click to attach reference document</span>
            <span className="subtext">Text is safely bounded and parsed on the backend</span>
          </div>
        )}
      </div>
    </div>
  );
};
