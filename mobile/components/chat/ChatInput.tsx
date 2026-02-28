import { View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/colors';

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChangeText,
  onSend,
  onAbort,
  streaming,
  disabled,
  placeholder = 'Ask Sage anything…',
}: ChatInputProps) {
  const canSend = value.trim().length > 0 && !streaming && !disabled;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: Colors.card,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        gap: 8,
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.mutedForeground}
        multiline
        maxLength={2000}
        style={{
          flex: 1,
          backgroundColor: Colors.muted,
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 10,
          fontSize: 15,
          color: Colors.foreground,
          maxHeight: 120,
        }}
        editable={!streaming && !disabled}
        onSubmitEditing={canSend ? onSend : undefined}
        blurOnSubmit={false}
      />

      {streaming ? (
        <TouchableOpacity
          onPress={onAbort}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: Colors.destructive,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Stop square icon */}
          <View style={{ width: 14, height: 14, backgroundColor: '#fff', borderRadius: 2 }} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onSend}
          disabled={!canSend}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: canSend ? Colors.primary : Colors.muted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Up-arrow send icon */}
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                width: 0,
                height: 0,
                borderLeftWidth: 6,
                borderRightWidth: 6,
                borderBottomWidth: 10,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderBottomColor: canSend ? '#fff' : Colors.mutedForeground,
              }}
            />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}
