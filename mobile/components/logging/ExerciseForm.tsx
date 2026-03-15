import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useColors } from '../../constants/colors';
import { TimePickerField } from './TimePickerField';

const ACTIVITY_TYPES = ['walking', 'running', 'cycling', 'swimming', 'gym', 'yoga', 'other'] as const;
type ActivityType = typeof ACTIVITY_TYPES[number];

interface ExerciseFormProps {
  onSubmit: (data: {
    activity: ActivityType;
    duration: number;
    intensity: string;
    timestamp: string;
  }) => Promise<void>;
  onCancel?: () => void;
}

export function ExerciseForm({ onSubmit, onCancel }: ExerciseFormProps) {
  const Colors = useColors();
  const [activity, setActivity] = useState<ActivityType>('walking');
  const [duration, setDuration] = useState('');
  const [timestamp, setTimestamp] = useState(new Date());
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const durationNum = parseInt(duration, 10);
    if (isNaN(durationNum) || durationNum <= 0) {
      Alert.alert('Invalid duration', 'Please enter duration in minutes.');
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        activity,
        duration: durationNum,
        intensity: 'moderate',
        timestamp: timestamp.toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.foreground }}>Activity</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ACTIVITY_TYPES.map(a => (
            <TouchableOpacity
              key={a}
              onPress={() => setActivity(a)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 20,
                backgroundColor: activity === a ? Colors.primary : Colors.muted,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: activity === a ? '#fff' : Colors.foreground,
                  textTransform: 'capitalize',
                }}
              >
                {a}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.foreground }}>
          Duration (minutes)
        </Text>
        <TextInput
          value={duration}
          onChangeText={setDuration}
          keyboardType="number-pad"
          autoFocus
          placeholder="e.g. 30"
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
          disabled={loading || !duration}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: loading || !duration ? Colors.muted : Colors.primary,
            alignItems: 'center',
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Log Exercise</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
