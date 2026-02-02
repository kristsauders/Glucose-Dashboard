export interface User {
  id: string;
  email: string;
  password_hash: string;
  libreview_email?: string;
  libreview_password_encrypted?: string;
  libreview_region?: string;
  diagnosis_date?: string;
  diagnosis_type?: string;
  timezone?: string;
  preferences?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface GlucoseReading {
  id: string;
  user_id: string;
  timestamp: string;
  glucose: number;
  device?: string;
  record_type?: number;
  trend?: number;
  source?: string;
  created_at: string;
}

export interface AuthRequest extends Express.Request {
  user?: {
    id: string;
    email: string;
  };
}
