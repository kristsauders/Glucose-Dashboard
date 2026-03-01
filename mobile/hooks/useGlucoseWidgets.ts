import { useCallback, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import { GLUCOSE_LOW, GLUCOSE_HIGH } from '../constants/config';
import type { GlucoseReading } from '../types/glucose';

const { GlucoseWidgetsModule } = NativeModules;

const isAvailable = Platform.OS === 'ios' && !!GlucoseWidgetsModule;

if (Platform.OS === 'ios' && !GlucoseWidgetsModule) {
  console.warn('[GlucoseWidgets] Native module not found — Live Activity and widget updates are disabled.');
}

/**
 * Controls the iOS lock-screen widget and Dynamic Island Live Activity.
 *
 * Usage in the dashboard:
 *   const { syncReading, endActivity } = useGlucoseWidgets();
 *   useEffect(() => { if (reading) syncReading(reading); }, [reading]);
 */
export function useGlucoseWidgets() {
  const liveActivityStarted = useRef(false);

  /** Push a new glucose reading to the widget and Live Activity. */
  const syncReading = useCallback((reading: GlucoseReading) => {
    if (!isAvailable) return;

    const glucose = Number(reading.glucose);
    const trend   = trendArrow(reading.trend);
    const ts      = new Date(reading.timestamp).getTime() / 1000;
    const isLow   = glucose < GLUCOSE_LOW;
    const isHigh  = glucose > GLUCOSE_HIGH;

    // Always update the lock-screen widget UserDefaults + reload timeline
    GlucoseWidgetsModule.updateGlucose(glucose, trend, ts, isLow, isHigh);

    // Start a Live Activity on first reading; subsequent calls just update
    if (!liveActivityStarted.current) {
      liveActivityStarted.current = true;
      GlucoseWidgetsModule.startLiveActivity(glucose, trend, ts, isLow, isHigh)
        .then((id: string) => console.log('[GlucoseWidgets] Live Activity started/updated:', id))
        .catch((err: any) => {
          console.warn('[GlucoseWidgets] startLiveActivity failed:', err);
          liveActivityStarted.current = false;
        });
    }
  }, []);

  /** End the Live Activity (e.g. on logout). */
  const endActivity = useCallback(() => {
    if (!isAvailable) return;
    liveActivityStarted.current = false;
    GlucoseWidgetsModule.endLiveActivity();
  }, []);

  return { syncReading, endActivity };
}

// Map stored trend code → glyph (mirrors colors.ts getTrendArrow)
// 0=NotDetermined, 1=FallingQuickly, 2=Falling, 3=Stable, 4=Rising, 5=RisingQuickly
function trendArrow(trend?: number | null): string {
  const map: Record<number, string> = { 0: '→', 1: '↓↓', 2: '↘', 3: '→', 4: '↗', 5: '↑↑' };
  return trend != null ? (map[trend] ?? '→') : '→';
}
