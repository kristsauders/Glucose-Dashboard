import { View, Text, ScrollView, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Colors } from '../../constants/colors';
import type { DayMetrics, WeekMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H  = 180;

interface Props {
  daily?: DayMetrics[];
  weekly?: WeekMetrics[];
  /** If true, show weekly bars (for 90d); otherwise daily bars */
  useWeekly?: boolean;
}

export function DailyGlucoseBarChart({ daily, weekly, useWeekly }: Props) {
  const items = useWeekly ? weekly : daily;
  if (!items || items.length === 0) return null;

  const labels  = items.map(d => ('label' in d ? d.label : (d as WeekMetrics).weekLabel));
  const avgs    = items.map(d => d.avg);
  const maxVal  = Math.min(400, Math.max(...avgs) + 30);
  const minVal  = Math.max(40,  Math.min(...avgs) - 20);

  // Bar spacing: fit all bars in ~SCREEN_W - 64px, min 8px each
  const plotW   = SCREEN_W - 64;
  const spacing = Math.max(8, Math.floor(plotW / items.length) - 20);

  const barData = items.map((d, i) => ({
    value: d.avg,
    label: labels[i],
    frontColor: d.avg < 70
      ? Colors.glucoseLow
      : d.avg > 180
      ? Colors.glucoseHigh
      : Colors.glucoseInRange,
    topLabelComponent: items.length <= 14
      ? () => (
          <Text style={{ fontSize: 8, color: Colors.mutedForeground, marginBottom: 2 }}>
            {d.avg}
          </Text>
        )
      : undefined,
  }));

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground, marginBottom: 8 }}>
        {useWeekly ? 'Weekly average glucose' : 'Daily average glucose'}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <BarChart
          data={barData}
          width={Math.max(SCREEN_W - 64, items.length * (spacing + 20))}
          height={CHART_H}
          maxValue={maxVal}
          minValue={minVal}
          noOfSections={4}
          barWidth={Math.max(6, spacing)}
          spacing={4}
          roundedTop
          xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
          yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 10 }}
          yAxisLabelWidth={30}
          rulesColor={Colors.border}
          yAxisColor="transparent"
          xAxisColor={Colors.border}
          referenceLine1Position={180}
          referenceLine1Config={{ color: Colors.glucoseHigh, dashWidth: 3, dashGap: 3, thickness: 1 }}
          referenceLine2Position={70}
          referenceLine2Config={{ color: Colors.glucoseLow, dashWidth: 3, dashGap: 3, thickness: 1 }}
        />
      </ScrollView>
      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
        {[
          { color: Colors.glucoseLow,     label: 'Low (<70)' },
          { color: Colors.glucoseInRange, label: 'In range' },
          { color: Colors.glucoseHigh,    label: 'High (>180)' },
        ].map(({ color, label }) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
            <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
