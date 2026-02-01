import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Radio } from 'lucide-react';
import { subDays, subWeeks, format, startOfDay, endOfDay } from 'date-fns';

export type DateRangePreset = 'live' | '7d' | '14d' | '30d' | '90d' | 'all';

interface DateRangeSelectorProps {
  selectedRange: DateRangePreset;
  onRangeChange: (range: DateRangePreset) => void;
  dataStartDate: Date;
  dataEndDate: Date;
}

export function DateRangeSelector({
  selectedRange,
  onRangeChange,
  dataStartDate,
  dataEndDate,
}: DateRangeSelectorProps) {
  const presets: { value: DateRangePreset; label: string; icon?: typeof Radio }[] = [
    { value: 'live', label: 'Live', icon: Radio },
    { value: '7d', label: 'Last 7 Days' },
    { value: '14d', label: 'Last 2 Weeks' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: 'all', label: 'All Time' },
  ];

  const getDateRangeDisplay = () => {
    if (selectedRange === 'live') {
      return 'Today (Live Updates)';
    }

    const end = endOfDay(dataEndDate);
    let start: Date;

    switch (selectedRange) {
      case '7d':
        start = startOfDay(subDays(end, 7));
        break;
      case '14d':
        start = startOfDay(subWeeks(end, 2));
        break;
      case '30d':
        start = startOfDay(subDays(end, 30));
        break;
      case '90d':
        start = startOfDay(subDays(end, 90));
        break;
      case 'all':
        start = startOfDay(dataStartDate);
        break;
    }

    return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="font-medium">{getDateRangeDisplay()}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {presets.map((preset) => {
              const Icon = preset.icon;
              return (
                <Button
                  key={preset.value}
                  variant={selectedRange === preset.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onRangeChange(preset.value)}
                  className={preset.value === 'live' && selectedRange === 'live' ? 'animate-pulse' : ''}
                >
                  {Icon && <Icon className="h-3 w-3 mr-1.5" />}
                  {preset.label}
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
