import { useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeAdjuster } from './TimeAdjuster';
import { apiService } from '@/services/api';

interface ExerciseLoggingPanelProps {
  onSuccess: () => void;
}

const ACTIVITY_TYPES = ['Walk', 'Cardio', 'Strength', 'Sports'];
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

export function ExerciseLoggingPanel({ onSuccess }: ExerciseLoggingPanelProps) {
  const [activityType, setActivityType] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [timestamp, setTimestamp] = useState<Date>(new Date());
  const [isLogging, setIsLogging] = useState(false);

  const handleSubmit = async () => {
    if (!activityType || !duration) {
      alert('Please select activity type and duration');
      return;
    }

    setIsLogging(true);
    try {
      await apiService.quickLog({
        type: 'exercise',
        timestamp: timestamp.toISOString(),
        data: {
          activityType,
          duration,
          intensity: 'moderate', // Default to moderate intensity
        },
      });

      onSuccess();
    } catch (error: any) {
      alert(error.message || 'Failed to log exercise');
      setIsLogging(false);
    }
  };

  const canSubmit = activityType && duration && !isLogging;

  return (
    <div className="space-y-5">
      {/* Activity Type Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Activity Type</label>
        <div className="grid grid-cols-4 gap-2">
          {ACTIVITY_TYPES.map((type) => (
            <Button
              key={type}
              variant={activityType === type ? 'default' : 'outline'}
              onClick={() => setActivityType(type)}
              className="h-12"
            >
              {type}
            </Button>
          ))}
        </div>
      </div>

      {/* Duration Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Duration (minutes)</label>
        <div className="grid grid-cols-3 gap-2">
          {DURATION_OPTIONS.map((d) => (
            <Button
              key={d}
              variant={duration === d ? 'default' : 'outline'}
              onClick={() => setDuration(d)}
              className="h-12"
            >
              {d} min
            </Button>
          ))}
        </div>
      </div>

      {/* Time Adjuster */}
      <TimeAdjuster value={timestamp} onChange={setTimestamp} defaultExpanded />

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full h-12 text-lg"
      >
        {isLogging ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Logging...
          </>
        ) : (
          <>
            <Activity className="w-5 h-5 mr-2" />
            Log Exercise
          </>
        )}
      </Button>
    </div>
  );
}
