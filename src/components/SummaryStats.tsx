import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { GlucoseReading, DailyMetrics } from '@/types/glucose';
import { Activity, TrendingDown, TrendingUp, Target, AlertCircle } from 'lucide-react';

interface SummaryStatsProps {
  readings: GlucoseReading[];
  dailyMetrics: DailyMetrics[];
}

export function SummaryStats({ readings, dailyMetrics }: SummaryStatsProps) {
  // Calculate overall statistics
  const allGlucose = readings.map(r => r.glucose).filter(g => !isNaN(g) && isFinite(g) && g > 0);

  // Handle empty dataset
  if (allGlucose.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No glucose data available for the selected time period.
        </CardContent>
      </Card>
    );
  }

  const overallAvg = allGlucose.reduce((sum, val) => sum + val, 0) / allGlucose.length;
  const overallMin = Math.min(...allGlucose);
  const overallMax = Math.max(...allGlucose);

  // Calculate overall time in ranges
  const inRange = allGlucose.filter(g => g >= 70 && g <= 180).length;
  const inTarget = allGlucose.filter(g => g >= 70 && g <= 140).length;
  const belowRange = allGlucose.filter(g => g < 70).length;
  const aboveRange = allGlucose.filter(g => g > 180).length;
  const aboveTarget = allGlucose.filter(g => g > 140).length;

  const timeInRange = (inRange / allGlucose.length) * 100;
  const timeInTarget = (inTarget / allGlucose.length) * 100;
  const timeLow = (belowRange / allGlucose.length) * 100;
  const timeHigh = (aboveRange / allGlucose.length) * 100;
  const timeAboveTarget = (aboveTarget / allGlucose.length) * 100;

  // Calculate average CV (handle empty dailyMetrics)
  const validCVs = dailyMetrics.map(d => d.coefficientOfVariation).filter(cv => isFinite(cv));
  const avgCV = validCVs.length > 0
    ? validCVs.reduce((sum, cv) => sum + cv, 0) / validCVs.length
    : 0;

  // Estimate A1C from average glucose
  // Formula: A1C ≈ (Average Glucose + 46.7) / 28.7
  const estimatedA1C = (overallAvg + 46.7) / 28.7;

  const stats = [
    {
      title: "Average Glucose",
      value: `${overallAvg.toFixed(1)} mg/dL`,
      icon: Activity,
      color: "text-primary",
      bgColor: "bg-primary/10",
      chartId: "daily-glucose-chart",
    },
    {
      title: "Estimated A1C",
      value: `${estimatedA1C.toFixed(2)}%`,
      icon: Target,
      color: estimatedA1C <= 5.7 ? "text-[hsl(var(--chart-2))]" : "text-[hsl(var(--chart-4))]",
      bgColor: estimatedA1C <= 5.7 ? "bg-[hsl(var(--chart-2))]/10" : "bg-[hsl(var(--chart-4))]/10",
      subtitle: estimatedA1C <= 5.7 ? "Non-diabetic range" : "Pre-diabetic range",
      chartId: "weekly-a1c-chart",
    },
    {
      title: "Time in Range",
      value: `${timeInRange.toFixed(1)}%`,
      icon: Target,
      color: "text-[hsl(var(--chart-2))]",
      bgColor: "bg-[hsl(var(--chart-2))]/10",
      subtitle: "70-180 mg/dL",
      chartId: "time-in-range-chart",
    },
    {
      title: "Time in Target",
      value: `${timeInTarget.toFixed(1)}%`,
      icon: Target,
      color: "text-primary",
      bgColor: "bg-primary/10",
      subtitle: "70-140 mg/dL",
      chartId: "time-in-range-chart",
    },
    {
      title: "Time Above Target",
      value: `${timeAboveTarget.toFixed(1)}%`,
      icon: TrendingUp,
      color: "text-[hsl(var(--chart-4))]",
      bgColor: "bg-[hsl(var(--chart-4))]/10",
      subtitle: "> 140 mg/dL",
      chartId: "glucose-distribution-charts",
    },
    {
      title: "Glucose Variability",
      value: `${avgCV.toFixed(1)}%`,
      icon: Activity,
      color: avgCV <= 36 ? "text-[hsl(var(--chart-2))]" : "text-[hsl(var(--chart-4))]",
      bgColor: avgCV <= 36 ? "bg-[hsl(var(--chart-2))]/10" : "bg-[hsl(var(--chart-4))]/10",
      subtitle: avgCV <= 36 ? "Excellent stability" : "Room for improvement",
      chartId: "glucose-variability-chart",
    },
    {
      title: "Time Below Range",
      value: `${timeLow.toFixed(1)}%`,
      icon: TrendingDown,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      subtitle: "< 70 mg/dL",
      chartId: "glucose-distribution-charts",
    },
    {
      title: "Time Above Range",
      value: `${timeHigh.toFixed(1)}%`,
      icon: TrendingUp,
      color: "text-[hsl(var(--chart-1))]",
      bgColor: "bg-[hsl(var(--chart-1))]/10",
      subtitle: "> 180 mg/dL",
      chartId: "glucose-distribution-charts",
    },
    {
      title: "Glucose Range",
      value: `${overallMin} - ${overallMax}`,
      icon: AlertCircle,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      subtitle: "mg/dL",
      chartId: "daily-glucose-chart",
    },
  ];

  const scrollToChart = (chartId: string) => {
    const element = document.getElementById(chartId);
    if (element) {
      const headerOffset = 80; // Offset for sticky header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.05 }}
          >
            <Card
              className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => scrollToChart(stat.chartId)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stat.color}`}>
                  {stat.value}
                </div>
                {stat.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.subtitle}
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
