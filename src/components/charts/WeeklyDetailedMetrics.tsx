import { motion } from 'framer-motion';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WeeklyMetrics, OvernightMetrics, BedtimeMetrics, DailyMetrics } from '@/types/glucose';
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

interface WeeklyDetailedMetricsProps {
  weeklyMetrics: WeeklyMetrics[];
  overnightMetrics: OvernightMetrics[];
  bedtimeMetrics: BedtimeMetrics[];
  dailyMetrics: DailyMetrics[];
}

export function WeeklyDetailedMetrics({
  weeklyMetrics,
  overnightMetrics,
  bedtimeMetrics,
  dailyMetrics,
}: WeeklyDetailedMetricsProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);

  // Group overnight and bedtime metrics by week
  const weeklyData = weeklyMetrics.map(week => {
    const weekStart = parseISO(week.weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get overnight metrics for this week
    const weekOvernightMetrics = overnightMetrics.filter(m => {
      const date = parseISO(m.date);
      return date >= weekStart && date < weekEnd;
    });

    const avgFasting = weekOvernightMetrics.length > 0
      ? weekOvernightMetrics.reduce((sum, m) => sum + m.fastingGlucose, 0) / weekOvernightMetrics.length
      : undefined;

    // Get bedtime metrics for this week
    const weekBedtimeMetrics = bedtimeMetrics.filter(m => {
      const date = parseISO(m.date);
      return date >= weekStart && date < weekEnd;
    });

    const avgBedtime = weekBedtimeMetrics.length > 0
      ? weekBedtimeMetrics.reduce((sum, m) => sum + m.bedtimeGlucose, 0) / weekBedtimeMetrics.length
      : undefined;

    // Get daily metrics for this week to calculate spikes
    const weekDailyMetrics = dailyMetrics.filter(m => {
      const date = parseISO(m.date);
      return date >= weekStart && date < weekEnd;
    });

    const totalSpikes = weekDailyMetrics.reduce((sum, m) => sum + m.spikesAbove140, 0);
    const avgSpikesPerDay = weekDailyMetrics.length > 0 ? totalSpikes / weekDailyMetrics.length : undefined;

    return {
      week: week.weekStart,
      displayWeek: format(weekStart, 'MMM d'),
      cv: week.coefficientOfVariation,
      fasting: avgFasting,
      bedtime: avgBedtime,
      spikes: avgSpikesPerDay,
    };
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.7 }}
      className="space-y-8"
    >
      {/* Weekly CV and Spikes */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Variability & Spike Analysis</CardTitle>
          <CardDescription>
            Coefficient of variation (%) and average daily spikes per week
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={weeklyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayWeek"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                yAxisId="left"
                domain={[0, 60]}
                width={30}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(label) => `Week of ${label}`}
                formatter={(value: number | undefined, name: string | undefined) => {
                  if (value === undefined) return ['N/A', ''];
                  const labels: Record<string, string> = {
                    cv: 'CV',
                    spikes: 'Avg Spikes/Day',
                  };
                  return [
                    name === 'cv' ? `${value.toFixed(1)}%` : value.toFixed(1),
                    labels[name || ''] || name
                  ];
                }}
              />
              <Legend />

              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cv"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                name="CV (%)"
              />
              <Bar
                yAxisId="right"
                dataKey="spikes"
                fill="hsl(var(--chart-1))"
                opacity={0.6}
                name="Avg Spikes/Day"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Weekly Overnight & Bedtime */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Overnight & Bedtime Patterns (mg/dL)</CardTitle>
          <CardDescription>
            Average fasting glucose (3am-7am) and bedtime glucose (10pm-midnight) per week
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={weeklyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayWeek"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                domain={[60, 160]}
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

              <Line
                type="monotone"
                dataKey="fasting"
                stroke="hsl(var(--chart-2))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--chart-2))', r: 5 }}
                name="Avg Fasting"
              />
              <Line
                type="monotone"
                dataKey="bedtime"
                stroke="hsl(var(--chart-4))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--chart-4))', r: 5 }}
                name="Avg Bedtime"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
