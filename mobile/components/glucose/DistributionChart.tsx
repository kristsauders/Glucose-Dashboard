import { View, Text } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Colors } from '../../constants/colors';
import type { BucketData } from '../../hooks/useGlucose';
import { Dimensions } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H  = 140;

interface Props {
  distribution: BucketData[];
}

function bucketColor(low: number): string {
  if (low < 70)  return Colors.glucoseLow;
  if (low < 180) return Colors.glucoseInRange;
  return Colors.glucoseHigh;
}

export function DistributionChart({ distribution }: Props) {
  // Filter out empty edge buckets, keep a reasonable range (e.g. 40–380)
  const visible = distribution.filter(b => b.low >= 40 && b.low < 380);
  const maxPct  = Math.max(...visible.map(b => b.pct), 1);

  const barW = Math.floor((SCREEN_W - 64 - 30) / visible.length) - 2;

  const barData = visible.map(b => ({
    value: parseFloat(b.pct.toFixed(1)),
    frontColor: bucketColor(b.low),
    label: b.low % 40 === 0 ? `${b.low}` : '',  // label every 40mg/dL
  }));

  return (
    <View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground, marginBottom: 8 }}>
        Glucose distribution
      </Text>
      <BarChart
        data={barData}
        width={SCREEN_W - 64}
        height={CHART_H}
        maxValue={Math.ceil(maxPct / 5) * 5}
        noOfSections={4}
        barWidth={Math.max(4, barW)}
        spacing={2}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 8 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisLabelWidth={30}
        rulesColor={Colors.border}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
        yAxisLabelSuffix="%"
      />
      <Text style={{ fontSize: 10, color: Colors.mutedForeground, marginTop: 2, textAlign: 'center' }}>
        mg/dL (each bar = 20 mg/dL)
      </Text>
    </View>
  );
}
