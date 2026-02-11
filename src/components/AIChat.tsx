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
  const [status, setStatus] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [expandedToolsMessageId, setExpandedToolsMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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

    // Skip if no conversation ID in URL or still fetching conversations
    if (!conversationId || isFetchingConversations) {
      return;
    }

    console.log('[Deep-Link] Attempting to open conversation:', conversationId);
    console.log('[Deep-Link] Available conversations:', conversations.map(c => c.id));
    console.log('[Deep-Link] Currently active:', activeConversationId);

    // Skip if already viewing this conversation
    if (conversationId === activeConversationId) {
      console.log('[Deep-Link] Already viewing this conversation, clearing URL param');
      setSearchParams({});
      return;
    }

    // Try to load the conversation
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
      console.log('[Deep-Link] Found conversation, loading:', conversation.title);
      loadConversation(conversationId);
      // Clear URL parameter after loading
      setSearchParams({});
    } else if (conversations.length > 0) {
      // Conversations are loaded but conversation not found
      console.warn('[Deep-Link] Conversation not found in list:', conversationId);
      console.warn('[Deep-Link] This might be a timing issue. Attempting direct load...');

      // Try loading directly by ID (in case it's a new conversation not in the list yet)
      loadConversation(conversationId).then(() => {
        console.log('[Deep-Link] Direct load successful');
        setSearchParams({});
        // Refresh conversation list to include the new one
        fetchConversations();
      }).catch((error) => {
        console.error('[Deep-Link] Direct load failed:', error);
        setSearchParams({});
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('conversation'), conversations.length, activeConversationId, isFetchingConversations]);

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

        // Try to load the conversation (will refresh list if needed)
        const conversation = conversations.find(c => c.id === conversationId);
        if (conversation) {
          console.log('[Service Worker Message] Found conversation, loading:', conversation.title);
          loadConversation(conversationId);
        } else {
          console.warn('[Service Worker Message] Conversation not in list, attempting direct load...');
          loadConversation(conversationId).then(() => {
            console.log('[Service Worker Message] Direct load successful');
            // Refresh conversation list to include the new one
            fetchConversations();
          }).catch((error) => {
            console.error('[Service Worker Message] Direct load failed:', error);
          });
        }
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

  const loadConversation = async (conversationId: string) => {
    try {
      const conversation = await apiService.getConversation(conversationId);
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
    } catch (err) {
      console.error('Failed to load conversation:', err);
      setError('Failed to load conversation');
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
        <div ref={messagesContainerRef} className="flex-1 overflow-x-auto overflow-y-auto px-2 py-4 md:p-4 space-y-4">
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
                  <div
                    className={`${
                      message.role === 'user' ? 'flex-1 max-w-[80%] text-right' : 'min-w-0 flex-1 text-left'
                    }`}
                  >
                    <div
                      className={`block rounded-lg p-3 w-full ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                      style={{ maxWidth: '100%', overflowX: 'auto' }}
                    >
                      {message.role === 'user' ? (
                        <p className="text-[13px] md:text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      ) : (
                        <div className="text-[13px] md:text-sm prose prose-sm dark:prose-invert max-w-none overflow-x-auto">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
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
                  {message.role === 'user' && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <User className="h-4 w-4 text-primary-foreground" />
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
                {streamingMessage ? (
                  <div className="bg-muted rounded-lg p-3 w-full" style={{ maxWidth: '100%', overflowX: 'auto' }}>
                    <div className="text-[13px] md:text-sm prose prose-sm dark:prose-invert max-w-none overflow-x-auto">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamingMessage}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted rounded-lg p-3">
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
                      container.scrollTo({
                        top: container.scrollHeight,
                        behavior: 'smooth'
                      });
                    }
                  };

                  // Try multiple times with increasing delays to handle keyboard animation on mobile
                  scrollToBottom(); // Immediate
                  setTimeout(scrollToBottom, 100);  // After 100ms
                  setTimeout(scrollToBottom, 300);  // After 300ms
                  setTimeout(scrollToBottom, 500);  // After 500ms (keyboard should be fully up)
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
