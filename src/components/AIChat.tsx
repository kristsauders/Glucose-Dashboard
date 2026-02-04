import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Bot, Send, Trash2, Loader2, User, MessageSquare, Menu, Plus, X, Edit2, Check } from 'lucide-react';
import { apiService } from '@/services/api';
import { format } from 'date-fns';
import type { Conversation, Message } from '@/types/chat';

export function AIChat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingConversations, setIsFetchingConversations] = useState(true);
  const [error, setError] = useState('');
  const [streamingMessage, setStreamingMessage] = useState('');
  const [status, setStatus] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-hide sidebar on mobile
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setShowSidebar(!isMobile);
  }, []);

  // Fetch conversations on mount
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const convos = await apiService.getConversations();
        setConversations(convos);

        // Auto-select most recent conversation if any exist
        if (convos.length > 0 && !activeConversationId) {
          await loadConversation(convos[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch conversations:', err);
      } finally {
        setIsFetchingConversations(false);
      }
    };

    fetchConversations();
  }, []);

  // Scroll to bottom when messages change and auto-focus input
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    // Auto-focus input after messages load (especially useful on mobile)
    if (messages.length > 0 || activeConversationId) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [messages, activeConversationId]);

  // Handle deep-link from push notification (URL parameter)
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId && conversations.length > 0) {
      // Find and load the conversation
      const conversation = conversations.find(c => c.id === conversationId);
      if (conversation) {
        loadConversation(conversationId);
        // Clear URL parameter after loading
        setSearchParams({});
        console.log('[AIChat] Loaded conversation from deep-link:', conversationId);
      }
    }
  }, [searchParams, conversations]);

  // Listen for messages from service worker
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'OPEN_CONVERSATION') {
        const conversationId = event.data.conversationId;
        if (conversationId && conversations.find(c => c.id === conversationId)) {
          loadConversation(conversationId);
          console.log('[AIChat] Loaded conversation from service worker message:', conversationId);
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
  }, [conversations]);

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

      // Focus input after sidebar closes (especially helpful on mobile to bring up keyboard)
      setTimeout(() => {
        inputRef.current?.focus();
      }, isMobile ? 250 : 100);
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

      // Focus input after sidebar closes
      setTimeout(() => {
        inputRef.current?.focus();
      }, 250);
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

    try {
      const token = localStorage.getItem('t1d_auth_token');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
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
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
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
        },
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingMessage('');
      setStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove optimistic user message on error
      setMessages((prev) => prev.slice(0, -1));
      setStreamingMessage('');
      setStatus('');
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
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

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="h-full flex gap-0">
      {/* Sidebar */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-r bg-card overflow-hidden"
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
        <div className="flex-1 overflow-y-auto px-2 py-4 md:p-4 space-y-4" style={{ overflowY: 'auto' }}>
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
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`${
                      message.role === 'user' ? 'flex-1 max-w-[80%] text-right' : 'w-full text-left'
                    }`}
                  >
                    <div
                      className={`inline-block rounded-lg p-3 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      {message.role === 'user' ? (
                        <p className="text-xs md:text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      ) : (
                        <div className="text-xs md:text-sm prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                          >
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
                          <span className="text-primary">
                            • {message.metadata.toolCalls} tool{message.metadata.toolCalls !== 1 ? 's' : ''} used
                          </span>
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
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <div className="w-full">
                {status && (
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {status}
                  </div>
                )}
                {streamingMessage ? (
                  <div className="bg-muted rounded-lg p-3">
                    <div className="text-xs md:text-sm prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                      >
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
            </motion.div>
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
