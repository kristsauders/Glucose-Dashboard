import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useColors } from '../../constants/colors';
import { TimePickerField } from './TimePickerField';

const INSULIN_TYPES = ['bolus', 'correction', 'basal'] as const;
type InsulinType = typeof INSULIN_TYPES[number];

interface InsulinFormProps {
  onSubmit: (data: { units: number; type: InsulinType; timestamp: string }) => Promise<void>;
  onCancel?: () => void;
}

export function InsulinForm({ onSubmit, onCancel }: InsulinFormProps) {
  const Colors = useColors();
  const [units, setUnits] = useState('');
  const [type, setType] = useState<InsulinType>('bolus');
  const [timestamp, setTimestamp] = useState(new Date());
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const unitsNum = parseFloat(units);
    if (isNaN(unitsNum) || unitsNum <= 0) {
      Alert.alert('Invalid units', 'Please enter a valid insulin dose.');
      return;
    }
    setLoading(true);
    try {
      await onSubmit({ units: unitsNum, type, timestamp: timestamp.toISOString() });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.foreground }}>Units</Text>
        <TextInput
          value={units}
          onChangeText={setUnits}
          keyboardType="decimal-pad"
          placeholder="e.g. 4"
          placeholderTextColor={Colors.mutedForeground}
          style={{
            backgroundColor: Colors.muted,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            color: Colors.foreground,
          }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.foreground }}>Type</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {INSULIN_TYPES.map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setType(t)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: type === t ? Colors.primary : Colors.muted,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: type === t ? '#fff' : Colors.foreground,
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TimePickerField value={timestamp} onChange={setTimestamp} />

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
        {onCancel && (
          <TouchableOpacity
            onPress={onCancel}
            style={{
              flex: 1,
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: Colors.muted,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: Colors.foreground, fontWeight: '600', fontSize: 16 }}>
              Cancel
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading || !units}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: loading || !units ? Colors.muted : Colors.primary,
            alignItems: 'center',
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Log Insulin</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
