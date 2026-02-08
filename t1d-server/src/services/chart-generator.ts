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
    // Group readings by week
    const weeklyData = new Map<string, GlucoseReading[]>();

    readings.forEach(r => {
      const weekStart = new Date(r.timestamp);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
      weekStart.setHours(0, 0, 0, 0);
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

    Array.from(weeklyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([week, weekReadings]) => {
        const values = weekReadings.map(r => r.value);
        weeks.push(new Date(week).toLocaleDateString());
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
