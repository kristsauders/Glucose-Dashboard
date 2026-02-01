import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WeeklyMetrics } from '@/types/glucose';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface WeeklyOverviewChartProps {
  data: WeeklyMetrics[];
}

export function WeeklyOverviewChart({ data }: WeeklyOverviewChartProps) {
  const chartHeight = useResponsiveChartHeight(280, 400);
  const chartData = data.map(d => ({
    week: d.weekStart,
    displayWeek: format(parseISO(d.weekStart), 'MMM d'),
    average: d.average,
    min: d.min,
    max: d.max,
    range: d.max - d.min,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Weekly Glucose Trends (mg/dL)</CardTitle>
          <CardDescription>
            Weekly averages and glucose range variability
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayWeek"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                yAxisId="left"
                domain={[40, 250]}
                width={35}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                width={35}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(label) => `Week of ${label}`}
                formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(1)} mg/dL`] : ['N/A']}
              />
              <Legend />

              <Bar
                yAxisId="right"
                dataKey="range"
                fill="hsl(var(--muted))"
                opacity={0.3}
                name="Glucose Range"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="average"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                name="Weekly Average"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="max"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Weekly Max"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="min"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Weekly Min"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
