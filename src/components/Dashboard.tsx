import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { GlucoseReading } from '@/types/glucose';
import {
  calculateDailyMetrics,
  calculateWeeklyMetrics,
  calculateOvernightMetrics,
  calculateBedtimeMetrics,
  filterReadingsByDateRange,
} from '@/lib/glucoseAnalysis';
import { SummaryStats } from './SummaryStats';
import { DailyGlucoseChart } from './charts/DailyGlucoseChart';
import { TimeInRangeChart } from './charts/TimeInRangeChart';
import { CoefficientOfVariabilityChart } from './charts/CoefficientOfVariabilityChart';
import { OvernightFastingChart } from './charts/OvernightFastingChart';
import { BedtimeGlucoseChart } from './charts/BedtimeGlucoseChart';
import { SpikeAnalysisChart } from './charts/SpikeAnalysisChart';
import { WeeklyOverviewChart } from './charts/WeeklyOverviewChart';
import { WeeklyDetailedMetrics } from './charts/WeeklyDetailedMetrics';
import { WeeklyA1CChart } from './charts/WeeklyA1CChart';
import { ContinuousGlucoseChart } from './charts/ContinuousGlucoseChart';
import { GlucoseDistributionCharts } from './charts/GlucoseDistributionCharts';
import { DateRangeSelector, type DateRangePreset } from './DateRangeSelector';
import { LibreViewSettings } from './LibreViewSettings';
import { LatestReading } from './LatestReading';
import { AIChat } from './AIChat';
import { Button } from './ui/button';
import { ThemeToggle } from './ThemeToggle';
import { Upload, MessageSquare, LogOut, X } from 'lucide-react';
import { apiService } from '@/services/api';
import { subDays, subWeeks, startOfDay, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { libreViewService } from '@/services/libreview';

interface DashboardProps {
  readings: GlucoseReading[];
  onNewUpload: () => void;
  onDataUpdated?: () => void;
}

export function Dashboard({ readings, onNewUpload, onDataUpdated }: DashboardProps) {
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [liveReadings, setLiveReadings] = useState<GlucoseReading[]>([]);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      apiService.logout();
      window.location.reload();
    }
  };

  // Fetch LibreView data
  const fetchLiveData = useCallback(async () => {
    if (!isLiveConnected) return;

    try {
      // Ensure we're authenticated
      const authenticated = await libreViewService.ensureAuthenticated();
      if (!authenticated) {
        setIsLiveConnected(false);
        return;
      }

      // Fetch glucose data
      const data = await libreViewService.getGlucoseData();

      // Convert LibreView format to our format
      const convertedReadings: GlucoseReading[] = data.graphData
        .filter((reading) => reading.ValueInMgPerDl > 0)
        .map((reading) => ({
          glucose: reading.ValueInMgPerDl,
          timestamp: new Date(reading.Timestamp),
          device: 'LibreView',
          recordType: 0,
          trend: reading.type === 1 ? reading.MeasurementColor : undefined,
        } as GlucoseReading))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Merge with stored readings to preserve older data that API no longer returns
      // This is important for bedtime data which may expire from the API after ~12 hours
      const storedReadingsJson = localStorage.getItem('liveReadings');
      let mergedReadings = [...convertedReadings];

      if (storedReadingsJson) {
        try {
          const storedReadings = (JSON.parse(storedReadingsJson) as Array<Omit<GlucoseReading, 'timestamp'> & { timestamp: string }>).map((r) => ({
            ...r,
            timestamp: new Date(r.timestamp)
          }));

          // Merge stored and new readings, removing duplicates
          const readingMap = new Map<number, GlucoseReading>();
          [...storedReadings, ...convertedReadings].forEach(reading => {
            readingMap.set(reading.timestamp.getTime(), reading);
          });

          // Filter to last 24 hours and sort
          const now = Date.now();
          const oneDayAgo = now - (24 * 60 * 60 * 1000);
          mergedReadings = Array.from(readingMap.values())
            .filter(r => r.timestamp.getTime() >= oneDayAgo)
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        } catch (error) {
          console.error('Failed to parse stored readings:', error);
        }
      }

      // Store merged readings for next time (24-hour cache for live mode)
      localStorage.setItem('liveReadings', JSON.stringify(mergedReadings));

      // Also merge into main glucose data storage so historical views include live data
      const mainDataJson = localStorage.getItem('glucoseData');
      if (mainDataJson) {
        try {
          const mainData = (JSON.parse(mainDataJson) as Array<Omit<GlucoseReading, 'timestamp'> & { timestamp: string }>).map((r) => ({
            ...r,
            timestamp: new Date(r.timestamp)
          }));

          // Merge main data with new live readings, removing duplicates
          const allReadingsMap = new Map<number, GlucoseReading>();
          [...mainData, ...mergedReadings].forEach(reading => {
            allReadingsMap.set(reading.timestamp.getTime(), reading);
          });

          // Convert back to array and sort
          const combinedData = Array.from(allReadingsMap.values())
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

          // Save merged data back to main storage
          localStorage.setItem('glucoseData', JSON.stringify(combinedData));

          // Notify parent that data has been updated
          onDataUpdated?.();
        } catch (error) {
          console.error('Failed to merge live data into main storage:', error);
        }
      } else {
        // No CSV data exists yet, so save live data as the main data
        localStorage.setItem('glucoseData', JSON.stringify(mergedReadings));

        // Notify parent that data has been updated
        onDataUpdated?.();
      }

      setLiveReadings(mergedReadings);
    } catch (error) {
      console.error('Failed to fetch live data:', error);
      setIsLiveConnected(false);
    }
  }, [isLiveConnected, onDataUpdated]);

  // Polling effect for live mode
  useEffect(() => {
    if (dateRange !== 'live' || !isLiveConnected) return;

    // Initial fetch (async setState is acceptable in effects)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLiveData();

    // Poll every minute
    const interval = setInterval(fetchLiveData, 60000);

    return () => clearInterval(interval);
  }, [dateRange, isLiveConnected, fetchLiveData]);

  // Check for stored credentials on mount
  useEffect(() => {
    const hasCredentials = libreViewService.hasStoredCredentials();
    const isAuth = libreViewService.isAuthenticated();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLiveConnected(hasCredentials && isAuth);
  }, []);

  // Combine readings based on mode
  const allReadings = dateRange === 'live' ? liveReadings : readings;

  // Get date range for filtering
  const { filteredReadings } = useMemo(() => {
    if (allReadings.length === 0) {
      return { filteredReadings: [], startDate: new Date(), endDate: new Date() };
    }

    const sortedReadings = [...allReadings].sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    const dataStart = sortedReadings[0].timestamp;
    const dataEnd = sortedReadings[sortedReadings.length - 1].timestamp;

    let rangeStart: Date;
    const rangeEnd = dataEnd;

    switch (dateRange) {
      case 'live': {
        // For live mode: show from 7am today (today's data only)
        // Bedtime and overnight are shown in separate charts
        const now = new Date();
        const today7am = setMilliseconds(setSeconds(setMinutes(setHours(startOfDay(now), 7), 0), 0), 0);
        rangeStart = today7am;
        break;
      }
      case '7d':
        rangeStart = subDays(rangeEnd, 7);
        break;
      case '14d':
        rangeStart = subWeeks(rangeEnd, 2);
        break;
      case '30d':
        rangeStart = subDays(rangeEnd, 30);
        break;
      case '90d':
        rangeStart = subDays(rangeEnd, 90);
        break;
      case 'all':
      default:
        rangeStart = dataStart;
        break;
    }

    const filtered = filterReadingsByDateRange(sortedReadings, rangeStart, rangeEnd);

    return {
      filteredReadings: filtered,
      startDate: rangeStart,
      endDate: rangeEnd,
    };
  }, [allReadings, dateRange]);

  // For Live mode, get last night's data for bedtime/overnight charts
  const lastNightReadings = useMemo(() => {
    if (dateRange !== 'live' || allReadings.length === 0) {
      return [];
    }

    const now = new Date();
    const yesterday10pm = setMilliseconds(setSeconds(setMinutes(setHours(startOfDay(subDays(now, 1)), 22), 0), 0), 0);
    const today7am = setMilliseconds(setSeconds(setMinutes(setHours(startOfDay(now), 7), 0), 0), 0);

    return filterReadingsByDateRange(allReadings, yesterday10pm, today7am);
  }, [allReadings, dateRange]);

  // Calculate metrics from filtered data
  const dailyMetrics = useMemo(
    () => calculateDailyMetrics(filteredReadings),
    [filteredReadings]
  );

  const weeklyMetrics = useMemo(
    () => calculateWeeklyMetrics(filteredReadings),
    [filteredReadings]
  );

  // For Live mode, use last night's data; otherwise use filtered readings
  const overnightMetrics = useMemo(
    () => calculateOvernightMetrics(dateRange === 'live' ? lastNightReadings : filteredReadings),
    [filteredReadings, lastNightReadings, dateRange]
  );

  const bedtimeMetrics = useMemo(
    () => calculateBedtimeMetrics(dateRange === 'live' ? lastNightReadings : filteredReadings),
    [filteredReadings, lastNightReadings, dateRange]
  );

  // Get data dates for the selector
  const { dataStartDate, dataEndDate } = useMemo(() => {
    if (allReadings.length === 0) {
      return { dataStartDate: new Date(), dataEndDate: new Date() };
    }
    const sorted = [...allReadings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return {
      dataStartDate: sorted[0].timestamp,
      dataEndDate: sorted[sorted.length - 1].timestamp,
    };
  }, [allReadings]);

  // Get latest reading for Live mode
  const latestReading = useMemo(() => {
    if (filteredReadings.length === 0) return null;
    return [...filteredReadings].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
  }, [filteredReadings]);

  if (readings.length === 0 && dateRange !== 'live') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b bg-card/50 backdrop-blur-sm md:sticky top-0 z-10"
      >
        <div className="container mx-auto px-2 md:px-4 py-2 md:py-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent truncate">
                Glucose Dashboard
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                {filteredReadings.length.toLocaleString()} readings
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowChat(!showChat)}>
                <MessageSquare className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">AI Chat</span>
              </Button>
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="container mx-auto px-2 md:px-4 py-8">
        <div className="space-y-8">
          {/* Date Range Selector */}
          <DateRangeSelector
            selectedRange={dateRange}
            onRangeChange={setDateRange}
            dataStartDate={dataStartDate}
            dataEndDate={dataEndDate}
          />

          {/* Live Mode: LibreView Settings */}
          {dateRange === 'live' && (
            <LibreViewSettings
              onConnectionChange={(connected) => {
                setIsLiveConnected(connected);
                if (connected) {
                  fetchLiveData();
                }
              }}
            />
          )}

          {/* Live Mode: Latest Reading */}
          {dateRange === 'live' && (
            <LatestReading reading={latestReading} isLive={true} />
          )}

          {/* Summary Stats */}
          <SummaryStats readings={filteredReadings} dailyMetrics={dailyMetrics} />

          {/* Charts Grid */}
          <div className="space-y-8">
            {/* Live Mode: Today-focused charts */}
            {dateRange === 'live' ? (
              <>
                {/* Today's Continuous Glucose Monitor View */}
                <div id="continuous-glucose-chart">
                  <ContinuousGlucoseChart
                    data={filteredReadings}
                    title="Today's Glucose Levels"
                    description="Real-time glucose readings from 7am through now"
                  />
                </div>

                {/* Time in Range for Today */}
                <div id="time-in-range-chart">
                  <TimeInRangeChart data={dailyMetrics} />
                </div>

                {/* Overnight and Bedtime (Last Night) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {overnightMetrics.length > 0 && (
                    <div id="overnight-fasting-chart">
                      <OvernightFastingChart data={overnightMetrics} />
                    </div>
                  )}
                  {bedtimeMetrics.length > 0 && (
                    <div id="bedtime-glucose-chart">
                      <BedtimeGlucoseChart data={bedtimeMetrics} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Historical Mode: All charts */}
                {/* Continuous Glucose Monitor View */}
                {dateRange !== 'all' && dateRange !== '90d' && (
                  <div id="continuous-glucose-chart">
                    <ContinuousGlucoseChart
                      data={filteredReadings}
                      title="Continuous Glucose Monitor"
                      description="Detailed view of all glucose readings in selected time period"
                    />
                  </div>
                )}

                {/* Daily Overview */}
                <div id="daily-glucose-chart">
                  <DailyGlucoseChart data={dailyMetrics} />
                </div>

                {/* Weekly Overview - show for longer ranges */}
                {(dateRange === '30d' || dateRange === '90d' || dateRange === 'all') && (
                  <>
                    <div id="weekly-overview-chart">
                      <WeeklyOverviewChart data={weeklyMetrics} />
                    </div>
                    <div id="weekly-detailed-metrics">
                      <WeeklyDetailedMetrics
                        weeklyMetrics={weeklyMetrics}
                        overnightMetrics={overnightMetrics}
                        bedtimeMetrics={bedtimeMetrics}
                        dailyMetrics={dailyMetrics}
                      />
                    </div>
                  </>
                )}

                {/* Time in Range */}
                <div id="time-in-range-chart">
                  <TimeInRangeChart data={dailyMetrics} />
                </div>

                {/* Glucose Distribution Charts (Pie & Histogram) */}
                <div id="glucose-distribution-charts">
                  <GlucoseDistributionCharts readings={filteredReadings} />
                </div>

                {/* Two column grid for medium charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div id="glucose-variability-chart">
                    <CoefficientOfVariabilityChart data={dailyMetrics} />
                  </div>
                  <div id="spike-analysis-chart">
                    <SpikeAnalysisChart data={dailyMetrics} />
                  </div>
                </div>

                {/* Weekly A1C Chart - show for longer ranges */}
                {(dateRange === '30d' || dateRange === '90d' || dateRange === 'all') && (
                  <div id="weekly-a1c-chart">
                    <WeeklyA1CChart data={weeklyMetrics} />
                  </div>
                )}

                {/* Overnight and Bedtime */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {overnightMetrics.length > 0 && (
                    <div id="overnight-fasting-chart">
                      <OvernightFastingChart data={overnightMetrics} />
                    </div>
                  )}
                  {bedtimeMetrics.length > 0 && (
                    <div id="bedtime-glucose-chart">
                      <BedtimeGlucoseChart data={bedtimeMetrics} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6">
        <div className="container mx-auto px-2 md:px-4 text-center text-sm text-muted-foreground">
          <p>Built for proactive T1D management and LADA progression tracking</p>
          <p className="mt-2">Data is synced with your secure account</p>
        </div>
      </footer>

      {/* AI Chat Modal */}
      {showChat && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowChat(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-4xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="absolute -top-2 -right-2 z-10 bg-background rounded-full shadow-lg"
                onClick={() => setShowChat(false)}
              >
                <X className="h-4 w-4" />
              </Button>
              <AIChat />
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
