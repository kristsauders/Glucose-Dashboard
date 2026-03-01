import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { useAuthProvider, AuthContext } from '../hooks/useAuth';
import { registerForPushNotifications } from '../services/notifications';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const auth = useAuthProvider();
  const router = useRouter();
  const segments = useSegments();

  // Auth guard: redirect to correct screen when auth state changes
  useEffect(() => {
    if (!auth.isReady) return;

    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';

    if (!auth.isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (auth.isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [auth.isReady, auth.isAuthenticated, segments]);

  // Push notification registration: runs once when auth is ready, whether the user
  // just logged in or was already authenticated from a previous session.
  useEffect(() => {
    if (auth.isReady && auth.isAuthenticated) {
      registerForPushNotifications().catch(console.warn);
    }
  }, [auth.isReady, auth.isAuthenticated]);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    TiemposText: require('../assets/fonts/TestTiemposText-Regular.otf'),
  });

  // Keep splash visible until both auth and fonts are ready (AuthGuard handles hiding)
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthGuard>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AuthGuard>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
