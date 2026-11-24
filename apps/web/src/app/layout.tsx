import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentRoom | Multiplayer AI Agent Workspace',
  description: 'A live shared room where engineering teams watch, steer, and take over long-running AI agents.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#141413] text-[#e8e6e3] antialiased selection:bg-[#da7756]/30 selection:text-[#da7756]">
        {children}
      </body>
    </html>
  );
}
