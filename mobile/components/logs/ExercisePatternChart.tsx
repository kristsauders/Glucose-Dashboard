import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Colors } from '../../constants/colors';
import { format } from 'date-fns';
import type { ExerciseLog } from '../../types/logs';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H  = 140;

function intensityBucket(log: ExerciseLog): 'light' | 'moderate' | 'intense' {
  const s = ((log.intensity ?? '') + ' ' + (log.activity_type ?? '')).toLowerCase();
  if (s.includes('intense') || s.includes('high') || s.includes('run') || s.includes('hiit')) return 'intense';
  if (s.includes('light') || s.includes('walk') || s.includes('easy') || s.includes('low')) return 'light';
  return 'moderate';
}

interface Props {
  exercises: ExerciseLog[];
}

export function ExercisePatternChart({ exercises }: Props) {
  if (!exercises || exercises.length === 0) return null;

  const byDay = new Map<string, { light: number; moderate: number; intense: number }>();
  for (const e of exercises) {
    const key = format(new Date(e.timestamp), 'yyyy-MM-dd');
    const cur = byDay.get(key) ?? { light: 0, moderate: 0, intense: 0 };
    cur[intensityBucket(e)] += e.duration_minutes ?? 0;
    byDay.set(key, cur);
  }

  const entries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;

  const totals = entries.map(([, v]) => v.light + v.moderate + v.intense);
  const avgTotal = Math.round(totals.reduce((s, v) => s + v, 0) / totals.length);
  const maxVal = Math.max(...totals);
  const barW = Math.max(8, Math.floor((SCREEN_W - 96) / entries.length) - 3);

  const stackData = entries.map(([dateIso, v], i) => ({
    stacks: [
      { value: v.light,    color: '#93C5FD' },  // light blue
      { value: v.moderate, color: '#34D399' },  // green
      { value: v.intense,  color: '#F87171' },  // red
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
          Exercise Pattern
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#34D399' }}>{avgTotal}m</Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>avg / day</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        {[
          { color: '#93C5FD', label: 'Light' },
          { color: '#34D399', label: 'Moderate' },
          { color: '#F87171', label: 'Intense' },
        ].map(({ color, label }) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
            <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>{label}</Text>
          </View>
        ))}
      </View>

      <BarChart
        stackData={stackData}
        width={SCREEN_W - 96}
        height={CHART_H}
        maxValue={Math.ceil(maxVal / 30) * 30 || 60}
        noOfSections={4}
        barWidth={Math.max(4, barW)}
        spacing={3}
        xAxisLabelTextStyle={{ color: Colors.mutedForeground, fontSize: 8 }}
        yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
        yAxisLabelWidth={30}
        yAxisLabelSuffix="m"
        rulesColor={Colors.border}
        yAxisColor="transparent"
        xAxisColor={Colors.border}
      />
    </View>
  );
}
