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
    <View style={{ marginBottom: 12 }}>
      {text ? (
        <>
          <Markdown style={markdownStyles}>{text}</Markdown>
          {/* Blinking cursor */}
          <View
            style={{
              width: 2,
              height: 14,
              backgroundColor: Colors.primary,
              marginTop: 2,
              borderRadius: 1,
            }}
          />
        </>
      ) : (
        <Text style={{ color: Colors.mutedForeground, fontSize: 13 }}>
          {statusText || 'Thinking…'}
        </Text>
      )}
    </View>
  );
}
