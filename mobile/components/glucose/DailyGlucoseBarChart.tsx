import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { DayMetrics, WeekMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 180;

interface Props {
  daily?: DayMetrics[];
  weekly?: WeekMetrics[];
  /** If true, show weekly data (for 90d); otherwise daily */
  useWeekly?: boolean;
}

export function DailyGlucoseBarChart({ daily, weekly, useWeekly }: Props) {
  const Colors = useColors();
  const items = useWeekly ? weekly : daily;
  if (!items || items.length === 0) return null;

  const Y_AXIS_W = 36;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(items.length / 7);
  const computedSpacing = items.length > 1 ? Math.max(2, Math.floor((CHART_W - 20) / (items.length - 1))) : 20;

  // Labels stored separately; data items get '' so gifted-charts won't clip them
  const labelTexts = items.map((d, i) =>
    i % step === 0 && i < items.length - 1
      ? ('label' in d ? d.label : (d as WeekMetrics).weekLabel)
      : ''
  );

  const avgData = items.map(d => ({ value: d.avg, label: '' }));
  const maxData = items.map(d => ({ value: d.max, label: '' }));
  const minData = items.map(d => ({ value: d.min, label: '' }));

  // Compute y-axis range
  const allVals = items.flatMap(d => [d.avg, d.max, d.min]);
  const chartMin = Math.max(40, Math.min(...allVals) - 20);
  const chartMax = Math.min(300, Math.max(...allVals) + 20);
  const noOfSections = 6;
  const step_size = Math.ceil((chartMax - chartMin) / noOfSections / 10) * 10;
  const adjustedMax = chartMin + step_size * noOfSections;

  // Build integer y-axis labels
  const yLabels: string[] = [];
  for (let i = 0; i <= noOfSections; i++) {
    yLabels.push(Math.round(chartMin + step_size * i).toString());
  }

  // Summary stats
  const overallAvg = Math.round(items.reduce((s, d) => s + d.avg, 0) / items.length);
  const overallMin = Math.min(...items.map(d => d.min));
  const overallMax = Math.max(...items.map(d => d.max));

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground, marginBottom: 4 }}>
        {useWeekly ? 'Weekly glucose (avg / min / max)' : 'Daily glucose (avg / min / max)'}
      </Text>

      {/* Stat row */}
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.primary }}>{overallAvg}</Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>avg</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.glucoseChartLine }}>{overallMin}</Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>min</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.warning }}>{overallMax}</Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>max</Text>
        </View>
      </View>

      <LineChart
        dataSet={[
          {
            data: avgData,
            color: Colors.primary,
            thickness: 2,
            curved: true,
            hideDataPoints: true,
          },
          {
            data: maxData,
            color: Colors.warning,
            thickness: 1.5,
            curved: true,
            hideDataPoints: true,
          },
          {
            data: minData,
            color: Colors.glucoseChartLine,
            thickness: 1.5,
            curved: true,
            hideDataPoints: true,
          },
        ]}
        height={CHART_H}
        width={CHART_W}
        spacing={computedSpacing}
        disableScroll
        maxValue={adjustedMax}
        mostNegativeValue={chartMin}
        noOfSections={noOfSections}
        yAxisLabelTexts={yLabels}
        yAxisLabelWidth={Y_AXIS_W}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 10 }}
        rulesColor={Colors.border + '40'}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
        backgroundColor="transparent"
        referenceLine1={{
          value: 180,
          lineConfig: {
            color: Colors.glucoseHigh,
            thickness: 1,
            dashWidth: 3,
            dashGap: 3,
          },
        }}
        referenceLine2={{
          value: 70,
          lineConfig: {
            color: Colors.glucoseLow,
            thickness: 1,
            dashWidth: 3,
            dashGap: 3,
          },
        }}
        showReferenceLine1
        showReferenceLine2
      />

      {/* Custom x-axis labels — positioned outside the chart to avoid slot-width clipping */}
      <View style={{ height: 14, marginLeft: Y_AXIS_W, position: 'relative' }}>
        {labelTexts.map((lbl, i) => {
          if (!lbl) return null;
          const cx = 20 + i * computedSpacing;
          return (
            <Text key={i} style={{ position: 'absolute', left: cx - 14, width: 28, fontSize: 9, color: Colors.mutedForeground, textAlign: 'center' }}>
              {lbl}
            </Text>
          );
        })}
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
        {[
          { color: Colors.primary, label: 'Avg' },
          { color: Colors.warning, label: 'Max' },
          { color: Colors.glucoseChartLine, label: 'Min' },
        ].map(({ color, label }) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 14, height: 3, backgroundColor: color, borderRadius: 2 }} />
            <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
