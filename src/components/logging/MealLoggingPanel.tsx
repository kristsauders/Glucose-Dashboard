import { useState } from 'react';
import { Utensils, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeAdjuster } from './TimeAdjuster';
import { apiService } from '@/services/api';

interface MealLoggingPanelProps {
  onSuccess: () => void;
}

const CARB_OPTIONS = [10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 100, 120];
const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export function MealLoggingPanel({ onSuccess }: MealLoggingPanelProps) {
  const [carbs, setCarbs] = useState<number | null>(null);
  const [mealType, setMealType] = useState<string>('snack');
  const [description, setDescription] = useState<string>('');
  const [timestamp, setTimestamp] = useState<Date>(new Date());
  const [isLogging, setIsLogging] = useState(false);

  const handleSubmit = async () => {
    if (!carbs) {
      alert('Please select carb amount');
      return;
    }

    setIsLogging(true);
    try {
      await apiService.quickLog({
        type: 'meal',
        timestamp: timestamp.toISOString(),
        data: {
          carbs,
          mealType,
          description: description || undefined,
        },
      });

      onSuccess();
    } catch (error: any) {
      alert(error.message || 'Failed to log meal');
      setIsLogging(false);
    }
  };

  const canSubmit = carbs && !isLogging;

  return (
    <div className="space-y-6">
      {/* Carbs Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Carbs (grams)</label>
        <div className="grid grid-cols-4 gap-2">
          {CARB_OPTIONS.map((c) => (
            <Button
              key={c}
              variant={carbs === c ? 'default' : 'outline'}
              onClick={() => setCarbs(c)}
              className="h-12"
            >
              {c}g
            </Button>
          ))}
        </div>
      </div>

      {/* Meal Type Selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Meal Type</label>
        <div className="grid grid-cols-2 gap-2">
          {MEAL_TYPES.map((type) => (
            <Button
              key={type.value}
              variant={mealType === type.value ? 'default' : 'outline'}
              onClick={() => setMealType(type.value)}
              className="h-12"
            >
              {type.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Optional Description */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Description <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          type="text"
          placeholder="e.g., Oatmeal with berries"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-12"
        />
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
            <Utensils className="w-5 h-5 mr-2" />
            Log Meal
          </>
        )}
      </Button>
    </div>
  );
}
