import { motion } from 'framer-motion';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WeeklyMetrics } from '@/types/glucose';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface WeeklyA1CChartProps {
  data: WeeklyMetrics[];
}

export function WeeklyA1CChart({ data }: WeeklyA1CChartProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);
  const chartData = data.map(week => {
    // Calculate estimated A1C: A1C ≈ (Average Glucose + 46.7) / 28.7
    const estimatedA1C = (week.average + 46.7) / 28.7;

    return {
      week: week.weekStart,
      displayWeek: format(parseISO(week.weekStart), 'MMM d'),
      a1c: estimatedA1C,
    };
  });

  // Calculate overall average A1C
  const avgA1C = chartData.reduce((sum, d) => sum + d.a1c, 0) / chartData.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.8 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Weekly Estimated A1C Trend (%)</CardTitle>
          <CardDescription>
            Estimated A1C based on weekly average glucose
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground mb-1">Average Estimated A1C</p>
            <p className="text-3xl font-bold">
              {avgA1C.toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {avgA1C <= 5.7
                ? '✓ Non-diabetic range (< 5.7%)'
                : avgA1C <= 6.4
                ? 'Pre-diabetic range (5.7-6.4%)'
                : 'Diabetic range (≥ 6.5%)'}
            </p>
          </div>

          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayWeek"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                domain={[4, 8]}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(label) => `Week of ${label}`}
                formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(2)}%`, 'Est. A1C'] : ['N/A']}
              />

              {/* Reference zones */}
              <Area
                type="monotone"
                dataKey={() => 5.7}
                fill="hsl(var(--chart-2))"
                fillOpacity={0.1}
                stroke="none"
              />

              {/* Reference lines */}
              <ReferenceLine
                y={5.7}
                stroke="hsl(var(--chart-2))"
                strokeDasharray="3 3"
                label={{ value: 'Non-diabetic', position: 'right', fontSize: 11 }}
              />
              <ReferenceLine
                y={6.4}
                stroke="hsl(var(--chart-4))"
                strokeDasharray="3 3"
                label={{ value: 'Pre-diabetic', position: 'right', fontSize: 11 }}
              />

              <Line
                type="monotone"
                dataKey="a1c"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>

          <div className="mt-4 text-sm text-muted-foreground">
            <p>Formula: A1C ≈ (Average Glucose + 46.7) / 28.7</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
