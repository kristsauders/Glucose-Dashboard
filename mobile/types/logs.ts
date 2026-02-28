export interface MealLog {
  id: string;
  timestamp: string;
  description: string;
  carbs: number;
  meal_type?: string;
  notes?: string;
  source?: string;
}

export interface InsulinLog {
  id: string;
  timestamp: string;
  insulin_type: string;
  brand_name?: string;
  units: number;
  purpose?: string;
  notes?: string;
  source?: string;
}

export interface ExerciseLog {
  id: string;
  timestamp: string;
  description?: string;
  duration_minutes: number;
  activity_type: string;
  intensity?: string;
  notes?: string;
  source?: string;
}
