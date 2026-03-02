import { useState } from 'react';
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
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const items = useWeekly ? weekly : daily;
  if (!items || items.length === 0) return null;

  const Y_AXIS_W = 36;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(items.length / 7);
  const INIT = 8;
  const slotW = Math.max(3, (CHART_W - INIT) / items.length);
  const barWidth = Math.max(2, Math.floor(slotW * 0.6));
  const spacing = Math.max(1, Math.floor(slotW) - barWidth);

  // Full date labels (every item) for tooltip
  const fullLabels = items.map(d => 'label' in d ? d.label : (d as WeekMetrics).weekLabel);

  // Y-axis: integer % labels
  const yLabels = ['0%', '25%', '50%', '75%', '100%'];

  // Labels stored separately; stackData items get '' to avoid slot-width clipping
  const labelTexts = items.map((d, i) =>
    i % step === 0 && i < items.length - 1
      ? ('label' in d ? d.label : (d as WeekMetrics).weekLabel)
      : ''
  );

  const stackData = items.map(d => {
    const below = Math.max(0, d.below70);
    const inRange = Math.max(0, d.tir70_180);
    const above = Math.max(0, 100 - below - inRange);
    return {
      stacks: [
        { value: below, color: Colors.glucoseLow },
        { value: inRange, color: Colors.glucoseInRange },
        { value: above, color: Colors.glucoseHigh },
      ],
      label: '',
    };
  });

  // Average TIR stat
  const avgTIR = Math.round(items.reduce((s, d) => s + d.tir70_180, 0) / items.length);

  // Tooltip position
  const selectedItem = selectedIdx !== null ? items[selectedIdx] : null;
  const barCenterX = selectedIdx !== null
    ? Y_AXIS_W + INIT + selectedIdx * (barWidth + spacing) + barWidth / 2
    : 0;
  const tooltipLeft = Math.max(Y_AXIS_W, Math.min(Y_AXIS_W + CHART_W - 110, barCenterX - 55));

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

      <View
        style={{ position: 'relative' }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          const dataX = e.nativeEvent.locationX - Y_AXIS_W - INIT;
          if (dataX < 0) { setSelectedIdx(null); return; }
          setSelectedIdx(Math.max(0, Math.min(Math.round(dataX / (barWidth + spacing)), items.length - 1)));
        }}
        onResponderMove={(e) => {
          const dataX = e.nativeEvent.locationX - Y_AXIS_W - INIT;
          if (dataX < 0) { setSelectedIdx(null); return; }
          setSelectedIdx(Math.max(0, Math.min(Math.round(dataX / (barWidth + spacing)), items.length - 1)));
        }}
        onResponderRelease={() => setSelectedIdx(null)}
        onResponderTerminate={() => setSelectedIdx(null)}
      >
        <BarChart
          stackData={stackData}
          width={CHART_W}
          height={CHART_H}
          maxValue={100}
          noOfSections={4}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={INIT}
          disableScroll
          yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 10 }}
          yAxisLabelWidth={Y_AXIS_W}
          yAxisLabelTexts={yLabels}
          rulesColor={Colors.border + '40'}
          yAxisColor="transparent"
          xAxisColor={Colors.border}
          referenceLine1Position={70}
          referenceLine1Config={{ color: Colors.glucoseInRange, dashWidth: 4, dashGap: 4, thickness: 1 }}
        />

        {/* Custom x-axis labels */}
        <View style={{ height: 14, marginLeft: Y_AXIS_W, position: 'relative' }}>
          {labelTexts.map((lbl, i) => {
            if (!lbl) return null;
            const cx = INIT + i * (barWidth + spacing) + barWidth / 2;
            return (
              <Text key={i} style={{ position: 'absolute', left: cx - 14, width: 28, fontSize: 9, color: Colors.mutedForeground, textAlign: 'center' }}>
                {lbl}
              </Text>
            );
          })}
        </View>

        {/* Tooltip overlay */}
        {selectedItem !== null && selectedIdx !== null && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 6,
              left: tooltipLeft,
              width: 110,
              backgroundColor: Colors.card,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: Colors.cardBorder,
              padding: 8,
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>{fullLabels[selectedIdx]}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.glucoseInRange }}>
              {Math.round(selectedItem.tir70_180)}% in range
            </Text>
            <Text style={{ fontSize: 10, color: Colors.glucoseLow }}>
              {Math.round(selectedItem.below70)}% low
            </Text>
            <Text style={{ fontSize: 10, color: Colors.glucoseHigh }}>
              {Math.round(Math.max(0, 100 - selectedItem.tir70_180 - selectedItem.below70))}% high
            </Text>
          </View>
        )}
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
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
