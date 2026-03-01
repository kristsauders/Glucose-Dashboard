import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import { format } from 'date-fns';
import type { InsulinLog } from '../../types/logs';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 140;

const BASAL_BRANDS = ['lantus', 'tresiba', 'levemir', 'basaglar', 'toujeo', 'glargine', 'detemir', 'degludec'];

function isBasal(log: InsulinLog): boolean {
  const typeStr = ((log.insulin_type ?? '') + ' ' + (log.brand_name ?? '')).toLowerCase();
  return BASAL_BRANDS.some(b => typeStr.includes(b));
}

interface Props {
  doses: InsulinLog[];
}

export function InsulinUsageChart({ doses }: Props) {
  const Colors = useColors();
  if (!doses || doses.length === 0) return null;

  const byDay = new Map<string, { basal: number; rapid: number }>();
  for (const d of doses) {
    const key = format(new Date(d.timestamp), 'yyyy-MM-dd');
    const cur = byDay.get(key) ?? { basal: 0, rapid: 0 };
    if (isBasal(d)) cur.basal += Number(d.units);
    else cur.rapid += Number(d.units);
    byDay.set(key, cur);
  }

  const entries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;

  const Y_AXIS_W = 36;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(entries.length / 7);
  const barWidth = Math.max(6, Math.floor(CHART_W / entries.length) - 4);
  const spacing = Math.max(2, Math.floor(CHART_W / entries.length) - barWidth - 2);

  const totals = entries.map(([, v]) => v.basal + v.rapid);
  const avgTotal = Math.round(totals.reduce((s, v) => s + v, 0) / totals.length);
  const avgBasal = Math.round(entries.reduce((s, [, v]) => s + v.basal, 0) / entries.length);
  const avgRapid = Math.round(entries.reduce((s, [, v]) => s + v.rapid, 0) / entries.length);
  const maxVal = Math.max(...totals);

  // Integer y-axis labels (units)
  const yMax = Math.ceil(maxVal / 10) * 10 || 30;
  const noOfSections = 4;
  const sectionSize = yMax / noOfSections;
  const yLabels = [0, 1, 2, 3, 4].map(i => `${Math.round(sectionSize * i)}u`);

  const stackData = entries.map(([dateIso, v], i) => ({
    stacks: [
      { value: v.basal, color: '#60A5FA' },  // blue = basal
      { value: v.rapid, color: '#F472B6' },  // pink = rapid
    ],
    label: i % step === 0
      ? format(new Date(dateIso + 'T12:00:00'), 'M/d')
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.foreground }}>
          Daily Insulin Usage
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.foreground }}>{avgTotal}u</Text>
            <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>total avg</Text>
          </View>
        </View>
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#60A5FA' }} />
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>Basal avg {avgBasal}u</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#F472B6' }} />
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>Rapid avg {avgRapid}u</Text>
        </View>
      </View>

      <BarChart
        stackData={stackData}
        width={CHART_W}
        height={CHART_H}
        maxValue={yMax}
        noOfSections={noOfSections}
        barWidth={barWidth}
        spacing={spacing}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisLabelWidth={Y_AXIS_W}
        yAxisLabelTexts={yLabels}
        rulesColor={Colors.border + '40'}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
      />
    </View>
  );
}
