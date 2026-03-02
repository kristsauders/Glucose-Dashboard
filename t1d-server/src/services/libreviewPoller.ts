import { LibreViewClient } from './libreview.js';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { decrypt } from '../utils/crypto.js';
import { pushLiveActivityForUser } from './live-activity-push.js';
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
  isPolling: boolean; // Is polling enabled
  isPollInProgress: boolean; // Is a poll currently running
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
        isPollInProgress: false,
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
    // Prevent concurrent polls for the same user
    if (state.isPollInProgress) {
      console.log(`⏭️  Skipping poll for user ${state.userId} - previous poll still in progress`);
      return;
    }

    state.isPollInProgress = true; // Mark poll as in progress
    const pollStartTime = Date.now();

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

        const pollDuration = Date.now() - pollStartTime;
        console.log(`✓ Synced ${readings.length} glucose readings for user ${state.userId} (took ${pollDuration}ms)`);

        // Push the latest reading to any registered Live Activities so the
        // Dynamic Island / lock screen stays current even when the app is frozen.
        // Use max timestamp — graphData order varies (LibreView may put current reading at index 0 or last).
        const latest = readings.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
        console.log(`[LiveActivityPush] POLLER_DEBUG selected reading: ts=${latest.timestamp} glucose=${latest.glucose} (array size=${readings.length}, first_ts=${readings[0].timestamp}, last_ts=${readings[readings.length-1].timestamp})`);
        if (latest) {
          const glucose = latest.glucose as number;

          // Build history: last 2 hours of readings, max 25 points, oldest-first.
          const nowMs = Date.now();
          const twoHoursAgo = nowMs - 2 * 60 * 60 * 1000;
          const history = readings
            .filter(r => new Date(r.timestamp).getTime() >= twoHoursAgo)
            .map(r => ({
              glucose: r.glucose as number,
              minutesAgo: Math.round((nowMs - new Date(r.timestamp).getTime()) / 60000),
            }))
            .sort((a, b) => b.minutesAgo - a.minutesAgo)
            .slice(0, 25);

          // Fetch the most recent insulin dose for this user (last 24h to avoid stale data).
          const insulinResult = await query<{ units: number; timestamp: string }>(
            `SELECT units, timestamp FROM insulin_doses
             WHERE user_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'
             ORDER BY timestamp DESC LIMIT 1`,
            [state.userId],
          );
          const lastDose = insulinResult.rows[0];
          console.log(`[LiveActivityPush] INSULIN_DEBUG: found=${!!lastDose}${lastDose ? ` units=${lastDose.units} ts=${lastDose.timestamp}` : ' (no dose in last 24h — check insulin_doses table exists and has data for this user)'}`);

          pushLiveActivityForUser(state.userId, {
            glucose,
            trend: trendArrow(latest.trend as number | undefined),
            readingDate: new Date(latest.timestamp),
            isLow:  glucose < 70,
            isHigh: glucose > 180,
            history: history.length > 0 ? history : undefined,
            ...(lastDose && {
              lastInsulinUnits: Number(lastDose.units),
              lastInsulinDate: new Date(lastDose.timestamp),
            }),
          }).catch(err => console.warn('[LiveActivityPush] Error during poll push:', err));
        }
      } else {
        const pollDuration = Date.now() - pollStartTime;
        console.log(`✓ Poll completed for user ${state.userId} - no new readings (took ${pollDuration}ms)`);
      }

      state.lastPoll = new Date();
    } catch (error) {
      const pollDuration = Date.now() - pollStartTime;
      console.error(`Polling failed for user ${state.userId} after ${pollDuration}ms:`, error);
      throw error;
    } finally {
      // Always reset the flag, even if there was an error
      state.isPollInProgress = false;
    }
  }

  public async resumeAllPolling(): Promise<void> {
    try {
      console.log('Checking for users with LibreView credentials to resume polling...');

      const result = await query<{
        id: string;
        libreview_email: string;
        libreview_password_encrypted: string;
        libreview_region: string;
      }>(
        `SELECT id, libreview_email, libreview_password_encrypted, libreview_region
         FROM users
         WHERE libreview_email IS NOT NULL AND libreview_password_encrypted IS NOT NULL`
      );

      if (result.rows.length === 0) {
        console.log('No users with LibreView credentials found');
        return;
      }

      console.log(`Found ${result.rows.length} user(s) with LibreView credentials, resuming polling...`);

      for (const user of result.rows) {
        try {
          const password = decrypt(user.libreview_password_encrypted);
          await this.startPolling(user.id, {
            email: user.libreview_email,
            password,
            region: user.libreview_region || 'us',
          });
        } catch (error) {
          console.log(`⚠️  Could not resume polling for user ${user.id} - password needs to be re-entered (old bcrypt hash detected)`);
          // Clear old credentials so user can reconnect
          await query(
            `UPDATE users
             SET libreview_email = NULL,
                 libreview_password_encrypted = NULL
             WHERE id = $1`,
            [user.id]
          );
        }
      }
    } catch (error) {
      console.error('Failed to resume polling:', error);
    }
  }

  public stopAll(): void {
    for (const userId of this.pollers.keys()) {
      this.stopPolling(userId);
    }
  }
}

export const libreViewPoller = new LibreViewPollerService();

// LibreView MeasurementColor → trend glyph (same mapping as the mobile app)
// 0=NotDetermined, 1=FallingQuickly, 2=Falling, 3=Stable, 4=Rising, 5=RisingQuickly
function trendArrow(trend?: number): string {
  const map: Record<number, string> = { 0: '→', 1: '↓↓', 2: '↘', 3: '→', 4: '↗', 5: '↑↑' };
  return trend != null ? (map[trend] ?? '→') : '→';
}
