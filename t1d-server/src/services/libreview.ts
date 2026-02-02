import fetch from 'node-fetch';
import crypto from 'crypto';

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

export class LibreViewClient {
  private baseUrl: string;
  private authToken: string | null = null;
  private tokenExpires: number | null = null;
  private patientId: string | null = null;

  constructor(region: string = 'us') {
    this.baseUrl = REGION_URLS[region] || REGION_URLS.us;
  }

  private getAccountId(patientId: string): string {
    return crypto.createHash('sha256').update(patientId).digest('hex');
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Product': 'llu.android',
      'Version': '4.16.0',
    };

    if (this.authToken && !endpoint.includes('/auth/login')) {
      defaultHeaders['Authorization'] = `Bearer ${this.authToken}`;

      if (this.patientId) {
        defaultHeaders['account-id'] = this.getAccountId(this.patientId);
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

      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to connect to LibreView: ${error.message}`);
      }
      throw error;
    }
  }

  public async login(credentials: LibreViewCredentials): Promise<boolean> {
    try {
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

        if (response.data.user?.id) {
          this.patientId = response.data.user.id;
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
      const connections = await this.getConnections();

      let id: string | null = null;
      let currentConnection: LibreViewConnection | undefined;

      if (connections.length > 0) {
        currentConnection = connections[0];
        id = patientId || currentConnection.patientId;
      } else {
        id = patientId || this.patientId;
      }

      if (!id) {
        throw new Error('No patient ID available');
      }

      const response = await this.makeRequest<LibreViewGraphData>(
        `/llu/connections/${id}/graph`
      );

      if (response.status === 0 && response.data) {
        if (currentConnection?.glucoseMeasurement) {
          const currentReading = {
            FactoryTimestamp: currentConnection.glucoseMeasurement.Timestamp,
            Timestamp: currentConnection.glucoseMeasurement.Timestamp,
            type: 1,
            ValueInMgPerDl: currentConnection.glucoseMeasurement.Value,
            MeasurementColor: currentConnection.glucoseMeasurement.TrendArrow || 4,
            GlucoseUnits: 1,
            Value: currentConnection.glucoseMeasurement.Value,
            isHigh: currentConnection.glucoseMeasurement.Value > currentConnection.targetHigh,
            isLow: currentConnection.glucoseMeasurement.Value < currentConnection.targetLow,
          };

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

  public isAuthenticated(): boolean {
    return !!(this.authToken && this.tokenExpires && Date.now() < this.tokenExpires);
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  public getPatientId(): string | null {
    return this.patientId;
  }
}
