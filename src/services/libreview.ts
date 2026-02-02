/**
 * LibreView API Service
 *
 * Based on community reverse-engineering of the LibreView API.
 * This is an UNOFFICIAL API and may break at any time.
 *
 * References:
 * - LibreLinkUp unofficial clients
 * - Community documentation
 */

export interface LibreViewCredentials {
  email: string;
  password: string;
  region?: 'us' | 'eu' | 'de' | 'fr' | 'jp' | 'ap' | 'au' | 'ae' | 'ca';
}

export interface LibreViewAuthResponse {
  status: number;
  data: {
    authTicket: {
      token: string;
      expires: number;
      duration: number;
    };
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
  };
}

export interface LibreViewConnection {
  id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  targetLow: number;
  targetHigh: number;
  glucoseMeasurement: {
    Value: number;
    Timestamp: string;
    TrendArrow: number;
  };
}

export interface LibreViewGraphData {
  status: number;
  data: {
    connection: LibreViewConnection;
    graphData: Array<{
      FactoryTimestamp: string;
      Timestamp: string;
      type: number;
      ValueInMgPerDl: number;
      MeasurementColor: number;
      GlucoseUnits: number;
      Value: number;
      isHigh: boolean;
      isLow: boolean;
    }>;
  };
}

const REGION_URLS: Record<string, string> = {
  us: 'https://api-us.libreview.io',
  eu: 'https://api-eu.libreview.io',
  de: 'https://api-de.libreview.io',
  fr: 'https://api-fr.libreview.io',
  jp: 'https://api-jp.libreview.io',
  ap: 'https://api-ap.libreview.io',
  au: 'https://api-au.libreview.io',
  ae: 'https://api-ae.libreview.io',
  ca: 'https://api-ca.libreview.io',
};

const STORAGE_KEYS = {
  CREDENTIALS: 'libreview_credentials',
  AUTH_TOKEN: 'libreview_auth_token',
  TOKEN_EXPIRES: 'libreview_token_expires',
  PATIENT_ID: 'libreview_patient_id',
  CORS_PROXY: 'libreview_cors_proxy',
} as const;

// Public CORS proxies (use at your own risk)
export const DEFAULT_CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://cors-anywhere.herokuapp.com/',
] as const;

class LibreViewService {
  private baseUrl: string;
  private authToken: string | null = null;
  private tokenExpires: number | null = null;
  private patientId: string | null = null;
  private corsProxy: string;

  constructor() {
    this.baseUrl = REGION_URLS.us; // Default to US
    // Use current hostname for CORS proxy so it works on any device on the network
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    this.corsProxy = `http://${hostname}:3001/proxy?url=`;
    this.loadFromStorage();
  }

  /**
   * Calculate SHA256 hash of patient ID for account-id header
   * Required by LibreView API for authenticated requests
   */
  private async getAccountId(patientId: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(patientId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  private loadFromStorage() {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      const expires = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES);
      const patientId = localStorage.getItem(STORAGE_KEYS.PATIENT_ID);

      if (token && expires) {
        const expiresNum = parseInt(expires, 10);
        if (Date.now() < expiresNum) {
          this.authToken = token;
          this.tokenExpires = expiresNum;
          this.patientId = patientId;
        } else {
          this.clearStorage();
        }
      }
    } catch (error) {
      console.error('Error loading LibreView credentials from storage:', error);
    }
  }

  private saveToStorage(token: string, expires: number, patientId?: string) {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES, expires.toString());
      if (patientId) {
        localStorage.setItem(STORAGE_KEYS.PATIENT_ID, patientId);
      }
    } catch (error) {
      console.error('Error saving LibreView credentials to storage:', error);
    }
  }

  private clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES);
      localStorage.removeItem(STORAGE_KEYS.PATIENT_ID);
      localStorage.removeItem(STORAGE_KEYS.CREDENTIALS);
    } catch (error) {
      console.error('Error clearing LibreView storage:', error);
    }
  }

  public saveCredentials(credentials: LibreViewCredentials, corsProxy?: string) {
    try {
      // Store credentials (WARNING: This is not secure - consider encryption)
      localStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify(credentials));

      // Update region
      if (credentials.region && REGION_URLS[credentials.region]) {
        this.baseUrl = REGION_URLS[credentials.region];
      }

      // Store CORS proxy if provided
      if (corsProxy !== undefined) {
        this.corsProxy = corsProxy;
        localStorage.setItem(STORAGE_KEYS.CORS_PROXY, corsProxy);
      }
    } catch (error) {
      console.error('Error saving credentials:', error);
    }
  }

  public getCorsProxy(): string {
    return this.corsProxy;
  }

  public setCorsProxy(proxy: string) {
    this.corsProxy = proxy;
    localStorage.setItem(STORAGE_KEYS.CORS_PROXY, proxy);
  }

  public getStoredCredentials(): LibreViewCredentials | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading stored credentials:', error);
    }
    return null;
  }

  public clearCredentials() {
    this.authToken = null;
    this.tokenExpires = null;
    this.patientId = null;
    this.clearStorage();
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const baseUrl = `${this.baseUrl}${endpoint}`;
    // Apply CORS proxy if configured
    const url = this.corsProxy ? `${this.corsProxy}${encodeURIComponent(baseUrl)}` : baseUrl;

    const defaultHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Product': 'llu.android',
      'Version': '4.16.0',
    };

    if (this.authToken && !endpoint.includes('/auth/login')) {
      defaultHeaders['Authorization'] = `Bearer ${this.authToken}`;

      // Add account-id header (SHA256 of patient ID) - required by LibreView API
      if (this.patientId) {
        defaultHeaders['account-id'] = await this.getAccountId(this.patientId);
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LibreView API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        // Provide helpful error message for connection issues
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          throw new Error('Connection failed. Make sure the CORS proxy server is running (npm start).');
        }
        throw new Error(`Failed to connect to LibreView: ${error.message}`);
      }
      throw error;
    }
  }

  public async login(credentials: LibreViewCredentials, corsProxy?: string): Promise<boolean> {
    try {
      // Update CORS proxy if provided
      if (corsProxy !== undefined) {
        this.corsProxy = corsProxy;
      }

      // Update region
      if (credentials.region && REGION_URLS[credentials.region]) {
        this.baseUrl = REGION_URLS[credentials.region];
      }

      const response = await this.makeRequest<LibreViewAuthResponse>(
        '/llu/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        }
      );

      if (response.status === 0 && response.data?.authTicket?.token) {
        this.authToken = response.data.authTicket.token;
        this.tokenExpires = Date.now() + (response.data.authTicket.duration * 1000);

        // Get patient ID from login response (user.id)
        if (response.data.user?.id) {
          this.patientId = response.data.user.id;
          this.saveToStorage(this.authToken, this.tokenExpires, this.patientId);
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('LibreView login failed:', error);
      throw error;
    }
  }

  public async getConnections(): Promise<LibreViewConnection[]> {
    try {
      const response = await this.makeRequest<{ status: number; data: LibreViewConnection[] }>(
        '/llu/connections'
      );

      if (response.status === 0 && response.data) {
        return response.data;
      }

      return [];
    } catch (error) {
      console.error('Failed to get connections:', error);
      throw error;
    }
  }

  public async getGlucoseData(patientId?: string): Promise<LibreViewGraphData['data']> {
    try {
      // First, check if user has connections (caregiver mode)
      const connections = await this.getConnections();

      let id: string | null = null;
      let currentConnection: LibreViewConnection | undefined;

      if (connections.length > 0) {
        // User is a caregiver - use first connection
        currentConnection = connections[0];
        id = patientId || currentConnection.patientId;
      } else {
        // User is a patient - use their own ID
        id = patientId || this.patientId;
      }

      if (!id) {
        throw new Error('No patient ID available');
      }

      const response = await this.makeRequest<LibreViewGraphData>(
        `/llu/connections/${id}/graph`
      );

      if (response.status === 0 && response.data) {
        // If we have a current glucoseMeasurement from connections, add it to graphData
        // This is the freshest data available from LibreLinkUp
        if (currentConnection?.glucoseMeasurement) {
          const currentReading = {
            FactoryTimestamp: currentConnection.glucoseMeasurement.Timestamp,
            Timestamp: currentConnection.glucoseMeasurement.Timestamp,
            type: 1, // Set to 1 to indicate this is a glucose measurement (not historical)
            ValueInMgPerDl: currentConnection.glucoseMeasurement.Value,
            MeasurementColor: currentConnection.glucoseMeasurement.TrendArrow || 4, // Use TrendArrow as MeasurementColor for trend display
            GlucoseUnits: 1,
            Value: currentConnection.glucoseMeasurement.Value,
            isHigh: currentConnection.glucoseMeasurement.Value > currentConnection.targetHigh,
            isLow: currentConnection.glucoseMeasurement.Value < currentConnection.targetLow,
          };

          // Add current reading to the beginning of graphData if it's newer
          const existingTimestamps = response.data.graphData.map(r => new Date(r.Timestamp).getTime());
          const currentTimestamp = new Date(currentConnection.glucoseMeasurement.Timestamp).getTime();

          if (!existingTimestamps.includes(currentTimestamp)) {
            response.data.graphData.unshift(currentReading);
          }
        }

        return response.data;
      }

      throw new Error('Invalid response from LibreView');
    } catch (error) {
      console.error('Failed to get glucose data:', error);
      throw error;
    }
  }

  public async ensureAuthenticated(): Promise<boolean> {
    // Check if token is still valid
    if (this.authToken && this.tokenExpires && Date.now() < this.tokenExpires) {
      return true;
    }

    // Try to re-authenticate with stored credentials
    const credentials = this.getStoredCredentials();
    if (credentials) {
      try {
        return await this.login(credentials);
      } catch (error) {
        console.error('Re-authentication failed:', error);
        return false;
      }
    }

    return false;
  }

  public isAuthenticated(): boolean {
    return !!(this.authToken && this.tokenExpires && Date.now() < this.tokenExpires);
  }

  public hasStoredCredentials(): boolean {
    return !!this.getStoredCredentials();
  }
}

// Export singleton instance
export const libreViewService = new LibreViewService();
