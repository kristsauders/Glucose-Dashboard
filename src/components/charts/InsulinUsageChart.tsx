import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { InsulinLog } from '@/types/logs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { useResponsiveChartHeight } from '@/hooks/useResponsiveChartHeight';

interface InsulinUsageChartProps {
  insulin: InsulinLog[];
}

export function InsulinUsageChart({ insulin }: InsulinUsageChartProps) {
  const chartHeight = useResponsiveChartHeight(250, 350);

  const chartData = useMemo(() => {
    console.log('[InsulinUsageChart] Processing insulin:', {
      totalDoses: insulin.length,
      sampleDoses: insulin.slice(0, 5).map(i => ({
        timestamp: i.timestamp,
        date: new Date(i.timestamp).toISOString().split('T')[0],
        type: i.insulin_type,
        units: i.units,
        unitsType: typeof i.units,
      })),
    });

    // Group insulin by date and type
    const dailyInsulin = new Map<string, { basal: number; rapid: number }>();

    insulin.forEach(dose => {
      const date = new Date(dose.timestamp).toISOString().split('T')[0];
      const current = dailyInsulin.get(date) || { basal: 0, rapid: 0 };

      // Categorize insulin type - detect all basal insulin types
      const type = dose.insulin_type.toLowerCase();
      const isBasal = type.includes('lantus') ||
                      type.includes('basal') ||
                      type.includes('tresiba') ||
                      type.includes('levemir') ||
                      type.includes('toujeo') ||
                      type.includes('degludec') ||
                      type.includes('glargine') ||
                      type.includes('detemir') ||
                      type.includes('long-acting') ||
                      type.includes('long');

      // Convert to number to prevent string concatenation
      const units = Number(dose.units);
      if (!isNaN(units)) {
        if (isBasal) {
          current.basal += units;
        } else {
          current.rapid += units;
        }
      }

      dailyInsulin.set(date, current);
    });

    // Convert to array and sort by date
    const result = Array.from(dailyInsulin.entries())
      .map(([date, { basal, rapid }]) => ({
        date,
        basal,
        rapid,
        total: basal + rapid,
        displayDate: format(new Date(date), 'MMM d'),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log('[InsulinUsageChart] Chart data:', result);

    return result;
  }, [insulin]);

  if (chartData.length === 0) {
    return null;
  }

  const avgTotal = chartData.reduce((sum, d) => sum + d.total, 0) / chartData.length;
  const avgBasal = chartData.reduce((sum, d) => sum + d.basal, 0) / chartData.length;
  const avgRapid = chartData.reduce((sum, d) => sum + d.rapid, 0) / chartData.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card id="insulin-usage-chart">
        <CardHeader>
          <CardTitle>Daily Insulin Usage</CardTitle>
          <CardDescription>
            Basal vs rapid insulin per day (avg: {avgTotal.toFixed(1)}u total, {avgBasal.toFixed(1)}u basal, {avgRapid.toFixed(1)}u rapid)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} margin={{ top: 20, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                label={{ value: 'Units', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number | undefined, name: string | undefined) => (typeof value === 'number' && !isNaN(value) && name !== undefined) ? [
                  `${value.toFixed(1)}u`,
                  name === 'basal' ? 'Basal' : 'Rapid'
                ] : ['N/A', name === 'basal' ? 'Basal' : 'Rapid']}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(value: string) => value === 'basal' ? 'Basal Insulin' : 'Rapid Insulin'}
              />

              {/* Average total line */}
              <ReferenceLine
                y={avgTotal}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{
                  value: `Avg: ${avgTotal.toFixed(1)}u`,
                  position: 'right',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 11,
                }}
              />

              <Bar
                dataKey="basal"
                stackId="insulin"
                fill="hsl(var(--chart-4))"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="rapid"
                stackId="insulin"
                fill="hsl(var(--chart-1))"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
