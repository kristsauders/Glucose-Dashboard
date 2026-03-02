import { useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format, isAfter, subMinutes } from 'date-fns';
import { useColors } from '../../constants/colors';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
}

export function TimePickerField({ value, onChange }: Props) {
  const Colors = useColors();
  const [show, setShow] = useState(false);

  // Show "Now" if within 90 seconds of current time
  const isNow = !isAfter(subMinutes(new Date(), 1.5), value);
  const label = isNow ? 'Now' : format(value, 'MMM d, h:mm a');

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.foreground }}>Time</Text>

      <TouchableOpacity
        onPress={() => setShow(v => !v)}
        style={{
          backgroundColor: show ? Colors.card : Colors.muted,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderWidth: show ? 1 : 0,
          borderColor: Colors.primary,
        }}
      >
        <Ionicons name="time-outline" size={18} color={show ? Colors.primary : Colors.mutedForeground} />
        <Text style={{ flex: 1, fontSize: 15, color: show ? Colors.primary : Colors.foreground, fontWeight: show ? '600' : '400' }}>
          {label}
        </Text>
        <Ionicons name={show ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.mutedForeground} />
      </TouchableOpacity>

      {show && (
        <View style={{ backgroundColor: Colors.muted, borderRadius: 10, overflow: 'hidden' }}>
          <DateTimePicker
            value={value}
            mode="datetime"
            display="spinner"
            maximumDate={new Date()}
            onChange={(_, date) => { if (date) onChange(date); }}
            {...(Platform.OS === 'ios' ? { textColor: Colors.foreground } : {})}
          />
        </View>
      )}
    </View>
  );
}
