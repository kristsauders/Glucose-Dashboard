import { View, Text, ScrollView, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { DayMetrics, WeekMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H  = 160;

interface Props {
  daily?: DayMetrics[];
  weekly?: WeekMetrics[];
  useWeekly?: boolean;
}

export function TIRBarChart({ daily, weekly, useWeekly }: Props) {
  const Colors = useColors();
  const items = useWeekly ? weekly : daily;
  if (!items || items.length === 0) return null;

  const plotW   = SCREEN_W - 64;
  const barW    = Math.max(8, Math.floor(plotW / items.length) - 4);

  // react-native-gifted-charts stackData format
  const stackData = items.map(d => {
    const label = 'label' in d ? d.label : (d as WeekMetrics).weekLabel;
    const below  = Math.max(0, d.below70);
    const inRange = Math.max(0, d.tir70_180);
    const above  = Math.max(0, 100 - below - inRange);
    return {
      stacks: [
        { value: below,   color: Colors.glucoseLow },
        { value: inRange, color: Colors.glucoseInRange },
        { value: above,   color: Colors.glucoseHigh },
      ],
      label,
    };
  });

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground, marginBottom: 8 }}>
        Time in range (70–180 mg/dL)
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <BarChart
          stackData={stackData}
          width={Math.max(SCREEN_W - 64, items.length * (barW + 4))}
          height={CHART_H}
          maxValue={100}
          noOfSections={4}
          barWidth={barW}
          spacing={4}
          xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
          yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 10 }}
          yAxisLabelWidth={30}
          rulesColor={Colors.border}
          yAxisColor="transparent"
          xAxisColor={Colors.border}
          yAxisLabelSuffix="%"
          referenceLine1Position={70}
          referenceLine1Config={{ color: Colors.glucoseInRange, dashWidth: 4, dashGap: 4, thickness: 1 }}
        />
      </ScrollView>
      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
        {[
          { color: Colors.glucoseLow,     label: 'Low (<70)' },
          { color: Colors.glucoseInRange, label: 'In range (70–180)' },
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
