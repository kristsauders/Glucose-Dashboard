import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Bot, Send, Trash2, Loader2, User, MessageSquare, Menu, Plus, X, Edit2, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { apiService } from '@/services/api';
import { format } from 'date-fns';
import type { Conversation, Message } from '@/types/chat';

const MESSAGE_PAGE_SIZE = 50; // Only render this many recent messages at once

export function AIChat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingConversations, setIsFetchingConversations] = useState(true);
  const [conversationsError, setConversationsError] = useState('');
  const [error, setError] = useState('');
  const [streamingMessage, setStreamingMessage] = useState('');
  const [thinkingMessage, setThinkingMessage] = useState('');
  const [status, setStatus] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [expandedToolsMessageId, setExpandedToolsMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const deepLinkAttemptedRef = useRef<string | null>(null);

  // Only render recent messages for performance (paginated)
  const visibleMessages = useMemo(() => {
    if (messages.length <= MESSAGE_PAGE_SIZE) return messages;
    return messages.slice(-MESSAGE_PAGE_SIZE);
  }, [messages]);

  // Auto-hide sidebar on mobile
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setShowSidebar(!isMobile);
  }, []);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      setConversationsError('');
      const convos = await apiService.getConversations();
      setConversations(convos);

      // Don't auto-load conversation - let user select to improve initial load time
      // If there's a URL parameter, that will be handled by the deep-link useEffect
    } catch (err: any) {
      console.error('Failed to fetch conversations:', err);
      setConversationsError(err.message || 'Failed to load conversations. Please check your connection.');
    } finally {
      setIsFetchingConversations(false);
    }
  };

  // Scroll handling is now done directly in handleSend() for better reliability

  // Note: Input auto-focus is handled specifically in loadConversation() and handleNewChat()
  // Don't auto-focus on every message change as it interferes with scroll behavior

  // Handle deep-link from push notification (URL parameter)
  useEffect(() => {
    const conversationId = searchParams.get('conversation');

    // Skip if no conversation ID in URL
    if (!conversationId) {
      deepLinkAttemptedRef.current = null;
      return;
    }

    // Skip if still fetching conversations (will retry when fetch completes)
    if (isFetchingConversations) {
      console.log('[Deep-Link] Waiting for conversations to load...', { conversationId });
      return;
    }

    // Skip if we've already attempted this conversation
    if (deepLinkAttemptedRef.current === conversationId) {
      console.log('[Deep-Link] Already attempted this conversation:', conversationId);
      return;
    }

    // Mark this conversation as attempted
    deepLinkAttemptedRef.current = conversationId;

    console.log('[Deep-Link] Attempting to open conversation:', conversationId);
    console.log('[Deep-Link] Available conversations:', conversations.map(c => ({ id: c.id, title: c.title })));
    console.log('[Deep-Link] Currently active:', activeConversationId);

    // Skip if already viewing this conversation
    if (conversationId === activeConversationId) {
      console.log('[Deep-Link] Already viewing this conversation, clearing URL param');
      // Delay clearing to ensure everything is loaded
      setTimeout(() => setSearchParams({}), 1000);
      return;
    }

    // Try to find conversation in the list
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
      console.log('[Deep-Link] Found conversation in list:', conversation.title);
      loadConversation(conversationId).then(() => {
        // Only clear search params after conversation loads successfully
        setTimeout(() => setSearchParams({}), 500);
      }).catch(() => {
        // Don't clear on error so user can retry
      });
      return;
    }

    // Conversation not in list - try direct load (handles new proactive conversations)
    console.warn('[Deep-Link] Conversation not in list, attempting direct load...');
    console.warn('[Deep-Link] This is normal for new proactive messages');

    // Retry logic for race conditions and network delays (e.g., VPN connection)
    const attemptLoad = async (retryCount = 0): Promise<void> => {
      try {
        const messageCount = await loadConversation(conversationId);

        // Retry if conversation loaded but has no messages - this happens when the
        // push notification fires before the DB transaction for messages is committed.
        // Proactive conversations are created, messages inserted, then notification sent —
        // but 1s may not always be enough on a loaded server.
        if (messageCount === 0 && retryCount < 8) {
          const delay = retryCount === 0 ? 1000 : Math.min((retryCount + 1) * 1000, 7000);
          console.warn(`[Deep-Link] Conversation loaded but empty, retrying in ${delay}ms (attempt ${retryCount + 1}/8)`);
          setTimeout(() => attemptLoad(retryCount + 1), delay);
          return;
        }

        console.log('[Deep-Link] Direct load successful with', messageCount, 'messages');
        // Only clear search params after conversation loads successfully with messages
        setTimeout(() => setSearchParams({}), 500);
        // Refresh conversation list to include the new one
        fetchConversations();
      } catch (error: any) {
        // Check if it's a network error or not found error
        const isNotFound = error.message?.includes('not found') || error.response?.status === 404;
        const isNetworkError = error.message?.includes('fetch') || error.message?.includes('network') || !error.response;

        // Retry up to 8 times with exponential backoff for not found or network errors
        // This handles VPN connection delays and DB commit race conditions
        if ((isNotFound || isNetworkError) && retryCount < 8) {
          // Exponential backoff: 500ms, 1s, 2s, 3s, 4s, 5s, 6s, 7s
          const delay = retryCount === 0 ? 500 : Math.min((retryCount) * 1000, 7000);
          console.warn(`[Deep-Link] ${isNetworkError ? 'Network error' : 'Conversation not found'}, retrying in ${delay}ms (attempt ${retryCount + 1}/8)`);
          setTimeout(() => attemptLoad(retryCount + 1), delay);
        } else {
          console.error('[Deep-Link] Direct load failed after all retries:', error);
          console.error('[Deep-Link] Error details:', error.message, error.response?.status);
          // Don't clear search params on error so user can see what failed
          // Show error to user
          setError(`Failed to load conversation: ${error.message}`);
        }
      }
    };

    attemptLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('conversation'), conversations, activeConversationId, isFetchingConversations]);

  // Listen for messages from service worker
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'OPEN_CONVERSATION') {
        const conversationId = event.data.conversationId;
        console.log('[Service Worker Message] Request to open conversation:', conversationId);
        console.log('[Service Worker Message] Currently active:', activeConversationId);

        if (!conversationId) {
          console.warn('[Service Worker Message] No conversation ID provided');
          return;
        }

        // Skip if already viewing this conversation
        if (conversationId === activeConversationId) {
          console.log('[Service Worker Message] Already viewing this conversation');
          return;
        }

        // Try to find conversation in the list
        const conversation = conversations.find(c => c.id === conversationId);
        if (conversation) {
          console.log('[Service Worker Message] Found conversation in list:', conversation.title);
          loadConversation(conversationId);
          return;
        }

        // Conversation not in list - try direct load with retries
        console.warn('[Service Worker Message] Conversation not in list, attempting direct load...');
        console.warn('[Service Worker Message] This is normal for new proactive messages');

        // Retry logic for network delays (e.g., VPN connection)
        const attemptLoadFromSW = async (retryCount = 0): Promise<void> => {
          try {
            await loadConversation(conversationId);
            console.log('[Service Worker Message] Direct load successful');
            // Refresh conversation list to include the new one
            fetchConversations();
          } catch (error: any) {
            const isNotFound = error.message?.includes('not found') || error.response?.status === 404;
            const isNetworkError = error.message?.includes('fetch') || error.message?.includes('network') || !error.response;

            // Retry up to 8 times with exponential backoff
            if ((isNotFound || isNetworkError) && retryCount < 8) {
              const delay = retryCount === 0 ? 500 : Math.min((retryCount) * 1000, 7000);
              console.warn(`[Service Worker Message] ${isNetworkError ? 'Network error' : 'Conversation not found'}, retrying in ${delay}ms (attempt ${retryCount + 1}/8)`);
              setTimeout(() => attemptLoadFromSW(retryCount + 1), delay);
            } else {
              console.error('[Service Worker Message] Direct load failed after all retries:', error);
              console.error('[Service Worker Message] Error details:', error.message);
              setError(`Failed to load conversation: ${error.message}`);
            }
          }
        };

        attemptLoadFromSW();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
    // Only re-run when conversations list length changes, not the full array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length, activeConversationId]);

  // Handle viewport resize (keyboard appearing/disappearing on mobile)
  useEffect(() => {
    let initialHeight = window.visualViewport?.height || window.innerHeight;

    const handleViewportResize = () => {
      const currentHeight = window.visualViewport?.height || window.innerHeight;
      const heightDiff = initialHeight - currentHeight;

      // If viewport height decreased by >150px, keyboard is likely appearing
      if (heightDiff > 150) {
        console.log('[Viewport Resize] Keyboard detected (height change:', heightDiff, 'px)');

        // Scroll to bottom when keyboard appears
        const scrollToBottom = () => {
          const container = messagesContainerRef.current;
          if (container && !isLoading) {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: 'auto'
            });

            // Also scroll window
            requestAnimationFrame(() => {
              window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: 'auto'
              });
            });
          }
        };

        // Multiple retries to handle animation
        scrollToBottom();
        setTimeout(scrollToBottom, 100);
        setTimeout(scrollToBottom, 300);
      }

      // Update initial height for next comparison
      initialHeight = currentHeight;
    };

    // Listen to both visualViewport (better for keyboard) and window resize
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }
    window.addEventListener('resize', handleViewportResize);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }
      window.removeEventListener('resize', handleViewportResize);
    };
  }, [isLoading]);

  const loadConversation = async (conversationId: string): Promise<number> => {
    try {
      console.log('[Load Conversation] Loading conversation:', conversationId);
      const conversation = await apiService.getConversation(conversationId);
      console.log('[Load Conversation] Received conversation with', conversation.messages.length, 'messages');
      console.log('[Load Conversation] Conversation title:', conversation.title);
      setActiveConversationId(conversationId);
      setMessages(conversation.messages);

      // Auto-hide sidebar on mobile after selecting conversation
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        setShowSidebar(false);
      }

      // Wait for React to finish rendering, then focus and scroll
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            console.log('[Load Conversation] Attempting to focus input');
            if (inputRef.current) {
              inputRef.current.focus();
            }
            // Scroll container to bottom to ensure input is visible
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTo({
                top: messagesContainerRef.current.scrollHeight,
                behavior: 'smooth'
              });
            }
          }, isMobile ? 100 : 50);
        });
      });

      // Additional scroll after keyboard appears (iOS keyboard animation delay)
      if (isMobile) {
        setTimeout(() => {
          console.log('[Load Conversation] Additional scroll for keyboard');
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTo({
              top: messagesContainerRef.current.scrollHeight,
              behavior: 'smooth'
            });
          }
        }, 600);
      }

      return conversation.messages.length;
    } catch (err: any) {
      console.error('[Load Conversation] Failed to load conversation:', err);
      console.error('[Load Conversation] Error details:', {
        message: err.message,
        status: err.status,
        conversationId
      });
      setError(`Failed to load conversation: ${err.message || 'Unknown error'}`);
      throw err; // Re-throw so the deep-link handler can catch it
    }
  };

  const handleNewChat = async () => {
    try {
      const newConversation = await apiService.createConversation();
      setConversations((prev) => [newConversation, ...prev]);
      setActiveConversationId(newConversation.id);
      setMessages([]);
      setError('');

      // Auto-hide sidebar on mobile after creating new chat
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        setShowSidebar(false);
      }

      // Wait for React to finish rendering, then focus and scroll
      // Use requestAnimationFrame to ensure browser has painted
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            console.log('[New Chat] Attempting to focus input');
            console.log('[New Chat] Input ref exists:', !!inputRef.current);
            console.log('[New Chat] Input disabled:', inputRef.current?.disabled);

            if (inputRef.current) {
              inputRef.current.focus();
              console.log('[New Chat] Focus called, document.activeElement:', document.activeElement?.tagName);
            }

            // Scroll container to bottom to ensure input is visible
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTo({
                top: messagesContainerRef.current.scrollHeight,
                behavior: 'smooth'
              });
            }
          }, isMobile ? 100 : 50); // Small delay after animation frames
        });
      });

      // Additional scroll after keyboard appears (iOS keyboard animation delay)
      if (isMobile) {
        setTimeout(() => {
          console.log('[New Chat] Additional scroll for keyboard');
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTo({
              top: messagesContainerRef.current.scrollHeight,
              behavior: 'smooth'
            });
          }
        }, 600);
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
      setError('Failed to create new conversation');
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) return;

    try {
      await apiService.deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));

      // If deleting active conversation, switch to another or create new
      if (conversationId === activeConversationId) {
        const remaining = conversations.filter((c) => c.id !== conversationId);
        if (remaining.length > 0) {
          await loadConversation(remaining[0].id);
        } else {
          setActiveConversationId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      setError('Failed to delete conversation');
    }
  };

  const handleUpdateTitle = async (conversationId: string, newTitle: string) => {
    try {
      await apiService.updateConversation(conversationId, newTitle);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title: newTitle } : c))
      );
      setEditingTitleId(null);
    } catch (err) {
      console.error('Failed to update title:', err);
      setError('Failed to update title');
    }
  };

  const startEditingTitle = (conversation: Conversation) => {
    setEditingTitleId(conversation.id);
    setEditingTitleValue(conversation.title || '');
  };

  const handleSend = async () => {
    const message = input.trim();
    if (!message || isLoading) return;

    setInput('');
    setError('');
    setIsLoading(true);
    setStreamingMessage('');
    setThinkingMessage('');
    setStatus('');

    // Add user message optimistically
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConversationId || '',
      role: 'user',
      content: message,
      metadata: { timestamp: new Date().toISOString() },
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    // Scroll to show the streaming message area at the top of the viewport
    // Use multiple attempts to work around keyboard closing timing
    console.log('[Send] Scrolling to show response area');

    const attemptScroll = (attemptNumber: number) => {
      const element = streamingMessageRef.current;
      const container = messagesContainerRef.current;

      console.log(`[Send] Scroll attempt ${attemptNumber}, element:`, !!element, 'container:', !!container);

      if (element && container) {
        // Scroll the messages container to show streaming message at top with padding
        const elementTop = element.offsetTop;
        const targetScroll = elementTop - 80; // 80px padding from top

        console.log(`[Send] Scrolling container to ${targetScroll}, current: ${container.scrollTop}`);
        container.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      } else if (container) {
        // Fallback: scroll container to bottom
        console.log('[Send] Element not found, scrolling container to bottom');
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      }
    };

    // Multiple attempts with increasing delays to handle:
    // 1. React rendering delay
    // 2. Keyboard closing animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        attemptScroll(1);
        setTimeout(() => attemptScroll(2), 100);
        setTimeout(() => attemptScroll(3), 300);
        setTimeout(() => attemptScroll(4), 600);
        setTimeout(() => attemptScroll(5), 900);
      });
    });

    try {
      const token = localStorage.getItem('t1d_auth_token');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';

      // Add timeout to fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const response = await fetch(`${apiUrl}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          conversationId: activeConversationId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to send message' }));
        throw new Error(errorData.error || 'Failed to send message');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream');
      }

      let buffer = '';
      let fullContent = '';
      let metadata: any = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'status') {
              setStatus(data.content);
            } else if (data.type === 'thinking') {
              setThinkingMessage(data.content);
            } else if (data.type === 'content') {
              fullContent += data.content;
              setStreamingMessage(fullContent);
            } else if (data.type === 'done') {
              metadata = data.metadata;
            } else if (data.type === 'error') {
              throw new Error(data.content);
            }
          }
        }
      }

      // If a new conversation was created, update state
      if (metadata.conversationId && metadata.conversationId !== activeConversationId) {
        setActiveConversationId(metadata.conversationId);
        // Refresh conversations list to get the new conversation with title
        const updatedConversations = await apiService.getConversations();
        setConversations(updatedConversations);
      } else if (activeConversationId) {
        // Update conversation's updated_at by refreshing the list
        const updatedConversations = await apiService.getConversations();
        setConversations(updatedConversations);
      }

      // Add final assistant message
      const assistantMessage: Message = {
        id: `${Date.now() + 1}`,
        conversation_id: metadata.conversationId || activeConversationId || '',
        role: 'assistant',
        content: fullContent,
        metadata: {
          timestamp: new Date().toISOString(),
          duration: metadata.duration,
          toolCalls: metadata.toolCalls,
          toolNames: metadata.toolNames || [],
        },
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingMessage('');
      setThinkingMessage('');
      setStatus('');
    } catch (err: any) {
      let errorMessage = 'Failed to send message';
      if (err.name === 'AbortError') {
        errorMessage = 'Request timed out. The server may be busy.';
      } else if (err.message?.includes('fetch')) {
        errorMessage = 'Connection failed. Please check your network.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      // Remove optimistic user message on error
      setMessages((prev) => prev.slice(0, -1));
      setStreamingMessage('');
      setThinkingMessage('');
      setStatus('');
    } finally {
      setIsLoading(false);
      // Don't auto-focus input after sending - let user read the response
      // They can tap/click input when ready to type next message
    }
  };


  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isFetchingConversations) {
    return (
      <Card className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Card>
    );
  }

  if (conversationsError) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 p-6 max-w-md">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <div>
            <h3 className="font-semibold text-lg mb-2">Failed to Load Conversations</h3>
            <p className="text-sm text-muted-foreground">{conversationsError}</p>
          </div>
          <Button onClick={() => {
            setIsFetchingConversations(true);
            setConversationsError('');
            fetchConversations();
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="h-full flex gap-0">
      {/* Sidebar */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-r bg-card overflow-hidden flex-shrink-0"
            style={{ minWidth: '320px' }}
          >
            <div className="h-full flex flex-col">
              {/* Sidebar Header */}
              <div className="p-4 border-b">
                <Button
                  onClick={handleNewChat}
                  className="w-full"
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Chat
                </Button>
              </div>

              {/* Conversations List */}
              <div className="flex-1 overflow-y-auto p-2">
                {conversations.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground p-4">
                    No conversations yet
                  </div>
                ) : (
                  <div className="space-y-1">
                    {conversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={`group relative rounded-lg p-2 md:p-3 cursor-pointer transition-colors ${
                          conversation.id === activeConversationId
                            ? 'bg-primary/10 border border-primary/20'
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => loadConversation(conversation.id)}
                      >
                        {editingTitleId === conversation.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editingTitleValue}
                              onChange={(e) => setEditingTitleValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleUpdateTitle(conversation.id, editingTitleValue);
                                } else if (e.key === 'Escape') {
                                  setEditingTitleId(null);
                                }
                              }}
                              className="h-6 text-xs"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateTitle(conversation.id, editingTitleValue);
                              }}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {conversation.title || 'New Conversation'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(conversation.updated_at), 'MMM d, h:mm a')}
                                </p>
                              </div>
                              <div className="hidden md:flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditingTitle(conversation);
                                  }}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteConversation(conversation.id);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <Card className="flex-1 flex flex-col border-0 rounded-none">
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSidebar(!showSidebar)}
                className="h-8 w-8 p-0"
              >
                {showSidebar ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
              {activeConversationId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteConversation(activeConversationId)}
                  disabled={isLoading}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Bot className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>
                  {activeConversation?.title || 'Sage'}
                </CardTitle>
              </div>
            </div>
          </div>
        </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 md:p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">No messages yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Start a conversation with Sage. Ask questions about your glucose data,
                patterns, or get personalized insights.
              </p>
              <div className="mt-6 space-y-2 text-xs text-muted-foreground text-left w-full max-w-md">
                <p className="font-medium mb-1">Try asking:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>"Show me my glucose statistics for the last 7 days"</li>
                  <li>"What patterns do you see in my overnight glucose?"</li>
                  <li>"How is my time in range trending?"</li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              {visibleMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'user' ? (
                    <>
                      <div className="flex-1 max-w-[80%] text-right">
                        <div className="block rounded-lg p-3 w-full bg-primary text-primary-foreground" style={{ maxWidth: '100%', overflowX: 'auto' }}>
                          <p className="text-[13px] md:text-sm whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground justify-end">
                          <span>
                            {format(new Date(message.created_at), 'MMM d, h:mm a')}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                          <User className="h-4 w-4 text-primary-foreground" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full">
                      <div className="w-full py-2 font-libre-baskerville">
                        <div className="text-base leading-relaxed prose prose-base dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>
                          {format(new Date(message.created_at), 'MMM d, h:mm a')}
                        </span>
                        {message.metadata.toolCalls !== undefined &&
                          message.metadata.toolCalls > 0 && (
                            <div className="relative">
                              <button
                                onClick={() => setExpandedToolsMessageId(
                                  expandedToolsMessageId === message.id ? null : message.id
                                )}
                                className="text-primary hover:underline cursor-pointer"
                              >
                                • {message.metadata.toolCalls} tool{message.metadata.toolCalls !== 1 ? 's' : ''} used
                              </button>
                              {expandedToolsMessageId === message.id && message.metadata.toolNames && message.metadata.toolNames.length > 0 && (
                                <div className="absolute bottom-full left-0 mb-1 bg-popover border rounded-md shadow-md p-2 z-10 min-w-[200px]">
                                  <div className="text-xs font-semibold mb-1">Tools used:</div>
                                  <ul className="space-y-0.5">
                                    {message.metadata.toolNames.map((tool: string, idx: number) => (
                                      <li key={idx} className="text-xs">• {tool}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
          {isLoading && (
            <div
              ref={streamingMessageRef}
              className="w-full"
              style={{ minHeight: '70vh' }} // Extra space below so message can scroll to top with room to fill
            >
              <div className="w-full">
                {status && (
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {status}
                  </div>
                )}
                {thinkingMessage && (
                  <p className="text-sm text-muted-foreground italic mb-3">{thinkingMessage}</p>
                )}
                {streamingMessage ? (
                  <div className="w-full py-2 font-libre-baskerville" style={{ maxWidth: '100%', overflowX: 'auto' }}>
                    <div className="text-base leading-relaxed prose prose-base dark:prose-invert max-w-none overflow-x-auto">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamingMessage}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t px-2 py-4 md:p-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={() => {
                // Only scroll to bottom if NOT currently streaming a message
                // (streaming messages should stay at top of viewport)
                if (!isLoading && messagesContainerRef.current) {
                  console.log('[Input Focus] Scrolling container to bottom for keyboard');
                  const scrollToBottom = () => {
                    const container = messagesContainerRef.current;
                    if (container) {
                      // Use 'auto' instead of 'smooth' to prevent interruption
                      container.scrollTo({
                        top: container.scrollHeight,
                        behavior: 'auto'
                      });

                      // Also scroll the window/body to ensure input is visible
                      // This helps on iOS Safari where the keyboard can obscure content
                      requestAnimationFrame(() => {
                        window.scrollTo({
                          top: document.documentElement.scrollHeight,
                          behavior: 'auto'
                        });
                      });
                    }
                  };

                  // Aggressive retry schedule to handle keyboard animation delays
                  // iOS keyboard can take 400-800ms to fully appear
                  scrollToBottom(); // Immediate
                  setTimeout(scrollToBottom, 50);   // Very fast retry
                  setTimeout(scrollToBottom, 150);  // Early keyboard animation
                  setTimeout(scrollToBottom, 300);  // Mid keyboard animation
                  setTimeout(scrollToBottom, 500);  // Late keyboard animation
                  setTimeout(scrollToBottom, 700);  // Keyboard fully visible
                  setTimeout(scrollToBottom, 1000); // Final retry after any settling
                } else {
                  console.log('[Input Focus] Skipping scroll (message is streaming)');
                }
              }}
              placeholder="Ask about your glucose data..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
