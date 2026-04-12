import { ScrollView, View, Text, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useMemo } from 'react';
import { GlucoseCard } from '../../components/glucose/GlucoseCard';
import { GlucoseChart } from '../../components/glucose/GlucoseChart';
import { StatsRow } from '../../components/glucose/StatsRow';
import { MealImpactChart } from '../../components/logs/MealImpactChart';
import { WorkoutImpactChart } from '../../components/logs/WorkoutImpactChart';
import type { MealLog, ExerciseLog } from '../../types/logs';
import { useLatestGlucose, useGlucose24h } from '../../hooks/useGlucose';
import { useMealLogs, useInsulinLogs, useExerciseLogs } from '../../hooks/useLogs';
import { useGlucoseWidgets } from '../../hooks/useGlucoseWidgets';
import type { ChartEvent } from '../../components/glucose/GlucoseChart';
import type { GlucoseReading, GlucoseSummary } from '../../types/glucose';
import { useColors } from '../../constants/colors';
import { useHealthKit } from '../../hooks/useHealthKit';
import { runHealthKitSync } from '../../services/health-sync';

export default function DashboardScreen() {
  const Colors = useColors();
  const hk = useHealthKit();
  const latest = useLatestGlucose();
  const readings = useGlucose24h();
  const { syncReading } = useGlucoseWidgets();

  // Fetch last 24h of logs — declared here so insulin is available to the syncReading effect below.
  const meals = useMealLogs(1);
  const insulin = useInsulinLogs(1);
  const exercise = useExerciseLogs(1);

  // Sync the latest reading to the lock-screen widget and Live Activity whenever it changes.
  // We track two conditions to avoid redundant syncs but still re-sync when 24h history
  // arrives after the initial reading (history loads slower than the latest-reading query).
  const lastSyncedId = useRef<string | null>(null);
  const lastSyncedWithHistory = useRef(false);
  useEffect(() => {
    const reading = (latest.data as any)?.reading;
    const allReadings = (readings.data as any)?.readings as GlucoseReading[] | undefined;
    const hasHistory = !!allReadings && allReadings.length > 0;
    if (!reading) return;
    const isNewReading = reading.id !== lastSyncedId.current;
    const historyJustArrived = hasHistory && !lastSyncedWithHistory.current;
    if (!isNewReading && !historyJustArrived) return;
    lastSyncedId.current = reading.id;
    lastSyncedWithHistory.current = hasHistory;
    const doses = (insulin.data as any)?.doses;
    const lastDose = doses?.[0];
    const lastInsulinUnits = lastDose ? Number(lastDose.units) : null;
    const lastInsulinDate  = lastDose?.timestamp ? new Date(lastDose.timestamp) : null;
    syncReading(reading, allReadings, lastInsulinUnits, lastInsulinDate);
  }, [(latest.data as any)?.reading, (readings.data as any)?.readings, (insulin.data as any)?.doses]);
  // Compute today's summary using only scheduled CGM readings (record_type 1 or null),
  // matching the server's /glucose/summary filter. Scan readings (type 0) are excluded
  // so they don't skew counts or averages, but they still appear on the chart above.
  const todaySummary = useMemo<GlucoseSummary | undefined>(() => {
    const rds = (readings.data as any)?.readings as GlucoseReading[] | undefined;
    if (!rds || rds.length === 0) return undefined;
    const statsReadings = rds.filter(r => r.record_type == null || Number(r.record_type) !== 0);
    if (statsReadings.length === 0) return undefined;
    const vals = statsReadings.map(r => Number(r.glucose));
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

  const isRefreshing = latest.isFetching || readings.isFetching;

  const onRefresh = () => {
    latest.refetch();
    readings.refetch();
    meals.refetch();
    insulin.refetch();
    exercise.refetch();
    // Force HealthKit sync on pull-to-refresh (bypasses the 15-min rate limit).
    // If it inserts new glucose data, refetch again so the chart shows it.
    runHealthKitSync(hk, true)
      .then(r => {
        console.log('[HealthSync pull-to-refresh]', JSON.stringify(r));
        if (r.glucoseInserted > 0) {
          latest.refetch();
          readings.refetch();
        }
      })
      .catch(console.warn);
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

        {/* Today's meal impact */}
        <MealImpactChart
          meals={(meals.data as any)?.meals as MealLog[] ?? []}
          glucoseReadings={(readings.data as any)?.readings as GlucoseReading[] ?? []}
        />

        {/* Today's workout impact */}
        <WorkoutImpactChart
          exercises={(exercise.data as any)?.exercises as ExerciseLog[] ?? []}
          glucoseReadings={(readings.data as any)?.readings as GlucoseReading[] ?? []}
        />

      </ScrollView>
    </SafeAreaView>
  );
}
