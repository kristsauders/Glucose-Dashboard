import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { useAuthProvider, AuthContext } from '../hooks/useAuth';
import { registerForPushNotifications, registerNotificationCategories } from '../services/notifications';
import { confirmMeal, dismissMeal, logInsulinForMeal } from '../services/api';
import LoadingScreen from '../components/LoadingScreen';
import { useHealthKit } from '../hooks/useHealthKit';
import { runHealthKitSync } from '../services/health-sync';

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
  const hk = useHealthKit();

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

  // Push notification registration + category setup: runs once when auth is ready.
  useEffect(() => {
    if (auth.isReady && auth.isAuthenticated) {
      registerNotificationCategories().catch(console.warn);
      registerForPushNotifications().catch(console.warn);
    }
  }, [auth.isReady, auth.isAuthenticated]);

  // HealthKit sync: runs once on auth ready, then is rate-limited to every 15 min
  // (enforced inside runHealthKitSync). Runs in background — never blocks UI.
  useEffect(() => {
    if (auth.isReady && auth.isAuthenticated) {
      runHealthKitSync(hk).catch(console.warn);
    }
  }, [auth.isReady, auth.isAuthenticated]);

  // Notification response handler — handles button actions and taps for all notification types.
  useEffect(() => {
    if (!auth.isReady || !auth.isAuthenticated) return;

    async function handleResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data as Record<string, any>;
      const actionId = response.actionIdentifier;

      // ── Meal detection actions ──────────────────────────────────────────────
      if (data?.type === 'meal_detected' && data?.mealId) {
        const mealId = data.mealId as string;

        if (actionId === 'CONFIRM' || actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          // Background confirm (or plain tap with no action buttons)
          if (actionId === 'CONFIRM') {
            confirmMeal(mealId).catch(console.warn);
            return;
          }
          // Plain tap → open edit screen
          router.push(`/meal-confirm/${mealId}`);
          return;
        }

        if (actionId === 'EDIT') {
          router.push(`/meal-confirm/${mealId}`);
          return;
        }

        if (actionId === 'NOT_A_MEAL') {
          dismissMeal(mealId).catch(console.warn);
          return;
        }
      }

      // ── Insulin follow-up actions ───────────────────────────────────────────
      if (data?.type === 'insulin_followup') {
        if (actionId === 'LOG_UNITS') {
          const unitsStr = (response as any).userText as string | undefined;
          const units = parseFloat(unitsStr ?? '');
          if (!isNaN(units) && units > 0 && data?.mealId) {
            logInsulinForMeal(data.mealId as string, units).catch(console.warn);
          }
          return;
        }
        // ALREADY_LOGGED and SKIP: no action needed
        if (actionId === 'ALREADY_LOGGED' || actionId === 'SKIP') return;

        // Plain tap → open meal confirm screen so user can add insulin there
        if (data?.mealId) {
          router.push(`/meal-confirm/${data.mealId}`);
        }
        return;
      }

      // ── Proactive chat notification (existing behaviour) ───────────────────
      const conversationId = data?.conversationId;
      if (conversationId) {
        router.navigate('/(tabs)/chat');
        router.push(`/(tabs)/chat/${conversationId}`);
      }
    }

    // Cold start: app was opened by tapping a notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });

    // Foreground / background tap or action button press
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [auth.isReady, auth.isAuthenticated]);

  if (!auth.isReady) return <LoadingScreen />;

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    TiemposText: require('../assets/fonts/TestTiemposText-Regular.otf'),
  });

  if (!fontsLoaded) return <LoadingScreen />;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthGuard>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="meal-confirm/[mealId]" options={{ presentation: 'modal', headerShown: false }} />
          </Stack>
        </AuthGuard>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
