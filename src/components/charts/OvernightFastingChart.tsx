import { motion } from 'framer-motion';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { OvernightMetrics } from '@/types/glucose';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  Legend,
  LineChart,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface OvernightFastingChartProps {
  data: OvernightMetrics[];
}

export function OvernightFastingChart({ data }: OvernightFastingChartProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);
  const isSingleNight = data.length === 1;
  const lastNight = data[data.length - 1];

  // Calculate average fasting glucose
  const avgFasting = data.reduce((sum, d) => sum + d.fastingGlucose, 0) / data.length;

  // Helper functions for trend display
  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'rising':
        return '↗';
      case 'falling':
        return '↘';
      case 'stable':
        return '→';
      default:
        return '→';
    }
  };

  const getTrendColor = (trend?: string) => {
    switch (trend) {
      case 'rising':
        return 'text-[hsl(var(--chart-1))]';
      case 'falling':
        return 'text-[hsl(var(--chart-2))]';
      case 'stable':
        return 'text-primary';
      default:
        return 'text-primary';
    }
  };

  const getTrendLabel = (trend?: string) => {
    switch (trend) {
      case 'rising':
        return 'Rising';
      case 'falling':
        return 'Falling';
      case 'stable':
        return 'Stable';
      default:
        return 'Unknown';
    }
  };

  // For single night view (Live mode), show detailed readings
  if (isSingleNight && lastNight.readings && lastNight.readings.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Last Night's Overnight Fasting</CardTitle>
            <CardDescription>
              3am-7am glucose trend and stability
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Average</p>
                <p className="text-2xl font-bold">
                  {lastNight.fastingGlucose.toFixed(1)}
                </p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Trend</p>
                <p className={`text-2xl font-bold ${getTrendColor(lastNight.trend)}`}>
                  {getTrendIcon(lastNight.trend)} {getTrendLabel(lastNight.trend)}
                </p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Change</p>
                <p className={`text-2xl font-bold ${getTrendColor(lastNight.trend)}`}>
                  {lastNight.trendChange !== undefined && lastNight.trendChange > 0 ? '+' : ''}
                  {lastNight.trendChange?.toFixed(0)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lastNight.startingGlucose?.toFixed(0)} → {lastNight.endingGlucose?.toFixed(0)} mg/dL
                </p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Stability</p>
                <p className="text-2xl font-bold">
                  {lastNight.stability !== undefined ? lastNight.stability.toFixed(1) : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lastNight.stability !== undefined && lastNight.stability < 15
                    ? 'Very stable'
                    : lastNight.stability !== undefined && lastNight.stability < 25
                    ? 'Stable'
                    : 'Variable'}
                </p>
              </div>
            </div>

            {/* Detailed Time Series Chart */}
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={lastNight.readings} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="time"
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
                  labelFormatter={(label) => `Time: ${label}`}
                  formatter={(value: number | undefined) => {
                    if (value === undefined) return ['N/A', 'Glucose'];
                    return [`${value.toFixed(1)} mg/dL`, 'Glucose'];
                  }}
                />

                {/* Reference lines for optimal fasting range */}
                <ReferenceLine
                  y={70}
                  stroke="hsl(var(--chart-2))"
                  strokeDasharray="3 3"
                  label={{ value: '70', position: 'right', fontSize: 11 }}
                />
                <ReferenceLine
                  y={100}
                  stroke="hsl(var(--chart-2))"
                  strokeDasharray="3 3"
                  label={{ value: '100', position: 'right', fontSize: 11 }}
                />

                <Line
                  type="monotone"
                  dataKey="glucose"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>

            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-[hsl(var(--chart-2))]" />
                <span>Optimal Fasting Range (70-100 mg/dL)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // Multi-night view (historical data)
  const chartData = data.map(d => ({
    date: d.date,
    displayDate: format(parseISO(d.date), 'MMM d'),
    fasting: d.fastingGlucose,
    lowest: d.lowestOvernight,
    highest: d.highestOvernight,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Overnight Fasting Glucose (mg/dL)</CardTitle>
          <CardDescription>
            Morning fasting glucose (3am-7am average) with overnight range
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground mb-1">Average Fasting Glucose</p>
            <p className="text-3xl font-bold">
              {avgFasting.toFixed(1)} <span className="text-lg">mg/dL</span>
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {avgFasting >= 70 && avgFasting <= 100
                ? '✓ Optimal fasting range'
                : avgFasting < 70
                ? 'Consider overnight lows'
                : 'Consider overnight highs'}
            </p>
          </div>

          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
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
                formatter={(value: number | undefined, name: string | undefined) => {
                  if (value === undefined) return ['N/A', ''];
                  return [`${value.toFixed(1)} mg/dL`, name || ''];
                }}
              />
              <Legend />

              {/* Reference lines for optimal fasting range */}
              <ReferenceLine y={70} stroke="hsl(var(--chart-2))" strokeDasharray="3 3" />
              <ReferenceLine y={100} stroke="hsl(var(--chart-2))" strokeDasharray="3 3" />

              {/* Overnight range shading (hidden from legend and tooltip) */}
              <Area
                type="monotone"
                dataKey="highest"
                stroke="none"
                fill="hsl(var(--primary))"
                fillOpacity={0.1}
                legendType="none"
                hide={true}
              />
              <Area
                type="monotone"
                dataKey="lowest"
                stroke="none"
                fill="hsl(var(--background))"
                fillOpacity={1}
                legendType="none"
                hide={true}
              />

              {/* Lines */}
              <Line
                type="monotone"
                dataKey="fasting"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                name="Fasting Glucose"
              />
              <Line
                type="monotone"
                dataKey="highest"
                stroke="hsl(var(--chart-1))"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                name="Overnight High"
              />
              <Line
                type="monotone"
                dataKey="lowest"
                stroke="hsl(var(--chart-2))"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                name="Overnight Low"
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-[hsl(var(--chart-2))]" />
              <span>Optimal Range (70-100 mg/dL)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
