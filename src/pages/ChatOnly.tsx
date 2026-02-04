import { AIChat } from '../components/AIChat';

/**
 * Standalone chat page for mobile web app
 * Optimized for quick access without loading dashboard metrics
 */
export function ChatOnly() {
  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      <div className="flex-1 p-2 md:p-4 overflow-hidden">
        <div className="max-w-4xl mx-auto h-full">
          <AIChat />
        </div>
      </div>
    </div>
  );
}
