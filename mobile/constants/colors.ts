import { useColorScheme } from 'react-native';

const light = {
  background: '#f5f5f5',
  card: '#ffffff',
  cardBorder: '#e2e8f0',
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  primaryForeground: '#ffffff',
  foreground: '#0f172a',
  muted: '#f1f5f9',
  mutedForeground: '#64748b',
  border: '#e2e8f0',
  destructive: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',

  // Glucose-specific
  glucoseLow: '#ef4444',
  glucoseInRange: '#22c55e',
  glucoseHigh: '#f59e0b',
  glucoseVeryHigh: '#dc2626',
  glucoseChartLine: '#3b82f6',
  glucoseTargetBand: 'rgba(34,197,94,0.10)',

  // Tab bar
  tabActive: '#3b82f6',
  tabInactive: '#94a3b8',
};

const dark = {
  background: '#0f172a',
  card: '#1e293b',
  cardBorder: '#334155',
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  primaryForeground: '#ffffff',
  foreground: '#f1f5f9',
  muted: '#1e293b',
  mutedForeground: '#94a3b8',
  border: '#334155',
  destructive: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',

  // Glucose-specific
  glucoseLow: '#ef4444',
  glucoseInRange: '#22c55e',
  glucoseHigh: '#f59e0b',
  glucoseVeryHigh: '#dc2626',
  glucoseChartLine: '#60a5fa',
  glucoseTargetBand: 'rgba(34,197,94,0.15)',

  // Tab bar
  tabActive: '#60a5fa',
  tabInactive: '#475569',
};

export type ColorScheme = typeof light;

/** Call inside any React component or hook to get theme colors that update with system preference. */
export function useColors(): ColorScheme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

// Static palettes for non-component contexts (e.g. markdownStyles factory).
export const lightColors: ColorScheme = light;
export const darkColors: ColorScheme = dark;

export function getGlucoseColor(glucose: number, colors: ColorScheme = light): string {
  if (glucose < 70) return colors.glucoseLow;
  if (glucose <= 180) return colors.glucoseInRange;
  if (glucose <= 250) return colors.glucoseHigh;
  return colors.glucoseVeryHigh;
}

/** LibreLink Up API trend codes → arrow glyphs
 *  0=NotDetermined, 1=FallingQuickly, 2=Falling, 3=Stable, 4=Rising, 5=RisingQuickly */
export function getTrendArrow(trend?: number | null): string {
  const map: Record<number, string> = {
    0: '→',
    1: '↓↓',
    2: '↘',
    3: '→',
    4: '↗',
    5: '↑↑',
  };
  return trend != null ? (map[trend] ?? '→') : '→';
}
