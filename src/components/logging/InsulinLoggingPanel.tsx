import { useState } from 'react';
import { Syringe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeAdjuster } from './TimeAdjuster';
import { apiService } from '@/services/api';

interface InsulinLoggingPanelProps {
  onSuccess: () => void;
}

const INSULIN_TYPES = [
  { value: 'rapid', label: 'Bolus', purpose: 'meal' },
  { value: 'long-acting', label: 'Basal', purpose: 'basal' },
];
const UNIT_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

export function InsulinLoggingPanel({ onSuccess }: InsulinLoggingPanelProps) {
  const [insulinType, setInsulinType] = useState<string | null>(null);
  const [units, setUnits] = useState<number | null>(null);
  const [timestamp, setTimestamp] = useState<Date>(new Date());
  const [isLogging, setIsLogging] = useState(false);

  const handleSubmit = async () => {
    if (!insulinType || !units) {
      alert('Please select insulin type and units');
      return;
    }

    // Automatically determine purpose based on insulin type
    const selectedType = INSULIN_TYPES.find(t => t.value === insulinType);
    const purpose = selectedType?.purpose || 'meal';

    setIsLogging(true);
    try {
      await apiService.quickLog({
        type: 'insulin',
        timestamp: timestamp.toISOString(),
        data: {
          insulinType,
          units,
          purpose,
        },
      });

      onSuccess();
    } catch (error: any) {
      alert(error.message || 'Failed to log insulin');
      setIsLogging(false);
    }
  };

  const canSubmit = insulinType && units && !isLogging;

  return (
    <div className="space-y-5">
      {/* Insulin Type Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Insulin Type</label>
        <div className="grid grid-cols-2 gap-2">
          {INSULIN_TYPES.map((type) => (
            <Button
              key={type.value}
              variant={insulinType === type.value ? 'default' : 'outline'}
              onClick={() => setInsulinType(type.value)}
              className="h-12"
            >
              {type.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Units Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Units</label>
        <div className="grid grid-cols-4 gap-2">
          {UNIT_OPTIONS.map((u) => (
            <Button
              key={u}
              variant={units === u ? 'default' : 'outline'}
              onClick={() => setUnits(u)}
              className="h-12"
            >
              {u}u
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
            <Syringe className="w-5 h-5 mr-2" />
            Log Insulin
          </>
        )}
      </Button>
    </div>
  );
}
