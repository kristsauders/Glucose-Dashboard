/**
 * Python Executor Service
 * =======================
 * Runs user-provided Python code in a restricted sandbox subprocess.
 *
 * Security model:
 * - Data pre-fetched from DB by Node; Python receives it via stdin (no DB creds)
 * - Python sandbox restricts builtins (no open/import/exec/eval)
 * - Only whitelisted libraries available (pandas, numpy, matplotlib, scipy, statsmodels)
 * - 30-second timeout enforced by Node SIGKILL + 25-second inner signal.alarm
 * - No network access (Python subprocess inherits no special env)
 *
 * Chart output:
 * - plt.show() calls are captured as base64 PNG strings
 * - Charts returned in PythonResult.charts array
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';
import { env } from '../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SANDBOX_SCRIPT = resolve(__dirname, '../../scripts/analysis-sandbox.py');
const PYTHON_PATH = env.PYTHON_PATH;
const TIMEOUT_MS = 30_000;
const MAX_LOOKBACK_DAYS = 180;

export interface PythonResult {
  output: string;
  charts: string[];      // base64 PNG strings from plt.show() calls
  executionMs: number;
  error?: string;
}

interface UserData {
  glucose: any[];
  meals: any[];
  insulin: any[];
  exercise: any[];
  sleep: any[];
}

/**
 * Fetch user data from DB for injection into Python sandbox.
 */
async function fetchUserData(userId: string, lookbackDays: number): Promise<UserData> {
  const days = Math.min(lookbackDays, MAX_LOOKBACK_DAYS);
  const since = `NOW() - INTERVAL '${days} days'`;

  const [glucoseRes, mealsRes, insulinRes, exerciseRes, sleepRes] = await Promise.all([
    query(
      `SELECT timestamp, glucose, trend, device
       FROM glucose_readings
       WHERE user_id = $1 AND timestamp >= ${since}
       ORDER BY timestamp ASC`,
      [userId]
    ),
    query(
      `SELECT timestamp, description, carbs, meal_type
       FROM meals
       WHERE user_id = $1 AND timestamp >= ${since}
       ORDER BY timestamp ASC`,
      [userId]
    ),
    query(
      `SELECT timestamp, insulin_type, units, type
       FROM insulin_doses
       WHERE user_id = $1 AND timestamp >= ${since}
       ORDER BY timestamp ASC`,
      [userId]
    ),
    query(
      `SELECT timestamp, activity_type, description, duration_minutes, intensity
       FROM exercise_logs
       WHERE user_id = $1 AND timestamp >= ${since}
       ORDER BY timestamp ASC`,
      [userId]
    ),
    query(
      `SELECT timestamp, duration_minutes, quality
       FROM sleep_logs
       WHERE user_id = $1 AND timestamp >= ${since}
       ORDER BY timestamp ASC`,
      [userId]
    ),
  ]);

  return {
    glucose: glucoseRes.rows,
    meals: mealsRes.rows,
    insulin: insulinRes.rows,
    exercise: exerciseRes.rows,
    sleep: sleepRes.rows,
  };
}

/**
 * Execute Python code in the restricted sandbox.
 */
export async function executePython(
  userId: string,
  timezone: string,
  code: string,
  opts: { lookbackDays?: number } = {}
): Promise<PythonResult> {
  const startTime = Date.now();
  const lookbackDays = opts.lookbackDays ?? 60;
  const codeLines = code.split('\n').length;

  console.log(`[python-executor] Starting: user=${userId.slice(0, 8)} lines=${codeLines} lookbackDays=${lookbackDays}`);

  // Fetch data from DB
  let userData: UserData;
  try {
    userData = await fetchUserData(userId, lookbackDays);
  } catch (err: any) {
    const errMsg = `Failed to fetch data: ${err.message}`;
    console.error(`[python-executor] ${errMsg}`);
    return { output: '', charts: [], executionMs: Date.now() - startTime, error: errMsg };
  }

  const dataRows = {
    glucose: userData.glucose.length,
    meals: userData.meals.length,
    insulin: userData.insulin.length,
    exercise: userData.exercise.length,
    sleep: userData.sleep.length,
  };
  console.log(`[python-executor] Data fetched: ${JSON.stringify(dataRows)}`);

  // Build stdin payload
  const payload = JSON.stringify({
    data: userData,
    code,
    timezone,
  });

  // Spawn Python subprocess
  return new Promise((resolve) => {
    let stdoutChunks: Buffer[] = [];
    let stderrChunks: Buffer[] = [];
    let timedOut = false;

    const child = spawn(PYTHON_PATH, [SANDBOX_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        // Minimal environment — no HOME, no PYTHONPATH pollution, no network proxy
        PATH: process.env.PATH,
        LANG: 'en_US.UTF-8',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    });

    // Enforce hard timeout
    const timer = setTimeout(() => {
      timedOut = true;
      console.warn(`[python-executor] Timeout after ${TIMEOUT_MS}ms — killing process`);
      child.kill('SIGKILL');
    }, TIMEOUT_MS);

    // Write payload to stdin
    child.stdin.write(payload, 'utf8');
    child.stdin.end();

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const executionMs = Date.now() - startTime;

      const rawStdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const rawStderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (rawStderr) {
        console.error(`[python-executor] stderr:\n${rawStderr}`);
      }

      if (timedOut) {
        resolve({
          output: 'Analysis timed out after 30 seconds.',
          charts: [],
          executionMs,
          error: 'TimeoutError: execution exceeded 30 seconds',
        });
        return;
      }

      // Parse the last JSON line from stdout (the result object)
      const lines = rawStdout.split('\n').filter(l => l.trim());
      let result = { output: '', charts: [] as string[], error: undefined as string | undefined };

      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        try {
          const parsed = JSON.parse(lastLine);
          result = {
            output: parsed.output ?? '',
            charts: Array.isArray(parsed.charts) ? parsed.charts.filter(Boolean) : [],
            error: parsed.error ?? undefined,
          };
        } catch {
          // stdout wasn't JSON — treat as raw output (shouldn't happen with sandbox)
          result.output = rawStdout.slice(0, 10000);
          if (exitCode !== 0) {
            result.error = `Process exited with code ${exitCode}`;
          }
        }
      } else if (exitCode !== 0) {
        result.error = rawStderr || `Process exited with code ${exitCode}`;
      }

      console.log(
        `[python-executor] Done: time=${executionMs}ms exit=${exitCode} ` +
        `outputLen=${result.output.length} charts=${result.charts.length}` +
        (result.error ? `\n[python-executor] Error:\n${result.error}` : '')
      );

      resolve({ ...result, executionMs });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const executionMs = Date.now() - startTime;
      const errMsg = `Failed to spawn Python process: ${err.message}. Check PYTHON_PATH in .env (currently: ${PYTHON_PATH})`;
      console.error(`[python-executor] ${errMsg}`);
      resolve({ output: '', charts: [], executionMs, error: errMsg });
    });
  });
}
