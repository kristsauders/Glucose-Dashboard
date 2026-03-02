/**
 * ActivityKit push notifications via direct APNs HTTP/2.
 *
 * Expo's SDK does not support Live Activity push updates — those require a raw
 * APNs push with apns-push-type: liveactivity to the activity's unique push token
 * (not the device push token). This service handles that path using Node's
 * built-in http2 module and crypto for JWT signing, so no extra dependencies
 * are needed.
 *
 * Required .env vars:
 *   APNS_PRIVATE_KEY  — full .p8 content (newlines as \n)
 *   APNS_KEY_ID       — 10-char key ID from Apple Developer portal
 *   APNS_TEAM_ID      — 10-char team ID from Apple Developer portal
 *   APNS_BUNDLE_ID    — app bundle ID (e.g. com.auders.t1dsage)
 *   APNS_PRODUCTION   — "true" for App Store/TestFlight, "false"/"" for dev
 *
 * Date encoding note:
 *   Swift's default Codable Date encoding uses timeIntervalSinceReferenceDate
 *   (seconds since 2001-01-01). The content-state readingDate must use this
 *   encoding so ActivityKit decodes it correctly.
 */

import http2 from 'node:http2';
import { createSign, createPrivateKey } from 'node:crypto';
import { env } from '../config/env.js';
import { query } from '../config/database.js';

// Swift's NSDate reference date = 2001-01-01T00:00:00Z as Unix seconds
const SWIFT_REFERENCE_DATE_OFFSET = 978307200;

// APNs JWT is valid for 1 hour; reuse it within a 50-minute window.
let cachedJwt: { token: string; issuedAt: number } | null = null;

// Reuse the HTTP/2 connection to APNs for all pushes (Apple requires this).
let apnsSession: http2.ClientHttp2Session | null = null;
// Track when the session was opened so we can proactively cycle it before
// Apple's ~1-hour connection TTL causes silent drops.
let apnsSessionCreatedAt = 0;

function isConfigured(): boolean {
  return !!(env.APNS_PRIVATE_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_BUNDLE_ID);
}

function getApnsHost(): string {
  return env.APNS_PRODUCTION === 'true'
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';
}

function getApnsJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 50 * 60) {
    return cachedJwt.token;
  }

  const header  = Buffer.from(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: env.APNS_TEAM_ID, iat: now })).toString('base64url');
  const input   = `${header}.${payload}`;

  // .p8 files store newlines as literal \n in env vars — restore them.
  const pem = (env.APNS_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  const key = createPrivateKey(pem);

  const sign = createSign('SHA256');
  sign.update(input);
  sign.end();
  const sig = sign.sign(key).toString('base64url');

  const token = `${input}.${sig}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

const SESSION_MAX_AGE_MS = 55 * 60 * 1000; // 55 min — cycle before Apple's 1-hour TTL

function destroySession(): void {
  if (apnsSession) {
    try { apnsSession.destroy(); } catch {}
    apnsSession = null;
    apnsSessionCreatedAt = 0;
  }
}

function getApnsSession(): http2.ClientHttp2Session {
  // Proactively cycle before Apple's silent connection expiry at ~1 hour.
  if (apnsSession && Date.now() - apnsSessionCreatedAt > SESSION_MAX_AGE_MS) {
    console.log('[LiveActivityPush] Proactively cycling APNs session (55-min age limit)');
    destroySession();
  }

  if (apnsSession && !apnsSession.destroyed && !apnsSession.closed) {
    return apnsSession;
  }

  const host = getApnsHost();
  apnsSession = http2.connect(`https://${host}`);
  apnsSessionCreatedAt = Date.now();

  apnsSession.on('error', (err) => {
    console.warn('[LiveActivityPush] APNs session error:', err.message);
    destroySession();
  });
  apnsSession.on('close', () => { apnsSession = null; apnsSessionCreatedAt = 0; });
  // APNs signals connection close with GOAWAY before the 'close' event fires.
  // Destroy eagerly so the next getApnsSession() opens a fresh connection.
  apnsSession.on('goaway', (errorCode) => {
    console.warn('[LiveActivityPush] APNs GOAWAY received, errorCode:', errorCode, '— resetting session');
    destroySession();
  });
  return apnsSession;
}

export interface GlucoseHistoryPoint {
  glucose: number;
  minutesAgo: number;
}

export interface GlucoseActivityState {
  glucose: number;
  trend: string;
  readingDate: Date;
  isLow: boolean;
  isHigh: boolean;
  lastInsulinUnits?: number;
  lastInsulinDate?: Date;
  history?: GlucoseHistoryPoint[];
}

/**
 * Send an ActivityKit push to a single Live Activity push token.
 * The activity's content-state is updated without the app being active.
 */
export async function sendLiveActivityPush(
  pushToken: string,
  state: GlucoseActivityState,
): Promise<void> {
  if (!isConfigured()) {
    console.warn('[LiveActivityPush] APNs not configured — skipping Live Activity push.');
    return;
  }

  const readingUnixTs = Math.floor(state.readingDate.getTime() / 1000);
  const nowUnixTs = Math.floor(Date.now() / 1000);
  // Swift Codable Date → seconds since 2001-01-01
  const swiftDate = readingUnixTs - SWIFT_REFERENCE_DATE_OFFSET;

  console.log(`[LiveActivityPush] PUSH_DEBUG glucose=${state.glucose} trend=${state.trend} readingDate_utc=${state.readingDate.toISOString()} age_s=${nowUnixTs - readingUnixTs} swiftDate=${swiftDate}`);
  // stale-date must be in the future. Base it on now so a delayed reading
  // (e.g. CGM sensor gap) doesn't cause iOS to immediately mark the activity stale.
  // The widget's own isStale check (>15 min old readingDate) handles the UI separately.
  const staleDate = nowUnixTs + 5 * 60; // mark stale if no push arrives for 5 minutes

  const payload = {
    aps: {
      // aps.timestamp must be the CURRENT time (not reading time).
      // iOS ignores pushes whose timestamp is older than the last content-state update.
      // Using readingDate (past time) caused all pushes to be silently dropped.
      timestamp: nowUnixTs,
      event: 'update',
      'content-state': {
        glucose: state.glucose,
        trend: state.trend,
        readingDate: swiftDate,
        isLow: state.isLow,
        isHigh: state.isHigh,
        ...(state.lastInsulinDate != null && {
          lastInsulinUnits: state.lastInsulinUnits,
          lastInsulinDate: Math.floor(state.lastInsulinDate.getTime() / 1000) - SWIFT_REFERENCE_DATE_OFFSET,
        }),
        ...(state.history && state.history.length > 0 && { history: state.history }),
      },
      'stale-date': staleDate,
    },
  };

  const body    = JSON.stringify(payload);
  const host    = getApnsHost();
  const jwt     = getApnsJwt();
  const session = getApnsSession();

  await new Promise<void>((resolve, reject) => {
    const req = session.request({
      ':method':        'POST',
      ':path':          `/3/device/${pushToken}`,
      ':scheme':        'https',
      ':authority':     host,
      'content-type':   'application/json',
      'content-length': Buffer.byteLength(body),
      'apns-push-type': 'liveactivity',
      'apns-topic':     `${env.APNS_BUNDLE_ID}.push-type.liveactivity`,
      'apns-priority':  '10',
      'authorization':  `bearer ${jwt}`,
    });

    // Guard against stalled connections — APNs normally responds in <2s.
    const timer = setTimeout(() => {
      req.destroy(new Error('APNs push timed out after 15s'));
    }, 15_000);

    req.write(body);
    req.end();

    let statusCode = 0;
    req.on('response', (headers) => { statusCode = headers[':status'] as number; });

    let responseBody = '';
    req.on('data', (chunk) => { responseBody += chunk; });

    req.on('end', () => {
      clearTimeout(timer);
      if (statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`APNs ${statusCode}: ${responseBody}`));
      }
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      // Any request-level error (including our 15s timeout) likely means the
      // underlying TCP/TLS connection is dead. Destroy the session so the next
      // push opens a fresh HTTP/2 connection rather than reusing a zombie one.
      destroySession();
      reject(err);
    });
  });
}

/**
 * Push a glucose update to every Live Activity token registered for a user.
 * Safe to call on every LibreView poll — tokens that are no longer valid
 * (activity ended, app uninstalled) return 410 and are cleaned up.
 */
export async function pushLiveActivityForUser(
  userId: string,
  state: GlucoseActivityState,
): Promise<void> {
  if (!isConfigured()) {
    console.warn('[LiveActivityPush] Skipping — APNs not configured (check APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY / APNS_BUNDLE_ID in .env)');
    return;
  }

  const result = await query<{ token: string; activity_id: string }>(
    `SELECT token, activity_id FROM live_activity_tokens
     WHERE user_id = $1 AND token != 'pending'`,
    [userId],
  );

  if (result.rows.length === 0) {
    console.log(`[LiveActivityPush] No registered tokens for user ${userId} — skipping push`);
    return;
  }

  await Promise.allSettled(
    result.rows.map(async (row) => {
      try {
        await sendLiveActivityPush(row.token, state);
        console.log(`[LiveActivityPush] Pushed to activity ${row.activity_id.slice(0, 8)}… for user ${userId}`);
      } catch (err: any) {
        const msg: string = err.message ?? '';
        // 410 = activity ended; 400 BadDeviceToken = token was rotated by iOS.
        // Both mean the stored token is dead and must be removed so the next
        // token update from the app takes over.
        const isStaleToken = msg.includes('410')
          || msg.includes('Gone')
          || msg.includes('ExpiredToken')
          || (msg.includes('400') && msg.includes('BadDeviceToken'));
        if (isStaleToken) {
          await query(
            'DELETE FROM live_activity_tokens WHERE user_id = $1 AND activity_id = $2',
            [userId, row.activity_id],
          );
          console.log(`[LiveActivityPush] Removed stale token for activity ${row.activity_id.slice(0, 8)}…`);
        } else {
          console.warn(`[LiveActivityPush] Push failed for user ${userId}:`, msg);
        }
      }
    }),
  );
}

// DB migration — run once:
// CREATE TABLE IF NOT EXISTS live_activity_tokens (
//   user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//   token       TEXT NOT NULL,
//   activity_id TEXT NOT NULL,
//   updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//   PRIMARY KEY (user_id, activity_id)
// );
