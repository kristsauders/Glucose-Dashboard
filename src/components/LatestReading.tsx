import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUp, ArrowDown, ArrowRight, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { GlucoseReading } from '@/types/glucose';

interface LatestReadingProps {
  reading: GlucoseReading | null;
  isLive?: boolean;
}

const getTrendArrow = (trend?: number) => {
  if (trend === undefined || trend === null) return { icon: ArrowRight, label: 'Steady', rotation: 0 };

  // LibreView/LibreLinkUp trend arrow values from LibreLinkUp app bundle.js
  // Source: https://gist.github.com/khskekec/6c13ba01b10d3018d816706a32ae8ab2
  // 0=NotDetermined, 1=FallingQuickly, 2=Falling, 3=Stable, 4=Rising, 5=RisingQuickly
  switch (trend) {
    case 0:
      return { icon: ArrowRight, label: 'Unknown', rotation: 0 };
    case 1:
      return { icon: ArrowDown, label: 'Falling Quickly', rotation: 0 };
    case 2:
      return { icon: ArrowDownRight, label: 'Falling', rotation: 0 };
    case 3:
      return { icon: ArrowRight, label: 'Steady', rotation: 0 };
    case 4:
      return { icon: ArrowUpRight, label: 'Rising', rotation: 0 };
    case 5:
      return { icon: ArrowUp, label: 'Rising Quickly', rotation: 0 };
    default:
      return { icon: ArrowRight, label: 'Unknown', rotation: 0 };
  }
};

const getGlucoseColor = (glucose: number) => {
  if (glucose < 70) return 'text-destructive';
  if (glucose > 180) return 'text-[hsl(var(--chart-1))]';
  if (glucose > 140) return 'text-[hsl(var(--chart-4))]';
  return 'text-[hsl(var(--chart-2))]';
};

const getGlucoseBgColor = (glucose: number) => {
  if (glucose < 70) return 'bg-destructive/10 border-destructive/20';
  if (glucose > 180) return 'bg-[hsl(var(--chart-1))]/10 border-[hsl(var(--chart-1))]/20';
  if (glucose > 140) return 'bg-[hsl(var(--chart-4))]/10 border-[hsl(var(--chart-4))]/20';
  return 'bg-[hsl(var(--chart-2))]/10 border-[hsl(var(--chart-2))]/20';
};

const getGlucoseMessage = (glucose: number) => {
  if (glucose < 54) return 'Urgent Low';
  if (glucose < 70) return 'Low';
  if (glucose <= 140) return 'In Target Range';
  if (glucose <= 180) return 'Above Target';
  if (glucose <= 250) return 'High';
  return 'Very High';
};

export function LatestReading({ reading, isLive = false }: LatestReadingProps) {
  if (!reading) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Latest Reading</CardTitle>
            <CardDescription>No recent glucose data available</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {isLive
                ? 'Connect to LibreView to see live glucose readings'
                : 'Upload glucose data to see your latest reading'}
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const trend = getTrendArrow((reading as any).trend);
  const TrendIcon = trend.icon;
  const color = getGlucoseColor(reading.glucose);
  const bgColor = getGlucoseBgColor(reading.glucose);
  const message = getGlucoseMessage(reading.glucose);
  const timeAgo = formatDistanceToNow(reading.timestamp, { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`${bgColor} border-2`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Latest Reading
                {isLive && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--chart-2))] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--chart-2))]"></span>
                    </span>
                    Live
                  </span>
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5 mt-1">
                <Clock className="h-3 w-3" />
                {timeAgo}
              </CardDescription>
            </div>
            <div className={`p-3 rounded-full ${bgColor}`}>
              <TrendIcon className={`h-6 w-6 ${color}`} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Large Glucose Value */}
            <div>
              <div className={`text-6xl md:text-7xl font-bold ${color} tracking-tight`}>
                {reading.glucose}
                <span className="text-2xl md:text-3xl ml-2 font-normal text-muted-foreground">
                  mg/dL
                </span>
              </div>
            </div>

            {/* Status Message and Trend */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div>
                <p className={`text-lg font-semibold ${color}`}>{message}</p>
                <p className="text-sm text-muted-foreground">{trend.label}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
