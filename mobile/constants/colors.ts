export const Colors = {
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

export function getGlucoseColor(glucose: number): string {
  if (glucose < 70) return Colors.glucoseLow;
  if (glucose <= 180) return Colors.glucoseInRange;
  if (glucose <= 250) return Colors.glucoseHigh;
  return Colors.glucoseVeryHigh;
}

/** LibreLink Up API trend codes → arrow glyphs
 *  The Link Up API uses: 1=rapidly rising, 2=rising, 3=stable, 4=slowly falling, 5=falling, 6=rapidly falling
 *  (empirically confirmed from DB distribution — 3 is by far the most common, consistent with "stable") */
export function getTrendArrow(trend?: number | null): string {
  const map: Record<number, string> = {
    1: '↑↑',
    2: '↑',
    3: '→',
    4: '↘',
    5: '↓',
    6: '↓↓',
  };
  return trend != null ? (map[trend] ?? '→') : '→';
}
