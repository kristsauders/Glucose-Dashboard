import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GlucoseReading } from '@/types/glucose';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface GlucoseDistributionChartsProps {
  readings: GlucoseReading[];
}

export function GlucoseDistributionCharts({ readings }: GlucoseDistributionChartsProps) {
  const pieHeight = useResponsiveChartHeight(300, 400);
  const histogramHeight = useResponsiveChartHeight(350, 450);

  const allGlucose = readings.map(r => r.glucose);

  // Pie chart data - time in different ranges (20 mg/dL increments)
  const pieRanges = [
    { min: 0, max: 50, name: '<50', color: '#dc2626' },
    { min: 50, max: 70, name: '50-70', color: '#f97316' },
    { min: 70, max: 90, name: '70-90', color: '#86efac' },
    { min: 90, max: 110, name: '90-110', color: '#22c55e' },
    { min: 110, max: 130, name: '110-130', color: '#86efac' },
    { min: 130, max: 150, name: '130-150', color: '#eab308' },
    { min: 150, max: 170, name: '150-170', color: '#f97316' },
    { min: 170, max: 190, name: '170-190', color: '#dc2626' },
    { min: 190, max: 210, name: '190-210', color: '#b91c1c' },
    { min: 210, max: Infinity, name: '210+', color: '#7f1d1d' },
  ];

  const pieData = pieRanges
    .map(range => ({
      name: range.name,
      value: allGlucose.filter(g => g >= range.min && g < range.max).length,
      color: range.color,
    }))
    .filter(d => d.value > 0);

  // Histogram data - glucose distribution in 20 mg/dL buckets
  const bucketSize = 20;
  const minGlucose = 40;
  const maxGlucose = 300;
  const buckets = new Map<number, number>();

  for (let i = minGlucose; i < maxGlucose; i += bucketSize) {
    buckets.set(i, 0);
  }

  allGlucose.forEach(g => {
    const bucket = Math.floor(g / bucketSize) * bucketSize;
    if (bucket >= minGlucose && bucket < maxGlucose) {
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }
  });

  const histogramData = Array.from(buckets.entries())
    .map(([bucket, count]) => ({
      range: `${bucket}-${bucket + bucketSize}`,
      count,
      percentage: (count / allGlucose.length) * 100,
    }))
    .filter(d => d.count > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-8"
    >
      {/* Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Time in Glucose Ranges</CardTitle>
          <CardDescription>
            Distribution of readings across different glucose ranges
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={pieHeight}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(1)}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number | undefined, name: string | undefined) => {
                  if (value === undefined) return ['N/A', ''];
                  return [
                    `${value.toLocaleString()} readings (${((value / allGlucose.length) * 100).toFixed(1)}%)`,
                    name || ''
                  ];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Histogram */}
      <Card>
        <CardHeader>
          <CardTitle>Glucose Distribution Histogram (count)</CardTitle>
          <CardDescription>
            Frequency of glucose readings in 20 mg/dL ranges
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={histogramHeight}>
            <BarChart data={histogramData} margin={{ top: 10, right: 5, bottom: 80, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="range"
                angle={-45}
                textAnchor="end"
                interval={0}
                tick={{ fontSize: 15, dy: 20 }}
              />
              <YAxis width={35} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number | undefined, name: string | undefined) => {
                  if (value === undefined) return ['N/A', ''];
                  if (name === 'count') {
                    return [`${value} readings`, 'Count'];
                  }
                  return [`${value.toFixed(1)}%`, 'Percentage'];
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
