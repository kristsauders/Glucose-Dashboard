import { View, Text } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useColors } from '../../constants/colors';
import { getMarkdownStyles } from './markdownStyles';

interface StreamingMessageProps {
  text: string;
  statusText?: string;
}

export function StreamingMessage({ text, statusText }: StreamingMessageProps) {
  const Colors = useColors();
  const markdownStyles = getMarkdownStyles(Colors);
  return (
    <View style={{ marginBottom: 12, paddingHorizontal: 4 }}>
      <View
        style={{
          backgroundColor: Colors.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: Colors.cardBorder,
          padding: 12,
          paddingHorizontal: 14,
        }}
      >
        {text ? (
          <Markdown style={markdownStyles}>{text}</Markdown>
        ) : (
          <Text style={{ color: Colors.mutedForeground, fontSize: 14, fontFamily: 'TiemposText' }}>
            {statusText || 'Thinking…'}
          </Text>
        )}
        {/* Blinking cursor */}
        {text ? (
          <View
            style={{
              width: 2,
              height: 16,
              backgroundColor: Colors.primary,
              marginTop: 2,
              borderRadius: 1,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
