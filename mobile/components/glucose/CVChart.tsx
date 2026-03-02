import { useState } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { DayMetrics, WeekMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 160;
const CV_TARGET = 36; // % — below this is good
const INITIAL_SPACING = 20;

interface Props {
  daily?: DayMetrics[];
  weekly?: WeekMetrics[];
  useWeekly?: boolean;
}

export function CVChart({ daily, weekly, useWeekly }: Props) {
  const Colors = useColors();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const items = useWeekly ? weekly : daily;
  if (!items || items.length === 0) return null;

  const Y_AXIS_W = 40;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(items.length / 7);
  const computedSpacing = items.length > 1 ? Math.max(2, Math.floor((CHART_W - INITIAL_SPACING) / (items.length - 1))) : 20;

  const cvValues = items.map(d => d.cv);
  const avgCV = Math.round((cvValues.reduce((s, v) => s + v, 0) / cvValues.length) * 10) / 10;
  const maxCV = Math.max(...cvValues, CV_TARGET + 5);
  const yMax = Math.ceil(maxCV / 10) * 10;
  const noOfSections = 4;
  const sectionSize = yMax / noOfSections;

  // 1-decimal % y-axis labels
  const yLabels = [0, 1, 2, 3, 4].map(i => `${(sectionSize * i).toFixed(1)}%`);

  // Labels stored separately; data items get '' to avoid slot-width clipping
  const labelTexts = items.map((d, i) =>
    i % step === 0 && i < items.length - 1
      ? ('label' in d ? d.label : (d as WeekMetrics).weekLabel)
      : ''
  );

  const lineData = items.map(d => ({ value: d.cv, label: '' }));

  const cvColor = avgCV <= CV_TARGET ? Colors.glucoseInRange : Colors.glucoseHigh;

  const getDateLabel = (d: typeof items[0]) => 'label' in d ? d.label : (d as WeekMetrics).weekLabel;

  const handleTouch = (e: any) => {
    const dataX = e.nativeEvent.locationX - Y_AXIS_W - INITIAL_SPACING;
    if (dataX < 0) { setSelectedIdx(null); return; }
    setSelectedIdx(Math.max(0, Math.min(Math.round(dataX / computedSpacing), items.length - 1)));
  };
  const stripX = selectedIdx !== null ? Y_AXIS_W + INITIAL_SPACING + selectedIdx * computedSpacing : 0;
  const tooltipLeft = Math.max(Y_AXIS_W, Math.min(Y_AXIS_W + CHART_W - 80, stripX - 40));

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
          Glucose Variability (CV)
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: cvColor }}>{avgCV.toFixed(1)}%</Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>avg CV</Text>
        </View>
      </View>

      <Text style={{ fontSize: 10, color: Colors.mutedForeground, marginBottom: 8 }}>
        {avgCV <= CV_TARGET ? 'Good variability — below 36% target' : 'High variability — above 36% target'}
      </Text>

      <View
        style={{ position: 'relative' }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => setSelectedIdx(null)}
        onResponderTerminate={() => setSelectedIdx(null)}
      >
        <LineChart
          data={lineData}
          width={CHART_W}
          height={CHART_H}
          spacing={computedSpacing}
          disableScroll
          maxValue={yMax}
          noOfSections={noOfSections}
          yAxisLabelTexts={yLabels}
          yAxisLabelWidth={Y_AXIS_W}
          color={cvColor}
          thickness={2}
          curved
          hideDataPoints={items.length > 20}
          dataPointsColor={cvColor}
          dataPointsRadius={3}
          yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
          rulesColor={Colors.border + '40'}
          yAxisColor="transparent"
          xAxisColor={Colors.border}
          referenceLine1={{
            value: CV_TARGET,
            lineConfig: {
              color: Colors.mutedForeground,
              thickness: 1,
              dashWidth: 4,
              dashGap: 4,
              labelText: '36%',
              labelTextStyle: { color: Colors.mutedForeground, fontSize: 8 },
            },
          }}
          showReferenceLine1
        />

        {/* Pointer strip */}
        {selectedIdx !== null && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: stripX - 0.5,
              width: 1,
              height: CHART_H,
              backgroundColor: Colors.mutedForeground + '50',
            }}
          />
        )}

        {/* Tooltip — fixed at top so it's always above the finger */}
        {selectedIdx !== null && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 8,
              left: tooltipLeft,
              width: 80,
              backgroundColor: Colors.card,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: Colors.cardBorder,
              padding: 8,
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: cvColor }}>
              {items[selectedIdx].cv.toFixed(1)}%
            </Text>
            <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>
              {getDateLabel(items[selectedIdx])}
            </Text>
          </View>
        )}
      </View>

      {/* Custom x-axis labels */}
      <View style={{ height: 14, marginLeft: Y_AXIS_W, position: 'relative' }}>
        {labelTexts.map((lbl, i) => {
          if (!lbl) return null;
          const cx = INITIAL_SPACING + i * computedSpacing;
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
