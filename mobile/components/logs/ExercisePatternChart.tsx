import { useState } from 'react';
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
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

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
  const INIT = 8;
  const slotW = Math.max(3, (CHART_W - INIT) / entries.length);
  const barWidth = Math.max(2, Math.floor(slotW * 0.6));
  const spacing = Math.max(1, Math.floor(slotW) - barWidth);

  const totals = entries.map(([, v]) => v.light + v.moderate + v.intense);
  const avgTotal = Math.round(totals.reduce((s, v) => s + v, 0) / totals.length);
  const maxVal = Math.max(...totals);

  // Integer y-axis labels (minutes)
  const yMax = Math.ceil(maxVal / 30) * 30 || 60;
  const noOfSections = 4;
  const sectionSize = yMax / noOfSections;
  const yLabels = [0, 1, 2, 3, 4].map(i => `${Math.round(sectionSize * i)}m`);

  const stackData = entries.map(([, v]) => ({
    stacks: [
      { value: v.light, color: '#93C5FD' },    // light blue
      { value: v.moderate, color: '#34D399' },  // green
      { value: v.intense, color: '#F87171' },   // red
    ],
    label: '',
  }));

  // Tooltip position
  const barCenterX = selectedIdx !== null
    ? Y_AXIS_W + INIT + selectedIdx * (barWidth + spacing) + barWidth / 2
    : 0;
  const tooltipLeft = Math.max(Y_AXIS_W, Math.min(Y_AXIS_W + CHART_W - 110, barCenterX - 55));

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

      <View
        style={{ position: 'relative' }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          const dataX = e.nativeEvent.locationX - Y_AXIS_W - INIT;
          if (dataX < 0) { setSelectedIdx(null); return; }
          setSelectedIdx(Math.max(0, Math.min(Math.round(dataX / (barWidth + spacing)), entries.length - 1)));
        }}
        onResponderMove={(e) => {
          const dataX = e.nativeEvent.locationX - Y_AXIS_W - INIT;
          if (dataX < 0) { setSelectedIdx(null); return; }
          setSelectedIdx(Math.max(0, Math.min(Math.round(dataX / (barWidth + spacing)), entries.length - 1)));
        }}
        onResponderRelease={() => setSelectedIdx(null)}
        onResponderTerminate={() => setSelectedIdx(null)}
      >
        <BarChart
          stackData={stackData}
          width={CHART_W}
          height={CHART_H}
          maxValue={yMax}
          noOfSections={noOfSections}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={INIT}
          disableScroll
          yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 9 }}
          yAxisLabelWidth={Y_AXIS_W}
          yAxisLabelTexts={yLabels}
          rulesColor={Colors.border + '40'}
          yAxisColor="transparent"
          xAxisColor={Colors.border}
        />

        {/* Custom x-axis labels */}
        <View style={{ height: 14, marginLeft: Y_AXIS_W, position: 'relative' }}>
          {entries.map(([dateIso], i) => {
            if (i % step !== 0 || i >= entries.length - 1) return null;
            const cx = INIT + i * (barWidth + spacing) + barWidth / 2;
            return (
              <Text
                key={i}
                style={{
                  position: 'absolute',
                  left: cx - 14,
                  width: 28,
                  fontSize: 9,
                  color: Colors.mutedForeground,
                  textAlign: 'center',
                }}
              >
                {format(new Date(dateIso + 'T12:00:00'), 'M/d')}
              </Text>
            );
          })}
        </View>

        {/* Tooltip overlay */}
        {selectedIdx !== null && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 6,
              left: tooltipLeft,
              width: 110,
              backgroundColor: Colors.card,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: Colors.cardBorder,
              padding: 8,
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>
              {format(new Date(entries[selectedIdx][0] + 'T12:00:00'), 'MMM d')}
            </Text>
            {entries[selectedIdx][1].light > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#93C5FD' }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#93C5FD' }}>
                  {Math.round(entries[selectedIdx][1].light)}m
                </Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>light</Text>
              </View>
            )}
            {entries[selectedIdx][1].moderate > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#34D399' }}>
                  {Math.round(entries[selectedIdx][1].moderate)}m
                </Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>mod</Text>
              </View>
            )}
            {entries[selectedIdx][1].intense > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F87171' }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#F87171' }}>
                  {Math.round(entries[selectedIdx][1].intense)}m
                </Text>
                <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>intense</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
