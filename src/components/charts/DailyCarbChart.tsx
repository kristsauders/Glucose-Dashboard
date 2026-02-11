import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { MealLog } from '@/types/logs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';

interface DailyCarbChartProps {
  meals: MealLog[];
}

export function DailyCarbChart({ meals }: DailyCarbChartProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);

  const chartData = useMemo(() => {
    // Group meals by date
    const dailyCarbs = new Map<string, number>();

    meals.forEach(meal => {
      const date = new Date(meal.timestamp).toISOString().split('T')[0];
      const carbs = Number(meal.carbs);
      if (!isNaN(carbs)) {
        dailyCarbs.set(date, (dailyCarbs.get(date) || 0) + carbs);
      }
    });

    // Convert to array and sort by date
    return Array.from(dailyCarbs.entries())
      .map(([date, carbs]) => {
        // Parse date string in local time (not UTC) by adding 'T12:00:00'
        const localDate = new Date(date + 'T12:00:00');
        return {
          date,
          carbs,
          displayDate: format(localDate, 'MMM d'),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [meals]);

  if (chartData.length === 0) {
    return null;
  }

  const avgCarbs = chartData.reduce((sum, d) => sum + d.carbs, 0) / chartData.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card id="daily-carb-chart">
        <CardHeader>
          <CardTitle>Daily Carbohydrate Intake</CardTitle>
          <CardDescription>
            Total carbs consumed per day (avg: {avgCarbs.toFixed(0)}g)
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
                label={{ value: 'Carbs (g)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number | undefined) => (typeof value === 'number' && !isNaN(value)) ? [`${value}g`, 'Carbs'] : ['N/A', 'Carbs']}
              />

              {/* Average line */}
              <ReferenceLine
                y={avgCarbs}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{
                  value: `Avg: ${avgCarbs.toFixed(0)}g`,
                  position: 'right',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 11,
                }}
              />

              <Bar
                dataKey="carbs"
                fill="hsl(var(--chart-3))"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
