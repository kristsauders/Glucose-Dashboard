import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, useColorScheme } from 'react-native';

/**
 * Branded loading screen shown while fonts and auth are initialising.
 * Uses only system fonts so it renders immediately before custom fonts load.
 */
export default function LoadingScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const bg = isDark ? '#0f172a' : '#f5f5f5';
  const fg = isDark ? '#f1f5f9' : '#0f172a';
  const sub = isDark ? '#94a3b8' : '#64748b';
  const dotColor = '#3b82f6';

  // Three dots that pulse in sequence
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 350, useNativeDriver: true }),
          Animated.delay(700 - delay),
        ]),
      );

    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 233);
    const a3 = pulse(dot3, 466);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.wordmark, { color: fg }]}>Sage</Text>
      <Text style={[styles.tagline, { color: sub }]}>your diabetes companion</Text>

      <View style={styles.dots}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: dotColor, opacity: dot },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  wordmark: {
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: 6,
  },
  tagline: {
    fontSize: 14,
    letterSpacing: 1,
    marginBottom: 48,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
