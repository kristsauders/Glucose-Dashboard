import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GlucoseReading } from '@/types/glucose';
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
import { format, startOfDay, differenceInMinutes } from 'date-fns';

interface GlucoseRateOfChangeChartProps {
  readings: GlucoseReading[];
}

interface DailyRateMetrics {
  date: string;
  displayDate: string;
  maxIncrease: number; // mg/dL per hour
  maxDecrease: number; // mg/dL per hour (as positive number)
  avgRateChange: number;
}

export function GlucoseRateOfChangeChart({ readings }: GlucoseRateOfChangeChartProps) {
  // Calculate spike metrics for each day
  const dailyRates = new Map<string, { increases: number[], decreases: number[], allRates: number[] }>();

  // Sort readings by timestamp
  const sortedReadings = [...readings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Find peaks above 140 and calculate spike rates
  for (let i = 1; i < sortedReadings.length - 1; i++) {
    const curr = sortedReadings[i];
    const prev = sortedReadings[i - 1];
    const next = sortedReadings[i + 1];

    // Identify local maxima above 140 (peaks)
    if (curr.glucose > 140 && curr.glucose >= prev.glucose && curr.glucose >= next.glucose) {
      // Look back up to 60 minutes to find the minimum before this peak
      let minGlucose = curr.glucose;
      let minIndex = i;

      for (let j = i - 1; j >= 0; j--) {
        const lookbackReading = sortedReadings[j];
        const timeDiff = differenceInMinutes(curr.timestamp, lookbackReading.timestamp);

        if (timeDiff > 60) break; // Only look back 60 minutes

        if (lookbackReading.glucose < minGlucose) {
          minGlucose = lookbackReading.glucose;
          minIndex = j;
        }
      }

      // Calculate spike metrics
      const spikeMagnitude = curr.glucose - minGlucose;
      const spikeTimeMinutes = differenceInMinutes(curr.timestamp, sortedReadings[minIndex].timestamp);

      // Only include spikes that took at least 5 minutes and rose by at least 20 mg/dL
      if (spikeTimeMinutes >= 5 && spikeMagnitude >= 20) {
        const spikeRatePerHour = (spikeMagnitude / spikeTimeMinutes) * 60;

        const dateKey = format(startOfDay(curr.timestamp), 'yyyy-MM-dd');

        if (!dailyRates.has(dateKey)) {
          dailyRates.set(dateKey, { increases: [], decreases: [], allRates: [] });
        }

        const dayData = dailyRates.get(dateKey)!;
        dayData.increases.push(spikeRatePerHour);
        dayData.allRates.push(spikeRatePerHour);
      }
    }

    // Identify local minima below 140 (drops)
    if (curr.glucose < 140 && curr.glucose <= prev.glucose && curr.glucose <= next.glucose) {
      // Look back up to 60 minutes to find the maximum before this drop
      let maxGlucose = curr.glucose;
      let maxIndex = i;

      for (let j = i - 1; j >= 0; j--) {
        const lookbackReading = sortedReadings[j];
        const timeDiff = differenceInMinutes(curr.timestamp, lookbackReading.timestamp);

        if (timeDiff > 60) break; // Only look back 60 minutes

        if (lookbackReading.glucose > maxGlucose) {
          maxGlucose = lookbackReading.glucose;
          maxIndex = j;
        }
      }

      // Calculate drop metrics
      const dropMagnitude = maxGlucose - curr.glucose;
      const dropTimeMinutes = differenceInMinutes(curr.timestamp, sortedReadings[maxIndex].timestamp);

      // Only include drops that took at least 5 minutes and dropped by at least 20 mg/dL
      if (dropTimeMinutes >= 5 && dropMagnitude >= 20) {
        const dropRatePerHour = (dropMagnitude / dropTimeMinutes) * 60;

        const dateKey = format(startOfDay(curr.timestamp), 'yyyy-MM-dd');

        if (!dailyRates.has(dateKey)) {
          dailyRates.set(dateKey, { increases: [], decreases: [], allRates: [] });
        }

        const dayData = dailyRates.get(dateKey)!;
        dayData.decreases.push(dropRatePerHour);
        dayData.allRates.push(dropRatePerHour);
      }
    }
  }

  // Convert to chart data
  const chartData: DailyRateMetrics[] = Array.from(dailyRates.entries())
    .map(([date, rates]) => ({
      date,
      displayDate: format(new Date(date), 'MMM d'),
      maxIncrease: rates.increases.length > 0 ? Math.max(...rates.increases) : 0,
      maxDecrease: rates.decreases.length > 0 ? Math.max(...rates.decreases) : 0,
      avgRateChange: rates.allRates.reduce((sum, r) => sum + r, 0) / rates.allRates.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate statistics
  const avgMaxIncrease = chartData.reduce((sum, d) => sum + d.maxIncrease, 0) / chartData.length;
  const avgMaxDecrease = chartData.reduce((sum, d) => sum + d.maxDecrease, 0) / chartData.length;
  const overallMaxIncrease = Math.max(...chartData.map(d => d.maxIncrease));
  const overallMaxDecrease = Math.max(...chartData.map(d => d.maxDecrease));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.9 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Glucose Spike & Drop Analysis</CardTitle>
          <CardDescription>
            Fastest rates of rise to peaks above 140 and drops to valleys below 140 (mg/dL per hour)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Avg Max Rise</p>
              <p className="text-2xl font-bold text-[hsl(var(--chart-1))]">
                {avgMaxIncrease.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground">mg/dL/hr</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Avg Max Drop</p>
              <p className="text-2xl font-bold text-[hsl(var(--chart-2))]">
                {avgMaxDecrease.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground">mg/dL/hr</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Peak Rise</p>
              <p className="text-2xl font-bold text-[hsl(var(--chart-1))]">
                {overallMaxIncrease.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground">mg/dL/hr</p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Peak Drop</p>
              <p className="text-2xl font-bold text-[hsl(var(--chart-2))]">
                {overallMaxDecrease.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground">mg/dL/hr</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                label={{ value: 'Rate (mg/dL per hour)', angle: -90, position: 'insideLeft' }}
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
                  const labels: Record<string, string> = {
                    maxIncrease: 'Max Rise',
                    maxDecrease: 'Max Drop',
                    avgRateChange: 'Avg Rate',
                  };
                  return [`${value.toFixed(1)} mg/dL/hr`, labels[name || ''] || name];
                }}
              />
              <Legend />

              <Bar
                dataKey="maxIncrease"
                fill="hsl(var(--chart-1))"
                opacity={0.7}
                name="Max Rise"
              />
              <Bar
                dataKey="maxDecrease"
                fill="hsl(var(--chart-2))"
                opacity={0.7}
                name="Max Drop"
              />
              <Line
                type="monotone"
                dataKey="avgRateChange"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                name="Avg Rate Change"
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="mt-4 text-sm text-muted-foreground">
            <p>
              This tracks the fastest spikes to peaks above 140 and drops to valleys below 140.
              A spike from 80→160 feels worse than 120→170 even though the peak is lower, because
              the rate of rise is much faster.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
