import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import type { DayMetrics, WeekMetrics } from '../../hooks/useGlucose';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 160;
const CV_TARGET = 36; // % — below this is good

interface Props {
  daily?: DayMetrics[];
  weekly?: WeekMetrics[];
  useWeekly?: boolean;
}

export function CVChart({ daily, weekly, useWeekly }: Props) {
  const Colors = useColors();
  const items = useWeekly ? weekly : daily;
  if (!items || items.length === 0) return null;

  const Y_AXIS_W = 40;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(items.length / 7);

  const cvValues = items.map(d => d.cv);
  const avgCV = Math.round((cvValues.reduce((s, v) => s + v, 0) / cvValues.length) * 10) / 10;
  const maxCV = Math.max(...cvValues, CV_TARGET + 5);
  const yMax = Math.ceil(maxCV / 10) * 10;
  const noOfSections = 4;
  const sectionSize = yMax / noOfSections;

  // 1-decimal % y-axis labels
  const yLabels = [0, 1, 2, 3, 4].map(i => `${(sectionSize * i).toFixed(1)}%`);

  const lineData = items.map((d, i) => ({
    value: d.cv,
    label: i % step === 0 && i < items.length - 1
      ? ('label' in d ? d.label : (d as WeekMetrics).weekLabel)
      : '',
  }));

  const cvColor = avgCV <= CV_TARGET ? Colors.glucoseInRange : Colors.glucoseHigh;

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

      <LineChart
        data={lineData}
        width={CHART_W}
        height={CHART_H}
        spacing={items.length > 1 ? Math.max(2, Math.floor((CHART_W - 20) / (items.length - 1))) : 20}
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
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        xAxisLabelContainerStyle={{ width: 36 }}
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
    </View>
  );
}
