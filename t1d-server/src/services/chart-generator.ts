import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';
import { query } from '../config/database.js';

export interface GlucoseReading {
  timestamp: Date;
  value: number;
}

export interface ChartGenerationOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
}

/**
 * Service for generating glucose charts as images
 * Uses Chart.js on Node.js canvas for server-side rendering
 */
export class ChartGenerator {
  private canvas: ChartJSNodeCanvas;

  constructor(options: ChartGenerationOptions = {}) {
    const width = options.width || 800;
    const height = options.height || 400;

    this.canvas = new ChartJSNodeCanvas({
      width,
      height,
      backgroundColour: options.backgroundColor || 'white',
    });
  }

  /**
   * Generate a glucose trend line chart
   */
  async generateTrendChart(
    readings: GlucoseReading[],
    title: string = 'Glucose Trend'
  ): Promise<Buffer> {
    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: readings.map(r => r.timestamp.toLocaleString()),
        datasets: [
          {
            label: 'Glucose (mg/dL)',
            data: readings.map(r => r.value),
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            tension: 0.4,
            pointRadius: 2,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Glucose (mg/dL)',
            },
            suggestedMin: 50,
            suggestedMax: 250,
            grid: {
              color: (context) => {
                // Highlight target range (70-180)
                const value = context.tick.value;
                if (value === 70 || value === 180) {
                  return 'rgba(255, 0, 0, 0.3)';
                }
                return 'rgba(0, 0, 0, 0.1)';
              },
            },
          },
          x: {
            title: {
              display: true,
              text: 'Time',
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              maxTicksLimit: 12,
            },
          },
        },
      },
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate a Time in Range (TIR) chart
   */
  async generateTimeInRangeChart(
    readings: GlucoseReading[],
    title: string = 'Time in Range (Sage Target: 70-140 mg/dL)'
  ): Promise<Buffer> {
    // Calculate time in each range (Sage's 70-140 target)
    const total = readings.length;
    const veryLow = readings.filter(r => r.value < 54).length;
    const low = readings.filter(r => r.value >= 54 && r.value < 70).length;
    const inRange = readings.filter(r => r.value >= 70 && r.value <= 140).length;
    const highNormal = readings.filter(r => r.value > 140 && r.value <= 180).length;
    const high = readings.filter(r => r.value > 180 && r.value <= 250).length;
    const veryHigh = readings.filter(r => r.value > 250).length;

    const config: ChartConfiguration = {
      type: 'doughnut',
      data: {
        labels: [
          'Very Low (<54)',
          'Low (54-70)',
          'In Range (70-140)',
          'High Normal (140-180)',
          'High (180-250)',
          'Very High (>250)',
        ],
        datasets: [
          {
            data: [
              ((veryLow / total) * 100).toFixed(1),
              ((low / total) * 100).toFixed(1),
              ((inRange / total) * 100).toFixed(1),
              ((highNormal / total) * 100).toFixed(1),
              ((high / total) * 100).toFixed(1),
              ((veryHigh / total) * 100).toFixed(1),
            ],
            backgroundColor: [
              'rgb(220, 38, 38)', // Very low - red
              'rgb(251, 146, 60)', // Low - orange
              'rgb(34, 197, 94)', // In range - green
              'rgb(251, 191, 36)', // High normal - yellow
              'rgb(251, 146, 60)', // High - orange
              'rgb(220, 38, 38)', // Very high - red
            ],
            borderWidth: 2,
            borderColor: 'white',
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'right',
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.label}: ${context.parsed}%`;
              },
            },
          },
        },
      },
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate a daily pattern chart (average glucose by hour)
   */
  async generateDailyPatternChart(
    readings: GlucoseReading[],
    title: string = 'Daily Glucose Pattern'
  ): Promise<Buffer> {
    // Group readings by hour and calculate averages
    const hourlyData = new Array(24).fill(0).map(() => ({ sum: 0, count: 0 }));

    readings.forEach(r => {
      const hour = r.timestamp.getHours();
      hourlyData[hour].sum += r.value;
      hourlyData[hour].count += 1;
    });

    const averages = hourlyData.map(h => (h.count > 0 ? h.sum / h.count : null));

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: [
          {
            label: 'Average Glucose (mg/dL)',
            data: averages,
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderColor: 'rgb(59, 130, 246)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Average Glucose (mg/dL)',
            },
            suggestedMin: 50,
            suggestedMax: 250,
            grid: {
              color: (context) => {
                const value = context.tick.value;
                if (value === 70 || value === 180) {
                  return 'rgba(255, 0, 0, 0.3)';
                }
                return 'rgba(0, 0, 0, 0.1)';
              },
            },
          },
          x: {
            title: {
              display: true,
              text: 'Hour of Day',
            },
          },
        },
      },
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate a glucose distribution histogram
   */
  async generateDistributionChart(
    readings: GlucoseReading[],
    title: string = 'Glucose Distribution'
  ): Promise<Buffer> {
    // Create bins for histogram (every 20 mg/dL)
    const binSize = 20;
    const minBin = 0;
    const maxBin = 400;
    const numBins = (maxBin - minBin) / binSize;

    const bins = new Array(numBins).fill(0);
    const binLabels: string[] = [];

    for (let i = 0; i < numBins; i++) {
      const start = minBin + i * binSize;
      const end = start + binSize;
      binLabels.push(`${start}-${end}`);
    }

    // Count readings in each bin
    readings.forEach(r => {
      const binIndex = Math.floor((r.value - minBin) / binSize);
      if (binIndex >= 0 && binIndex < numBins) {
        bins[binIndex]++;
      }
    });

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: binLabels,
        datasets: [
          {
            label: 'Number of Readings',
            data: bins,
            backgroundColor: (context) => {
              const index = context.dataIndex;
              const start = minBin + index * binSize;
              const end = start + binSize;

              // Color based on glucose range
              if (end <= 54) return 'rgb(220, 38, 38)'; // Very low
              if (end <= 70) return 'rgb(251, 146, 60)'; // Low
              if (start >= 70 && end <= 180) return 'rgb(34, 197, 94)'; // In range
              if (start >= 180 && end <= 250) return 'rgb(251, 146, 60)'; // High
              return 'rgb(220, 38, 38)'; // Very high
            },
            borderWidth: 1,
            borderColor: 'white',
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Count',
            },
            beginAtZero: true,
          },
          x: {
            title: {
              display: true,
              text: 'Glucose Range (mg/dL)',
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate an Ambulatory Glucose Profile (AGP) chart
   * Shows median, IQR (25-75th percentile), and 10-90th percentile ranges
   */
  async generateAGPChart(
    readings: GlucoseReading[],
    title: string = 'Ambulatory Glucose Profile (AGP)'
  ): Promise<Buffer> {
    // Group readings by time of day (every 15 minutes)
    const intervalMinutes = 15;
    const intervalsPerDay = (24 * 60) / intervalMinutes; // 96 intervals
    const timeSlots = new Array(intervalsPerDay)
      .fill(0)
      .map(() => [] as number[]);

    readings.forEach(r => {
      const minutesFromMidnight = r.timestamp.getHours() * 60 + r.timestamp.getMinutes();
      const slotIndex = Math.floor(minutesFromMidnight / intervalMinutes);
      if (slotIndex >= 0 && slotIndex < intervalsPerDay) {
        timeSlots[slotIndex].push(r.value);
      }
    });

    // Calculate percentiles for each time slot
    const percentile = (arr: number[], p: number) => {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      const index = (p / 100) * (sorted.length - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index % 1;
      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    const p10 = timeSlots.map(slot => percentile(slot, 10));
    const p25 = timeSlots.map(slot => percentile(slot, 25));
    const p50 = timeSlots.map(slot => percentile(slot, 50)); // Median
    const p75 = timeSlots.map(slot => percentile(slot, 75));
    const p90 = timeSlots.map(slot => percentile(slot, 90));

    // Create labels (time of day)
    const labels = Array.from({ length: intervalsPerDay }, (_, i) => {
      const minutes = i * intervalMinutes;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    });

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '10-90th Percentile',
            data: p10,
            borderColor: 'rgba(59, 130, 246, 0.3)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: '+1', // Fill to next dataset
            pointRadius: 0,
            borderWidth: 1,
          },
          {
            label: '10-90th Percentile (upper)',
            data: p90,
            borderColor: 'rgba(59, 130, 246, 0.3)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            pointRadius: 0,
            borderWidth: 1,
          },
          {
            label: '25-75th Percentile',
            data: p25,
            borderColor: 'rgba(59, 130, 246, 0.6)',
            backgroundColor: 'rgba(59, 130, 246, 0.3)',
            fill: '+1',
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: '25-75th Percentile (upper)',
            data: p75,
            borderColor: 'rgba(59, 130, 246, 0.6)',
            backgroundColor: 'rgba(59, 130, 246, 0.3)',
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: 'Median',
            data: p50,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgb(59, 130, 246)',
            pointRadius: 0,
            borderWidth: 3,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              filter: (item) => {
                // Only show median and ranges in legend (not duplicate upper bounds)
                return !item.text.includes('(upper)');
              },
            },
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Glucose (mg/dL)',
            },
            suggestedMin: 50,
            suggestedMax: 250,
            grid: {
              color: (context) => {
                const value = context.tick.value;
                if (value === 70 || value === 180) {
                  return 'rgba(255, 0, 0, 0.3)';
                }
                return 'rgba(0, 0, 0, 0.1)';
              },
            },
          },
          x: {
            title: {
              display: true,
              text: 'Time of Day',
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              maxTicksLimit: 24,
            },
          },
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
      },
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate a weekly overview chart with avg/min/max
   */
  async generateWeeklyOverviewChart(
    readings: GlucoseReading[],
    title: string = 'Weekly Overview (Avg/Min/Max)'
  ): Promise<Buffer> {
    if (readings.length === 0) {
      // Return empty chart if no readings
      const config: ChartConfiguration = {
        type: 'line',
        data: { labels: [], datasets: [] },
      };
      return await this.renderChart(config);
    }

    // Find the latest reading date (end of the period)
    const latestDate = new Date(Math.max(...readings.map(r => r.timestamp.getTime())));
    latestDate.setHours(23, 59, 59, 999); // End of day

    // Calculate week boundaries working backwards from the end date
    // Each week is 7 complete days ending on the latest date's day of week
    const weeklyData = new Map<string, GlucoseReading[]>();

    // Group readings into 7-day periods working backwards from end date
    readings.forEach(r => {
      // Calculate which week this reading belongs to
      const daysDiff = Math.floor((latestDate.getTime() - r.timestamp.getTime()) / (1000 * 60 * 60 * 24));
      const weekNumber = Math.floor(daysDiff / 7);

      // Calculate the end date of this week (same day of week as latestDate)
      const weekEnd = new Date(latestDate);
      weekEnd.setDate(weekEnd.getDate() - (weekNumber * 7));

      // Calculate the start date of this week (7 days before week end)
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);

      // Use week start as the key
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeklyData.has(weekKey)) {
        weeklyData.set(weekKey, []);
      }
      weeklyData.get(weekKey)!.push(r);
    });

    const weeks: string[] = [];
    const avgValues: number[] = [];
    const minValues: number[] = [];
    const maxValues: number[] = [];

    // Sort weeks chronologically and calculate metrics
    Array.from(weeklyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([weekStartKey, weekReadings]) => {
        const values = weekReadings.map(r => r.value);

        // Format week label as "MMM DD" for the week start
        const weekStartDate = new Date(weekStartKey);
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekEndDate.getDate() + 6);

        weeks.push(weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        avgValues.push(values.reduce((sum, v) => sum + v, 0) / values.length);
        minValues.push(Math.min(...values));
        maxValues.push(Math.max(...values));
      });

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: weeks,
        datasets: [
          {
            label: 'Average',
            data: avgValues,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 3,
            pointRadius: 4,
            fill: false,
          },
          {
            label: 'Maximum',
            data: maxValues,
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            borderDash: [5, 5],
            fill: false,
          },
          {
            label: 'Minimum',
            data: minValues,
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            borderDash: [5, 5],
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Glucose (mg/dL)',
            },
            suggestedMin: 50,
            suggestedMax: 250,
          },
          x: {
            title: {
              display: true,
              text: 'Week',
            },
          },
        },
      },
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate a spike analysis chart
   */
  async generateSpikeAnalysisChart(
    readings: GlucoseReading[],
    title: string = 'Glucose Spikes Analysis (>180 mg/dL)'
  ): Promise<Buffer> {
    // Detect spikes (any reading above 180 mg/dL)
    const spikesByDay = new Map<string, number>();

    readings.forEach(r => {
      if (r.value > 180) {
        const day = r.timestamp.toISOString().split('T')[0];
        spikesByDay.set(day, (spikesByDay.get(day) || 0) + 1);
      }
    });

    // Get all days in range
    const days: string[] = [];
    const spikeCounts: number[] = [];

    const daySet = new Set<string>();
    readings.forEach(r => {
      daySet.add(r.timestamp.toISOString().split('T')[0]);
    });

    Array.from(daySet)
      .sort()
      .forEach(day => {
        days.push(new Date(day).toLocaleDateString());
        spikeCounts.push(spikesByDay.get(day) || 0);
      });

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          {
            label: 'Number of Spikes (>180 mg/dL)',
            data: spikeCounts,
            backgroundColor: 'rgba(239, 68, 68, 0.6)',
            borderColor: 'rgb(239, 68, 68)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Number of Spikes',
            },
            beginAtZero: true,
            ticks: {
              stepSize: 1,
            },
          },
          x: {
            title: {
              display: true,
              text: 'Date',
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate a bedtime glucose chart
   */
  async generateBedtimeGlucoseChart(
    readings: GlucoseReading[],
    title: string = 'Bedtime Glucose Trends (9-11 PM)'
  ): Promise<Buffer> {
    // Filter readings between 9 PM and 11 PM
    const bedtimeReadings = readings.filter(r => {
      const hour = r.timestamp.getHours();
      return hour >= 21 && hour < 23;
    });

    // Group by date
    const bedtimeByDay = new Map<string, number[]>();

    bedtimeReadings.forEach(r => {
      const day = r.timestamp.toISOString().split('T')[0];
      if (!bedtimeByDay.has(day)) {
        bedtimeByDay.set(day, []);
      }
      bedtimeByDay.get(day)!.push(r.value);
    });

    const days: string[] = [];
    const avgValues: number[] = [];

    Array.from(bedtimeByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([day, values]) => {
        days.push(new Date(day).toLocaleDateString());
        avgValues.push(values.reduce((sum, v) => sum + v, 0) / values.length);
      });

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: days,
        datasets: [
          {
            label: 'Average Bedtime Glucose',
            data: avgValues,
            borderColor: 'rgb(139, 92, 246)',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderWidth: 3,
            pointRadius: 4,
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Glucose (mg/dL)',
            },
            suggestedMin: 50,
            suggestedMax: 200,
            grid: {
              color: (context) => {
                const value = context.tick.value;
                if (value === 70 || value === 140) {
                  return 'rgba(255, 0, 0, 0.3)';
                }
                return 'rgba(0, 0, 0, 0.1)';
              },
            },
          },
          x: {
            title: {
              display: true,
              text: 'Date',
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate an overnight glucose chart (10 PM - 7 AM)
   */
  async generateOvernightGlucoseChart(
    readings: GlucoseReading[],
    title: string = 'Overnight Glucose Trends (10 PM - 7 AM)'
  ): Promise<Buffer> {
    // Filter readings between 10 PM and 7 AM
    const overnightReadings = readings.filter(r => {
      const hour = r.timestamp.getHours();
      return hour >= 22 || hour < 7;
    });

    // Group by date
    const overnightByDay = new Map<string, number[]>();

    overnightReadings.forEach(r => {
      const day = r.timestamp.toISOString().split('T')[0];
      if (!overnightByDay.has(day)) {
        overnightByDay.set(day, []);
      }
      overnightByDay.get(day)!.push(r.value);
    });

    const days: string[] = [];
    const avgValues: number[] = [];
    const minValues: number[] = [];
    const maxValues: number[] = [];

    Array.from(overnightByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([day, values]) => {
        days.push(new Date(day).toLocaleDateString());
        avgValues.push(values.reduce((sum, v) => sum + v, 0) / values.length);
        minValues.push(Math.min(...values));
        maxValues.push(Math.max(...values));
      });

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: days,
        datasets: [
          {
            label: 'Average',
            data: avgValues,
            borderColor: 'rgb(99, 102, 241)',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            borderWidth: 3,
            pointRadius: 4,
            fill: false,
          },
          {
            label: 'Maximum',
            data: maxValues,
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            borderDash: [5, 5],
            fill: false,
          },
          {
            label: 'Minimum',
            data: minValues,
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            borderDash: [5, 5],
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Glucose (mg/dL)',
            },
            suggestedMin: 50,
            suggestedMax: 200,
            grid: {
              color: (context) => {
                const value = context.tick.value;
                if (value === 70 || value === 140) {
                  return 'rgba(255, 0, 0, 0.3)';
                }
                return 'rgba(0, 0, 0, 0.1)';
              },
            },
          },
          x: {
            title: {
              display: true,
              text: 'Date',
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate a daily trends chart with avg/min/max
   */
  async generateDailyTrendsChart(
    readings: GlucoseReading[],
    title: string = 'Daily Glucose Trends (Avg/Min/Max)'
  ): Promise<Buffer> {
    // Group readings by day
    const dailyData = new Map<string, GlucoseReading[]>();

    readings.forEach(r => {
      const day = r.timestamp.toISOString().split('T')[0];
      if (!dailyData.has(day)) {
        dailyData.set(day, []);
      }
      dailyData.get(day)!.push(r);
    });

    const days: string[] = [];
    const avgValues: number[] = [];
    const minValues: number[] = [];
    const maxValues: number[] = [];

    Array.from(dailyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([day, dayReadings]) => {
        const values = dayReadings.map(r => r.value);
        days.push(new Date(day).toLocaleDateString());
        avgValues.push(values.reduce((sum, v) => sum + v, 0) / values.length);
        minValues.push(Math.min(...values));
        maxValues.push(Math.max(...values));
      });

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: days,
        datasets: [
          {
            label: 'Average',
            data: avgValues,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 3,
            pointRadius: 4,
            fill: false,
          },
          {
            label: 'Maximum',
            data: maxValues,
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            borderDash: [5, 5],
            fill: false,
          },
          {
            label: 'Minimum',
            data: minValues,
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            borderDash: [5, 5],
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Glucose (mg/dL)',
            },
            suggestedMin: 50,
            suggestedMax: 250,
            grid: {
              color: (context) => {
                const value = context.tick.value;
                if (value === 70 || value === 140) {
                  return 'rgba(255, 0, 0, 0.3)';
                }
                return 'rgba(0, 0, 0, 0.1)';
              },
            },
          },
          x: {
            title: {
              display: true,
              text: 'Date',
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate a daily carbs bar chart
   */
  async generateDailyCarbsChart(
    meals: any[],
    title: string = 'Daily Carbohydrate Intake'
  ): Promise<Buffer> {
    // Group meals by date
    const dailyCarbs = new Map<string, number>();

    meals.forEach(meal => {
      const date = new Date(meal.timestamp).toISOString().split('T')[0];
      const carbs = Number(meal.carbs);
      if (!isNaN(carbs)) {
        dailyCarbs.set(date, (dailyCarbs.get(date) || 0) + carbs);
      }
    });

    const dates: string[] = [];
    const carbValues: number[] = [];

    Array.from(dailyCarbs.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, carbs]) => {
        dates.push(new Date(date).toLocaleDateString());
        carbValues.push(carbs);
      });

    const avgCarbs = carbValues.reduce((sum, v) => sum + v, 0) / carbValues.length;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'Carbs (g)',
            data: carbValues,
            backgroundColor: 'rgba(147, 51, 234, 0.7)',
            borderColor: 'rgb(147, 51, 234)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Carbs (g)',
            },
            beginAtZero: true,
          },
          x: {
            title: {
              display: true,
              text: 'Date',
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
      plugins: [
        {
          id: 'avgLine',
          afterDraw: (chart) => {
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            const y = yAxis.getPixelForValue(avgCarbs);

            ctx.save();
            ctx.strokeStyle = 'rgba(107, 114, 128, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, y);
            ctx.lineTo(xAxis.right, y);
            ctx.stroke();

            ctx.fillStyle = 'rgba(107, 114, 128, 1)';
            ctx.font = '12px Arial';
            ctx.fillText(`Avg: ${avgCarbs.toFixed(0)}g`, xAxis.right - 80, y - 5);
            ctx.restore();
          },
        },
      ],
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate an insulin usage stacked bar chart (basal vs rapid)
   */
  async generateInsulinUsageChart(
    insulin: any[],
    title: string = 'Daily Insulin Usage (Basal vs Rapid)'
  ): Promise<Buffer> {
    // Helper to check if insulin is basal
    const isBasal = (insulinType: string): boolean => {
      const type = insulinType.toLowerCase();
      return type.includes('lantus') ||
             type.includes('basal') ||
             type.includes('tresiba') ||
             type.includes('levemir') ||
             type.includes('toujeo') ||
             type.includes('degludec') ||
             type.includes('glargine') ||
             type.includes('detemir') ||
             type.includes('long-acting') ||
             type.includes('long');
    };

    // Group insulin by date and type
    const dailyInsulin = new Map<string, { basal: number; rapid: number }>();

    insulin.forEach(dose => {
      const date = new Date(dose.timestamp).toISOString().split('T')[0];
      const current = dailyInsulin.get(date) || { basal: 0, rapid: 0 };
      const units = Number(dose.units);

      if (!isNaN(units)) {
        if (isBasal(dose.insulin_type)) {
          current.basal += units;
        } else {
          current.rapid += units;
        }
      }

      dailyInsulin.set(date, current);
    });

    const dates: string[] = [];
    const basalValues: number[] = [];
    const rapidValues: number[] = [];

    Array.from(dailyInsulin.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, { basal, rapid }]) => {
        dates.push(new Date(date).toLocaleDateString());
        basalValues.push(basal);
        rapidValues.push(rapid);
      });

    const totalValues = basalValues.map((b, i) => b + rapidValues[i]);
    const avgTotal = totalValues.reduce((sum, v) => sum + v, 0) / totalValues.length;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'Basal Insulin',
            data: basalValues,
            backgroundColor: 'rgba(251, 146, 60, 0.7)',
            borderColor: 'rgb(251, 146, 60)',
            borderWidth: 1,
          },
          {
            label: 'Rapid Insulin',
            data: rapidValues,
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: 'rgb(239, 68, 68)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Units',
            },
            stacked: true,
            beginAtZero: true,
          },
          x: {
            title: {
              display: true,
              text: 'Date',
            },
            stacked: true,
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
      plugins: [
        {
          id: 'avgLine',
          afterDraw: (chart) => {
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            const y = yAxis.getPixelForValue(avgTotal);

            ctx.save();
            ctx.strokeStyle = 'rgba(107, 114, 128, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, y);
            ctx.lineTo(xAxis.right, y);
            ctx.stroke();

            ctx.fillStyle = 'rgba(107, 114, 128, 1)';
            ctx.font = '12px Arial';
            ctx.fillText(`Avg: ${avgTotal.toFixed(1)}u`, xAxis.right - 80, y - 5);
            ctx.restore();
          },
        },
      ],
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate a carb ratio line chart
   */
  async generateCarbRatioChart(
    meals: any[],
    insulin: any[],
    title: string = 'Carb-to-Insulin Ratio Over Time'
  ): Promise<Buffer> {
    // Helper to check if insulin is basal
    const isBasal = (insulinType: string): boolean => {
      const type = insulinType.toLowerCase();
      return type.includes('lantus') ||
             type.includes('basal') ||
             type.includes('tresiba') ||
             type.includes('levemir') ||
             type.includes('toujeo') ||
             type.includes('degludec') ||
             type.includes('glargine') ||
             type.includes('detemir') ||
             type.includes('long-acting') ||
             type.includes('long');
    };

    // Calculate carb ratios
    const ratios: Array<{ date: string; ratio: number }> = [];

    meals.forEach(meal => {
      const mealTime = new Date(meal.timestamp).getTime();
      const mealCarbs = Number(meal.carbs);

      if (isNaN(mealCarbs) || mealCarbs === 0) return;

      // Find rapid insulin within 30 minutes
      const matchingInsulin = insulin.find(dose => {
        if (isBasal(dose.insulin_type)) return false;
        const doseTime = new Date(dose.timestamp).getTime();
        const timeDiff = Math.abs(doseTime - mealTime);
        return timeDiff <= 30 * 60 * 1000;
      });

      if (matchingInsulin) {
        const insulinUnits = Number(matchingInsulin.units);
        if (!isNaN(insulinUnits) && insulinUnits > 0) {
          ratios.push({
            date: new Date(meal.timestamp).toLocaleDateString(),
            ratio: mealCarbs / insulinUnits,
          });
        }
      }
    });

    if (ratios.length === 0) {
      // Return empty chart if no ratios calculated
      const config: ChartConfiguration = {
        type: 'line',
        data: {
          labels: ['No Data'],
          datasets: [],
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: title + ' (No data available)',
              font: { size: 16, weight: 'bold' },
            },
          },
        },
      };
      return await this.canvas.renderToBuffer(config);
    }

    const dates = ratios.map(r => r.date);
    const ratioValues = ratios.map(r => r.ratio);
    const avgRatio = ratioValues.reduce((sum, v) => sum + v, 0) / ratioValues.length;

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'Carb Ratio (g/u)',
            data: ratioValues,
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            borderWidth: 2,
            pointRadius: 4,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Carb Ratio (g/u)',
            },
            beginAtZero: true,
            suggestedMax: 20,
          },
          x: {
            title: {
              display: true,
              text: 'Date',
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
      plugins: [
        {
          id: 'targetRange',
          beforeDraw: (chart) => {
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            const y1 = yAxis.getPixelForValue(8);
            const y2 = yAxis.getPixelForValue(15);

            ctx.save();
            ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
            ctx.fillRect(xAxis.left, y2, xAxis.width, y1 - y2);
            ctx.restore();
          },
          afterDraw: (chart) => {
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            const y = yAxis.getPixelForValue(avgRatio);

            ctx.save();
            ctx.strokeStyle = 'rgba(107, 114, 128, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, y);
            ctx.lineTo(xAxis.right, y);
            ctx.stroke();

            ctx.fillStyle = 'rgba(107, 114, 128, 1)';
            ctx.font = '12px Arial';
            ctx.fillText(`Avg: 1:${avgRatio.toFixed(1)}`, xAxis.right - 90, y - 5);
            ctx.restore();
          },
        },
      ],
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Generate an exercise pattern stacked bar chart
   */
  async generateExercisePatternChart(
    exercise: any[],
    title: string = 'Daily Exercise Duration by Intensity'
  ): Promise<Buffer> {
    // Group exercise by date and intensity
    const dailyExercise = new Map<string, { light: number; moderate: number; intense: number }>();

    exercise.forEach(session => {
      const date = new Date(session.timestamp).toISOString().split('T')[0];
      const current = dailyExercise.get(date) || { light: 0, moderate: 0, intense: 0 };
      const intensity = session.intensity?.toLowerCase() || 'moderate';
      const duration = Number(session.duration_minutes);

      if (!isNaN(duration)) {
        if (intensity === 'light') {
          current.light += duration;
        } else if (intensity === 'intense') {
          current.intense += duration;
        } else {
          current.moderate += duration;
        }
      }

      dailyExercise.set(date, current);
    });

    const dates: string[] = [];
    const lightValues: number[] = [];
    const moderateValues: number[] = [];
    const intenseValues: number[] = [];

    Array.from(dailyExercise.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, { light, moderate, intense }]) => {
        dates.push(new Date(date).toLocaleDateString());
        lightValues.push(light);
        moderateValues.push(moderate);
        intenseValues.push(intense);
      });

    const totalValues = lightValues.map((l, i) => l + moderateValues[i] + intenseValues[i]);
    const avgTotal = totalValues.reduce((sum, v) => sum + v, 0) / totalValues.length;

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'Light',
            data: lightValues,
            backgroundColor: 'rgba(168, 85, 247, 0.7)',
            borderColor: 'rgb(168, 85, 247)',
            borderWidth: 1,
          },
          {
            label: 'Moderate',
            data: moderateValues,
            backgroundColor: 'rgba(34, 197, 94, 0.7)',
            borderColor: 'rgb(34, 197, 94)',
            borderWidth: 1,
          },
          {
            label: 'Intense',
            data: intenseValues,
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: 'rgb(239, 68, 68)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: { size: 16, weight: 'bold' },
          },
          legend: {
            display: true,
            position: 'top',
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Minutes',
            },
            stacked: true,
            beginAtZero: true,
          },
          x: {
            title: {
              display: true,
              text: 'Date',
            },
            stacked: true,
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
      plugins: [
        {
          id: 'avgLine',
          afterDraw: (chart) => {
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            const y = yAxis.getPixelForValue(avgTotal);

            ctx.save();
            ctx.strokeStyle = 'rgba(107, 114, 128, 0.8)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xAxis.left, y);
            ctx.lineTo(xAxis.right, y);
            ctx.stroke();

            ctx.fillStyle = 'rgba(107, 114, 128, 1)';
            ctx.font = '12px Arial';
            ctx.fillText(`Avg: ${avgTotal.toFixed(0)} min`, xAxis.right - 100, y - 5);
            ctx.restore();
          },
        },
      ],
    };

    return await this.canvas.renderToBuffer(config);
  }

  /**
   * Fetch glucose readings for a user within a date range
   */
  static async fetchReadings(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<GlucoseReading[]> {
    const result = await query(
      `SELECT timestamp, glucose as value
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= $2
         AND timestamp <= $3
       ORDER BY timestamp ASC`,
      [userId, startDate, endDate]
    );

    return result.rows.map(row => ({
      timestamp: new Date(row.timestamp),
      value: parseFloat(row.value),
    }));
  }
}
