import { useRef, useEffect, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useColors } from '../../constants/colors';
import { getMarkdownStyles } from './markdownStyles';

// Body text style constants — match markdownStyles body exactly
const BASE = 14;
const FONT = 'TiemposText';

interface StreamingMessageProps {
  text: string;
  statusText?: string;
}

export function StreamingMessage({ text, statusText }: StreamingMessageProps) {
  const Colors = useColors();
  const markdownStyles = getMarkdownStyles(Colors);

  // committedRef tracks how much text has been "settled" into Markdown render.
  // displayCommitted drives the Markdown re-render (state, not ref).
  const committedRef = useRef('');
  const [displayCommitted, setDisplayCommitted] = useState('');

  // Always holds the latest text prop so animation callbacks don't go stale.
  const latestTextRef = useRef(text);

  // Fade animation for the "new chunk" (text beyond committed)
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const animatingRef = useRef(false);

  useEffect(() => {
    latestTextRef.current = text;

    // If we're not mid-animation and there's new text to reveal, kick off a fade.
    if (!animatingRef.current && text.length > committedRef.current.length) {
      animatingRef.current = true;
      fadeAnim.setValue(0);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          // Commit everything accumulated so far.
          committedRef.current = latestTextRef.current;
          setDisplayCommitted(latestTextRef.current);
        }
        animatingRef.current = false;
      });
    }
  // Re-run when text changes OR when displayCommitted changes (to catch any
  // gap left after a commit while the server was still sending).
  }, [text, displayCommitted]);

  // Blinking cursor
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 530, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 530, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // The portion not yet committed — fades in.
  const newPart = text.slice(displayCommitted.length);
  const hasContent = displayCommitted.length > 0 || newPart.length > 0;

  return (
    <View style={{ marginBottom: 12 }}>
      {hasContent ? (
        <>
          {displayCommitted.length > 0 && (
            <Markdown style={markdownStyles}>{displayCommitted}</Markdown>
          )}
          {newPart.length > 0 && (
            <Animated.Text
              style={{
                opacity: fadeAnim,
                color: Colors.foreground,
                fontSize: BASE,
                lineHeight: BASE * 1.6,
                fontFamily: FONT,
              }}
            >
              {newPart}
            </Animated.Text>
          )}
          <Animated.View
            style={{
              width: 2,
              height: 14,
              backgroundColor: Colors.primary,
              marginTop: 2,
              borderRadius: 1,
              opacity: cursorOpacity,
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
