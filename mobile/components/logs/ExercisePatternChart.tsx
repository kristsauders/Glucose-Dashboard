import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import { format } from 'date-fns';
import type { ExerciseLog } from '../../types/logs';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 140;

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
  const Colors = useColors();
  if (!exercises || exercises.length === 0) return null;

  const byDay = new Map<string, { light: number; moderate: number; intense: number }>();
  for (const e of exercises) {
    const key = format(new Date(e.timestamp), 'yyyy-MM-dd');
    const cur = byDay.get(key) ?? { light: 0, moderate: 0, intense: 0 };
    cur[intensityBucket(e)] += Number(e.duration_minutes ?? 0);
    byDay.set(key, cur);
  }

  const entries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;

  const Y_AXIS_W = 36;
  const CHART_W = SCREEN_W - 66 - Y_AXIS_W;
  const step = Math.ceil(entries.length / 7);
  const barWidth = Math.max(6, Math.floor(CHART_W / entries.length) - 4);
  const spacing = Math.max(2, Math.floor(CHART_W / entries.length) - barWidth - 2);

  const totals = entries.map(([, v]) => v.light + v.moderate + v.intense);
  const avgTotal = Math.round(totals.reduce((s, v) => s + v, 0) / totals.length);
  const maxVal = Math.max(...totals);

  // Integer y-axis labels (minutes)
  const yMax = Math.ceil(maxVal / 30) * 30 || 60;
  const noOfSections = 4;
  const sectionSize = yMax / noOfSections;
  const yLabels = [0, 1, 2, 3, 4].map(i => `${Math.round(sectionSize * i)}m`);

  const stackData = entries.map(([dateIso, v], i) => ({
    stacks: [
      { value: v.light, color: '#93C5FD' },    // light blue
      { value: v.moderate, color: '#34D399' },  // green
      { value: v.intense, color: '#F87171' },   // red
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
