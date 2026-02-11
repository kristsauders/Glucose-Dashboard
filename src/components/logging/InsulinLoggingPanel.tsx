import { useState } from 'react';
import { Syringe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeAdjuster } from './TimeAdjuster';
import { apiService } from '@/services/api';

interface InsulinLoggingPanelProps {
  onSuccess: () => void;
}

const INSULIN_TYPES = ['Fiasp', 'Humalog', 'NovoRapid', 'Lantus', 'Levemir', 'Tresiba'];
const UNIT_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
const PURPOSE_OPTIONS = [
  { value: 'meal', label: 'Meal' },
  { value: 'correction', label: 'Correction' },
  { value: 'basal', label: 'Basal' },
];

export function InsulinLoggingPanel({ onSuccess }: InsulinLoggingPanelProps) {
  const [insulinType, setInsulinType] = useState<string | null>(null);
  const [units, setUnits] = useState<number | null>(null);
  const [purpose, setPurpose] = useState<string>('meal');
  const [timestamp, setTimestamp] = useState<Date>(new Date());
  const [isLogging, setIsLogging] = useState(false);

  const handleSubmit = async () => {
    if (!insulinType || !units) {
      alert('Please select insulin type and units');
      return;
    }

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
    <div className="space-y-6">
      {/* Insulin Type Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Insulin Type</label>
        <div className="grid grid-cols-3 gap-2">
          {INSULIN_TYPES.map((type) => (
            <Button
              key={type}
              variant={insulinType === type ? 'default' : 'outline'}
              onClick={() => setInsulinType(type)}
              className="h-12"
            >
              {type}
            </Button>
          ))}
        </div>
      </div>

      {/* Units Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Units</label>
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

      {/* Purpose Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Purpose</label>
        <div className="grid grid-cols-3 gap-2">
          {PURPOSE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={purpose === opt.value ? 'default' : 'outline'}
              onClick={() => setPurpose(opt.value)}
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
            <Syringe className="w-5 h-5 mr-2" />
            Log Insulin
          </>
        )}
      </Button>
    </div>
  );
}
