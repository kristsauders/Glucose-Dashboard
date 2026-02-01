import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DailyMetrics } from '@/types/glucose';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface TimeInRangeChartProps {
  data: DailyMetrics[];
}

export function TimeInRangeChart({ data }: TimeInRangeChartProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);

  const chartData = data.map(d => ({
    date: d.date,
    displayDate: format(parseISO(d.date), 'MMM d'),
    timeInRange70_180: d.timeInRange70_180,
    timeInTarget70_140: d.timeInTarget70_140,
    timeAbove180: 100 - d.timeInRange70_180 > 0
      ? Math.max(0, 100 - d.timeInRange70_180 - (d.timeInRange70_180 - d.timeInTarget70_140))
      : 0,
    timeBelow70: Math.max(0, 100 - d.timeInRange70_180 - (100 - d.timeInRange70_180)),
  }));

  // Calculate overall averages
  const avgTIR = data.reduce((sum, d) => sum + d.timeInRange70_180, 0) / data.length;
  const avgTarget = data.reduce((sum, d) => sum + d.timeInTarget70_140, 0) / data.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Time in Range (%)</CardTitle>
          <CardDescription>
            Daily percentage of readings within target ranges (70-140 mg/dL and 70-180 mg/dL)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Avg. Time in Range</p>
              <p className="text-3xl font-bold text-[hsl(var(--chart-2))]">
                {avgTIR.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">70-180 mg/dL</p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Avg. Time in Target</p>
              <p className="text-3xl font-bold text-[hsl(var(--primary))]">
                {avgTarget.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">70-140 mg/dL</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(label) => `Date: ${label}`}
                formatter={(value: number | undefined, name: string | undefined) => {
                  if (value === undefined || name === undefined) return ['N/A', ''];
                  const labels: Record<string, string> = {
                    timeInTarget70_140: 'Target (70-140)',
                    timeInRange70_180: 'Range (70-180)',
                  };
                  return [`${value.toFixed(1)}%`, labels[name] || name];
                }}
              />
              <Legend />

              <Area
                type="monotone"
                dataKey="timeInTarget70_140"
                stackId="1"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.6}
                name="Target (70-140)"
              />
              <Area
                type="monotone"
                dataKey="timeInRange70_180"
                stroke="hsl(var(--chart-2))"
                fill="hsl(var(--chart-2))"
                fillOpacity={0.4}
                name="Range (70-180)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
