import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useColors } from '../../constants/colors';
import type { GlucoseSummary } from '../../types/glucose';

interface StatsRowProps {
  summary: GlucoseSummary | undefined;
}

function Stat({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  const Colors = useColors();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: small ? 16 : 20, fontWeight: '700', color: color ?? Colors.foreground }}>{value}</Text>
      <Text style={{ fontSize: 11, color: Colors.mutedForeground, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function Divider({ vertical }: { vertical?: boolean }) {
  const Colors = useColors();
  return vertical
    ? <View style={{ width: 1, backgroundColor: Colors.border }} />
    : <View style={{ height: 1, backgroundColor: Colors.border, marginHorizontal: 16, marginVertical: 12 }} />;
}

export function StatsRow({ summary }: StatsRowProps) {
  const Colors = useColors();
  const [expanded, setExpanded] = useState(false);
  if (!summary) return null;

  const tir180 = parseFloat(summary.timeInRange['70-180']);
  const tir140 = parseFloat(summary.timeInRange['70-140']);
  const below70 = parseFloat(summary.timeInRange.below70);
  const above180 = parseFloat(summary.timeInRange.above180);

  const tirColor = tir180 >= 70 ? Colors.glucoseInRange : tir180 >= 50 ? Colors.glucoseHigh : Colors.glucoseLow;
  const belowColor = below70 > 4 ? Colors.glucoseLow : below70 > 1 ? Colors.glucoseHigh : Colors.glucoseInRange;
  const aboveColor = above180 > 25 ? Colors.glucoseLow : above180 > 10 ? Colors.glucoseHigh : Colors.glucoseInRange;

  return (
    <View
      style={{
        backgroundColor: Colors.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.cardBorder,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      {/* Main stats row */}
      <View style={{ flexDirection: 'row', paddingVertical: 16 }}>
        <Stat label="TIR 70–180" value={`${tir180.toFixed(0)}%`} color={tirColor} />
        <Divider vertical />
        <Stat label="Avg glucose" value={`${Math.round(parseFloat(summary.avgGlucose))}`} />
        <Divider vertical />
        <Stat label="Est. A1C" value={`${parseFloat(summary.estimatedA1c).toFixed(1)}%`} />
        <Divider vertical />
        <Stat label="CV" value={`${parseFloat(summary.cv).toFixed(0)}%`} />
      </View>

      {/* Expand toggle */}
      <TouchableOpacity
        onPress={() => setExpanded(e => !e)}
        style={{
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          paddingVertical: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 12, color: Colors.mutedForeground }}>
          {expanded ? '▲ Less' : '▼ More stats'}
        </Text>
      </TouchableOpacity>

      {/* Expanded section */}
      {expanded && (
        <>
          <Divider />
          <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 16 }}>
            <Stat label="TIR 70–140" value={`${tir140.toFixed(0)}%`} small />
            <Divider vertical />
            <Stat label="Below 70" value={`${below70.toFixed(0)}%`} color={belowColor} small />
            <Divider vertical />
            <Stat label="Above 180" value={`${above180.toFixed(0)}%`} color={aboveColor} small />
          </View>
          <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 16 }}>
            <Stat label="Min" value={`${Math.round(parseFloat(summary.minGlucose))}`} small />
            <Divider vertical />
            <Stat label="Max" value={`${Math.round(parseFloat(summary.maxGlucose))}`} small />
            <Divider vertical />
            <Stat label="Std dev" value={`${Math.round(parseFloat(summary.stdDev))}`} small />
          </View>
        </>
      )}
    </View>
  );
}
