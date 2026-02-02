export interface GlucoseReading {
  timestamp: Date;
  glucose: number;
  device: string;
  recordType: number;
}

export interface DailyMetrics {
  date: string;
  average: number;
  min: number;
  max: number;
  standardDeviation: number;
  coefficientOfVariation: number;
  timeInRange70_180: number; // percentage
  timeInTarget70_140: number; // percentage
  spikesAbove140: number;
  readingsCount: number;
}

export interface WeeklyMetrics {
  weekStart: string;
  average: number;
  min: number;
  max: number;
  coefficientOfVariation: number;
  timeInRange70_180: number;
  timeInTarget70_140: number;
}

export interface OvernightMetrics {
  date: string;
  fastingGlucose: number; // average from 3am-7am
  lowestOvernight: number;
  highestOvernight: number;
  readings?: Array<{ time: string; glucose: number }>; // individual readings for trend analysis
  startingGlucose?: number; // first reading after 3am
  endingGlucose?: number; // last reading before 7am
  trend?: 'rising' | 'falling' | 'stable'; // overall direction
  trendChange?: number; // glucose change from start to end
  stability?: number; // standard deviation of readings
}

export interface BedtimeMetrics {
  date: string;
  bedtimeGlucose: number; // average from 10pm-midnight
}

export interface DateRange {
  start: Date;
  end: Date;
}
