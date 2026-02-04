import { AIChat } from '../components/AIChat';
import { MessageSquare } from 'lucide-react';

/**
 * Standalone chat page for mobile web app
 * Optimized for quick access without loading dashboard metrics
 */
export function ChatOnly() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Simple header */}
      <header className="border-b bg-card p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Sage</h1>
        </div>
      </header>

      {/* Chat interface */}
      <main className="flex-1 overflow-auto p-2 md:p-4">
        <div className="max-w-4xl mx-auto h-full">
          <AIChat />
        </div>
      </main>
    </div>
  );
}
