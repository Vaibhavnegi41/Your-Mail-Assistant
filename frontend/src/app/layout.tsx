import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Email Assistant | Human-In-The-Loop Draft & Approval',
  description: 'AI-powered email drafting with LangGraph HITL workflow, Gmail API, and PostgreSQL persistence.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app-container">
          {children}
        </div>
      </body>
    </html>
  );
}
