import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  Platform,
  ActivityIndicator,
  Text,
  Keyboard,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getConversation } from '../../../services/api';
import { useChat } from '../../../hooks/useChat';
import { MessageBubble } from '../../../components/chat/MessageBubble';
import { StreamingMessage } from '../../../components/chat/StreamingMessage';
import { ChatInput } from '../../../components/chat/ChatInput';
import { useColors } from '../../../constants/colors';
import type { Message } from '../../../types/chat';

// Must match the tab bar height in (tabs)/_layout.tsx
const TAB_BAR_HEIGHT = 84;

export default function ChatDetailScreen() {
  const Colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const listRef = useRef<FlatList<Message>>(null);
  const [inputText, setInputText] = useState('');
  const keyboardPad = useRef(new Animated.Value(0)).current;

  const isNew = id === 'new';

  // Keyboard avoidance
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', e => {
      Animated.timing(keyboardPad, {
        toValue: Math.max(0, e.endCoordinates.height - TAB_BAR_HEIGHT),
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });
    const hide = Keyboard.addListener('keyboardWillHide', e => {
      Animated.timing(keyboardPad, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

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

  // Always inject a back button. When deep-linked from a notification the Stack
  // has no history (no canGoBack), so fall back to the conversations list.
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              router.navigate('/(tabs)/chat');
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ paddingRight: 8, flexDirection: 'row', alignItems: 'center' }}
        >
          <Ionicons name="chevron-back" size={28} color={Colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [Colors.primary]);

  const chat = useChat(isNew ? null : id);

  // Hydrate messages once when the conversation query resolves.
  // Set shouldScrollToBottomRef so the first onContentSizeChange scrolls to end.
  const hydratedRef = useRef(false);
  const shouldScrollToBottomRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current && existingMessages.length > 0) {
      hydratedRef.current = true;
      shouldScrollToBottomRef.current = true;
      chat.resetMessages(existingMessages);
    }
  }, [existingMessages]);

  // Scroll to bottom only when a committed message lands (not while streaming).
  // handleSend positions the user message at the top when streaming begins.
  useEffect(() => {
    if (chat.messages.length > 0 && !chat.streaming) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chat.messages.length, chat.streaming]);

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

    // Index of the user message we're about to add (it lands at the end)
    const targetIndex = chat.messages.length;

    Keyboard.dismiss();
    chat.sendMessage(text);

    // After keyboard animation finishes, scroll so the user message is near the
    // top of the visible area and the streaming response has room to grow below it.
    setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({
          index: targetIndex,
          viewPosition: 0,
          animated: true,
        });
      } catch {
        listRef.current?.scrollToEnd({ animated: true });
      }
    }, 320);
  }, [inputText, chat.sendMessage, chat.messages.length]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <Animated.View style={{ flex: 1, paddingBottom: keyboardPad, backgroundColor: Colors.background }}>
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={chat.messages}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: chat.streaming ? Dimensions.get('window').height : 8 }}
        onContentSizeChange={() => {
          // Only fires for the initial hydration — once done, this is a no-op.
          if (shouldScrollToBottomRef.current) {
            shouldScrollToBottomRef.current = false;
            listRef.current?.scrollToEnd({ animated: false });
          }
        }}
        ListEmptyComponent={
          !chat.streaming ? (
            <View style={{ alignItems: 'center', marginTop: 80, gap: 10 }}>
              <Text style={{ fontSize: 36 }}>🧠</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.foreground }}>
                Ask Sage anything
              </Text>
              <Text
                style={{ fontSize: 13, color: Colors.mutedForeground, textAlign: 'center', paddingHorizontal: 24 }}
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
    </Animated.View>
  );
}
