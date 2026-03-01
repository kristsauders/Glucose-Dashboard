import { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, Animated } from 'react-native';
import { useColors } from '../../constants/colors';

// Match markdownStyles body exactly so plain streaming text looks identical
// to the committed Markdown render in MessageBubble.
const BASE = 14;
const FONT = 'TiemposText';

// Each word fades in over FADE_MS, starting STAGGER_MS after the previous word.
// At 30 chars/10ms queue rate and ~5 chars/word, ~6 words per batch.
// Last word in a batch starts fading at ~50ms, fully visible at ~150ms.
const FADE_MS = 100;
const STAGGER_MS = 10;

interface AnimWord {
  id: number;
  text: string;
  opacity: Animated.Value;
  done: boolean;
}

interface Props {
  text: string;
  statusText?: string;
}

export function StreamingMessage({ text, statusText }: Props) {
  const Colors = useColors();

  // committed: words whose animations have finished — collapsed into one string
  // to keep the Animated.Text node count low (only recent words are animated).
  const [committed, setCommitted] = useState('');
  const [pendingWords, setPendingWords] = useState<AnimWord[]>([]);
  const processedRef = useRef(0);
  const wordIdRef = useRef(0);

  // Collapse all consecutive finished words from the front of the pending queue.
  const collapse = useCallback(() => {
    setPendingWords(prev => {
      let i = 0;
      while (i < prev.length && prev[i].done) i++;
      if (i === 0) return prev;
      const chunk = prev.slice(0, i).map(w => w.text).join('');
      setCommitted(c => c + chunk);
      return prev.slice(i);
    });
  }, []);

  useEffect(() => {
    if (text.length <= processedRef.current) return;
    const newChars = text.slice(processedRef.current);
    processedRef.current = text.length;

    // Tokenize preserving whitespace so inline layout stays correct.
    const tokens = newChars.match(/\S+|\s+/g) ?? [newChars];

    const newWords: AnimWord[] = tokens.map((token, i) => {
      const opacity = new Animated.Value(0);
      const word: AnimWord = { id: wordIdRef.current++, text: token, opacity, done: false };

      // Left-to-right stagger: word i starts STAGGER_MS after word i-1.
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        delay: i * STAGGER_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          word.done = true;
          collapse();
        }
      });

      return word;
    });

    setPendingWords(prev => [...prev, ...newWords]);
  }, [text, collapse]);

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

  const hasContent = committed.length > 0 || pendingWords.length > 0;

  return (
    <View style={{ marginBottom: 12 }}>
      {hasContent ? (
        <>
          {/*
            Nested Text/Animated.Text siblings flow inline in RN, giving us
            the left-to-right word reveal without breaking text wrapping.
          */}
          <Text
            style={{
              color: Colors.foreground,
              fontSize: BASE,
              lineHeight: BASE * 1.6,
              fontFamily: FONT,
            }}
          >
            {committed}
            {pendingWords.map(w => (
              <Animated.Text key={w.id} style={{ opacity: w.opacity }}>
                {w.text}
              </Animated.Text>
            ))}
          </Text>

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
