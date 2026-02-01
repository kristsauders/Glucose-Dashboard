import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DailyMetrics } from '@/types/glucose';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface DailyGlucoseChartProps {
  data: DailyMetrics[];
}

export function DailyGlucoseChart({ data }: DailyGlucoseChartProps) {
  const chartHeight = useResponsiveChartHeight(280, 400);

  const chartData = data.map(d => ({
    ...d,
    displayDate: format(parseISO(d.date), 'MMM d'),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Daily Glucose Overview (mg/dL)</CardTitle>
          <CardDescription>
            Daily average, minimum, and maximum glucose levels with target ranges
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[40, 250]}
                width={35}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(label) => `Date: ${label}`}
                formatter={(value: number | undefined, name: string | undefined) => {
                  if (value === undefined) return ['N/A', ''];
                  // The name comes from the Line component's "name" prop
                  // Return [formattedValue, label] to display as "label: formattedValue"
                  return [`${value.toFixed(1)} mg/dL`, name || ''];
                }}
              />
              <Legend />

              {/* Reference lines for ranges */}
              <ReferenceLine y={70} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
              <ReferenceLine y={140} stroke="hsl(var(--chart-4))" strokeDasharray="3 3" />
              <ReferenceLine y={180} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />

              {/* Min-Max range shading (hidden from legend and tooltip) */}
              <Area
                type="monotone"
                dataKey="max"
                stroke="none"
                fill="hsl(var(--primary))"
                fillOpacity={0.1}
                legendType="none"
                hide={true}
              />
              <Area
                type="monotone"
                dataKey="min"
                stroke="none"
                fill="hsl(var(--background))"
                fillOpacity={1}
                legendType="none"
                hide={true}
              />

              {/* Lines */}
              <Line
                type="monotone"
                dataKey="average"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                name="Daily Average"
              />
              <Line
                type="monotone"
                dataKey="max"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Daily Maximum"
              />
              <Line
                type="monotone"
                dataKey="min"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Daily Minimum"
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-[hsl(var(--destructive))]" />
              <span>Low (&lt;70) / High (&gt;180)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-[hsl(var(--chart-4))]" />
              <span>Target Upper Bound (140)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
