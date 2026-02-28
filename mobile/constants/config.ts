export const API_BASE_URL = 'http://192.168.202.132:3003/api';

// Glucose thresholds (mg/dL)
export const GLUCOSE_VERY_LOW = 54;
export const GLUCOSE_LOW = 70;
export const GLUCOSE_HIGH = 180;
export const GLUCOSE_VERY_HIGH = 250;

// Polling
export const GLUCOSE_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes foreground
export const BG_GLUCOSE_TASK = 'BACKGROUND_GLUCOSE_FETCH';

// Notification
export const EAS_PROJECT_ID = 'YOUR_EAS_PROJECT_ID'; // replace after eas init
