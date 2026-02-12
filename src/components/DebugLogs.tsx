import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { X, Download, Trash2 } from 'lucide-react';
import { debugLogger, type DebugLog } from '@/utils/debug-logger';

export function DebugLogs({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<DebugLog[]>([]);

  useEffect(() => {
    // Load logs initially
    setLogs(debugLogger.getLogs());

    // Refresh every second
    const interval = setInterval(() => {
      setLogs(debugLogger.getLogs());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleDownload = () => {
    const text = debugLogger.export();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sage-debug-logs-${new Date().toISOString()}.txt`;
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
    <div className="fixed inset-0 bg-background z-50 overflow-auto">
      <Card className="h-full rounded-none">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle>Debug Logs ({logs.length})</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button size="sm" variant="outline" onClick={handleClear}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No debug logs yet</p>
          ) : (
            <div className="space-y-4">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-3 bg-muted/50 font-mono text-xs"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-primary font-semibold">[{log.source}]</span>
                    <span className="text-muted-foreground">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-foreground mb-2">{log.message}</div>
                  {log.data && (
                    <pre className="text-muted-foreground bg-background p-2 rounded overflow-auto">
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
