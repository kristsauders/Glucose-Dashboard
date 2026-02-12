/**
 * Debug logger for PWA where console logs aren't visible
 * Stores logs in localStorage for debugging
 */

const DEBUG_LOGS_KEY = 'sage_debug_logs';
const MAX_LOGS = 100;

export interface DebugLog {
  timestamp: string;
  source: string;
  message: string;
  data?: any;
}

export const debugLogger = {
  log(source: string, message: string, data?: any) {
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      source,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined,
    };

    console.log(`[${source}]`, message, data);

    try {
      const logsJson = localStorage.getItem(DEBUG_LOGS_KEY);
      const logs: DebugLog[] = logsJson ? JSON.parse(logsJson) : [];

      logs.push(log);

      // Keep only most recent logs
      if (logs.length > MAX_LOGS) {
        logs.splice(0, logs.length - MAX_LOGS);
      }

      localStorage.setItem(DEBUG_LOGS_KEY, JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to store debug log:', error);
    }
  },

  getLogs(): DebugLog[] {
    try {
      const logsJson = localStorage.getItem(DEBUG_LOGS_KEY);
      return logsJson ? JSON.parse(logsJson) : [];
    } catch (error) {
      console.error('Failed to get debug logs:', error);
      return [];
    }
  },

  clear() {
    localStorage.removeItem(DEBUG_LOGS_KEY);
  },

  export(): string {
    const logs = this.getLogs();
    return logs.map(log =>
      `[${log.timestamp}] [${log.source}] ${log.message}${log.data ? '\n' + log.data : ''}`
    ).join('\n\n');
  }
};
