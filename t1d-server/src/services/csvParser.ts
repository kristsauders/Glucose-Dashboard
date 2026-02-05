interface LibreCSVRow {
  Device: string;
  'Serial Number': string;
  'Device Timestamp': string;
  'Record Type': string;
  'Historic Glucose mg/dL': string;
  'Scan Glucose mg/dL': string;
  'Non-numeric Rapid-Acting Insulin'?: string;
  'Rapid-Acting Insulin (units)'?: string;
  'Non-numeric Food'?: string;
  'Carbohydrates (grams)'?: string;
  'Non-numeric Long-Acting Insulin'?: string;
  'Long-Acting Insulin (units)'?: string;
  'Notes'?: string;
  'Strip Glucose mg/dL'?: string;
  'Ketone mmol/L'?: string;
  'Meal Insulin (units)'?: string;
  'Correction Insulin (units)'?: string;
  'User Change Insulin (units)'?: string;
}

export interface ParsedGlucoseReading {
  timestamp: string;
  glucose: number;
  device: string;
  recordType: number;
}

export interface ParsedMeal {
  timestamp: string;
  carbs: number;
  description?: string;
  notes?: string;
}

export interface ParsedInsulin {
  timestamp: string;
  units: number;
  type: 'basal' | 'bolus';
  insulinType: string;
  notes?: string;
}

export interface ParsedCSVData {
  glucoseReadings: ParsedGlucoseReading[];
  meals: ParsedMeal[];
  insulin: ParsedInsulin[];
}

function parseTimestamp(timestamp: string, userTimezone: string = 'America/New_York'): string {
  // LibreView format: "MM-DD-YYYY HH:MM AM/PM"
  // IMPORTANT: LibreView exports in user's local timezone, not UTC
  const [datePart, timePart, period] = timestamp.split(' ');
  const [month, day, year] = datePart.split('-');
  const [hours, minutes] = timePart.split(':');

  let hour = parseInt(hours);
  if (period === 'PM' && hour !== 12) {
    hour += 12;
  } else if (period === 'AM' && hour === 12) {
    hour = 0;
  }

  // Strategy: Calculate timezone offset for the specific date/time (handles DST)
  // 1. Create a reference UTC date with the parsed components
  const referenceUtcMillis = Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), hour, parseInt(minutes), 0);
  const referenceUtcDate = new Date(referenceUtcMillis);

  // 2. Format this UTC time as it would appear in the user's timezone
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(referenceUtcDate);

  // 3. Extract components from formatted string (e.g., "01/15/2024, 03:30:00")
  const parts = formatted.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+):(\d+)/);
  if (!parts) {
    throw new Error(`Failed to parse formatted date: ${formatted}`);
  }

  const [, fMonth, fDay, fYear, fHour, fMinute, fSecond] = parts;
  const formattedUtcMillis = Date.UTC(
    parseInt(fYear),
    parseInt(fMonth) - 1,
    parseInt(fDay),
    parseInt(fHour),
    parseInt(fMinute),
    parseInt(fSecond)
  );

  // 4. Calculate timezone offset (handles DST correctly)
  const tzOffsetMillis = referenceUtcMillis - formattedUtcMillis;

  // 5. Apply offset to convert user's local time to UTC
  const localTimeMillis = Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), hour, parseInt(minutes), 0);
  const utcMillis = localTimeMillis + tzOffsetMillis;

  return new Date(utcMillis).toISOString();
}

export function parseLibreCSV(csvContent: string, userTimezone: string = 'America/New_York'): ParsedCSVData {
  const result: ParsedCSVData = {
    glucoseReadings: [],
    meals: [],
    insulin: [],
  };

  // Split by newlines and skip first row (metadata)
  const lines = csvContent.split('\n').slice(1);

  if (lines.length < 2) {
    throw new Error('CSV file is too short or invalid');
  }

  // Parse header row
  const headers = lines[0].split(',').map(h => h.trim());

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());
    const row: Partial<LibreCSVRow> = {};

    headers.forEach((header, index) => {
      row[header as keyof LibreCSVRow] = values[index];
    });

    const timestamp = row['Device Timestamp'];
    if (!timestamp) continue;

    try {
      const isoTimestamp = parseTimestamp(timestamp, userTimezone);

      // Parse glucose readings
      const glucoseValue = row['Historic Glucose mg/dL'] || row['Scan Glucose mg/dL'];
      if (glucoseValue && row['Record Type'] === '0') {
        const glucose = parseFloat(glucoseValue);
        if (!isNaN(glucose)) {
          result.glucoseReadings.push({
            timestamp: isoTimestamp,
            glucose,
            device: row.Device || 'Unknown',
            recordType: parseInt(row['Record Type'] || '0'),
          });
        }
      }

      // Parse meals/carbs
      const carbs = row['Carbohydrates (grams)'];
      if (carbs) {
        const carbsNum = parseFloat(carbs);
        if (!isNaN(carbsNum) && carbsNum > 0) {
          result.meals.push({
            timestamp: isoTimestamp,
            carbs: carbsNum,
            description: row['Non-numeric Food'],
            notes: row['Notes'],
          });
        }
      }

      // Parse rapid-acting insulin (bolus)
      const rapidInsulin = row['Rapid-Acting Insulin (units)'];
      if (rapidInsulin) {
        const units = parseFloat(rapidInsulin);
        if (!isNaN(units) && units > 0) {
          result.insulin.push({
            timestamp: isoTimestamp,
            units,
            type: 'bolus',
            insulinType: 'rapid',
            notes: row['Non-numeric Rapid-Acting Insulin'],
          });
        }
      }

      // Parse long-acting insulin (basal)
      const longInsulin = row['Long-Acting Insulin (units)'];
      if (longInsulin) {
        const units = parseFloat(longInsulin);
        if (!isNaN(units) && units > 0) {
          result.insulin.push({
            timestamp: isoTimestamp,
            units,
            type: 'basal',
            insulinType: 'long-acting',
            notes: row['Non-numeric Long-Acting Insulin'],
          });
        }
      }
    } catch (error) {
      console.error('Error parsing row:', error);
      continue;
    }
  }

  console.log(`Parsed CSV: ${result.glucoseReadings.length} glucose readings, ${result.meals.length} meals, ${result.insulin.length} insulin doses`);

  return result;
}
