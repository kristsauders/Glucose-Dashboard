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

type MainView  = 'glucose' | 'logs';
type LogTab    = 'meal' | 'insulin' | 'exercise';
type DateRange = 7 | 30 | 90;

const LOG_TABS: { key: LogTab; label: string; emoji: string }[] = [
  { key: 'meal',     label: 'Meals',    emoji: '🍽️' },
  { key: 'insulin',  label: 'Insulin',  emoji: '💉' },
  { key: 'exercise', label: 'Exercise', emoji: '🏃' },
];

const DATE_RANGES: { days: DateRange; label: string }[] = [
  { days: 7,  label: '7D'  },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
];

// ── Reusable card wrapper ─────────────────────────────────────────────────────

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

// ── Segmented control ─────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const Colors = useColors();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: Colors.muted, borderRadius: 12, padding: 4 }}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: 10,
            backgroundColor: value === opt.value ? Colors.card : 'transparent',
            alignItems: 'center',
          }}
        >
          <Text style={{
            fontSize: 13,
            fontWeight: '600',
            color: value === opt.value ? Colors.foreground : Colors.mutedForeground,
          }}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Log item renderers ────────────────────────────────────────────────────────

function LogItemCard({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const Colors = useColors();
  return (
    <TouchableOpacity
      onLongPress={onDelete}
      style={{
        backgroundColor: Colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.cardBorder,
        padding: 14,
        gap: 4,
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

function MealItem({ item, onDelete }: { item: MealLog; onDelete: () => void }) {
  const Colors = useColors();
  return (
    <LogItemCard onDelete={onDelete}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.foreground }} numberOfLines={1}>
          {item.description || 'Meal'}
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>{item.carbs}g</Text>
      </View>
      <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>
        {format(new Date(item.timestamp), 'MMM d, h:mm a')}
      </Text>
    </LogItemCard>
  );
}

function InsulinItem({ item, onDelete }: { item: InsulinLog; onDelete: () => void }) {
  const Colors = useColors();
  return (
    <LogItemCard onDelete={onDelete}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.foreground, textTransform: 'capitalize' }}>
          {item.insulin_type ?? item.purpose ?? 'Insulin'}
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>{item.units}u</Text>
      </View>
      <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>
        {format(new Date(item.timestamp), 'MMM d, h:mm a')}
      </Text>
    </LogItemCard>
  );
}

function ExerciseItem({ item, onDelete }: { item: ExerciseLog; onDelete: () => void }) {
  const Colors = useColors();
  return (
    <LogItemCard onDelete={onDelete}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.foreground, textTransform: 'capitalize' }}>
          {item.activity_type} {item.intensity ? `(${item.intensity})` : ''}
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>{item.duration_minutes}m</Text>
      </View>
      <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>
        {format(new Date(item.timestamp), 'MMM d, h:mm a')}
      </Text>
    </LogItemCard>
  );
}

// ── Glucose Analytics view ────────────────────────────────────────────────────

function GlucoseAnalyticsView() {
  const Colors = useColors();
  const [range, setRange] = useState<DateRange>(7);
  const history = useGlucoseHistory(range);
  const useWeekly = range === 90;

  const data = history.data;
  const daily = data?.daily ?? [];
  const weekly = data?.weekly ?? [];

  // Summary stats (average across all days)
  const avgGlucose = daily.length
    ? Math.round(daily.reduce((s, d) => s + d.avg, 0) / daily.length)
    : null;
  const avgTIR = daily.length
    ? Math.round(daily.reduce((s, d) => s + d.tir70_180, 0) / daily.length)
    : null;
  const avgCV = daily.length
    ? Math.round((daily.reduce((s, d) => s + d.cv, 0) / daily.length) * 10) / 10
    : null;
  const estA1c = avgGlucose ? ((avgGlucose + 46.7) / 28.7).toFixed(1) : null;

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
      {/* Date range selector */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {DATE_RANGES.map(r => (
          <TouchableOpacity
            key={r.days}
            onPress={() => setRange(r.days)}
            style={{
              flex: 1,
              paddingVertical: 8,
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

      {/* Summary stat strip */}
      {avgGlucose !== null && (
        <ChartCard>
          <View style={{ flexDirection: 'row' }}>
            {[
              { value: `${avgGlucose}`, unit: 'mg/dL', label: 'Avg Glucose', color: Colors.foreground },
              { value: `${avgTIR}%`, unit: '', label: 'Time in Range', color: Colors.glucoseInRange },
              { value: `${estA1c}%`, unit: '', label: 'Est. A1C', color: Colors.foreground },
              { value: `${avgCV}%`, unit: '', label: 'Avg CV', color: avgCV !== null && avgCV <= 36 ? Colors.glucoseInRange : Colors.glucoseHigh },
            ].map((stat, i, arr) => (
              <View key={stat.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: stat.color }}>
                  {stat.value}
                </Text>
                <Text style={{ fontSize: 10, color: Colors.mutedForeground, marginTop: 2, textAlign: 'center' }}>
                  {stat.label}
                </Text>
                {i < arr.length - 1 && (
                  <View style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: 1, backgroundColor: Colors.border }} />
                )}
              </View>
            ))}
          </View>
        </ChartCard>
      )}

      {/* Daily/weekly avg + min + max lines */}
      {data && (
        <ChartCard>
          <DailyGlucoseBarChart daily={daily} weekly={weekly} useWeekly={useWeekly} />
        </ChartCard>
      )}

      {/* Time in Range stacked bars */}
      {data && (
        <ChartCard>
          <TIRBarChart daily={daily} weekly={weekly} useWeekly={useWeekly} />
        </ChartCard>
      )}

      {/* Variability — CV */}
      {data && daily.length > 1 && (
        <ChartCard>
          <CVChart daily={daily} weekly={weekly} useWeekly={useWeekly} />
        </ChartCard>
      )}

      {/* Readings above 180 */}
      {data && daily.length > 1 && !useWeekly && (
        <ChartCard>
          <SpikeCountChart daily={daily} />
        </ChartCard>
      )}

      {/* Overnight & Bedtime */}
      {data && daily.length > 1 && !useWeekly && (
        <ChartCard>
          <OvernightBedtimeChart daily={daily} />
        </ChartCard>
      )}

      {/* Weekly estimated A1C (only for 30D/90D which have multiple weeks) */}
      {data && weekly.length >= 2 && (
        <ChartCard>
          <WeeklyA1CChart weekly={weekly} />
        </ChartCard>
      )}

      {/* Distribution histogram */}
      {data && (
        <ChartCard>
          <DistributionChart distribution={data.distribution} />
        </ChartCard>
      )}

      {/* Readings count footer */}
      {data && (
        <Text style={{ fontSize: 11, color: Colors.mutedForeground, textAlign: 'center' }}>
          {data.totalReadings.toLocaleString()} readings over {range} days
        </Text>
      )}
    </ScrollView>
  );
}

// ── Logs view ─────────────────────────────────────────────────────────────────

function LogsView() {
  const Colors = useColors();
  const [activeTab, setActiveTab] = useState<LogTab>('meal');
  const queryClient = useQueryClient();

  const start30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const meals    = useQuery({ queryKey: ['logs', 'meal'],     queryFn: () => getMealLogs(start30d, undefined, 100) });
  const insulin  = useQuery({ queryKey: ['logs', 'insulin'],  queryFn: () => getInsulinLogs(start30d, undefined, 100) });
  const exercise = useQuery({ queryKey: ['logs', 'exercise'], queryFn: () => getExerciseLogs(start30d, undefined, 100) });

  // Fetch 30-day glucose readings for MealImpactChart correlation
  const glucoseHistory = useGlucoseHistory(30);
  const rawReadings: GlucoseReading[] = glucoseHistory.data?.readings ?? [];

  const deleteMealMutation     = useMutation({ mutationFn: deleteMeal,     onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logs', 'meal'] }) });
  const deleteInsulinMutation  = useMutation({ mutationFn: deleteInsulin,  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logs', 'insulin'] }) });
  const deleteExerciseMutation = useMutation({ mutationFn: deleteExercise, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logs', 'exercise'] }) });

  const confirmDelete = useCallback((label: string, onConfirm: () => void) => {
    Alert.alert('Delete entry', `Delete this ${label} entry?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }, []);

  const activeQuery = activeTab === 'meal' ? meals : activeTab === 'insulin' ? insulin : exercise;
  const mealItems: MealLog[]         = (meals.data as any)?.meals      ?? [];
  const insulinItems: InsulinLog[]   = (insulin.data as any)?.doses     ?? [];
  const exerciseItems: ExerciseLog[] = (exercise.data as any)?.exercises ?? [];

  // Chart shown above each log list
  const listHeader = activeTab === 'meal'
    ? (
      <View style={{ gap: 0 }}>
        <DailyCarbChart meals={mealItems} />
        <MealImpactChart meals={mealItems} glucoseReadings={rawReadings} />
      </View>
    )
    : activeTab === 'insulin'
    ? (
      <View style={{ gap: 0 }}>
        <InsulinUsageChart doses={insulinItems} />
        <CarbRatioChart meals={mealItems} insulin={insulinItems} />
      </View>
    )
    : <ExercisePatternChart exercises={exerciseItems} />;

  return (
    <View style={{ flex: 1 }}>
      {/* Log tab selector */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', backgroundColor: Colors.muted, borderRadius: 12, padding: 4 }}>
          {LOG_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: activeTab === tab.key ? Colors.card : 'transparent',
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <Text style={{ fontSize: 14 }}>{tab.emoji}</Text>
              <Text style={{
                fontSize: 13,
                fontWeight: '600',
                color: activeTab === tab.key ? Colors.foreground : Colors.mutedForeground,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeQuery.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={
            activeTab === 'meal' ? mealItems :
            activeTab === 'insulin' ? insulinItems : exerciseItems
          }
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListHeaderComponent={listHeader}
          refreshControl={
            <RefreshControl
              refreshing={activeQuery.isFetching}
              onRefresh={() => activeQuery.refetch()}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40, gap: 10 }}>
              <Text style={{ fontSize: 36 }}>{LOG_TABS.find(t => t.key === activeTab)?.emoji}</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.foreground }}>
                No {activeTab} logs yet
              </Text>
              <Text style={{ color: Colors.mutedForeground }}>Use the Log tab to add entries.</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (activeTab === 'meal') {
              return (
                <MealItem
                  item={item as MealLog}
                  onDelete={() => confirmDelete('meal', () => deleteMealMutation.mutate((item as MealLog).id))}
                />
              );
            }
            if (activeTab === 'insulin') {
              return (
                <InsulinItem
                  item={item as InsulinLog}
                  onDelete={() => confirmDelete('insulin', () => deleteInsulinMutation.mutate((item as InsulinLog).id))}
                />
              );
            }
            return (
              <ExerciseItem
                item={item as ExerciseLog}
                onDelete={() => confirmDelete('exercise', () => deleteExerciseMutation.mutate((item as ExerciseLog).id))}
              />
            );
          }}
        />
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const Colors = useColors();
  const [mainView, setMainView] = useState<MainView>('glucose');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: Colors.foreground, marginBottom: 12 }}>
          History
        </Text>
        <SegmentedControl
          options={[
            { value: 'glucose', label: 'Glucose' },
            { value: 'logs',    label: 'Logs'    },
          ]}
          value={mainView}
          onChange={setMainView}
        />
      </View>

      {mainView === 'glucose' ? <GlucoseAnalyticsView /> : <LogsView />}
    </SafeAreaView>
  );
}
