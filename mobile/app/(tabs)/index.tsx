import { ScrollView, View, Text, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { GlucoseCard } from '../../components/glucose/GlucoseCard';
import { GlucoseChart } from '../../components/glucose/GlucoseChart';
import { StatsRow } from '../../components/glucose/StatsRow';
import { useLatestGlucose, useGlucoseReadings, useGlucoseSummary } from '../../hooks/useGlucose';
import { useMealLogs, useInsulinLogs, useExerciseLogs } from '../../hooks/useLogs';
import { useGlucoseWidgets } from '../../hooks/useGlucoseWidgets';
import type { ChartEvent } from '../../components/glucose/GlucoseChart';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../hooks/useAuth';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const latest = useLatestGlucose();
  const readings = useGlucoseReadings(288);
  const { syncReading } = useGlucoseWidgets();

  // Sync the latest reading to the lock-screen widget and Live Activity whenever it changes
  const lastSyncedId = useRef<string | null>(null);
  useEffect(() => {
    const reading = (latest.data as any)?.reading;
    if (reading && reading.id !== lastSyncedId.current) {
      lastSyncedId.current = reading.id;
      syncReading(reading);
    }
  }, [(latest.data as any)?.reading]);
  const summary = useGlucoseSummary('7d');

  // Fetch last 24h of logs for the chart event overlay
  const meals = useMealLogs(1);
  const insulin = useInsulinLogs(1);
  const exercise = useExerciseLogs(1);

  const isRefreshing = latest.isFetching || readings.isFetching;

  const onRefresh = () => {
    latest.refetch();
    readings.refetch();
    summary.refetch();
    meals.refetch();
    insulin.refetch();
    exercise.refetch();
  };

  const chartEvents: ChartEvent[] = [
    ...((meals.data as any)?.meals ?? []).map((m: any) => ({
      type: 'meal' as const,
      timestamp: m.timestamp,
    })),
    ...((insulin.data as any)?.doses ?? []).map((d: any) => ({
      type: 'insulin' as const,
      timestamp: d.timestamp,
    })),
    ...((exercise.data as any)?.exercises ?? []).map((e: any) => ({
      type: 'exercise' as const,
      timestamp: e.timestamp,
    })),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: Colors.foreground }}>
              Dashboard
            </Text>
            {user?.email ? (
              <Text style={{ fontSize: 13, color: Colors.mutedForeground, marginTop: 2 }}>
                {user.email}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/chat')}
            style={{
              backgroundColor: Colors.primary,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Ask Sage</Text>
          </TouchableOpacity>
        </View>

        {/* Current glucose */}
        <GlucoseCard reading={(latest.data as any)?.reading} loading={latest.isLoading} />

        {/* Stats row */}
        <StatsRow summary={summary.data as any} />

        {/* 24h chart */}
        <View
          style={{
            backgroundColor: Colors.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.cardBorder,
            padding: 16,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.foreground, marginBottom: 12 }}>
            Last 24 hours
          </Text>
          <GlucoseChart
            readings={(readings.data as any)?.readings ?? []}
            events={chartEvents}
          />
        </View>

        {/* Quick log shortcuts */}
        <View
          style={{
            backgroundColor: Colors.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: Colors.cardBorder,
            padding: 16,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.foreground, marginBottom: 12 }}>
            Quick log
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              { label: 'Meal', emoji: '🍽️' },
              { label: 'Insulin', emoji: '💉' },
              { label: 'Exercise', emoji: '🏃' },
            ].map(({ label, emoji }) => (
              <TouchableOpacity
                key={label}
                onPress={() => router.push('/(tabs)/log')}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 14,
                  backgroundColor: Colors.muted,
                  borderRadius: 12,
                  gap: 4,
                }}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.foreground }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
