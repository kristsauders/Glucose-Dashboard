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
import { LatestReading } from './LatestReading';
import { AIChat } from './AIChat';
import { Settings } from './Settings';
import { LogsModal } from './logs/LogsModal';
import { Button } from './ui/button';
import { ThemeToggle } from './ThemeToggle';
import { Upload, MessageSquare, LogOut, X, Settings as SettingsIcon, ClipboardList } from 'lucide-react';
import { apiService } from '@/services/api';
import { subDays, subWeeks, startOfDay, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';

interface DashboardProps {
  readings: GlucoseReading[];
  onNewUpload?: () => void;
  onDataUpdated?: () => void;
}

export function Dashboard({ readings, onDataUpdated }: DashboardProps) {
  const [dateRange, setDateRange] = useState<DateRangePreset>('live');
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Close modals with ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLogs) {
          setShowLogs(false);
        } else if (showSettings) {
          setShowSettings(false);
        } else if (showChat) {
          setShowChat(false);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showChat, showSettings, showLogs]);

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      apiService.logout();
      window.location.reload();
    }
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await apiService.importCSV(file);
      alert(`Successfully imported ${result.count} glucose readings!`);
      onDataUpdated?.(); // Reload data
      event.target.value = ''; // Reset input
    } catch (error) {
      alert(`Failed to import CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
      event.target.value = ''; // Reset input
    }
  };

  // Reload data from backend (backend poller handles LibreView syncing automatically)
  const fetchLiveData = useCallback(async () => {
    try {
      // Backend poller automatically syncs LibreView data, just reload from API
      onDataUpdated?.();
    } catch (error) {
      console.error('Failed to reload live data:', error);
    }
  }, [onDataUpdated]);

  // Polling effect for live mode
  useEffect(() => {
    if (dateRange !== 'live') return;

    // Initial fetch
    fetchLiveData();

    // Poll every 15 seconds to get new readings quickly after backend syncs
    const interval = setInterval(fetchLiveData, 15000);

    return () => clearInterval(interval);
  }, [dateRange, fetchLiveData]);

  // All readings come from the backend (includes LibreView-synced data)
  const allReadings = readings;

  // Get date range for filtering
  const { filteredReadings, startDate, endDate } = useMemo(() => {
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
                Sage
              </h1>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowChat(!showChat)}>
                <MessageSquare className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">AI Chat</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(true)}
              >
                <SettingsIcon className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Settings</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLogs(true)}
              >
                <ClipboardList className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Logs</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('csv-upload')?.click()}
              >
                <Upload className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Import CSV</span>
              </Button>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
              />
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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center md:p-4"
          onClick={() => setShowChat(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full md:max-w-4xl h-full md:h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-full flex flex-col">
              <Button
                variant="ghost"
                size="sm"
                className="absolute -top-2 -right-2 z-10 bg-background rounded-full shadow-lg hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setShowChat(false)}
                title="Close chat (ESC)"
              >
                <X className="h-4 w-4" />
              </Button>
              <AIChat />
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}

      {/* Logs Modal */}
      {showLogs && (
        <LogsModal
          onClose={() => setShowLogs(false)}
          dateRange={dateRange === 'live' ? 'today' : dateRange}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </div>
  );
}
