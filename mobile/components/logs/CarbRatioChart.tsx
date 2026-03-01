import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import { format } from 'date-fns';
import type { MealLog, InsulinLog } from '../../types/logs';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 180;

const BASAL_TYPES = ['lantus', 'tresiba', 'levemir', 'toujeo', 'glargine', 'detemir', 'basaglar', 'degludec'];

function isBasal(insulinType: string): boolean {
  return BASAL_TYPES.some(t => insulinType.toLowerCase().includes(t));
}

interface DayRatio {
  date: string;
  ratio: number;
  carbs: number;
  insulin: number;
}

interface Props {
  meals: MealLog[];
  insulin: InsulinLog[];
}

function computeDailyRatios(meals: MealLog[], doses: InsulinLog[]): DayRatio[] {
  // Group meals by day
  const carbsByDay = new Map<string, number>();
  for (const m of meals) {
    const key = format(new Date(m.timestamp), 'yyyy-MM-dd');
    carbsByDay.set(key, (carbsByDay.get(key) ?? 0) + Number(m.carbs ?? 0));
  }

  // Group rapid insulin by day (exclude basal)
  const rapidByDay = new Map<string, number>();
  for (const d of doses) {
    const typeStr = ((d.insulin_type ?? '') + ' ' + (d.brand_name ?? '')).toLowerCase();
    if (isBasal(typeStr)) continue;
    const key = format(new Date(d.timestamp), 'yyyy-MM-dd');
    rapidByDay.set(key, (rapidByDay.get(key) ?? 0) + Number(d.units));
  }

  // Only include days where both carbs > 0 AND rapid > 0
  const result: DayRatio[] = [];
  for (const [date, carbs] of carbsByDay.entries()) {
    const rapid = rapidByDay.get(date) ?? 0;
    if (carbs > 0 && rapid > 0) {
      result.push({
        date,
        ratio: carbs / rapid,
        carbs,
        insulin: rapid,
      });
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export function CarbRatioChart({ meals, insulin }: Props) {
  const Colors = useColors();

  if (!meals || meals.length === 0) return null;
  if (!insulin || insulin.length === 0) return null;

  const ratios = computeDailyRatios(meals, insulin);
  if (ratios.length === 0) return null;

  const Y_AXIS_W = 28;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(ratios.length / 7);

  const avgRatio = ratios.reduce((s, r) => s + r.ratio, 0) / ratios.length;
  const maxRatio = Math.max(...ratios.map(r => r.ratio), 16);
  const yMax = Math.ceil(maxRatio / 5) * 5;
  const noOfSections = 5; // 0, 5, 10, 15, 20, 25 — nice for ratios

  // Integer y-axis labels
  const sectionSize = yMax / noOfSections;
  const yLabels = [0, 1, 2, 3, 4, 5].map(i => Math.round(sectionSize * i).toString());

  const TARGET_MIN = 8;
  const TARGET_MAX = 15;
  const isInTarget = avgRatio >= TARGET_MIN && avgRatio <= TARGET_MAX;
  const lineColor = isInTarget ? Colors.glucoseInRange : Colors.warning;

  const lineData = ratios.map((r, i) => ({
    value: parseFloat(r.ratio.toFixed(1)),
    label: i % step === 0
      ? format(new Date(r.date + 'T12:00:00'), 'M/d')
      : '',
  }));

  return (
    <View style={{
      backgroundColor: Colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: Colors.cardBorder,
      padding: 16,
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
          Carb-to-Insulin Ratio
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: lineColor }}>
            {avgRatio.toFixed(1)}:1
          </Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>avg (g/u)</Text>
        </View>
      </View>

      <Text style={{ fontSize: 10, color: Colors.mutedForeground, marginBottom: 10 }}>
        {isInTarget
          ? `Good ratio — within 8–15 g/u target range`
          : avgRatio < TARGET_MIN
          ? `Low ratio (${avgRatio.toFixed(1)}) — consider more carbs per unit`
          : `High ratio (${avgRatio.toFixed(1)}) — consider adjusting dosing`
        }
      </Text>

      <LineChart
        data={lineData}
        width={CHART_W}
        height={CHART_H}
        maxValue={yMax}
        mostNegativeValue={0}
        noOfSections={noOfSections}
        yAxisLabelTexts={yLabels}
        yAxisLabelWidth={Y_AXIS_W}
        color={lineColor}
        thickness={2}
        curved
        hideDataPoints={ratios.length > 20}
        dataPointsColor={lineColor}
        dataPointsRadius={4}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        rulesColor={Colors.border + '40'}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
        referenceLine1={{
          value: TARGET_MIN,
          lineConfig: {
            color: Colors.glucoseInRange,
            thickness: 1,
            dashWidth: 4,
            dashGap: 4,
            labelText: '8',
            labelTextStyle: { color: Colors.glucoseInRange, fontSize: 8 },
          },
        }}
        referenceLine2={{
          value: TARGET_MAX,
          lineConfig: {
            color: Colors.glucoseInRange,
            thickness: 1,
            dashWidth: 4,
            dashGap: 4,
            labelText: '15',
            labelTextStyle: { color: Colors.glucoseInRange, fontSize: 8 },
          },
        }}
        showReferenceLine1
        showReferenceLine2
      />

      {/* Reference zone legend */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <View style={{
          width: 14,
          height: 14,
          backgroundColor: Colors.glucoseInRange + '20',
          borderWidth: 1,
          borderColor: Colors.glucoseInRange,
          borderRadius: 3,
        }} />
        <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>
          Target range: 8–15 g per unit
        </Text>
      </View>
    </View>
  );
}
