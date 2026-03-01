import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { DayMetrics, WeekMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 160;

interface Props {
  daily?: DayMetrics[];
  weekly?: WeekMetrics[];
  useWeekly?: boolean;
}

export function TIRBarChart({ daily, weekly, useWeekly }: Props) {
  const Colors = useColors();
  const items = useWeekly ? weekly : daily;
  if (!items || items.length === 0) return null;

  const Y_AXIS_W = 36;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(items.length / 7);
  const barWidth = Math.max(6, Math.floor(CHART_W / items.length) - 4);
  const spacing = Math.max(2, Math.floor(CHART_W / items.length) - barWidth - 2);

  // Y-axis: integer % labels
  const yLabels = ['0%', '25%', '50%', '75%', '100%'];

  // react-native-gifted-charts stackData format
  const stackData = items.map((d, i) => {
    const label = i % step === 0
      ? ('label' in d ? d.label : (d as WeekMetrics).weekLabel)
      : '';
    const below = Math.max(0, d.below70);
    const inRange = Math.max(0, d.tir70_180);
    const above = Math.max(0, 100 - below - inRange);
    return {
      stacks: [
        { value: below, color: Colors.glucoseLow },
        { value: inRange, color: Colors.glucoseInRange },
        { value: above, color: Colors.glucoseHigh },
      ],
      label,
    };
  });

  // Average TIR stat
  const avgTIR = Math.round(items.reduce((s, d) => s + d.tir70_180, 0) / items.length);

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
          Time in range (70–180 mg/dL)
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.glucoseInRange }}>{avgTIR}%</Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>avg TIR</Text>
        </View>
      </View>

      <BarChart
        stackData={stackData}
        width={CHART_W}
        height={CHART_H}
        maxValue={100}
        noOfSections={4}
        barWidth={barWidth}
        spacing={spacing}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 10 }}
        yAxisLabelWidth={Y_AXIS_W}
        yAxisLabelTexts={yLabels}
        rulesColor={Colors.border + '40'}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
        referenceLine1Position={70}
        referenceLine1Config={{ color: Colors.glucoseInRange, dashWidth: 4, dashGap: 4, thickness: 1 }}
      />

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
        {[
          { color: Colors.glucoseLow, label: 'Low (<70)' },
          { color: Colors.glucoseInRange, label: 'In range (70–180)' },
          { color: Colors.glucoseHigh, label: 'High (>180)' },
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
