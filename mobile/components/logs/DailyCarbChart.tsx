import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Colors } from '../../constants/colors';
import { format } from 'date-fns';
import type { MealLog } from '../../types/logs';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H  = 140;

interface Props {
  meals: MealLog[];
}

export function DailyCarbChart({ meals }: Props) {
  if (!meals || meals.length === 0) return null;

  // Group by local date
  const byDay = new Map<string, number>();
  for (const m of meals) {
    const key = format(new Date(m.timestamp), 'yyyy-MM-dd');
    byDay.set(key, (byDay.get(key) ?? 0) + (m.carbs ?? 0));
  }

  const entries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;

  const totals = entries.map(([, v]) => v);
  const avgCarbs = Math.round(totals.reduce((s, v) => s + v, 0) / totals.length);
  const maxVal = Math.max(...totals);
  const barW = Math.max(8, Math.floor((SCREEN_W - 96) / entries.length) - 3);

  const barData = entries.map(([dateIso, total], i) => ({
    value: total,
    label: i % Math.ceil(entries.length / 7) === 0
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
        width={SCREEN_W - 96}
        height={CHART_H}
        maxValue={Math.ceil(maxVal / 50) * 50 || 100}
        noOfSections={4}
        barWidth={Math.max(4, barW)}
        spacing={3}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 8 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisLabelWidth={30}
        yAxisLabelSuffix="g"
        rulesColor={Colors.border}
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
