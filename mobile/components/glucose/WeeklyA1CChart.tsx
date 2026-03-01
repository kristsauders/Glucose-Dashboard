import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { ColorScheme } from '../../constants/colors';
import type { WeekMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H  = 160;

interface Props {
  weekly: WeekMetrics[];
}

function a1cLabel(a1c: number): string {
  if (a1c < 5.7)  return 'Non-diabetic range';
  if (a1c < 6.5)  return 'Pre-diabetic range';
  if (a1c < 7.0)  return 'Well-controlled';
  if (a1c < 8.0)  return 'Moderately controlled';
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

  const a1cValues = weekly.map(w => w.estA1c);
  const avgA1c = Math.round((a1cValues.reduce((s, v) => s + v, 0) / a1cValues.length) * 10) / 10;
  const latestA1c = a1cValues[a1cValues.length - 1];
  const minA1c = Math.min(...a1cValues);
  const maxA1c = Math.max(...a1cValues);
  const chartMin = Math.max(4, minA1c - 0.5);
  const chartMax = Math.min(10, maxA1c + 0.5);

  const lineData = weekly.map(w => ({
    value: w.estA1c,
    label: w.weekLabel,
  }));

  const lineColor = a1cColor(avgA1c, Colors);

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
          Estimated A1C Trend
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: lineColor }}>{latestA1c}%</Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>latest week</Text>
        </View>
      </View>

      <Text style={{ fontSize: 10, color: Colors.mutedForeground, marginBottom: 8 }}>
        {a1cLabel(avgA1c)} · avg {avgA1c}%
      </Text>

      <LineChart
        data={lineData}
        width={SCREEN_W - 96}
        height={CHART_H}
        maxValue={Math.ceil(chartMax * 2) / 2}
        noOfSections={4}
        stepValue={(chartMax - chartMin) / 4}
        color={lineColor}
        thickness={2.5}
        curved
        hideDataPoints={weekly.length > 16}
        dataPointsColor={lineColor}
        dataPointsRadius={4}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 8 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisLabelWidth={30}
        yAxisLabelSuffix="%"
        rulesColor={Colors.border}
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
