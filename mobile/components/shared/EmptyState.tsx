import { View, Text } from 'react-native';
import { useColors } from '../../constants/colors';

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon = '📭', title, subtitle }: EmptyStateProps) {
  const Colors = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>{icon}</Text>
      <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.foreground, textAlign: 'center' }}>{title}</Text>
      {subtitle && (
        <Text style={{ fontSize: 14, color: Colors.mutedForeground, textAlign: 'center', marginTop: 6, paddingHorizontal: 32 }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
