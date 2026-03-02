import { ScrollView, View, Text, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useMemo } from 'react';
import { GlucoseCard } from '../../components/glucose/GlucoseCard';
import { GlucoseChart } from '../../components/glucose/GlucoseChart';
import { StatsRow } from '../../components/glucose/StatsRow';
import { useLatestGlucose, useGlucose24h } from '../../hooks/useGlucose';
import { useMealLogs, useInsulinLogs, useExerciseLogs } from '../../hooks/useLogs';
import { useGlucoseWidgets } from '../../hooks/useGlucoseWidgets';
import type { ChartEvent } from '../../components/glucose/GlucoseChart';
import type { GlucoseReading, GlucoseSummary } from '../../types/glucose';
import { useColors } from '../../constants/colors';

export default function DashboardScreen() {
  const Colors = useColors();
  const latest = useLatestGlucose();
  const readings = useGlucose24h();
  const { syncReading } = useGlucoseWidgets();

  // Sync the latest reading to the lock-screen widget and Live Activity whenever it changes
  const lastSyncedId = useRef<string | null>(null);
  useEffect(() => {
    const reading = (latest.data as any)?.reading;
    const allReadings = (readings.data as any)?.readings as GlucoseReading[] | undefined;
    if (reading && reading.id !== lastSyncedId.current) {
      lastSyncedId.current = reading.id;
      syncReading(reading, allReadings);
    }
  }, [(latest.data as any)?.reading]);
  // Compute today's summary from the already-fetched 24h readings (type-1 only, same window as chart)
  const todaySummary = useMemo<GlucoseSummary | undefined>(() => {
    const rds = (readings.data as any)?.readings as GlucoseReading[] | undefined;
    if (!rds || rds.length === 0) return undefined;
    const vals = rds.map(r => Number(r.glucose));
    const n = vals.length;
    const avg = vals.reduce((s, v) => s + v, 0) / n;
    const variance = vals.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    return {
      period: 'today',
      totalReadings: n,
      avgGlucose: avg.toFixed(1),
      minGlucose: Math.min(...vals).toFixed(1),
      maxGlucose: Math.max(...vals).toFixed(1),
      stdDev: std.toFixed(1),
      cv: avg > 0 ? ((std / avg) * 100).toFixed(1) : '0',
      estimatedA1c: ((avg + 46.7) / 28.7).toFixed(1),
      timeInRange: {
        '70-180': (vals.filter(v => v >= 70 && v <= 180).length / n * 100).toFixed(1),
        '70-140': (vals.filter(v => v >= 70 && v <= 140).length / n * 100).toFixed(1),
        below70:  (vals.filter(v => v < 70).length / n * 100).toFixed(1),
        above180: (vals.filter(v => v > 180).length / n * 100).toFixed(1),
      },
    };
  }, [(readings.data as any)?.readings]);

  // Fetch last 24h of logs for the chart event overlay
  const meals = useMealLogs(1);
  const insulin = useInsulinLogs(1);
  const exercise = useExerciseLogs(1);

  const isRefreshing = latest.isFetching || readings.isFetching;

  const onRefresh = () => {
    latest.refetch();
    readings.refetch();
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
        <View style={{ marginBottom: 4 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: Colors.foreground }}>
            Sage
          </Text>
        </View>

        {/* Current glucose */}
        <GlucoseCard reading={(latest.data as any)?.reading} loading={latest.isLoading} />

        {/* Stats row — today from 7am, same window as the chart */}
        <StatsRow summary={todaySummary} />

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
            Today from 7am
          </Text>
          <GlucoseChart
            readings={(readings.data as any)?.readings ?? []}
            events={chartEvents}
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
