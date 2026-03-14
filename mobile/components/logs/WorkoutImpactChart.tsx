import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { ColorScheme } from '../../constants/colors';
import { format } from 'date-fns';
import type { ExerciseLog } from '../../types/logs';
import type { GlucoseReading } from '../../types/glucose';

const SCREEN_W = Dimensions.get('window').width;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SparkPoint {
  value: number;
  label: string;
}

interface WorkoutImpact {
  exercise: ExerciseLog;
  baseline: number;
  minBg: number;
  postBg: number | null;
  sparkline: SparkPoint[];
}

interface Props {
  exercises: ExerciseLog[];
  glucoseReadings: GlucoseReading[];
}

// ── Analysis ──────────────────────────────────────────────────────────────────

function analyzeWorkouts(exercises: ExerciseLog[], readings: GlucoseReading[]): WorkoutImpact[] {
  return exercises
    .map(ex => {
      const startMs = new Date(ex.timestamp).getTime();
      const endMs = startMs + ex.duration_minutes * 60_000;

      // Window: 30 min before → 3h after end
      const windowStart = startMs - 30 * 60_000;
      const windowEnd = endMs + 3 * 60 * 60_000;

      const windowReadings = readings
        .filter(r => {
          const t = new Date(r.timestamp).getTime();
          return t >= windowStart && t <= windowEnd;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (windowReadings.length < 3) return null;

      // Need at least one pre-workout reading for baseline
      const preReadings = windowReadings.filter(
        r => new Date(r.timestamp).getTime() < startMs
      );
      if (preReadings.length === 0) return null;

      // Require at least some post-workout data
      const postReadings = windowReadings.filter(
        r => new Date(r.timestamp).getTime() > endMs
      );
      if (postReadings.length === 0) return null;

      // Baseline: average of pre-workout readings
      const baseline = Math.round(
        preReadings.reduce((s, r) => s + Number(r.glucose), 0) / preReadings.length
      );

      // Min BG during the full workout window (most critical for T1D)
      const minBg = Math.round(
        Math.min(...windowReadings.map(r => Number(r.glucose)))
      );

      // Post-workout BG: average of readings 60–120 min after workout end
      const latePostReadings = postReadings.filter(r => {
        const t = new Date(r.timestamp).getTime();
        return t >= endMs + 60 * 60_000 && t <= endMs + 2 * 60 * 60_000;
      });
      const postBg = latePostReadings.length > 0
        ? Math.round(
            latePostReadings.reduce((s, r) => s + Number(r.glucose), 0) / latePostReadings.length
          )
        : null;

      const sparkline: SparkPoint[] = windowReadings.map(r => ({
        value: Number(r.glucose),
        label: '',
      }));

      return { exercise: ex, baseline, minBg, postBg, sparkline };
    })
    .filter((r): r is WorkoutImpact => r !== null);
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function minBgColor(minBg: number, colors: ColorScheme): string {
  if (minBg < 70) return colors.glucoseLow;
  if (minBg < 85) return colors.warning;
  return colors.foreground;
}

function hrColor(avgHR: number, colors: ColorScheme): string {
  if (avgHR >= 150) return colors.glucoseLow;
  if (avgHR >= 115) return colors.warning;
  return colors.foreground;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkoutImpactChart({ exercises, glucoseReadings }: Props) {
  const Colors = useColors();

  if (!exercises || exercises.length === 0) return null;
  if (!glucoseReadings || glucoseReadings.length === 0) return null;

  // Most recent 8 workouts
  const sorted = [...exercises]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);

  const impacts = analyzeWorkouts(sorted, glucoseReadings);
  if (impacts.length === 0) return null;

  const CARD_W = SCREEN_W - 66;
  const SPARKLINE_Y_AXIS_W = 28;
  const SPARKLINE_W = CARD_W - 8 - SPARKLINE_Y_AXIS_W;

  return (
    <View style={{
      backgroundColor: Colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: Colors.cardBorder,
      padding: 16,
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground, marginBottom: 4 }}>
        Workout Impact Analysis
      </Text>
      <Text style={{ fontSize: 11, color: Colors.mutedForeground, marginBottom: 14 }}>
        Glucose response · 30 min before through 3h after ({impacts.length} workout{impacts.length !== 1 ? 's' : ''})
      </Text>

      {impacts.map((impact, index) => {
        const sparkValues = impact.sparkline.map(s => s.value);
        const rawMin = Math.min(...sparkValues);
        const rawMax = Math.max(...sparkValues);
        const range = rawMax - rawMin;
        const padding = Math.max(2, Math.round(range * 0.05));
        const sparkMin = Math.max(40, rawMin - padding);
        const N_SECTIONS = 3;
        const stepValue = Math.max(1, Math.ceil((rawMax + padding - sparkMin) / N_SECTIONS));
        const normalizedMax = stepValue * N_SECTIONS;

        const normalizedSparkline = impact.sparkline.map(s => ({
          ...s,
          value: Math.max(0, s.value - sparkMin),
        }));
        const normalizedBaseline = Math.max(0, impact.baseline - sparkMin);

        const yLabels = Array.from({ length: N_SECTIONS + 1 }, (_, i) =>
          String(Math.round(sparkMin + i * stepValue))
        );

        const ex = impact.exercise;
        const hasHR = ex.avg_heart_rate != null;
        const hasCal = ex.calories != null;

        return (
          <View
            key={`${ex.id}-${index}`}
            style={{
              borderTopWidth: index > 0 ? 1 : 0,
              borderTopColor: Colors.border,
              paddingTop: index > 0 ? 14 : 0,
              marginTop: index > 0 ? 14 : 0,
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.foreground, textTransform: 'capitalize' }}>
                    {ex.description || ex.activity_type}
                    {ex.intensity ? ` (${ex.intensity})` : ''}
                  </Text>
                  {ex.source === 'healthkit' && (
                    <View style={{
                      backgroundColor: Colors.primary + '20',
                      borderRadius: 5,
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                    }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.primary }}>HK</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: Colors.mutedForeground, marginTop: 1 }}>
                  {format(new Date(ex.timestamp), 'MMM d, h:mm a')} · {ex.duration_minutes}m
                </Text>
              </View>
            </View>

            {/* Sparkline */}
            <View style={{
              backgroundColor: Colors.muted,
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 4,
              marginBottom: 10,
            }}>
              <Text style={{ fontSize: 10, color: Colors.mutedForeground, marginLeft: 6, marginBottom: 4 }}>
                Glucose response
              </Text>
              <LineChart
                data={normalizedSparkline}
                width={SPARKLINE_W}
                height={60}
                spacing={normalizedSparkline.length > 1 ? Math.max(2, Math.floor((SPARKLINE_W - 20) / (normalizedSparkline.length - 1))) : 10}
                disableScroll
                maxValue={normalizedMax}
                noOfSections={N_SECTIONS}
                yAxisLabelTexts={yLabels}
                color="#22c55e"
                thickness={2}
                curved
                hideDataPoints
                xAxisLabelTextStyle={{ color: 'transparent', fontSize: 0 }}
                yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 8 }}
                yAxisLabelWidth={SPARKLINE_Y_AXIS_W}
                rulesColor={Colors.border + '30'}
                yAxisColor="transparent"
                xAxisColor={Colors.border + '60'}
                backgroundColor="transparent"
                referenceLine1={{
                  value: normalizedBaseline,
                  lineConfig: {
                    color: Colors.mutedForeground,
                    thickness: 1,
                    dashWidth: 3,
                    dashGap: 3,
                  },
                }}
                showReferenceLine1
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 30, marginTop: 2 }}>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>-30m</Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>Workout</Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>+3h</Text>
              </View>
            </View>

            {/* Stats row */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Pre BG */}
              <View style={{
                flex: 1,
                backgroundColor: Colors.muted,
                borderRadius: 8,
                padding: 10,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground }}>
                  {impact.baseline}
                </Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground, marginTop: 2 }}>pre BG</Text>
              </View>

              {/* Min BG */}
              <View style={{
                flex: 1,
                backgroundColor: impact.minBg < 85 ? minBgColor(impact.minBg, Colors) + '15' : Colors.muted,
                borderRadius: 8,
                padding: 10,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: minBgColor(impact.minBg, Colors) }}>
                  {impact.minBg}
                </Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground, marginTop: 2 }}>min BG</Text>
              </View>

              {/* Post BG */}
              <View style={{
                flex: 1,
                backgroundColor: Colors.muted,
                borderRadius: 8,
                padding: 10,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground }}>
                  {impact.postBg != null ? String(impact.postBg) : '–'}
                </Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground, marginTop: 2 }}>+2h BG</Text>
              </View>

              {/* HR or calories */}
              {hasHR ? (
                <View style={{
                  flex: 1,
                  backgroundColor: Colors.muted,
                  borderRadius: 8,
                  padding: 10,
                  alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: hrColor(ex.avg_heart_rate!, Colors) }}>
                    {Math.round(ex.avg_heart_rate!)}
                  </Text>
                  <Text style={{ fontSize: 9, color: Colors.mutedForeground, marginTop: 2 }}>avg HR</Text>
                </View>
              ) : hasCal ? (
                <View style={{
                  flex: 1,
                  backgroundColor: Colors.muted,
                  borderRadius: 8,
                  padding: 10,
                  alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground }}>
                    {Math.round(ex.calories!)}
                  </Text>
                  <Text style={{ fontSize: 9, color: Colors.mutedForeground, marginTop: 2 }}>cal</Text>
                </View>
              ) : (
                <View style={{
                  flex: 1,
                  backgroundColor: Colors.muted,
                  borderRadius: 8,
                  padding: 10,
                  alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground }}>
                    {ex.duration_minutes}m
                  </Text>
                  <Text style={{ fontSize: 9, color: Colors.mutedForeground, marginTop: 2 }}>duration</Text>
                </View>
              )}
            </View>

            {/* HR detail row — show max HR and calories together when both exist */}
            {hasHR && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {ex.max_heart_rate != null && (
                  <View style={{
                    flex: 1,
                    backgroundColor: Colors.muted,
                    borderRadius: 8,
                    paddingVertical: 7,
                    paddingHorizontal: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>Max HR</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
                      {Math.round(ex.max_heart_rate)} bpm
                    </Text>
                  </View>
                )}
                {hasCal && (
                  <View style={{
                    flex: 1,
                    backgroundColor: Colors.muted,
                    borderRadius: 8,
                    paddingVertical: 7,
                    paddingHorizontal: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>Calories</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
                      {Math.round(ex.calories!)}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
