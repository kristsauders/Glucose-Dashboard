import { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConversations, deleteConversation } from '../../../services/api';
import { Colors } from '../../../constants/colors';
import { formatDistanceToNow } from 'date-fns';
import type { Conversation } from '../../../types/chat';

export default function ConversationListScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => getConversations(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  const handleDelete = useCallback(
    (conv: Conversation) => {
      Alert.alert('Delete conversation', `Delete "${conv.title ?? 'Untitled'}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(conv.id),
        },
      ]);
    },
    [deleteMutation],
  );

  const handleNew = () => {
    router.push('/(tabs)/chat/new');
  };

  const conversations: Conversation[] = (data as any)?.conversations ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['bottom']}>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 12 }}>
              <Text style={{ fontSize: 40 }}>💬</Text>
              <Text style={{ fontSize: 18, fontWeight: '600', color: Colors.foreground }}>
                No conversations yet
              </Text>
              <Text style={{ color: Colors.mutedForeground, textAlign: 'center' }}>
                Start a new conversation to ask Sage about your glucose trends.
              </Text>
            </View>
          }
          ListHeaderComponent={
            <TouchableOpacity
              onPress={handleNew}
              style={{
                backgroundColor: Colors.primary,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                + New conversation
              </Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/(tabs)/chat/${item.id}`)}
              onLongPress={() => handleDelete(item)}
              style={{
                backgroundColor: Colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.cardBorder,
                padding: 14,
                gap: 4,
              }}
            >
              <Text
                style={{ fontSize: 15, fontWeight: '600', color: Colors.foreground }}
                numberOfLines={1}
              >
                {item.title ?? 'Untitled conversation'}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>
                  {item.message_count ?? 0} messages
                </Text>
                <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>
                  {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}
