import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Colors } from '../../constants/colors';
import { format } from 'date-fns';
import type { InsulinLog } from '../../types/logs';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H  = 140;

const BASAL_BRANDS = ['lantus', 'tresiba', 'levemir', 'basaglar', 'toujeo', 'glargine', 'detemir', 'degludec'];

function isBasal(log: InsulinLog): boolean {
  const typeStr = ((log.insulin_type ?? '') + ' ' + (log.brand_name ?? '')).toLowerCase();
  return BASAL_BRANDS.some(b => typeStr.includes(b));
}

interface Props {
  doses: InsulinLog[];
}

export function InsulinUsageChart({ doses }: Props) {
  if (!doses || doses.length === 0) return null;

  const byDay = new Map<string, { basal: number; rapid: number }>();
  for (const d of doses) {
    const key = format(new Date(d.timestamp), 'yyyy-MM-dd');
    const cur = byDay.get(key) ?? { basal: 0, rapid: 0 };
    if (isBasal(d)) cur.basal += d.units;
    else cur.rapid += d.units;
    byDay.set(key, cur);
  }

  const entries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;

  const totals = entries.map(([, v]) => v.basal + v.rapid);
  const avgTotal = Math.round(totals.reduce((s, v) => s + v, 0) / totals.length);
  const avgBasal = Math.round(entries.reduce((s, [, v]) => s + v.basal, 0) / entries.length);
  const avgRapid = Math.round(entries.reduce((s, [, v]) => s + v.rapid, 0) / entries.length);
  const maxVal = Math.max(...totals);
  const barW = Math.max(8, Math.floor((SCREEN_W - 96) / entries.length) - 3);

  const stackData = entries.map(([dateIso, v], i) => ({
    stacks: [
      { value: v.basal, color: '#60A5FA' },  // blue = basal
      { value: v.rapid, color: '#F472B6' },  // pink = rapid
    ],
    label: i % Math.ceil(entries.length / 7) === 0
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
        width={SCREEN_W - 96}
        height={CHART_H}
        maxValue={Math.ceil(maxVal / 10) * 10 || 30}
        noOfSections={4}
        barWidth={Math.max(4, barW)}
        spacing={3}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 8 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisLabelWidth={30}
        yAxisLabelSuffix="u"
        rulesColor={Colors.border}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
      />
    </View>
  );
}
