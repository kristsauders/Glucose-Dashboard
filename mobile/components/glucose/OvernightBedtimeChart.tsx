import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { DayMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H  = 160;

interface Props {
  daily: DayMetrics[];
}

export function OvernightBedtimeChart({ daily }: Props) {
  const Colors = useColors();
  if (!daily || daily.length === 0) return null;

  // Only include days that have at least one of the two values
  const filtered = daily.filter(d => d.overnightAvg !== null || d.bedtimeAvg !== null);
  if (filtered.length === 0) return null;

  const overnightData = filtered.map((d, i) => ({
    value: d.overnightAvg ?? 0,
    hideDataPoint: d.overnightAvg === null,
    label: i % Math.ceil(filtered.length / 7) === 0 ? d.label : '',
  }));

  const bedtimeData = filtered.map(d => ({
    value: d.bedtimeAvg ?? 0,
    hideDataPoint: d.bedtimeAvg === null,
  }));

  const allVals = filtered.flatMap(d => [d.overnightAvg, d.bedtimeAvg].filter(v => v !== null) as number[]);
  const minVal = Math.max(40, Math.min(...allVals) - 20);
  const maxVal = Math.min(300, Math.max(...allVals) + 20);

  const avgOvernight = filtered
    .filter(d => d.overnightAvg !== null)
    .map(d => d.overnightAvg as number);
  const avgBedtime = filtered
    .filter(d => d.bedtimeAvg !== null)
    .map(d => d.bedtimeAvg as number);

  const meanOvernight = avgOvernight.length
    ? Math.round(avgOvernight.reduce((s, v) => s + v, 0) / avgOvernight.length)
    : null;
  const meanBedtime = avgBedtime.length
    ? Math.round(avgBedtime.reduce((s, v) => s + v, 0) / avgBedtime.length)
    : null;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
          Overnight &amp; Bedtime Glucose
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {meanOvernight !== null && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#34D399' }}>{meanOvernight}</Text>
              <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>overnight</Text>
            </View>
          )}
          {meanBedtime !== null && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#A78BFA' }}>{meanBedtime}</Text>
              <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>bedtime</Text>
            </View>
          )}
        </View>
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 12, height: 2, backgroundColor: '#34D399' }} />
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>3–7am avg</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 12, height: 2, backgroundColor: '#A78BFA' }} />
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>10pm–midnight avg</Text>
        </View>
      </View>

      <LineChart
        dataSet={[
          {
            data: overnightData,
            color: '#34D399',
            thickness: 2,
            curved: true,
            hideDataPoints: filtered.length > 20,
            dataPointsColor: '#34D399',
            dataPointsRadius: 3,
          },
          {
            data: bedtimeData,
            color: '#A78BFA',
            thickness: 2,
            curved: true,
            hideDataPoints: filtered.length > 20,
            dataPointsColor: '#A78BFA',
            dataPointsRadius: 3,
          },
        ]}
        width={SCREEN_W - 96}
        height={CHART_H}
        maxValue={Math.ceil(maxVal / 20) * 20}
        noOfSections={4}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 8 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisLabelWidth={30}
        rulesColor={Colors.border}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
        referenceLine1={{
          value: 100,
          lineConfig: {
            color: Colors.mutedForeground,
            thickness: 1,
            dashWidth: 4,
            dashGap: 4,
            labelText: '100',
            labelTextStyle: { color: Colors.mutedForeground, fontSize: 8 },
          },
        }}
        showReferenceLine1
      />
    </View>
  );
}
