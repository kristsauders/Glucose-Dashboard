import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { InsulinLog, MealLog } from '@/types/logs';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import { calculateCarbRatios } from '@/lib/logAnalysis';

interface CarbRatioChartProps {
  insulin: InsulinLog[];
  meals: MealLog[];
}

export function CarbRatioChart({ insulin, meals }: CarbRatioChartProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);

  const chartData = useMemo(() => {
    const ratios = calculateCarbRatios(meals, insulin);

    return ratios.map(ratio => ({
      timestamp: ratio.timestamp.getTime(),
      ratio: ratio.ratio,
      carbs: ratio.carbs,
      insulin: ratio.insulin,
      displayTime: format(ratio.timestamp, 'MMM d, h:mm a'),
      displayDate: format(ratio.timestamp, 'MMM d'),
    }));
  }, [insulin, meals]);

  if (chartData.length === 0) {
    return null;
  }

  const avgRatio = chartData.reduce((sum, d) => sum + d.ratio, 0) / chartData.length;

  // Target range for carb ratios (typically 8-15 grams per unit)
  const targetMin = 8;
  const targetMax = 15;
  const isInTargetRange = avgRatio >= targetMin && avgRatio <= targetMax;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card id="carb-ratio-chart">
        <CardHeader>
          <CardTitle>Carb-to-Insulin Ratio Over Time</CardTitle>
          <CardDescription>
            Grams of carbs per unit of rapid insulin (avg: 1:{avgRatio.toFixed(1)})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData} margin={{ top: 20, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(timestamp) => format(new Date(timestamp), 'MMM d')}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                label={{ value: 'Carb Ratio (g/u)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                width={50}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(timestamp) => format(new Date(timestamp), 'MMM d, h:mm a')}
                formatter={(value: number | undefined, name: string | undefined, props: any) => {
                  if (name === 'ratio' && typeof value === 'number' && !isNaN(value) && props.payload) {
                    const carbs = props.payload.carbs;
                    const insulin = props.payload.insulin;
                    if (typeof carbs === 'number' && typeof insulin === 'number' && !isNaN(insulin)) {
                      return [
                        `1:${value.toFixed(1)} (${carbs}g ÷ ${insulin.toFixed(1)}u)`,
                        'Ratio'
                      ];
                    }
                    return [`1:${value.toFixed(1)}`, 'Ratio'];
                  }
                  return (typeof value === 'number' && !isNaN(value)) ? [value, name || ''] : ['N/A', name || ''];
                }}
              />

              {/* Target range shading */}
              <ReferenceArea
                y1={targetMin}
                y2={targetMax}
                fill="hsl(var(--chart-2))"
                fillOpacity={0.1}
              />

              {/* Average line */}
              <ReferenceLine
                y={avgRatio}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{
                  value: `Avg: 1:${avgRatio.toFixed(1)}`,
                  position: 'right',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 11,
                }}
              />

              {/* Target range lines */}
              <ReferenceLine
                y={targetMin}
                stroke="hsl(var(--chart-2))"
                strokeDasharray="2 2"
                strokeOpacity={0.5}
              />
              <ReferenceLine
                y={targetMax}
                stroke="hsl(var(--chart-2))"
                strokeDasharray="2 2"
                strokeOpacity={0.5}
              />

              <Line
                type="monotone"
                dataKey="ratio"
                stroke={isInTargetRange ? "hsl(var(--chart-2))" : "hsl(var(--chart-4))"}
                strokeWidth={2}
                dot={{ r: 4, fill: isInTargetRange ? "hsl(var(--chart-2))" : "hsl(var(--chart-4))" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[hsl(var(--chart-2))] opacity-20" />
              <span>Target Range (1:8 - 1:15)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
