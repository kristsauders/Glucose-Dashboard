import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { MealLog } from '@/types/logs';
import type { GlucoseReading } from '@/types/glucose';
import type { InsulinLog, ExerciseLog } from '@/types/logs';
import { analyzeMealsImpact } from '@/lib/logAnalysis';
import { format } from 'date-fns';
import { TrendingUp, Clock, Target, Activity, ArrowDownToLine } from 'lucide-react';
import { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, ReferenceLine } from 'recharts';

interface MealImpactAnalysisProps {
  meals: MealLog[];
  glucoseReadings: GlucoseReading[];
  insulin?: InsulinLog[];
  exercise?: ExerciseLog[];
  dateRange?: string;
}

export function MealImpactAnalysis({ meals, glucoseReadings, insulin = [], exercise = [], dateRange = 'live' }: MealImpactAnalysisProps) {
  const impacts = useMemo(() =>
    analyzeMealsImpact(meals, glucoseReadings, insulin),
    [meals, glucoseReadings, insulin]
  );

  // Helper to find events during a meal's 3-hour window
  const getEventsInWindow = (mealTime: Date) => {
    const mealMs = new Date(mealTime).getTime();
    const windowEnd = mealMs + 3 * 60 * 60 * 1000;

    const insulinEvents = insulin.filter(i => {
      const time = new Date(i.timestamp).getTime();
      return time > mealMs && time <= windowEnd;
    }).map(i => ({
      minutes: Math.round((new Date(i.timestamp).getTime() - mealMs) / (60 * 1000)),
      type: 'insulin' as const,
      label: `${i.units}u ${i.insulin_type}`,
    }));

    const mealEvents = meals.filter(m => {
      const time = new Date(m.timestamp).getTime();
      return time > mealMs && time <= windowEnd;
    }).map(m => ({
      minutes: Math.round((new Date(m.timestamp).getTime() - mealMs) / (60 * 1000)),
      type: 'meal' as const,
      label: `${m.carbs}g carbs`,
    }));

    const exerciseEvents = exercise.filter(e => {
      const time = new Date(e.timestamp).getTime();
      return time > mealMs && time <= windowEnd;
    }).map(e => ({
      minutes: Math.round((new Date(e.timestamp).getTime() - mealMs) / (60 * 1000)),
      type: 'exercise' as const,
      label: `${e.activity_type || 'Exercise'} (${e.duration_minutes}m)`,
    }));

    return [...insulinEvents, ...mealEvents, ...exerciseEvents].sort((a, b) => a.minutes - b.minutes);
  };

  // Don't show anything if no meals at all
  if (meals.length === 0) {
    return null;
  }

  // If we have meals but no impacts, show meals without impact data in live mode
  if (impacts.length === 0 && dateRange === 'live') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card id="meal-impact-analysis">
          <CardHeader>
            <CardTitle>Meal Impact Analysis</CardTitle>
            <CardDescription>
              {meals.length} meal{meals.length !== 1 ? 's' : ''} logged today
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {meals.map((meal, index) => (
                <div
                  key={`${meal.id}-${index}`}
                  className="p-4 rounded-lg border bg-muted/50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold">
                        {meal.description || 'Meal'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(meal.timestamp), 'h:mm a')}
                        {meal.carbs > 0 && ` • ${meal.carbs}g carbs`}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground italic">
                    Waiting for glucose data... (need 3 hours of readings)
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // In historical mode, don't show if no impacts
  if (impacts.length === 0) {
    return null;
  }

  // Calculate aggregate stats for historical mode
  const avgSpike = impacts.reduce((sum, i) => sum + i.totalRise, 0) / impacts.length;
  const avgPeak = impacts.reduce((sum, i) => sum + i.peakGlucose, 0) / impacts.length;
  const avgTimeToPeak = impacts.reduce((sum, i) => sum + i.timeToPeakMinutes, 0) / impacts.length;
  const avgTimeInRange = impacts.reduce((sum, i) => sum + i.timeInRangePct, 0) / impacts.length;

  const getSpikeColor = (spike: number): string => {
    if (spike < 30) return 'text-[hsl(var(--chart-2))]'; // Green - good
    if (spike < 50) return 'text-primary'; // Normal
    if (spike < 80) return 'text-[hsl(var(--chart-3))]'; // Orange - moderate
    return 'text-[hsl(var(--chart-1))]'; // Red - large spike
  };

  const getSpikeBgColor = (spike: number): string => {
    if (spike < 30) return 'bg-[hsl(var(--chart-2))]/10';
    if (spike < 50) return 'bg-primary/10';
    if (spike < 80) return 'bg-[hsl(var(--chart-3))]/10';
    return 'bg-[hsl(var(--chart-1))]/10';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card id="meal-impact-analysis">
        <CardHeader>
          <CardTitle>Meal Impact Analysis</CardTitle>
          <CardDescription>
            {dateRange === 'live'
              ? `Today's meals and their glucose impact (${impacts.length} meal${impacts.length !== 1 ? 's' : ''})`
              : `Average meal impact across ${impacts.length} meal${impacts.length !== 1 ? 's' : ''}`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dateRange === 'live' ? (
            // Live mode: Show individual meals
            <div className="space-y-4">
              {impacts.map((impact, index) => (
                <div
                  key={`${impact.meal.id}-${index}`}
                  className="p-4 rounded-lg border bg-card"
                >
                  {/* Meal header */}
                  <div className="mb-4">
                    <h4 className="font-semibold text-lg">
                      {impact.meal.description || 'Meal'}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(impact.meal.timestamp), 'h:mm a')}
                      {impact.meal.carbs > 0 && ` • ${impact.meal.carbs}g carbs`}
                    </p>
                  </div>

                  {/* Glucose curve sparkline */}
                  <div className="mb-4 p-3 rounded-lg bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-2">3-Hour Glucose Response</div>
                    <div className="flex justify-center">
                      <div className="w-full md:w-2/3 lg:w-1/2">
                        <ResponsiveContainer width="100%" height={120}>
                          <LineChart data={impact.glucoseCurve} margin={{ top: 5, right: 40, bottom: 5, left: 35 }}>
                            <YAxis domain={[60, 200]} hide />
                            <Line
                              type="monotone"
                              dataKey="glucose"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              dot={false}
                            />
                            {/* Baseline glucose line */}
                            <ReferenceLine
                              y={impact.baselineGlucose}
                              stroke="hsl(var(--muted-foreground))"
                              strokeDasharray="2 2"
                              strokeWidth={1}
                              label={{
                                value: impact.baselineGlucose.toFixed(0),
                                position: 'left',
                                fill: 'hsl(var(--muted-foreground))',
                                fontSize: 11,
                              }}
                            />
                            {/* Peak glucose line */}
                            <ReferenceLine
                              y={impact.peakGlucose}
                              stroke="hsl(var(--chart-1))"
                              strokeDasharray="2 2"
                              strokeWidth={1}
                              label={{
                                position: 'top',
                                content: ({ viewBox }) => {
                                  // Type guard for Cartesian ViewBox
                                  if (!viewBox || typeof viewBox === 'number' || !('width' in viewBox)) return null;

                                  // Find the index in the curve where peak occurs
                                  const peakIndex = impact.glucoseCurve.findIndex(
                                    p => Math.abs(p.glucose - impact.peakGlucose) < 0.5
                                  );
                                  if (peakIndex === -1) return null;

                                  // Calculate x position based on chart width and data points
                                  const chartWidth = viewBox.width || 0;
                                  const dataPoints = impact.glucoseCurve.length;
                                  const x = (viewBox.x || 0) + (chartWidth * peakIndex / (dataPoints - 1));
                                  const y = (viewBox.y || 0) - 8;

                                  return (
                                    <text
                                      x={x}
                                      y={y}
                                      fill="hsl(var(--chart-1))"
                                      fontSize={11}
                                      textAnchor="middle"
                                    >
                                      {impact.peakGlucose.toFixed(0)}
                                    </text>
                                  );
                                },
                              }}
                            />
                            {/* Ending glucose (at 3 hours) line */}
                            {impact.glucoseAt3Hours !== null && (
                              <ReferenceLine
                                y={impact.glucoseAt3Hours}
                                stroke="hsl(var(--chart-2))"
                                strokeDasharray="2 2"
                                strokeWidth={1}
                                label={{
                                  value: impact.glucoseAt3Hours.toFixed(0),
                                  position: 'right',
                                  fill: 'hsl(var(--chart-2))',
                                  fontSize: 11,
                                }}
                              />
                            )}
                            {/* Event markers */}
                            {getEventsInWindow(impact.meal.timestamp).map((event, idx) => (
                              <ReferenceLine
                                key={`event-${idx}`}
                                x={impact.glucoseCurve.findIndex(p => p.minutes >= event.minutes)}
                                stroke={
                                  event.type === 'insulin' ? 'hsl(var(--chart-1))' :
                                  event.type === 'exercise' ? 'hsl(var(--chart-2))' :
                                  'hsl(var(--chart-3))'
                                }
                                strokeWidth={1.5}
                                strokeDasharray="3 3"
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>Meal</span>
                          <span>+3h</span>
                        </div>
                        {/* Event legend */}
                        {getEventsInWindow(impact.meal.timestamp).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {getEventsInWindow(impact.meal.timestamp).map((event, idx) => (
                              <div
                                key={`legend-${idx}`}
                                className="flex items-center gap-1 text-xs text-muted-foreground"
                              >
                                <div
                                  className="w-3 h-3 border-2 border-dashed rounded-sm"
                                  style={{
                                    borderColor: event.type === 'insulin' ? 'hsl(var(--chart-1))' :
                                                event.type === 'exercise' ? 'hsl(var(--chart-2))' :
                                                'hsl(var(--chart-3))'
                                  }}
                                />
                                <span>{event.label}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className={`p-3 rounded-lg ${getSpikeBgColor(impact.totalRise)}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className={`h-4 w-4 ${getSpikeColor(impact.totalRise)}`} />
                        <span className="text-xs text-muted-foreground">Spike</span>
                      </div>
                      <div className={`text-xl font-bold ${getSpikeColor(impact.totalRise)}`}>
                        +{impact.totalRise.toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">mg/dL</div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Time to Peak</span>
                      </div>
                      <div className="text-xl font-bold">
                        {impact.timeToPeakMinutes}
                      </div>
                      <div className="text-xs text-muted-foreground">minutes</div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-2 mb-1">
                        <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Return Time</span>
                      </div>
                      <div className="text-xl font-bold">
                        {impact.timeToBaselineMinutes !== null ? impact.timeToBaselineMinutes : '>180'}
                      </div>
                      <div className="text-xs text-muted-foreground">minutes</div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-2 mb-1">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">In Range</span>
                      </div>
                      <div className="text-xl font-bold">
                        {impact.timeInRangePct.toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground">70-180 mg/dL</div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-2 mb-1">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">In Target</span>
                      </div>
                      <div className="text-xl font-bold">
                        {impact.timeInTargetPct.toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground">70-140 mg/dL</div>
                    </div>

                    {impact.carbRatio !== null && impact.insulinDose !== null && (
                      <div className="p-3 rounded-lg bg-muted">
                        <div className="flex items-center gap-2 mb-1">
                          <Activity className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Carb Ratio</span>
                        </div>
                        <div className="text-xl font-bold">
                          {impact.carbRatio.toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">g/u ({impact.insulinDose.toFixed(1)}u)</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Historical mode: Show aggregate statistics
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`p-4 rounded-lg ${getSpikeBgColor(avgSpike)}`}>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className={`h-5 w-5 ${getSpikeColor(avgSpike)}`} />
                  <span className="text-sm text-muted-foreground">Avg Spike</span>
                </div>
                <div className={`text-2xl font-bold ${getSpikeColor(avgSpike)}`}>
                  +{avgSpike.toFixed(0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">mg/dL rise</div>
              </div>

              <div className="p-4 rounded-lg bg-muted">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Avg Peak</span>
                </div>
                <div className="text-2xl font-bold">
                  {avgPeak.toFixed(0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">mg/dL</div>
              </div>

              <div className="p-4 rounded-lg bg-muted">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Avg Time to Peak</span>
                </div>
                <div className="text-2xl font-bold">
                  {avgTimeToPeak.toFixed(0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">minutes</div>
              </div>

              <div className="p-4 rounded-lg bg-muted">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Avg In Range</span>
                </div>
                <div className="text-2xl font-bold">
                  {avgTimeInRange.toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">post-meal</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
