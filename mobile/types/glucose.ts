export interface GlucoseReading {
  id: string;
  user_id: string;
  timestamp: string;
  glucose: number;
  device?: string;
  source?: string;
  trend?: number;
  record_type?: string;
  is_compression_suspect?: boolean;
  /** Interpolated value when is_compression_suspect is true; equals glucose otherwise. */
  smoothed_glucose?: number;
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
