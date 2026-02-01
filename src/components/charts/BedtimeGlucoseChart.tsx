import { motion } from 'framer-motion';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { BedtimeMetrics } from '@/types/glucose';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface BedtimeGlucoseChartProps {
  data: BedtimeMetrics[];
}

export function BedtimeGlucoseChart({ data }: BedtimeGlucoseChartProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);
  const chartData = data.map(d => ({
    date: d.date,
    displayDate: format(parseISO(d.date), 'MMM d'),
    bedtime: d.bedtimeGlucose,
  }));

  // Calculate average bedtime glucose
  const avgBedtime = data.reduce((sum, d) => sum + d.bedtimeGlucose, 0) / data.length;

  // Count nights in optimal range
  const optimalNights = data.filter(d => d.bedtimeGlucose >= 80 && d.bedtimeGlucose <= 120).length;
  const optimalPercentage = (optimalNights / data.length) * 100;

  // Determine if showing single night or multiple nights
  const isSingleNight = data.length === 1;
  const title = isSingleNight ? "Last Night's Bedtime Glucose" : "Bedtime Glucose (mg/dL)";
  const description = isSingleNight
    ? "Average glucose from 10pm-midnight last night"
    : "Average glucose at bedtime (10pm-midnight)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Avg. Bedtime Glucose</p>
              <p className="text-3xl font-bold">
                {avgBedtime.toFixed(1)} <span className="text-lg">mg/dL</span>
              </p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Nights in Range</p>
              <p className="text-3xl font-bold">
                {optimalPercentage.toFixed(0)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">80-120 mg/dL</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[40, 200]}
                width={35}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(label) => `Date: ${label}`}
                formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(1)} mg/dL`, 'Bedtime'] : ['N/A', 'Bedtime']}
              />

              {/* Reference lines for optimal bedtime range */}
              <ReferenceLine
                y={80}
                stroke="hsl(var(--chart-2))"
                strokeDasharray="3 3"
                label={{ value: '80', position: 'right', fontSize: 11 }}
              />
              <ReferenceLine
                y={120}
                stroke="hsl(var(--chart-2))"
                strokeDasharray="3 3"
                label={{ value: '120', position: 'right', fontSize: 11 }}
              />

              <Line
                type="monotone"
                dataKey="bedtime"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
