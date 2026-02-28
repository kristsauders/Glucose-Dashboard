import { View, Text, ActivityIndicator } from 'react-native';
import { Card } from '../shared/Card';
import { Colors, getGlucoseColor, getTrendArrow } from '../../constants/colors';
import { formatDistanceToNow } from 'date-fns';
import type { GlucoseReading } from '../../types/glucose';

interface GlucoseCardProps {
  reading: GlucoseReading | null | undefined;
  loading?: boolean;
}

export function GlucoseCard({ reading, loading }: GlucoseCardProps) {
  if (loading) {
    return (
      <Card>
        <ActivityIndicator color={Colors.primary} />
      </Card>
    );
  }

  if (!reading) {
    return (
      <Card>
        <Text style={{ color: Colors.mutedForeground, textAlign: 'center' }}>No glucose data</Text>
      </Card>
    );
  }

  const color = getGlucoseColor(reading.glucose);
  const arrow = getTrendArrow(reading.trend);
  const age = formatDistanceToNow(new Date(reading.timestamp), { addSuffix: true });
  const label = reading.glucose < 70 ? 'LOW' : reading.glucose > 180 ? 'HIGH' : 'IN RANGE';

  return (
    <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text style={{ fontSize: 72, fontWeight: '700', color, lineHeight: 80 }}>
          {reading.glucose}
        </Text>
        <Text style={{ fontSize: 36, color, marginTop: 8 }}>{arrow}</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color, letterSpacing: 1, marginTop: 4 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 12, color: Colors.mutedForeground, marginTop: 6 }}>
        Updated {age}
      </Text>
    </Card>
  );
}
