import { useState } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { format } from 'date-fns';
import { useColors } from '../../constants/colors';
import { GLUCOSE_LOW, GLUCOSE_HIGH } from '../../constants/config';
import type { GlucoseReading } from '../../types/glucose';

// Chart sizing constants
const Y_AXIS_W = 30;
const INIT_SPACE = 4;
const END_SPACE = 4;
const CHART_H = 160;

// Total container width: full screen minus horizontal padding (16px scroll + 16px card on each side)
const CONTAINER_W = Dimensions.get('window').width - 64;

// react-native-gifted-charts adds yAxisLabelWidth ON TOP of the `width` prop, so we subtract it.
// Total rendered chart width = LINE_CHART_W + Y_AXIS_W = CONTAINER_W ✓
const LINE_CHART_W = CONTAINER_W - Y_AXIS_W;

// Plotting area for data points (excludes y-axis and edge spacing)
const PLOT_W = LINE_CHART_W - INIT_SPACE - END_SPACE;

export interface ChartEvent {
  type: 'meal' | 'insulin' | 'exercise';
  timestamp: string;
}

const EVENT_COLORS: Record<ChartEvent['type'], string> = {
  meal: '#f97316',    // orange
  insulin: '#8b5cf6', // purple
  exercise: '#22c55e',// green
};

function formatHourLabel(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

interface GlucoseChartProps {
  readings: GlucoseReading[];
  events?: ChartEvent[];
}

export function GlucoseChart({ readings, events = [] }: GlucoseChartProps) {
  const Colors = useColors();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  if (!readings || readings.length === 0) {
    return (
      <View style={{ height: CHART_H, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: Colors.mutedForeground }}>No data</Text>
      </View>
    );
  }

  // Readings arrive in chronological order (oldest → newest) from useGlucose24h — use as-is.
  const chronological = [...readings];

  // Downsample to max 144 points — keep every Nth reading so we stay under the cap.
  const MAX_POINTS = 144;
  const step = chronological.length > MAX_POINTS
    ? Math.ceil(chronological.length / MAX_POINTS)
    : 1;
  const sampled = step > 1
    ? chronological.filter((_, i) => i % step === 0)
    : chronological;

  // Calculate spacing so all data fits exactly within CONTAINER_W.
  // Last point lands at: Y_AXIS_W + INIT_SPACE + (n-1)*spacing = CONTAINER_W - END_SPACE
  const spacing = sampled.length > 1
    ? PLOT_W / (sampled.length - 1)
    : 2;

  // Map each event to the nearest sampled data point index.
  const chartStart = sampled.length > 0 ? new Date(sampled[0].timestamp).getTime() : 0;
  const chartEnd   = sampled.length > 0 ? new Date(sampled[sampled.length - 1].timestamp).getTime() : 0;

  const eventsByIndex = new Map<number, ChartEvent['type']>();
  for (const event of events) {
    const evTime = new Date(event.timestamp).getTime();
    const BUFFER_MS = 5 * 60 * 1000;
    if (evTime < chartStart - BUFFER_MS || evTime > chartEnd + BUFFER_MS) continue;

    let nearestIdx = 0;
    let minDiff = Infinity;
    sampled.forEach((r, i) => {
      const diff = Math.abs(new Date(r.timestamp).getTime() - evTime);
      if (diff < minDiff) { minDiff = diff; nearestIdx = i; }
    });
    if (!eventsByIndex.has(nearestIdx)) {
      eventsByIndex.set(nearestIdx, event.type);
    }
  }

  // Build time axis labels by finding the nearest data point to each 3-hour boundary.
  const timeLabels: { x: number; label: string }[] = [];
  if (sampled.length > 0) {
    const firstMs = new Date(sampled[0].timestamp).getTime();
    const lastMs  = new Date(sampled[sampled.length - 1].timestamp).getTime();

    const usedIndices = new Set<number>();
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      for (let h = 0; h < 24; h += 3) {
        const boundary = new Date(sampled[0].timestamp);
        boundary.setDate(boundary.getDate() + dayOffset);
        boundary.setHours(h, 0, 0, 0);
        const boundaryMs = boundary.getTime();

        if (boundaryMs < firstMs - 10 * 60 * 1000) continue;
        if (boundaryMs > lastMs  + 10 * 60 * 1000) continue;

        let nearestIdx = 0;
        let minDiff = Infinity;
        sampled.forEach((r, i) => {
          const diff = Math.abs(new Date(r.timestamp).getTime() - boundaryMs);
          if (diff < minDiff) { minDiff = diff; nearestIdx = i; }
        });

        if (minDiff < 15 * 60 * 1000 && !usedIndices.has(nearestIdx)) {
          usedIndices.add(nearestIdx);
          const x = Y_AXIS_W + INIT_SPACE + nearestIdx * spacing;
          timeLabels.push({ x, label: formatHourLabel(h) });
        }
      }
    }
  }

  const data = sampled.map((r) => ({
    value: Number(r.glucose),
    dataPointColor: Number(r.glucose) < GLUCOSE_LOW || Number(r.glucose) > GLUCOSE_HIGH
      ? Colors.glucoseLow
      : Colors.glucoseInRange,
    ts: r.timestamp,
  }));

  const values = sampled.map(r => Number(r.glucose));
  const minVal = Math.max(40, Math.min(...values) - 20);
  const maxVal = Math.min(400, Math.max(...values) + 20);

  const presentTypes = new Set(eventsByIndex.values());

  const handleTouch = (e: any) => {
    const dataX = e.nativeEvent.locationX - Y_AXIS_W - INIT_SPACE;
    if (dataX < 0) { setSelectedIdx(null); return; }
    setSelectedIdx(Math.max(0, Math.min(Math.round(dataX / spacing), sampled.length - 1)));
  };
  const stripX = selectedIdx !== null ? Y_AXIS_W + INIT_SPACE + selectedIdx * spacing : 0;
  const tooltipLeft = Math.max(Y_AXIS_W, Math.min(Y_AXIS_W + LINE_CHART_W - 100, stripX - 50));

  return (
    <View>
      {/* Chart + event line overlay */}
      <View
        style={{ position: 'relative' }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => setSelectedIdx(null)}
        onResponderTerminate={() => setSelectedIdx(null)}
      >
        <LineChart
          data={data}
          width={LINE_CHART_W}
          height={CHART_H}
          spacing={spacing}
          color={Colors.primary}
          thickness={2}
          dataPointsRadius={0}
          hideDataPoints
          rulesColor={Colors.border}
          rulesType="solid"
          yAxisColor="transparent"
          xAxisColor={Colors.border}
          yAxisTextStyle={{ color: Colors.mutedForeground, fontSize: 10 }}
          yAxisLabelWidth={Y_AXIS_W}
          maxValue={maxVal}
          minValue={minVal}
          noOfSections={4}
          referenceLine1Config={{
            color: Colors.glucoseLow,
            dashWidth: 4,
            dashGap: 4,
            thickness: 1,
          }}
          referenceLine1Position={GLUCOSE_LOW}
          referenceLine2Config={{
            color: Colors.glucoseHigh,
            dashWidth: 4,
            dashGap: 4,
            thickness: 1,
          }}
          referenceLine2Position={GLUCOSE_HIGH}
          curved
          animateOnDataChange
          initialSpacing={INIT_SPACE}
          endSpacing={END_SPACE}
        />

        {/* Event marker lines — absolutely overlaid so they always render */}
        {Array.from(eventsByIndex.entries()).map(([idx, type]) => {
          const x = Y_AXIS_W + INIT_SPACE + idx * spacing;
          return (
            <View
              key={`ev-${idx}-${type}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: x - 1,
                width: 2,
                backgroundColor: EVENT_COLORS[type] + 'cc',
              }}
            />
          );
        })}

        {/* Pointer strip */}
        {selectedIdx !== null && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: stripX - 0.5,
              width: 1,
              height: CHART_H,
              backgroundColor: Colors.mutedForeground + '50',
            }}
          />
        )}

        {/* Tooltip — fixed at top so it's always above the finger */}
        {selectedIdx !== null && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 8,
              left: tooltipLeft,
              width: 100,
              backgroundColor: Colors.card,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: Colors.cardBorder,
              padding: 8,
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.foreground }}>
              {Math.round(data[selectedIdx].value)}
            </Text>
            <Text style={{ fontSize: 10, color: Colors.mutedForeground }}>
              {format(new Date(data[selectedIdx].ts), 'h:mm a')}
            </Text>
          </View>
        )}
      </View>

      {/* Custom time-axis labels — pixel-aligned to chart data point positions */}
      <View style={{ position: 'relative', height: 18 }}>
        {timeLabels.map(({ x, label }) => (
          <Text
            key={label}
            style={{
              position: 'absolute',
              left: x - 14,
              width: 28,
              textAlign: 'center',
              fontSize: 9,
              color: Colors.mutedForeground,
            }}
          >
            {label}
          </Text>
        ))}
      </View>

      {/* Event legend */}
      {presentTypes.size > 0 && (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
          {presentTypes.has('meal') && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 16, height: 2, backgroundColor: EVENT_COLORS.meal }} />
              <Text style={{ fontSize: 11, color: Colors.mutedForeground }}>Meal</Text>
            </View>
          )}
          {presentTypes.has('insulin') && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 16, height: 2, backgroundColor: EVENT_COLORS.insulin }} />
              <Text style={{ fontSize: 11, color: Colors.mutedForeground }}>Insulin</Text>
            </View>
          )}
          {presentTypes.has('exercise') && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 16, height: 2, backgroundColor: EVENT_COLORS.exercise }} />
              <Text style={{ fontSize: 11, color: Colors.mutedForeground }}>Exercise</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
