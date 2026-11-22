import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Your Mail Assistant ',
  description: 'AI-powered email drafting with LangGraph HITL workflow, Gmail API, and PostgreSQL persistence.',
  icons: {
    icon: [
      { url: '/icons8-bot-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icons8-bot-48.png',
    apple: '/icons8-bot-48.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
