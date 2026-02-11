import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { ExerciseLog } from '@/types/logs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';

interface ExercisePatternChartProps {
  exercise: ExerciseLog[];
}

export function ExercisePatternChart({ exercise }: ExercisePatternChartProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);

  const chartData = useMemo(() => {
    // Group exercise by date and intensity
    const dailyExercise = new Map<string, { light: number; moderate: number; intense: number }>();

    exercise.forEach(session => {
      const date = new Date(session.timestamp).toISOString().split('T')[0];
      const current = dailyExercise.get(date) || { light: 0, moderate: 0, intense: 0 };

      const intensity = session.intensity?.toLowerCase() || 'moderate';
      if (intensity === 'light') {
        current.light += session.duration_minutes;
      } else if (intensity === 'intense') {
        current.intense += session.duration_minutes;
      } else {
        current.moderate += session.duration_minutes;
      }

      dailyExercise.set(date, current);
    });

    // Convert to array and sort by date
    return Array.from(dailyExercise.entries())
      .map(([date, { light, moderate, intense }]) => ({
        date,
        light,
        moderate,
        intense,
        total: light + moderate + intense,
        displayDate: format(new Date(date), 'MMM d'),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [exercise]);

  if (chartData.length === 0) {
    return null;
  }

  const avgTotal = chartData.reduce((sum, d) => sum + d.total, 0) / chartData.length;
  const totalDays = chartData.length;
  const sessionCount = exercise.length;
  const avgSessionsPerDay = sessionCount / totalDays;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card id="exercise-pattern-chart">
        <CardHeader>
          <CardTitle>Daily Exercise Duration</CardTitle>
          <CardDescription>
            Exercise minutes per day by intensity (avg: {avgTotal.toFixed(0)} min/day, {avgSessionsPerDay.toFixed(1)} sessions/day)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} margin={{ top: 20, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                label={{ value: 'Minutes', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number | undefined, name: string | undefined) => {
                  if (typeof value !== 'number' || isNaN(value) || name === undefined) return ['N/A', name || ''];
                  const labels: Record<string, string> = {
                    light: 'Light',
                    moderate: 'Moderate',
                    intense: 'Intense',
                  };
                  return [`${value} min`, labels[name] || name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(value: string) => {
                  const labels: Record<string, string> = {
                    light: 'Light',
                    moderate: 'Moderate',
                    intense: 'Intense',
                  };
                  return labels[value] || value;
                }}
              />

              {/* Average line */}
              <ReferenceLine
                y={avgTotal}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{
                  value: `Avg: ${avgTotal.toFixed(0)} min`,
                  position: 'right',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 11,
                }}
              />

              <Bar
                dataKey="light"
                stackId="exercise"
                fill="hsl(var(--chart-5))"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="moderate"
                stackId="exercise"
                fill="hsl(var(--chart-2))"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="intense"
                stackId="exercise"
                fill="hsl(var(--chart-1))"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
