import { View, Text, Image } from 'react-native';
import Markdown, { type RenderRules } from 'react-native-markdown-display';
import { useColors } from '../../constants/colors';
import { getMarkdownStyles } from './markdownStyles';
import type { Message } from '../../types/chat';

interface MessageBubbleProps {
  message: Message;
}

// Prevent native crash: react-native-markdown-display passes image src directly
// to the native Image component, which hard-crashes on invalid/relative URIs.
const markdownRules: RenderRules = {
  image: (node) => {
    const src: string = node.attributes?.src ?? '';
    if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
      return null;
    }
    return (
      <Image
        key={node.key}
        source={{ uri: src }}
        style={{ width: '100%', height: 200, borderRadius: 8, marginTop: 8 }}
        resizeMode="contain"
      />
    );
  },
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const Colors = useColors();
  const markdownStyles = getMarkdownStyles(Colors);
  const isUser = message.role === 'user';
  const charts: string[] = message.metadata?.charts ?? [];

  return (
    <View style={{ marginBottom: 12, paddingHorizontal: 4 }}>
      <View
        style={isUser ? {
          alignSelf: 'flex-end',
          maxWidth: '82%',
          backgroundColor: Colors.primary,
          borderRadius: 18,
          borderBottomRightRadius: 4,
          padding: 12,
          paddingHorizontal: 14,
        } : {
          backgroundColor: Colors.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: Colors.cardBorder,
          padding: 12,
          paddingHorizontal: 14,
        }}
      >
        {isUser ? (
          <Text style={{ color: Colors.primaryForeground, fontSize: 15, lineHeight: 22 }}>
            {message.content}
          </Text>
        ) : (
          <Markdown style={markdownStyles} rules={markdownRules}>
            {message.content}
          </Markdown>
        )}

        {charts.map((b64, i) => (
          <Image
            key={i}
            source={{ uri: `data:image/png;base64,${b64}` }}
            style={{ width: '100%', height: 200, borderRadius: 8, marginTop: 10 }}
            resizeMode="contain"
          />
        ))}
      </View>
    </View>
  );
}
