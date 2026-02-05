# Timezone Fixes Summary

## Problem Description

The system was experiencing timezone issues where pattern detection and proactive messages were appearing at incorrect times. For example, "morning patterns" were being detected around lunch time, indicating a 5-hour offset (user is in EST/UTC-5, but the system was using UTC hours).

## Root Cause

1. **SQL Queries**: PostgreSQL's `EXTRACT(HOUR FROM timestamp)` extracts hours in UTC from TIMESTAMPTZ columns, not in the user's local timezone
2. **Server-Side Time Checks**: JavaScript `Date.getHours()` was using server timezone instead of user's timezone
3. **CSV Import**: LibreView CSV timestamps were being parsed without timezone conversion

## Solution Pattern

### PostgreSQL Timezone Conversion

Changed from:
```sql
EXTRACT(HOUR FROM timestamp) BETWEEN 4 AND 8
```

To:
```sql
EXTRACT(HOUR FROM timezone($userTimezone, timestamp)) BETWEEN 4 AND 8
```

This converts the TIMESTAMPTZ to the user's timezone before extracting the hour component.

### JavaScript Timezone Conversion

Changed from:
```javascript
const hour = now.getHours(); // Server timezone
```

To:
```javascript
const userLocalTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
const hour = userLocalTime.getHours(); // User's timezone
```

## Files Modified

### 1. `/t1d-server/src/agent/tools.ts`

**Fixed Tools:**
- `detect_patterns` - Added `userTimezone` parameter, fixed dawn phenomenon, post-meal spikes, overnight lows queries
- `analyze_overnight` - Fixed 3am-7am fasting glucose query
- `check_alert_conditions` - Fixed dawn phenomenon check
- `analyze_trends` - Fixed fasting glucose trend calculation

**Changes:**
- Added `userTimezone` parameter to tool schemas with automatic injection
- Updated all SQL queries to use `timezone($userTimezone, timestamp)` for hour extraction
- Used default timezone 'America/New_York' when not provided

### 2. `/t1d-server/src/services/proactive-monitor.ts`

**Fixed Methods:**
- `shouldSkipDuringSleep()` - Now fetches user timezone and converts server time to user's local time (10pm-7am check)
- `runProactiveAnalysis()` - Uses user's local time for time-based context messages (morning, afternoon, evening, etc.)
- `shouldSendDailySummary()` - Uses user's local time for 8am check

**Changes:**
- Fetch user timezone from database: `SELECT timezone FROM users WHERE id = $1`
- Convert server time to user time: `new Date(now.toLocaleString('en-US', { timeZone: userTimezone }))`
- Removed TODO comments about timezone adjustments

### 3. `/t1d-server/src/services/advanced-analysis.ts`

**Fixed Functions:**
- `detectAnomalies()` - Added `userTimezone` parameter for baseline calculation by hour
- `calculatePeriodMetrics()` - Fixed 3am-7am fasting glucose query
- `comparePeriods()` - Added timezone parameter and passed through to metrics calculation

**Changes:**
- Added `userTimezone` parameter with default 'America/New_York'
- Updated hour-based filtering queries to use `timezone($userTimezone, timestamp)`

### 4. `/t1d-server/src/services/report-generators.ts`

**Fixed Classes:**
- `DailyReportGenerator.generateReport()` - Added `userTimezone` parameter, fixed overnight analysis (3am-7am)

**Changes:**
- Added `userTimezone` parameter to `generateReport()` method
- Updated overnight glucose query to use `EXTRACT(HOUR FROM timezone($userTimezone, timestamp))`

### 5. `/t1d-server/src/services/reporting-service.ts`

**Fixed Methods:**
- `runDailyReports()` - Now fetches user timezone from database and passes to report generator
- `generateDailyReportNow()` - Fetches user timezone before generating report

**Changes:**
- Updated user query to include timezone: `SELECT id, email, timezone FROM users`
- Pass timezone to report generator: `generateReport(user.id, reportDate, userTimezone)`

### 6. `/t1d-server/src/services/csvParser.ts`

**Fixed Functions:**
- `parseTimestamp()` - Properly converts LibreView timestamps from user's timezone to UTC
- `parseLibreCSV()` - Now accepts and passes through `userTimezone` parameter

**Changes:**
- Implemented proper timezone conversion algorithm that handles DST:
  1. Create reference UTC date with parsed components
  2. Format as it would appear in user's timezone
  3. Calculate timezone offset for that specific date/time
  4. Apply offset to convert user's local time to UTC
- Updated function signature to accept `userTimezone` parameter

### 7. `/t1d-server/src/api/routes/import.ts`

**Fixed Endpoints:**
- `POST /api/import/csv` - Now fetches user timezone and passes to CSV parser

**Changes:**
- Query user timezone: `SELECT timezone FROM users WHERE id = $1`
- Pass timezone to parser: `parseLibreCSV(csvContent, userTimezone)`

## Testing Recommendations

### Pattern Detection
1. Verify dawn phenomenon detection occurs during actual morning hours (4am-8am in user's timezone)
2. Check overnight lows detection for 12am-6am period
3. Confirm fasting glucose analysis uses 3am-7am window

### Proactive Monitor
1. Verify morning messages arrive during morning hours (not lunch time)
2. Check sleep detection prevents messages between 10pm-7am user time
3. Confirm daily summaries generate at 8am user time
4. Test time-based context messages match user's actual time of day

### Reports
1. Verify overnight stability in daily reports uses correct 3am-7am window
2. Check that scheduled reports run at correct times relative to user timezone

### CSV Import
1. Import LibreView CSV exported in different timezone than server
2. Verify glucose timestamps match the actual reading times
3. Test with dates spanning DST transitions

## Known Limitations

1. All timezone logic assumes users have their timezone set correctly in the database
2. Default timezone is 'America/New_York' if user timezone is not set
3. System uses IANA timezone names (e.g., 'America/New_York', 'Europe/London')
4. CSV parser correctly handles DST transitions for the specific dates being imported

## Verification Commands

### Check user timezone setting:
```sql
SELECT id, email, timezone FROM users;
```

### Verify glucose reading timestamps:
```sql
SELECT
  timestamp,
  timezone('America/New_York', timestamp) as est_time,
  EXTRACT(HOUR FROM timezone('America/New_York', timestamp)) as hour_est
FROM glucose_readings
WHERE user_id = '<user_id>'
ORDER BY timestamp DESC
LIMIT 10;
```

### Test pattern detection with timezone:
```sql
SELECT
  EXTRACT(HOUR FROM timezone('America/New_York', timestamp)) as hour,
  AVG(glucose) as avg_glucose
FROM glucose_readings
WHERE user_id = '<user_id>'
  AND timestamp >= NOW() - INTERVAL '14 days'
  AND EXTRACT(HOUR FROM timezone('America/New_York', timestamp)) BETWEEN 4 AND 8
GROUP BY EXTRACT(HOUR FROM timezone('America/New_York', timestamp))
ORDER BY hour;
```

## Deployment Notes

1. No database migrations required - timezone column already exists in users table
2. No breaking API changes - timezone parameters have defaults
3. Existing data remains valid - only query logic changed
4. Test in staging environment with users in different timezones before production deployment

## Related Issues

This fix resolves:
- Morning patterns appearing at lunch time
- Sleep detection not working correctly
- Overnight analysis using wrong time windows
- Fasting glucose calculations using incorrect hours
- CSV import timestamps being offset by server/user timezone difference

## Future Enhancements

1. Add timezone validation when users update their settings
2. Display user's local time in proactive messages
3. Add timezone-aware scheduling for reports
4. Create UI to help users set correct timezone (auto-detect from browser)
5. Add timezone info to agent system prompt for better context
