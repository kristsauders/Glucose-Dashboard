import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { DayMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 160;

interface Props {
  daily: DayMetrics[];
}

export function OvernightBedtimeChart({ daily }: Props) {
  const Colors = useColors();
  if (!daily || daily.length === 0) return null;

  // Only include days that have at least one of the two values
  const filtered = daily.filter(d => d.overnightAvg !== null || d.bedtimeAvg !== null);
  if (filtered.length === 0) return null;

  const Y_AXIS_W = 36;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(filtered.length / 7);
  const computedSpacing = filtered.length > 1 ? Math.max(2, Math.floor((CHART_W - 20) / (filtered.length - 1))) : 20;

  // Labels stored separately; data items get '' to avoid slot-width clipping
  const labelTexts = filtered.map((d, i) =>
    i % step === 0 && i < filtered.length - 1 ? d.label : ''
  );

  // Carry the last valid value forward for null entries so the line doesn't
  // plummet to 0 for days/times that haven't occurred yet (e.g. today's bedtime).
  let lastOvernight = filtered.find(d => d.overnightAvg !== null)?.overnightAvg ?? 0;
  let lastBedtime   = filtered.find(d => d.bedtimeAvg   !== null)?.bedtimeAvg   ?? 0;

  const overnightData = filtered.map(d => {
    if (d.overnightAvg !== null) lastOvernight = d.overnightAvg;
    return { value: lastOvernight, hideDataPoint: d.overnightAvg === null, label: '' };
  });

  const bedtimeData = filtered.map(d => {
    if (d.bedtimeAvg !== null) lastBedtime = d.bedtimeAvg;
    return { value: lastBedtime, hideDataPoint: d.bedtimeAvg === null, label: '' };
  });

  const allVals = filtered.flatMap(d =>
    [d.overnightAvg, d.bedtimeAvg].filter((v): v is number => v !== null)
  );
  const minVal = Math.max(40, Math.min(...allVals) - 20);
  const maxVal = Math.min(300, Math.max(...allVals) + 20);
  const yMax = Math.ceil(maxVal / 20) * 20;
  const noOfSections = 4;
  const sectionSize = (yMax - Math.floor(minVal / 20) * 20) / noOfSections;
  const yBase = Math.floor(minVal / 20) * 20;

  // Integer y-axis labels
  const yLabels = [0, 1, 2, 3, 4].map(i => Math.round(yBase + sectionSize * i).toString());

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
          <View style={{ width: 14, height: 3, backgroundColor: '#34D399', borderRadius: 2 }} />
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>3–7am avg</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 14, height: 3, backgroundColor: '#A78BFA', borderRadius: 2 }} />
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
        width={CHART_W}
        height={CHART_H}
        spacing={computedSpacing}
        disableScroll
        maxValue={yMax}
        mostNegativeValue={yBase}
        noOfSections={noOfSections}
        yAxisLabelTexts={yLabels}
        yAxisLabelWidth={Y_AXIS_W}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        rulesColor={Colors.border + '40'}
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

      {/* Custom x-axis labels */}
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
    </View>
  );
}
