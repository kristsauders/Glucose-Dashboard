/**
 * Timezone utility functions for converting timestamps
 */

/**
 * Convert a UTC timestamp to a user's local timezone
 * Returns ISO string in the format: "2026-02-04T14:30:00-05:00"
 */
export function convertToUserTimezone(utcTimestamp: Date | string, timezone: string): string {
  const date = utcTimestamp instanceof Date ? utcTimestamp : new Date(utcTimestamp);

  // Format the date in the user's timezone
  // This returns a localized string like "2/4/2026, 2:30:00 PM EST"
  const localString = date.toLocaleString('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Parse the localized string and reconstruct ISO format
  // toLocaleString gives us: "02/04/2026, 14:30:00"
  const [datePart, timePart] = localString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');

  // Get timezone offset
  const offsetMinutes = getTimezoneOffset(date, timezone);
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes <= 0 ? '+' : '-';
  const offsetString = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

  // Return ISO 8601 format with timezone offset
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetString}`;
}

/**
 * Get timezone offset in minutes from UTC
 * Negative offset means ahead of UTC (e.g., -300 for EST which is UTC-5)
 */
function getTimezoneOffset(date: Date, timezone: string): number {
  // Get the date in UTC
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));

  // Get the date in the target timezone
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));

  // Calculate difference in minutes
  return (utcDate.getTime() - tzDate.getTime()) / 60000;
}

/**
 * Format a timestamp for human-readable display
 * e.g., "Feb 4, 2:30 PM EST"
 */
export function formatTimestampForDisplay(utcTimestamp: Date | string, timezone: string): string {
  const date = utcTimestamp instanceof Date ? utcTimestamp : new Date(utcTimestamp);

  return date.toLocaleString('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}
