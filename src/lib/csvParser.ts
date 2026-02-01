import Papa from 'papaparse';
import type { GlucoseReading } from '@/types/glucose';
import { parse } from 'date-fns';

export interface LibreCSVRow {
  Device: string;
  'Serial Number': string;
  'Device Timestamp': string;
  'Record Type': string;
  'Historic Glucose mg/dL': string;
  'Scan Glucose mg/dL': string;
}

export function parseLibreCSV(csvContent: string): GlucoseReading[] {
  const readings: GlucoseReading[] = [];

  // Libre CSV has a metadata row first, then headers, then data
  // Split by newlines and skip the first row
  const lines = csvContent.split('\n');
  if (lines.length < 3) {
    console.error('CSV file is too short');
    return readings;
  }

  // Join lines starting from the second line (index 1) which should be the header
  const csvWithoutMetadata = lines.slice(1).join('\n');

  const result = Papa.parse<LibreCSVRow>(csvWithoutMetadata, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  console.log('Parsed rows:', result.data.length);
  console.log('First row sample:', result.data[0]);

  for (const row of result.data) {
    // Skip rows without glucose data (Record Type 0 has Historic Glucose)
    const glucoseValue = row['Historic Glucose mg/dL'] || row['Scan Glucose mg/dL'];

    if (!glucoseValue || glucoseValue === '' || row['Record Type'] !== '0') {
      continue;
    }

    const glucose = parseFloat(glucoseValue);
    if (isNaN(glucose)) {
      continue;
    }

    // Parse timestamp - format is like "10-18-2025 11:53 AM"
    try {
      const timestamp = parse(
        row['Device Timestamp'],
        'MM-dd-yyyy hh:mm a',
        new Date()
      );

      if (isNaN(timestamp.getTime())) {
        continue;
      }

      readings.push({
        timestamp,
        glucose,
        device: row.Device,
        recordType: parseInt(row['Record Type']),
      });
    } catch (error) {
      console.error('Error parsing timestamp:', row['Device Timestamp'], error);
      continue;
    }
  }

  console.log('Total glucose readings found:', readings.length);

  // Sort by timestamp
  readings.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return readings;
}

export function saveGlucoseData(readings: GlucoseReading[]): void {
  try {
    const serializedData = readings.map(r => ({
      ...r,
      timestamp: r.timestamp.toISOString(),
    }));
    localStorage.setItem('glucoseData', JSON.stringify(serializedData));
  } catch (error) {
    console.error('Error saving glucose data:', error);
  }
}

export function loadGlucoseData(): GlucoseReading[] | null {
  try {
    const data = localStorage.getItem('glucoseData');
    if (!data) return null;

    const parsed = JSON.parse(data);
    return parsed.map((r: any) => ({
      ...r,
      timestamp: new Date(r.timestamp),
    }));
  } catch (error) {
    console.error('Error loading glucose data:', error);
    return null;
  }
}
