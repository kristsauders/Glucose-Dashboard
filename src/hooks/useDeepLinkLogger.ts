import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { debugLogger } from '@/utils/debug-logger';

/**
 * Hook to log deep-linking state for debugging
 * Logs what's happening in the AIChat deep-link logic
 */
export function useDeepLinkLogger(
  isFetchingConversations: boolean,
  conversationsLength: number,
  activeConversationId: string | null
) {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const conversationId = searchParams.get('conversation');

    debugLogger.log('Deep-Link State', 'Deep-link useEffect running', {
      hasConversationParam: !!conversationId,
      conversationId: conversationId || 'none',
      isFetchingConversations,
      conversationsLength,
      activeConversationId: activeConversationId || 'none',
    });

    if (!conversationId) {
      debugLogger.log('Deep-Link State', 'No conversation ID in URL, skipping');
      return;
    }

    if (isFetchingConversations) {
      debugLogger.log('Deep-Link State', 'Waiting for conversations to load...');
      return;
    }

    if (conversationId === activeConversationId) {
      debugLogger.log('Deep-Link State', 'Already viewing this conversation');
      return;
    }

    debugLogger.log('Deep-Link State', 'Should attempt to load conversation now', {
      conversationId,
    });
  }, [
    searchParams.get('conversation'),
    conversationsLength,
    activeConversationId,
    isFetchingConversations,
  ]);
}
