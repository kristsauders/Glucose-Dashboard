import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { ColorScheme } from '../../constants/colors';
import { format } from 'date-fns';
import type { MealLog } from '../../types/logs';
import type { GlucoseReading } from '../../types/glucose';

const SCREEN_W = Dimensions.get('window').width;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SparkPoint {
  value: number;
  label: string;
}

interface MealImpact {
  meal: MealLog;
  baseline: number;
  spike: number;
  timeToPeak: number;
  returnTime: number | null;
  sparkline: SparkPoint[];
  peakGlucose: number;
}

interface Props {
  meals: MealLog[];
  glucoseReadings: GlucoseReading[];
}

// ── Analysis logic ────────────────────────────────────────────────────────────

function analyzeMeals(meals: MealLog[], readings: GlucoseReading[]): MealImpact[] {
  return meals
    .map(meal => {
      const mealMs = new Date(meal.timestamp).getTime();
      const windowStart = mealMs - 10 * 60 * 1000; // look back 10 min for pre-meal baseline
      const windowEnd = mealMs + 3 * 60 * 60 * 1000; // 3 hours

      // Get readings in the window
      const windowReadings = readings
        .filter(r => {
          const t = new Date(r.timestamp).getTime();
          return t >= windowStart && t <= windowEnd;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (windowReadings.length < 3) return null;

      // Require at least 2 hours of post-meal data so we see the full arc
      const lastMs = new Date(windowReadings[windowReadings.length - 1].timestamp).getTime();
      if (lastMs - mealMs < 2 * 60 * 60 * 1000) return null;

      // Baseline: reading closest to meal time
      const baseline = Number(windowReadings[0].glucose);

      // Find peak
      const peakReading = windowReadings.reduce(
        (max, r) => Number(r.glucose) > Number(max.glucose) ? r : max,
        windowReadings[0]
      );
      const peakGlucose = Number(peakReading.glucose);
      const spike = peakGlucose - baseline;
      const timeToPeak = Math.round(
        (new Date(peakReading.timestamp).getTime() - mealMs) / 60000
      );

      // Time to return within 30mg of baseline
      const peakTime = new Date(peakReading.timestamp).getTime();
      const returnReading = windowReadings.find(r => {
        const t = new Date(r.timestamp).getTime();
        return t > peakTime && Number(r.glucose) <= baseline + 30;
      });
      const returnTime = returnReading
        ? Math.round((new Date(returnReading.timestamp).getTime() - mealMs) / 60000)
        : null;

      // Sparkline data
      const sparkline: SparkPoint[] = windowReadings.map(r => ({
        value: Number(r.glucose),
        label: '',
      }));

      return {
        meal,
        baseline,
        spike,
        timeToPeak,
        returnTime,
        sparkline,
        peakGlucose,
      };
    })
    .filter((r): r is MealImpact => r !== null);
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function spikeColor(spike: number, colors: ColorScheme): string {
  if (spike < 30) return colors.glucoseInRange;
  if (spike < 80) return colors.warning;
  return colors.glucoseLow;
}

function spikeBgColor(spike: number, colors: ColorScheme): string {
  if (spike < 30) return colors.glucoseInRange + '15';
  if (spike < 80) return colors.warning + '15';
  return colors.glucoseLow + '15';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MealImpactChart({ meals, glucoseReadings }: Props) {
  const Colors = useColors();

  if (!meals || meals.length === 0) return null;
  if (!glucoseReadings || glucoseReadings.length === 0) return null;

  // Sort meals by most recent, take top 10
  const sortedMeals = [...meals].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  ).slice(0, 10);

  const impacts = analyzeMeals(sortedMeals, glucoseReadings);
  if (impacts.length === 0) return null;

  const CARD_W = SCREEN_W - 66; // 66 = 32 outer padding + 32 card padding + 2 border
  const SPARKLINE_Y_AXIS_W = 28;
  // Container paddingHorizontal:4 (×2=8) + y-axis label width
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
        Meal Impact Analysis
      </Text>
      <Text style={{ fontSize: 11, color: Colors.mutedForeground, marginBottom: 14 }}>
        3-hour glucose response per meal ({impacts.length} meal{impacts.length !== 1 ? 's' : ''})
      </Text>

      {impacts.map((impact, index) => {
        const sparkValues = impact.sparkline.map(s => s.value);
        const rawMin = Math.min(...sparkValues);
        const rawMax = Math.max(...sparkValues);
        const padding = Math.max(2, Math.round((rawMax - rawMin) * 0.05));
        const sparkMin = Math.max(40, rawMin - padding);
        const N_SECTIONS = 3;
        // stepValue controls where the y-axis floor lands:
        // chart bottom = maxValue - stepValue * noOfSections
        // so: stepValue = ceil((rawMax + padding - sparkMin) / N_SECTIONS)
        const stepValue = Math.max(1, Math.ceil((rawMax + padding - sparkMin) / N_SECTIONS));
        const sparkMax = sparkMin + stepValue * N_SECTIONS; // exact top, aligns with bottom
        const sc = spikeColor(impact.spike, Colors);
        const sbg = spikeBgColor(impact.spike, Colors);
        const spikeSign = impact.spike >= 0 ? '+' : '';

        return (
          <View
            key={`${impact.meal.id}-${index}`}
            style={{
              borderTopWidth: index > 0 ? 1 : 0,
              borderTopColor: Colors.border,
              paddingTop: index > 0 ? 14 : 0,
              marginTop: index > 0 ? 14 : 0,
            }}
          >
            {/* Meal header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.foreground }} numberOfLines={1}>
                  {impact.meal.description || 'Meal'}
                </Text>
                <Text style={{ fontSize: 11, color: Colors.mutedForeground, marginTop: 1 }}>
                  {format(new Date(impact.meal.timestamp), 'MMM d, h:mm a')}
                  {impact.meal.carbs > 0 ? ` · ${Math.round(impact.meal.carbs)}g carbs` : ''}
                </Text>
              </View>
            </View>

            {/* Sparkline glucose response */}
            <View style={{
              backgroundColor: Colors.muted,
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 4,
              marginBottom: 10,
            }}>
              <Text style={{ fontSize: 10, color: Colors.mutedForeground, marginLeft: 6, marginBottom: 4 }}>
                3-hour glucose response
              </Text>
              <LineChart
                data={impact.sparkline}
                width={SPARKLINE_W}
                height={60}
                spacing={impact.sparkline.length > 1 ? Math.max(2, Math.floor((SPARKLINE_W - 20) / (impact.sparkline.length - 1))) : 10}
                disableScroll
                maxValue={sparkMax}
                stepValue={stepValue}
                noOfSections={N_SECTIONS}
                color={Colors.primary}
                thickness={2}
                curved
                hideDataPoints
                hideAxesAndRules={false}
                xAxisLabelTextStyle={{ color: 'transparent', fontSize: 0 }}
                yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 8 }}
                yAxisLabelWidth={SPARKLINE_Y_AXIS_W}
                rulesColor={Colors.border + '30'}
                yAxisColor="transparent"
                xAxisColor={Colors.border + '60'}
                backgroundColor="transparent"
                referenceLine1={{
                  value: impact.baseline,
                  lineConfig: {
                    color: Colors.mutedForeground,
                    thickness: 1,
                    dashWidth: 3,
                    dashGap: 3,
                  },
                }}
                showReferenceLine1
              />
              {/* X-axis labels: Meal → +3h */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 30, marginTop: 2 }}>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>Meal</Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>+3h</Text>
              </View>
            </View>

            {/* Stats row: start → spike → peak → time to peak */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Start glucose */}
              <View style={{
                flex: 1,
                backgroundColor: Colors.muted,
                borderRadius: 8,
                padding: 10,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground }}>
                  {Math.round(impact.baseline)}
                </Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground, marginTop: 2 }}>start</Text>
              </View>

              {/* Spike */}
              <View style={{
                flex: 1,
                backgroundColor: sbg,
                borderRadius: 8,
                padding: 10,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: sc }}>
                  {spikeSign}{Math.round(impact.spike)}
                </Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground, marginTop: 2 }}>spike</Text>
              </View>

              {/* Peak */}
              <View style={{
                flex: 1,
                backgroundColor: Colors.muted,
                borderRadius: 8,
                padding: 10,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground }}>
                  {Math.round(impact.peakGlucose)}
                </Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground, marginTop: 2 }}>peak</Text>
              </View>

              {/* Time to peak */}
              <View style={{
                flex: 1,
                backgroundColor: Colors.muted,
                borderRadius: 8,
                padding: 10,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground }}>
                  {impact.timeToPeak}m
                </Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground, marginTop: 2 }}>to peak</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
