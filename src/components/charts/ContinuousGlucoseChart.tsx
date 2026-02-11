import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GlucoseReading } from '@/types/glucose';
import type { InsulinLog, MealLog, ExerciseLog } from '@/types/logs';
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
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import { createTimelineEvents } from '@/lib/logAnalysis';
import { useMemo } from 'react';

interface ContinuousGlucoseChartProps {
  data: GlucoseReading[];
  title?: string;
  description?: string;
  insulin?: InsulinLog[];
  meals?: MealLog[];
  exercise?: ExerciseLog[];
  showEvents?: boolean;
}

export function ContinuousGlucoseChart({
  data,
  title = "Continuous Glucose Monitoring (mg/dL)",
  description = "Detailed glucose readings over time",
  insulin = [],
  meals = [],
  exercise = [],
  showEvents = true,
}: ContinuousGlucoseChartProps) {
  const chartHeight = useResponsiveChartHeight(300, 450);
  const chartData = data.map(reading => ({
    timestamp: reading.timestamp.getTime(),
    glucose: reading.glucose,
    displayTime: format(reading.timestamp, 'MMM d, h:mm a'),
  }));

  // Calculate some quick stats
  const avgGlucose = data.reduce((sum, r) => sum + r.glucose, 0) / data.length;
  const minGlucose = Math.min(...data.map(r => r.glucose));
  const maxGlucose = Math.max(...data.map(r => r.glucose));

  // Create timeline events for annotations
  const events = useMemo(() => {
    if (!showEvents || (insulin.length === 0 && meals.length === 0 && exercise.length === 0)) {
      return [];
    }
    return createTimelineEvents(insulin, meals, exercise, data);
  }, [insulin, meals, exercise, data, showEvents]);

  // Get event colors
  const getEventColor = (type: 'insulin' | 'meal' | 'exercise'): string => {
    switch (type) {
      case 'insulin':
        return 'hsl(var(--chart-4))'; // Purple/blue for insulin
      case 'meal':
        return 'hsl(var(--chart-3))'; // Orange for meals
      case 'exercise':
        return 'hsl(var(--chart-2))'; // Green for exercise
      default:
        return 'hsl(var(--muted-foreground))';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Average</p>
              <p className="text-2xl font-bold">
                {avgGlucose.toFixed(0)} <span className="text-sm">mg/dL</span>
              </p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Low</p>
              <p className="text-2xl font-bold">
                {minGlucose} <span className="text-sm">mg/dL</span>
              </p>
            </div>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">High</p>
              <p className="text-2xl font-bold">
                {maxGlucose} <span className="text-sm">mg/dL</span>
              </p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData} margin={{ top: 60, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(timestamp) => format(new Date(timestamp), 'MMM d')}
                tick={{ fontSize: 12 }}
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
                labelFormatter={(timestamp) => format(new Date(timestamp), 'MMM d, yyyy h:mm a')}
                formatter={(value: number | undefined) => value !== undefined ? [`${value} mg/dL`, 'Glucose'] : ['N/A', 'Glucose']}
              />

              {/* Target range shading (70-140) */}
              <ReferenceArea
                y1={70}
                y2={140}
                fill="hsl(var(--chart-2))"
                fillOpacity={0.1}
              />

              {/* Reference lines */}
              <ReferenceLine y={70} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
              <ReferenceLine y={140} stroke="hsl(var(--chart-4))" strokeDasharray="3 3" />
              <ReferenceLine y={180} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />

              {/* Event annotations */}
              {events.map((event, index) => (
                <ReferenceLine
                  key={`event-${index}`}
                  x={event.timestamp.getTime()}
                  stroke={getEventColor(event.type)}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  label={{
                    value: event.label,
                    position: 'top',
                    fill: getEventColor(event.type),
                    fontSize: 9,
                    fontWeight: 'bold',
                    angle: -45,
                    offset: 10,
                    textAnchor: 'start',
                  }}
                />
              ))}

              <Line
                type="monotone"
                dataKey="glucose"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[hsl(var(--chart-2))] opacity-20" />
              <span>Target Range (70-140 mg/dL)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
