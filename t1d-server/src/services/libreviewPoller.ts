import { LibreViewClient } from './libreview.js';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import type { GlucoseReading } from '../types/index.js';

interface PollerState {
  userId: string;
  client: LibreViewClient;
  credentials: {
    email: string;
    password: string;
    region?: string;
  };
  intervalId: NodeJS.Timeout | null;
  lastPoll: Date | null;
  isPolling: boolean;
}

class LibreViewPollerService {
  private pollers = new Map<string, PollerState>();
  private pollInterval: number;

  constructor() {
    this.pollInterval = parseInt(env.LIBREVIEW_POLL_INTERVAL);
  }

  public async startPolling(userId: string, credentials: {
    email: string;
    password: string;
    region?: string;
  }): Promise<void> {
    // Stop existing poller if any
    this.stopPolling(userId);

    const client = new LibreViewClient(credentials.region);

    try {
      // Initial login
      const success = await client.login(credentials);
      if (!success) {
        throw new Error('Failed to authenticate with LibreView');
      }

      // Create poller state
      const state: PollerState = {
        userId,
        client,
        credentials,
        intervalId: null,
        lastPoll: null,
        isPolling: true,
      };

      // Initial poll
      await this.poll(state);

      // Set up interval
      state.intervalId = setInterval(() => {
        this.poll(state).catch(err => {
          console.error(`Polling error for user ${userId}:`, err);
        });
      }, this.pollInterval);

      this.pollers.set(userId, state);

      console.log(`✓ Started LibreView polling for user ${userId} (interval: ${this.pollInterval}ms)`);
    } catch (error) {
      console.error(`Failed to start polling for user ${userId}:`, error);
      throw error;
    }
  }

  public stopPolling(userId: string): void {
    const state = this.pollers.get(userId);
    if (state) {
      if (state.intervalId) {
        clearInterval(state.intervalId);
      }
      this.pollers.delete(userId);
      console.log(`✓ Stopped LibreView polling for user ${userId}`);
    }
  }

  public isPolling(userId: string): boolean {
    const state = this.pollers.get(userId);
    return state?.isPolling || false;
  }

  public getLastPoll(userId: string): Date | null {
    const state = this.pollers.get(userId);
    return state?.lastPoll || null;
  }

  private async poll(state: PollerState): Promise<void> {
    try {
      // Re-authenticate if token expired
      if (!state.client.isAuthenticated()) {
        console.log(`Re-authenticating for user ${state.userId}...`);
        await state.client.login(state.credentials);
      }

      // Fetch glucose data
      const data = await state.client.getGlucoseData();

      // Convert and save to database
      const readings = data.graphData
        .filter((reading) => reading.ValueInMgPerDl > 0)
        .map((reading) => ({
          user_id: state.userId,
          timestamp: new Date(reading.Timestamp).toISOString(),
          glucose: reading.ValueInMgPerDl,
          device: 'LibreView',
          record_type: reading.type,
          trend: reading.MeasurementColor,
          source: 'libreview_api',
        }));

      // Bulk insert with ON CONFLICT DO NOTHING (deduplication)
      if (readings.length > 0) {
        const values = readings.map((r, i) =>
          `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
        ).join(', ');

        const params = readings.flatMap(r => [
          r.user_id,
          r.timestamp,
          r.glucose,
          r.device,
          r.record_type,
          r.trend,
          r.source,
        ]);

        await query(
          `INSERT INTO glucose_readings (user_id, timestamp, glucose, device, record_type, trend, source)
           VALUES ${values}
           ON CONFLICT (user_id, timestamp, source) DO NOTHING`,
          params
        );

        console.log(`✓ Synced ${readings.length} glucose readings for user ${state.userId}`);
      }

      state.lastPoll = new Date();
    } catch (error) {
      console.error(`Polling failed for user ${state.userId}:`, error);
      throw error;
    }
  }

  public stopAll(): void {
    for (const userId of this.pollers.keys()) {
      this.stopPolling(userId);
    }
  }
}

export const libreViewPoller = new LibreViewPollerService();
