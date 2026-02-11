import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { MealLog } from '@/types/logs';
import type { GlucoseReading } from '@/types/glucose';
import { analyzeMealsImpact } from '@/lib/logAnalysis';
import { format } from 'date-fns';
import { TrendingUp, Clock, Target, Activity } from 'lucide-react';
import { useMemo } from 'react';

interface MealImpactAnalysisProps {
  meals: MealLog[];
  glucoseReadings: GlucoseReading[];
  dateRange?: string;
}

export function MealImpactAnalysis({ meals, glucoseReadings, dateRange = 'live' }: MealImpactAnalysisProps) {
  const impacts = useMemo(() =>
    analyzeMealsImpact(meals, glucoseReadings),
    [meals, glucoseReadings]
  );

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

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Baseline</span>
                      </div>
                      <div className="text-xl font-bold">
                        {impact.baselineGlucose.toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">mg/dL</div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Peak</span>
                      </div>
                      <div className="text-xl font-bold">
                        {impact.peakGlucose.toFixed(0)}
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
                        <Target className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">In Range</span>
                      </div>
                      <div className="text-xl font-bold">
                        {impact.timeInRangePct.toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground">post-meal</div>
                    </div>
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
