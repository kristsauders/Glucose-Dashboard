import { useState } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useColors } from '../../constants/colors';
import { format } from 'date-fns';
import type { MealLog } from '../../types/logs';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H = 140;

interface Props {
  meals: MealLog[];
}

export function DailyCarbChart({ meals }: Props) {
  const Colors = useColors();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  if (!meals || meals.length === 0) return null;

  // Group by local date
  const byDay = new Map<string, number>();
  for (const m of meals) {
    const key = format(new Date(m.timestamp), 'yyyy-MM-dd');
    byDay.set(key, (byDay.get(key) ?? 0) + Number(m.carbs ?? 0));
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

  const totals = entries.map(([, v]) => v);
  const avgCarbs = Math.round(totals.reduce((s, v) => s + v, 0) / totals.length);
  const maxVal = Math.max(...totals);

  // Integer y-axis labels (grams)
  const yMax = Math.ceil(maxVal / 50) * 50 || 100;
  const noOfSections = 4;
  const sectionSize = yMax / noOfSections;
  const yLabels = [0, 1, 2, 3, 4].map(i => `${Math.round(sectionSize * i)}g`);

  const barData = entries.map(([, total]) => ({
    value: total,
    label: '',
    frontColor: Colors.primary,
  }));

  // Tooltip position
  const barCenterX = selectedIdx !== null
    ? Y_AXIS_W + INIT + selectedIdx * (barWidth + spacing) + barWidth / 2
    : 0;
  const tooltipLeft = Math.max(Y_AXIS_W, Math.min(Y_AXIS_W + CHART_W - 90, barCenterX - 45));

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
          Daily Carb Intake
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.primary }}>{avgCarbs}g</Text>
          <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>avg / day</Text>
        </View>
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
          data={barData}
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
          referenceLine1={{
            value: avgCarbs,
            lineConfig: {
              color: Colors.mutedForeground,
              thickness: 1,
              dashWidth: 4,
              dashGap: 4,
              labelText: `avg ${avgCarbs}g`,
              labelTextStyle: { color: Colors.mutedForeground, fontSize: 8 },
            },
          }}
          showReferenceLine1
        />

        {/* Custom x-axis labels — positioned manually to avoid gifted-charts slot-width clipping */}
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
              width: 90,
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
            <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>
              {Math.round(entries[selectedIdx][1])}g
            </Text>
            <Text style={{ fontSize: 9, color: Colors.mutedForeground }}>carbs</Text>
          </View>
        )}
      </View>
    </View>
  );
}
