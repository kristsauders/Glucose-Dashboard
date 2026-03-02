import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { ColorScheme } from '../../constants/colors';
import type { BucketData } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 140;

interface Props {
  distribution: BucketData[];
}

function bucketColor(low: number, colors: ColorScheme): string {
  if (low < 70) return colors.glucoseLow;
  if (low < 180) return colors.glucoseInRange;
  return colors.glucoseHigh;
}

export function DistributionChart({ distribution }: Props) {
  const Colors = useColors();

  // Filter out empty edge buckets, keep 40–380
  const visible = distribution.filter(b => b.low >= 40 && b.low < 380);
  if (visible.length === 0) return null;

  const maxPct = Math.max(...visible.map(b => b.pct), 1);
  const Y_AXIS_W = 36;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;

  // Dynamic bar sizing to fill width
  const INIT = 8;
  const slotW = Math.max(3, (CHART_W - INIT) / visible.length);
  const barWidth = Math.max(2, Math.floor(slotW * 0.6));
  const spacing = Math.max(1, Math.floor(slotW) - barWidth);

  // Integer y-axis labels (percentage)
  const yMax = Math.ceil(maxPct / 5) * 5;
  const sectionSize = yMax / 4;
  const yLabels = [0, 1, 2, 3, 4].map(i => `${Math.round(sectionSize * i)}%`);

  const barData = visible.map(b => ({
    value: parseFloat(b.pct.toFixed(1)),
    frontColor: bucketColor(b.low, Colors),
    label: b.low % 40 === 0 ? `${b.low}` : '',
  }));

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground, marginBottom: 8 }}>
        Glucose distribution
      </Text>
      <BarChart
        data={barData}
        width={CHART_W}
        height={CHART_H}
        maxValue={yMax}
        noOfSections={4}
        barWidth={barWidth}
        spacing={spacing}
        initialSpacing={INIT}
        disableScroll
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 8 }}
        xAxisLabelContainerStyle={{ width: 36 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisLabelWidth={Y_AXIS_W}
        yAxisLabelTexts={yLabels}
        rulesColor={Colors.border + '40'}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
      />
      <Text style={{ fontSize: 10, color: Colors.mutedForeground, marginTop: 4, textAlign: 'center' }}>
        mg/dL (each bar = 20 mg/dL)
      </Text>
    </View>
  );
}
