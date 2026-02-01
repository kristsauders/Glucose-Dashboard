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
}

export interface BedtimeMetrics {
  date: string;
  bedtimeGlucose: number; // average from 10pm-midnight
}

export interface DateRange {
  start: Date;
  end: Date;
}
