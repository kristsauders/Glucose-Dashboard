import { Stack } from 'expo-router';
import { Colors } from '../../../constants/colors';

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.card },
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontWeight: '600', color: Colors.foreground },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Conversations' }} />
      <Stack.Screen name="[id]" options={{ title: 'Chat' }} />
    </Stack>
  );
}
