import { useCallback, useEffect, useRef } from 'react';
import { NativeModules, Platform, AppState } from 'react-native';
import { GLUCOSE_LOW, GLUCOSE_HIGH } from '../constants/config';
import type { GlucoseReading } from '../types/glucose';
import { getToken } from '../services/auth';
import { API_BASE_URL } from '../constants/config';

const { GlucoseWidgetsModule } = NativeModules;

const isAvailable = Platform.OS === 'ios' && !!GlucoseWidgetsModule;

if (Platform.OS === 'ios' && !GlucoseWidgetsModule) {
  console.warn('[GlucoseWidgets] Native module not found — Live Activity and widget updates are disabled.');
}

/**
 * Controls the iOS lock-screen widget and Dynamic Island Live Activity.
 *
 * Server config is written to NSUserDefaults.standard via Settings.set()
 * so Swift can POST the APNs push token directly via URLSession — no
 * dictionary bridging, no new native methods, no fixed timeout.
 *
 * Usage:
 *   const { syncReading, endActivity } = useGlucoseWidgets();
 *   useEffect(() => { if (reading) syncReading(reading); }, [reading]);
 */
export function useGlucoseWidgets() {
  const liveActivityStarted = useRef(false);

  // Reset the started flag whenever the app returns to the foreground so that
  // the next syncReading call will attempt startLiveActivity again. This handles
  // the case where iOS ended the Live Activity after its ~24-hour lifetime limit.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        liveActivityStarted.current = false;
      }
    });
    return () => sub.remove();
  }, []);

  /** Push a new glucose reading to the widget and Live Activity. */
  const syncReading = useCallback(async (reading: GlucoseReading, recentReadings?: GlucoseReading[]) => {
    if (!isAvailable) return;

    const authToken = await getToken();

    const glucose = Number(reading.glucose);
    const trend   = trendArrow(reading.trend);
    const ts      = new Date(reading.timestamp).getTime() / 1000;
    const isLow   = glucose < GLUCOSE_LOW;
    const isHigh  = glucose > GLUCOSE_HIGH;

    // Build a compact history array: last 2 hours, max 25 points, oldest-first.
    const nowMs = Date.now();
    const history = (recentReadings ?? [])
      .map(r => ({
        glucose: Math.round(Number(r.glucose)),
        minutesAgo: Math.round((nowMs - new Date(r.timestamp).getTime()) / 60000),
      }))
      .filter(p => p.minutesAgo >= 0 && p.minutesAgo <= 120)
      .sort((a, b) => b.minutesAgo - a.minutesAgo)
      .slice(0, 25);

    // Always update the lock-screen widget UserDefaults + reload timeline.
    GlucoseWidgetsModule.updateGlucose(glucose, trend, ts, isLow, isHigh, history);

    // Start a Live Activity on first reading; subsequent updateGlucose calls
    // keep the content fresh via updateActivity() in Swift.
    if (!liveActivityStarted.current) {
      liveActivityStarted.current = true;
      GlucoseWidgetsModule.startLiveActivity(glucose, trend, ts, isLow, isHigh, history)
        .then(async (activityId: string) => {
          console.log('[GlucoseWidgets] Live Activity started:', activityId);

          // Pre-register activityId → userId on the server (with auth) so
          // Swift's unauthenticated /live-activity-token call can look up the user.
          try {
            const res = await fetch(`${API_BASE_URL}/notifications/live-activity-register`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
              },
              body: JSON.stringify({ activityId }),
            });
            console.log('[GlucoseWidgets] Activity pre-registered:', res.status);
          } catch (err) {
            console.warn('[GlucoseWidgets] Failed to pre-register activity:', err);
          }
          // Swift observes pushTokenUpdates indefinitely and POSTs to
          // /live-activity-token (no auth) when iOS assigns the token.
        })
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
