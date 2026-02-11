export interface QuickAction {
  id: string;
  type: 'insulin' | 'meal' | 'exercise';
  label: string;
  icon: string;
  frequency: number;
  lastUsed: string;
  metadata: {
    // For insulin
    insulinType?: string;
    units?: number;
    purpose?: string;
    // For meal
    carbs?: number;
    description?: string;
    mealType?: string;
    // For exercise
    activityType?: string;
    duration?: number;
    intensity?: string;
  };
}

export interface QuickLogRequest {
  type: 'insulin' | 'meal' | 'exercise';
  timestamp?: string;
  data: {
    // For insulin
    insulinType?: string;
    units?: number;
    purpose?: string;
    // For meal
    carbs?: number;
    description?: string;
    mealType?: string;
    // For exercise
    activityType?: string;
    duration?: number;
    intensity?: string;
  };
}

export interface QuickLogResponse {
  success: boolean;
  id: string;
  message: string;
}
