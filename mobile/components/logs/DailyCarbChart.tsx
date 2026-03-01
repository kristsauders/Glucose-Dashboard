import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import { format } from 'date-fns';
import type { MealLog } from '../../types/logs';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 140;

interface Props {
  meals: MealLog[];
}

export function DailyCarbChart({ meals }: Props) {
  const Colors = useColors();
  if (!meals || meals.length === 0) return null;

  // Group by local date
  const byDay = new Map<string, number>();
  for (const m of meals) {
    const key = format(new Date(m.timestamp), 'yyyy-MM-dd');
    byDay.set(key, (byDay.get(key) ?? 0) + Number(m.carbs ?? 0));
  }

  const entries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;

  const Y_AXIS_W = 36;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(entries.length / 7);
  const barWidth = Math.max(6, Math.floor(CHART_W / entries.length) - 4);
  const spacing = Math.max(2, Math.floor(CHART_W / entries.length) - barWidth - 2);

  const totals = entries.map(([, v]) => v);
  const avgCarbs = Math.round(totals.reduce((s, v) => s + v, 0) / totals.length);
  const maxVal = Math.max(...totals);

  // Integer y-axis labels (grams)
  const yMax = Math.ceil(maxVal / 50) * 50 || 100;
  const noOfSections = 4;
  const sectionSize = yMax / noOfSections;
  const yLabels = [0, 1, 2, 3, 4].map(i => `${Math.round(sectionSize * i)}g`);

  const barData = entries.map(([dateIso, total], i) => ({
    value: total,
    label: i % step === 0
      ? format(new Date(dateIso + 'T12:00:00'), 'M/d')
      : '',
    frontColor: Colors.primary,
  }));

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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
          Daily Carb Intake
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.primary }}>{avgCarbs}g</Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>avg / day</Text>
        </View>
      </View>

      <BarChart
        data={barData}
        width={CHART_W}
        height={CHART_H}
        maxValue={yMax}
        noOfSections={noOfSections}
        barWidth={barWidth}
        spacing={spacing}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisLabelWidth={Y_AXIS_W}
        yAxisLabelTexts={yLabels}
        rulesColor={Colors.border + '40'}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
        referenceLine1={{
          value: avgCarbs,
          lineConfig: {
            color: Colors.mutedForeground,
            thickness: 1,
            dashWidth: 4,
            dashGap: 4,
            labelText: `avg ${avgCarbs}g`,
            labelTextStyle: { color: Colors.mutedForeground, fontSize: 8 },
          },
        }}
        showReferenceLine1
      />
    </View>
  );
}
