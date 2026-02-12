import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Trash2, RefreshCw } from 'lucide-react';
import { debugLogger, type DebugLog } from '@/utils/debug-logger';

export function Debug() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [swStatus, setSwStatus] = useState<string>('Checking...');

  const loadLogs = () => {
    const currentLogs = debugLogger.getLogs();
    console.log('[Debug Page] Loaded logs:', currentLogs.length);
    setLogs(currentLogs);
  };

  useEffect(() => {
    // Add a test log when debug page opens
    debugLogger.log('Debug Page', 'Debug page opened - logging system is working!');

    // Check service worker status
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration) {
          const state = registration.active?.state || 'no active worker';
          setSwStatus(`Registered - ${state}`);
          debugLogger.log('Service Worker', 'Service worker status', {
            state,
            scope: registration.scope,
            updateViaCache: registration.updateViaCache,
          });
        } else {
          setSwStatus('Not registered');
          debugLogger.log('Service Worker', 'Service worker not registered');
        }
      });
    } else {
      setSwStatus('Not supported');
    }

    // Load logs initially
    loadLogs();

    // Listen for debug logs from service worker
    const handleMessage = (event: MessageEvent) => {
      console.log('[Debug Page] Received message:', event.data);

      if (event.data.type === 'DEBUG_LOG') {
        console.log('[Debug Page] Got DEBUG_LOG from service worker');
        debugLogger.log(
          event.data.log.source,
          event.data.log.message,
          event.data.log.data ? JSON.parse(event.data.log.data) : undefined
        );
        loadLogs();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
    }

    // Auto-refresh every 2 seconds
    const interval = autoRefresh ? setInterval(loadLogs, 2000) : null;

    return () => {
      if (interval) clearInterval(interval);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      }
    };
  }, [autoRefresh]);

  const handleDownload = () => {
    const text = debugLogger.export();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sage-debug-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (confirm('Clear all debug logs?')) {
      debugLogger.clear();
      setLogs([]);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto p-4">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button size="sm" variant="ghost" onClick={() => navigate('/chat')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle>Debug Logs ({logs.length})</CardTitle>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={autoRefresh ? 'default' : 'outline'}
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                {autoRefresh ? 'Auto' : 'Manual'}
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button size="sm" variant="outline" onClick={handleClear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="mb-4 space-y-3">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-semibold mb-1">Service Worker Status:</p>
              <p className={swStatus.includes('activated') ? 'text-green-600' : 'text-amber-600'}>
                {swStatus}
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-semibold mb-2">How to use:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Keep this page open in the background</li>
                <li>Click a notification from the home screen app</li>
                <li>Come back here to see what happened</li>
                <li>Export logs to share or investigate</li>
              </ol>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-2">No debug logs yet</p>
              <p className="text-sm text-muted-foreground">
                Logs will appear here when you interact with notifications
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.slice().reverse().map((log, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-3 bg-card font-mono text-xs"
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <span className="text-primary font-semibold">[{log.source}]</span>
                    <span className="text-muted-foreground text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        fractionalSecondDigits: 3
                      })}
                    </span>
                  </div>
                  <div className="text-foreground mb-2 break-words">{log.message}</div>
                  {log.data && (
                    <pre className="text-muted-foreground bg-muted/50 p-2 rounded overflow-auto text-[10px]">
                      {log.data}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
