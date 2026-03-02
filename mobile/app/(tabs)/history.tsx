import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMealLogs, getInsulinLogs, getExerciseLogs,
  deleteMeal, deleteInsulin, deleteExercise,
} from '../../services/api';
import { useColors } from '../../constants/colors';
import { format } from 'date-fns';
import type { MealLog, InsulinLog, ExerciseLog } from '../../types/logs';
import type { GlucoseReading } from '../../types/glucose';
import { useGlucoseHistory } from '../../hooks/useGlucose';
import { DailyGlucoseBarChart } from '../../components/glucose/DailyGlucoseBarChart';
import { TIRBarChart } from '../../components/glucose/TIRBarChart';
import { DistributionChart } from '../../components/glucose/DistributionChart';
import { CVChart } from '../../components/glucose/CVChart';
import { SpikeCountChart } from '../../components/glucose/SpikeCountChart';
import { OvernightBedtimeChart } from '../../components/glucose/OvernightBedtimeChart';
import { WeeklyA1CChart } from '../../components/glucose/WeeklyA1CChart';
import { DailyCarbChart } from '../../components/logs/DailyCarbChart';
import { InsulinUsageChart } from '../../components/logs/InsulinUsageChart';
import { ExercisePatternChart } from '../../components/logs/ExercisePatternChart';
import { MealImpactChart } from '../../components/logs/MealImpactChart';
import { CarbRatioChart } from '../../components/logs/CarbRatioChart';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveTab = 'glucose' | 'meal' | 'insulin' | 'exercise';
type DateRange = 7 | 30 | 90;

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'glucose',  label: 'Glucose'  },
  { key: 'meal',     label: 'Meals'    },
  { key: 'insulin',  label: 'Insulin'  },
  { key: 'exercise', label: 'Exercise' },
];

const DATE_RANGES: { days: DateRange; label: string }[] = [
  { days: 7,  label: '7D'  },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
];

// ── Shared helpers ─────────────────────────────────────────────────────────────

function ChartCard({ children }: { children: React.ReactNode }) {
  const Colors = useColors();
  return (
    <View style={{
      backgroundColor: Colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: Colors.cardBorder,
      padding: 16,
      overflow: 'hidden',
    }}>
      {children}
    </View>
  );
}

function EmptyLogState({ emoji, label }: { emoji: string; label: string }) {
  const Colors = useColors();
  return (
    <View style={{ alignItems: 'center', marginTop: 40, gap: 10 }}>
      <Text style={{ fontSize: 36 }}>{emoji}</Text>
      <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.foreground }}>{label}</Text>
      <Text style={{ color: Colors.mutedForeground }}>Use the Log tab to add entries.</Text>
    </View>
  );
}

function DeleteButton({ onPress }: { onPress: () => void }) {
  const Colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 12, right: 4 }}
    >
      <Ionicons name="trash-outline" size={15} color={Colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function MealItem({ item, onDelete }: { item: MealLog; onDelete: () => void }) {
  const Colors = useColors();
  return (
    <View style={{
      backgroundColor: Colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: Colors.cardBorder,
      padding: 14,
      gap: 6,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: Colors.foreground }} numberOfLines={1}>
          {item.description || 'Meal'}
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary, marginLeft: 8 }}>{item.carbs}g</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>
          {format(new Date(item.timestamp), 'MMM d, h:mm a')}
        </Text>
        <DeleteButton onPress={onDelete} />
      </View>
    </View>
  );
}

function InsulinItem({ item, onDelete }: { item: InsulinLog; onDelete: () => void }) {
  const Colors = useColors();
  return (
    <View style={{
      backgroundColor: Colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: Colors.cardBorder,
      padding: 14,
      gap: 6,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: Colors.foreground, textTransform: 'capitalize' }}>
          {item.insulin_type ?? item.purpose ?? 'Insulin'}
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary, marginLeft: 8 }}>{item.units}u</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>
          {format(new Date(item.timestamp), 'MMM d, h:mm a')}
        </Text>
        <DeleteButton onPress={onDelete} />
      </View>
    </View>
  );
}

function ExerciseItem({ item, onDelete }: { item: ExerciseLog; onDelete: () => void }) {
  const Colors = useColors();
  return (
    <View style={{
      backgroundColor: Colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: Colors.cardBorder,
      padding: 14,
      gap: 6,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: Colors.foreground, textTransform: 'capitalize' }}>
          {item.activity_type} {item.intensity ? `(${item.intensity})` : ''}
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary, marginLeft: 8 }}>{item.duration_minutes}m</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>
          {format(new Date(item.timestamp), 'MMM d, h:mm a')}
        </Text>
        <DeleteButton onPress={onDelete} />
      </View>
    </View>
  );
}

// ── Glucose tab ────────────────────────────────────────────────────────────────

function GlucoseTab({ range }: { range: DateRange }) {
  const Colors = useColors();
  const history = useGlucoseHistory(range);
  const useWeekly = range === 90;

  const data   = history.data;
  const daily  = data?.daily  ?? [];
  const weekly = data?.weekly ?? [];

  const avgGlucose = daily.length ? Math.round(daily.reduce((s, d) => s + d.avg, 0) / daily.length) : null;
  const avgTIR     = daily.length ? Math.round(daily.reduce((s, d) => s + d.tir70_180, 0) / daily.length) : null;
  const avgCV      = daily.length ? Math.round((daily.reduce((s, d) => s + d.cv, 0) / daily.length) * 10) / 10 : null;
  const estA1c     = avgGlucose ? ((avgGlucose + 46.7) / 28.7).toFixed(1) : null;

  if (history.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={{ color: Colors.mutedForeground, marginTop: 12, fontSize: 14 }}>
          Loading {range}-day data…
        </Text>
      </View>
    );
  }

  if (history.isError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
        <Text style={{ color: Colors.glucoseLow, fontSize: 16 }}>Failed to load glucose data</Text>
        <TouchableOpacity onPress={() => history.refetch()} style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.primary }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={history.isFetching}
          onRefresh={() => history.refetch()}
          tintColor={Colors.primary}
        />
      }
    >
      {avgGlucose !== null && (
        <ChartCard>
          <View style={{ flexDirection: 'row' }}>
            {[
              { value: `${avgGlucose}`, label: 'Avg Glucose', color: Colors.foreground },
              { value: `${avgTIR}%`,    label: 'Time in Range', color: Colors.glucoseInRange },
              { value: `${estA1c}%`,    label: 'Est. A1C',      color: Colors.foreground },
              { value: `${avgCV}%`,     label: 'Avg CV',         color: avgCV !== null && avgCV <= 36 ? Colors.glucoseInRange : Colors.glucoseHigh },
            ].map((stat, i, arr) => (
              <View key={stat.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: stat.color }}>{stat.value}</Text>
                <Text style={{ fontSize: 10, color: Colors.mutedForeground, marginTop: 2, textAlign: 'center' }}>{stat.label}</Text>
                {i < arr.length - 1 && (
                  <View style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: 1, backgroundColor: Colors.border }} />
                )}
              </View>
            ))}
          </View>
        </ChartCard>
      )}

      {data && <ChartCard><DailyGlucoseBarChart daily={daily} weekly={weekly} useWeekly={useWeekly} /></ChartCard>}
      {data && <ChartCard><TIRBarChart daily={daily} weekly={weekly} useWeekly={useWeekly} /></ChartCard>}
      {data && daily.length > 1 && <ChartCard><CVChart daily={daily} weekly={weekly} useWeekly={useWeekly} /></ChartCard>}
      {data && daily.length > 1 && !useWeekly && <ChartCard><SpikeCountChart daily={daily} /></ChartCard>}
      {data && daily.length > 1 && !useWeekly && <ChartCard><OvernightBedtimeChart daily={daily} /></ChartCard>}
      {data && weekly.length >= 2 && <ChartCard><WeeklyA1CChart weekly={weekly} /></ChartCard>}
      {data && <ChartCard><DistributionChart distribution={data.distribution} /></ChartCard>}

      {data && (
        <Text style={{ fontSize: 11, color: Colors.mutedForeground, textAlign: 'center' }}>
          {data.totalReadings.toLocaleString()} readings over {range} days
        </Text>
      )}
    </ScrollView>
  );
}

// ── Meals tab ──────────────────────────────────────────────────────────────────

function MealsTab({ range }: { range: DateRange }) {
  const Colors = useColors();
  const queryClient = useQueryClient();
  const logsStart = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();

  const meals          = useQuery({ queryKey: ['logs', 'meal', range],    queryFn: () => getMealLogs(logsStart, undefined, 500) });
  const glucoseHistory = useGlucoseHistory(range);
  const mealItems: MealLog[]       = (meals.data as any)?.meals ?? [];
  const rawReadings: GlucoseReading[] = glucoseHistory.data?.readings ?? [];

  const deleteMealMutation = useMutation({
    mutationFn: deleteMeal,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logs', 'meal'] }),
  });

  const confirmDelete = useCallback((onConfirm: () => void) => {
    Alert.alert('Delete entry', 'Delete this meal entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }, []);

  if (meals.isLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={Colors.primary} /></View>;
  }

  return (
    <FlatList
      data={mealItems}
      keyExtractor={item => item.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      ListHeaderComponent={
        <View style={{ gap: 0 }}>
          <DailyCarbChart meals={mealItems} />
          <MealImpactChart meals={mealItems} glucoseReadings={rawReadings} />
        </View>
      }
      refreshControl={
        <RefreshControl refreshing={meals.isFetching} onRefresh={() => meals.refetch()} tintColor={Colors.primary} />
      }
      ListEmptyComponent={<EmptyLogState emoji="🍽️" label="No meal logs yet" />}
      renderItem={({ item }) => (
        <MealItem
          item={item as MealLog}
          onDelete={() => confirmDelete(() => deleteMealMutation.mutate((item as MealLog).id))}
        />
      )}
    />
  );
}

// ── Insulin tab ────────────────────────────────────────────────────────────────

function InsulinTab({ range }: { range: DateRange }) {
  const Colors = useColors();
  const queryClient = useQueryClient();
  const logsStart = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();

  const insulin = useQuery({ queryKey: ['logs', 'insulin', range], queryFn: () => getInsulinLogs(logsStart, undefined, 500) });
  const meals   = useQuery({ queryKey: ['logs', 'meal',    range], queryFn: () => getMealLogs(logsStart, undefined, 500) });
  const insulinItems: InsulinLog[] = (insulin.data as any)?.doses  ?? [];
  const mealItems: MealLog[]       = (meals.data as any)?.meals    ?? [];

  const deleteInsulinMutation = useMutation({
    mutationFn: deleteInsulin,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logs', 'insulin'] }),
  });

  const confirmDelete = useCallback((onConfirm: () => void) => {
    Alert.alert('Delete entry', 'Delete this insulin entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }, []);

  if (insulin.isLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={Colors.primary} /></View>;
  }

  return (
    <FlatList
      data={insulinItems}
      keyExtractor={item => item.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      ListHeaderComponent={
        <View style={{ gap: 0 }}>
          <InsulinUsageChart doses={insulinItems} />
          <CarbRatioChart meals={mealItems} insulin={insulinItems} />
        </View>
      }
      refreshControl={
        <RefreshControl refreshing={insulin.isFetching} onRefresh={() => insulin.refetch()} tintColor={Colors.primary} />
      }
      ListEmptyComponent={<EmptyLogState emoji="💉" label="No insulin logs yet" />}
      renderItem={({ item }) => (
        <InsulinItem
          item={item as InsulinLog}
          onDelete={() => confirmDelete(() => deleteInsulinMutation.mutate((item as InsulinLog).id))}
        />
      )}
    />
  );
}

// ── Exercise tab ───────────────────────────────────────────────────────────────

function ExerciseTab({ range }: { range: DateRange }) {
  const Colors = useColors();
  const queryClient = useQueryClient();
  const logsStart = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();

  const exercise = useQuery({ queryKey: ['logs', 'exercise', range], queryFn: () => getExerciseLogs(logsStart, undefined, 500) });
  const exerciseItems: ExerciseLog[] = (exercise.data as any)?.exercises ?? [];

  const deleteExerciseMutation = useMutation({
    mutationFn: deleteExercise,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logs', 'exercise'] }),
  });

  const confirmDelete = useCallback((onConfirm: () => void) => {
    Alert.alert('Delete entry', 'Delete this exercise entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }, []);

  if (exercise.isLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={Colors.primary} /></View>;
  }

  return (
    <FlatList
      data={exerciseItems}
      keyExtractor={item => item.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      ListHeaderComponent={<ExercisePatternChart exercises={exerciseItems} />}
      refreshControl={
        <RefreshControl refreshing={exercise.isFetching} onRefresh={() => exercise.refetch()} tintColor={Colors.primary} />
      }
      ListEmptyComponent={<EmptyLogState emoji="🏃" label="No exercise logs yet" />}
      renderItem={({ item }) => (
        <ExerciseItem
          item={item as ExerciseLog}
          onDelete={() => confirmDelete(() => deleteExerciseMutation.mutate((item as ExerciseLog).id))}
        />
      )}
    />
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const Colors = useColors();
  const [activeTab, setActiveTab] = useState<ActiveTab>('glucose');
  const [range, setRange] = useState<DateRange>(7);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: Colors.foreground, marginBottom: 12 }}>
          History
        </Text>

        {/* Shared date range selector */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {DATE_RANGES.map(r => (
            <TouchableOpacity
              key={r.days}
              onPress={() => setRange(r.days)}
              style={{
                flex: 1,
                paddingVertical: 7,
                borderRadius: 10,
                backgroundColor: range === r.days ? Colors.primary : Colors.muted,
                alignItems: 'center',
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: '600',
                color: range === r.days ? '#FFFFFF' : Colors.mutedForeground,
              }}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 4-tab selector */}
        <View style={{ flexDirection: 'row', backgroundColor: Colors.muted, borderRadius: 12, padding: 4 }}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: activeTab === tab.key ? Colors.card : 'transparent',
                alignItems: 'center',
              }}
            >
              <Text style={{
                fontSize: 12,
                fontWeight: '600',
                color: activeTab === tab.key ? Colors.foreground : Colors.mutedForeground,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === 'glucose'  && <GlucoseTab  range={range} />}
      {activeTab === 'meal'     && <MealsTab    range={range} />}
      {activeTab === 'insulin'  && <InsulinTab  range={range} />}
      {activeTab === 'exercise' && <ExerciseTab range={range} />}
    </SafeAreaView>
  );
}
