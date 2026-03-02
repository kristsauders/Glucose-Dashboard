import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { ColorScheme } from '../../constants/colors';
import type { WeekMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 160;

interface Props {
  weekly: WeekMetrics[];
}

function a1cLabel(a1c: number): string {
  if (a1c < 5.7) return 'Non-diabetic range';
  if (a1c < 6.5) return 'Pre-diabetic range';
  if (a1c < 7.0) return 'Well-controlled';
  if (a1c < 8.0) return 'Moderately controlled';
  return 'High — consider adjustment';
}

function a1cColor(a1c: number, colors: ColorScheme): string {
  if (a1c < 6.5) return colors.glucoseInRange;
  if (a1c < 7.5) return colors.glucoseHigh;
  return colors.glucoseLow;
}

export function WeeklyA1CChart({ weekly }: Props) {
  const Colors = useColors();
  if (!weekly || weekly.length < 2) return null;

  const Y_AXIS_W = 40;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(weekly.length / 7);

  const a1cValues = weekly.map(w => w.estA1c);
  const avgA1c = Math.round((a1cValues.reduce((s, v) => s + v, 0) / a1cValues.length) * 10) / 10;
  const latestA1c = a1cValues[a1cValues.length - 1];
  const minA1c = Math.min(...a1cValues);
  const maxA1c = Math.max(...a1cValues);
  const chartMin = Math.max(4, minA1c - 0.5);
  const chartMax = Math.min(10, maxA1c + 0.5);
  const noOfSections = 4;
  const sectionSize = (chartMax - chartMin) / noOfSections;

  // 1-decimal % y-axis labels
  const yLabels = [0, 1, 2, 3, 4].map(i => `${(chartMin + sectionSize * i).toFixed(1)}%`);

  const lineData = weekly.map((w, i) => ({
    value: w.estA1c,
    label: i % step === 0 && i < weekly.length - 1 ? w.weekLabel : '',
  }));

  const lineColor = a1cColor(avgA1c, Colors);

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
          Estimated A1C Trend
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: lineColor }}>{latestA1c.toFixed(1)}%</Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>latest week</Text>
        </View>
      </View>

      <Text style={{ fontSize: 10, color: Colors.mutedForeground, marginBottom: 8 }}>
        {a1cLabel(avgA1c)} · avg {avgA1c.toFixed(1)}%
      </Text>

      <LineChart
        data={lineData}
        width={CHART_W}
        height={CHART_H}
        spacing={weekly.length > 1 ? Math.max(2, Math.floor((CHART_W - 20) / (weekly.length - 1))) : 20}
        disableScroll
        maxValue={chartMax}
        mostNegativeValue={chartMin}
        noOfSections={noOfSections}
        yAxisLabelTexts={yLabels}
        yAxisLabelWidth={Y_AXIS_W}
        color={lineColor}
        thickness={2.5}
        curved
        hideDataPoints={weekly.length > 16}
        dataPointsColor={lineColor}
        dataPointsRadius={4}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        xAxisLabelContainerStyle={{ width: 36 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        rulesColor={Colors.border + '40'}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
        referenceLine1={{
          value: 5.7,
          lineConfig: {
            color: Colors.glucoseInRange,
            thickness: 1,
            dashWidth: 4,
            dashGap: 4,
            labelText: '5.7%',
            labelTextStyle: { color: Colors.glucoseInRange, fontSize: 8 },
          },
        }}
        referenceLine2={{
          value: 6.5,
          lineConfig: {
            color: Colors.glucoseHigh,
            thickness: 1,
            dashWidth: 4,
            dashGap: 4,
            labelText: '6.5%',
            labelTextStyle: { color: Colors.glucoseHigh, fontSize: 8 },
          },
        }}
        showReferenceLine1
        showReferenceLine2
      />
    </View>
  );
}
