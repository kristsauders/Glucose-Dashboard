export interface MealLog {
  id: string;
  timestamp: Date;
  description: string;
  carbs: number;
  meal_type?: string;
  tags?: string[];
  notes?: string;
  source: string;
}

export interface ExerciseLog {
  id: string;
  timestamp: Date;
  description?: string;
  activity_type: string;
  duration_minutes: number;
  intensity: string;
  notes?: string;
  source: string;
}

export interface InsulinLog {
  id: string;
  timestamp: Date;
  insulin_type: string;
  brand_name?: string;
  units: number;
  purpose: string;
  notes?: string;
  source: string;
}
