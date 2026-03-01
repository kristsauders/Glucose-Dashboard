import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { DayMetrics, WeekMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H  = 150;

interface Props {
  daily?: DayMetrics[];
  weekly?: WeekMetrics[];
  useWeekly?: boolean;
}

export function SpikeCountChart({ daily, weekly, useWeekly }: Props) {
  const Colors = useColors();
  const items = useWeekly ? weekly : daily;
  if (!items || items.length === 0) return null;

  // For weekly we use above180 %, for daily we use raw spikesAbove180 count
  const isWeekly = useWeekly && !('spikesAbove180' in (items[0] ?? {}));

  const spikeCounts = isWeekly
    ? (items as WeekMetrics[]).map(w => w.above180)
    : (items as DayMetrics[]).map(d => d.spikesAbove180);

  const avgSpikes = spikeCounts.reduce((s, v) => s + v, 0) / spikeCounts.length;
  const maxVal = Math.max(...spikeCounts, 1);
  const daysZero = spikeCounts.filter(v => v === 0).length;

  const barW = Math.max(6, Math.floor((SCREEN_W - 96) / items.length) - 3);

  const barData = items.map((d, i) => {
    const val = isWeekly
      ? (d as WeekMetrics).above180
      : (d as DayMetrics).spikesAbove180;
    const label = i % Math.ceil(items.length / 7) === 0
      ? ('label' in d ? d.label : (d as WeekMetrics).weekLabel)
      : '';
    return {
      value: val,
      label,
      frontColor: val === 0 ? Colors.glucoseInRange : Colors.glucoseHigh,
    };
  });

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
          Readings Above 180
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground }}>
              {Math.round(avgSpikes * 10) / 10}
            </Text>
            <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>avg / day</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.glucoseInRange }}>
              {daysZero}
            </Text>
            <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>days at 0</Text>
          </View>
        </View>
      </View>

      <BarChart
        data={barData}
        width={SCREEN_W - 96}
        height={CHART_H}
        maxValue={Math.ceil(maxVal / 5) * 5 || 10}
        noOfSections={4}
        barWidth={Math.max(4, barW)}
        spacing={3}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 8 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisLabelWidth={30}
        rulesColor={Colors.border}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
      />
    </View>
  );
}
