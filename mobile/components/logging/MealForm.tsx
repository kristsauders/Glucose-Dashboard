import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useColors } from '../../constants/colors';
import { TimePickerField } from './TimePickerField';

interface MealFormProps {
  onSubmit: (data: { carbs: number; description: string; timestamp: string }) => Promise<void>;
  onCancel?: () => void;
}

export function MealForm({ onSubmit, onCancel }: MealFormProps) {
  const Colors = useColors();
  const [carbs, setCarbs] = useState('');
  const [description, setDescription] = useState('');
  const [timestamp, setTimestamp] = useState(new Date());
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const carbNum = parseFloat(carbs);
    if (isNaN(carbNum) || carbNum < 0) {
      Alert.alert('Invalid carbs', 'Please enter a valid carbohydrate amount.');
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        carbs: carbNum,
        description: description.trim() || 'Meal',
        timestamp: timestamp.toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.foreground }}>
          Carbohydrates (g)
        </Text>
        <TextInput
          value={carbs}
          onChangeText={setCarbs}
          keyboardType="decimal-pad"
          autoFocus
          placeholder="e.g. 45"
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
        <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.foreground }}>
          Description (optional)
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Oatmeal with banana"
          placeholderTextColor={Colors.mutedForeground}
          style={{
            backgroundColor: Colors.muted,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 15,
            color: Colors.foreground,
          }}
        />
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
          disabled={loading || !carbs}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: loading || !carbs ? Colors.muted : Colors.primary,
            alignItems: 'center',
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Log Meal</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
