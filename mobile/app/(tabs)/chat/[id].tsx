import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getConversation } from '../../../services/api';
import { useChat } from '../../../hooks/useChat';
import { MessageBubble } from '../../../components/chat/MessageBubble';
import { StreamingMessage } from '../../../components/chat/StreamingMessage';
import { ChatInput } from '../../../components/chat/ChatInput';
import { useColors } from '../../../constants/colors';
import type { Message } from '../../../types/chat';

export default function ChatDetailScreen() {
  const Colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const listRef = useRef<FlatList<Message>>(null);
  const [inputText, setInputText] = useState('');

  const isNew = id === 'new';

  // Load existing messages if opening a saved conversation
  const { data, isLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => getConversation(id),
    enabled: !isNew,
  });

  const existingMessages: Message[] = (data as any)?.messages ?? [];
  const conversationTitle: string = (data as any)?.title ?? 'Chat';

  useEffect(() => {
    if (!isNew) navigation.setOptions({ title: conversationTitle });
    else navigation.setOptions({ title: 'New conversation' });
  }, [conversationTitle, isNew]);

  const chat = useChat(isNew ? null : id);

  // Hydrate messages once when the conversation query resolves
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current && existingMessages.length > 0) {
      hydratedRef.current = true;
      chat.resetMessages(existingMessages);
    }
  }, [existingMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (chat.messages.length > 0 || chat.streaming) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chat.messages.length, chat.streaming, chat.streamingText]);

  // Update nav title when conversation ID is assigned
  useEffect(() => {
    if (chat.conversationId && isNew) {
      navigation.setOptions({ title: 'Chat' });
    }
  }, [chat.conversationId, isNew]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    chat.sendMessage(text);
  }, [inputText, chat.sendMessage]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={chat.messages}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            !chat.streaming ? (
              <View style={{ alignItems: 'center', marginTop: 80, gap: 10 }}>
                <Text style={{ fontSize: 36 }}>🧠</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.foreground }}>
                  Ask Sage anything
                </Text>
                <Text
                  style={{ fontSize: 14, color: Colors.mutedForeground, textAlign: 'center', paddingHorizontal: 24 }}
                >
                  Ask about your glucose patterns, recent trends, meals, or insulin sensitivity.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListFooterComponent={
            chat.streaming ? (
              <StreamingMessage text={chat.streamingText} statusText={chat.statusText} />
            ) : null
          }
        />

        {chat.error ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <Text style={{ color: Colors.destructive, fontSize: 13 }}>{chat.error}</Text>
          </View>
        ) : null}

        <ChatInput
          value={inputText}
          onChangeText={setInputText}
          onSend={handleSend}
          onAbort={chat.abort}
          streaming={chat.streaming}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
