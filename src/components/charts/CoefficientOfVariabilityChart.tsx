import { motion } from 'framer-motion';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DailyMetrics } from '@/types/glucose';
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

interface CVChartProps {
  data: DailyMetrics[];
}

export function CoefficientOfVariabilityChart({ data }: CVChartProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);
  const chartData = data.map(d => ({
    date: d.date,
    displayDate: format(parseISO(d.date), 'MMM d'),
    cv: d.coefficientOfVariation,
  }));

  // Calculate average CV
  const avgCV = data.reduce((sum, d) => sum + d.coefficientOfVariation, 0) / data.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Glucose Variability - CV (%)</CardTitle>
          <CardDescription>
            Daily coefficient of variation - lower is better (target &lt;36%)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground mb-1">Average CV</p>
            <p className="text-3xl font-bold">
              {avgCV.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {avgCV <= 36
                ? '✓ Excellent glucose stability'
                : 'Consider strategies to reduce variability'}
            </p>
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
                domain={[0, 60]}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(label) => `Date: ${label}`}
                formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(1)}%`, 'CV'] : ['N/A', 'CV']}
              />

              {/* Reference line for target CV */}
              <ReferenceLine
                y={36}
                stroke="hsl(var(--chart-4))"
                strokeDasharray="5 5"
                label={{ value: 'Target (36%)', position: 'right', fontSize: 12 }}
              />

              <Line
                type="monotone"
                dataKey="cv"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>

          <div className="mt-4 text-sm text-muted-foreground">
            <p>CV measures glucose variability. Lower values indicate more stable glucose levels.</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
