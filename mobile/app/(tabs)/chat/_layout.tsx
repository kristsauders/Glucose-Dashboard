import { Stack } from 'expo-router';
import { useColors } from '../../../constants/colors';

export default function ChatLayout() {
  const Colors = useColors();
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
