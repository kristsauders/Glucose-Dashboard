import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { DayMetrics, WeekMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 150;

interface Props {
  daily?: DayMetrics[];
  weekly?: WeekMetrics[];
  useWeekly?: boolean;
}

export function SpikeCountChart({ daily, weekly, useWeekly }: Props) {
  const Colors = useColors();
  const items = useWeekly ? weekly : daily;
  if (!items || items.length === 0) return null;

  const Y_AXIS_W = 36;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(items.length / 7);
  const barWidth = Math.max(6, Math.floor(CHART_W / items.length) - 4);
  const spacing = Math.max(2, Math.floor(CHART_W / items.length) - barWidth - 2);

  // For weekly we use above180 %, for daily we use raw spikesAbove180 count
  const isWeekly = useWeekly && !('spikesAbove180' in (items[0] ?? {}));

  const spikeCounts = isWeekly
    ? (items as WeekMetrics[]).map(w => w.above180)
    : (items as DayMetrics[]).map(d => d.spikesAbove180);

  const avgSpikes = spikeCounts.reduce((s, v) => s + v, 0) / spikeCounts.length;
  const maxVal = Math.max(...spikeCounts, 1);
  const daysZero = spikeCounts.filter(v => v === 0).length;

  // Integer y-axis labels
  const yMax = Math.ceil(maxVal / 5) * 5 || 10;
  const noOfSections = 4;
  const sectionSize = yMax / noOfSections;
  const yLabels = [0, 1, 2, 3, 4].map(i => Math.round(sectionSize * i).toString());

  const barData = items.map((d, i) => {
    const val = isWeekly
      ? (d as WeekMetrics).above180
      : (d as DayMetrics).spikesAbove180;
    const label = i % step === 0
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
        width={CHART_W}
        height={CHART_H}
        maxValue={yMax}
        noOfSections={noOfSections}
        yAxisLabelTexts={yLabels}
        yAxisLabelWidth={Y_AXIS_W}
        barWidth={barWidth}
        spacing={spacing}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        rulesColor={Colors.border + '40'}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
      />
    </View>
  );
}
