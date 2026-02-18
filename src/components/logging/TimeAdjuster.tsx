import { useState } from 'react';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface TimeAdjusterProps {
  value: Date;
  onChange: (date: Date) => void;
  defaultExpanded?: boolean;
}

export function TimeAdjuster({ value, onChange, defaultExpanded = false }: TimeAdjusterProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const adjustMinutes = (minutes: number) => {
    const newDate = new Date(value);
    newDate.setMinutes(newDate.getMinutes() + minutes);
    onChange(newDate);
  };

  const setToNow = () => {
    onChange(new Date());
  };

  const isNow = Math.abs(new Date().getTime() - value.getTime()) < 60000; // Within 1 minute

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-sm font-medium"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span>Time</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {format(value, 'h:mm a')}
            {!isNow && (
              <span className="ml-2 text-xs">
                ({format(value, 'MMM d')})
              </span>
            )}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Expanded Controls */}
      {isExpanded && (
        <div className="space-y-3 pt-2 border-t">
          {/* Quick Time Adjustments */}
          <div className="grid grid-cols-4 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => adjustMinutes(-60)}
              className="text-xs"
            >
              -1h
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => adjustMinutes(-15)}
              className="text-xs"
            >
              -15m
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => adjustMinutes(15)}
              className="text-xs"
            >
              +15m
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => adjustMinutes(60)}
              className="text-xs"
            >
              +1h
            </Button>
          </div>

          {/* Set to Now Button */}
          {!isNow && (
            <Button
              variant="secondary"
              size="sm"
              onClick={setToNow}
              className="w-full"
            >
              Set to Now
            </Button>
          )}

          {/* Full Timestamp Display */}
          <div className="text-center text-xs text-muted-foreground">
            {format(value, 'EEEE, MMMM d, yyyy \'at\' h:mm a')}
          </div>
        </div>
      )}
    </div>
  );
}
