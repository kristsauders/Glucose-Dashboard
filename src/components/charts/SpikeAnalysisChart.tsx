import { motion } from 'framer-motion';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DailyMetrics } from '@/types/glucose';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface SpikeAnalysisChartProps {
  data: DailyMetrics[];
}

export function SpikeAnalysisChart({ data }: SpikeAnalysisChartProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);
  const chartData = data.map(d => ({
    date: d.date,
    displayDate: format(parseISO(d.date), 'MMM d'),
    spikes: d.spikesAbove140,
  }));

  // Calculate statistics
  const totalSpikes = data.reduce((sum, d) => sum + d.spikesAbove140, 0);
  const avgSpikesPerDay = totalSpikes / data.length;
  const maxSpikes = Math.max(...data.map(d => d.spikesAbove140));
  const daysWithNoSpikes = data.filter(d => d.spikesAbove140 === 0).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Glucose Spikes Analysis (count)</CardTitle>
          <CardDescription>
            Daily count of glucose excursions above 140 mg/dL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Avg. Spikes/Day</p>
              <p className="text-3xl font-bold">
                {avgSpikesPerDay.toFixed(1)}
              </p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Max in One Day</p>
              <p className="text-3xl font-bold">
                {maxSpikes}
              </p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Days w/o Spikes</p>
              <p className="text-3xl font-bold">
                {daysWithNoSpikes}
              </p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis width={35} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(label) => `Date: ${label}`}
                formatter={(value: number | undefined) => value !== undefined ? [`${value} spike${value !== 1 ? 's' : ''}`, 'Count'] : ['N/A', 'Count']}
              />

              <Bar
                dataKey="spikes"
                fill="hsl(var(--chart-1))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 text-sm text-muted-foreground">
            <p>
              A spike is counted when glucose rises above 140 mg/dL. Reducing spikes helps
              minimize postprandial hyperglycemia and improve overall glucose control.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
