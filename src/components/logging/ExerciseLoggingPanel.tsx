import { useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeAdjuster } from './TimeAdjuster';
import { apiService } from '@/services/api';

interface ExerciseLoggingPanelProps {
  onSuccess: () => void;
}

const ACTIVITY_TYPES = ['Walk', 'Run', 'Bike', 'Swim', 'Gym', 'Yoga', 'Elliptical', 'Other'];
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const INTENSITY_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'intense', label: 'Intense' },
];

export function ExerciseLoggingPanel({ onSuccess }: ExerciseLoggingPanelProps) {
  const [activityType, setActivityType] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<string>('moderate');
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
          intensity,
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
    <div className="space-y-6">
      {/* Activity Type Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Activity Type</label>
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
        <label className="block text-sm font-medium mb-3">Duration (minutes)</label>
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

      {/* Intensity Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Intensity</label>
        <div className="grid grid-cols-3 gap-2">
          {INTENSITY_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={intensity === opt.value ? 'default' : 'outline'}
              onClick={() => setIntensity(opt.value)}
              className="h-12"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Time Adjuster */}
      <TimeAdjuster value={timestamp} onChange={setTimestamp} />

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
