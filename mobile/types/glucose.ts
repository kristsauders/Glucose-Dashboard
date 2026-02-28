export interface GlucoseReading {
  id: string;
  user_id: string;
  timestamp: string;
  glucose: number;
  device?: string;
  source?: string;
  trend?: number;
  record_type?: string;
}

export interface GlucoseSummary {
  period: string;
  totalReadings: number;
  avgGlucose: string;
  minGlucose: string;
  maxGlucose: string;
  stdDev: string;
  cv: string;
  estimatedA1c: string;
  timeInRange: {
    '70-180': string;
    '70-140': string;
    below70: string;
    above180: string;
  };
}
