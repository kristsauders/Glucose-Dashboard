import { AIChat } from '../components/AIChat';

/**
 * Standalone chat page for mobile web app
 * Optimized for quick access without loading dashboard metrics
 */
export function ChatOnly() {
  return (
    <div className="min-h-screen bg-background p-2 md:p-4">
      <div className="max-w-4xl mx-auto h-full">
        <AIChat />
      </div>
    </div>
  );
}
